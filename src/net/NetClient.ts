import { stepMove, NET_TICK_MS, type MoveState } from "./sim";
import type { TileGrid } from "../world/district";
import type { ClientMsg, ServerMsg, InputCmd } from "./protocol";

export interface RemotePlayer {
  id: string;
  x: number; // rendered (interpolated) position
  y: number;
  tx: number; // latest authoritative target
  ty: number;
}

export interface NetStats {
  connected: boolean;
  id: string;
  ack: number;
  pending: number;
  serverX: number;
  serverY: number;
  predX: number;
  predY: number;
  error: number; // last reconciliation correction (px)
  reconciles: number;
  players: number;
}

/**
 * Client netcode for the local player. Runs the SAME deterministic sim the server
 * runs (../net/sim), so we can:
 *   - predict: apply local input immediately for zero-latency movement,
 *   - reconcile: when a server snapshot arrives, snap to the authoritative position
 *     and re-apply the inputs the server hasn't acked yet.
 * Remote players are interpolated toward their latest authoritative position.
 */
export default class NetClient {
  id = "";
  connected = false;
  pred: MoveState = { x: 0, y: 0 }; // predicted local position (what we render)
  serverPos: MoveState = { x: 0, y: 0 };
  remotes = new Map<string, RemotePlayer>();
  lastError = 0;
  reconciles = 0;
  lastAck = 0;
  playersOnline = 0;
  onWelcome?: (x: number, y: number) => void;

  private ws?: WebSocket;
  private intent = { mx: 0, my: 0 };
  private seq = 0;
  private pending: InputCmd[] = [];
  private acc = 0;

  constructor(
    private grid: TileGrid,
    private name: string,
    private url: string,
  ) {}

  connect() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: "login", name: this.name } satisfies ClientMsg));
    ws.onmessage = (e) => this.onMessage(e.data);
    ws.onclose = () => (this.connected = false);
    ws.onerror = () => (this.connected = false);
  }

  disconnect() {
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
  }

  /** Set the local movement intent (called every render frame by the scene). */
  setIntent(mx: number, my: number) {
    this.intent.mx = mx;
    this.intent.my = my;
  }

  /** Drive fixed-rate net ticks from the (variable-rate) render loop. */
  update(dtMs: number) {
    if (!this.connected) return;
    this.acc = Math.min(this.acc + dtMs, NET_TICK_MS * 5); // cap to avoid spiral of death
    while (this.acc >= NET_TICK_MS) {
      this.acc -= NET_TICK_MS;
      this.netTick();
    }
    // smooth remotes toward their latest authoritative target
    for (const r of this.remotes.values()) {
      r.x += (r.tx - r.x) * 0.3;
      r.y += (r.ty - r.y) * 0.3;
    }
  }

  private netTick() {
    this.seq++;
    const cmd: InputCmd = { seq: this.seq, mx: this.intent.mx, my: this.intent.my };
    stepMove(this.pred, cmd, this.grid, NET_TICK_MS); // predict immediately
    this.pending.push(cmd);
    try {
      this.ws?.send(JSON.stringify({ t: "input", ...cmd } satisfies ClientMsg));
    } catch {
      /* socket hiccup; reconciliation will correct */
    }
  }

  private onMessage(data: unknown) {
    let msg: ServerMsg;
    try {
      msg = JSON.parse(typeof data === "string" ? data : "{}") as ServerMsg;
    } catch {
      return;
    }
    if (msg.t === "welcome") {
      this.id = msg.id;
      this.connected = true;
      this.pred = { x: msg.x, y: msg.y };
      this.serverPos = { x: msg.x, y: msg.y };
      this.onWelcome?.(msg.x, msg.y);
    } else if (msg.t === "state") {
      this.playersOnline = msg.players.length;
      const live = new Set<string>();
      for (const sp of msg.players) {
        live.add(sp.id);
        if (sp.id === this.id) {
          this.reconcile(sp.x, sp.y, sp.ack);
        } else {
          const r = this.remotes.get(sp.id) ?? { id: sp.id, x: sp.x, y: sp.y, tx: sp.x, ty: sp.y };
          r.tx = sp.x;
          r.ty = sp.y;
          this.remotes.set(sp.id, r);
        }
      }
      for (const id of [...this.remotes.keys()]) if (!live.has(id)) this.remotes.delete(id);
    }
  }

  /** Snap to the authoritative position and replay still-unacked inputs. */
  private reconcile(sx: number, sy: number, ack: number) {
    this.serverPos = { x: sx, y: sy };
    this.lastAck = ack;
    this.pending = this.pending.filter((c) => c.seq > ack);
    const prevX = this.pred.x;
    const prevY = this.pred.y;
    this.pred.x = sx;
    this.pred.y = sy;
    for (const c of this.pending) stepMove(this.pred, c, this.grid, NET_TICK_MS);
    this.lastError = Math.hypot(this.pred.x - prevX, this.pred.y - prevY);
    if (this.lastError > 0.01) this.reconciles++;
  }

  stats(): NetStats {
    return {
      connected: this.connected,
      id: this.id,
      ack: this.lastAck,
      pending: this.pending.length,
      serverX: this.serverPos.x,
      serverY: this.serverPos.y,
      predX: this.pred.x,
      predY: this.pred.y,
      error: this.lastError,
      reconciles: this.reconciles,
      players: this.playersOnline,
    };
  }
}
