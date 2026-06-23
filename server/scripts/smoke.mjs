// METROPHAGE Step-1 smoke test — proves the authoritative loop + persistence with
// Node's built-in WebSocket client (no deps). Two phases, orchestrated by the shell:
//   node smoke.mjs move   -> log in, move under server validation, record final pos
//   node smoke.mjs check  -> (after a server restart) log in, assert pos persisted
//
// What it proves:
//   * the server moves the player from movement INTENT (client never sends a position)
//   * speed is server-enforced — a cheat value (mx=999) does not move faster
//   * positions clamp to world bounds
//   * the server acks processed inputs (the basis for client reconciliation)
//   * the position survives a full server restart (durable in D1)

import fs from "node:fs";

const WS_URL = process.env.WS_URL || "ws://127.0.0.1:8787/ws";
const STATE_FILE = new URL("../.spike-state.json", import.meta.url);
const SPEED = 200;
const SPAWN_X = 640;
const WORLD_W = 1280;
const mode = process.argv[2] || "move";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => Math.round(n * 100) / 100;

function connect(url = WS_URL) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const to = setTimeout(() => reject(new Error("connect timeout")), 5000);
    ws.onopen = () => {
      clearTimeout(to);
      resolve(ws);
    };
    ws.onerror = () => {
      clearTimeout(to);
      reject(new Error("ws connection error"));
    };
  });
}

function login(ws, name, faction) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("login timeout")), 5000);
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === "welcome") {
        clearTimeout(to);
        ws.removeEventListener("message", onMsg);
        resolve(m);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ t: "login", name, faction }));
  });
}

function trackState(ws, id, store) {
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "state") {
      const me = m.players.find((p) => p.id === id);
      if (me) {
        store.x = me.x;
        store.y = me.y;
        store.ack = me.ack;
        store.hp = me.hp;
        store.dead = me.dead;
        store.credits = me.credits;
        store.cores = me.cores;
        store.xp = me.xp;
        store.level = me.level;
        store.questStep = me.questStep;
        store.questProgress = me.questProgress;
        store.tick = m.tick;
      }
      store.players = m.players || [];
      store.enemies = m.enemies || [];
      store.shots = m.shots || [];
      store.pickups = m.pickups || [];
      store.nodes = m.nodes || [];
      store.factions = m.factions || [];
      store.control = m.control ?? -1;
      store.roster = m.roster || [];
      store.sing = m.sing ?? 0;
      store.meltdown = !!m.meltdown;
      store.season = m.season ?? 1;
    }
  });
}

function report(label, data, ok, checks) {
  console.log(`\n[${ok ? "PASS" : "FAIL"}] ${label}`);
  console.log("   data:", JSON.stringify(data));
  if (checks) console.log("   checks:", JSON.stringify(checks));
  if (!ok) process.exitCode = 1;
  return ok;
}

async function move() {
  const ws = await connect();
  const w = await login(ws, "spike");
  const store = { x: w.x, y: w.y, ack: 0, tick: 0 };
  trackState(ws, w.id, store);
  const startX = w.x;
  const startY = w.y;

  // Short tour (right/down/left/up, ~0.7s each) so the player moves in whichever
  // directions are open. Every 10th input is a blatant speed-hack value — the
  // server must ignore the magnitude. We track the farthest the player ever gets
  // from spawn: it must move SOMEWHERE, but never further than top-speed×time
  // (so the cheat can't teleport/accelerate, and walls aren't tunnelled).
  // A down-left staircase displaces the player away from spawn (and the wall to its
  // right we already saw), so the persisted position is unambiguously "moved".
  const dirs = [
    [0, 1],
    [-1, 0],
    [0, 1],
    [-1, 0],
  ];
  let seq = 0;
  let maxDist = 0;
  const t0 = Date.now();
  for (const [dx, dy] of dirs) {
    const td = Date.now();
    while (Date.now() - td < 700) {
      seq++;
      const cheat = seq % 10 === 0 ? 999 : 1;
      ws.send(JSON.stringify({ t: "input", seq, mx: dx * cheat, my: dy * cheat }));
      await sleep(50);
      maxDist = Math.max(maxDist, Math.hypot(store.x - startX, store.y - startY));
    }
  }
  const activeSecs = (Date.now() - t0) / 1000;
  await sleep(250);

  // Stop sending; the server's intent-expiry should halt the player.
  await sleep(400);
  const restX = store.x;
  const restY = store.y;
  await sleep(250);
  const settledMoved = Math.hypot(store.x - restX, store.y - restY);

  const speedCap = SPEED * activeSecs * 1.1; // can't be further than top speed allows
  const checks = {
    movedSomewhere: maxDist > 10,
    speedServerEnforced: maxDist <= speedCap, // cheat (mx=999) did NOT accelerate
    inputsAcked: store.ack >= seq - 3,
    withinBounds: store.x >= 0 && store.x <= WORLD_W && store.y >= 0 && store.y <= 1000,
    movementStoppedOnSilence: settledMoved < 0.5, // intent expired -> player halts
  };
  const ok = Object.values(checks).every(Boolean);

  const movedNet = Math.hypot(store.x - startX, store.y - startY);
  fs.writeFileSync(STATE_FILE, JSON.stringify({ id: w.id, x: store.x, y: store.y, movedNet }));
  await sleep(250); // persist cycle
  ws.close();
  await sleep(300); // disconnect flush
  report(
    "MOVE — server-authoritative tour + speed validation + intent expiry",
    { spawn: [startX, startY], maxDist: round(maxDist), settledAt: [round(store.x), round(store.y)], activeSecs: round(activeSecs), speedCap: round(speedCap), ack: store.ack, sentSeq: seq },
    ok,
    checks,
  );
}

async function check() {
  if (!fs.existsSync(STATE_FILE)) {
    return report("CHECK", { error: "no recorded state from move phase" }, false);
  }
  const expected = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  const ws = await connect();
  const w = await login(ws, "spike");
  ws.close();
  const dx = Math.hypot(w.x - expected.x, w.y - expected.y);
  const checks = {
    matchesPersisted: dx < 2, // came back exactly where we left off
    persistedAMovedPosition: (expected.movedNet ?? 0) > 10, // not a trivial fresh spawn
  };
  report(
    "CHECK — position persisted across full server restart",
    { recorded: [expected.x, expected.y], reloaded: [round(w.x), round(w.y)], dx: round(dx), movedFromSpawn: round(expected.movedNet ?? 0) },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function combat() {
  const ws = await connect();
  const w = await login(ws, "fighter");
  const store = { x: w.x, y: w.y, ack: 0, hp: 100, credits: 0, enemies: [], shots: [] };
  trackState(ws, w.id, store);
  await sleep(250);

  const nearest = () => {
    let best = null;
    let bd = Infinity;
    for (const e of store.enemies) {
      const d = Math.hypot(e.x - store.x, e.y - store.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  };

  const startEnemies = store.enemies.length;
  const startSing = store.sing ?? 0;
  let minEnemyHp = 999;
  let maxCredits = 0;
  let maxXp = 0;
  let maxSing = startSing;
  let sawPlayerShot = false;
  let sawPickup = false;
  let tookDamage = false;
  let seq = 0;
  const t0 = Date.now();
  // Chase the nearest cop and shoot it; the SERVER resolves every hit + payout.
  while (Date.now() - t0 < 7000) {
    const e = nearest();
    if (e) {
      const dx = e.x - store.x;
      const dy = e.y - store.y;
      const d = Math.hypot(dx, dy) || 1;
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 110 ? dx / d : 0, my: d > 110 ? dy / d : 0 }));
      ws.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(dy, dx) }));
    }
    for (const en of store.enemies) minEnemyHp = Math.min(minEnemyHp, en.hp);
    if (store.shots.some((s) => s.team === 0)) sawPlayerShot = true;
    if ((store.pickups || []).length > 0) sawPickup = true;
    maxCredits = Math.max(maxCredits, store.credits || 0);
    maxXp = Math.max(maxXp, store.xp || 0);
    maxSing = Math.max(maxSing, store.sing || 0);
    if ((store.hp ?? 100) < 100) tookDamage = true;
    await sleep(50);
  }

  const checks = {
    enemiesSimulated: startEnemies > 0,
    serverResolvedHit: minEnemyHp < 75 || maxCredits > 0, // cop damaged, or a kill paid out
    progressionGained: maxXp > 0, // server awarded XP
    lootDropped: sawPickup, // server rolled a loot drop
    singularityRose: maxSing > startSing, // shared server-wide meter pushed by kills
  };
  ws.close();
  await sleep(300);
  report(
    "COMBAT — server resolves hits + awards credits/XP + loot + shared Singularity",
    {
      startEnemies,
      minEnemyHp: minEnemyHp === 999 ? null : round(minEnemyHp),
      credits: maxCredits,
      xp: maxXp,
      level: store.level ?? 1,
      singularity: round(maxSing),
      sawPlayerShot,
      tookEnemyDamage: tookDamage,
    },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function mp() {
  const AOI = 720;
  const a = await connect();
  const wa = await login(a, "alice");
  const b = await connect();
  const wb = await login(b, "bob");
  const sa = { x: wa.x, y: wa.y, players: [] };
  const sb = { x: wb.x, y: wb.y, players: [] };
  trackState(a, wa.id, sa);
  trackState(b, wb.id, sb);
  await sleep(500);
  const sees = (store, who) => (store.players || []).some((p) => p.id === who);

  // Phase 1 — both near spawn: each should see the other.
  const closeMutual = sees(sa, wb.id) && sees(sb, wa.id);

  // Phase 2 — drive them apart (alice down-left, bob up-right).
  let seq = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    seq++;
    a.send(JSON.stringify({ t: "input", seq, mx: -1, my: 1 }));
    b.send(JSON.stringify({ t: "input", seq, mx: 1, my: -1 }));
    await sleep(50);
  }
  await sleep(400);
  const d = Math.hypot(sa.x - sb.x, sa.y - sb.y);
  const farMutual = sees(sa, wb.id) || sees(sb, wa.id);

  const checks = {
    mutualVisibleWhenClose: closeMutual,
    // far → culled; clearly-close → visible; borderline → not asserted
    aoiCulls: d > AOI * 1.05 ? !farMutual : d < AOI * 0.95 ? farMutual : true,
    separatedEnoughToTestCull: d > AOI * 1.05, // info: did they actually get far?
  };
  a.close();
  b.close();
  await sleep(300);
  report(
    "MP + AOI — two players see each other; AOI culls the distant one",
    { spawnA: [round(wa.x), round(wa.y)], finalDist: round(d), aoi: AOI, closeMutual, farMutual },
    checks.mutualVisibleWhenClose && checks.aoiCulls,
    checks,
  );
}

async function bot() {
  const name = process.argv[3] || "bot";
  const ws = await connect();
  const w = await login(ws, name);
  const store = { x: w.x, y: w.y };
  trackState(ws, w.id, store);
  // demo helper: auto-accept trade requests + counter-offer (so the panel opens)
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "sys" && /wants to trade/.test(m.text || "")) {
      ws.send(JSON.stringify({ t: "trade", action: "accept" }));
      setTimeout(() => ws.send(JSON.stringify({ t: "trade", action: "offer", credits: 3, cores: 1 })), 250);
    }
  });
  console.log(`bot '${name}' online at ${round(w.x)},${round(w.y)} — wandering (Ctrl-C to stop)`);
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  let seq = 0;
  let di = 0;
  for (;;) {
    const [mx, my] = dirs[di++ % dirs.length];
    for (let i = 0; i < 24; i++) {
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx, my }));
      if (seq % 6 === 0) ws.send(JSON.stringify({ t: "fire", seq, aim: Math.random() * Math.PI * 2 }));
      await sleep(50);
    }
  }
}

async function zones() {
  const base = WS_URL;
  const a = await connect(base + "?zone=d0");
  const wa = await login(a, "ax");
  const b = await connect(base + "?zone=d1");
  const wb = await login(b, "bx");
  const sa = { x: wa.x, y: wa.y, players: [], enemies: [], sing: 0 };
  const sb = { x: wb.x, y: wb.y, players: [], enemies: [], sing: 0 };
  trackState(a, wa.id, sa);
  trackState(b, wb.id, sb);
  await sleep(600);

  const aSeesB = (sa.players || []).some((p) => p.id === wb.id);
  const bSeesA = (sb.players || []).some((p) => p.id === wa.id);
  const differentSpawns = Math.hypot(wa.x - wb.x, wa.y - wb.y) > 1;
  const startSingB = sb.sing ?? 0;

  // 'a' farms cops in d0; the shared meter should rise for 'b' in d1 (via D1 sync).
  let seq = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    let best = null;
    let bd = Infinity;
    for (const e of sa.enemies || []) {
      const d = Math.hypot(e.x - sa.x, e.y - sa.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) {
      const dx = best.x - sa.x;
      const dy = best.y - sa.y;
      const d = Math.hypot(dx, dy) || 1;
      seq++;
      a.send(JSON.stringify({ t: "input", seq, mx: d > 110 ? dx / d : 0, my: d > 110 ? dy / d : 0 }));
      a.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(dy, dx) }));
    }
    await sleep(50);
  }
  await sleep(3000); // let D1 sync the shared meter into zone d1
  const endSingB = sb.sing ?? 0;

  const checks = {
    zonesIsolated: !aSeesB && !bSeesA, // different DOs → can't see each other
    differentSpawns, // each district has its own spawn point
    sharedSingularityAcrossZones: endSingB > startSingB, // d0 kills raised d1's meter
  };
  a.close();
  b.close();
  await sleep(300);
  report(
    "ZONES — per-district DOs: cross-zone isolation + shared Singularity",
    { aSpawn: [round(wa.x), round(wa.y)], bSpawn: [round(wb.x), round(wb.y)], aSeesB, bSeesA, singB: [round(startSingB), round(endSingB)] },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function territory() {
  const myFac = 2; // WINTERMUTE
  const ws = await connect(WS_URL + "?zone=d0");
  const w = await login(ws, "holdr", myFac);
  const store = { x: w.x, y: w.y, nodes: [], factions: [], control: -1 };
  trackState(ws, w.id, store);
  await sleep(500);

  const nearestNode = () => {
    let best = null;
    let bd = Infinity;
    for (const n of store.nodes || []) {
      const d = Math.hypot(n.x - store.x, n.y - store.y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  };
  const startScore = (store.factions || [])[myFac] || 0;
  const target = nearestNode();
  if (!target) {
    report("TERRITORY", { error: "no nodes in district" }, false);
    ws.close();
    return;
  }

  let captured = false;
  let controlMine = false;
  let seq = 0;
  const t0 = Date.now();
  // Walk to the node and channel it (stand inside its range, single faction).
  while (Date.now() - t0 < 11000) {
    const n = (store.nodes || []).find((nn) => nn.id === target.id) || target;
    const dx = n.x - store.x;
    const dy = n.y - store.y;
    const d = Math.hypot(dx, dy) || 1;
    seq++;
    if (d > 45) ws.send(JSON.stringify({ t: "input", seq, mx: dx / d, my: dy / d }));
    else ws.send(JSON.stringify({ t: "input", seq, mx: 0, my: 0 }));
    const cur = (store.nodes || []).find((nn) => nn.id === target.id);
    if (cur && cur.owner === myFac) captured = true;
    if (store.control === myFac) controlMine = true;
    await sleep(50);
  }
  await sleep(2800); // let the faction contribution sync to D1
  const endScore = (store.factions || [])[myFac] || 0;

  const checks = {
    nodesExist: (store.nodes || []).length > 0,
    capturedForFaction: captured,
    factionContributionRose: endScore > startScore,
    districtControlTaken: controlMine,
  };
  ws.close();
  await sleep(300);
  report(
    "TERRITORY — capture a node for your faction; score + district control",
    { nodes: (store.nodes || []).length, myFaction: myFac, score: [round(startScore), round(endScore)], captured, controlMine },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function meltdown() {
  // The harness pre-sets world_meta.singularity near SING_MAX; a few kills tip it
  // over, triggering the server-wide meltdown + era reset.
  const ws = await connect();
  const w = await login(ws, "ender", 0);
  const store = { x: w.x, y: w.y, enemies: [], sing: 0, meltdown: false, season: 1 };
  trackState(ws, w.id, store);
  await sleep(600);
  const startSeason = store.season;

  let sawMeltdown = false;
  let peakSing = 0;
  let resetAfterMeltdown = false;
  let seq = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 17000) {
    let best = null;
    let bd = Infinity;
    for (const e of store.enemies) {
      const d = Math.hypot(e.x - store.x, e.y - store.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) {
      const dx = best.x - store.x;
      const dy = best.y - store.y;
      const d = Math.hypot(dx, dy) || 1;
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 110 ? dx / d : 0, my: d > 110 ? dy / d : 0 }));
      ws.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(dy, dx) }));
    }
    peakSing = Math.max(peakSing, store.sing);
    if (store.meltdown) sawMeltdown = true;
    if (sawMeltdown && !store.meltdown && store.sing < 50) resetAfterMeltdown = true;
    await sleep(50);
  }

  const checks = {
    reachedMeltdown: sawMeltdown, // Singularity capped → meltdown went active
    eraReset: resetAfterMeltdown, // meltdown ended and the meter reset
    seasonIncremented: store.season > startSeason, // a new era began
  };
  ws.close();
  await sleep(300);
  report(
    "MELTDOWN — Singularity caps → server-wide meltdown → new era",
    { startSeason, endSeason: store.season, peakSing: round(peakSing), sawMeltdown },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function social() {
  const a = await connect();
  const wa = await login(a, "alice", 0);
  const b = await connect();
  const wb = await login(b, "bob", 1);
  const sa = { roster: [] };
  const sb = { roster: [] };
  trackState(a, wa.id, sa);
  trackState(b, wb.id, sb);
  const bChat = [];
  const aParty = [];
  const bParty = [];
  b.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "chat") bChat.push(m);
    if (m.t === "party") bParty.push(m.members);
  });
  a.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "party") aParty.push(m.members);
  });
  await sleep(600);

  a.send(JSON.stringify({ t: "chat", ch: "zone", text: "hello zone" }));
  await sleep(450);
  const zoneChat = bChat.some((c) => c.ch === "zone" && c.text === "hello zone" && c.from === "alice");

  a.send(JSON.stringify({ t: "chat", ch: "whisper", to: "bob", text: "psst" }));
  await sleep(450);
  const whisper = bChat.some((c) => c.ch === "whisper" && c.text === "psst");

  a.send(JSON.stringify({ t: "party", action: "invite", to: "bob" }));
  await sleep(450);
  b.send(JSON.stringify({ t: "party", action: "accept" }));
  await sleep(550);
  const inParty =
    aParty.some((m) => m.includes("alice") && m.includes("bob")) ||
    bParty.some((m) => m.includes("alice") && m.includes("bob"));

  a.send(JSON.stringify({ t: "chat", ch: "party", text: "team up" }));
  await sleep(450);
  const partyChat = bChat.some((c) => c.ch === "party" && c.text === "team up");

  const presence = (sa.roster || []).some((r) => r.id === "alice") && (sa.roster || []).some((r) => r.id === "bob");

  const checks = { zoneChat, whisper, party: inParty, partyChat, presence };
  a.close();
  b.close();
  await sleep(300);
  report(
    "SOCIAL — chat (zone/whisper/party) + party invite/accept + presence roster",
    { zoneChat, whisper, inParty, partyChat, rosterCount: (sa.roster || []).length },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function trade() {
  // (harness pre-sets D1: alice credits=100 cores=5, bob credits=50 cores=2)
  const a = await connect();
  const wa = await login(a, "alice", 0);
  const b = await connect();
  const wb = await login(b, "bob", 1);
  const sa = { credits: 0, cores: 0 };
  const sb = { credits: 0, cores: 0 };
  trackState(a, wa.id, sa);
  trackState(b, wb.id, sb);
  await sleep(700);
  const start = { aC: sa.credits, aK: sa.cores, bC: sb.credits, bK: sb.cores };

  const T = (ws, action, extra = {}) => ws.send(JSON.stringify({ t: "trade", action, ...extra }));

  // happy path: alice gives 30₵ +2◈, bob gives 10₵ +1◈; both confirm → atomic swap
  T(a, "request", { to: "bob" });
  await sleep(300);
  T(b, "accept");
  await sleep(250);
  T(a, "offer", { credits: 30, cores: 2 });
  T(b, "offer", { credits: 10, cores: 1 });
  await sleep(300);
  T(a, "confirm");
  T(b, "confirm");
  await sleep(800);
  const atomicSwap =
    sa.credits === start.aC - 30 + 10 &&
    sa.cores === start.aK - 2 + 1 &&
    sb.credits === start.bC - 10 + 30 &&
    sb.cores === start.bK - 1 + 2;

  // dupe-proof: alice tries to give more credits than she now has → reset, no change
  const before = { aC: sa.credits, bC: sb.credits, aK: sa.cores, bK: sb.cores };
  T(a, "request", { to: "bob" });
  await sleep(250);
  T(b, "accept");
  await sleep(250);
  T(a, "offer", { credits: 999999, cores: 0 });
  T(b, "offer", { credits: 0, cores: 0 });
  await sleep(300);
  T(a, "confirm");
  T(b, "confirm");
  await sleep(800);
  const dupeProof =
    sa.credits === before.aC && sb.credits === before.bC && sa.cores === before.aK && sb.cores === before.bK;
  T(a, "cancel");
  await sleep(200);

  const checks = { atomicSwap, dupeProof };
  a.close();
  b.close();
  await sleep(300);
  report(
    "TRADE — atomic both-confirm swap; dupe-proof on insufficient balance",
    { start, afterSwap: { aC: sa.credits, aK: sa.cores, bC: sb.credits, bK: sb.cores }, atomicSwap, dupeProof },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function quest() {
  // fresh Blank — the harness clears its quest_step first so it starts at 0
  const ws = await connect();
  const w = await login(ws, "blank0", 0);
  const store = { x: w.x, y: w.y, enemies: [], nodes: [], questStep: 0, questProgress: 0 };
  trackState(ws, w.id, store);
  const stories = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "story") stories.push(m);
  });
  await sleep(600);
  const startStep = store.questStep;

  // Step 1 — drop 2 cops.
  let seq = 0;
  let t0 = Date.now();
  while (Date.now() - t0 < 9000 && store.questStep < 1) {
    let best = null;
    let bd = Infinity;
    for (const e of store.enemies) {
      const d = Math.hypot(e.x - store.x, e.y - store.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) {
      const dx = best.x - store.x;
      const dy = best.y - store.y;
      const d = Math.hypot(dx, dy) || 1;
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 110 ? dx / d : 0, my: d > 110 ? dy / d : 0 }));
      ws.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(dy, dx) }));
    }
    await sleep(50);
  }
  const killAdvanced = store.questStep >= 1;

  // Step 2 — capture a node.
  t0 = Date.now();
  while (Date.now() - t0 < 14000 && store.questStep < 2) {
    let node = null;
    let bd = Infinity;
    for (const nn of store.nodes) {
      const d = Math.hypot(nn.x - store.x, nn.y - store.y);
      if (d < bd) {
        bd = d;
        node = nn;
      }
    }
    if (node) {
      const dx = node.x - store.x;
      const dy = node.y - store.y;
      const d = Math.hypot(dx, dy);
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 40 ? dx / d : 0, my: d > 40 ? dy / d : 0 }));
    }
    await sleep(50);
  }
  const captureAdvanced = store.questStep >= 2;
  const finalStep = store.questStep;

  // Persistence — reconnect; the quest step should reload.
  ws.close();
  await sleep(500);
  const ws2 = await connect();
  const w2 = await login(ws2, "blank0", 0);
  const store2 = { questStep: -1 };
  trackState(ws2, w2.id, store2);
  await sleep(600);

  const checks = {
    startedAtZero: startStep === 0,
    killAdvanced,
    captureAdvanced,
    gotStoryBeats: stories.length >= 2,
    persistedStep: store2.questStep === finalStep && finalStep >= 1,
  };
  ws2.close();
  await sleep(300);
  report(
    "QUEST — The Blank advances from shared-world actions + persists",
    { startStep, finalStep, reloadedStep: store2.questStep, storyBeats: stories.length },
    Object.values(checks).every(Boolean),
    checks,
  );
}

try {
  if (mode === "check") await check();
  else if (mode === "combat") await combat();
  else if (mode === "mp") await mp();
  else if (mode === "zones") await zones();
  else if (mode === "territory") await territory();
  else if (mode === "meltdown") await meltdown();
  else if (mode === "social") await social();
  else if (mode === "trade") await trade();
  else if (mode === "quest") await quest();
  else if (mode === "bot") await bot();
  else await move();
} catch (e) {
  report(mode.toUpperCase(), { error: String(e?.message || e) }, false);
}
// give the close frame a moment, then exit with whatever exitCode report() set
await sleep(150);
process.exit(process.exitCode || 0);
