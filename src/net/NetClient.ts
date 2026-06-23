import { stepMove, NET_TICK_MS, PLAYER_HP, type MoveState } from "./sim";
import type { TileGrid } from "../world/district";
import type { ClientMsg, ServerMsg, InputCmd } from "./protocol";

export interface RemotePlayer {
  id: string;
  x: number; // rendered (interpolated) position
  y: number;
  tx: number; // latest authoritative target
  ty: number;
  hp: number;
  dead: boolean;
}

export interface NetEnemy {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  hp: number;
}

export interface NetShot {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  team: 0 | 1;
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
  enemies = new Map<number, NetEnemy>();
  shots = new Map<number, NetShot>();
  hp = PLAYER_HP;
  dead = false;
  credits = 0;
  level = 1;
  xp = 0;
  singularity = 0;
  meltdown = false;
  pickups = new Map<number, { id: number; x: number; y: number; kind: number }>();
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
    // smooth remotes / enemies toward their latest authoritative target
    for (const r of this.remotes.values()) {
      r.x += (r.tx - r.x) * 0.3;
      r.y += (r.ty - r.y) * 0.3;
    }
    for (const e of this.enemies.values()) {
      e.x += (e.tx - e.x) * 0.3;
      e.y += (e.ty - e.y) * 0.3;
    }
    for (const s of this.shots.values()) {
      s.x += (s.tx - s.x) * 0.6; // shots move fast — track closely
      s.y += (s.ty - s.y) * 0.6;
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
          this.hp = sp.hp;
          this.dead = sp.dead;
          this.credits = sp.credits;
          this.xp = sp.xp;
          this.level = sp.level;
        } else {
          const r = this.remotes.get(sp.id) ?? {
            id: sp.id,
            x: sp.x,
            y: sp.y,
            tx: sp.x,
            ty: sp.y,
            hp: sp.hp,
            dead: sp.dead,
          };
          r.tx = sp.x;
          r.ty = sp.y;
          r.hp = sp.hp;
          r.dead = sp.dead;
          this.remotes.set(sp.id, r);
        }
      }
      for (const id of [...this.remotes.keys()]) if (!live.has(id)) this.remotes.delete(id);

      const liveE = new Set<number>();
      for (const e of msg.enemies) {
        liveE.add(e.id);
        const ne = this.enemies.get(e.id) ?? { id: e.id, x: e.x, y: e.y, tx: e.x, ty: e.y, hp: e.hp };
        ne.tx = e.x;
        ne.ty = e.y;
        ne.hp = e.hp;
        this.enemies.set(e.id, ne);
      }
      for (const id of [...this.enemies.keys()]) if (!liveE.has(id)) this.enemies.delete(id);

      const liveS = new Set<number>();
      for (const sh of msg.shots) {
        liveS.add(sh.id);
        const ns = this.shots.get(sh.id) ?? { id: sh.id, x: sh.x, y: sh.y, tx: sh.x, ty: sh.y, team: sh.team };
        ns.tx = sh.x;
        ns.ty = sh.y;
        this.shots.set(sh.id, ns);
      }
      for (const id of [...this.shots.keys()]) if (!liveS.has(id)) this.shots.delete(id);

      const liveP = new Set<number>();
      for (const pu of msg.pickups) {
        liveP.add(pu.id);
        this.pickups.set(pu.id, pu);
      }
      for (const id of [...this.pickups.keys()]) if (!liveP.has(id)) this.pickups.delete(id);
      this.singularity = msg.sing;
      this.meltdown = msg.meltdown;
    }
  }

  /** Send a fire intent (aim in radians). The server validates rate + resolves hits. */
  fire(aim: number) {
    if (!this.connected || this.dead) return;
    try {
      this.ws?.send(JSON.stringify({ t: "fire", seq: this.seq, aim } satisfies ClientMsg));
    } catch {
      /* socket hiccup */
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
