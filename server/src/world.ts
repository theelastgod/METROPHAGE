// Shared game model + sim (single source of truth, imported from the client repo —
// these modules are Phaser-free and deterministic).
import { NET_TICK_MS, type ClientMsg } from "../../src/net/protocol";
import { stepMove, WORLD_W, WORLD_H } from "../../src/net/sim";
import { buildGrid, spawnPoint, type TileGrid } from "../../src/world/district";
import { DISTRICTS } from "../../src/game/districts";

// Server-only tuning.
const PERSIST_EVERY_TICKS = 40; // ~2s snapshot cadence
const INTENT_EXPIRE_TICKS = 3; // clear intent if no fresh input in ~150ms
const round2 = (n: number) => Math.round(n * 100) / 100;
const clampUnit = (n: number) => (n > 1 ? 1 : n < -1 ? -1 : Number.isFinite(n) ? n : 0);

export interface Env {
  WORLD: DurableObjectNamespace;
  DB: D1Database;
}

interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  mx: number; // latest input intent on X (-1..1)
  my: number; // latest input intent on Y (-1..1)
  lastInputTick: number;
  ack: number; // last processed input seq (drives client reconciliation)
  dirty: boolean;
}

/**
 * WorldDO — the authoritative simulation for one zone. Source of truth: clients
 * submit movement *intent*, the DO integrates it through the SHARED sim (the exact
 * code the client predicts with) against the district's wall grid, then broadcasts
 * snapshots. Positions persist to D1 so state survives eviction / a server restart.
 *
 * Step 1 proved the loop with bounds-only movement; Step 2 swaps in the real
 * deterministic sim + collision so the client can predict and reconcile cleanly.
 *
 * NOTE (Step 7 hardening): in-memory setInterval tick + non-hibernated sockets —
 * fine for the spike with a live connection; production should use the WebSocket
 * Hibernation API + alarms so idle zones cost nothing.
 */
export class WorldDO {
  private sessions = new Map<WebSocket, string>();
  private players = new Map<string, PlayerState>();
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private grid: TileGrid;
  private spawn: { x: number; y: number };

  constructor(
    _state: DurableObjectState,
    private env: Env,
  ) {
    // One zone for the spike (DISTRICTS[0]); per-district zones land in Step 3.
    this.grid = buildGrid(DISTRICTS[0]);
    this.spawn = spawnPoint(this.grid, DISTRICTS[0]);
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    server.addEventListener("message", (ev) => void this.onMessage(server, ev));
    server.addEventListener("close", () => void this.onClose(server));
    server.addEventListener("error", () => void this.onClose(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  private send(ws: WebSocket, msg: unknown) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket gone */
    }
  }

  private async onMessage(ws: WebSocket, ev: MessageEvent) {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof ev.data === "string" ? ev.data : "{}") as ClientMsg;
    } catch {
      return;
    }
    if (msg.t === "login") return this.onLogin(ws, msg.name);
    if (msg.t === "input") return this.onInput(ws, msg);
  }

  private async onLogin(ws: WebSocket, rawName: string) {
    const name = (rawName || "").trim().slice(0, 16) || "blank";
    const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "blank";

    // Durable source of truth: load the persisted position, or seed at the spawn.
    let x = this.spawn.x;
    let y = this.spawn.y;
    const row = await this.env.DB.prepare("SELECT x, y FROM players WHERE id = ?")
      .bind(id)
      .first<{ x: number; y: number }>();
    if (row) {
      x = row.x;
      y = row.y;
    } else {
      await this.upsert(id, name, x, y);
    }

    const p: PlayerState = { id, name, x, y, mx: 0, my: 0, lastInputTick: this.tick, ack: 0, dirty: false };
    this.players.set(id, p);
    this.sessions.set(ws, id);
    this.send(ws, {
      t: "welcome",
      id,
      x: round2(x),
      y: round2(y),
      tickMs: NET_TICK_MS,
      world: { w: WORLD_W, h: WORLD_H },
    });
    this.ensureTick();
  }

  private onInput(ws: WebSocket, msg: Extract<ClientMsg, { t: "input" }>) {
    const id = this.sessions.get(ws);
    if (!id) return;
    const p = this.players.get(id);
    if (!p) return;
    // AUTHORITY: accept only intent, clamped to a unit vector. A lying client
    // (mx=999 / a teleport) cannot move faster or jump — it never sends a position.
    p.mx = clampUnit(msg.mx);
    p.my = clampUnit(msg.my);
    p.lastInputTick = this.tick;
    if (Number.isFinite(msg.seq)) p.ack = Math.max(p.ack, msg.seq | 0);
  }

  private ensureTick() {
    if (!this.timer) this.timer = setInterval(() => this.step(), NET_TICK_MS);
  }

  private step() {
    for (const p of this.players.values()) {
      // expire stale intent so a lost "stop" packet can't slide a player forever
      if (this.tick - p.lastInputTick > INTENT_EXPIRE_TICKS) {
        p.mx = 0;
        p.my = 0;
      }
      if (p.mx !== 0 || p.my !== 0) {
        stepMove(p, { mx: p.mx, my: p.my }, this.grid, NET_TICK_MS); // mutates p.x/p.y
        p.dirty = true;
      }
    }

    const players = [...this.players.values()].map((p) => ({
      id: p.id,
      x: round2(p.x),
      y: round2(p.y),
      ack: p.ack,
    }));
    const snapshot = JSON.stringify({ t: "state", tick: this.tick, players });
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(snapshot);
      } catch {
        /* dropped */
      }
    }
    this.tick++;
    if (this.tick % PERSIST_EVERY_TICKS === 0) void this.persistDirty();
    if (this.sessions.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async persistDirty() {
    for (const p of this.players.values()) {
      if (!p.dirty) continue;
      p.dirty = false;
      await this.upsert(p.id, p.name, p.x, p.y);
    }
  }

  private async upsert(id: string, name: string, x: number, y: number) {
    try {
      await this.env.DB.prepare(
        "INSERT INTO players (id, name, x, y, zone, updated_at) VALUES (?,?,?,?,?,?) " +
          "ON CONFLICT(id) DO UPDATE SET x=excluded.x, y=excluded.y, updated_at=excluded.updated_at",
      )
        .bind(id, name, round2(x), round2(y), "world", Date.now())
        .run();
    } catch {
      /* D1 hiccup — next snapshot retries */
    }
  }

  private async onClose(ws: WebSocket) {
    const id = this.sessions.get(ws);
    this.sessions.delete(ws);
    if (!id) return;
    const p = this.players.get(id);
    if (p) {
      await this.upsert(p.id, p.name, p.x, p.y); // flush on disconnect
      this.players.delete(id);
    }
  }
}
