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

  const checks = { haveItem, listed, sawListing, bought, doubleBuyRejected, sellerPaidViaMailbox, cancelled };
  report(
    "MARKET — escrow list, atomic buy, no double-buy, offline payout via mailbox, cancel",
    { listingId, soldFor: 500, sellerCredits: ss2.credits, buyerCredits: sb.credits },
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
  while (Date.now() - t0 < 55000 && !(store.contracts[0] && store.contracts[0].done)) {
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
  const floodNoSpeedup = moved > 5 && moved <= speedCap;

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
  const q = await get(`/metro/quote?credits=1000`);

  // happy path: 1000 credits -> 10 $METRO (scarce token), credits debited atomically
  const w = await post(`/metro/withdraw`, { player: "whale", wallet: WALLET, credits: 1000 });
  const a1 = await get(`/metro/account?player=whale`);

  // anti-abuse: immediate 2nd withdraw hits the cooldown; a bad wallet is rejected
  const wc = await post(`/metro/withdraw`, { player: "whale", wallet: WALLET, credits: 1000 });
  const wb = await post(`/metro/withdraw`, { player: "whale", wallet: "not-a-wallet", credits: 1000 });

  // pauper (600 credits, no prior withdraw -> no cooldown): 50000 is within the daily
  // cap but over balance, so the ATOMIC debit fails -> insufficient; tiny -> below-min.
  const wi = await post(`/metro/withdraw`, { player: "pauper", wallet: WALLET, credits: 50000 });
  const wm = await post(`/metro/withdraw`, { player: "pauper", wallet: WALLET, credits: 100 });

  // deposit: claim 5 $METRO -> +500 credits; the SAME tx can't be claimed twice
  const txSig = "DEPOSIT_" + Date.now();
  const d = await post(`/metro/deposit`, { player: "whale", wallet: WALLET, txSig, metro: 5 });
  const dd = await post(`/metro/deposit`, { player: "whale", wallet: WALLET, txSig, metro: 5 });
  const a2 = await get(`/metro/account?player=whale`);

  const checks = {
    quoteCorrect: q.ok && q.metro === 10,
    withdrawDebited: w.ok && w.metro === 10 && a1.credits === start - 1000,
    cooldownEnforced: wc.ok === false,
    badWalletRejected: wb.ok === false,
    insufficientRejected: wi.ok === false && /insufficient/.test(wi.reason || ""),
    belowMinRejected: wm.ok === false && /minimum/.test(wm.reason || ""),
    depositCredited: d.ok && d.credits === 500 && a2.credits === start - 1000 + 500,
    depositClaimOnce: dd.ok === false,
  };
  report(
    "METRO — custodial bridge: atomic withdraw + caps/cooldown + claim-once deposit",
    {
      start,
      afterWithdraw: a1.credits,
      afterDeposit: a2.credits,
      withdrawMetro: w.metro,
      depositCredits: d.credits,
      cooldownReason: wc.reason,
      insufficientReason: wi.reason,
    },
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
  else if (mode === "shop") await shop();
  else if (mode === "bestiary") await bestiary();
  else if (mode === "safehouse") await safehouse();
  else if (mode === "mp") await mp();
  else if (mode === "zones") await zones();
  else if (mode === "territory") await territory();
  else if (mode === "meltdown") await meltdown();
  else if (mode === "social") await social();
  else if (mode === "trade") await trade();
  else if (mode === "quest") await quest();
  else if (mode === "abuse") await abuse();
  else if (mode === "load") await load();
  else if (mode === "metro") await metro();
  else if (mode === "look") await look();
  else if (mode === "bot") await bot();
  else await move();
} catch (e) {
  report(mode.toUpperCase(), { error: String(e?.message || e) }, false);
}
// give the close frame a moment, then exit with whatever exitCode report() set
await sleep(150);
process.exit(process.exitCode || 0);
