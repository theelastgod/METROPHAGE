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
  inPvpZone,
} from "../../src/net/sim";
import { buildGrid, spawnPoint, isWall, buildSafehouse, SAFEHOUSE_SPAWN, type TileGrid } from "../../src/world/district";
import { DISTRICTS } from "../../src/game/districts";
import { rollItem, rollModsFor, effectiveMods, nextRarity, SLOTS, type Item, type Slot, type Rarity } from "../../src/game/items";
import {
  upgradeCost,
  reforgeCost,
  salvageYield,
  fuseCost,
  canUpgrade,
  canFuse,
  UPGRADE_MAX,
  type Cost,
} from "../../src/game/crafting";
import { addMods, ZERO_MODS, type ModBag } from "../../src/game/stats";
import { achievementsForStat, type StatKey } from "../../src/game/achievements";
import { GUILD_CREATE_COST, guildLevel, guildPerkPct, validateGuild } from "../../src/game/guilds";
import { listingFee, MIN_PRICE, MAX_PRICE } from "../../src/game/market";
import { dailyContracts, getDaily, currentDay, repTier, type DailyObjective } from "../../src/game/dailies";
import { verifyWalletLogin } from "./auth";

/** Inventory is capped so the persisted JSON stays bounded; oldest drops out (FIFO). */
const INVENTORY_CAP = 24;

/** Defensive JSON → Item[] parse for the persisted inventory column. */
function parseInventory(raw: string | null | undefined): Item[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as Item[]).slice(0, INVENTORY_CAP) : [];
  } catch {
    return [];
  }
}

/** Aggregate the EFFECTIVE (forge-upgraded) mods of every equipped item into one ModBag. */
function deriveMods(equipped: Partial<Record<Slot, Item>>): ModBag {
  let bag = ZERO_MODS;
  for (const it of Object.values(equipped)) if (it) bag = addMods(bag, effectiveMods(it));
  return bag;
}

/** Defensive JSON → equipped map (slot → Item) for the persisted equipped column. */
function parseEquipped(raw: string | null | undefined): Partial<Record<Slot, Item>> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<Record<Slot, Item>>) : {};
  } catch {
    return {};
  }
}

/** Defensive JSON → PlayerLook parse for the persisted look column. */
function parseLook(raw: string | null | undefined): PlayerLook | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as PlayerLook) : undefined;
  } catch {
    return undefined;
  }
}
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
  pvpSafeUntil: number; // tick until which the player is immune to PvP (spawn protection)
  credits: number;
  cores: number;
  inventory: Item[]; // server-authoritative loot, persisted as JSON (capped FIFO)
  equipped: Partial<Record<Slot, Item>>; // gear by slot; its mods boost combat
  mods: ModBag; // aggregate of the equipped mods (cached; recomputed on change)
  maxHp: number; // PLAYER_HP + mods.hpAdd
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
  lastEmoteTick: number;
  // questline (The Blank — per-player, server-authoritative)
  questStep: number;
  questProgress: number;
  // achievements + leaderboards — cross-zone lifetime counters persisted to D1 player_stats
  stats: Record<string, number>; // additive counters (kills, bosses, captures, credits, pvp)
  statDelta: Record<string, number>; // unflushed increments queued for D1
  deepest: number; // deepest district reached (1-based); flushed with a MAX upsert
  deepestDirty: boolean;
  achv: Set<string>; // unlocked achievement ids
  achvNew: string[]; // unlocked-this-session ids queued for D1 insert
  // guild ("Cell") membership — cached from the D1 registry, refreshed on change
  guildId: number; // 0 = none
  guildRank: string; // leader | officer | member | ""
  guildBonus: number; // credit-find perk fraction from the cell level
  // daily contracts (reputation lives in stats['rep']) — per-day progress, persisted to D1
  dailyDay: number; // the UTC day these contracts belong to
  dailies: Array<{ id: string; progress: number; done: boolean }>;
  dailyDirty: boolean;
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
  maxHp: number; // full HP (= arch.hp for regulars; the boss pool for bosses) — drives revive + the client HP bar
  respawnTick: number;
  lastFireTick: number;
  kind: number; // index into ENEMY_ARCHES
  boss?: boolean; // a named world boss: tougher, hits harder, long respawn, broadcast kill
  name?: string;
  tint?: number; // boss accent colour (corp identity), for the client
}

/**
 * Server-authoritative HSS archetypes — stat variations of the same chase-and-fire AI
 * so online play gets the same threat variety as single-player. Index 0 (PATROL) is the
 * original baseline (unchanged balance); the rest diversify hp/speed/range/cadence/dmg.
 * Kept server-side (the client only renders a tint by `kind`).
 */
interface EnemyArch {
  hp: number;
  speed: number;
  fireRange: number;
  fireMs: number;
  dmg: number;
  projSpeed: number;
  loot: { chance: number; boost: number }; // drop chance + rarity boost — the loot table
}
const ENEMY_ARCHES: EnemyArch[] = [
  // 0 PATROL — baseline (imported constants, identical to the pre-archetype behavior)
  { hp: COP_HP, speed: ENEMY_SPEED, fireRange: ENEMY_FIRE_RANGE, fireMs: COP_FIRE_MS, dmg: ENEMY_DMG, projSpeed: ENEMY_PROJ_SPEED, loot: { chance: 0.5, boost: 0 } },
  // 1 WASP — fragile, fast, short-range, rapid weak shots; little loot
  { hp: 30, speed: 168, fireRange: 180, fireMs: 620, dmg: 5, projSpeed: 360, loot: { chance: 0.35, boost: 0 } },
  // 2 LANCER — sturdy, slow, long-range, heavy aimed shots; decent loot
  { hp: 60, speed: 88, fireRange: 430, fireMs: 1850, dmg: 24, projSpeed: 520, loot: { chance: 0.55, boost: 0.35 } },
  // 3 HOUND — fast rusher, gets point-blank then hammers
  { hp: 80, speed: 200, fireRange: 95, fireMs: 1000, dmg: 16, projSpeed: 300, loot: { chance: 0.5, boost: 0.2 } },
  // 4 ENFORCER — heavy riot tank: slow, very durable, heavy shots; reliably good loot
  { hp: 200, speed: 72, fireRange: 260, fireMs: 1300, dmg: 26, projSpeed: 320, loot: { chance: 0.85, boost: 1.2 } },
  // 5 SNIPER — extreme range, slow heavy aimed shots, fragile
  { hp: 55, speed: 70, fireRange: 540, fireMs: 2400, dmg: 40, projSpeed: 560, loot: { chance: 0.7, boost: 1.0 } },
  // 6 WRAITH — fast elite skirmisher: rushes + harries; the best grunt loot
  { hp: 130, speed: 220, fireRange: 150, fireMs: 700, dmg: 14, projSpeed: 360, loot: { chance: 0.8, boost: 1.6 } },
];

/** World bosses: tough, named HSS commanders (real surveillance corps). One per zone,
 *  parked at the deepest post; killing one drops guaranteed gear and broadcasts, then it
 *  reforms after BOSS_RESPAWN_MS so other players keep finding + fighting it. */
const BOSS_RESPAWN_MS = 30000;
const BOSS_DMG_MULT = 2.2; // boss shots hit harder than the base archetype
const BOSS_KIND = 2; // borrow the lancer's sturdy long-range AI
interface WorldBoss {
  name: string;
  tint: number;
  hp: number;
}
const BOSS_ROSTER: WorldBoss[] = [
  { name: "THE GUTTER KING", tint: 0x8bff6a, hp: 460 },
  { name: "ANDURIL SENTINEL", tint: 0xff7a3c, hp: 560 },
  { name: "HELIOS WARDEN", tint: 0xffe08a, hp: 680 },
  { name: "PALANTIR ORACLE", tint: 0x4d8cff, hp: 600 },
];

/** Vendor — the credits sink. A field-patch heal, and gear "caches" that roll an item of
 *  a guaranteed rarity floor into the bag (feeding the equip loop). Server-authoritative:
 *  it validates + deducts credits, so a client can't conjure gear it can't afford. */
interface ShopItem {
  price: number;
  label: string;
  rarity?: Rarity; // a gear cache of this rarity
  heal?: boolean; // restore to full HP instead
  repReq?: number; // minimum reputation tier required (vendor tiers unlocked by rep)
}
const SHOP: Record<string, ShopItem> = {
  heal: { price: 40, label: "FIELD PATCH", heal: true },
  cache_standard: { price: 60, label: "SALVAGE CACHE", rarity: "standard" },
  cache_tuned: { price: 180, label: "TUNED CACHE", rarity: "tuned" },
  cache_blackice: { price: 480, label: "BLACK-ICE CACHE", rarity: "blackice", repReq: 1 },
  cache_singular: { price: 1200, label: "SINGULAR CACHE", rarity: "singular", repReq: 2 },
};

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
  private interior = false; // the safehouse zone — no enemies, no PvP
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
      const z = await state.storage.get<string | number>("zone");
      if (typeof z === "string") this.initZone(z); // "safe" or "dN"
      else if (typeof z === "number") this.initZone("d" + z); // legacy numeric
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
    // SAFEHOUSE — a no-combat social interior: build the room, NO enemies/boss/territory.
    if (zone === "safe") {
      this.interior = true;
      this.zoneName = "safe";
      this.districtIndex = 0;
      this.grid = buildSafehouse();
      this.spawn = SAFEHOUSE_SPAWN;
      this.nodes = [];
      void this.state.storage.put("zone", "safe"); // a wake re-binds the safehouse
      return;
    }
    this.districtIndex = parseZone(zone);
    this.zoneName = "d" + this.districtIndex;
    void this.state.storage.put("zone", this.zoneName); // store the zone NAME so "safe" survives a wake
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

  /** Seed a handful of cops at the district's cop-posts (walkable tiles only). The
   *  archetype is rotated across posts (and biased by district threat) so every zone
   *  fields a varied garrison: patrol/wasp/lancer/hound. */
  private spawnEnemies(def: (typeof DISTRICTS)[number]) {
    // Rotation patterns by threat tier — tougher districts skew toward lancers/hounds.
    const pattern =
      this.districtIndex <= 0
        ? [0, 4, 1, 2, 0, 1] // early: a heavy ENFORCER joins the grunts
        : this.districtIndex === 1
          ? [0, 1, 2, 3, 5, 4, 1] // mid: SNIPER + ENFORCER
          : [2, 3, 4, 5, 6, 2, 0, 6]; // deep: the full bestiary incl. WRAITH elites
    let i = 0;
    for (const [tx, ty] of def.copPosts) {
      if (isWall(this.grid[ty]?.[tx])) continue;
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      const id = this.nextEnemyId++;
      const kind = pattern[i++ % pattern.length];
      this.enemies.set(id, { id, x, y, ox: x, oy: y, hp: ENEMY_ARCHES[kind].hp, maxHp: ENEMY_ARCHES[kind].hp, respawnTick: 0, lastFireTick: 0, kind });
    }
    // World boss — a named HSS commander at the post farthest from the player spawn, so it
    // reads as a destination. It reforms on its own timer after a kill (see the kill handler).
    const boss = BOSS_ROSTER[this.districtIndex % BOSS_ROSTER.length];
    let lair = { x: WORLD_W - this.spawn.x, y: WORLD_H - this.spawn.y }; // fallback: opposite end
    let far = -1;
    for (const [tx, ty] of def.copPosts) {
      if (isWall(this.grid[ty]?.[tx])) continue;
      const wx = tx * TILE + TILE / 2;
      const wy = ty * TILE + TILE / 2;
      const dd = (wx - this.spawn.x) ** 2 + (wy - this.spawn.y) ** 2;
      if (dd > far) {
        far = dd;
        lair = { x: wx, y: wy };
      }
    }
    const bid = this.nextEnemyId++;
    this.enemies.set(bid, {
      id: bid,
      x: lair.x,
      y: lair.y,
      ox: lair.x,
      oy: lair.y,
      hp: boss.hp,
      maxHp: boss.hp,
      respawnTick: 0,
      lastFireTick: 0,
      kind: BOSS_KIND,
      boss: true,
      name: boss.name,
      tint: boss.tint,
    });
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

  /** Send a message to every connected socket in this zone (boss kill feed, era flips, …). */
  private broadcast(msg: unknown) {
    for (const sock of this.sessions.keys()) this.send(sock, msg);
  }

  private async handle(ws: WebSocket, raw: string) {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw) as ClientMsg;
    } catch {
      return;
    }
    if (msg.t === "login")
      return this.onLogin(ws, msg.name, msg.faction, msg.look, {
        wallet: msg.wallet,
        sig: msg.sig,
        ts: msg.ts,
      });
    if (msg.t === "input") return this.onInput(ws, msg);
    if (msg.t === "fire") return this.onFire(ws, msg);
    if (msg.t === "equip") return this.onEquip(ws, msg);
    if (msg.t === "unequip") return this.onUnequip(ws, msg);
    if (msg.t === "craft") return this.onCraft(ws, msg);
    if (msg.t === "buy") return this.onBuy(ws, msg);
    if (msg.t === "chat") return this.onChat(ws, msg);
    if (msg.t === "guild") return this.onGuild(ws, msg);
    if (msg.t === "market") return this.onMarket(ws, msg);
    if (msg.t === "party") return this.onParty(ws, msg);
    if (msg.t === "mute") return this.onMute(ws, msg);
    if (msg.t === "emote") return this.onEmote(ws, msg);
    if (msg.t === "trade") return this.onTrade(ws, msg);
  }

  /** Emote (anchored to the sender) / world ping — relayed to everyone within AOI. */
  private onEmote(ws: WebSocket, msg: Extract<ClientMsg, { t: "emote" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    if ((this.tick - p.lastEmoteTick) * NET_TICK_MS < 700) return; // rate-limit ~1.4/s
    p.lastEmoteTick = this.tick;
    const ping = !!msg.ping;
    const x = ping ? msg.x : p.x; // a ping carries a world point; an emote anchors to the sender
    const y = ping ? msg.y : p.y;
    const out = { t: "emote", from: p.id, kind: msg.kind | 0, ping, x: round2(x), y: round2(y) };
    const r2 = AOI_RADIUS * AOI_RADIUS;
    for (const other of this.players.values()) {
      const dx = other.x - x;
      const dy = other.y - y;
      if (dx * dx + dy * dy <= r2) this.sendTo(other.id, out); // includes the sender (sees own ping)
    }
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
    } else if (msg.ch === "guild") {
      // Cell chat — reaches guildmates in THIS zone (cross-zone fanout would need a hub DO).
      if (!p.guildId) {
        this.send(ws, { t: "sys", text: "you're not in a cell" });
        return;
      }
      this.guildBroadcast(p.guildId, out, p.id);
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

  // ── guilds ("Cells") — cross-zone registry in D1; this DO mutates rows for its members ──
  /** Send a message to every connected member of a guild in THIS zone (optionally mute-aware). */
  private guildBroadcast(gid: number, msg: unknown, fromId?: string) {
    for (const [sock, id] of this.sessions) {
      const r = this.players.get(id);
      if (!r || r.guildId !== gid) continue;
      if (fromId && r.muted.has(fromId)) continue;
      try {
        sock.send(JSON.stringify(msg));
      } catch {
        /* dropped */
      }
    }
  }

  /** Push a player their current cell summary + roster (or "none"). */
  private async sendGuild(ws: WebSocket, p: PlayerState) {
    if (!p.guildId) {
      this.send(ws, { t: "guild", state: "none" });
      return;
    }
    const g = await this.env.DB.prepare("SELECT id, name, tag, xp, bank_credits, bank_cores FROM guilds WHERE id = ?")
      .bind(p.guildId)
      .first<{ id: number; name: string; tag: string; xp: number; bank_credits: number; bank_cores: number }>();
    if (!g) {
      p.guildId = 0;
      p.guildRank = "";
      p.guildBonus = 0;
      this.send(ws, { t: "guild", state: "none" });
      return;
    }
    const ms = await this.env.DB.prepare("SELECT player, rank FROM guild_members WHERE guild_id = ? ORDER BY joined_at ASC LIMIT 50")
      .bind(p.guildId)
      .all<{ player: string; rank: string }>();
    this.send(ws, {
      t: "guild",
      state: "info",
      guild: {
        id: g.id,
        name: g.name,
        tag: g.tag,
        level: guildLevel(g.xp),
        xp: g.xp,
        bankCredits: g.bank_credits,
        bankCores: g.bank_cores,
        rank: p.guildRank,
        members: (ms.results ?? []).map((m) => ({ id: m.player, rank: m.rank })),
      },
    });
  }

  /** Refresh the cached cell perk for every connected member after the cell's XP changes. */
  private async refreshGuildBonus(gid: number) {
    const g = await this.env.DB.prepare("SELECT xp FROM guilds WHERE id = ?").bind(gid).first<{ xp: number }>();
    const bonus = g ? guildPerkPct(guildLevel(g.xp)) : 0;
    for (const pl of this.players.values()) if (pl.guildId === gid) pl.guildBonus = bonus;
  }

  /** Remove a player from their cell, transferring leadership (or disbanding if empty). */
  private async removeFromGuild(p: PlayerState) {
    const gid = p.guildId;
    if (!gid) return;
    await this.env.DB.prepare("DELETE FROM guild_members WHERE player = ? AND guild_id = ?").bind(p.id, gid).run();
    if (p.guildRank === "leader") {
      const next = await this.env.DB.prepare("SELECT player FROM guild_members WHERE guild_id = ? ORDER BY joined_at ASC LIMIT 1")
        .bind(gid)
        .first<{ player: string }>();
      if (next) {
        await this.env.DB.prepare("UPDATE guilds SET leader = ? WHERE id = ?").bind(next.player, gid).run();
        await this.env.DB.prepare("UPDATE guild_members SET rank = 'leader' WHERE player = ? AND guild_id = ?").bind(next.player, gid).run();
        const np = this.players.get(next.player);
        if (np) np.guildRank = "leader";
      } else {
        await this.env.DB.prepare("DELETE FROM guilds WHERE id = ?").bind(gid).run(); // last one out — disband
      }
    }
    p.guildId = 0;
    p.guildRank = "";
    p.guildBonus = 0;
  }

  private async onGuild(ws: WebSocket, msg: Extract<ClientMsg, { t: "guild" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    const DB = this.env.DB;
    const sys = (text: string) => this.send(ws, { t: "sys", text });
    const isOfficer = p.guildRank === "leader" || p.guildRank === "officer";
    try {
      if (msg.action === "create") {
        if (p.guildId) return sys("you're already in a cell — leave it first");
        const name = (msg.name || "").trim().slice(0, 24);
        const tag = (msg.tag || "").trim().slice(0, 5).toUpperCase();
        const err = validateGuild(name, tag);
        if (err) return sys("cell: " + err);
        if (p.credits < GUILD_CREATE_COST) return sys(`founding a cell costs ₵${GUILD_CREATE_COST}`);
        if (await DB.prepare("SELECT id FROM guilds WHERE name = ?").bind(name).first()) return sys("that cell name is taken");
        p.credits -= GUILD_CREATE_COST;
        p.dirty = true;
        const now = Date.now();
        const res = await DB.prepare("INSERT INTO guilds (name, tag, leader, created_at) VALUES (?,?,?,?)").bind(name, tag, p.id, now).run();
        const gid = Number(res.meta.last_row_id);
        await DB.prepare("INSERT OR REPLACE INTO guild_members (player, guild_id, rank, joined_at) VALUES (?,?,?,?)").bind(p.id, gid, "leader", now).run();
        p.guildId = gid;
        p.guildRank = "leader";
        sys(`✶ founded cell [${tag}] ${name}`);
        await this.sendGuild(ws, p);
      } else if (msg.action === "invite") {
        if (!isOfficer) return sys("only a leader/officer can invite");
        const to = (msg.to || "").toLowerCase().replace(/[^a-z0-9_:-]/g, "");
        if (!to) return sys("invite who? (/ginvite <id>)");
        await DB.prepare("INSERT OR REPLACE INTO guild_invites (player, guild_id, at) VALUES (?,?,?)").bind(to, p.guildId, Date.now()).run();
        sys(`invited ${to} to the cell`);
        this.sendTo(to, { t: "sys", text: `you've been invited to a cell — type /gjoin` });
      } else if (msg.action === "accept") {
        if (p.guildId) return sys("leave your current cell first");
        const inv = await DB.prepare("SELECT guild_id FROM guild_invites WHERE player = ? ORDER BY at DESC LIMIT 1")
          .bind(p.id)
          .first<{ guild_id: number }>();
        if (!inv) return sys("no pending cell invite");
        const gid = inv.guild_id;
        if (!(await DB.prepare("SELECT id FROM guilds WHERE id = ?").bind(gid).first())) {
          await DB.prepare("DELETE FROM guild_invites WHERE player = ?").bind(p.id).run();
          return sys("that cell no longer exists");
        }
        await DB.prepare("INSERT OR REPLACE INTO guild_members (player, guild_id, rank, joined_at) VALUES (?,?,?,?)").bind(p.id, gid, "member", Date.now()).run();
        await DB.prepare("DELETE FROM guild_invites WHERE player = ?").bind(p.id).run();
        p.guildId = gid;
        p.guildRank = "member";
        await this.refreshGuildBonus(gid);
        sys("joined the cell");
        await this.sendGuild(ws, p);
        this.guildBroadcast(gid, { t: "sys", text: `${p.name} joined the cell` });
      } else if (msg.action === "leave") {
        if (!p.guildId) return sys("you're not in a cell");
        const gid = p.guildId;
        await this.removeFromGuild(p);
        sys("left the cell");
        this.send(ws, { t: "guild", state: "none" });
        this.guildBroadcast(gid, { t: "sys", text: `${p.name} left the cell` });
      } else if (msg.action === "deposit") {
        if (!p.guildId) return sys("join a cell first");
        const c = Math.max(0, Math.floor(msg.credits ?? 0));
        const k = Math.max(0, Math.floor(msg.cores ?? 0));
        if (c === 0 && k === 0) return sys("deposit how much? (/gdep <credits> [cores])");
        if (p.credits < c || p.cores < k) return sys("insufficient balance");
        p.credits -= c;
        p.cores -= k;
        p.dirty = true;
        await DB.prepare("UPDATE guilds SET bank_credits = bank_credits + ?, bank_cores = bank_cores + ?, xp = xp + ? WHERE id = ?")
          .bind(c, k, c, p.guildId)
          .run();
        await this.refreshGuildBonus(p.guildId); // deposits raise XP → maybe a new level + perk
        sys(`deposited ₵${c} ${k}◈ to the cell bank`);
        await this.sendGuild(ws, p);
      } else if (msg.action === "withdraw") {
        if (!isOfficer) return sys("only a leader/officer can withdraw");
        const c = Math.max(0, Math.floor(msg.credits ?? 0));
        const k = Math.max(0, Math.floor(msg.cores ?? 0));
        if (c === 0 && k === 0) return sys("withdraw how much? (/gwd <credits> [cores])");
        // atomic guarded decrement — dupe-proof against the live bank balance
        const r = await DB.prepare(
          "UPDATE guilds SET bank_credits = bank_credits - ?, bank_cores = bank_cores - ? WHERE id = ? AND bank_credits >= ? AND bank_cores >= ?",
        )
          .bind(c, k, p.guildId, c, k)
          .run();
        if (r.meta.changes === 0) return sys("cell bank can't cover that");
        p.credits += c;
        p.cores += k;
        p.dirty = true;
        sys(`withdrew ₵${c} ${k}◈ from the cell bank`);
        await this.sendGuild(ws, p);
      } else if (msg.action === "promote" || msg.action === "demote") {
        if (p.guildRank !== "leader") return sys("only the leader can change ranks");
        const to = (msg.to || "").toLowerCase();
        const m = await DB.prepare("SELECT rank FROM guild_members WHERE player = ? AND guild_id = ?").bind(to, p.guildId).first();
        if (!m || to === p.id) return sys("pick another cell member");
        const newRank = msg.action === "promote" ? "officer" : "member";
        await DB.prepare("UPDATE guild_members SET rank = ? WHERE player = ? AND guild_id = ?").bind(newRank, to, p.guildId).run();
        const op = this.players.get(to);
        if (op) op.guildRank = newRank;
        sys(`${to} is now ${newRank}`);
        await this.sendGuild(ws, p);
      } else if (msg.action === "kick") {
        if (p.guildRank !== "leader") return sys("only the leader can kick");
        const to = (msg.to || "").toLowerCase();
        if (to === p.id) return sys("can't kick yourself — use /gleave");
        const m = await DB.prepare("SELECT player FROM guild_members WHERE player = ? AND guild_id = ?").bind(to, p.guildId).first();
        if (!m) return sys("not a cell member");
        await DB.prepare("DELETE FROM guild_members WHERE player = ? AND guild_id = ?").bind(to, p.guildId).run();
        const op = this.players.get(to);
        if (op) {
          op.guildId = 0;
          op.guildRank = "";
          op.guildBonus = 0;
          this.sendTo(to, { t: "guild", state: "none" });
          this.sendTo(to, { t: "sys", text: "you were removed from the cell" });
        }
        sys(`kicked ${to}`);
        await this.sendGuild(ws, p);
      } else if (msg.action === "info") {
        await this.sendGuild(ws, p);
      }
    } catch {
      sys("cell action failed");
    }
  }

  // ── auction house — cross-zone player market (D1); item escrowed, buy is atomic ──
  private parseItemJson(raw: string | null | undefined): Item | null {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Item) : null;
    } catch {
      return null;
    }
  }

  /** Push the current open listings (newest first) to one viewer. */
  private async sendMarket(ws: WebSocket) {
    try {
      const { results } = await this.env.DB.prepare(
        "SELECT id, seller, seller_name, item, price, currency FROM auctions WHERE status='open' ORDER BY created_at DESC LIMIT 60",
      ).all<{ id: number; seller: string; seller_name: string; item: string; price: number; currency: string }>();
      const listings = [];
      for (const r of results ?? []) {
        const it = this.parseItemJson(r.item);
        if (it) listings.push({ id: r.id, seller: r.seller, sellerName: r.seller_name, item: it, price: r.price, currency: r.currency });
      }
      this.send(ws, { t: "market", listings });
    } catch {
      this.send(ws, { t: "market", listings: [] });
    }
  }

  private async onMarket(ws: WebSocket, msg: Extract<ClientMsg, { t: "market" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    const DB = this.env.DB;
    const sys = (text: string) => this.send(ws, { t: "sys", text });
    try {
      if (msg.action === "browse") {
        await this.drainMail(p); // a good moment to collect any sale proceeds
        await this.sendMarket(ws);
        return;
      }
      if (msg.action === "list") {
        const currency = msg.currency === "metro" ? "metro" : "credits";
        if (currency === "metro") return sys("the $METRO market is gated (devnet / counsel)");
        const price = Math.floor(msg.price ?? 0);
        if (!(price >= MIN_PRICE && price <= MAX_PRICE)) return sys(`price must be ₵${MIN_PRICE}–${MAX_PRICE}`);
        const idx = p.inventory.findIndex((it) => it.id === msg.itemId);
        if (idx < 0) return sys("can only list items in your bag (unequip first)");
        const fee = listingFee(price);
        if (p.credits < fee) return sys(`listing fee is ₵${fee}`);
        const item = p.inventory[idx];
        // ESCROW: remove from the bag FIRST (dupe-proof), then write the listing row
        p.inventory.splice(idx, 1);
        p.credits -= fee;
        p.dirty = true;
        await DB.prepare("INSERT INTO auctions (seller, seller_name, item, price, currency, status, created_at) VALUES (?,?,?,?,?,'open',?)")
          .bind(p.id, p.name, JSON.stringify(item), price, currency, Date.now())
          .run();
        sys(`listed ${item.name} for ₵${price} (fee ₵${fee})`);
        this.send(ws, { t: "inv", items: p.inventory });
        await this.sendMarket(ws);
        return;
      }
      if (msg.action === "cancel") {
        const id = msg.id ?? -1;
        const row = await DB.prepare("SELECT item FROM auctions WHERE id=? AND seller=? AND status='open'").bind(id, p.id).first<{ item: string }>();
        if (!row) return sys("no such open listing of yours");
        const r = await DB.prepare("UPDATE auctions SET status='cancelled' WHERE id=? AND seller=? AND status='open'").bind(id, p.id).run();
        if (r.meta.changes === 0) return sys("listing already gone");
        const item = this.parseItemJson(row.item);
        if (item) {
          p.inventory.push(item);
          if (p.inventory.length > INVENTORY_CAP) p.inventory.shift();
          p.dirty = true;
          this.send(ws, { t: "inv", items: p.inventory });
        }
        sys("listing cancelled — item returned to your bag");
        await this.sendMarket(ws);
        return;
      }
      if (msg.action === "buy") {
        const id = msg.id ?? -1;
        const row = await DB.prepare("SELECT seller, seller_name, item, price, currency FROM auctions WHERE id=? AND status='open'")
          .bind(id)
          .first<{ seller: string; seller_name: string; item: string; price: number; currency: string }>();
        if (!row) return sys("that listing is gone");
        if (row.seller === p.id) return sys("you can't buy your own listing");
        if (row.currency !== "credits") return sys("the $METRO market is gated");
        const price = row.price;
        if (p.credits < price) return sys(`not enough credits (₵${price})`);
        // ATOMIC claim — a single buyer wins the row; ONLY then do money + item move
        const claim = await DB.prepare("UPDATE auctions SET status='sold', buyer=? WHERE id=? AND status='open'").bind(p.id, id).run();
        if (claim.meta.changes === 0) return sys("someone else just bought it");
        const item = this.parseItemJson(row.item);
        p.credits -= price;
        p.dirty = true;
        if (item) {
          p.inventory.push(item);
          if (p.inventory.length > INVENTORY_CAP) p.inventory.shift();
          this.send(ws, { t: "inv", items: p.inventory });
        }
        // pay the seller: in-memory if they're in THIS zone, else via the cross-zone mailbox
        const seller = this.players.get(row.seller);
        if (seller) {
          seller.credits += price;
          seller.dirty = true;
          this.bumpStat(seller, "credits", price);
          this.sendTo(seller.id, { t: "sys", text: `✦ sold ${item?.name ?? "item"} for ₵${price}` });
        } else {
          await DB.prepare("INSERT INTO mailbox (player, credits, reason, created_at) VALUES (?,?,?,?)").bind(row.seller, price, "auction sale", Date.now()).run();
        }
        sys(`bought ${item?.name ?? "item"} for ₵${price}`);
        await this.sendMarket(ws);
        return;
      }
    } catch {
      sys("market action failed");
    }
  }

  /** Drain a player's cross-zone mailbox into their live state (claim-once: rows deleted). */
  private async drainMail(p: PlayerState): Promise<boolean> {
    try {
      const { results } = await this.env.DB.prepare("SELECT id, credits, cores, item FROM mailbox WHERE player=? LIMIT 50")
        .bind(p.id)
        .all<{ id: number; credits: number; cores: number; item: string | null }>();
      if (!results || results.length === 0) return false;
      let dc = 0;
      let dk = 0;
      const items: Item[] = [];
      const ids: number[] = [];
      for (const r of results) {
        dc += r.credits || 0;
        dk += r.cores || 0;
        const it = this.parseItemJson(r.item);
        if (it) items.push(it);
        ids.push(r.id);
      }
      p.credits += dc;
      p.cores += dk;
      for (const it of items) {
        p.inventory.push(it);
        if (p.inventory.length > INVENTORY_CAP) p.inventory.shift();
      }
      p.dirty = true;
      await this.env.DB.prepare(`DELETE FROM mailbox WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).run();
      if (dc || dk) this.sendTo(p.id, { t: "sys", text: `✉ received ₵${dc}${dk ? ` ${dk}◈` : ""} from the market` });
      if (items.length) this.sendTo(p.id, { t: "inv", items: p.inventory });
      return true;
    } catch {
      return false;
    }
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

  private async onLogin(
    ws: WebSocket,
    rawName: string,
    faction?: number,
    look?: PlayerLook,
    proof?: { wallet?: string; sig?: string; ts?: number },
  ) {
    const name = (rawName || "").trim().slice(0, 16) || "blank";
    // Identity: a signature-verified Solana wallet is the durable id; otherwise a guest
    // id derived from the callsign (dev / no-wallet play). A claimed-but-unverified
    // wallet is rejected so a stranger can't assume someone else's account.
    let id: string;
    if (proof?.wallet || proof?.sig) {
      const wid =
        proof.wallet && proof.sig && Number.isFinite(proof.ts)
          ? verifyWalletLogin({ wallet: proof.wallet, sig: proof.sig, ts: proof.ts! })
          : null;
      if (!wid) {
        this.send(ws, { t: "sys", text: "wallet sign-in failed — bad signature or stale request" });
        try {
          ws.close(4001, "auth");
        } catch {
          /* already closing */
        }
        return;
      }
      id = wid;
    } else {
      id = name.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "blank";
    }
    const fac = Number.isInteger(faction) && faction! >= 0 && faction! < FACTION_COUNT ? faction! : 0;
    const p = this.players.get(id) ?? (await this.loadPlayer(id, name, fac));
    p.faction = fac;
    // Appearance: a client-supplied look wins + is persisted; otherwise keep the one
    // loaded from D1 (so traits survive relogin even if the client has no local save).
    if (look) {
      p.look = look;
      p.dirty = true;
    }
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
    this.send(ws, { t: "inv", items: p.inventory }); // hydrate their held gear
    this.sendLoadout(ws, p); // hydrate equipped gear + derived max HP
    this.noteDeepest(p); // arriving in this district may set a "deepest reached" milestone
    this.send(ws, { t: "achv", ids: [...p.achv] }); // hydrate the unlocked achievement set
    await this.sendGuild(ws, p); // hydrate cell membership/bank/roster (cross-zone, D1)
    await this.drainMail(p); // collect any auction proceeds that arrived while away
    this.sendContracts(ws, p); // hydrate today's daily contracts + reputation
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
    let inventory: Item[] = [];
    let look: PlayerLook | undefined;
    let equipped: Partial<Record<Slot, Item>> = {};
    const row = await this.env.DB.prepare(
      "SELECT x, y, credits, xp, zone, cores, quest_step, inventory, look, equipped FROM players WHERE id = ?",
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
        inventory: string;
        look: string | null;
        equipped: string;
      }>();
    if (row) {
      credits = row.credits ?? 0;
      xp = row.xp ?? 0;
      cores = row.cores ?? 0;
      questStep = row.quest_step ?? 0;
      inventory = parseInventory(row.inventory);
      look = parseLook(row.look);
      equipped = parseEquipped(row.equipped);
      // Same zone → resume exact position. Different zone → they just travelled in,
      // so spawn at this district's entrance (x,y already hold the spawn).
      if (row.zone === this.zoneName) {
        x = row.x;
        y = row.y;
      }
    } else {
      await this.upsert(id, name, x, y, 0, 0, 0, 0, [], undefined, {});
    }
    // achievements + leaderboard counters (cross-zone, shared D1)
    const stats: Record<string, number> = {};
    const achv = new Set<string>();
    try {
      const sres = await this.env.DB.prepare("SELECT stat, v FROM player_stats WHERE player = ?")
        .bind(id)
        .all<{ stat: string; v: number }>();
      for (const r of sres.results ?? []) stats[r.stat] = r.v;
      const ares = await this.env.DB.prepare("SELECT ach FROM player_achv WHERE player = ?")
        .bind(id)
        .all<{ ach: string }>();
      for (const r of ares.results ?? []) achv.add(r.ach);
    } catch {
      /* tables may not exist before migration */
    }
    const storedDeep = stats["deepest"] ?? 0;
    const deepest = Math.max(storedDeep, this.districtIndex + 1);
    // guild ("Cell") membership + the cell-level credit-find perk (cross-zone, shared D1)
    let guildId = 0;
    let guildRank = "";
    let guildBonus = 0;
    try {
      const gm = await this.env.DB.prepare("SELECT guild_id, rank FROM guild_members WHERE player = ?")
        .bind(id)
        .first<{ guild_id: number; rank: string }>();
      if (gm) {
        guildId = gm.guild_id;
        guildRank = gm.rank;
        const gx = await this.env.DB.prepare("SELECT xp FROM guilds WHERE id = ?").bind(guildId).first<{ xp: number }>();
        if (gx) guildBonus = guildPerkPct(guildLevel(gx.xp));
        else {
          guildId = 0; // membership row orphaned (guild was disbanded) — treat as none
          guildRank = "";
        }
      }
    } catch {
      /* tables may not exist before migration */
    }
    // daily contracts — today's day-seeded set, merged with any saved per-player progress
    const dailyDay = currentDay();
    const dailies = dailyContracts(dailyDay).map((c) => ({ id: c.id, progress: 0, done: false }));
    try {
      const dres = await this.env.DB.prepare("SELECT contract_id, progress, done FROM player_dailies WHERE player = ? AND day = ?")
        .bind(id, dailyDay)
        .all<{ contract_id: string; progress: number; done: number }>();
      for (const r of dres.results ?? []) {
        const d = dailies.find((x) => x.id === r.contract_id);
        if (d) {
          d.progress = r.progress;
          d.done = !!r.done;
        }
      }
    } catch {
      /* table may not exist before migration */
    }
    const mods = deriveMods(equipped);
    const maxHp = PLAYER_HP + Math.round(mods.hpAdd);
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
      hp: maxHp,
      dead: false,
      respawnTick: 0,
      pvpSafeUntil: 0,
      credits,
      cores,
      inventory,
      equipped,
      mods,
      maxHp,
      aim: 0,
      lastFireTick: -999,
      xp,
      level: levelForXp(xp),
      faction: fac,
      party: -1,
      muted: new Set<string>(),
      lastChatTick: -999,
      lastEmoteTick: -999,
      questStep,
      questProgress: 0,
      stats,
      statDelta: {},
      deepest,
      deepestDirty: deepest > storedDeep,
      achv,
      achvNew: [],
      guildId,
      guildRank,
      guildBonus,
      dailyDay,
      dailies,
      dailyDirty: false,
      look,
    };
  }

  /** Re-attach a hibernated socket to its player after an eviction wake (no welcome —
   *  the client never disconnected, it just resumes receiving snapshots). */
  private async resumeSession(ws: WebSocket, att: SessionAttach) {
    this.sessions.set(ws, att.id);
    if (!this.players.has(att.id)) {
      const p = await this.loadPlayer(att.id, att.name, att.faction);
      if (att.look) p.look = att.look; // restore appearance from the socket attachment
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

  // ── achievements + leaderboards (cross-zone counters, persisted to D1) ──────
  private statVal(p: PlayerState, stat: StatKey): number {
    return stat === "deepest" ? p.deepest : p.stats[stat] ?? 0;
  }

  /** Increment a lifetime counter (queued for D1) and check for any newly-crossed milestone. */
  private bumpStat(p: PlayerState, stat: StatKey, n = 1) {
    if (n <= 0) return;
    p.stats[stat] = (p.stats[stat] ?? 0) + n;
    p.statDelta[stat] = (p.statDelta[stat] ?? 0) + n;
    this.checkAchv(p, stat);
  }

  /** Record the deepest district this player has reached (a MAX, not a sum). */
  private noteDeepest(p: PlayerState) {
    if (this.districtIndex + 1 > p.deepest) {
      p.deepest = this.districtIndex + 1;
      p.deepestDirty = true;
      this.checkAchv(p, "deepest");
    }
  }

  /** Unlock + reward any achievement whose threshold the given stat just crossed. */
  private checkAchv(p: PlayerState, stat: StatKey) {
    const v = this.statVal(p, stat);
    for (const a of achievementsForStat(stat)) {
      if (v >= a.threshold && !p.achv.has(a.id)) {
        p.achv.add(a.id);
        p.achvNew.push(a.id);
        p.credits += a.reward; // server-authoritative reward (rides the next snapshot)
        p.dirty = true;
        this.sendTo(p.id, { t: "ach", id: a.id, name: a.name, reward: a.reward });
      }
    }
  }

  // ── daily contracts + reputation (rep is the cross-zone stats['rep'] counter) ──
  private repOf(p: PlayerState): number {
    return p.stats["rep"] ?? 0;
  }

  private sendContracts(ws: WebSocket, p: PlayerState) {
    const rep = this.repOf(p);
    const list = p.dailies.map((d) => {
      const c = getDaily(d.id)!;
      return {
        id: d.id,
        name: c.name,
        desc: c.desc,
        objective: c.objective,
        count: c.count,
        progress: d.progress,
        done: d.done,
        rewardCredits: c.rewardCredits,
        rewardRep: c.rewardRep,
      };
    });
    this.send(ws, { t: "contracts", day: p.dailyDay, rep, repTier: repTier(rep), list });
  }
  private pushContracts(p: PlayerState) {
    for (const [sock, id] of this.sessions) if (id === p.id) this.sendContracts(sock, p);
  }

  /** Advance any active daily matching an objective; auto-grant credits + rep on completion. */
  private contractEvent(p: PlayerState, objective: DailyObjective, n = 1) {
    let changed = false;
    for (const d of p.dailies) {
      if (d.done) continue;
      const c = getDaily(d.id);
      if (!c || c.objective !== objective) continue;
      d.progress += n;
      changed = true;
      if (d.progress >= c.count) {
        d.done = true;
        p.credits += c.rewardCredits; // server-authoritative reward
        this.bumpStat(p, "credits", c.rewardCredits);
        this.bumpStat(p, "rep", c.rewardRep); // reputation track (cross-zone, persisted)
        p.dirty = true;
        this.sendTo(p.id, { t: "sys", text: `✔ CONTRACT — ${c.name} (+₵${c.rewardCredits} +${c.rewardRep} rep)` });
      }
    }
    if (changed) {
      p.dailyDirty = true;
      this.pushContracts(p);
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

  private recomputeStats(p: PlayerState) {
    p.mods = deriveMods(p.equipped);
    p.maxHp = PLAYER_HP + Math.round(p.mods.hpAdd);
    if (p.hp > p.maxHp) p.hp = p.maxHp;
  }

  private sendLoadout(ws: WebSocket, p: PlayerState) {
    this.send(ws, { t: "equipped", items: Object.values(p.equipped).filter(Boolean) as Item[], maxHp: p.maxHp });
  }

  /** Equip an inventory item into its slot (swapping any current piece back to the bag);
   *  its mods immediately change this player's server-side combat stats. */
  private onEquip(ws: WebSocket, msg: Extract<ClientMsg, { t: "equip" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    const idx = p.inventory.findIndex((it) => it.id === msg.itemId);
    if (idx < 0) return;
    const item = p.inventory[idx];
    p.inventory.splice(idx, 1);
    const prev = p.equipped[item.slot];
    p.equipped[item.slot] = item;
    if (prev) p.inventory.push(prev); // the old piece returns to the bag
    this.recomputeStats(p);
    p.dirty = true;
    this.send(ws, { t: "inv", items: p.inventory });
    this.sendLoadout(ws, p);
  }

  private onUnequip(ws: WebSocket, msg: Extract<ClientMsg, { t: "unequip" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    const slot = msg.slot as Slot;
    const it = p.equipped[slot];
    if (!it) return;
    delete p.equipped[slot];
    p.inventory.push(it);
    if (p.inventory.length > INVENTORY_CAP) p.inventory.shift();
    this.recomputeStats(p);
    p.dirty = true;
    this.send(ws, { t: "inv", items: p.inventory });
    this.sendLoadout(ws, p);
  }

  /** Buy from the vendor: validate + deduct credits, then heal or roll a gear cache. */
  private onBuy(ws: WebSocket, msg: Extract<ClientMsg, { t: "buy" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    const sku = SHOP[msg.sku];
    if (!sku) return;
    if (sku.repReq && repTier(this.repOf(p)) < sku.repReq) {
      this.send(ws, { t: "sys", text: `${sku.label} needs reputation tier ${sku.repReq} — run contracts` });
      return;
    }
    if (p.credits < sku.price) {
      this.send(ws, { t: "sys", text: `not enough credits for ${sku.label} (${sku.price})` });
      return;
    }
    p.credits -= sku.price;
    if (sku.heal) {
      p.hp = p.maxHp;
      this.send(ws, { t: "sys", text: `bought ${sku.label} — patched to full` });
    } else if (sku.rarity) {
      p.inventory.push(rollItem(p.level, 0, sku.rarity));
      if (p.inventory.length > INVENTORY_CAP) p.inventory.shift();
      this.send(ws, { t: "inv", items: p.inventory });
      this.send(ws, { t: "sys", text: `bought ${sku.label}` });
    }
    p.dirty = true; // credits change rides the next snapshot
  }

  /** Find an item by id whether it's loose in the bag or currently equipped. */
  private locateItem(p: PlayerState, id: string): { item: Item; slot?: Slot } | null {
    const i = p.inventory.findIndex((it) => it.id === id);
    if (i >= 0) return { item: p.inventory[i] };
    for (const s of SLOTS) {
      const it = p.equipped[s];
      if (it && it.id === id) return { item: it, slot: s };
    }
    return null;
  }

  /**
   * Gear forge — server-authoritative upgrade / reforge / fuse / salvage. The server
   * validates legality, deducts credits + cores (a dual sink), mutates the item, and
   * recomputes combat stats when an EQUIPPED piece changes — so a client can never
   * conjure power it didn't pay for. Pushes the fresh bag + loadout afterward.
   */
  private onCraft(ws: WebSocket, msg: Extract<ClientMsg, { t: "craft" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    const fail = (text: string) => this.send(ws, { t: "sys", text });
    const afford = (c: Cost) => p.credits >= c.credits && p.cores >= c.cores;
    const pay = (c: Cost) => {
      p.credits -= c.credits;
      p.cores -= c.cores;
    };

    if (msg.action === "upgrade") {
      const loc = this.locateItem(p, msg.itemId);
      if (!loc) return;
      if (!canUpgrade(loc.item)) return fail(`already at max upgrade (+${UPGRADE_MAX})`);
      const c = upgradeCost(loc.item);
      if (!afford(c)) return fail(`forge: need ₵${c.credits} + ${c.cores}◈ to upgrade`);
      pay(c);
      loc.item.ilvl = (loc.item.ilvl ?? 0) + 1;
      if (loc.slot) this.recomputeStats(p);
      fail(`▲ upgraded ${loc.item.name} to +${loc.item.ilvl}`);
    } else if (msg.action === "reforge") {
      const loc = this.locateItem(p, msg.itemId);
      if (!loc) return;
      const c = reforgeCost(loc.item);
      if (!afford(c)) return fail(`forge: need ₵${c.credits} + ${c.cores}◈ to reforge`);
      pay(c);
      loc.item.mods = rollModsFor(loc.item.slot, loc.item.rarity, p.level);
      if (loc.slot) this.recomputeStats(p);
      fail(`↻ reforged ${loc.item.name}`);
    } else if (msg.action === "salvage") {
      const i = p.inventory.findIndex((it) => it.id === msg.itemId);
      if (i < 0) return fail("can only salvage items in the bag (unequip first)");
      const it = p.inventory[i];
      const y = salvageYield(it);
      p.inventory.splice(i, 1);
      p.credits += y.credits;
      p.cores += y.cores;
      fail(`✂ salvaged ${it.name} → +${y.cores}◈ +₵${y.credits}`);
    } else if (msg.action === "fuse") {
      const i = p.inventory.findIndex((it) => it.id === msg.itemId);
      const j = p.inventory.findIndex((it) => it.id === msg.itemId2);
      if (i < 0 || j < 0 || i === j) return fail("fuse needs two different bag items");
      const a = p.inventory[i];
      const b = p.inventory[j];
      if (!canFuse(a, b)) return fail("fuse needs two items of the SAME rarity (not Singular)");
      const c = fuseCost(a);
      if (!afford(c)) return fail(`forge: need ₵${c.credits} + ${c.cores}◈ to fuse`);
      const up = nextRarity(a.rarity)!;
      pay(c);
      // splice the higher index first so the second index stays valid
      const [hi, lo] = i > j ? [i, j] : [j, i];
      p.inventory.splice(hi, 1);
      p.inventory.splice(lo, 1);
      const out = rollItem(p.level, 0, up);
      p.inventory.push(out);
      if (p.inventory.length > INVENTORY_CAP) p.inventory.shift();
      fail(`✦ fused → ${out.rarity} ${out.name}`);
    } else return;

    p.dirty = true;
    this.send(ws, { t: "inv", items: p.inventory });
    this.sendLoadout(ws, p);
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
      dmg: Math.round(PLAYER_DMG * (1 + (p.mods.dmgPct || 0))), // equipped gear scales damage
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
      for (const p of this.players.values()) await this.drainMail(p); // cross-zone payouts land here
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
          p.hp = p.maxHp; // respawn at full, including equipped +HP
          p.dead = false;
          p.pvpSafeUntil = this.tick + ticks(2500); // brief immunity so arenas can't be spawn-camped
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
      const arch = ENEMY_ARCHES[e.kind] ?? ENEMY_ARCHES[0];
      if (e.hp <= 0) {
        if (this.tick >= e.respawnTick) {
          e.x = e.ox;
          e.y = e.oy;
          e.hp = e.maxHp; // bosses reform at full boss HP; regulars at arch HP (maxHp === arch.hp)
        }
        continue;
      }
      const target = this.nearestLivePlayer(e.x, e.y, ENEMY_AGGRO);
      if (!target) continue;
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const eSpeed = meltdown ? arch.speed * MELTDOWN_ENEMY_SPEED_MULT : arch.speed;
      const eFireMs = meltdown ? arch.fireMs * MELTDOWN_FIRE_FASTER : arch.fireMs;
      stepMove(e, { mx: dx / d, my: dy / d }, this.grid, NET_TICK_MS, eSpeed);
      if (d <= arch.fireRange && (this.tick - e.lastFireTick) * NET_TICK_MS >= eFireMs) {
        e.lastFireTick = this.tick;
        const aim = Math.atan2(target.y - e.y, target.x - e.x);
        this.shots.push({
          id: this.nextShotId++,
          x: e.x,
          y: e.y,
          vx: Math.cos(aim) * arch.projSpeed,
          vy: Math.sin(aim) * arch.projSpeed,
          dieTick: this.tick + ticks(ENEMY_PROJ_TTL_MS),
          team: 1,
          owner: String(e.id),
          dmg: e.boss ? Math.round(arch.dmg * BOSS_DMG_MULT) : arch.dmg,
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
            // Server-authoritative crit + lifesteal, scaled by the shooter's level
            // (computed server-side so a client can't spoof its own crit chance).
            const owner = this.players.get(s.owner);
            let dmg = s.dmg;
            if (owner) {
              const critChance = Math.min(0.05 + owner.level * 0.012, 0.3) + (owner.mods.critPct || 0);
              if (Math.random() < critChance) dmg *= 1.85;
              const lifesteal = Math.min(owner.level * 0.004, 0.08) + (owner.mods.lifestealPct || 0);
              if (lifesteal > 0 && !owner.dead && owner.hp > 0) {
                owner.hp = Math.min(owner.maxHp, owner.hp + dmg * lifesteal);
              }
            }
            e.hp -= dmg;
            consumed = true;
            if (e.hp <= 0) {
              const isBoss = !!e.boss;
              const arch = ENEMY_ARCHES[e.kind] ?? ENEMY_ARCHES[0];
              // A boss reforms slowly (so others can find + fight it); a grunt fast.
              e.respawnTick = this.tick + ticks(isBoss ? BOSS_RESPAWN_MS : 4000);
              const killer = owner;
              if (killer) {
                const mult = isBoss ? 12 : 1; // a boss pays out like a dozen grunts
                const gained = Math.round(CREDITS_PER_KILL * mult * (1 + (killer.guildBonus || 0))); // cell perk
                killer.credits += gained; // server-authoritative currency
                killer.xp += XP_PER_KILL * mult; // server-authoritative progression
                killer.level = levelForXp(killer.xp);
                killer.dirty = true;
                this.bumpMeta("f" + killer.faction, isBoss ? 10 : 1); // faction contribution
                this.questEvent(killer, "kill");
                // achievement counters (cross-zone, D1)
                this.bumpStat(killer, "kills", 1);
                if (isBoss) this.bumpStat(killer, "bosses", 1);
                this.bumpStat(killer, "credits", gained);
                // daily contracts
                this.contractEvent(killer, "kill", 1);
                if (isBoss) this.contractEvent(killer, "boss", 1);
                // item loot — a boss ALWAYS drops, rarity-boosted; a grunt rolls the chance.
                // Pushed (FIFO-capped) to the killer's client only.
                if (isBoss || Math.random() < arch.loot.chance) {
                  killer.inventory.push(rollItem(killer.level, isBoss ? 2.5 : arch.loot.boost));
                  if (killer.inventory.length > INVENTORY_CAP) killer.inventory.shift();
                  this.sendTo(killer.id, { t: "inv", items: killer.inventory });
                }
                // Zone-wide kill feed so everyone knows the boss fell (and will be back).
                if (isBoss) {
                  this.broadcast({ t: "sys", text: `▲ ${killer.name} slew ${e.name} — it will reform soon` });
                }
              }
              // shared meta: every kill (any player, ANY zone) pushes the server-wide
              // Singularity. Optimistic local bump now; flushed/synced to D1 on persist.
              this.bumpMeta("singularity", isBoss ? SING_PER_KILL * 8 : SING_PER_KILL, SING_MAX);
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
        // PvP: a player shot can also hit OTHER players — but only inside a PvP arena
        // (server-authoritative; the lone place player-vs-player damage is applied).
        if (!consumed && this.resolvePvpHit(s, ax, ay)) consumed = true;
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
            if (!pl.dead && pl.faction === node.by && dist2(pl.x, pl.y, node.x, node.y) <= CR2) {
              this.questEvent(pl, "capture");
              this.bumpStat(pl, "captures", 1);
              this.contractEvent(pl, "capture", 1);
            }
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
      if (e.hp > 0 && near(e.x, e.y))
        enemies.push({
          id: e.id,
          x: round2(e.x),
          y: round2(e.y),
          hp: Math.round(e.hp),
          kind: e.kind,
          ...(e.boss ? { boss: true, name: e.name, tint: e.tint, hpMax: Math.round(e.maxHp) } : {}),
        });
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
    // Zone-wide boss status (NOT AOI-culled) so every player can locate it + see its
    // respawn countdown — the "find" half of find-and-fight.
    let boss:
      | { name: string; x: number; y: number; hp: number; hpMax: number; alive: boolean; respawnSec: number }
      | undefined;
    for (const e of this.enemies.values()) {
      if (!e.boss) continue;
      const alive = e.hp > 0;
      boss = {
        name: e.name ?? "BOSS",
        x: round2(alive ? e.x : e.ox), // where it is now; its lair while reforming
        y: round2(alive ? e.y : e.oy),
        hp: Math.max(0, Math.round(e.hp)),
        hpMax: Math.round(e.maxHp),
        alive,
        respawnSec: alive ? 0 : Math.max(0, Math.ceil(((e.respawnTick - this.tick) * NET_TICK_MS) / 1000)),
      };
      break;
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
      boss,
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

  /** Player-vs-player damage, gated to the PvP arenas. The server owns HP/death/respawn
   *  and awards an arena bounty; a kill-feed line is broadcast. Returns true on a hit. */
  private resolvePvpHit(s: Shot, ax: number, ay: number): boolean {
    const shooter = this.players.get(s.owner);
    if (this.interior || !shooter || !inPvpZone(shooter.x, shooter.y)) return false; // safehouse = no PvP
    const R2 = PROJ_HIT_RADIUS * PROJ_HIT_RADIUS;
    for (const v of this.players.values()) {
      if (v.id === s.owner || v.dead) continue;
      if (this.tick < v.pvpSafeUntil) continue; // spawn protection
      if (shooter.party >= 0 && v.party === shooter.party) continue; // no team-killing
      if (!inPvpZone(v.x, v.y)) continue;
      if (segPointDist2(v.x, v.y, ax, ay, s.x, s.y) <= R2) {
        v.hp -= s.dmg;
        if (v.hp <= 0) {
          v.hp = 0;
          v.dead = true;
          v.respawnTick = this.tick + ticks(RESPAWN_MS);
          v.dirty = true;
          shooter.credits += CREDITS_PER_KILL * 3; // an arena kill pays a bounty
          shooter.xp += XP_PER_KILL * 2;
          shooter.level = levelForXp(shooter.xp);
          shooter.dirty = true;
          this.bumpStat(shooter, "pvp", 1);
          this.bumpStat(shooter, "credits", CREDITS_PER_KILL * 3);
          this.broadcastSys(`☠ ${shooter.name} eliminated ${v.name} in the arena`);
        }
        return true;
      }
    }
    return false;
  }

  /** Broadcast a system line to everyone in this zone (kill feed, announcements). */
  private broadcastSys(text: string) {
    const out = JSON.stringify({ t: "sys", text });
    for (const [sock] of this.sessions) {
      try {
        sock.send(out);
      } catch {
        /* dropped */
      }
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
      if (p.dirty) {
        p.dirty = false;
        await this.upsert(p.id, p.name, p.x, p.y, p.credits, p.xp, p.cores, p.questStep, p.inventory, p.look, p.equipped);
      }
      await this.flushStats(p); // lifetime counters / achievements may change without `dirty`
      await this.flushDailies(p);
    }
    await this.syncMeta();
  }

  /** Persist a player's daily-contract progress for the current day. */
  private async flushDailies(p: PlayerState) {
    if (!p.dailyDirty) return;
    p.dailyDirty = false;
    try {
      for (const d of p.dailies) {
        await this.env.DB.prepare(
          "INSERT INTO player_dailies (player, day, contract_id, progress, done) VALUES (?,?,?,?,?) " +
            "ON CONFLICT(player,day,contract_id) DO UPDATE SET progress=excluded.progress, done=excluded.done",
        )
          .bind(p.id, p.dailyDay, d.id, d.progress, d.done ? 1 : 0)
          .run();
      }
    } catch {
      /* table may not exist before migration */
    }
  }

  /** Flush a player's queued stat increments + deepest-district + new achievements to the
   *  shared D1 store (so leaderboards aggregate across every zone). Counters are additive
   *  UPSERTs; deepest is a MAX; achievements insert-once. */
  private async flushStats(p: PlayerState) {
    try {
      for (const k of Object.keys(p.statDelta)) {
        const d = p.statDelta[k];
        delete p.statDelta[k];
        if (!d) continue;
        await this.env.DB.prepare(
          "INSERT INTO player_stats (player, stat, v) VALUES (?,?,?) ON CONFLICT(player,stat) DO UPDATE SET v = v + excluded.v",
        )
          .bind(p.id, k, d)
          .run();
      }
      if (p.deepestDirty) {
        p.deepestDirty = false;
        await this.env.DB.prepare(
          "INSERT INTO player_stats (player, stat, v) VALUES (?,?,?) ON CONFLICT(player,stat) DO UPDATE SET v = MAX(v, excluded.v)",
        )
          .bind(p.id, "deepest", p.deepest)
          .run();
      }
      if (p.achvNew.length) {
        const now = Date.now();
        for (const a of p.achvNew.splice(0)) {
          await this.env.DB.prepare("INSERT OR IGNORE INTO player_achv (player, ach, at) VALUES (?,?,?)").bind(p.id, a, now).run();
        }
      }
    } catch {
      /* tables may not exist before migration */
    }
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
    inventory: Item[],
    look: PlayerLook | undefined,
    equipped: Partial<Record<Slot, Item>>,
  ) {
    try {
      await this.env.DB.prepare(
        "INSERT INTO players (id, name, x, y, zone, credits, xp, cores, quest_step, inventory, look, equipped, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) " +
          "ON CONFLICT(id) DO UPDATE SET x=excluded.x, y=excluded.y, credits=excluded.credits, xp=excluded.xp, cores=excluded.cores, quest_step=excluded.quest_step, inventory=excluded.inventory, look=excluded.look, equipped=excluded.equipped, updated_at=excluded.updated_at",
      )
        .bind(id, name, round2(x), round2(y), this.zoneName, Math.round(credits), Math.round(xp), Math.round(cores), Math.round(questStep), JSON.stringify(inventory.slice(0, INVENTORY_CAP)), look ? JSON.stringify(look) : null, JSON.stringify(equipped), Date.now())
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
      await this.upsert(p.id, p.name, p.x, p.y, p.credits, p.xp, p.cores, p.questStep, p.inventory, p.look, p.equipped);
      await this.flushStats(p);
      await this.flushDailies(p);
      await this.syncMeta();
      this.players.delete(id);
    }
  }
}
