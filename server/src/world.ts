import {
  TICK_MS,
  MOVE_SPEED,
  WORLD,
  SPAWN,
  PERSIST_EVERY_TICKS,
  INTENT_EXPIRE_TICKS,
  clampUnit,
  clamp,
  round2,
  type ClientMsg,
} from "./protocol";

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
  lastInputTick: number; // tick of the most recent input (for intent expiry)
  ack: number; // last processed input seq (for client reconciliation)
  dirty: boolean; // moved since last persist
}

/**
 * WorldDO — the authoritative simulation for one zone. It owns the truth: clients
 * submit movement *intent*, the DO integrates it at a fixed tick/speed, clamps to
 * world bounds, and broadcasts snapshots. Player positions persist to D1 so state
 * survives the DO being evicted or the server restarting.
 *
 * NOTE (Step 7 hardening): this uses an in-memory setInterval tick + non-hibernated
 * sockets — fine for the spike with a live connection. Production should move to
 * the WebSocket Hibernation API + alarms so idle zones cost nothing.
 */
export class WorldDO {
  private sessions = new Map<WebSocket, string>(); // ws -> playerId
  private players = new Map<string, PlayerState>();
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    _state: DurableObjectState,
    private env: Env,
  ) {}

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

    // Durable source of truth: load the persisted position, or seed a new one.
    let x = SPAWN.x;
    let y = SPAWN.y;
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
      tickMs: TICK_MS,
      speed: MOVE_SPEED,
      world: WORLD,
    });
    this.ensureTick();
  }

  private onInput(ws: WebSocket, msg: Extract<ClientMsg, { t: "input" }>) {
    const id = this.sessions.get(ws);
    if (!id) return;
    const p = this.players.get(id);
    if (!p) return;
    // AUTHORITY: accept only intent, clamped to a unit vector. A client that lies
    // (mx=999, or a teleport) cannot move faster or jump — it doesn't send position.
    p.mx = clampUnit(msg.mx);
    p.my = clampUnit(msg.my);
    p.lastInputTick = this.tick;
    if (Number.isFinite(msg.seq)) p.ack = Math.max(p.ack, msg.seq | 0);
  }

  private ensureTick() {
    if (!this.timer) this.timer = setInterval(() => this.step(), TICK_MS);
  }

  private step() {
    const dt = TICK_MS / 1000;
    for (const p of this.players.values()) {
      // expire stale intent so a lost "stop" packet (or a disconnect) can't slide
      // a player forever — movement only continues while inputs keep arriving.
      if (this.tick - p.lastInputTick > INTENT_EXPIRE_TICKS) {
        p.mx = 0;
        p.my = 0;
      }
      if (p.mx !== 0 || p.my !== 0) {
        const len = Math.hypot(p.mx, p.my) || 1; // normalize diagonals
        p.x = clamp(p.x + (p.mx / len) * MOVE_SPEED * dt, 0, WORLD.w);
        p.y = clamp(p.y + (p.my / len) * MOVE_SPEED * dt, 0, WORLD.h);
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
