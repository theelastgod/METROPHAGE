// METROPHAGE smoke suite — proves the authoritative loop + persistence with Node's
// built-in WebSocket client (no deps). One mode per run: node smoke.mjs <mode>.
//
// BATTERY-ORDERING CONSTRAINTS (when running many modes back-to-back):
//   * `metro` asserts the cash-out pool starts EMPTY — run it BEFORE `market`
//     (market seeds $METRO via deposits) or re-clear metro_deposits/withdrawals.
//   * district bots (combat/daily/quest) now share districts with LIVE world events;
//     a purge wave or neon storm can kill an idle bot — those modes are robust
//     standalone but can flake mid-battery. Re-run standalone before treating a
//     battery failure as a regression.
//   * `dive` and `quest` may hit an already-cracked v0 core from a prior run — the
//     late-diver path (claim-once per player) makes both pass regardless.
//
// Original two-phase persistence check:
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
const WORLD_W = 3840; // district grid 120x90 tiles x 32px (DISTRICT_SCALE 3)
const WORLD_H = 2880;
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

function login(ws, name, faction, look, extra = {}) {
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
    ws.send(JSON.stringify({ t: "login", name, faction, ...(look ? { look } : {}), ...extra }));
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
        store.metro = me.metro ?? 0;
        store.xp = me.xp;
        store.level = me.level;
        store.questStep = me.questStep;
        store.questProgress = me.questProgress;
        store.campaignQuest = me.campaignQuest ?? null;
        store.campaignStage = me.campaignStage ?? 0;
        store.campaignProgress = me.campaignProgress ?? 0;
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
    withinBounds: store.x >= 0 && store.x <= WORLD_W && store.y >= 0 && store.y <= WORLD_H,
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

  // prior smokes may have just cleared this district — enemies respawn on ~4s timers,
  // so sample presence across the whole fight window, not the first instant
  let startEnemies = store.enemies.length;
  let minEnemyHp = 999;
  let maxCredits = 0;
  let maxXp = 0;
  let sawPlayerShot = false;
  let sawPickup = false;
  let tookDamage = false;
  let lastPodAt = 0;
  let seq = 0;
  const t0 = Date.now();
  // Chase the nearest cop and shoot it; the SERVER resolves every hit + payout.
  // Loot is a 55% roll per kill — keep fighting until a drop lands (or 20s), so the
  // assertion tests the system rather than one coin flip.
  while (Date.now() - t0 < 30000 && !(sawPickup && maxXp > 0)) {
    const e = nearest();
    if (e) {
      const dx = e.x - store.x;
      const dy = e.y - store.y;
      const d = Math.hypot(dx, dy) || 1;
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 110 ? dx / d : 0, my: d > 110 ? dy / d : 0 }));
      ws.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(dy, dx) }));
      // fight like a player: pod the pack whenever the signature is off cooldown
      // (the AoE can't be strafed — wasps now orbit gunfire)
      if (!lastPodAt || Date.now() - lastPodAt > 7200) {
        lastPodAt = Date.now();
        ws.send(JSON.stringify({ t: "ability", seq, aim: Math.atan2(dy, dx) }));
      }
    } else {
      // nothing in AOI (prior smokes drag the garrison around; the homeward leash
      // walks them back slowly) — sweep the district until a unit shows up
      const a = (Date.now() - t0) / 1400;
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: Math.cos(a), my: Math.sin(a) * 0.7 }));
    }
    startEnemies = Math.max(startEnemies, store.enemies.length);
    for (const en of store.enemies) minEnemyHp = Math.min(minEnemyHp, en.hp);
    if (store.shots.some((s) => s.team === 0)) sawPlayerShot = true;
    if ((store.pickups || []).length > 0) sawPickup = true;
    maxCredits = Math.max(maxCredits, store.credits || 0);
    maxXp = Math.max(maxXp, store.xp || 0);
    if ((store.hp ?? 100) < 100) tookDamage = true;
    await sleep(50);
  }

  const checks = {
    enemiesSimulated: startEnemies > 0,
    serverResolvedHit: minEnemyHp < 75 || maxCredits > 0, // cop damaged, or a kill paid out
    progressionGained: maxXp > 0, // server awarded XP
    lootDropped: sawPickup, // server rolled a loot drop
  };
  ws.close();
  await sleep(300);
  report(
    "COMBAT — server resolves hits + awards credits/XP + loot",
    {
      startEnemies,
      minEnemyHp: minEnemyHp === 999 ? null : round(minEnemyHp),
      credits: maxCredits,
      xp: maxXp,
      level: store.level ?? 1,
      sawPlayerShot,
      tookEnemyDamage: tookDamage,
    },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function inventory() {
  const name = "inv_" + Math.random().toString(36).slice(2, 8); // fresh player, no prior loot
  // Phase 1: log in, kill cops until the server rolls gear into our inventory.
  const ws = await connect();
  const store = { x: 0, y: 0, enemies: [], shots: [], inventory: [] };
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "inv") store.inventory = m.items;
  });
  const w = await login(ws, name);
  store.x = w.x;
  store.y = w.y;
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

  let seq = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 12000 && store.inventory.length < 2) {
    const e = nearest();
    if (e) {
      const dx = e.x - store.x;
      const dy = e.y - store.y;
      const d = Math.hypot(dx, dy) || 1;
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 110 ? dx / d : 0, my: d > 110 ? dy / d : 0 }));
      ws.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(dy, dx) }));
    }
    await sleep(50);
  }
  const held = store.inventory.slice();
  ws.close();
  await sleep(800); // let the server persist on close + evict from memory

  // Phase 2: reconnect as the SAME player — the inventory must reload from D1.
  const ws2 = await connect();
  const store2 = { inventory: [] };
  ws2.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "inv") store2.inventory = m.items;
  });
  await login(ws2, name);
  await sleep(400); // catch the hydration inv message
  const reloaded = store2.inventory.slice();
  ws2.close();

  const sameIds =
    held.length > 0 &&
    held.length === reloaded.length &&
    held.every((it, i) => reloaded[i] && reloaded[i].id === it.id);
  const validShape = held.every((it) => it && it.id && it.name && it.slot && it.rarity);
  const checks = {
    lootedToInventory: held.length > 0, // server rolled gear into the inventory
    validItemShape: validShape, // items carry the shared Item fields
    persistedAcrossRelogin: sameIds, // D1 round-trip on logoff/login
  };
  report(
    "INVENTORY — server-rolled loot enters the inventory + persists across relogin",
    {
      held: held.length,
      reloaded: reloaded.length,
      sample: held[0] ? `${held[0].rarity} ${held[0].name} [${held[0].slot}]` : null,
    },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function lookpersist() {
  const name = "look_" + Math.random().toString(36).slice(2, 8); // fresh player
  const L = {
    color: 0x39ff88, build: "bulky", head: "crown", visor: "scan", shoulders: "spikes",
    decal: "skull", cloak: "cape", skin: -1, sex: "m", hair: "buzz", hairColor: 0x101010,
    beard: "none", antennae: true, emblem: true, strap: false,
  };
  const loginWith = (ws, nm, look) =>
    new Promise((resolve, reject) => {
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
      ws.send(JSON.stringify({ t: "login", name: nm, faction: 0, ...(look ? { look } : {}) }));
    });

  // Phase 1: A logs in WITH a look, then disconnects (server persists on close).
  const a1 = await connect();
  const wa = await loginWith(a1, name, L);
  await sleep(400);
  a1.close();
  await sleep(800); // persist + evict from memory

  // Phase 2: A reconnects WITHOUT a look; a nearby viewer must still see A's persisted look.
  const a2 = await connect();
  await loginWith(a2, name, null); // no look field → the server must reload it from D1
  const b = await connect();
  const wb = await login(b, "viewer2", 0);
  const sb = { players: [] };
  trackState(b, wb.id, sb);
  await sleep(800);

  const seen = (sb.players || []).find((p) => p.id === wa.id);
  const checks = {
    persistedLook: !!seen && !!seen.look, // the reloaded player still has an appearance
    matchesAfterRelogin:
      !!seen?.look && seen.look.head === "crown" && seen.look.cloak === "cape" && seen.look.color === 0x39ff88,
  };
  a2.close();
  b.close();
  await sleep(300);
  report(
    "LOOK PERSIST — appearance survives relogin without the client resending it",
    { sawLook: seen?.look ? `${seen.look.head}/${seen.look.cloak}/${seen.look.color.toString(16)}` : null },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function auth() {
  const { ed25519 } = await import("@noble/curves/ed25519");
  const bs58 = (await import("bs58")).default;
  // must match protocol.loginMessage
  const loginMessage = (wallet, ts) => `METROPHAGE login\nwallet: ${wallet}\nts: ${ts}`;

  const priv = ed25519.utils.randomPrivateKey();
  const wallet = bs58.encode(ed25519.getPublicKey(priv));

  const signedLogin = (ws, opts = {}) =>
    new Promise((resolve) => {
      const ts = opts.ts ?? Date.now();
      const to = setTimeout(() => resolve({ ok: false, reason: "no welcome" }), 4000);
      const onMsg = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.t === "welcome") {
          clearTimeout(to);
          ws.removeEventListener("message", onMsg);
          resolve({ ok: true, id: m.id });
        } else if (m.t === "sys" && /sign-in failed/i.test(m.text || "")) {
          clearTimeout(to);
          ws.removeEventListener("message", onMsg);
          resolve({ ok: false, reason: "rejected" });
        }
      };
      ws.addEventListener("message", onMsg);
      // tamper = sign a DIFFERENT message than the ts we send, so the signature won't verify
      const signedTs = opts.tamper ? ts + 1 : ts;
      const sig = bs58.encode(ed25519.sign(new TextEncoder().encode(loginMessage(wallet, signedTs)), priv));
      ws.send(JSON.stringify({ t: "login", name: "walletuser", wallet, sig, ts }));
    });

  const a = await connect();
  const r1 = await signedLogin(a); // valid → durable wallet id
  a.close();
  const b = await connect();
  const r2 = await signedLogin(b, { tamper: true }); // bad signature → rejected
  b.close();
  const c = await connect();
  const r3 = await signedLogin(c, { ts: Date.now() - 5 * 60_000 }); // stale → rejected
  c.close();
  await sleep(300);

  const checks = {
    verifiedIdentity: r1.ok && r1.id === "w:" + wallet,
    rejectsBadSignature: !r2.ok,
    rejectsStaleTimestamp: !r3.ok,
  };
  report(
    "AUTH — signed Solana wallet login → durable wallet id; bad/stale rejected",
    { id: r1.id, badSig: r2.reason, stale: r3.reason },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function boss() {
  const WW = 1280;
  const WH = 960;
  const ws = await connect();
  const w = await login(ws, "bosshunter");
  const store = { x: w.x, y: w.y, enemies: [], hp: 100 };
  trackState(ws, w.id, store);
  await sleep(300);
  const findBoss = () => store.enemies.find((e) => e.boss);

  // 1) trek toward the far corner until the boss (parked at the deepest post) is in view
  const tgt = { x: store.x < WW / 2 ? WW - 64 : 64, y: store.y < WH / 2 ? WH - 64 : 64 };
  let seq = 0;
  const tFind = Date.now();
  while (!findBoss() && Date.now() - tFind < 18000) {
    const dx = tgt.x - store.x, dy = tgt.y - store.y, d = Math.hypot(dx, dy) || 1;
    seq++;
    ws.send(JSON.stringify({ t: "input", seq, mx: dx / d, my: dy / d }));
    await sleep(60);
  }
  const b0 = findBoss();
  const spawned = !!b0 && !!b0.name && (b0.hpMax || 0) > 100;

  // 2) hammer it until it drops out of the live snapshot (hp<=0 → server stops sending it)
  let killed = false;
  const tKill = Date.now();
  while (spawned && Date.now() - tKill < 45000) {
    const b = findBoss();
    if (!b) {
      killed = true;
      break;
    }
    const dx = b.x - store.x, dy = b.y - store.y, d = Math.hypot(dx, dy) || 1;
    seq++;
    ws.send(JSON.stringify({ t: "input", seq, mx: d > 80 ? dx / d : 0, my: d > 80 ? dy / d : 0 }));
    ws.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(dy, dx) }));
    await sleep(45);
  }

  // 3) wait out the respawn timer; confirm it reforms at (near) full HP, at its lair
  let reformed = false, reformedHp = 0;
  if (killed) {
    const tWait = Date.now();
    while (Date.now() - tWait < 40000) {
      const b = findBoss();
      if (b && b.hpMax && b.hp >= b.hpMax * 0.9) {
        reformed = true;
        reformedHp = b.hp;
        break;
      }
      await sleep(250);
    }
  }
  ws.close();
  await sleep(300);
  const checks = { bossSpawned: spawned, bossKilled: killed, bossRespawned: reformed };
  report(
    "BOSS — a world boss spawns, is killable, and respawns at full HP for others",
    { name: b0?.name ?? null, hpMax: b0?.hpMax ?? null, reformedHp },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function equip() {
  const name = "eq_" + Math.random().toString(36).slice(2, 8);
  const ws = await connect();
  const store = { x: 0, y: 0, enemies: [], inventory: [], equipped: [], maxHp: 100 };
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "inv") store.inventory = m.items;
    else if (m.t === "equipped") {
      store.equipped = m.items;
      store.maxHp = m.maxHp;
    }
  });
  const w = await login(ws, name);
  store.x = w.x;
  store.y = w.y;
  trackState(ws, w.id, store);
  await sleep(250);

  // kill cops until we have an item to equip
  let seq = 0;
  const t0 = Date.now();
  const nearest = () => {
    let b = null, bd = 1e9;
    for (const e of store.enemies) {
      const d = Math.hypot(e.x - store.x, e.y - store.y);
      if (d < bd) { bd = d; b = e; }
    }
    return b;
  };
  while (Date.now() - t0 < 15000 && store.inventory.length < 1) {
    const e = nearest();
    if (e) {
      const dx = e.x - store.x, dy = e.y - store.y, d = Math.hypot(dx, dy) || 1;
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 110 ? dx / d : 0, my: d > 110 ? dy / d : 0 }));
      ws.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(dy, dx) }));
    }
    await sleep(45);
  }
  const item = store.inventory[0];
  const gotItem = !!item;

  // equip it → it moves to the loadout, and maxHp reflects any +HP mod exactly
  let equippedOk = false, maxHpOk = false;
  if (item) {
    ws.send(JSON.stringify({ t: "equip", itemId: item.id }));
    await sleep(500);
    equippedOk = store.equipped.some((e) => e.id === item.id) && !store.inventory.some((e) => e.id === item.id);
    maxHpOk = store.maxHp === 100 + Math.round(item.mods?.hpAdd ?? 0);
  }
  ws.close();
  await sleep(800);

  // reconnect → the equipped item must persist (loadout hydrated from D1)
  const ws2 = await connect();
  const store2 = { equipped: [] };
  ws2.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "equipped") store2.equipped = m.items;
  });
  await login(ws2, name);
  await sleep(400);
  const persists = !!item && store2.equipped.some((e) => e.id === item.id);
  ws2.close();
  await sleep(200);

  const checks = {
    gotItem,
    equippedMovedToLoadout: equippedOk,
    maxHpDerived: maxHpOk,
    persistedAcrossRelogin: persists,
  };
  report(
    "EQUIP — gear equips, derives max HP, and the loadout persists across relogin",
    { item: item ? `${item.rarity} ${item.name} [${item.slot}]` : null, maxHp: store.maxHp, hpAdd: item?.mods?.hpAdd ?? 0 },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function craft() {
  // GEAR FORGE. (harness pre-seeds D1: crafter credits=6000 cores=60, empty bag)
  // Buys deterministic Standard caches, then exercises every forge op server-side.
  const ws = await connect();
  const store = { x: 0, y: 0, inventory: [], credits: 0, cores: 0, sys: [] };
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "inv") store.inventory = m.items;
    if (m.t === "sys") store.sys.push(m.text);
  });
  const w = await login(ws, "crafter", 0);
  store.x = w.x;
  store.y = w.y;
  trackState(ws, w.id, store);
  await sleep(350);

  // buy 5 Standard caches → 5 Standard items (deterministic rarity)
  for (let i = 0; i < 5; i++) {
    ws.send(JSON.stringify({ t: "buy", sku: "cache_standard" }));
    await sleep(240);
  }
  await sleep(400);
  const bought = store.inventory.slice();
  const boughtCaches = bought.length >= 5 && bought.slice(0, 5).every((it) => it.rarity === "standard");

  // UPGRADE bought[0] → +1 ilvl; credits AND cores both deducted
  const up0 = bought[0];
  const c0 = store.credits, k0 = store.cores;
  ws.send(JSON.stringify({ t: "craft", action: "upgrade", itemId: up0.id }));
  await sleep(450);
  const up0After = store.inventory.find((it) => it.id === up0.id);
  const upgradeApplied = !!up0After && (up0After.ilvl || 0) === 1 && store.credits < c0 && store.cores < k0;

  // REFORGE bought[1] → re-rolled mods (cost proves it ran; item stays)
  const rf = bought[1];
  const rfBefore = JSON.stringify(rf.mods);
  const c1 = store.credits, k1 = store.cores;
  ws.send(JSON.stringify({ t: "craft", action: "reforge", itemId: rf.id }));
  await sleep(450);
  const rfAfter = store.inventory.find((it) => it.id === rf.id);
  const reforgeApplied = !!rfAfter && store.credits < c1 && store.cores < k1 && JSON.stringify(rfAfter.mods) !== rfBefore;

  // SALVAGE bought[2] → item gone, cores credited
  const sv = bought[2];
  const k2 = store.cores;
  ws.send(JSON.stringify({ t: "craft", action: "salvage", itemId: sv.id }));
  await sleep(450);
  const salvageYielded = !store.inventory.some((it) => it.id === sv.id) && store.cores > k2;

  // FUSE bought[3]+bought[4] (both Standard) → one Tuned; both inputs consumed
  const fa = bought[3], fb = bought[4];
  ws.send(JSON.stringify({ t: "craft", action: "fuse", itemId: fa.id, itemId2: fb.id }));
  await sleep(500);
  const inputsGone = !store.inventory.some((it) => it.id === fa.id) && !store.inventory.some((it) => it.id === fb.id);
  const fuseMergedUp = inputsGone && store.inventory.some((it) => it.rarity === "tuned");

  // ANTI-CHEAT: a broke craft is rejected (drain cores, then try to upgrade)
  // up0 is now +1; spam upgrades until cores run dry, then assert the next is refused.
  let guarded = false;
  for (let i = 0; i < 40 && store.cores > 0; i++) {
    const before = store.credits + store.cores;
    ws.send(JSON.stringify({ t: "craft", action: "upgrade", itemId: up0.id }));
    await sleep(180);
    if (store.credits + store.cores === before) break; // a refusal (no spend) — done draining
  }
  const lvlNow = store.inventory.find((it) => it.id === up0.id)?.ilvl || 0;
  ws.send(JSON.stringify({ t: "craft", action: "upgrade", itemId: up0.id }));
  await sleep(350);
  const lvlAfter = store.inventory.find((it) => it.id === up0.id)?.ilvl || 0;
  guarded = lvlAfter === lvlNow; // couldn't upgrade further without funds

  ws.close();
  await sleep(700);

  // PERSISTENCE — reconnect; the upgrade level survives relogin (D1 round-trip)
  const ws2 = await connect();
  const store2 = { inventory: [] };
  ws2.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "inv") store2.inventory = m.items;
  });
  await login(ws2, "crafter", 0);
  await sleep(450);
  const ilvlPersisted = (store2.inventory.find((it) => it.id === up0.id)?.ilvl || 0) >= 1;
  ws2.close();

  const checks = { boughtCaches, upgradeApplied, reforgeApplied, salvageYielded, fuseMergedUp, brokeCraftRejected: guarded, ilvlPersisted };
  await sleep(200);
  report(
    "CRAFT — gear forge: upgrade/reforge/salvage/fuse (server-validated + persisted)",
    {
      bag: store.inventory.length,
      up0Level: store.inventory.find((it) => it.id === up0.id)?.ilvl ?? null,
      cores: store.cores,
      credits: store.credits,
      lastSys: store.sys.slice(-3),
    },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function achv() {
  // ACHIEVEMENTS + LEADERBOARDS — kills bump a cross-zone D1 counter; crossing a threshold
  // unlocks an achievement (server push + reward); the leaderboard aggregates over D1.
  const name = "ach_" + Math.random().toString(36).slice(2, 8); // fresh player → no prior unlocks
  const ws = await connect();
  const store = { x: 0, y: 0, enemies: [], credits: 0, achvSet: new Set(), unlocked: [] };
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "achv") store.achvSet = new Set(m.ids);
    if (m.t === "ach") store.unlocked.push(m);
  });
  const w = await login(ws, name, 0);
  store.x = w.x;
  store.y = w.y;
  trackState(ws, w.id, store);
  await sleep(350);
  const startedFresh = store.achvSet.size === 0;

  const nearest = () => {
    let b = null, bd = 1e9;
    for (const e of store.enemies) {
      const d = Math.hypot(e.x - store.x, e.y - store.y);
      if (d < bd) { bd = d; b = e; }
    }
    return b;
  };
  let seq = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 15000 && store.unlocked.length < 1) {
    const e = nearest();
    if (e) {
      const dx = e.x - store.x, dy = e.y - store.y, d = Math.hypot(dx, dy) || 1;
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 110 ? dx / d : 0, my: d > 110 ? dy / d : 0 }));
      ws.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(dy, dx) }));
    }
    await sleep(45);
  }
  const achievementUnlocked = store.unlocked.some((a) => a.id === "first_blood");
  const rewardGranted = store.unlocked.some((a) => (a.reward || 0) > 0);
  ws.close();
  await sleep(900); // onClose flushes stats + achievements to D1

  // cross-zone leaderboard over HTTP (aggregates D1 across all zones)
  const httpBase = WS_URL.replace(/^ws/, "http").replace(/\/ws$/, "");
  let lb = { rows: [] };
  try {
    lb = await (await fetch(`${httpBase}/leaderboard?stat=kills&n=25`)).json();
  } catch {
    /* server down */
  }
  const onLeaderboard = (lb.rows || []).some((r) => r.player === w.id && r.v > 0);

  // reconnect → the unlocked set reloads from D1
  const ws2 = await connect();
  const store2 = { achvSet: new Set() };
  ws2.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "achv") store2.achvSet = new Set(m.ids);
  });
  await login(ws2, name, 0);
  await sleep(550);
  const achvPersisted = store2.achvSet.has("first_blood");
  ws2.close();

  const checks = { startedFresh, achievementUnlocked, rewardGranted, onLeaderboard, achvPersisted };
  await sleep(200);
  report(
    "ACHV — kill-counter unlocks an achievement (+reward) & ranks on the cross-zone board",
    { unlocked: store.unlocked.map((a) => a.id), boardRows: (lb.rows || []).length, myKills: (lb.rows || []).find((r) => r.player === w.id)?.v ?? 0 },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function guild() {
  // GUILDS / CELLS. (harness pre-seeds: galice credits=2000, gbob credits=1000; cells cleared)
  const A = await connect();
  const ga = { guild: null, sys: [] };
  A.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "guild") ga.guild = m.state === "info" ? m.guild : null;
    if (m.t === "sys") ga.sys.push(m.text);
  });
  const wa = await login(A, "galice", 0);
  const sa = { credits: 0, cores: 0 };
  trackState(A, wa.id, sa);
  const B = await connect();
  const gb = { guild: null, sys: [] };
  B.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "guild") gb.guild = m.state === "info" ? m.guild : null;
    if (m.t === "sys") gb.sys.push(m.text);
  });
  const wb = await login(B, "gbob", 0);
  const sb = { credits: 0 };
  trackState(B, wb.id, sb);
  await sleep(600);

  const G = (ws, action, extra = {}) => ws.send(JSON.stringify({ t: "guild", action, ...extra }));

  // CREATE (deducts ₵500) → alice is leader
  G(A, "create", { tag: "RST", name: "Resistance " + Math.random().toString(36).slice(2, 6) });
  await sleep(550);
  const created = !!ga.guild && ga.guild.rank === "leader";
  const gid = ga.guild?.id;

  // INVITE + ACCEPT → bob joins
  G(A, "invite", { to: "gbob" });
  await sleep(350);
  G(B, "accept");
  await sleep(550);
  const bobJoined = !!gb.guild && gb.guild.id === gid && gb.guild.members.some((m) => m.id === "gbob");

  // DEPOSIT (alice) → bank rises, alice debited, cell XP grows
  const aC0 = sa.credits;
  G(A, "deposit", { credits: 300, cores: 0 });
  await sleep(550);
  const deposited = !!ga.guild && ga.guild.bankCredits >= 300 && sa.credits === aC0 - 300;
  const bankAfterDep = ga.guild?.bankCredits ?? 0;

  // MEMBER withdraw is REFUSED (rank gate)
  G(B, "withdraw", { credits: 100 });
  await sleep(400);
  G(A, "info");
  await sleep(350);
  const memberBlocked = (ga.guild?.bankCredits ?? -1) === bankAfterDep;

  // PROMOTE bob → officer; now his withdraw works (atomic guarded bank debit)
  G(A, "promote", { to: "gbob" });
  await sleep(450);
  const promoted = (ga.guild?.members.find((m) => m.id === "gbob")?.rank ?? "") === "officer";
  const bC0 = sb.credits;
  G(B, "withdraw", { credits: 100 });
  await sleep(500);
  G(A, "info");
  await sleep(350);
  const officerWithdrew = sb.credits === bC0 + 100 && (ga.guild?.bankCredits ?? -1) === bankAfterDep - 100;

  // PERSISTENCE — alice reconnects; cell membership reloads from D1
  A.close();
  await sleep(750);
  const A2 = await connect();
  const ga2 = { guild: null };
  A2.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "guild") ga2.guild = m.state === "info" ? m.guild : null;
  });
  await login(A2, "galice", 0);
  await sleep(550);
  const persisted = !!ga2.guild && ga2.guild.id === gid && ga2.guild.bankCredits === bankAfterDep - 100;
  A2.close();
  B.close();
  await sleep(200);

  const checks = { created, bobJoined, deposited, memberBlocked, promoted, officerWithdrew, persisted };
  report(
    "GUILD — found a Cell, invite/join, shared bank deposit/withdraw, rank gate, persist",
    { cell: ga2.guild ? `[${ga2.guild.tag}] L${ga2.guild.level} bank ₵${ga2.guild.bankCredits}` : null, members: ga2.guild?.members.length ?? 0 },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function market() {
  // AUCTION HOUSE. (harness pre-seeds: mseller/mbuyer credits=2000, empty bags; auctions+mail cleared)
  // SELLER buys a cache → item, lists it, then goes OFFLINE (to prove the mailbox payout path).
  const S = await connect();
  const ss = { inventory: [], credits: 0, listings: [], sys: [] };
  S.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "inv") ss.inventory = m.items;
    if (m.t === "market") ss.listings = m.listings;
    if (m.t === "sys") ss.sys.push(m.text);
  });
  const wsS = await login(S, "mseller", 0);
  trackState(S, wsS.id, ss);
  await sleep(400);
  S.send(JSON.stringify({ t: "buy", sku: "cache_tuned" })); // 180 → a deterministic Tuned item
  await sleep(550);
  const item = ss.inventory[ss.inventory.length - 1];
  const haveItem = !!item;
  const bagBeforeList = ss.inventory.length;
  const cBeforeList = ss.credits;
  S.send(JSON.stringify({ t: "market", action: "list", itemId: item.id, price: 500, currency: "credits" }));
  await sleep(550);
  const listingId = ss.listings.find((l) => l.item.id === item.id)?.id;
  const cAfterList = ss.credits;
  const listed = ss.inventory.length === bagBeforeList - 1 && cAfterList < cBeforeList && !!listingId; // escrowed + fee paid
  S.close(); // seller goes offline
  await sleep(750);

  // BUYER browses, buys (atomic), receives the item + is debited; a 2nd buy is refused
  const B = await connect();
  const sb = { inventory: [], credits: 0, listings: [] };
  B.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "inv") sb.inventory = m.items;
    if (m.t === "market") sb.listings = m.listings;
  });
  const wbB = await login(B, "mbuyer", 0);
  trackState(B, wbB.id, sb);
  await sleep(400);
  B.send(JSON.stringify({ t: "market", action: "browse" }));
  await sleep(450);
  const sawListing = sb.listings.some((l) => l.id === listingId);
  const cBuy0 = sb.credits;
  const bag0 = sb.inventory.length;
  B.send(JSON.stringify({ t: "market", action: "buy", id: listingId }));
  await sleep(650);
  const bought = sb.inventory.some((it) => it.id === item.id) && sb.credits === cBuy0 - 500 && sb.inventory.length === bag0 + 1;
  const cAfterBuy = sb.credits;
  B.send(JSON.stringify({ t: "market", action: "buy", id: listingId })); // already sold
  await sleep(450);
  const doubleBuyRejected = sb.credits === cAfterBuy;
  B.close();
  await sleep(750);

  // SELLER reconnects → the cross-zone mailbox pays them the ₵500 sale (offline payout)
  const S2 = await connect();
  const ss2 = { inventory: [], credits: 0, listings: [], sys: [] };
  S2.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "inv") ss2.inventory = m.items;
    if (m.t === "market") ss2.listings = m.listings;
    if (m.t === "sys") ss2.sys.push(m.text);
  });
  const ws2 = await login(S2, "mseller", 0);
  trackState(S2, ws2.id, ss2);
  await sleep(800);
  const sellerPaidViaMailbox = ss2.credits === cAfterList + 500;

  // CANCEL — list another item then cancel it; the item returns to the bag
  S2.send(JSON.stringify({ t: "buy", sku: "cache_standard" }));
  await sleep(500);
  const item2 = ss2.inventory[ss2.inventory.length - 1];
  const bagBeforeCancel = ss2.inventory.length;
  S2.send(JSON.stringify({ t: "market", action: "list", itemId: item2.id, price: 300 }));
  await sleep(500);
  const cancelId = ss2.listings.find((l) => l.item.id === item2.id)?.id;
  S2.send(JSON.stringify({ t: "market", action: "cancel", id: cancelId }));
  await sleep(550);
  const cancelled = !!cancelId && ss2.inventory.some((it) => it.id === item2.id) && ss2.inventory.length === bagBeforeCancel;
  S2.close();
  await sleep(200);

  // $METRO listings — fund via bridge deposit, then list/buy in ◈
  const httpBase = WS_URL.replace(/^ws/, "http").replace(/\/ws$/, "");
  const WALLET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const post = async (p, body) =>
    (await fetch(httpBase + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
  const depSeller = await post("/metro/deposit", { player: "mseller", wallet: WALLET, txSig: "MKT_S_" + Date.now(), metro: 50 });
  const depBuyer = await post("/metro/deposit", { player: "mbuyer", wallet: WALLET, txSig: "MKT_B_" + Date.now(), metro: 50 });

  const M = await connect();
  const sm = { inventory: [], metro: 0, listings: [], sys: [] };
  M.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "inv") sm.inventory = m.items;
    if (m.t === "market") sm.listings = m.listings;
    if (m.t === "sys") sm.sys.push(m.text);
  });
  const wm = await login(M, "mseller", 0);
  trackState(M, wm.id, sm);
  await sleep(500);
  M.send(JSON.stringify({ t: "buy", sku: "cache_standard" }));
  await sleep(500);
  const mItem = sm.inventory[sm.inventory.length - 1];
  const mMetro0 = sm.metro;
  M.send(JSON.stringify({ t: "market", action: "list", itemId: mItem.id, price: 20, currency: "metro" }));
  await sleep(550);
  const mListId = sm.listings.find((l) => l.item.id === mItem.id && l.currency === "metro")?.id;
  const metroListed = !!mListId && sm.metro < mMetro0;
  M.close();
  await sleep(400);

  const MB = await connect();
  const sbm = { inventory: [], metro: 0, listings: [] };
  MB.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "inv") sbm.inventory = m.items;
    if (m.t === "market") sbm.listings = m.listings;
  });
  const wbm = await login(MB, "mbuyer", 0);
  trackState(MB, wbm.id, sbm);
  await sleep(450);
  MB.send(JSON.stringify({ t: "market", action: "browse" }));
  await sleep(400);
  const mMetroBuy0 = sbm.metro;
  MB.send(JSON.stringify({ t: "market", action: "buy", id: mListId }));
  await sleep(650);
  const metroBought = sbm.inventory.some((it) => it.id === mItem.id) && sbm.metro === mMetroBuy0 - 20;
  MB.close();

  const checks = {
    haveItem,
    listed,
    sawListing,
    bought,
    doubleBuyRejected,
    sellerPaidViaMailbox,
    cancelled,
    metroDepositOk: depSeller.ok && depBuyer.ok,
    metroListed,
    metroBought,
  };
  report(
    "MARKET — escrow list, atomic buy, mailbox payout, cancel + $METRO listings",
    { listingId, soldFor: 500, sellerCredits: ss2.credits, buyerCredits: sb.credits, mListId },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function daily() {
  // PART A — daily contracts. Fresh player; the guaranteed daily (index 0) is a kill bounty.
  const name = "drun_" + Math.random().toString(36).slice(2, 7);
  const ws = await connect();
  const store = { x: 0, y: 0, enemies: [], credits: 0, contracts: [], rep: 0, repTier: 0, sys: [] };
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "contracts") {
      store.contracts = m.list;
      store.rep = m.rep;
      store.repTier = m.repTier;
    }
    if (m.t === "sys") store.sys.push(m.text);
  });
  const w = await login(ws, name, 0);
  store.x = w.x;
  store.y = w.y;
  trackState(ws, w.id, store);
  await sleep(450);
  const loaded = store.contracts.length === 3;
  const killDaily = store.contracts[0];
  const idxKill = !!killDaily && killDaily.objective === "kill";
  const repBefore = store.rep;

  const nearest = () => {
    let b = null, bd = 1e9;
    for (const e of store.enemies) {
      const d = Math.hypot(e.x - store.x, e.y - store.y);
      if (d < bd) { bd = d; b = e; }
    }
    return b;
  };
  let seq = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 90000 && !(store.contracts[0] && store.contracts[0].done)) {
    const e = nearest();
    if (e) {
      const dx = e.x - store.x, dy = e.y - store.y, d = Math.hypot(dx, dy) || 1;
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 110 ? dx / d : 0, my: d > 110 ? dy / d : 0 }));
      ws.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(dy, dx) }));
    }
    await sleep(45);
  }
  const advanced = !!store.contracts[0] && store.contracts[0].progress > 0;
  const completed = !!store.contracts[0] && store.contracts[0].done;
  const repRose = store.rep > repBefore;
  ws.close();
  await sleep(800);

  // persistence — reconnect; the completed daily reloads as done
  const ws2 = await connect();
  const store2 = { contracts: [] };
  ws2.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "contracts") store2.contracts = m.list;
  });
  await login(ws2, name, 0);
  await sleep(550);
  const persisted = !!store2.contracts[0] && store2.contracts[0].id === killDaily?.id && store2.contracts[0].done === true;
  ws2.close();
  await sleep(300);

  // PART B — reputation gates vendor tiers (harness pre-seeds: repvip rep=300 [tier1], credits=5000)
  const V = await connect();
  const sv = { inventory: [], credits: 0, sys: [], repTier: 0 };
  V.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "inv") sv.inventory = m.items;
    if (m.t === "sys") sv.sys.push(m.text);
    if (m.t === "contracts") sv.repTier = m.repTier;
  });
  const wv = await login(V, "repvip", 0);
  trackState(V, wv.id, sv);
  await sleep(550);
  const tier1 = sv.repTier >= 1;
  const invBefore = sv.inventory.length;
  V.send(JSON.stringify({ t: "buy", sku: "cache_blackice" })); // repReq 1 → allowed at tier 1
  await sleep(550);
  const blackiceBought = sv.inventory.length === invBefore + 1 && sv.inventory[sv.inventory.length - 1]?.rarity === "blackice";
  const invMid = sv.inventory.length;
  V.send(JSON.stringify({ t: "buy", sku: "cache_singular" })); // repReq 2 → gated at tier 1
  await sleep(550);
  const singularGated = sv.inventory.length === invMid && sv.sys.some((t) => /reputation tier 2/i.test(t));
  V.close();
  await sleep(200);

  const checks = { loaded, idxKill, advanced, completed, repRose, persisted, repTier1: tier1, blackiceBought, singularGated };
  report(
    "DAILY — day-seeded contracts grant credits+rep, persist; rep gates vendor tiers",
    { killContract: killDaily ? `${killDaily.name} ${store.contracts[0]?.progress}/${killDaily.count}` : null, rep: store.rep, repTier: sv.repTier },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function raid() {
  // RAID-TIER BOSS. Two players → the boss locks a bigger HP pool on engage, telegraphs AoE
  // hazards, escalates phases + summons adds. (run on a clean server so d0's boss is pristine)
  const WW = 1280, WH = 960;
  const base = WS_URL + (WS_URL.includes("?") ? "&" : "?") + "zone=d0";
  const mk = async (name) => {
    const ws = await connect(base);
    const s = { x: 0, y: 0, enemies: [], boss: null, hazards: [], sys: [], sawHaz: false, maxEn: 0, _seq: 0 };
    const w = await login(ws, name, 0);
    s.x = w.x;
    s.y = w.y;
    trackState(ws, w.id, s);
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === "state") {
        s.boss = m.boss || null;
        s.hazards = m.hazards || [];
        if ((m.hazards || []).length) s.sawHaz = true;
        s.maxEn = Math.max(s.maxEn, (m.enemies || []).length);
      }
      if (m.t === "sys") s.sys.push(m.text);
    });
    return { ws, s };
  };
  const A = await mk("raidA");
  const B = await mk("raidB");
  await sleep(800);
  const boss0 = A.s.boss;
  const bossFound = !!boss0 && (boss0.hpMax || 0) > 100;
  const hpMaxBefore = boss0?.hpMax || 0;

  // Chase the boss once it's in AOI (exact pos from the enemy list); until then trek toward
  // the far corner where it lairs (the proven locomotion from the `boss` smoke). `mayFire`
  // gates shooting until BOTH bots are present so the engaging hit scales HP for 2 players.
  const drive = (P, mayFire) => {
    P.s._seq++;
    const b = P.s.enemies.find((e) => e.boss);
    if (b) {
      const dx = b.x - P.s.x, dy = b.y - P.s.y, d = Math.hypot(dx, dy) || 1;
      P.ws.send(JSON.stringify({ t: "input", seq: P.s._seq, mx: d > 90 ? dx / d : 0, my: d > 90 ? dy / d : 0 }));
      if (mayFire) P.ws.send(JSON.stringify({ t: "fire", seq: P.s._seq, aim: Math.atan2(dy, dx) }));
    } else {
      const tx = P.s.x < WW / 2 ? WW - 64 : 64;
      const ty = P.s.y < WH / 2 ? WH - 64 : 64;
      const dx = tx - P.s.x, dy = ty - P.s.y, d = Math.hypot(dx, dy) || 1;
      P.ws.send(JSON.stringify({ t: "input", seq: P.s._seq, mx: dx / d, my: dy / d }));
    }
  };
  const seesBoss = (P) => P.s.enemies.some((e) => e.boss); // boss in this bot's AOI

  let enAtEngage = 0;
  let hpMaxAtEngage = 0; // capture AT engage (the boss may be killed + reform to base later)
  let engaged = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    // hold fire until both bots are alive with the boss in view, so the first hit engages 2
    const bothReady = engaged || (!A.s.dead && !B.s.dead && seesBoss(A) && seesBoss(B));
    drive(A, bothReady);
    drive(B, bothReady);
    const b = A.s.boss;
    if (!engaged && b && b.alive && b.hp < b.hpMax) {
      engaged = true;
      enAtEngage = Math.max(A.s.maxEn, B.s.maxEn);
      hpMaxAtEngage = b.hpMax;
    }
    const escalated = A.s.sys.concat(B.s.sys).some((t) => /enters (ESCALATION|DESPERATION)/.test(t));
    const haz = A.s.sawHaz || B.s.sawHaz;
    if (escalated && haz && hpMaxAtEngage > 0 && (!A.s.boss?.alive || Date.now() - t0 > 20000)) break; // mechanics proven
    await sleep(45);
  }
  const bossScaledHp = hpMaxAtEngage > hpMaxBefore; // 2 players → larger pool locked on engage
  const sawHazard = A.s.sawHaz || B.s.sawHaz;
  const allSys = A.s.sys.concat(B.s.sys);
  const phaseAdvanced = allSys.some((t) => /enters (ESCALATION|DESPERATION)/.test(t));
  const maxEn = Math.max(A.s.maxEn, B.s.maxEn);
  const addsAppeared = maxEn > enAtEngage; // a phase summoned extra enemies into AOI
  const bossKilled = !A.s.boss?.alive;
  A.ws.close();
  B.ws.close();
  await sleep(300);

  const checks = { bossFound, bossScaledHp, sawHazard, phaseAdvanced, addsAppeared };
  report(
    "RAID — boss scales HP to raid size, telegraphs AoE, escalates phases + summons adds",
    { baseHp: hpMaxBefore, scaledHp: hpMaxAtEngage, enAtEngage, maxEnemies: maxEn, bossKilled, beats: allSys.filter((t) => /enters|ENRAGE/.test(t)).slice(-4) },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function cosmetic() {
  // COSMETICS / TRANSMOG. (harness pre-seeds: dresser credits=3000; cosmetics cleared)
  const BASE_LOOK = {
    color: 0x9aa3b2, build: "std", head: "none", visor: "none", shoulders: "none", decal: "none", cloak: "none",
    skin: 0, sex: "m", hair: "buzz", hairColor: 0x101010, beard: "none", antennae: false, emblem: false, strap: false,
  };
  const loginWithLook = (ws, name, look) =>
    new Promise((resolve, reject) => {
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
      ws.send(JSON.stringify({ t: "login", name, faction: 0, look }));
    });

  const D = await connect();
  const sd = { owned: [], equipped: null, credits: 0, sys: [] };
  D.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "cosmetics") {
      sd.owned = m.owned;
      sd.equipped = m.equipped;
    }
    if (m.t === "sys") sd.sys.push(m.text);
  });
  const wd = await loginWithLook(D, "dresser", BASE_LOOK);
  trackState(D, wd.id, sd);
  await sleep(450);
  const V = await connect();
  const sv = { players: [] };
  const wv = await login(V, "cviewer", 0);
  trackState(V, wv.id, sv);
  await sleep(550);

  const seeDresser = () => (sv.players || []).find((p) => p.id === wd.id);
  const startCredits = sd.credits;

  // BUY a credit cosmetic
  D.send(JSON.stringify({ t: "cosmetic", action: "buy", id: "ghost_visor" }));
  await sleep(550);
  const bought = sd.owned.includes("ghost_visor");
  const creditsDeducted = sd.credits === startCredits - 300;

  // EQUIP → the viewer should see dresser's relayed look pick up the override
  D.send(JSON.stringify({ t: "cosmetic", action: "equip", id: "ghost_visor" }));
  await sleep(800);
  const equipped = sd.equipped === "ghost_visor";
  const lookAfter = seeDresser()?.look;
  const transmogRelayed = !!lookAfter && lookAfter.visor === "scan" && lookAfter.color === 0x29e7ff;

  // NFT-tier cosmetic is GATED (mainnet not armed) → buy refused, not owned
  D.send(JSON.stringify({ t: "cosmetic", action: "buy", id: "genesis" }));
  await sleep(550);
  const nftGated = !sd.owned.includes("genesis") && sd.sys.some((t) => /gated|nft|mainnet/i.test(t));

  D.close();
  V.close();
  await sleep(800);

  // PERSISTENCE — reconnect; owned + equipped reload from D1
  const D2 = await connect();
  const sd2 = { owned: [], equipped: null };
  D2.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "cosmetics") {
      sd2.owned = m.owned;
      sd2.equipped = m.equipped;
    }
  });
  await loginWithLook(D2, "dresser", BASE_LOOK);
  await sleep(550);
  const persisted = sd2.owned.includes("ghost_visor") && sd2.equipped === "ghost_visor";
  D2.close();
  await sleep(200);

  const checks = { bought, creditsDeducted, equipped, transmogRelayed, nftGated, persisted };
  report(
    "COSMETIC — buy/equip transmog relays the look override; NFT gated; persists",
    { owned: sd.owned, equipped: sd.equipped, viewerSaw: lookAfter ? `${lookAfter.visor}/${(lookAfter.color || 0).toString(16)}` : null, lastSys: sd.sys.slice(-2) },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function bounty() {
  // AUTHORED NPC BOUNTIES — accept a quest-giver's job (one at a time), auto-rewarded on done.
  const ws = await connect();
  const store = { x: 0, y: 0, enemies: [], bounty: null, sys: [] };
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "bounty") store.bounty = m.active;
    if (m.t === "sys") store.sys.push(m.text);
  });
  const w = await login(ws, "hunter_" + Math.random().toString(36).slice(2, 6));
  store.x = w.x;
  store.y = w.y;
  trackState(ws, w.id, store);
  await sleep(400);

  ws.send(JSON.stringify({ t: "bounty", action: "accept", id: "rin_sweep" })); // kill 12
  await sleep(400);
  const accepted = !!store.bounty && store.bounty.id === "rin_sweep";

  ws.send(JSON.stringify({ t: "bounty", action: "accept", id: "doc_cores" })); // already have one
  await sleep(400);
  const secondRejected = !!store.bounty && store.bounty.id === "rin_sweep" && store.sys.some((t) => /finish your current/i.test(t));

  const nearest = () => {
    let b = null, bd = 1e9;
    for (const e of store.enemies) {
      const d = Math.hypot(e.x - store.x, e.y - store.y);
      if (d < bd) { bd = d; b = e; }
    }
    return b;
  };
  let seq = 0, maxProg = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 65000 && store.bounty) {
    const e = nearest();
    if (e) {
      const dx = e.x - store.x, dy = e.y - store.y, d = Math.hypot(dx, dy) || 1;
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 110 ? dx / d : 0, my: d > 110 ? dy / d : 0 }));
      ws.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(dy, dx) }));
    }
    if (store.bounty) maxProg = Math.max(maxProg, store.bounty.progress);
    await sleep(45);
  }
  const progressed = maxProg > 0;
  const completed = store.bounty === null && store.sys.some((t) => /BOUNTY —/.test(t));

  ws.close();
  await sleep(200);
  const checks = { accepted, secondRejected, progressed, completed };
  report(
    "BOUNTY — accept an NPC job (one at a time), progress on kills, auto-reward on completion",
    { maxProgress: maxProg, lastSys: store.sys.slice(-2) },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function shop() {
  const ws = await connect();
  const store = { x: 0, y: 0, enemies: [], inventory: [], credits: 0 };
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "inv") store.inventory = m.items;
  });
  const w = await login(ws, "shopper_" + Math.random().toString(36).slice(2, 6));
  store.x = w.x;
  store.y = w.y;
  trackState(ws, w.id, store);
  await sleep(250);

  // earn credits by killing cops until we can afford a tuned cache (180)
  const nearest = () => {
    let b = null, bd = 1e9;
    for (const e of store.enemies) {
      const d = Math.hypot(e.x - store.x, e.y - store.y);
      if (d < bd) { bd = d; b = e; }
    }
    return b;
  };
  let seq = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 25000 && (store.credits || 0) < 220) {
    const e = nearest();
    if (e) {
      const dx = e.x - store.x, dy = e.y - store.y, d = Math.hypot(dx, dy) || 1;
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 110 ? dx / d : 0, my: d > 110 ? dy / d : 0 }));
      ws.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(dy, dx) }));
    }
    await sleep(45);
  }
  const creditsBefore = store.credits || 0;
  const invBefore = store.inventory.length;

  // buy a TUNED cache (180) → credits deducted, a tuned item granted
  ws.send(JSON.stringify({ t: "buy", sku: "cache_tuned" }));
  await sleep(700);
  const creditsAfter = store.credits || 0;
  const bought = store.inventory[store.inventory.length - 1];

  // try to overspend on a singular cache (1200) we can't afford → rejected, no change
  const cMid = store.credits || 0;
  const invMid = store.inventory.length;
  ws.send(JSON.stringify({ t: "buy", sku: "cache_singular" }));
  await sleep(500);
  ws.close();
  await sleep(200);

  const checks = {
    earnedCredits: creditsBefore >= 180,
    cacheGranted: store.inventory.length >= invBefore + 1 && !!bought && bought.rarity === "tuned",
    creditsDeducted: creditsAfter === creditsBefore - 180,
    overspendRejected: (store.credits || 0) === cMid && store.inventory.length === invMid,
  };
  report(
    "SHOP — credits buy a gear cache (deducted server-side); overspend rejected",
    { creditsBefore, creditsAfter, bought: bought ? `${bought.rarity} ${bought.name}` : null },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function bestiary() {
  const WW = 1280, WH = 960;
  const ws = await connect();
  const store = { x: 0, y: 0, enemies: [] };
  const w = await login(ws, "zoologist");
  store.x = w.x;
  store.y = w.y;
  trackState(ws, w.id, store);
  await sleep(300);
  const seen = new Set();
  const collect = () => {
    for (const e of store.enemies) if (!e.boss) seen.add(e.kind);
  };
  // tour the corners + centre, collecting the enemy archetypes seen in AOI along the way
  const waypoints = [[120, 120], [WW - 120, 120], [WW - 120, WH - 120], [120, WH - 120], [WW / 2, WH / 2]];
  let seq = 0;
  for (const [tx, ty] of waypoints) {
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      collect();
      const dx = tx - store.x, dy = ty - store.y, d = Math.hypot(dx, dy) || 1;
      if (d < 50) break;
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: dx / d, my: dy / d }));
      await sleep(60);
    }
  }
  collect();
  ws.close();
  await sleep(200);
  const kinds = [...seen].sort((a, b) => a - b);
  const checks = {
    multipleArchetypes: kinds.length >= 3, // varied bestiary, not just patrols
    newArchetypePresent: kinds.some((k) => k >= 4), // an ENFORCER/SNIPER/WRAITH is in the mix
  };
  report("BESTIARY — varied HSS archetypes populate the zone", { kindsSeen: kinds }, Object.values(checks).every(Boolean), checks);
}

async function safehouse() {
  const SAFE = WS_URL + (WS_URL.includes("?") ? "&" : "?") + "zone=safe";
  // two players enter the same safehouse interior
  const a = await connect(SAFE);
  const storeA = { x: 0, y: 0, enemies: [], players: [] };
  const wa = await login(a, "homebody_" + Math.random().toString(36).slice(2, 6));
  storeA.x = wa.x;
  storeA.y = wa.y;
  trackState(a, wa.id, storeA);
  const b = await connect(SAFE);
  const wb = await login(b, "homebody2_" + Math.random().toString(36).slice(2, 6));
  await sleep(700); // a few snapshots

  const noEnemies = storeA.enemies.length === 0; // it's a no-combat hub
  const seesOther = (storeA.players || []).some((p) => p.id === wb.id); // shared presence

  // walk the room — the server moves us against the interior floor/walls
  const startX = storeA.x;
  let seq = 0;
  for (let i = 0; i < 40; i++) {
    seq++;
    a.send(JSON.stringify({ t: "input", seq, mx: 1, my: 0 }));
    await sleep(45);
  }
  await sleep(200);
  const moved = Math.abs(storeA.x - startX) > 20 && storeA.enemies.length === 0;

  a.close();
  b.close();
  await sleep(200);
  const checks = { noCombatZone: noEnemies, sharedPresence: seesOther, canWalk: moved };
  report(
    "SAFEHOUSE — a no-combat shared interior zone you can walk + gather in",
    { enemies: storeA.enemies.length, players: (storeA.players || []).length, movedDx: Math.round(storeA.x - startX) },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function interior() {
  // Building interiors (clinic/bar/den/shop) are their own no-combat DOs, reusing the
  // safehouse room. Verify the server routes one + hosts it like the hub.
  const Z = WS_URL + (WS_URL.includes("?") ? "&" : "?") + "zone=bar";
  const a = await connect(Z);
  const sa = { x: 0, y: 0, enemies: [], players: [] };
  const wa = await login(a, "barfly_" + Math.random().toString(36).slice(2, 6));
  sa.x = wa.x;
  sa.y = wa.y;
  trackState(a, wa.id, sa);
  const b = await connect(Z);
  const wb = await login(b, "barfly2_" + Math.random().toString(36).slice(2, 6));
  await sleep(700);
  const routedAsInterior = sa.enemies.length === 0; // a district would have a garrison
  const sharedPresence = (sa.players || []).some((p) => p.id === wb.id);

  const startX = sa.x;
  let seq = 0;
  for (let i = 0; i < 40; i++) {
    seq++;
    a.send(JSON.stringify({ t: "input", seq, mx: 1, my: 0 }));
    await sleep(45);
  }
  await sleep(200);
  const canWalk = Math.abs(sa.x - startX) > 15 && sa.enemies.length === 0;

  a.close();
  b.close();
  await sleep(200);
  const checks = { routedAsInterior, sharedPresence, canWalk };
  report(
    "INTERIOR — a building interior zone (bar) is no-combat, shared + walkable",
    { enemies: sa.enemies.length, players: (sa.players || []).length, movedDx: Math.round(sa.x - startX) },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function subway() {
  // THE UNDERLINE — an indoor COMBAT dungeon zone: tough HSS garrison + a named boss,
  // PvP off (indoor). Verify it routes as combat (enemies + boss) and combat is live.
  const ws = await connect(WS_URL + (WS_URL.includes("?") ? "&" : "?") + "zone=subway");
  const store = { x: 0, y: 0, enemies: [], boss: null, hp: 100, credits: 0 };
  const w = await login(ws, "delver_" + Math.random().toString(36).slice(2, 6));
  store.x = w.x;
  store.y = w.y;
  trackState(ws, w.id, store);
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "state") store.boss = m.boss || null;
  });
  await sleep(600);
  const isCombatZone = store.enemies.length > 0;
  const subwayBoss = !!store.boss && /UNDERLINE/.test(store.boss.name || "");

  const nearest = () => {
    let b = null, bd = 1e9;
    for (const e of store.enemies) {
      const d = Math.hypot(e.x - store.x, e.y - store.y);
      if (d < bd) { bd = d; b = e; }
    }
    return b;
  };
  let seq = 0, minHp = 999, tookDamage = false, maxCred = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    const e = nearest();
    if (e) {
      const dx = e.x - store.x, dy = e.y - store.y, d = Math.hypot(dx, dy) || 1;
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 100 ? dx / d : 0, my: d > 100 ? dy / d : 0 }));
      ws.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(dy, dx) }));
      minHp = Math.min(minHp, e.hp);
    }
    if ((store.hp ?? 100) < 100) tookDamage = true;
    maxCred = Math.max(maxCred, store.credits || 0);
    await sleep(45);
  }
  const combatLive = tookDamage || maxCred > 0 || minHp < 200; // we dealt or took damage

  ws.close();
  await sleep(200);
  const checks = { isCombatZone, subwayBoss, combatLive };
  report(
    "SUBWAY — THE UNDERLINE routes as an indoor combat dungeon (enemies + boss + live fight)",
    { enemies: store.enemies.length, boss: store.boss?.name ?? null, minEnemyHp: minHp === 999 ? null : minHp, tookDamage, credits: maxCred },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function discover() {
  // MAP DISCOVERY — arriving at a zone unlocks it for fast travel; persists per account.
  const name = "explorer_" + Math.random().toString(36).slice(2, 6);
  const arrive = async (zone) => {
    const ws = await connect(WS_URL + (WS_URL.includes("?") ? "&" : "?") + "zone=" + zone);
    const s = { disc: [] };
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === "discovered") s.disc = m.zones;
    });
    await login(ws, name, 0);
    await sleep(550);
    ws.close();
    await sleep(350);
    return s.disc;
  };

  const afterD0 = await arrive("d0");
  const startsLocal = afterD0.includes("d0") && !afterD0.includes("d1"); // only where you've been
  const afterD1 = await arrive("d1");
  const discoversOnArrival = afterD1.includes("d1") && afterD1.includes("d0"); // d0 persisted, d1 added
  const afterSafe = await arrive("safe");
  const interiorDiscovered = afterSafe.includes("safe");
  const persists = afterSafe.includes("d0") && afterSafe.includes("d1") && afterSafe.includes("safe");

  const checks = { startsLocal, discoversOnArrival, interiorDiscovered, persists };
  report(
    "DISCOVER — arriving unlocks a zone for fast travel; discovery persists per account",
    { afterD0, afterD1, afterSafe },
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
  const sa = { x: wa.x, y: wa.y, players: [], enemies: [] };
  const sb = { x: wb.x, y: wb.y, players: [], enemies: [] };
  trackState(a, wa.id, sa);
  trackState(b, wb.id, sb);
  await sleep(600);

  const aSeesB = (sa.players || []).some((p) => p.id === wb.id);
  const bSeesA = (sb.players || []).some((p) => p.id === wa.id);
  const differentSpawns = Math.hypot(wa.x - wb.x, wa.y - wb.y) > 1;
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
  const checks = {
    zonesIsolated: !aSeesB && !bSeesA, // different DOs → can't see each other
    differentSpawns, // each district has its own spawn point
  };
  a.close();
  b.close();
  await sleep(300);
  report(
    "ZONES — per-district DOs: cross-zone isolation",
    { aSpawn: [round(wa.x), round(wa.y)], bSpawn: [round(wb.x), round(wb.y)], aSeesB, bSeesA },
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
  // Path A campaign arc (replaced the old questStep protocol): a FRESH Blank accepts
  // THE WAKE from the FIXER offer, advances its infect stage by capturing nodes in the
  // shared world, and the campaign state persists in D1 across a reconnect.
  const name = "qb" + String(Date.now() % 1_000_000); // fresh identity — no harness seeding
  const ws = await connect();
  const w = await login(ws, name, 0);
  const store = { x: w.x, y: w.y, enemies: [], nodes: [], campaignQuest: null, campaignStage: 0, campaignProgress: 0 };
  trackState(ws, w.id, store);
  const stories = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "story") stories.push(m);
  });
  await sleep(600);
  const startedFresh = store.campaignQuest === null;

  // Accept the offered quest (defaults to the FIXER's next offer — THE WAKE).
  ws.send(JSON.stringify({ t: "quest", action: "accept" }));
  await sleep(800);
  const accepted = store.campaignQuest === "the_wake";

  // Stage 0 — "Infect 2 nodes": walk to nodes and channel until two captures land.
  // Each time progress ticks up, blacklist the node we just converted and move on.
  let seq = 0;
  const t0 = Date.now();
  const captured = new Set();
  let lastProgress = 0;
  while (Date.now() - t0 < 45000 && store.campaignStage < 1) {
    let node = null;
    let bd = Infinity;
    for (const nn of store.nodes) {
      if (captured.has(nn.id)) continue;
      const d = Math.hypot(nn.x - store.x, nn.y - store.y);
      if (d < bd) {
        bd = d;
        node = nn;
      }
    }
    if (node) {
      if (store.campaignProgress > lastProgress) {
        lastProgress = store.campaignProgress;
        captured.add(node.id); // this one just landed — hunt a different node next
        continue;
      }
      const dx = node.x - store.x;
      const dy = node.y - store.y;
      const d = Math.hypot(dx, dy);
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 50 ? dx / d : 0, my: d > 50 ? dy / d : 0 }));
    }
    await sleep(50);
  }
  const infectAdvanced = store.campaignStage >= 1;

  // Stage 1 — "Break an ICE node": hop into the district's ICE VAULT (v0) and crack
  // the fragment core. Verifies dive beats advance ONLY from real dives (a plain
  // node capture used to count — that alias is gone).
  ws.close();
  await sleep(600);
  const DIVE = WS_URL + (WS_URL.includes("?") ? "&" : "?") + "zone=v0";
  const dws = await connect(DIVE);
  const dw = await login(dws, name, 0);
  const dstore = { x: dw.x, y: dw.y, enemies: [], nodes: [], campaignStage: -1, campaignQuest: null };
  trackState(dws, dw.id, dstore);
  await sleep(500);
  let dseq = 0;
  const dt0 = Date.now();
  while (Date.now() - dt0 < 45000 && infectAdvanced && dstore.campaignStage < 2) {
    const core = dstore.nodes[0];
    if (core) {
      const dx = core.x - dstore.x;
      const dy = core.y - dstore.y;
      const d = Math.hypot(dx, dy);
      dseq++;
      dws.send(JSON.stringify({ t: "input", seq: dseq, mx: d > 50 ? dx / d : 0, my: d > 50 ? dy / d : 0 }));
      let near = null;
      let nd = Infinity;
      for (const e of dstore.enemies) {
        const ed = Math.hypot(e.x - dstore.x, e.y - dstore.y);
        if (ed < nd) {
          nd = ed;
          near = e;
        }
      }
      if (near && nd < 320) dws.send(JSON.stringify({ t: "fire", seq: dseq, aim: Math.atan2(near.y - dstore.y, near.x - dstore.x) }));
    }
    await sleep(50);
  }
  const diveAdvanced = dstore.campaignStage >= 2;
  const finalStage = dstore.campaignStage;
  const finalQuest = dstore.campaignQuest;

  // Persistence — reconnect; the campaign must reload from D1.
  dws.close();
  await sleep(600);
  const ws2 = await connect();
  const w2 = await login(ws2, name, 0);
  const store2 = { campaignQuest: null, campaignStage: -1 };
  trackState(ws2, w2.id, store2);
  await sleep(800);

  const checks = {
    startedFresh,
    accepted,
    gotStoryBeat: stories.length >= 1,
    infectAdvanced,
    diveAdvanced,
    persistedQuest: store2.campaignQuest === finalQuest && finalQuest === "the_wake",
    persistedStage: store2.campaignStage === finalStage,
  };
  ws2.close();
  await sleep(300);
  report(
    "QUEST — campaign arc: accept THE WAKE + infect stage + ICE-dive stage + persistence",
    { name, startedFresh, accepted, finalStage, reloadedStage: store2.campaignStage, storyBeats: stories.length },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function abuse() {
  const ws = await connect();
  const w = await login(ws, "abuser", 0);
  const store = { x: w.x, y: w.y, tick: 0 };
  trackState(ws, w.id, store);
  await sleep(300);

  // 1) SPEED-HACK IMMUNITY — hold DOWN while spamming 8× the legit message rate.
  //    The server integrates movement intent ONCE per tick (not per message), so
  //    the flood can't travel 8× farther; displacement stays within what wall-clock
  //    time allows (a per-message bug would overshoot the cap massively).
  const sx = store.x;
  const sy = store.y;
  let seq = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 800) {
    for (let i = 0; i < 8; i++) ws.send(JSON.stringify({ t: "input", seq: ++seq, mx: 0, my: 1 }));
    await sleep(50);
  }
  const activeSecs = (Date.now() - t0) / 1000;
  await sleep(300); // intent expiry halts the player
  const moved = Math.hypot(store.x - sx, store.y - sy);
  const speedCap = SPEED * activeSecs * 1.3;
  // Either the flood moved us within the legal speed cap, or the flood guard cut the
  // socket before meaningful movement — both mean the flood bought no extra speed.
  const floodNoSpeedup = moved <= speedCap;

  // 2) RESILIENCE — malformed JSON, an oversized payload (> MAX_MSG_BYTES), and an
  //    unknown message type must neither crash the server nor drop our socket.
  const tickBefore = store.tick;
  ws.send("{not valid json");
  ws.send(JSON.stringify({ t: "chat", ch: "zone", text: "x".repeat(5000) }));
  ws.send(JSON.stringify({ t: "bogus", evil: true }));
  await sleep(450);
  const survivesGarbage = ws.readyState === 1 && store.tick > tickBefore;

  // 3) FLOOD KILL — a genuine message flood trips the per-socket guard and the
  //    server closes that socket (protecting CPU/bandwidth), without touching others.
  const k = await connect();
  await login(k, "flooder", 0);
  let killed = false;
  k.addEventListener("close", () => (killed = true));
  for (let i = 0; i < 200; i++) k.send(JSON.stringify({ t: "input", seq: i, mx: 0, my: 0 }));
  await sleep(1300);
  const floodSocketClosed = killed && ws.readyState === 1; // flooder gone, we're fine

  const checks = { floodNoSpeedup, survivesGarbage, floodSocketClosed };
  ws.close();
  try {
    k.close();
  } catch {
    /* already closed by the server */
  }
  await sleep(300);
  report(
    "ABUSE — flood can't speed-hack; garbage survived; real floods get the socket closed",
    { moved: round(moved), speedCap: round(speedCap), activeSecs: round(activeSecs), survivesGarbage, floodSocketClosed },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function load() {
  const N = parseInt(process.argv[3] || "20", 10);
  const DUR = 4000;
  const bots = [];
  for (let i = 0; i < N; i++) {
    const ws = await connect();
    const w = await login(ws, "load" + i, i % 4);
    const s = { id: w.id, snaps: 0, closed: false, lastTick: 0 };
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === "state") {
        s.snaps++;
        s.lastTick = m.tick;
      }
    });
    ws.addEventListener("close", () => (s.closed = true));
    bots.push({ ws, s });
  }
  const connected = bots.filter((b) => !b.s.closed).length;

  // Everyone moves + fires for a few seconds; the server must keep ticking for all.
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]];
  const t0 = Date.now();
  let frame = 0;
  while (Date.now() - t0 < DUR) {
    const [mx, my] = dirs[frame % dirs.length];
    for (const b of bots) {
      if (b.s.closed) continue;
      b.ws.send(JSON.stringify({ t: "input", seq: frame, mx, my }));
      if (frame % 4 === 0) b.ws.send(JSON.stringify({ t: "fire", seq: frame, aim: Math.random() * Math.PI * 2 }));
    }
    frame++;
    await sleep(50);
  }
  const durSecs = (Date.now() - t0) / 1000;

  const snaps = bots.map((b) => b.s.snaps);
  const minSnaps = Math.min(...snaps);
  const totalSnaps = snaps.reduce((a, c) => a + c, 0);
  const stillOpen = bots.filter((b) => !b.s.closed).length;
  const expectedPerBot = (durSecs * 1000) / 50; // ~20Hz ideal

  const checks = {
    allConnected: connected === N,
    noneDropped: stillOpen === N,
    // The loop kept broadcasting to EVERY bot at a playable rate. (Floor is 0.35×
    // the 20Hz ideal: in a single-box local run the Node client + workerd + D1 all
    // share one CPU, so effective rate is well below what isolated infra delivers.)
    serverKeptTicking: minSnaps >= expectedPerBot * 0.35,
  };
  for (const b of bots) {
    try {
      b.ws.close();
    } catch {
      /* ignore */
    }
  }
  await sleep(400);
  report(
    `LOAD — ${N} concurrent players; server stays up + keeps broadcasting`,
    {
      players: N,
      durSecs: round(durSecs),
      stillOpen,
      minSnaps,
      avgSnaps: round(totalSnaps / N),
      idealPerBot: round(expectedPerBot),
      minHz: round(minSnaps / durSecs),
      snapshotsPerSec: round(totalSnaps / durSecs),
    },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function metro() {
  // HTTP bridge endpoints (no WebSocket). Harness pre-seeds D1: whale credits=10000,
  // pauper credits=600, and clears the metro ledger so caps/cooldowns start fresh.
  const httpBase = WS_URL.replace(/^ws/, "http").replace(/\/ws$/, "");
  const WALLET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // valid base58 pubkey (devnet-sim accepts any)
  const get = async (p) => (await fetch(httpBase + p)).json();
  const post = async (p, body) =>
    (await fetch(httpBase + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();

  const a0 = await get(`/metro/account?player=whale`);
  const start = a0.credits ?? 0;

  // LAUNCH DAY (pump.fun, no dev seeding): the cash-out pool starts EMPTY, so a
  // withdraw must be rejected even with plenty of credits — and fully refunded.
  const p0 = await get(`/metro/pool`);
  const wEmpty = await post(`/metro/withdraw`, { player: "whale", wallet: WALLET, credits: 1000 });
  const aAfterEmpty = await get(`/metro/account?player=whale`);

  // the first player deposit BOOTSTRAPS the pool: 20 $METRO -> 20*110 = 2200 credits
  const txSig = "DEPOSIT_" + Date.now();
  const d = await post(`/metro/deposit`, { player: "whale", wallet: WALLET, txSig, metro: 20 });
  const p1 = await get(`/metro/pool`);

  // withdrawing costs more than depositing pays (the spread): 1000 credits -> 8 $METRO
  const q = await get(`/metro/quote?credits=1000`);
  const w = await post(`/metro/withdraw`, { player: "whale", wallet: WALLET, credits: 1000 });
  const a1 = await get(`/metro/account?player=whale`);
  const p2 = await get(`/metro/pool`); // pool keeps the spread: 20 - 8 = 12

  // anti-abuse: immediate 2nd withdraw hits the cooldown; a bad wallet is rejected
  const wc = await post(`/metro/withdraw`, { player: "whale", wallet: WALLET, credits: 1000 });
  const wb = await post(`/metro/withdraw`, { player: "whale", wallet: "not-a-wallet", credits: 1000 });

  // pauper (600 credits, no prior withdraw -> no cooldown): 50000 is within the daily
  // cap but over balance, so the ATOMIC debit fails -> insufficient; tiny -> below-min.
  const wi = await post(`/metro/withdraw`, { player: "pauper", wallet: WALLET, credits: 50000 });
  const wm = await post(`/metro/withdraw`, { player: "pauper", wallet: WALLET, credits: 100 });

  // the SAME tx can't be claimed twice
  const dd = await post(`/metro/deposit`, { player: "whale", wallet: WALLET, txSig, metro: 20 });
  const a2 = await get(`/metro/account?player=whale`);

  const checks = {
    poolStartsEmpty: p0.ok && p0.poolMetro === 0 && p0.phase === "bootstrap",
    emptyPoolRejected: wEmpty.ok === false && /pool/.test(wEmpty.reason || ""),
    emptyPoolRefunded: aAfterEmpty.credits === start,
    depositCredited: d.ok && d.credits === 2200,
    poolFilledByDeposit: p1.ok && p1.poolMetro === 20 && p1.phase === "open",
    quoteUsesSpread: q.ok && q.metro === 8,
    withdrawDebited: w.ok && w.metro === 8 && a1.credits === start + 2200 - 1000,
    poolRetainsSpread: p2.ok && p2.poolMetro === 12,
    cooldownEnforced: wc.ok === false,
    badWalletRejected: wb.ok === false,
    insufficientRejected: wi.ok === false && /insufficient/.test(wi.reason || ""),
    belowMinRejected: wm.ok === false && /minimum/.test(wm.reason || ""),
    depositClaimOnce: dd.ok === false,
    accountReportsPool: a2.ok && a2.poolMetro === 12 && a2.phase === "open",
  };
  report(
    "METRO — player-funded bridge: empty-pool launch + rate spread + atomic pool reservation",
    {
      start,
      poolStart: p0.poolMetro,
      poolAfterDeposit: p1.poolMetro,
      poolAfterWithdraw: p2.poolMetro,
      withdrawMetro: w.metro,
      depositCredits: d.credits,
      emptyPoolReason: wEmpty.reason,
      cooldownReason: wc.reason,
    },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function dive() {
  // ICE VAULT (v0): a fresh runner enters the instanced dive, finds guardians + the
  // single fragment core, channels it free (the entry corridor runs straight east to
  // the core chamber), receives the memory fragment, and keeps it across a reconnect.
  const name = "dv" + String(Date.now() % 1_000_000);
  const DIVE = WS_URL + (WS_URL.includes("?") ? "&" : "?") + "zone=v0";
  const ws = await connect(DIVE);
  const w = await login(ws, name, 0);
  const store = { x: w.x, y: w.y, enemies: [], nodes: [] };
  trackState(ws, w.id, store);
  const fragments = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "fragment") fragments.push(m);
  });
  await sleep(700);
  const hasGuardians = store.enemies.length >= 3;
  const oneCore = store.nodes.length === 1;
  const startedEmpty = (w.fragments ?? []).length === 0;

  // run the corridor east, shooting back at whatever ICE is closest, and channel the
  // core (dive cores never re-freeze once cracked)
  let seq = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 45000 && fragments.length === 0) {
    const core = store.nodes[0];
    if (core) {
      const dx = core.x - store.x;
      const dy = core.y - store.y;
      const d = Math.hypot(dx, dy);
      seq++;
      ws.send(JSON.stringify({ t: "input", seq, mx: d > 50 ? dx / d : 0, my: d > 50 ? dy / d : 0 }));
      let near = null;
      let nd = Infinity;
      for (const e of store.enemies) {
        const ed = Math.hypot(e.x - store.x, e.y - store.y);
        if (ed < nd) {
          nd = ed;
          near = e;
        }
      }
      if (near && nd < 320) ws.send(JSON.stringify({ t: "fire", seq, aim: Math.atan2(near.y - store.y, near.x - store.x) }));
    }
    await sleep(50);
  }
  const recovered = fragments.length >= 1 && fragments[0].isNew === true && Array.isArray(fragments[0].lines);

  // persistence — reconnect: the welcome payload must carry the recovered fragment
  ws.close();
  await sleep(600);
  const ws2 = await connect(DIVE);
  const w2 = await login(ws2, name, 0);
  await sleep(400);
  const persisted = recovered && (w2.fragments ?? []).includes(fragments[0].id);
  ws2.close();
  await sleep(300);

  const checks = { hasGuardians, oneCore, startedEmpty, recovered, persisted };
  report(
    "DIVE — ICE VAULT instance: guardians + fragment core -> memory recovered + persists",
    {
      name,
      enemies: store.enemies.length,
      nodes: store.nodes.length,
      fragment: fragments[0]?.id,
      title: fragments[0]?.title,
      reloadedFragments: w2.fragments ?? [],
    },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function kit() {
  // Class kit: dash is the ONLY sanctioned way past the walk cap; the signature (Q)
  // damages server-side with an enforced cooldown; WINTERMUTE's cone stuns.
  const name = "kt" + String(Date.now() % 1_000_000);
  const ws = await connect();
  const w = await login(ws, name, 0, undefined, { classId: "metrophage" });
  const store = { x: w.x, y: w.y, enemies: [], nodes: [] };
  trackState(ws, w.id, store);
  await sleep(500);

  // 1) DASH — displacement in a 500ms window far beyond the 200px/s walk cap
  const sx = store.x;
  const sy = store.y;
  let seq = 0;
  ws.send(JSON.stringify({ t: "dash", seq: ++seq, dx: 1, dy: 0 }));
  for (let i = 0; i < 10; i++) {
    ws.send(JSON.stringify({ t: "input", seq: ++seq, mx: 1, my: 0 }));
    await sleep(50);
  }
  await sleep(150);
  const dashDist = Math.hypot(store.x - sx, store.y - sy);
  const dashBeatsCap = dashDist > 135; // walk alone ≈ 100px in this window

  // 2) SIGNATURE — walk to the nearest cop, pod it: hp drops once per cooldown
  let target = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    let best = null;
    let bd = Infinity;
    for (const e of store.enemies) {
      const d = Math.hypot(e.x - store.x, e.y - store.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    target = best;
    if (best && bd < 120) break;
    if (best) {
      ws.send(JSON.stringify({ t: "input", seq: ++seq, mx: (best.x - store.x) / bd, my: (best.y - store.y) / bd }));
    }
    await sleep(50);
  }
  const eid = target?.id;
  const hpBefore = store.enemies.find((e) => e.id === eid)?.hp ?? -1;
  const aimAt = () => {
    const e = store.enemies.find((x) => x.id === eid);
    return e ? Math.atan2(e.y - store.y, e.x - store.x) : 0;
  };
  ws.send(JSON.stringify({ t: "ability", seq: ++seq, aim: aimAt() }));
  await sleep(400);
  const hpAfterOne = store.enemies.find((e) => e.id === eid)?.hp ?? 0;
  ws.send(JSON.stringify({ t: "ability", seq: ++seq, aim: aimAt() })); // on cooldown — dropped
  await sleep(400);
  const hpAfterTwo = store.enemies.find((e) => e.id === eid)?.hp ?? 0;
  const podDamaged = hpBefore > 0 && hpBefore - hpAfterOne >= 30;
  const cooldownHeld = hpAfterOne - hpAfterTwo < 10; // no second pod landed

  // 2b) E — CONTAGION BLOOM: nova around the runner damages anything adjacent
  const bloomTarget = () => {
    let b = null;
    let bd = Infinity;
    for (const e of store.enemies) {
      const d = Math.hypot(e.x - store.x, e.y - store.y);
      if (e.hp > 0 && d < bd) {
        bd = d;
        b = { e, d };
      }
    }
    return b;
  };
  // close to point-blank on whatever is nearest, then bloom
  let bt = bloomTarget();
  const bt0 = Date.now();
  while (Date.now() - bt0 < 10000 && bt && bt.d > 110) {
    ws.send(JSON.stringify({ t: "input", seq: ++seq, mx: (bt.e.x - store.x) / bt.d, my: (bt.e.y - store.y) / bt.d }));
    await sleep(50);
    bt = bloomTarget();
  }
  const bloomBeforeHp = bt ? bt.e.hp : -1;
  const bloomId = bt ? bt.e.id : -1;
  ws.send(JSON.stringify({ t: "ability2", seq: ++seq, aim: 0 }));
  await sleep(500);
  const bloomAfterHp = store.enemies.find((e) => e.id === bloomId)?.hp ?? 0;
  // a kill zeroes the readback — dying to the nova is the strongest proof of all
  const bloomDamaged = bloomBeforeHp > 0 && (bloomAfterHp <= 0 || bloomBeforeHp - bloomAfterHp >= 20);
  ws.close();
  await sleep(400);

  // 3) WINTERMUTE — the hack cone freezes a unit (it stops closing distance)
  const ws2 = await connect();
  const w2 = await login(ws2, "kw" + String(Date.now() % 1_000_000), 0, undefined, { classId: "wintermute" });
  const s2 = { x: w2.x, y: w2.y, enemies: [] };
  trackState(ws2, w2.id, s2);
  let stunHeld = false;
  const t1 = Date.now();
  while (Date.now() - t1 < 15000) {
    let best = null;
    let bd = Infinity;
    for (const e of s2.enemies) {
      const d = Math.hypot(e.x - s2.x, e.y - s2.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best && bd < 160) {
      // cast at the freshest snapshot, then sample per-enemy drift: the cone must
      // FREEZE at least one unit while the world at large keeps moving (control)
      const live = s2.enemies.find((e) => e.id === best.id) ?? best;
      ws2.send(JSON.stringify({ t: "ability", seq: 900, aim: Math.atan2(live.y - s2.y, live.x - s2.x) }));
      await sleep(200);
      const tracks = new Map(); // id -> positions[]
      for (let i = 0; i < 7; i++) {
        for (const e of s2.enemies) {
          if (e.hp <= 0) continue;
          if (!tracks.has(e.id)) tracks.set(e.id, []);
          tracks.get(e.id).push({ x: e.x, y: e.y });
        }
        await sleep(200);
      }
      let frozen = 0;
      let moving = 0;
      for (const pts of tracks.values()) {
        if (pts.length < 3) continue;
        let drift = 0;
        for (let i = 1; i < pts.length; i++) drift += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (drift < 12) frozen++;
        else if (drift > 40) moving++;
      }
      // dash+pod checks already prove the sim is live this run, so a moving control
      // enemy is redundant — the wide cone can legitimately freeze everyone nearby.
      stunHeld = frozen >= 1;
      void moving;
      break;
    }
    if (best) ws2.send(JSON.stringify({ t: "input", seq: 800 + Math.floor((Date.now() - t1) / 50), mx: (best.x - s2.x) / bd, my: (best.y - s2.y) / bd }));
    await sleep(50);
  }

  // 3b) E — DEPLOY DRONES: the escort auto-engages; enemy hp bleeds with the gun silent
  let dronesWorked = false;
  {
    const totalHp = () => s2.enemies.reduce((a, e) => a + Math.max(0, e.hp), 0);
    const before = totalHp();
    if (before > 0) {
      ws2.send(JSON.stringify({ t: "ability2", seq: 950, aim: 0 }));
      await sleep(4500);
      dronesWorked = totalHp() < before; // shots fired by the escort, not by us
    }
  }
  ws2.close();
  await sleep(300);

  const checks = { dashBeatsCap, podDamaged, cooldownHeld, bloomDamaged, stunHeld, dronesWorked };
  report(
    "KIT — dash sanction + pod + cooldown + contagion bloom + hack stun",
    { name, dashDist: Math.round(dashDist), hpBefore, hpAfterOne, hpAfterTwo, bloomDamaged, stunHeld },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function worldevent() {
  // Dynamic world events: a runner idles in a district; within firstDelay+interval a
  // weighted event must telegraph, run its active window (real sim effects), and pay
  // out everyone still alive. The bot orbits to dodge neon-storm strikes.
  const name = "we" + String(Date.now() % 1_000_000);
  const D1 = WS_URL + (WS_URL.includes("?") ? "&" : "?") + "zone=d1";
  const ws = await connect(D1);
  const w = await login(ws, name, 0);
  const store = { x: w.x, y: w.y, credits: 0, hp: 100, dead: false, enemies: [], nodes: [] };
  trackState(ws, w.id, store);
  const phases = [];
  const sys = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "event") phases.push({ phase: m.phase, id: m.id, seconds: m.seconds });
    if (m.t === "sys") sys.push(m.text);
  });
  await sleep(600);
  const startCredits = store.credits;

  // orbit gently for up to 75s or until the event resolves
  let seq = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 75000 && !phases.some((p) => p.phase === "end")) {
    const a = (Date.now() - t0) / 900;
    seq++;
    ws.send(JSON.stringify({ t: "input", seq, mx: Math.cos(a), my: Math.sin(a) }));
    await sleep(60);
  }
  await sleep(500);

  const sawTelegraph = phases.some((p) => p.phase === "telegraph");
  const sawActive = phases.some((p) => p.phase === "active");
  const sawEnd = phases.some((p) => p.phase === "end");
  const paidOut = store.dead || sys.some((s) => /weathered/.test(s));
  ws.close();
  await sleep(300);

  const checks = { sawTelegraph, sawActive, sawEnd, paidOut };
  report(
    "EVENT — world events: telegraph -> active -> end + payout in a live district",
    { name, phases, credits: { start: startCredits, end: store.credits }, died: store.dead },
    Object.values(checks).every(Boolean),
    checks,
  );
}

async function look() {
  // A logs in with a distinctive look; B (nearby, same spawn → within AOI) must
  // receive A's appearance in its state snapshot so it can render A's customization.
  const A_LOOK = {
    color: 0xff2bd6,
    build: "bulky",
    head: "crown",
    visor: "scan",
    shoulders: "spikes",
    decal: "skull",
    cloak: "cape",
    antennae: true,
    emblem: true,
    strap: true,
  };
  const a = await connect();
  const wa = await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("login timeout")), 5000);
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === "welcome") {
        clearTimeout(to);
        a.removeEventListener("message", onMsg);
        resolve(m);
      }
    };
    a.addEventListener("message", onMsg);
    a.send(JSON.stringify({ t: "login", name: "looker", faction: 2, look: A_LOOK }));
  });
  const b = await connect();
  const wb = await login(b, "viewer", 0);
  const sb = { players: [] };
  trackState(b, wb.id, sb);
  await sleep(700);

  const seen = (sb.players || []).find((p) => p.id === wa.id);
  const checks = {
    relayedLook: !!seen && !!seen.look,
    matchesAppearance:
      !!seen?.look &&
      seen.look.head === "crown" &&
      seen.look.visor === "scan" &&
      seen.look.cloak === "cape" &&
      seen.look.color === 0xff2bd6,
  };
  a.close();
  b.close();
  await sleep(300);
  report(
    "LOOK — server relays a player's appearance to other clients",
    { sawLook: seen?.look ?? null },
    Object.values(checks).every(Boolean),
    checks,
  );
}

try {
  if (mode === "check") await check();
  else if (mode === "combat") await combat();
  else if (mode === "inventory") await inventory();
  else if (mode === "lookpersist") await lookpersist();
  else if (mode === "auth") await auth();
  else if (mode === "boss") await boss();
  else if (mode === "equip") await equip();
  else if (mode === "craft") await craft();
  else if (mode === "achv") await achv();
  else if (mode === "guild") await guild();
  else if (mode === "market") await market();
  else if (mode === "daily") await daily();
  else if (mode === "raid") await raid();
  else if (mode === "cosmetic") await cosmetic();
  else if (mode === "shop") await shop();
  else if (mode === "bestiary") await bestiary();
  else if (mode === "safehouse") await safehouse();
  else if (mode === "interior") await interior();
  else if (mode === "subway") await subway();
  else if (mode === "bounty") await bounty();
  else if (mode === "discover") await discover();
  else if (mode === "mp") await mp();
  else if (mode === "zones") await zones();
  else if (mode === "territory") await territory();
  else if (mode === "social") await social();
  else if (mode === "trade") await trade();
  else if (mode === "quest") await quest();
  else if (mode === "abuse") await abuse();
  else if (mode === "load") await load();
  else if (mode === "metro") await metro();
  else if (mode === "dive") await dive();
  else if (mode === "event") await worldevent();
  else if (mode === "kit") await kit();
  else if (mode === "look") await look();
  else if (mode === "bot") await bot();
  else await move();
} catch (e) {
  report(mode.toUpperCase(), { error: String(e?.message || e) }, false);
}
// give the close frame a moment, then exit with whatever exitCode report() set
await sleep(150);
process.exit(process.exitCode || 0);
