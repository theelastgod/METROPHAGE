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

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
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

function login(ws, name) {
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
    ws.send(JSON.stringify({ t: "login", name }));
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
        store.tick = m.tick;
      }
      store.enemies = m.enemies || [];
      store.shots = m.shots || [];
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
  let minEnemyHp = 999;
  let maxCredits = 0;
  let sawPlayerShot = false;
  let tookDamage = false;
  let seq = 0;
  const t0 = Date.now();
  // Chase the nearest cop and shoot it; the SERVER resolves every hit.
  while (Date.now() - t0 < 6000) {
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
    maxCredits = Math.max(maxCredits, store.credits || 0);
    if ((store.hp ?? 100) < 100) tookDamage = true;
    await sleep(50);
  }

  const checks = {
    enemiesSimulated: startEnemies > 0,
    playerShotsSpawned: sawPlayerShot,
    serverResolvedHit: minEnemyHp < 75 || maxCredits > 0, // cop damaged, or a kill paid out
  };
  ws.close();
  await sleep(300);
  report(
    "COMBAT — server simulates enemies + resolves hits + awards credits",
    { startEnemies, minEnemyHp: minEnemyHp === 999 ? null : round(minEnemyHp), credits: maxCredits, tookEnemyDamage: tookDamage },
    Object.values(checks).every(Boolean),
    checks,
  );
}

try {
  if (mode === "check") await check();
  else if (mode === "combat") await combat();
  else await move();
} catch (e) {
  report(mode.toUpperCase(), { error: String(e?.message || e) }, false);
}
// give the close frame a moment, then exit with whatever exitCode report() set
await sleep(150);
process.exit(process.exitCode || 0);
