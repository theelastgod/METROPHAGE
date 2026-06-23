// Shared game model + sim (single source of truth, imported from the client repo —
// these modules are Phaser-free and deterministic).
import { NET_TICK_MS, type ClientMsg, type PlayerLook } from "../../src/net/protocol";
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
  MELTDOWN_DURATION_MS,
  MELTDOWN_ENEMY_SPEED_MULT,
  MELTDOWN_FIRE_FASTER,
  AOI_RADIUS,
  FACTION_COUNT,
  NEUTRAL,
  NODE_CHANNEL_RANGE,
  NODE_CAPTURE_PER_SEC,
  NODE_DECAY_PER_SEC,
  FACTION_CAPTURE_SCORE,
  NODE_HOLD_SCORE_PER_SEC,
} from "../../src/net/sim";
import { buildGrid, spawnPoint, isWall, type TileGrid } from "../../src/world/district";
import { DISTRICTS } from "../../src/game/districts";
import { TILE } from "../../src/config";
import { QUESTLINE, QUEST_DONE_TEXT, type QuestObjective } from "../../src/net/quest";

// Server-only tuning.
const PERSIST_EVERY_TICKS = 40; // ~2s snapshot cadence
const INTENT_EXPIRE_TICKS = 3;
// Step 7 (ops): a durable "supervisor" alarm. It is NOT the game tick — a 20Hz
// real-time loop runs hot as an in-memory interval (cheaper + more precise than
// 20 alarms/s). The alarm is the lifecycle backstop: it resumes the sim if the
// isolate was recycled mid-session (alarms survive eviction; setInterval does
// not) and heartbeat-persists, so the loop is supervised + durable, not
// fire-and-forget.
const SUPERVISOR_ALARM_MS = 10_000;
// Step 7 (anti-cheat): per-socket flood guard. Legit play is ~1 input/tick plus
// the odd fire/chat, so even a 144fps client holding fire stays well under these.
// Movement is already flood-immune (intent is integrated once per server tick, not
// per message) and fire is already server-rate-limited — this only stops a socket
// from exhausting CPU/bandwidth with raw message volume.
const MAX_MSG_BYTES = 4096; // reject oversized payloads outright
const MSG_SOFT_PER_TICK = 20; // ~400/s — silently drop beyond this
const MSG_KILL_PER_TICK = 60; // ~1200/s — close the socket on a real flood
const round2 = (n: number) => Math.round(n * 100) / 100;
const clampUnit = (n: number) => (n > 1 ? 1 : n < -1 ? -1 : Number.isFinite(n) ? n : 0);
const ticks = (ms: number) => Math.ceil(ms / NET_TICK_MS);

/** Per-connection state stored on the WebSocket so it survives DO hibernation. */
interface SessionAttach {
  id: string;
  name: string;
  faction: number;
  look?: PlayerLook; // appearance, so it survives a hibernation wake
}
/** Map a "dN" zone string to a valid district index. */
export const parseZone = (z: string | null): number => {
  const m = z ? /^d(\d+)$/.exec(z) : null;
  const n = m ? parseInt(m[1], 10) : 0;
  return n >= 0 && n < DISTRICTS.length ? n : 0;
};

export interface Env {
  WORLD: DurableObjectNamespace;
  DB: D1Database;
  // $METRO bridge (Phase 5) — present only when the devnet rig is configured via
  // .dev.vars / wrangler secrets. Absent → the bridge uses the devnet-sim settlement.
  METRO_TREASURY_SECRET?: string;
  METRO_DEVNET_MINT?: string;
  METRO_RPC?: string;
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
  cores: number;
  aim: number;
  lastFireTick: number;
  // progression
  xp: number;
  level: number;
  faction: number;
  // social
  party: number; // party id, or -1
  muted: Set<string>; // player ids this player has muted (their chat is dropped)
  lastChatTick: number;
  // questline (The Blank — per-player, server-authoritative)
  questStep: number;
  questProgress: number;
  // appearance (relayed to other clients so they render this player's customization)
  look?: PlayerLook;
}

interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: number; // PICKUP_CREDIT | PICKUP_CORE
  dieTick: number;
}

interface TerritoryNode {
  id: number;
  x: number;
  y: number;
  owner: number; // faction index, or NEUTRAL
  progress: number; // 0..1 toward the channelling faction
  by: number; // faction currently channelling (NEUTRAL if none/contested)
}

interface TradeOfferS {
  credits: number;
  cores: number;
}
interface TradeSession {
  id: number;
  a: string; // player id (initiator)
  b: string; // player id (other)
  offerA: TradeOfferS;
  offerB: TradeOfferS;
  confirmA: boolean;
  confirmB: boolean;
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
  // Server-wide shared meta (D1-synced across all zones): "singularity", "f0".."f3".
  private meta: Record<string, number> = {};
  private metaDelta: Record<string, number> = {};
  private metaLoaded = false;
  private nodes: TerritoryNode[] = [];
  private parties = new Map<number, Set<string>>(); // partyId -> member ids
  private nextPartyId = 1;
  private trades = new Map<number, TradeSession>();
  private playerTrade = new Map<string, number>(); // player id -> trade id
  private nextTradeId = 1;
  private meltdownTicks = 0; // how long this DO has seen the meltdown active
  private zoneName = "d0";
  private districtIndex = 0;
  private zoneReady = false;
  private msgRate = new Map<WebSocket, { tick: number; n: number }>(); // per-socket flood guard

  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {
    // The real zone (district) is bound on the first connection from ?zone=.
    this.grid = buildGrid(DISTRICTS[0]);
    this.spawn = spawnPoint(this.grid, DISTRICTS[0]);
    // Hibernation wake / isolate restart: before processing ANY event, rebind the
    // zone and rehydrate any WebSockets the runtime kept open while we were evicted.
    // Durable state (pos/credits/xp/cores/quest) reloads from D1; transient combat
    // state (in-flight shots, live HP) resets — acceptable on a rare eviction.
    state.blockConcurrencyWhile(async () => {
      const z = await state.storage.get<number>("zone");
      if (typeof z === "number") this.initZone("d" + z);
      for (const ws of state.getWebSockets()) {
        const att = ws.deserializeAttachment() as SessionAttach | null;
        if (att) await this.resumeSession(ws, att);
      }
      if (this.sessions.size > 0) {
        this.ensureTick();
        await this.ensureSupervisor();
      }
    });
  }

  /** A DO instance handles exactly one zone — bind it to its district on first hit. */
  private initZone(zone: string | null) {
    if (this.zoneReady) return;
    this.zoneReady = true;
    this.districtIndex = parseZone(zone);
    this.zoneName = "d" + this.districtIndex;
    void this.state.storage.put("zone", this.districtIndex); // so a wake re-binds the right district
    const def = DISTRICTS[this.districtIndex];
    this.grid = buildGrid(def);
    this.spawn = spawnPoint(this.grid, def);
    this.spawnEnemies(def);
    this.nodes = def.nodes.map((n, i) => ({
      id: i,
      x: n.tile[0] * TILE + TILE / 2,
      y: n.tile[1] * TILE + TILE / 2,
      owner: NEUTRAL,
      progress: 0,
      by: NEUTRAL,
    }));
  }

  /** Seed a handful of cops at the district's cop-posts (walkable tiles only). */
  private spawnEnemies(def: (typeof DISTRICTS)[number]) {
    for (const [tx, ty] of def.copPosts) {
      if (isWall(this.grid[ty]?.[tx])) continue;
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      const id = this.nextEnemyId++;
      this.enemies.set(id, { id, x, y, ox: x, oy: y, hp: COP_HP, respawnTick: 0, lastFireTick: 0 });
    }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    this.initZone(url.searchParams.get("zone"));
    // Ops: a lightweight per-zone metrics probe (no upgrade) for monitoring.
    if (url.pathname === "/stats") {
      return new Response(JSON.stringify(this.getStats()), {
        headers: { "content-type": "application/json" },
      });
    }
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // Hibernation API: the runtime owns the socket, so it survives DO eviction and
    // delivers events via the webSocket* handlers below (not addEventListener).
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Hibernatable WebSocket event handlers (called by the runtime, even after a
  // hibernation wake — they replace the in-closure addEventListener of the spike) ──
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const raw = typeof message === "string" ? message : "";
    if (!raw || raw.length > MAX_MSG_BYTES) return; // ignore binary / oversized
    if (!this.rateOk(ws)) return; // anti-flood (may close the socket)
    await this.handle(ws, raw);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    this.msgRate.delete(ws);
    await this.onClose(ws);
    // compatibility_date < 2026-04-07: we must reciprocate the close handshake,
    // else the client sees a 1006 abnormal closure.
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: WebSocket) {
    this.msgRate.delete(ws);
    await this.onClose(ws);
  }

  /** Per-socket flood guard: drop beyond the soft cap, close on an egregious flood. */
  private rateOk(ws: WebSocket): boolean {
    const r = this.msgRate.get(ws);
    if (!r || r.tick !== this.tick) {
      this.msgRate.set(ws, { tick: this.tick, n: 1 });
      return true;
    }
    r.n++;
    if (r.n > MSG_KILL_PER_TICK) {
      console.warn(`[${this.zoneName}] flood from ${this.sessions.get(ws) ?? "?"} (${r.n}/tick) — closing`);
      try {
        ws.close(1008, "rate limit");
      } catch {
        /* gone */
      }
      this.msgRate.delete(ws);
      void this.onClose(ws);
      return false;
    }
    return r.n <= MSG_SOFT_PER_TICK;
  }

  private send(ws: WebSocket, msg: unknown) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket gone */
    }
  }

  private async handle(ws: WebSocket, raw: string) {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw) as ClientMsg;
    } catch {
      return;
    }
    if (msg.t === "login") return this.onLogin(ws, msg.name, msg.faction, msg.look);
    if (msg.t === "input") return this.onInput(ws, msg);
    if (msg.t === "fire") return this.onFire(ws, msg);
    if (msg.t === "chat") return this.onChat(ws, msg);
    if (msg.t === "party") return this.onParty(ws, msg);
    if (msg.t === "mute") return this.onMute(ws, msg);
    if (msg.t === "trade") return this.onTrade(ws, msg);
  }

  // ── social: chat / parties / mute ───────────────────────────────────
  private pendingInvites = new Map<string, number>(); // invitee id -> party id

  /** Send a message to all of a player's sockets (skipping if they muted `fromId`). */
  private sendTo(playerId: string, msg: unknown, fromId?: string) {
    for (const [sock, id] of this.sessions) {
      if (id !== playerId) continue;
      if (fromId) {
        const r = this.players.get(id);
        if (r?.muted.has(fromId)) continue;
      }
      try {
        sock.send(JSON.stringify(msg));
      } catch {
        /* dropped */
      }
    }
  }

  private onChat(ws: WebSocket, msg: Extract<ClientMsg, { t: "chat" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    const text = (msg.text || "").slice(0, 200).trim();
    if (!text) return;
    if ((this.tick - p.lastChatTick) * NET_TICK_MS < 300) return; // rate-limit ~3/s
    p.lastChatTick = this.tick;
    const out = { t: "chat", from: p.name, faction: p.faction, ch: msg.ch, text };
    if (msg.ch === "whisper") {
      const to = (msg.to || "").toLowerCase();
      if (!this.players.has(to)) {
        this.send(ws, { t: "sys", text: `no such player: ${msg.to}` });
        return;
      }
      this.sendTo(to, out, p.id);
      this.send(ws, { ...out, from: `you → ${msg.to}` }); // echo to sender
    } else if (msg.ch === "party") {
      if (p.party < 0) {
        this.send(ws, { t: "sys", text: "you're not in a party" });
        return;
      }
      for (const mid of this.parties.get(p.party) ?? []) this.sendTo(mid, out, p.id);
    } else {
      // zone — everyone in this DO, respecting mutes
      for (const [sock, id] of this.sessions) {
        if (this.players.get(id)?.muted.has(p.id)) continue;
        try {
          sock.send(JSON.stringify(out));
        } catch {
          /* dropped */
        }
      }
    }
  }

  private onParty(ws: WebSocket, msg: Extract<ClientMsg, { t: "party" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    if (msg.action === "invite") {
      const to = (msg.to || "").toLowerCase();
      const target = this.players.get(to);
      if (!target || target.id === p.id) {
        this.send(ws, { t: "sys", text: "can't invite that player" });
        return;
      }
      if (p.party < 0) {
        const pid = this.nextPartyId++;
        this.parties.set(pid, new Set([p.id]));
        p.party = pid;
      }
      this.pendingInvites.set(target.id, p.party);
      this.sendTo(target.id, { t: "sys", text: `${p.name} invited you to a party — type /join` });
      this.send(ws, { t: "sys", text: `invited ${target.name}` });
    } else if (msg.action === "accept") {
      const pid = this.pendingInvites.get(p.id);
      if (pid == null || !this.parties.has(pid)) {
        this.send(ws, { t: "sys", text: "no pending party invite" });
        return;
      }
      this.leaveParty(p);
      this.parties.get(pid)!.add(p.id);
      p.party = pid;
      this.pendingInvites.delete(p.id);
      this.broadcastParty(pid);
    } else {
      this.leaveParty(p);
      this.send(ws, { t: "party", members: [] });
    }
  }

  private onMute(ws: WebSocket, msg: Extract<ClientMsg, { t: "mute" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    const to = (msg.to || "").toLowerCase();
    if (to && to !== p.id) {
      p.muted.add(to);
      this.send(ws, { t: "sys", text: `muted ${msg.to}` });
    }
  }

  private leaveParty(p: PlayerState) {
    if (p.party < 0) return;
    const pid = p.party;
    p.party = -1;
    const set = this.parties.get(pid);
    if (!set) return;
    set.delete(p.id);
    if (set.size <= 1) {
      for (const m of set) {
        const mp = this.players.get(m);
        if (mp) mp.party = -1;
      }
      this.parties.delete(pid);
    } else {
      this.broadcastParty(pid);
    }
  }

  private broadcastParty(pid: number) {
    const set = this.parties.get(pid);
    if (!set) return;
    const members = [...set];
    for (const mid of members) this.sendTo(mid, { t: "party", members });
  }

  // ── secure server-mediated trading ──────────────────────────────────
  // Properties: both must confirm; changing an offer resets BOTH confirms;
  // execution re-validates LIVE balances (dupe-proof) and swaps all-or-nothing.
  // Balances are server-owned — the client never reports what it has or moves items.
  private tradeOf(p: PlayerState): TradeSession | undefined {
    const id = this.playerTrade.get(p.id);
    return id != null ? this.trades.get(id) : undefined;
  }

  private onTrade(ws: WebSocket, msg: Extract<ClientMsg, { t: "trade" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    if (msg.action === "request") {
      const to = (msg.to || "").toLowerCase();
      const target = this.players.get(to);
      if (!target || target.id === p.id) {
        this.send(ws, { t: "sys", text: "can't trade that player" });
        return;
      }
      if (this.playerTrade.has(p.id) || this.playerTrade.has(target.id)) {
        this.send(ws, { t: "sys", text: "a trade is already in progress" });
        return;
      }
      const id = this.nextTradeId++;
      this.trades.set(id, {
        id,
        a: p.id,
        b: target.id,
        offerA: { credits: 0, cores: 0 },
        offerB: { credits: 0, cores: 0 },
        confirmA: false,
        confirmB: false,
      });
      this.playerTrade.set(p.id, id);
      this.playerTrade.set(target.id, id);
      this.sendTo(target.id, { t: "sys", text: `${p.name} wants to trade — type /taccept` });
      this.send(ws, { t: "sys", text: `trade requested with ${target.name}` });
      return;
    }
    const tr = this.tradeOf(p);
    if (!tr) {
      if (msg.action !== "cancel") this.send(ws, { t: "sys", text: "no active trade" });
      return;
    }
    const isA = p.id === tr.a;
    if (msg.action === "accept") {
      this.pushTrade(tr);
    } else if (msg.action === "offer") {
      const credits = Math.max(0, Math.floor(msg.credits ?? 0));
      const cores = Math.max(0, Math.floor(msg.cores ?? 0));
      if (isA) tr.offerA = { credits, cores };
      else tr.offerB = { credits, cores };
      tr.confirmA = false; // any change voids both confirmations
      tr.confirmB = false;
      this.pushTrade(tr);
    } else if (msg.action === "confirm") {
      if (isA) tr.confirmA = true;
      else tr.confirmB = true;
      if (tr.confirmA && tr.confirmB) this.executeTrade(tr);
      else this.pushTrade(tr);
    } else if (msg.action === "cancel") {
      this.endTrade(tr, "cancelled", "trade cancelled");
    }
  }

  private pushTrade(tr: TradeSession) {
    const a = this.players.get(tr.a);
    const b = this.players.get(tr.b);
    if (a)
      this.sendTo(tr.a, {
        t: "trade",
        state: "update",
        with: b?.name ?? tr.b,
        youOffer: tr.offerA,
        theyOffer: tr.offerB,
        youConfirm: tr.confirmA,
        theyConfirm: tr.confirmB,
      });
    if (b)
      this.sendTo(tr.b, {
        t: "trade",
        state: "update",
        with: a?.name ?? tr.a,
        youOffer: tr.offerB,
        theyOffer: tr.offerA,
        youConfirm: tr.confirmB,
        theyConfirm: tr.confirmA,
      });
  }

  private endTrade(tr: TradeSession, state: "done" | "cancelled", text: string) {
    this.sendTo(tr.a, { t: "trade", state, text });
    this.sendTo(tr.b, { t: "trade", state, text });
    this.trades.delete(tr.id);
    this.playerTrade.delete(tr.a);
    this.playerTrade.delete(tr.b);
  }

  private executeTrade(tr: TradeSession) {
    const a = this.players.get(tr.a);
    const b = this.players.get(tr.b);
    if (!a || !b) {
      this.endTrade(tr, "cancelled", "trade partner left");
      return;
    }
    // DUPE-PROOF: validate against LIVE balances at execution time, not the offer.
    if (
      a.credits < tr.offerA.credits ||
      a.cores < tr.offerA.cores ||
      b.credits < tr.offerB.credits ||
      b.cores < tr.offerB.cores
    ) {
      tr.confirmA = false;
      tr.confirmB = false;
      this.sendTo(tr.a, { t: "sys", text: "trade reset — insufficient balance" });
      this.sendTo(tr.b, { t: "sys", text: "trade reset — insufficient balance" });
      this.pushTrade(tr);
      return;
    }
    // all-or-nothing swap
    a.credits += tr.offerB.credits - tr.offerA.credits;
    a.cores += tr.offerB.cores - tr.offerA.cores;
    b.credits += tr.offerA.credits - tr.offerB.credits;
    b.cores += tr.offerA.cores - tr.offerB.cores;
    a.dirty = true;
    b.dirty = true;
    this.endTrade(tr, "done", "trade complete");
  }

  private async loadMeta() {
    if (this.metaLoaded) return;
    this.metaLoaded = true;
    try {
      const { results } = await this.env.DB.prepare("SELECT k, v FROM world_meta").all<{
        k: string;
        v: number;
      }>();
      for (const r of results ?? []) this.meta[r.k] = r.v;
    } catch {
      /* table may not exist before migration — defaults to 0 */
    }
  }

  /** Add to a shared meta value: optimistic local bump + queued D1 increment. */
  private bumpMeta(key: string, delta: number, cap = Infinity) {
    this.meta[key] = Math.min(cap, (this.meta[key] ?? 0) + delta);
    this.metaDelta[key] = (this.metaDelta[key] ?? 0) + delta;
  }

  private async onLogin(ws: WebSocket, rawName: string, faction?: number, look?: PlayerLook) {
    const name = (rawName || "").trim().slice(0, 16) || "blank";
    const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "blank";
    const fac = Number.isInteger(faction) && faction! >= 0 && faction! < FACTION_COUNT ? faction! : 0;
    const p = this.players.get(id) ?? (await this.loadPlayer(id, name, fac));
    p.faction = fac;
    if (look) p.look = look; // appearance, relayed to others (client re-sanitizes before baking)
    this.players.set(id, p);
    this.sessions.set(ws, id);
    // Persist identity + look on the socket so a hibernation wake can re-attach it (above).
    ws.serializeAttachment({ id, name, faction: fac, look: p.look } satisfies SessionAttach);
    this.send(ws, {
      t: "welcome",
      id,
      faction: fac,
      x: round2(p.x),
      y: round2(p.y),
      tickMs: NET_TICK_MS,
      world: { w: WORLD_W, h: WORLD_H },
    });
    this.sendStory(ws, p.questStep); // brief the Blank on their current beat
    this.ensureTick();
    await this.ensureSupervisor();
  }

  /** Build a player's runtime state, loading durable fields (pos/credits/xp/cores/
   *  quest) from D1. Shared by fresh login and hibernation-wake rehydration. */
  private async loadPlayer(id: string, name: string, fac: number): Promise<PlayerState> {
    await this.loadMeta();
    let x = this.spawn.x;
    let y = this.spawn.y;
    let credits = 0;
    let xp = 0;
    let cores = 0;
    let questStep = 0;
    const row = await this.env.DB.prepare(
      "SELECT x, y, credits, xp, zone, cores, quest_step FROM players WHERE id = ?",
    )
      .bind(id)
      .first<{
        x: number;
        y: number;
        credits: number;
        xp: number;
        zone: string;
        cores: number;
        quest_step: number;
      }>();
    if (row) {
      credits = row.credits ?? 0;
      xp = row.xp ?? 0;
      cores = row.cores ?? 0;
      questStep = row.quest_step ?? 0;
      // Same zone → resume exact position. Different zone → they just travelled in,
      // so spawn at this district's entrance (x,y already hold the spawn).
      if (row.zone === this.zoneName) {
        x = row.x;
        y = row.y;
      }
    } else {
      await this.upsert(id, name, x, y, 0, 0, 0, 0);
    }
    return {
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
      cores,
      aim: 0,
      lastFireTick: -999,
      xp,
      level: levelForXp(xp),
      faction: fac,
      party: -1,
      muted: new Set<string>(),
      lastChatTick: -999,
      questStep,
      questProgress: 0,
    };
  }

  /** Re-attach a hibernated socket to its player after an eviction wake (no welcome —
   *  the client never disconnected, it just resumes receiving snapshots). */
  private async resumeSession(ws: WebSocket, att: SessionAttach) {
    this.sessions.set(ws, att.id);
    if (!this.players.has(att.id)) {
      const p = await this.loadPlayer(att.id, att.name, att.faction);
      p.look = att.look; // restore appearance from the socket attachment
      this.players.set(att.id, p);
    }
  }

  /** Send the story text for a quest step (or the completion beat). */
  private sendStory(ws: WebSocket, step: number) {
    const s = QUESTLINE[step];
    if (s) this.send(ws, { t: "story", act: s.act, title: s.title, text: s.text, step, done: false });
    else this.send(ws, { t: "story", act: "THE WAKE", title: "Recurrence", text: QUEST_DONE_TEXT, step, done: true });
  }

  /** Advance a player's questline when a shared-world action matches their objective. */
  private questEvent(p: PlayerState, type: QuestObjective, n = 1) {
    const s = QUESTLINE[p.questStep];
    if (!s || s.objective !== type) return;
    p.questProgress += n;
    if (p.questProgress >= s.count) {
      p.questStep += 1;
      p.questProgress = 0;
      p.dirty = true;
      for (const [sock, id] of this.sessions) if (id === p.id) this.sendStory(sock, p.questStep);
    }
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

  /** Arm the durable supervisor alarm (idempotent — one outstanding alarm at a time). */
  private async ensureSupervisor() {
    if ((await this.state.storage.getAlarm()) === null) {
      await this.state.storage.setAlarm(Date.now() + SUPERVISOR_ALARM_MS);
    }
  }

  /**
   * Durable supervisor. Fires on schedule and, crucially, after an eviction (alarms
   * survive isolate recycling — the in-memory setInterval does not). On each fire,
   * while the zone still has players: resume the sim loop if the isolate was recycled,
   * heartbeat-persist, and re-arm. When the zone has emptied, let the alarm lapse so
   * the DO can hibernate/evict cleanly.
   */
  async alarm() {
    if (this.sessions.size > 0) {
      this.ensureTick();
      await this.persistDirty();
      await this.state.storage.setAlarm(Date.now() + SUPERVISOR_ALARM_MS);
    }
  }

  /** Ops snapshot for the /stats probe — cheap, no entity bodies. */
  private getStats() {
    let liveEnemies = 0;
    for (const e of this.enemies.values()) if (e.hp > 0) liveEnemies++;
    return {
      zone: this.zoneName,
      players: this.sessions.size,
      enemies: liveEnemies,
      shots: this.shots.length,
      pickups: this.pickups.size,
      nodes: this.nodes.length,
      tick: this.tick,
      running: this.timer !== null,
      singularity: round2(this.meta["singularity"] ?? 0),
      meltdown: (this.meta["singularity"] ?? 0) >= SING_MAX,
      season: Math.round(this.meta["season"] ?? 1),
    };
  }

  private step() {
    const dt = NET_TICK_MS / 1000;

    // 0) seasonal meltdown — when the shared Singularity caps, the world melts down
    // (HSS goes berserk) for a fixed window, then the era resets (Singularity → 0,
    // season++). The reset is done once via a guarded D1 update (see resetEra).
    const meltdown = (this.meta["singularity"] ?? 0) >= SING_MAX;
    if (meltdown) {
      if (++this.meltdownTicks >= ticks(MELTDOWN_DURATION_MS)) {
        this.meltdownTicks = 0;
        void this.resetEra();
      }
    } else {
      this.meltdownTicks = 0;
    }

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
      // The Convergence: surviving a meltdown (alive while it rages) advances it.
      if (meltdown) this.questEvent(p, "meltdown");
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
      const eSpeed = meltdown ? ENEMY_SPEED * MELTDOWN_ENEMY_SPEED_MULT : ENEMY_SPEED;
      const eFireMs = meltdown ? COP_FIRE_MS * MELTDOWN_FIRE_FASTER : COP_FIRE_MS;
      stepMove(e, { mx: dx / d, my: dy / d }, this.grid, NET_TICK_MS, eSpeed);
      if (d <= ENEMY_FIRE_RANGE && (this.tick - e.lastFireTick) * NET_TICK_MS >= eFireMs) {
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
                this.bumpMeta("f" + killer.faction, 1); // faction contribution from combat
                this.questEvent(killer, "kill");
              }
              // shared meta: every kill (any player, ANY zone) pushes the server-wide
              // Singularity. Optimistic local bump now; flushed/synced to D1 on persist.
              this.bumpMeta("singularity", SING_PER_KILL, SING_MAX);
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
            p.cores += 1; // a tradeable data core
            p.xp += 8;
            p.level = levelForXp(p.xp);
            this.questEvent(p, "collect");
          } else {
            p.credits += 6;
          }
          p.dirty = true;
          this.pickups.delete(pid);
          break;
        }
      }
    }

    // 4b) territory — players channel nearby nodes toward their faction; an enemy
    // (or the HSS, modelled as uncontested decay) erodes held ground. A capture
    // scores the faction; holding ticks contribution. Server owns all of it.
    const CR2 = NODE_CHANNEL_RANGE * NODE_CHANNEL_RANGE;
    const dts = NET_TICK_MS / 1000;
    for (const node of this.nodes) {
      let by = NEUTRAL;
      let contested = false;
      for (const p of this.players.values()) {
        if (p.dead) continue;
        if (dist2(p.x, p.y, node.x, node.y) <= CR2) {
          if (by === NEUTRAL) by = p.faction;
          else if (by !== p.faction) contested = true;
        }
      }
      node.by = contested ? NEUTRAL : by;
      if (node.by !== NEUTRAL && node.by === node.owner) {
        node.progress = 1; // held
        this.bumpMeta("f" + node.by, NODE_HOLD_SCORE_PER_SEC * dts);
      } else if (node.owner === NEUTRAL && node.by !== NEUTRAL) {
        node.progress = Math.min(1, node.progress + NODE_CAPTURE_PER_SEC * dts);
        if (node.progress >= 1) {
          node.owner = node.by;
          this.bumpMeta("f" + node.by, FACTION_CAPTURE_SCORE);
          // credit the players who channelled it (quest "capture" objective)
          for (const pl of this.players.values()) {
            if (!pl.dead && pl.faction === node.by && dist2(pl.x, pl.y, node.x, node.y) <= CR2)
              this.questEvent(pl, "capture");
          }
        }
      } else {
        // owned but contested by an enemy, or nobody channelling → erode the hold
        const rate = node.by === NEUTRAL ? NODE_DECAY_PER_SEC : NODE_CAPTURE_PER_SEC;
        node.progress = Math.max(0, node.progress - rate * dts);
        if (node.progress <= 0) node.owner = NEUTRAL;
      }
    }

    // 5) broadcast — PER-CLIENT area-of-interest: each player is only sent the
    // entities within AOI_RADIUS of their own position (always including itself).
    const sing = round2(this.meta["singularity"] ?? 0);
    const season = Math.round(this.meta["season"] ?? 1);
    const factions = Array.from({ length: FACTION_COUNT }, (_, i) => Math.round(this.meta["f" + i] ?? 0));
    const control = this.districtControl();
    const roster = [...this.players.values()].map((p) => ({ id: p.id, faction: p.faction, level: p.level }));
    for (const [ws, id] of this.sessions) {
      const viewer = this.players.get(id);
      if (!viewer) continue;
      try {
        ws.send(this.snapshotFor(viewer, sing, meltdown, season, factions, control, roster));
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

  /** Build the AOI-filtered snapshot a single viewer should receive. */
  private snapshotFor(
    viewer: PlayerState,
    sing: number,
    meltdown: boolean,
    season: number,
    factions: number[],
    control: number,
    roster: Array<{ id: string; faction: number; level: number }>,
  ): string {
    const R2 = AOI_RADIUS * AOI_RADIUS;
    const near = (x: number, y: number) => dist2(viewer.x, viewer.y, x, y) <= R2;
    const players = [];
    for (const p of this.players.values()) {
      if (p.id !== viewer.id && !near(p.x, p.y)) continue;
      players.push({
        id: p.id,
        x: round2(p.x),
        y: round2(p.y),
        ack: p.ack,
        hp: Math.max(0, Math.round(p.hp)),
        dead: p.dead,
        credits: p.credits,
        cores: p.cores,
        xp: p.xp,
        level: p.level,
        faction: p.faction,
        questStep: p.questStep,
        questProgress: p.questProgress,
        look: p.look,
      });
    }
    const enemies = [];
    for (const e of this.enemies.values()) {
      if (e.hp > 0 && near(e.x, e.y)) enemies.push({ id: e.id, x: round2(e.x), y: round2(e.y), hp: Math.round(e.hp) });
    }
    const shots = [];
    for (const s of this.shots) {
      if (near(s.x, s.y)) shots.push({ id: s.id, x: round2(s.x), y: round2(s.y), team: s.team });
    }
    const pickups = [];
    for (const pu of this.pickups.values()) {
      if (near(pu.x, pu.y)) pickups.push({ id: pu.id, x: round2(pu.x), y: round2(pu.y), kind: pu.kind });
    }
    const nodes = [];
    for (const n of this.nodes) {
      if (near(n.x, n.y))
        nodes.push({ id: n.id, x: round2(n.x), y: round2(n.y), owner: n.owner, progress: round2(n.progress), by: n.by });
    }
    return JSON.stringify({
      t: "state",
      tick: this.tick,
      players,
      enemies,
      shots,
      pickups,
      nodes,
      sing,
      meltdown,
      season,
      factions,
      control,
      roster,
    });
  }

  /** End-of-meltdown era reset. Guarded so only the DO that actually zeroes the
   *  Singularity bumps the season — works correctly even with multiple zones. */
  private async resetEra() {
    this.meta["singularity"] = 0; // local immediate (stops the meltdown this tick)
    this.metaDelta["singularity"] = 0;
    try {
      const r = await this.env.DB.prepare(
        "UPDATE world_meta SET v = 0 WHERE k = 'singularity' AND v >= ?",
      )
        .bind(SING_MAX)
        .run();
      if (r.meta.changes > 0) {
        await this.env.DB.prepare(
          "INSERT INTO world_meta (k, v) VALUES ('season', 2) ON CONFLICT(k) DO UPDATE SET v = v + 1",
        ).run();
      }
      const { results } = await this.env.DB.prepare("SELECT k, v FROM world_meta").all<{
        k: string;
        v: number;
      }>();
      for (const row of results ?? []) this.meta[row.k] = row.v;
    } catch {
      /* D1 hiccup — next tick retries (singularity is already 0 locally) */
    }
  }

  /** Which faction holds the most nodes in this district (NEUTRAL if none). */
  private districtControl(): number {
    const counts = new Array(FACTION_COUNT).fill(0);
    let any = false;
    for (const n of this.nodes)
      if (n.owner !== NEUTRAL) {
        counts[n.owner]++;
        any = true;
      }
    if (!any) return NEUTRAL;
    let best = 0;
    for (let i = 1; i < FACTION_COUNT; i++) if (counts[i] > counts[best]) best = i;
    return best;
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
      await this.upsert(p.id, p.name, p.x, p.y, p.credits, p.xp, p.cores, p.questStep);
    }
    await this.syncMeta();
  }

  /** Flush queued meta increments to D1 atomically (so every zone DO contributes to
   *  ONE shared set of meters), then re-read the global values. */
  private async syncMeta() {
    try {
      for (const k of Object.keys(this.metaDelta)) {
        const d = round2(this.metaDelta[k]);
        this.metaDelta[k] = 0;
        if (d <= 0) continue;
        const cap = k === "singularity" ? SING_MAX : 1e12;
        await this.env.DB.prepare(
          "INSERT INTO world_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = MIN(?, v + ?)",
        )
          .bind(k, d, cap, d)
          .run();
      }
      const { results } = await this.env.DB.prepare("SELECT k, v FROM world_meta").all<{
        k: string;
        v: number;
      }>();
      for (const r of results ?? []) this.meta[r.k] = r.v;
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
    cores: number,
    questStep: number,
  ) {
    try {
      await this.env.DB.prepare(
        "INSERT INTO players (id, name, x, y, zone, credits, xp, cores, quest_step, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) " +
          "ON CONFLICT(id) DO UPDATE SET x=excluded.x, y=excluded.y, credits=excluded.credits, xp=excluded.xp, cores=excluded.cores, quest_step=excluded.quest_step, updated_at=excluded.updated_at",
      )
        .bind(id, name, round2(x), round2(y), this.zoneName, Math.round(credits), Math.round(xp), Math.round(cores), Math.round(questStep), Date.now())
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
      const tr = this.tradeOf(p);
      if (tr) this.endTrade(tr, "cancelled", "trade partner left");
      this.leaveParty(p);
      this.pendingInvites.delete(p.id);
      await this.upsert(p.id, p.name, p.x, p.y, p.credits, p.xp, p.cores, p.questStep);
      await this.syncMeta();
      this.players.delete(id);
    }
  }
}
