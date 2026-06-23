// Shared game model + sim (single source of truth, imported from the client repo —
// these modules are Phaser-free and deterministic).
import { NET_TICK_MS, type ClientMsg } from "../../src/net/protocol";
import {
  stepMove,
  tileIsWall,
  dist2,
  segPointDist2,
  WORLD_W,
  WORLD_H,
  PLAYER_HP,
  COP_HP,
  PLAYER_DMG,
  ENEMY_DMG,
  PLAYER_FIRE_MS,
  COP_FIRE_MS,
  PROJ_SPEED,
  ENEMY_PROJ_SPEED,
  PROJ_TTL_MS,
  ENEMY_PROJ_TTL_MS,
  PROJ_HIT_RADIUS,
  ENEMY_SPEED,
  ENEMY_AGGRO,
  ENEMY_FIRE_RANGE,
  RESPAWN_MS,
  XP_PER_KILL,
  levelForXp,
  CREDITS_PER_KILL,
  LOOT_DROP_CHANCE,
  PICKUP_RADIUS,
  PICKUP_TTL_MS,
  PICKUP_CREDIT,
  PICKUP_CORE,
  SING_PER_KILL,
  SING_MAX,
} from "../../src/net/sim";
import { buildGrid, spawnPoint, isWall, type TileGrid } from "../../src/world/district";
import { DISTRICTS } from "../../src/game/districts";
import { TILE } from "../../src/config";

// Server-only tuning.
const PERSIST_EVERY_TICKS = 40; // ~2s snapshot cadence
const INTENT_EXPIRE_TICKS = 3;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clampUnit = (n: number) => (n > 1 ? 1 : n < -1 ? -1 : Number.isFinite(n) ? n : 0);
const ticks = (ms: number) => Math.ceil(ms / NET_TICK_MS);

export interface Env {
  WORLD: DurableObjectNamespace;
  DB: D1Database;
}

interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  mx: number;
  my: number;
  lastInputTick: number;
  ack: number;
  dirty: boolean;
  // combat
  hp: number;
  dead: boolean;
  respawnTick: number;
  credits: number;
  aim: number;
  lastFireTick: number;
  // progression
  xp: number;
  level: number;
}

interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: number; // PICKUP_CREDIT | PICKUP_CORE
  dieTick: number;
}

interface Enemy {
  id: number;
  x: number;
  y: number;
  ox: number; // origin (respawn) position
  oy: number;
  hp: number;
  respawnTick: number;
  lastFireTick: number;
}

interface Shot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dieTick: number;
  team: 0 | 1; // 0 = player shot, 1 = enemy shot
  owner: string; // player id for team 0
  dmg: number;
}

/**
 * WorldDO — authoritative simulation for one zone. Source of truth for movement
 * (Step 2a) AND combat (Step 2b): the server simulates enemies + projectiles,
 * resolves all hits, owns HP/death/respawn, and awards credits. Clients send only
 * movement intent + fire intent (aim); they never decide a hit, a kill, damage, or
 * currency. Player position + credits persist to D1.
 */
export class WorldDO {
  private sessions = new Map<WebSocket, string>();
  private players = new Map<string, PlayerState>();
  private enemies = new Map<number, Enemy>();
  private shots: Shot[] = [];
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private grid: TileGrid;
  private spawn: { x: number; y: number };
  private pickups = new Map<number, Pickup>();
  private nextEnemyId = 1;
  private nextShotId = 1;
  private nextPickupId = 1;
  private singularity = 0; // shared server-wide meter (persisted in world_meta)
  private singLoaded = false;

  constructor(
    _state: DurableObjectState,
    private env: Env,
  ) {
    this.grid = buildGrid(DISTRICTS[0]);
    this.spawn = spawnPoint(this.grid, DISTRICTS[0]);
    this.spawnEnemies();
  }

  /** Seed a handful of cops at the district's cop-posts (walkable tiles only). */
  private spawnEnemies() {
    for (const [tx, ty] of DISTRICTS[0].copPosts) {
      if (isWall(this.grid[ty]?.[tx])) continue;
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      const id = this.nextEnemyId++;
      this.enemies.set(id, { id, x, y, ox: x, oy: y, hp: COP_HP, respawnTick: 0, lastFireTick: 0 });
    }
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
    if (msg.t === "fire") return this.onFire(ws, msg);
  }

  private async loadSingularity() {
    if (this.singLoaded) return;
    this.singLoaded = true;
    try {
      const row = await this.env.DB.prepare("SELECT v FROM world_meta WHERE k = 'singularity'").first<{
        v: number;
      }>();
      if (row) this.singularity = row.v;
    } catch {
      /* table may not exist before migration — defaults to 0 */
    }
  }

  private async onLogin(ws: WebSocket, rawName: string) {
    const name = (rawName || "").trim().slice(0, 16) || "blank";
    const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "blank";
    await this.loadSingularity();

    let x = this.spawn.x;
    let y = this.spawn.y;
    let credits = 0;
    let xp = 0;
    const row = await this.env.DB.prepare("SELECT x, y, credits, xp FROM players WHERE id = ?")
      .bind(id)
      .first<{ x: number; y: number; credits: number; xp: number }>();
    if (row) {
      x = row.x;
      y = row.y;
      credits = row.credits ?? 0;
      xp = row.xp ?? 0;
    } else {
      await this.upsert(id, name, x, y, 0, 0);
    }

    const p: PlayerState = {
      id,
      name,
      x,
      y,
      mx: 0,
      my: 0,
      lastInputTick: this.tick,
      ack: 0,
      dirty: false,
      hp: PLAYER_HP,
      dead: false,
      respawnTick: 0,
      credits,
      aim: 0,
      lastFireTick: -999,
      xp,
      level: levelForXp(xp),
    };
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
    const p = this.playerFor(ws);
    if (!p) return;
    p.mx = clampUnit(msg.mx);
    p.my = clampUnit(msg.my);
    p.lastInputTick = this.tick;
    if (Number.isFinite(msg.seq)) p.ack = Math.max(p.ack, msg.seq | 0);
  }

  private onFire(ws: WebSocket, msg: Extract<ClientMsg, { t: "fire" }>) {
    const p = this.playerFor(ws);
    if (!p || p.dead) return;
    if (Number.isFinite(msg.aim)) p.aim = msg.aim;
    // (fire carries a seq for reference only; movement ack advances from inputs.)
    // AUTHORITY: the server enforces the fire rate — a client spamming "fire" can't
    // exceed it, and a hit is never client-reported.
    if ((this.tick - p.lastFireTick) * NET_TICK_MS < PLAYER_FIRE_MS) return;
    p.lastFireTick = this.tick;
    this.shots.push({
      id: this.nextShotId++,
      x: p.x,
      y: p.y,
      vx: Math.cos(p.aim) * PROJ_SPEED,
      vy: Math.sin(p.aim) * PROJ_SPEED,
      dieTick: this.tick + ticks(PROJ_TTL_MS),
      team: 0,
      owner: p.id,
      dmg: PLAYER_DMG,
    });
  }

  private playerFor(ws: WebSocket): PlayerState | undefined {
    const id = this.sessions.get(ws);
    return id ? this.players.get(id) : undefined;
  }

  private ensureTick() {
    if (!this.timer) this.timer = setInterval(() => this.step(), NET_TICK_MS);
  }

  private step() {
    const dt = NET_TICK_MS / 1000;

    // 1) players — movement + respawn
    for (const p of this.players.values()) {
      if (p.dead) {
        if (this.tick >= p.respawnTick) {
          p.x = this.spawn.x;
          p.y = this.spawn.y;
          p.hp = PLAYER_HP;
          p.dead = false;
          p.dirty = true;
        }
        continue;
      }
      if (this.tick - p.lastInputTick > INTENT_EXPIRE_TICKS) {
        p.mx = 0;
        p.my = 0;
      }
      if (p.mx !== 0 || p.my !== 0) {
        stepMove(p, { mx: p.mx, my: p.my }, this.grid, NET_TICK_MS);
        p.dirty = true;
      }
    }

    // 2) enemies — chase nearest player, fire in range
    for (const e of this.enemies.values()) {
      if (e.hp <= 0) {
        if (this.tick >= e.respawnTick) {
          e.x = e.ox;
          e.y = e.oy;
          e.hp = COP_HP;
        }
        continue;
      }
      const target = this.nearestLivePlayer(e.x, e.y, ENEMY_AGGRO);
      if (!target) continue;
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      stepMove(e, { mx: dx / d, my: dy / d }, this.grid, NET_TICK_MS, ENEMY_SPEED);
      if (d <= ENEMY_FIRE_RANGE && (this.tick - e.lastFireTick) * NET_TICK_MS >= COP_FIRE_MS) {
        e.lastFireTick = this.tick;
        const aim = Math.atan2(target.y - e.y, target.x - e.x);
        this.shots.push({
          id: this.nextShotId++,
          x: e.x,
          y: e.y,
          vx: Math.cos(aim) * ENEMY_PROJ_SPEED,
          vy: Math.sin(aim) * ENEMY_PROJ_SPEED,
          dieTick: this.tick + ticks(ENEMY_PROJ_TTL_MS),
          team: 1,
          owner: String(e.id),
          dmg: ENEMY_DMG,
        });
      }
    }

    // 3) projectiles — integrate + resolve hits (server decides ALL damage/kills)
    const R2 = PROJ_HIT_RADIUS * PROJ_HIT_RADIUS;
    const alive: Shot[] = [];
    for (const s of this.shots) {
      const ax = s.x; // swept-collision: check the whole step, not just the endpoint,
      const ay = s.y; // so a fast shot can't tunnel past a point-blank target.
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (this.tick >= s.dieTick || tileIsWall(s.x, s.y, this.grid)) continue; // despawn
      let consumed = false;
      if (s.team === 0) {
        for (const e of this.enemies.values()) {
          if (e.hp <= 0) continue;
          if (segPointDist2(e.x, e.y, ax, ay, s.x, s.y) <= R2) {
            e.hp -= s.dmg;
            consumed = true;
            if (e.hp <= 0) {
              e.respawnTick = this.tick + ticks(4000);
              const killer = this.players.get(s.owner);
              if (killer) {
                killer.credits += CREDITS_PER_KILL; // server-authoritative currency
                killer.xp += XP_PER_KILL; // server-authoritative progression
                killer.level = levelForXp(killer.xp);
                killer.dirty = true;
              }
              // shared meta: every kill (any player) pushes the server-wide Singularity
              this.singularity = Math.min(SING_MAX, this.singularity + SING_PER_KILL);
              // loot roll — server decides the drop
              if (Math.random() < LOOT_DROP_CHANCE) {
                const kind = Math.random() < 0.25 ? PICKUP_CORE : PICKUP_CREDIT;
                const pid = this.nextPickupId++;
                this.pickups.set(pid, {
                  id: pid,
                  x: e.x,
                  y: e.y,
                  kind,
                  dieTick: this.tick + ticks(PICKUP_TTL_MS),
                });
              }
            }
            break;
          }
        }
      } else {
        for (const p of this.players.values()) {
          if (p.dead) continue;
          if (segPointDist2(p.x, p.y, ax, ay, s.x, s.y) <= R2) {
            p.hp -= s.dmg;
            consumed = true;
            if (p.hp <= 0) {
              p.hp = 0;
              p.dead = true;
              p.respawnTick = this.tick + ticks(RESPAWN_MS);
              p.dirty = true;
            }
            break;
          }
        }
      }
      if (!consumed) alive.push(s);
    }
    this.shots = alive;

    // 4) pickups — collected by walkover, expire on TTL (server decides the grant)
    const PR2 = PICKUP_RADIUS * PICKUP_RADIUS;
    for (const [pid, pu] of this.pickups) {
      if (this.tick >= pu.dieTick) {
        this.pickups.delete(pid);
        continue;
      }
      for (const p of this.players.values()) {
        if (p.dead) continue;
        if (dist2(p.x, p.y, pu.x, pu.y) <= PR2) {
          if (pu.kind === PICKUP_CORE) {
            p.credits += 30;
            p.xp += 8;
            p.level = levelForXp(p.xp);
          } else {
            p.credits += 6;
          }
          p.dirty = true;
          this.pickups.delete(pid);
          break;
        }
      }
    }

    // 5) broadcast authoritative snapshot
    const players = [...this.players.values()].map((p) => ({
      id: p.id,
      x: round2(p.x),
      y: round2(p.y),
      ack: p.ack,
      hp: Math.max(0, Math.round(p.hp)),
      dead: p.dead,
      credits: p.credits,
      xp: p.xp,
      level: p.level,
    }));
    const enemies = [...this.enemies.values()]
      .filter((e) => e.hp > 0)
      .map((e) => ({ id: e.id, x: round2(e.x), y: round2(e.y), hp: Math.round(e.hp) }));
    const shots = this.shots.map((s) => ({ id: s.id, x: round2(s.x), y: round2(s.y), team: s.team }));
    const pickups = [...this.pickups.values()].map((pu) => ({
      id: pu.id,
      x: round2(pu.x),
      y: round2(pu.y),
      kind: pu.kind,
    }));
    const snapshot = JSON.stringify({
      t: "state",
      tick: this.tick,
      players,
      enemies,
      shots,
      pickups,
      sing: round2(this.singularity),
      meltdown: this.singularity >= SING_MAX,
    });
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

  private nearestLivePlayer(x: number, y: number, range: number): PlayerState | null {
    let best: PlayerState | null = null;
    let bestD = range * range;
    for (const p of this.players.values()) {
      if (p.dead) continue;
      const d = dist2(x, y, p.x, p.y);
      if (d <= bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private async persistDirty() {
    for (const p of this.players.values()) {
      if (!p.dirty) continue;
      p.dirty = false;
      await this.upsert(p.id, p.name, p.x, p.y, p.credits, p.xp);
    }
    await this.persistSingularity();
  }

  private async persistSingularity() {
    try {
      await this.env.DB.prepare(
        "INSERT INTO world_meta (k, v) VALUES ('singularity', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
      )
        .bind(round2(this.singularity))
        .run();
    } catch {
      /* world_meta missing pre-migration */
    }
  }

  private async upsert(
    id: string,
    name: string,
    x: number,
    y: number,
    credits: number,
    xp: number,
  ) {
    try {
      await this.env.DB.prepare(
        "INSERT INTO players (id, name, x, y, zone, credits, xp, updated_at) VALUES (?,?,?,?,?,?,?,?) " +
          "ON CONFLICT(id) DO UPDATE SET x=excluded.x, y=excluded.y, credits=excluded.credits, xp=excluded.xp, updated_at=excluded.updated_at",
      )
        .bind(id, name, round2(x), round2(y), "world", Math.round(credits), Math.round(xp), Date.now())
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
      await this.upsert(p.id, p.name, p.x, p.y, p.credits, p.xp);
      await this.persistSingularity();
      this.players.delete(id);
    }
  }
}
