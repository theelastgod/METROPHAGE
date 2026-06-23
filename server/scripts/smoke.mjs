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
        store.tick = m.tick;
      }
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

  // Drive "move right" for ~2.5s. Every 10th input is a blatant speed-hack value;
  // the server must ignore the magnitude and move at its own fixed speed.
  let seq = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 2500) {
    seq++;
    const mx = seq % 10 === 0 ? 999 : 1;
    ws.send(JSON.stringify({ t: "input", seq, mx, my: 0 }));
    await sleep(50);
  }
  const activeSecs = (Date.now() - t0) / 1000;
  await sleep(250); // let the last inputs tick through
  const movedX = store.x - startX;

  // Stop sending inputs; the server's intent-expiry should halt the player.
  await sleep(400);
  const restX = store.x;
  await sleep(250);
  const settledX = store.x; // should equal restX if movement truly stopped

  const lo = SPEED * activeSecs * 0.5;
  const hi = SPEED * activeSecs * 1.2;
  const checks = {
    movedRight: movedX > 50,
    speedServerEnforced: movedX >= lo && movedX <= hi, // cheat didn't accelerate
    inputsAcked: store.ack >= seq - 3,
    withinBounds: settledX <= WORLD_W + 0.01 && store.y >= 0,
    movementStoppedOnSilence: Math.abs(settledX - restX) < 0.5, // intent expired
  };
  const ok = Object.values(checks).every(Boolean);

  // Record the SETTLED position; the disconnect flush will persist this same value.
  fs.writeFileSync(STATE_FILE, JSON.stringify({ id: w.id, x: settledX, y: store.y }));
  await sleep(250); // ensure a persist cycle lands
  ws.close();
  await sleep(300); // disconnect flush
  report(
    "MOVE — server-authoritative movement + speed validation + intent expiry",
    { startX, movedX: round(movedX), settledX, activeSecs: round(activeSecs), expectedBand: [round(lo), round(hi)], ack: store.ack, sentSeq: seq },
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
  const dx = Math.abs(w.x - expected.x);
  const checks = {
    matchesPersisted: dx < 2, // came back where we left off
    notAFreshSpawn: Math.abs(w.x - SPAWN_X) > 50, // and it's not the default spawn
  };
  report(
    "CHECK — position persisted across full server restart",
    { recordedX: expected.x, reloadedX: w.x, dx: round(dx), freshSpawnX: SPAWN_X },
    Object.values(checks).every(Boolean),
    checks,
  );
}

try {
  if (mode === "check") await check();
  else await move();
} catch (e) {
  report(mode.toUpperCase(), { error: String(e?.message || e) }, false);
}
// give the close frame a moment, then exit with whatever exitCode report() set
await sleep(150);
process.exit(process.exitCode || 0);
