// Shared game model + sim (single source of truth, imported from the client repo —
// these modules are Phaser-free and deterministic).
import { NET_TICK_MS, PROTOCOL_VERSION, type ClientMsg, type PlayerLook } from "../../src/net/protocol";
import {
  stepMove,
  tileIsWall,
  dist2,
  segPointDist2,
  gridDims,
  pvpZonesFor,
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
import {
  buildGrid,
  buildBridgeGrid,
  spawnPoint,
  spawnPointForTravel,
  isWall,
  buildSafehouse,
  SAFEHOUSE_SPAWN,
  buildVenueRoom,
  venueSpawnFor,
  VENUE_SPAWN,
  buildSubway,
  SUBWAY_SPAWN,
  buildDive,
  DIVE_SPAWN,
  DIVE_CORE_TILE,
  DIVE_ZONE_IDS,
  parseDiveZone,
  buildTutorial,
  TUTORIAL_SPAWN,
  TUTORIAL_PORTAL,
  TUTORIAL_PORTAL_RADIUS,
  TUTORIAL_COP_TILE,
  TUTORIAL_NODE_TILE,
  isVenueSizedZone,
  isSafehouseSizedInterior,
  type TileGrid,
} from "../../src/world/district";
import {
  BRIDGE_ZONE_IDS,
  parseBridgeZone,
  getBridge,
  type BridgeDef,
} from "../../src/game/bridges";
import {
  TUTORIAL_ZONE,
  tutorialStepAt,
  tutorialTotal,
  tutorialReadyForPortal,
  type TutorialKind,
  type TutorialMode,
} from "../../src/net/tutorial";
import { DISTRICTS } from "../../src/game/districts";
import { DISTRICT_SCALE, PLAYER, HEAT } from "../../src/config";
import { ONLINE_CITY, CITY_HUB_SPAWN } from "../../src/world/city";
import { rollItem, rollModsFor, effectiveMods, nextRarity, makeWeaponItem, SLOTS, type Item, type Slot, type Rarity } from "../../src/game/items";
import { getWeapon, weaponHitDamage } from "../../src/game/weapons";
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
import { listingFee, metroListingFee, MIN_PRICE, MIN_METRO_PRICE, MAX_PRICE } from "../../src/game/market";
import { PVP_BUY_IN_METRO } from "../../src/game/pvp";
import { fmtMetro } from "../../src/economy/metro";
import { dailyContracts, getDaily, currentDay, repTier, type DailyObjective } from "../../src/game/dailies";
import { RAID_SCRIPT, phaseForHp, raidHpScale } from "../../src/game/raid";
import { getCosmetic, applyCosmetic } from "../../src/game/cosmetics";
import { bountyById, type BountyObjective } from "../../src/game/bounties";
import { verifyWalletLogin, walletPlayerId } from "./auth";

/** Inventory is capped so the persisted JSON stays bounded; oldest drops out (FIFO). */
const INVENTORY_CAP = 24;
/** Personal stash (TENEMENT lockbox) cap — deposits are refused beyond this, never dropped. */
const STASH_CAP = 24;

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
import {
  Campaign,
  parseCampaign,
  serializeCampaign,
  CAMPAIGN_DONE_TEXT,
  type CampaignData,
} from "../../src/net/campaign";
import type { QuestTriggerType, QuestReward } from "../../src/game/quests";
import { rollElite, type EliteModifier } from "../../src/game/elites";

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

/** No-combat interior zones (the safehouse hub + enterable building interiors). Each is its
 *  own DO, reuses the safehouse room grid, and runs no enemies/boss/territory/PvP. Shared with
 *  the Worker router so these zone names pass through instead of collapsing to a district. */
import { getFragment, DIVE_DEFAULT_FRAGMENTS } from "../../src/game/fragments";
import { dailyDistrictMod, dayIndex, hvtCallsign, HVT_BOUNTY_MULT, HVT_HP_MULT, HVT_TINT } from "../../src/game/districtMods";
import { WORLD_EVENTS, type WorldEventDef } from "../../src/game/worldEvents";
import { WORLD_EVENT } from "../../src/config";
import {
  ESTATES,
  ESTATES_ZONE,
  ESTATE_COUNT,
  buildHomeRoom,
  parseEstateInterior,
  sanitizeFurniture,
  sanitizeGuestbook,
  GUEST_STAMPS,
  ESTATE_BASE_PRICE,
  type FurniturePiece,
  type GuestEntry,
} from "../../src/world/estates";

export const INTERIOR_ZONES = new Set(["safe", "clinic", "bar", "den", "shop", ESTATES_ZONE]);
/** All named (non-district) zones the Worker routes by name — interiors + subway + wilderness bridges. */
export const NAMED_ZONES = new Set([...INTERIOR_ZONES, "subway", "vault", TUTORIAL_ZONE, ...BRIDGE_ZONE_IDS, ...DIVE_ZONE_IDS]);

/** Per-building district interior — zone id "d{district}i{buildingIndex}". Each is its own
 *  no-combat DO reusing the safehouse room; H returns to the parent district. Bounded so a
 *  bogus id can't spin up an unbounded zone. */
export const parseBuildingInterior = (z: string | null): { district: number; index: number } | null => {
  const m = z ? /^d(\d+)i(\d+)$/.exec(z) : null;
  if (!m) return null;
  const district = parseInt(m[1], 10);
  const index = parseInt(m[2], 10);
  if (district < 0 || district >= DISTRICTS.length || index < 0 || index > 63) return null;
  return { district, index };
};

/** Hub building interior — zone id "h{buildingIndex}". Every building on the shared city
 *  plaza is enterable; each is a no-combat room and H returns to "safe". Bounded to the
 *  procedural hub's building count so a bogus id can't spin up an unbounded zone. */
export const parseHubInterior = (z: string | null): number | null => {
  const m = z ? /^h(\d+)$/.exec(z) : null;
  if (!m) return null;
  const i = parseInt(m[1], 10);
  return i >= 0 && i < ONLINE_CITY.buildings.length ? i : null;
};

/** Zones the Worker routes by exact name or pattern (named zones + building interiors). */
export const isNamedZone = (z: string | null): boolean =>
  !!z && (NAMED_ZONES.has(z) || parseBuildingInterior(z) !== null || parseHubInterior(z) !== null || parseEstateInterior(z) !== null);

export interface Env {
  WORLD: DurableObjectNamespace;
  DB: D1Database;
  // $METRO bridge (Phase 5) — wrangler secrets / .dev.vars.
  // Absent mint or treasury → sim settlement (accounting only, no chain).
  METRO_TREASURY_SECRET?: string;
  /** Preferred mint env (mainnet or devnet). */
  METRO_MINT?: string;
  /** Legacy alias — still accepted if METRO_MINT is unset. */
  METRO_DEVNET_MINT?: string;
  METRO_RPC?: string;
  /** Optional EIP-155 chain id for EVM (46630 RH testnet, 4663 RH mainnet). */
  METRO_CHAIN_ID?: string;
  // "1" arms real-value mainnet (counsel) — also gates NFT-tier cosmetics.
  // Required when METRO_RPC points at mainnet, else settlement stays sim.
  METRO_MAINNET_ARMED?: string;
  /** Harness only: allow deposit/withdraw while settlement is sim with a mint set. */
  METRO_ALLOW_SIM?: string;
}

interface PlayerState {
  id: string;
  name: string;
  /** Guest-identity device secret (null = unbound legacy / wallet id). Gate, don't stream. */
  secret: string | null;
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
  /** True when the player has paid the $METRO buy-in and is contesting in an arena. */
  pvpInArena: boolean;
  /** Buy-in + loot from eliminations — returned on safe exit, lost on death. */
  pvpEscrow: number;
  /** Last position outside the arena (used to bounce players who can't afford buy-in). */
  pvpSafeX: number;
  pvpSafeY: number;
  credits: number;
  cores: number;
  metro: number; // in-game $METRO balance (world marketplace + custodial bridge)
  inventory: Item[]; // server-authoritative loot, persisted as JSON (capped FIFO)
  stash: Item[]; // personal safe storage (TENEMENT lockbox) — survives death, persisted as JSON
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
  // personal campaign arc (Path A — per-player in the shared world)
  campaign: Campaign;
  // memory fragments recovered at ICE-dive cores (claim-once per player, D1-persisted)
  fragments: string[];
  // class kit (server-authoritative): dash burst + the class signature ability
  classId: string;
  dashUntilTick: number; // mid-dash while tick < this (dash velocity + i-frames)
  dashCdUntilTick: number;
  dashDx: number;
  dashDy: number;
  iframeUntilTick: number; // invulnerable to enemy shots/hazards (dash grace)
  abilityCdUntilTick: number;
  ability2CdUntilTick: number;
  // timed auto-attack companion (WINTERMUTE drones / SWARM minion pack)
  droneUntilTick: number;
  droneNextTick: number;
  droneKind: 0 | 1; // 0 = sentry drones (ranged, paced), 1 = minion pack (fast, short)
  // HEAT — the risk meter: fed by damage/kills, decays when cold, fuels the ultimate
  heat: number;
  heatGainTick: number;
  // tutorial drill yard — onboarding before the one-way deploy portal
  tutorialDone: boolean;
  tutorialStep: number;
  tutorialMode: TutorialMode;
  tutorialProgress: number;
  tutorialAnchorX: number;
  tutorialAnchorY: number;
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
  // cosmetics / transmog — owned set + equipped override (zero power), persisted to D1
  cosmeticsOwned: Set<string>;
  cosmeticEquipped: string | null;
  // authored NPC bounty — one active at a time (in-memory; reward + count persist)
  bounty: { id: string; progress: number } | null;
  // appearance (relayed to other clients so they render this player's customization)
  look?: PlayerLook;
}

interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: number; // PICKUP_CREDIT | PICKUP_CORE
  dieTick: number;
  bornTick: number; // collection grace — the drop must visibly pop first
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
  elite?: EliteModifier; // rolled-on-spawn affix: hp/speed/status-resist/volatile + payout mult
  hvt?: boolean; // today's HIGH-VALUE TARGET — named bounty elite, huge payout, once per day
  speedMult?: number; // district daily-condition speed factor (GHOST GRID etc.)
  altFire?: boolean; // volley alternator (SNIPER/HVT swap shot ↔ targeting hazard)
  hvtRepositionTick?: number; // last evasive-burst tick (HVT bounty protocol)
  hvtCalled?: boolean; // HVT called its one-time reinforcements (below half HP)
  add?: boolean; // a boss-summoned add (cleaned up when the boss falls/reforms)
  stunUntilTick?: number; // WINTERMUTE hack cone — frozen mid-thought (no move/fire)
  slowUntilTick?: number; // METROPHAGE contagion bloom — infected servos at half speed
  // raid runtime (bosses only)
  baseMaxHp?: number; // roster HP before player-count scaling
  phaseIdx?: number; // current raid phase
  engagedTick?: number; // tick of first damage (0 = not yet engaged); arms scaling + enrage
  lastAoeTick?: number; // last hazard telegraph
  enraged?: boolean; // soft enrage tripped by the timer
}

/** A telegraphed boss AoE — a growing ring that detonates after a wind-up, damaging
 *  anyone still inside. Broadcast (AOI) so clients render the dodge window. */
interface Hazard {
  id: number;
  x: number;
  y: number;
  r: number;
  castTick: number;
  detonateTick: number;
  dmg: number;
  /** Player-owned strike: detonates against ENEMIES, credited to `owner`. */
  vsEnemies?: boolean;
  owner?: string;
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
  { name: "PALANTIR ORACLE", tint: 0x4d8cff, hp: 600 },
  { name: "TIDAL LEVIATHAN", tint: 0x29e7ff, hp: 640 },
  { name: "THE MAW", tint: 0xb06bff, hp: 720 },
  { name: "SKYLINK BEACON", tint: 0x6b9bff, hp: 780 },
  { name: "SCRAP SOVEREIGN", tint: 0xffb13c, hp: 840 },
  { name: "HELIOS WARDEN", tint: 0xffe08a, hp: 920 },
];

/** Vendor — the credits sink. A field-patch heal, and gear "caches" that roll an item of
 *  a guaranteed rarity floor into the bag (feeding the equip loop). Server-authoritative:
 *  it validates + deducts credits, so a client can't conjure gear it can't afford. */
interface ShopItem {
  price: number;
  label: string;
  rarity?: Rarity;
  heal?: boolean;
  repReq?: number;
  cores?: number;
  creditsGrant?: number;
}
const SHOP: Record<string, ShopItem> = {
  heal: { price: 40, label: "FIELD PATCH", heal: true },
  cache_standard: { price: 60, label: "SALVAGE CACHE", rarity: "standard" },
  cache_tuned: { price: 150, label: "TUNED CACHE", rarity: "tuned" },
  cache_blackice: { price: 480, label: "BLACK-ICE CACHE", rarity: "blackice", repReq: 1 },
  cache_singular: { price: 1200, label: "SINGULAR CACHE", rarity: "singular", repReq: 2 },
  core_bundle: { price: 95, label: "CORE BUNDLE", cores: 3 },
  core_crate: { price: 240, label: "CORE CRATE", cores: 8, repReq: 1 },
  supply_kit: { price: 50, label: "SUPPLY KIT", creditsGrant: 30, cores: 1 },
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
  private hazards: Hazard[] = []; // telegraphed boss AoE zones
  private nextEnemyId = 1;
  private nextShotId = 1;
  private nextPickupId = 1;
  private nextHazardId = 1;
  // Server-wide shared meta (D1-synced across all zones): "f0".."f3" faction scores.
  private meta: Record<string, number> = {};
  private metaDelta: Record<string, number> = {};
  private metaLoaded = false;
  private nodes: TerritoryNode[] = [];
  private parties = new Map<number, Set<string>>(); // partyId -> member ids
  private nextPartyId = 1;
  private trades = new Map<number, TradeSession>();
  private playerTrade = new Map<string, number>(); // player id -> trade id
  private nextTradeId = 1;

  private zoneName = "d0";
  private districtIndex = 0;
  private bridgeIndex = -1;
  private diveIndex = -1; // ≥0 when this DO runs an ICE VAULT dive instance (v0–v6)
  private provingVault = false; // THE PROVING — the weekly-affixed group vault
  private zoneReady = false;
  // dynamic world events (combat districts only): telegraph -> active -> reward
  private worldEvent: { def: WorldEventDef; phase: "telegraph" | "active"; untilTick: number } | null = null;
  private nextEventTick = -1;
  private lastStormTick = 0;
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

  /** Spread logins across plazas/parks so 500+ runners don't stack on one tile. */
  private spreadSpawn(base: { x: number; y: number }, id: string): { x: number; y: number } {
    // Fan players out in a TIGHT ring around the hub spawn — enough that a crowd
    // doesn't stack on one tile, close enough that fresh runners stay inside one
    // AOI and land looking at each other + THE FIXER's plaza.
    // (Scattering across the city's far-flung plazas made arrivals feel single-player:
    // fresh players spawned out of AOI range of one another.)
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const slot = (h ^ (this.sessions.size * 131)) % 512;
    const baseAngle = (slot / 512) * Math.PI * 2;
    const maxRad = Math.max(56, AOI_RADIUS * 0.42);
    for (let ring = 0; ring < 48; ring++) {
      const angle = baseAngle + ring * 0.42;
      const rad = Math.min(maxRad, 56 + ring * 10);
      const x = base.x + Math.cos(angle) * rad;
      const y = base.y + Math.sin(angle) * rad;
      if (!tileIsWall(x, y, this.grid)) return { x: round2(x), y: round2(y) };
    }
    return base;
  }

  /** A DO instance handles exactly one zone — bind it to its district on first hit. */
  private initZone(zone: string | null) {
    if (this.zoneReady) return;
    this.zoneReady = true;
    // THE UNDERLINE — the subway dungeon: an indoor COMBAT zone (no PvP/weather via the
    // interior flag, but it DOES populate a tough HSS garrison + a boss).
    if (zone === TUTORIAL_ZONE) {
      this.interior = false;
      this.zoneName = TUTORIAL_ZONE;
      this.districtIndex = 0;
      this.grid = buildTutorial();
      this.spawn = TUTORIAL_SPAWN;
      this.spawnTutorial();
      void this.state.storage.put("zone", TUTORIAL_ZONE);
      return;
    }
    if (zone === "subway") {
      this.interior = true; // indoor: no PvP, client skips weather
      this.zoneName = "subway";
      this.districtIndex = 0;
      this.grid = buildSubway();
      this.spawn = SUBWAY_SPAWN;
      this.nodes = [];
      this.spawnSubway();
      void this.state.storage.put("zone", "subway");
      return;
    }
    // THE PROVING — the WEEKLY vault: the deepest dive layout under a rotating affix,
    // tuned so a full crew is the intended clear (co-op scaling ratchets on top). One
    // big first-clear payout per player per week + a weekly leaderboard stat.
    if (zone === "vault") {
      this.interior = true;
      this.provingVault = true;
      this.diveIndex = DIVE_ZONE_IDS.length - 1; // deepest-tier rules (fragment, wardens)
      this.zoneName = "vault";
      this.districtIndex = DIVE_ZONE_IDS.length - 1;
      this.grid = buildDive();
      this.spawn = DIVE_SPAWN;
      this.spawnDive(DIVE_ZONE_IDS.length - 1);
      this.applyWeeklyAffix();
      void this.state.storage.put("zone", "vault");
      return;
    }
    // ICE VAULT — the instanced dive (v0–v6, one per district): an indoor combat
    // dungeon whose single "node" is the memory-fragment core. Channelling it free
    // completes campaign dive beats and writes the fragment to the player's memory.
    const di = parseDiveZone(zone);
    if (di >= 0) {
      this.interior = true; // no PvP / weather; it IS a combat zone (guardians below)
      this.diveIndex = di;
      this.zoneName = DIVE_ZONE_IDS[di];
      this.districtIndex = di;
      this.grid = buildDive();
      this.spawn = DIVE_SPAWN;
      this.spawnDive(di);
      void this.state.storage.put("zone", this.zoneName);
      return;
    }
    // THE LIVE CITY — shared conflict-free hub (RuneScape-scale, all players in one space).
    if (zone === "safe") {
      this.interior = true;
      this.zoneName = "safe";
      this.districtIndex = 0;
      this.grid = ONLINE_CITY.grid;
      this.spawn = CITY_HUB_SPAWN;
      this.nodes = [];
      void this.state.storage.put("zone", "safe");
      return;
    }
    // THE ESTATES overworld — a no-combat residential street; each facade door opens an est{K} home.
    if (zone === ESTATES_ZONE) {
      this.interior = true;
      this.zoneName = ESTATES_ZONE;
      this.districtIndex = 0;
      this.grid = ESTATES.grid;
      this.spawn = { x: ESTATES.spawn[0] * TILE + TILE / 2, y: ESTATES.spawn[1] * TILE + TILE / 2 };
      this.nodes = [];
      void this.state.storage.put("zone", zone);
      return;
    }
    // Private home interiors ("est{K}") — an empty room; the owner's furniture is layered on
    // the client from the D1-owned layout. No combat.
    if (parseEstateInterior(zone) !== null) {
      this.interior = true;
      this.zoneName = zone!;
      this.districtIndex = 0;
      this.grid = buildHomeRoom();
      this.spawn = VENUE_SPAWN;
      this.nodes = [];
      void this.state.storage.put("zone", zone);
      return;
    }
    // Small building interiors (clinic, bar, den, shop) — no-combat rooms off the hub.
    if (zone && INTERIOR_ZONES.has(zone) && zone !== "safe" && zone !== ESTATES_ZONE) {
      this.interior = true;
      this.zoneName = zone;
      this.districtIndex = 0;
      this.grid = buildSafehouse();
      this.spawn = SAFEHOUSE_SPAWN;
      this.nodes = [];
      void this.state.storage.put("zone", zone);
      return;
    }
    // Per-building district interiors ("d{N}i{K}") — walk into any district building. Each is
    // an FRLG-scale one-screen room; districtIndex is retained so exiting returns to the
    // parent district's doorstep.
    const bldg = parseBuildingInterior(zone);
    if (bldg) {
      this.interior = true;
      this.zoneName = zone!;
      this.districtIndex = bldg.district;
      this.grid = buildVenueRoom(zone!); // zone-hashed floor plan — must match the client's
      this.spawn = venueSpawnFor(zone);
      this.nodes = [];
      void this.state.storage.put("zone", zone);
      return;
    }
    // Hub building interiors ("h{K}") — walk into any building on the shared plaza. Each is a
    // no-combat room; districtIndex is irrelevant (H returns to "safe", handled client-side).
    if (parseHubInterior(zone) !== null) {
      this.interior = true;
      this.zoneName = zone!;
      this.districtIndex = 0;
      this.grid = buildVenueRoom(zone!); // zone-hashed floor plan — must match the client's
      this.spawn = venueSpawnFor(zone);
      this.nodes = [];
      void this.state.storage.put("zone", zone);
      return;
    }
    const bi = parseBridgeZone(zone);
    if (bi >= 0) {
      const bdef = getBridge(bi);
      this.bridgeIndex = bi;
      this.districtIndex = bdef.fromDistrict;
      this.zoneName = "w" + bi;
      void this.state.storage.put("zone", this.zoneName);
      this.grid = buildBridgeGrid(bdef);
      this.spawn = spawnPointForTravel(this.grid, this.zoneName, undefined);
      this.spawnBridge(bdef);
      this.nodes = [];
      return;
    }
    this.bridgeIndex = -1;
    this.districtIndex = parseZone(zone);
    this.zoneName = "d" + this.districtIndex;
    void this.state.storage.put("zone", this.zoneName); // store the zone NAME so "safe" survives a wake
    const def = DISTRICTS[this.districtIndex];
    this.grid = buildGrid(def);
    this.spawn = spawnPoint(this.grid, def);
    this.spawnEnemies(def);
    this.applyDistrictMod(); // today's district condition (hp/speed) onto the fresh garrison
    this.nodes = def.nodes.map((n, i) => ({
      id: i,
      x: n.tile[0] * DISTRICT_SCALE * TILE + TILE / 2,
      y: n.tile[1] * DISTRICT_SCALE * TILE + TILE / 2,
      owner: NEUTRAL,
      progress: 0,
      by: NEUTRAL,
    }));
  }

  /** Roll a spawn-time elite affix onto a fresh garrison unit — ARMORED / SWIFT /
   *  VOLATILE / WARDED. Elites read on the client via aura tint + prefix name and
   *  pay a real bonus; the roll happens once, so a post keeps its identity across
   *  respawns (the SWIFT lancer by the transit gate stays *that* lancer). */
  private maybeElite(e: Enemy, chance: number) {
    const mod = rollElite(chance);
    if (!mod) return;
    e.elite = mod;
    e.hp = Math.round(e.hp * mod.hpMult);
    e.maxHp = Math.round(e.maxHp * mod.hpMult);
    e.name = `${mod.name} ${["PATROL", "WASP", "LANCER", "HOUND", "ENFORCER", "SNIPER", "WRAITH"][e.kind] ?? "UNIT"}`;
    e.tint = mod.aura;
  }

  /** Status durations shrink against WARDED elites (and any future statusResist). */
  private statusTicks(e: Enemy, ms: number): number {
    return ticks(Math.max(120, Math.round(ms * (1 - (e.elite?.statusResist ?? 0)))));
  }

  /** kit-mod: KILL NOVA — the killer's gear detonates a friendly burst at the corpse.
   *  Rides the player-owned hazard pipeline (magenta ring, pays out to the killer). */
  private killNova(killer: PlayerState, e: { x: number; y: number }) {
    if ((killer.mods.killNovaPct || 0) <= 0) return;
    this.hazards.push({
      id: this.nextHazardId++,
      x: e.x,
      y: e.y,
      r: 70,
      castTick: this.tick,
      detonateTick: this.tick + ticks(260),
      dmg: Math.round(PLAYER_DMG * (0.5 + 2 * killer.mods.killNovaPct)),
      vsEnemies: true,
      owner: killer.id,
    });
  }

  /** VOLATILE elites detonate on death — a short-fuse hazard punishes point-blank
   *  greed. Rides the normal telegraph pipeline so clients render the dodge ring. */
  private eliteDeath(e: { x: number; y: number; elite?: EliteModifier }) {
    if (!e.elite?.volatile) return;
    this.hazards.push({
      id: this.nextHazardId++,
      x: e.x,
      y: e.y,
      r: 78,
      castTick: this.tick,
      detonateTick: this.tick + ticks(650),
      dmg: 26,
    });
  }

  /** Wilderness corridor — patrols + ambient salvage, no boss or territory nodes. */
  private spawnBridge(def: BridgeDef) {
    const pattern = [0, 0, 1, 0, 2, 4, 0, 1];
    let i = 0;
    for (const [tx, ty, tier] of def.copPosts) {
      const stx = tx * DISTRICT_SCALE;
      const sty = ty * DISTRICT_SCALE;
      if (isWall(this.grid[sty]?.[stx])) continue;
      const x = stx * TILE + TILE / 2;
      const y = sty * TILE + TILE / 2;
      const id = this.nextEnemyId++;
      const kind = tier === "enforcer" ? 4 : pattern[i++ % pattern.length];
      const e: Enemy = { id, x, y, ox: x, oy: y, hp: ENEMY_ARCHES[kind].hp, maxHp: ENEMY_ARCHES[kind].hp, respawnTick: 0, lastFireTick: 0, kind };
      this.maybeElite(e, 0.06);
      this.enemies.set(id, e);
    }
    for (const [tx, ty] of def.lootPosts) {
      const stx = tx * DISTRICT_SCALE;
      const sty = ty * DISTRICT_SCALE;
      if (isWall(this.grid[sty]?.[stx])) continue;
      const pid = this.nextPickupId++;
      const kind = Math.random() < 0.35 ? PICKUP_CORE : PICKUP_CREDIT;
      this.pickups.set(pid, {
        id: pid,
        x: stx * TILE + TILE / 2,
        y: sty * TILE + TILE / 2,
        kind,
        dieTick: this.tick + ticks(120_000),
        bornTick: this.tick,
      });
    }
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
      const stx = tx * DISTRICT_SCALE;
      const sty = ty * DISTRICT_SCALE;
      if (isWall(this.grid[sty]?.[stx])) continue;
      const x = stx * TILE + TILE / 2;
      const y = sty * TILE + TILE / 2;
      const id = this.nextEnemyId++;
      const kind = pattern[i++ % pattern.length];
      const e: Enemy = { id, x, y, ox: x, oy: y, hp: ENEMY_ARCHES[kind].hp, maxHp: ENEMY_ARCHES[kind].hp, respawnTick: 0, lastFireTick: 0, kind };
      this.maybeElite(e, 0.05 + this.districtIndex * 0.02); // deeper districts field more elites
      this.enemies.set(id, e);
    }
    // THE CRUCIBLE keeps two sparring drones on staff — a solo runner who walks into the
    // arena always has SOMETHING to fight (arena kills already pay a 3× bounty). Named +
    // tinted so they read as fixtures, leashed home by their origin like any garrison unit.
    {
      const dims = gridDims(this.grid);
      const arena = pvpZonesFor(dims.worldW, dims.worldH, this.zoneName)[0];
      if (arena) {
        for (const off of [-56, 56]) {
          const dx2 = arena.x + arena.w / 2 + off;
          const dy2 = arena.y + arena.h / 2 + (off > 0 ? 44 : -44);
          if (isWall(this.grid[Math.floor(dy2 / TILE)]?.[Math.floor(dx2 / TILE)])) continue;
          const did = this.nextEnemyId++;
          const hp = Math.round(ENEMY_ARCHES[2].hp * 1.4);
          this.enemies.set(did, {
            id: did,
            x: dx2,
            y: dy2,
            ox: dx2,
            oy: dy2,
            hp,
            maxHp: hp,
            respawnTick: 0,
            lastFireTick: 0,
            kind: 2,
            name: "CRUCIBLE DRONE",
            tint: 0xff3b6b,
          });
        }
      }
    }
    // World boss — a named HSS commander at the post farthest from the player spawn, so it
    // reads as a destination. It reforms on its own timer after a kill (see the kill handler).
    const boss = BOSS_ROSTER[this.districtIndex % BOSS_ROSTER.length];
    const { worldW, worldH } = gridDims(this.grid);
    let lair = { x: worldW - this.spawn.x, y: worldH - this.spawn.y };
    let far = -1;
    for (const [tx, ty] of def.copPosts) {
      const stx = tx * DISTRICT_SCALE;
      const sty = ty * DISTRICT_SCALE;
      if (isWall(this.grid[sty]?.[stx])) continue;
      const wx = stx * TILE + TILE / 2;
      const wy = sty * TILE + TILE / 2;
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
      baseMaxHp: boss.hp,
      phaseIdx: 0,
      engagedTick: 0,
      lastAoeTick: 0,
      enraged: false,
    });
  }

  /** Seed THE UNDERLINE: a tough HSS garrison along the platforms + a named subway boss. */
  private spawnSubway() {
    const posts: [number, number][] = [
      [14, 7],
      [26, 8],
      [14, 15],
      [26, 16],
      [14, 23],
      [26, 24],
      [34, 15],
    ];
    const pattern = [4, 5, 6, 2, 3, 6, 4]; // ENFORCER/SNIPER/WRAITH/LANCER/HOUND — deep-tier
    let i = 0;
    for (const [tx, ty] of posts) {
      if (isWall(this.grid[ty]?.[tx])) continue;
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      const kind = pattern[i++ % pattern.length];
      const id = this.nextEnemyId++;
      const e: Enemy = { id, x, y, ox: x, oy: y, hp: ENEMY_ARCHES[kind].hp, maxHp: ENEMY_ARCHES[kind].hp, respawnTick: 0, lastFireTick: 0, kind };
      this.maybeElite(e, 0.12); // THE UNDERLINE runs hot
      this.enemies.set(id, e);
    }
    const boss = BOSS_ROSTER[1];
    const bx = 34 * TILE + TILE / 2;
    const by = 23 * TILE + TILE / 2;
    const bid = this.nextEnemyId++;
    this.enemies.set(bid, {
      id: bid,
      x: bx,
      y: by,
      ox: bx,
      oy: by,
      hp: boss.hp,
      maxHp: boss.hp,
      respawnTick: 0,
      lastFireTick: 0,
      kind: BOSS_KIND,
      boss: true,
      name: "UNDERLINE WARDEN",
      tint: boss.tint,
      baseMaxHp: boss.hp,
      phaseIdx: 0,
      engagedTick: 0,
      lastAoeTick: 0,
      enraged: false,
    });
  }

  /** How many runners this dive instance is currently tuned for. */
  private diveScaledFor = 1;

  /** Epoch week — the weekly-vault rotation key (same for every DO, no coordination). */
  static weekNow(): number {
    return Math.floor(Date.now() / 604_800_000);
  }

  /** THE PROVING's weekly affix — one of four, rotating on the epoch week. */
  static weeklyAffix(): { id: string; name: string; hpMult: number; speedMult: number; shotSpeedMult: number; eliteChance: number } {
    const AFFIXES = [
      { id: "hardline", name: "HARDLINE — the ICE runs thick", hpMult: 1.45, speedMult: 1, shotSpeedMult: 1, eliteChance: 0.18 },
      { id: "overclocked", name: "OVERCLOCKED — everything runs hot", hpMult: 1.1, speedMult: 1.22, shotSpeedMult: 1, eliteChance: 0.18 },
      { id: "staticskies", name: "STATIC SKIES — fire answers faster", hpMult: 1.1, speedMult: 1, shotSpeedMult: 1.3, eliteChance: 0.18 },
      { id: "livewire", name: "LIVEWIRE — the garrison is decorated", hpMult: 1.1, speedMult: 1.05, shotSpeedMult: 1, eliteChance: 0.5 },
    ];
    return AFFIXES[WorldDO.weekNow() % AFFIXES.length];
  }

  /** UTC day the garrison's condition was applied — arrival announcements quote THIS day,
   *  so a zone alive across midnight never advertises stats it isn't running. */
  private modDay = -1;

  /** Compass octant from (dx,dy) in screen space (y-down), for hunt hints. */
  private static compass(dx: number, dy: number): string {
    const oct = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
    return oct[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
  }

  /** Today's district condition — hp/speed onto the fresh garrison (credits apply on kill).
   *  Deterministic per (district, day); the client shows the same condition on the map. */
  private applyDistrictMod() {
    if (!/^d\d+$/.test(this.zoneName)) return;
    this.modDay = dayIndex();
    const mod = dailyDistrictMod(this.districtIndex, this.modDay);
    for (const e of this.enemies.values()) {
      if (e.boss) continue; // bosses run their own raid scaling — no daily swing on tuned fights
      e.hp = Math.round(e.hp * mod.enemyHpMult);
      e.maxHp = Math.round(e.maxHp * mod.enemyHpMult);
      if (e.baseMaxHp) e.baseMaxHp = Math.round(e.baseMaxHp * mod.enemyHpMult);
      if (mod.enemySpeedMult !== 1) e.speedMult = mod.enemySpeedMult;
    }
  }

  /** Promote one far-out garrison unit into today's HIGH-VALUE TARGET — a named,
   *  gold-flagged bounty worth HVT_BOUNTY_MULT× credits. Once per district per day
   *  (kill day persists in DO storage), and it has to be HUNTED, not doorstepped. */
  private async maybePromoteHvt(): Promise<void> {
    if (!/^d\d+$/.test(this.zoneName)) return;
    for (const e of this.enemies.values()) if (e.hvt && e.hp > 0) return; // already stalking
    const day = dayIndex();
    if ((await this.state.storage.get<number>("hvtKilledDay")) === day) return; // claimed today
    let best: Enemy | null = null;
    let bd = -1;
    for (const e of this.enemies.values()) {
      if (e.boss || e.add || e.elite || e.hp <= 0) continue;
      const d = Math.hypot(e.x - this.spawn.x, e.y - this.spawn.y);
      if (d > bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) return;
    best.hvt = true;
    best.name = `HVT ${hvtCallsign(this.districtIndex, day)}`;
    best.tint = HVT_TINT;
    best.maxHp = Math.round(best.maxHp * HVT_HP_MULT);
    best.hp = best.maxHp;
  }

  /** Apply this week's affix to the freshly-seeded PROVING garrison. */
  private applyWeeklyAffix() {
    const affix = WorldDO.weeklyAffix();
    for (const e of this.enemies.values()) {
      e.hp = Math.round(e.hp * affix.hpMult);
      e.maxHp = Math.round(e.maxHp * affix.hpMult);
      if (e.baseMaxHp) e.baseMaxHp = Math.round(e.baseMaxHp * affix.hpMult);
      if (!e.elite && !e.boss) this.maybeElite(e, affix.eliteChance);
    }
  }

  /** Co-op dive scaling: every runner past the first hardens the LIVING garrison
   *  (+35% hp each, capped ×2.4) — a full crew earns a real vault crawl instead of a
   *  speed-run, and the fragment still pays everyone (claim-once per player). Scaling
   *  only ever ratchets UP within an instance so leavers can't soft-reset a fight. */
  private coopScaleDive() {
    let live = 0;
    for (const p of this.players.values()) if (!p.dead) live++;
    live = Math.max(1, live);
    if (live <= this.diveScaledFor) return;
    const cap = 2.4;
    const factorFor = (n: number) => Math.min(cap, 1 + 0.35 * (n - 1));
    const mult = factorFor(live) / factorFor(this.diveScaledFor);
    this.diveScaledFor = live;
    if (mult <= 1) return;
    for (const e of this.enemies.values()) {
      if (e.hp <= 0) continue;
      e.maxHp = Math.round(e.maxHp * mult);
      e.hp = Math.round(e.hp * mult);
      if (e.baseMaxHp) e.baseMaxHp = Math.round(e.baseMaxHp * mult);
    }
    this.broadcast({ t: "sys", text: `❄ the vault hardens — ${live} runners inside` });
  }

  /** Seed an ICE VAULT dive: guardians scale with district depth; the fragment core
   *  (a territory node) waits in the core chamber. */
  private spawnDive(depth: number) {
    // guard posts along the route — north/south chambers, antechamber, core approach.
    // Shallow vaults (the campaign's first dives) drop the corridor chokepoints so a
    // fresh solo runner can fight through; deep vaults post the full garrison.
    const allPosts: [number, number][] = [
      [13, 8],
      [17, 9],
      [13, 22],
      [17, 21],
      [28, 12],
      [28, 18],
      [22, 15],
      [34, 11],
      [34, 19],
    ];
    const posts = depth >= 2 ? allPosts : allPosts.slice(0, 6);
    // deeper districts field deeper-tier ICE: shallow dives lean patrol/lancer,
    // deep dives lean enforcer/sniper/wraith
    const shallow = [0, 2, 3, 0, 2, 3, 0, 2, 3];
    const deep = [4, 5, 6, 2, 4, 6, 5, 4, 6];
    const pattern = depth >= 4 ? deep : depth >= 2 ? shallow.map((k, i) => (i % 2 ? deep[i] : k)) : shallow;
    let i = 0;
    const hpScale = 1 + depth * 0.18;
    for (const [tx, ty] of posts) {
      if (isWall(this.grid[ty]?.[tx])) continue;
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      const kind = pattern[i++ % pattern.length];
      const hp = Math.round(ENEMY_ARCHES[kind].hp * hpScale);
      const id = this.nextEnemyId++;
      this.enemies.set(id, { id, x, y, ox: x, oy: y, hp, maxHp: hp, respawnTick: 0, lastFireTick: 0, kind });
    }
    // mid+ vaults post an ICE WARDEN at the core chamber's mouth — the climax fight
    // before the channel. The deepest vault (the Kernel's) posts THE CUSTODIAN,
    // keeper of Helios' oldest cage.
    if (depth >= 2) {
      const finale = depth === DIVE_ZONE_IDS.length - 1;
      const bx = 27 * TILE + TILE / 2;
      const by = 15 * TILE + TILE / 2;
      const hp = Math.round((finale ? 1100 : BOSS_ROSTER[depth % BOSS_ROSTER.length].hp) * (0.8 + depth * 0.1));
      const bid = this.nextEnemyId++;
      this.enemies.set(bid, {
        id: bid,
        x: bx,
        y: by,
        ox: bx,
        oy: by,
        hp,
        maxHp: hp,
        respawnTick: 0,
        lastFireTick: 0,
        kind: BOSS_KIND,
        boss: true,
        name: finale ? "THE CUSTODIAN" : `ICE WARDEN ${DIVE_ZONE_IDS[depth].toUpperCase()}`,
        tint: finale ? 0xffe08a : 0x9fe8ff,
        baseMaxHp: hp,
        phaseIdx: 0,
        engagedTick: 0,
        lastAoeTick: 0,
        enraged: false,
      });
    }
    // the fragment core — reuses the node channel mechanic (capture = recovery)
    this.nodes = [
      {
        id: 0,
        x: DIVE_CORE_TILE[0] * TILE + TILE / 2,
        y: DIVE_CORE_TILE[1] * TILE + TILE / 2,
        owner: NEUTRAL,
        progress: 0,
        by: NEUTRAL,
      },
    ];
  }

  /** Tutorial drill yard — one weak patrol cop in the combat pit + a node in the vault. */
  private spawnTutorial() {
    const [tx, ty] = TUTORIAL_COP_TILE;
    const x = tx * TILE + TILE / 2;
    const y = ty * TILE + TILE / 2;
    const id = this.nextEnemyId++;
    this.enemies.set(id, {
      id,
      x,
      y,
      ox: x,
      oy: y,
      hp: 40,
      maxHp: 40,
      respawnTick: 0,
      lastFireTick: 0,
      kind: 0,
    });
    const [nx, ny] = TUTORIAL_NODE_TILE;
    this.nodes = [
      {
        id: 0,
        x: nx * TILE + TILE / 2,
        y: ny * TILE + TILE / 2,
        owner: NEUTRAL,
        progress: 0,
        by: NEUTRAL,
      },
    ];
  }

  private inTutorial(): boolean {
    return this.zoneName === TUTORIAL_ZONE;
  }

  /** Raid-tier boss tick: HP-gated phase escalation, telegraphed AoE, summoned adds, enrage. */
  private updateBoss(e: Enemy, arch: EnemyArch) {
    // dead → reform on the long timer, resetting all raid state + the player-count scaling
    if (e.hp <= 0) {
      if (this.tick >= e.respawnTick) {
        e.x = e.ox;
        e.y = e.oy;
        e.maxHp = e.baseMaxHp ?? e.maxHp;
        e.hp = e.maxHp;
        e.phaseIdx = 0;
        e.engagedTick = 0;
        e.lastAoeTick = 0;
        e.enraged = false;
      }
      return;
    }
    const target = this.nearestLivePlayer(e.x, e.y, ENEMY_AGGRO * 1.5);
    if (!target) return; // idles at its lair until someone engages
    const script = RAID_SCRIPT;
    // The full raid kit (AoE / adds / phase escalation / enrage) only engages for a GROUP.
    // Solo, it fights as the classic single-target boss — fair to whittle down alone.
    let nearCount = 0;
    const ar2 = (ENEMY_AGGRO * 2) ** 2;
    for (const p of this.players.values()) if (!p.dead && dist2(e.x, e.y, p.x, p.y) <= ar2) nearCount++;
    const raid = nearCount >= 2;
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    let fireMs = arch.fireMs;
    let dmgMult = 1;
    let speed = arch.speed;
    if (raid) {
      // phase from HP fraction; crossing into a deeper phase summons adds + announces
      const ph = phaseForHp(script, e.hp / (e.maxHp || 1));
      if (ph > (e.phaseIdx ?? 0)) {
        e.phaseIdx = ph;
        const np = script.phases[ph];
        if (np.summonOnEnter > 0) this.summonAdds(e, np.summonOnEnter, np.summonKind);
        this.broadcastSys(`▲ ${e.name} enters ${np.name}`);
      }
      const phase = script.phases[e.phaseIdx ?? 0];
      // enrage (armed at first engage) — a soft DPS check
      if (!e.enraged && e.engagedTick && (this.tick - e.engagedTick) * NET_TICK_MS >= script.enrageMs) {
        e.enraged = true;
        this.broadcastSys(`☠ ${e.name} ENRAGES`);
      }
      const enr = e.enraged ? script.enrage : null;
      fireMs = enr ? enr.fireMs : phase.fireMs;
      dmgMult = enr ? enr.dmgMult : phase.dmgMult;
      speed = arch.speed * phase.speedMult;
      // telegraph an AoE hazard on a random nearby player (the dodge window)
      const aoeEvery = enr ? enr.aoeEveryMs : phase.aoeEveryMs;
      if (e.engagedTick && aoeEvery > 0 && (this.tick - (e.lastAoeTick ?? 0)) * NET_TICK_MS >= aoeEvery) {
        e.lastAoeTick = this.tick;
        const victim = this.randomLivePlayer(e.x, e.y, ENEMY_AGGRO * 2) ?? target;
        this.hazards.push({
          id: this.nextHazardId++,
          x: victim.x,
          y: victim.y,
          r: enr ? enr.aoeRadius : phase.aoeRadius,
          castTick: this.tick,
          detonateTick: this.tick + ticks(enr ? enr.aoeWindupMs : phase.aoeWindupMs),
          dmg: enr ? enr.aoeDmg : phase.aoeDmg,
        });
      }
    }
    // chase
    stepMove(e, { mx: dx / d, my: dy / d }, this.grid, NET_TICK_MS, speed);
    // fire
    if (d <= arch.fireRange * 1.3 && (this.tick - e.lastFireTick) * NET_TICK_MS >= fireMs) {
      e.lastFireTick = this.tick;
      const aim = Math.atan2(dy, dx);
      this.shots.push({
        id: this.nextShotId++,
        x: e.x,
        y: e.y,
        vx: Math.cos(aim) * arch.projSpeed,
        vy: Math.sin(aim) * arch.projSpeed,
        dieTick: this.tick + ticks(ENEMY_PROJ_TTL_MS),
        team: 1,
        owner: String(e.id),
        dmg: Math.round(arch.dmg * BOSS_DMG_MULT * dmgMult),
      });
    }
  }

  /** Spawn N boss adds in a ring around the boss (flagged so they clear when it falls). */
  private summonAdds(boss: Enemy, n: number, kind: number) {
    const a = ENEMY_ARCHES[kind] ?? ENEMY_ARCHES[1];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const x = boss.x + Math.cos(ang) * 64;
      const y = boss.y + Math.sin(ang) * 64;
      const id = this.nextEnemyId++;
      this.enemies.set(id, { id, x, y, ox: x, oy: y, hp: a.hp, maxHp: a.hp, respawnTick: 0, lastFireTick: 0, kind, add: true });
    }
  }

  private randomLivePlayer(x: number, y: number, range: number): PlayerState | null {
    const r2 = range * range;
    const pool: PlayerState[] = [];
    for (const p of this.players.values()) if (!p.dead && dist2(x, y, p.x, p.y) <= r2) pool.push(p);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
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
        arrival: msg.arrival,
        from: msg.from,
        classId: msg.classId,
        secret: msg.secret,
        session: msg.session,
      });
    if (msg.t === "input") return this.onInput(ws, msg);
    if (msg.t === "fire") return this.onFire(ws, msg);
    if (msg.t === "dash") return this.onDash(ws, msg);
    if (msg.t === "ability") return this.onAbility(ws, msg);
    if (msg.t === "ability2") return this.onAbility2(ws, msg);
    if (msg.t === "ult") return this.onUlt(ws, msg);
    if (msg.t === "equip") return this.onEquip(ws, msg);
    if (msg.t === "unequip") return this.onUnequip(ws, msg);
    if (msg.t === "inv_move") return this.onInvMove(ws, msg);
    if (msg.t === "stash") return this.onStash(ws, msg);
    if (msg.t === "estate") return this.onEstate(ws, msg);
    if (msg.t === "craft") return this.onCraft(ws, msg);
    if (msg.t === "buy") return this.onBuy(ws, msg);
    if (msg.t === "chat") return this.onChat(ws, msg);
    if (msg.t === "guild") return this.onGuild(ws, msg);
    if (msg.t === "market") return this.onMarket(ws, msg);
    if (msg.t === "cosmetic") return this.onCosmetic(ws, msg);
    if (msg.t === "bounty") return this.onBounty(ws, msg);
    if (msg.t === "quest") return this.onQuest(ws, msg);
    if (msg.t === "tutorial") return this.onTutorial(ws, msg);
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
    if (this.inTutorial()) this.tutorialEvent(p, "emote");
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
    if (this.inTutorial() && msg.ch === "zone") this.tutorialEvent(p, "chat");
    const out: {
      t: "chat";
      from: string;
      faction: number;
      ch: string;
      text: string;
      x?: number;
      y?: number;
    } = { t: "chat", from: p.name, faction: p.faction, ch: msg.ch, text };
    if (msg.ch === "zone") {
      out.x = round2(p.x);
      out.y = round2(p.y);
    }
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
    } else if (msg.action === "revive") {
      // Stand over a downed party member and revive them at low HP (co-op feel).
      if (p.party < 0 || p.dead) {
        this.send(ws, { t: "sys", text: "can't revive right now" });
        return;
      }
      const to = (msg.to || "").toLowerCase();
      let target: PlayerState | undefined;
      for (const m of this.parties.get(p.party) ?? []) {
        const ally = this.players.get(m);
        if (!ally || ally.id === p.id || !ally.dead) continue;
        if (to && ally.id !== to && ally.name.toLowerCase() !== to) continue;
        const d = Math.hypot(ally.x - p.x, ally.y - p.y);
        if (d < 90) {
          target = ally;
          break;
        }
      }
      if (!target) {
        this.send(ws, { t: "sys", text: "no downed party member nearby — stand closer" });
        return;
      }
      target.dead = false;
      target.hp = Math.max(20, Math.floor(PLAYER_HP * 0.35));
      target.respawnTick = 0;
      this.send(ws, { t: "sys", text: `revived ${target.name}` });
      this.sendTo(target.id, { t: "sys", text: `${p.name} rebooted you — stay close` });
      this.broadcastParty(p.party);
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
      await this.ensureMarketSeeds();
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

  /** When the auction house is empty, seed NPC-broker listings so the market never
   *  reads as a dead feature for the first players in. Seller is `__broker` (reserved). */
  private marketSeeded = false;
  private async ensureMarketSeeds() {
    if (this.marketSeeded) return;
    this.marketSeeded = true;
    try {
      const row = await this.env.DB.prepare(
        "SELECT COUNT(*) AS n FROM auctions WHERE status='open'",
      ).first<{ n: number }>();
      if ((row?.n ?? 0) > 0) return;
      const { rollItem, makeWeaponItem } = await import("../../src/game/items");
      const seeds: { item: ReturnType<typeof rollItem>; price: number; name: string }[] = [
        { item: makeWeaponItem("sting", 1), price: 120, name: "THE BROKER" },
        { item: makeWeaponItem("needler", 2), price: 280, name: "THE BROKER" },
        { item: rollItem(2, 0.5, "tuned"), price: 200, name: "FENCE" },
        { item: rollItem(3, 0.8, "tuned"), price: 340, name: "FENCE" },
        { item: rollItem(4, 1.2, "blackice"), price: 720, name: "VOID VENDOR" },
        { item: rollItem(1, 0, "standard"), price: 80, name: "STREET STALL" },
        { item: rollItem(2, 0.3, "standard"), price: 95, name: "STREET STALL" },
        { item: makeWeaponItem("breacher", 2), price: 400, name: "THE BROKER" },
      ];
      const now = Date.now();
      for (const s of seeds) {
        await this.env.DB.prepare(
          "INSERT INTO auctions (seller, seller_name, item, price, currency, status, created_at) VALUES (?,?,?,?,?,'open',?)",
        )
          .bind("__broker", s.name, JSON.stringify(s.item), s.price, "credits", now)
          .run();
      }
    } catch {
      /* table missing in old DBs — ignore */
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
        const price = Math.floor(msg.price ?? 0);
        const idx = p.inventory.findIndex((it) => it.id === msg.itemId);
        if (idx < 0) return sys("can only list items in your bag (unequip first)");
        const item = p.inventory[idx];
        if (currency === "metro") {
          if (!(price >= MIN_METRO_PRICE && price <= MAX_PRICE)) return sys(`price must be ◈${MIN_METRO_PRICE}–${MAX_PRICE} $METRO`);
          const fee = metroListingFee(price);
          if (p.metro < fee) return sys(`listing fee is ◈${fee} $METRO`);
          p.inventory.splice(idx, 1);
          p.metro -= fee;
          p.dirty = true;
          await DB.prepare("INSERT INTO auctions (seller, seller_name, item, price, currency, status, created_at) VALUES (?,?,?,?,?,'open',?)")
            .bind(p.id, p.name, JSON.stringify(item), price, currency, Date.now())
            .run();
          sys(`listed ${item.name} for ◈${price} $METRO (fee ◈${fee})`);
        } else {
          if (!(price >= MIN_PRICE && price <= MAX_PRICE)) return sys(`price must be ₵${MIN_PRICE}–${MAX_PRICE}`);
          const fee = listingFee(price);
          if (p.credits < fee) return sys(`listing fee is ₵${fee}`);
          p.inventory.splice(idx, 1);
          p.credits -= fee;
          p.dirty = true;
          await DB.prepare("INSERT INTO auctions (seller, seller_name, item, price, currency, status, created_at) VALUES (?,?,?,?,?,'open',?)")
            .bind(p.id, p.name, JSON.stringify(item), price, currency, Date.now())
            .run();
          sys(`listed ${item.name} for ₵${price} (fee ₵${fee})`);
        }
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
        const price = row.price;
        const isMetro = row.currency === "metro";
        if (isMetro) {
          if (p.metro < price) return sys(`not enough $METRO (need ◈${price})`);
        } else if (p.credits < price) return sys(`not enough credits (₵${price})`);
        // ATOMIC claim — a single buyer wins the row; ONLY then do money + item move
        const claim = await DB.prepare("UPDATE auctions SET status='sold', buyer=? WHERE id=? AND status='open'").bind(p.id, id).run();
        if (claim.meta.changes === 0) return sys("someone else just bought it");
        const item = this.parseItemJson(row.item);
        if (isMetro) p.metro -= price;
        else p.credits -= price;
        p.dirty = true;
        if (item) {
          p.inventory.push(item);
          if (p.inventory.length > INVENTORY_CAP) p.inventory.shift();
          this.send(ws, { t: "inv", items: p.inventory });
        }
        // pay the seller: in-memory if they're in THIS zone, else via the cross-zone mailbox
        const seller = this.players.get(row.seller);
        if (seller) {
          if (isMetro) {
            seller.metro += price;
          } else {
            seller.credits += price;
            this.bumpStat(seller, "credits", price);
          }
          seller.dirty = true;
          this.sendTo(seller.id, {
            t: "sys",
            text: isMetro ? `✦ sold ${item?.name ?? "item"} for ◈${price} $METRO` : `✦ sold ${item?.name ?? "item"} for ₵${price}`,
          });
        } else if (isMetro) {
          await DB.prepare("INSERT INTO mailbox (player, metro, reason, created_at) VALUES (?,?,?,?)")
            .bind(row.seller, price, "auction sale ($METRO)", Date.now())
            .run();
        } else {
          await DB.prepare("INSERT INTO mailbox (player, credits, reason, created_at) VALUES (?,?,?,?)").bind(row.seller, price, "auction sale", Date.now()).run();
        }
        sys(isMetro ? `bought ${item?.name ?? "item"} for ◈${price} $METRO` : `bought ${item?.name ?? "item"} for ₵${price}`);
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
      const { results } = await this.env.DB.prepare("SELECT id, credits, cores, metro, item FROM mailbox WHERE player=? LIMIT 50")
        .bind(p.id)
        .all<{ id: number; credits: number; cores: number; metro: number; item: string | null }>();
      if (!results || results.length === 0) return false;
      let dc = 0;
      let dk = 0;
      let dm = 0;
      const items: Item[] = [];
      const ids: number[] = [];
      for (const r of results) {
        dc += r.credits || 0;
        dk += r.cores || 0;
        dm += r.metro || 0;
        const it = this.parseItemJson(r.item);
        if (it) items.push(it);
        ids.push(r.id);
      }
      p.credits += dc;
      p.cores += dk;
      p.metro += dm;
      for (const it of items) {
        p.inventory.push(it);
        if (p.inventory.length > INVENTORY_CAP) p.inventory.shift();
      }
      p.dirty = true;
      await this.env.DB.prepare(`DELETE FROM mailbox WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).run();
      if (dc || dk || dm) {
        const parts = [];
        if (dc) parts.push(`₵${dc}`);
        if (dk) parts.push(`${dk}◈ cores`);
        if (dm) parts.push(`◈${dm} $METRO`);
        this.sendTo(p.id, { t: "sys", text: `✉ received ${parts.join(" · ")} from the market` });
      }
      if (items.length) this.sendTo(p.id, { t: "inv", items: p.inventory });
      return true;
    } catch {
      return false;
    }
  }

  // ── cosmetics / transmog — wallet-owned appearance overrides (zero power) ──
  private sendCosmetics(ws: WebSocket, p: PlayerState) {
    this.send(ws, { t: "cosmetics", owned: [...p.cosmeticsOwned], equipped: p.cosmeticEquipped });
  }

  private async onCosmetic(ws: WebSocket, msg: Extract<ClientMsg, { t: "cosmetic" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    const DB = this.env.DB;
    const sys = (text: string) => this.send(ws, { t: "sys", text });
    const armed = this.env.METRO_MAINNET_ARMED === "1";
    try {
      if (msg.action === "list") {
        this.sendCosmetics(ws, p);
        return;
      }
      if (msg.action === "buy") {
        const c = getCosmetic(msg.id ?? "");
        if (!c) return;
        if (p.cosmeticsOwned.has(c.id)) return sys("already in your wardrobe");
        if (c.nft && !armed) return sys(`${c.name} is an on-chain NFT skin — gated until mainnet is armed (counsel)`);
        if (c.price > 0 && p.credits < c.price) return sys(`need ₵${c.price} for ${c.name}`);
        if (c.price > 0) {
          p.credits -= c.price;
          p.dirty = true;
        }
        p.cosmeticsOwned.add(c.id);
        await DB.prepare("INSERT OR IGNORE INTO player_cosmetics (player, cosmetic_id, equipped, at) VALUES (?,?,0,?)").bind(p.id, c.id, Date.now()).run();
        sys(`unlocked ${c.name}`);
        this.sendCosmetics(ws, p);
      } else if (msg.action === "equip") {
        const id = msg.id ?? "";
        if (!p.cosmeticsOwned.has(id)) return sys("you don't own that skin");
        p.cosmeticEquipped = id;
        await DB.prepare("UPDATE player_cosmetics SET equipped = CASE WHEN cosmetic_id = ? THEN 1 ELSE 0 END WHERE player = ?").bind(id, p.id).run();
        sys(`equipped ${getCosmetic(id)?.name ?? id}`);
        this.sendCosmetics(ws, p);
      } else if (msg.action === "unequip") {
        p.cosmeticEquipped = null;
        await DB.prepare("UPDATE player_cosmetics SET equipped = 0 WHERE player = ?").bind(p.id).run();
        sys("transmog cleared");
        this.sendCosmetics(ws, p);
      }
    } catch {
      sys("wardrobe action failed");
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
    proof?: {
      wallet?: string;
      sig?: string;
      ts?: number;
      arrival?: "organic" | "fast";
      from?: string;
      classId?: string;
      secret?: string;
      session?: string;
    },
  ) {
    const name = (rawName || "").trim().slice(0, 16) || "blank";
    const reject = (text: string) => {
      this.send(ws, { t: "sys", text });
      try {
        ws.close(4001, "auth");
      } catch {
        /* already closing */
      }
    };
    try {
      await this.onLoginInner(ws, name, faction, look, proof, reject);
    } catch (e) {
      // D1/schema hiccups used to hang the socket with no welcome — client stuck in
      // offline walk mode, tutorial never advanced. Always surface a close reason.
      const reason = String((e as Error)?.message ?? e).slice(0, 120);
      this.send(ws, { t: "sys", text: `login failed — ${reason}` });
      try {
        ws.close(1011, "login");
      } catch {
        /* already closing */
      }
    }
  }

  private async onLoginInner(
    ws: WebSocket,
    name: string,
    faction: number | undefined,
    look: PlayerLook | undefined,
    proof:
      | {
          wallet?: string;
          sig?: string;
          ts?: number;
          arrival?: "organic" | "fast";
          from?: string;
          classId?: string;
          secret?: string;
          session?: string;
        }
      | undefined,
    reject: (text: string) => void,
  ) {
    // Identity:
    //  1) MetaMask/Solana signature (fresh) → durable wallet id
    //  2) Wallet + device session (bound after first signed login) → same id, no re-sign
    //  3) Guest multiplayer: callsign + device secret (full D1 save, no wallet required)
    let id: string;
    let walletSignedIn = false;
    if (proof?.wallet || proof?.sig) {
      const verified =
        proof.wallet && proof.sig && Number.isFinite(proof.ts)
          ? verifyWalletLogin({ wallet: proof.wallet, sig: proof.sig, ts: proof.ts! })
          : null;
      if (verified) {
        id = verified;
        walletSignedIn = true;
      } else if (proof.wallet && proof.session) {
        // Session resume (zone travel) — no MetaMask popup.
        const wid = walletPlayerId(proof.wallet);
        if (!wid) {
          this.send(ws, { t: "sys", text: "wallet sign-in failed — bad wallet address" });
          try {
            ws.close(4001, "auth");
          } catch {
            /* already closing */
          }
          return;
        }
        id = wid;
        // secret match checked after loadPlayer below
      } else {
        this.send(ws, { t: "sys", text: "wallet sign-in failed — bad signature or stale request" });
        try {
          ws.close(4001, "auth");
        } catch {
          /* already closing */
        }
        return;
      }
    } else {
      id = name.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "blank";
      // "__" ids are reserved for authored NPCs (estate owners, market sellers) — a live
      // player must never be able to log in AS one and liquidate its property
      if (id.startsWith("__")) return reject("that callsign is reserved");
    }
    const fac = Number.isInteger(faction) && faction! >= 0 && faction! < FACTION_COUNT ? faction! : 0;
    const p = this.players.get(id) ?? (await this.loadPlayer(id, name, fac));
    // Guest identities are device-bound: the first login binds the client-generated
    // secret to the callsign; every later login must present it. Without this, ANY
    // visitor could type an existing name and sell that player's house out from under
    // them. Wallet ids ("w:") use signature on first login, then device session.
    if (!id.startsWith("w:")) {
      // Guest multiplayer save — progress is real server state; the device secret is the key.
      const presented = (proof?.secret ?? "").slice(0, 64) || null;
      if (!presented) {
        return reject("guest save requires a device key — enable storage / cookies for this site, then retry");
      }
      // Harness leftovers: smoke.mjs binds `smk-<name>`. Those are not real device keys —
      // allow a real client UUID to reclaim the callsign (was locking players out of common names).
      const harnessSecret = !!p.secret && (p.secret.startsWith("smk-") || p.secret.length < 16);
      const mismatch = !!p.secret && p.secret !== presented && !harnessSecret;
      if (mismatch) {
        // The device-secret lock exists ONLY to stop someone hijacking an established
        // guest's assets (house / credits / loot). A fresh or barely-started save has
        // nothing to steal, so a mismatch there is almost always the SAME player after a
        // storage wipe — new browser, cleared cookies, incognito, or the embedded webview
        // that doesn't persist localStorage. Bricking a no-wallet newcomer at the tutorial
        // door is pure downside, so only keep the hard lock when the save is worth
        // protecting; otherwise let the new device rebind and take over.
        if (await this.guestSaveHasAssets(p)) {
          return reject("that callsign is already saved on another device — pick a new callsign, or link a wallet to move it");
        }
      }
      if (!p.secret || harnessSecret || mismatch) {
        // Bind on first claim, rebind a harness row, or rebind an empty save onto the
        // presenting device (the returning-after-wipe case cleared above).
        p.secret = presented;
        await this.env.DB.prepare("UPDATE players SET secret = ? WHERE id = ?").bind(presented, id).run();
      }
    } else {
      const session = (proof?.session ?? "").slice(0, 64) || null;
      if (walletSignedIn) {
        // Fresh MetaMask signature: bind/refresh device session so later zones skip re-sign.
        if (session) {
          p.secret = session;
          await this.env.DB.prepare("UPDATE players SET secret = ? WHERE id = ?").bind(session, id).run();
        }
      } else {
        // Session-only resume: must match the secret bound on a prior signed login.
        if (!session || !p.secret || p.secret !== session) {
          this.send(ws, {
            t: "sys",
            text: "wallet session expired — sign in once with MetaMask from the title screen",
          });
          try {
            ws.close(4001, "auth");
          } catch {
            /* already closing */
          }
          return;
        }
      }
      // Wallet login: if this device has a guest secret for the same callsign, merge
      // guest progress (credits / look / campaign) into the wallet account once.
      // Lets offline players claim their runner when they link a wallet.
      const presented = (proof?.secret ?? "").slice(0, 64) || null;
      if (presented) {
        const guestId = name.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "";
        if (guestId && !guestId.startsWith("__") && guestId !== id) {
          try {
            const guest = await this.loadPlayer(guestId, name, fac);
            if (guest.secret && guest.secret === presented) {
              // only merge into a fresh wallet shell (no look / low credits)
              const walletFresh = !p.look && (p.credits ?? 0) < 50;
              if (walletFresh && (guest.look || (guest.credits ?? 0) > (p.credits ?? 0))) {
                if (guest.look) p.look = guest.look;
                if ((guest.credits ?? 0) > (p.credits ?? 0)) p.credits = guest.credits;
                if ((guest.cores ?? 0) > (p.cores ?? 0)) p.cores = guest.cores;
                if (guest.campaign) p.campaign = guest.campaign;
                if (guest.classId) p.classId = guest.classId;
                p.dirty = true;
                this.send(ws, {
                  t: "sys",
                  text: "◈ offline runner claimed onto this wallet — progress merged",
                });
              }
            }
          } catch {
            /* guest load failed — ignore */
          }
        }
      }
    }
    p.faction = fac;
    // warm-path spawn sanitation: an in-memory player can be wall-locked too
    // (loadPlayer's check only covers cold loads)
    if (
      tileIsWall(p.x, p.y, this.grid) ||
      (tileIsWall(p.x + TILE, p.y, this.grid) &&
        tileIsWall(p.x - TILE, p.y, this.grid) &&
        tileIsWall(p.x, p.y + TILE, this.grid) &&
        tileIsWall(p.x, p.y - TILE, this.grid))
    ) {
      p.x = this.spawn.x;
      p.y = this.spawn.y;
      p.dirty = true;
    }
    // class selects the signature ability (validated against the known roster)
    const CLASS_IDS = new Set(["metrophage", "k-guerilla", "wintermute", "swarm"]);
    if (proof?.classId && CLASS_IDS.has(proof.classId)) p.classId = proof.classId;
    // Zone handoff: always place at the correct entry spawn for this room.
    // (Venue-sized interiors used to inherit district/safehouse coords via a weak
    // spawnPointForTravel match and park the runner outside the walls.)
    if (proof?.from || isVenueSizedZone(this.zoneName) || isSafehouseSizedInterior(this.zoneName)) {
      const def = this.bridgeIndex >= 0 ? undefined : DISTRICTS[this.districtIndex];
      const s = spawnPointForTravel(this.grid, this.zoneName, proof?.from, def, this.spawn);
      // Unmapped named-zone travel (subway/estates ← safe) can resolve via a district
      // design spawn that is a WALL on this zone's real grid — never accept a
      // wall-locked arrival; the DO's own spawn is the zone's canonical entrance.
      if (tileIsWall(s.x, s.y, this.grid)) {
        p.x = this.spawn.x;
        p.y = this.spawn.y;
      } else {
        p.x = s.x;
        p.y = s.y;
      }
      p.dirty = true;
    } else if (
      tileIsWall(p.x, p.y, this.grid) ||
      p.x < 0 ||
      p.y < 0 ||
      p.x >= gridDims(this.grid).worldW ||
      p.y >= gridDims(this.grid).worldH
    ) {
      p.x = this.spawn.x;
      p.y = this.spawn.y;
      p.dirty = true;
    }
    const lookLocked = !!p.look;
    // One-time character creation: persist a client look only when none is stored yet.
    // Wallet identities keep their saved appearance across devices; later edits are ignored.
    if (look && !lookLocked) {
      p.look = look;
      p.dirty = true;
    }
    if (!lookLocked && look && id.startsWith("w:")) {
      p.name = name;
      p.dirty = true;
    }
    this.players.set(id, p);
    this.sessions.set(ws, id);
    if (this.diveIndex >= 0) this.coopScaleDive(); // the vault hardens as runners stack up
    // Persist identity + look on the socket so a hibernation wake can re-attach it (above).
    ws.serializeAttachment({ id, name: p.name, faction: fac, look: p.look } satisfies SessionAttach);
    this.send(ws, {
      t: "welcome",
      id,
      faction: fac,
      x: round2(p.x),
      y: round2(p.y),
      tickMs: NET_TICK_MS,
      world: { w: gridDims(this.grid).worldW, h: gridDims(this.grid).worldH },
      protocol: PROTOCOL_VERSION,
      look: p.look,
      lookLocked: lookLocked || !!p.look,
      fragments: p.fragments,
    });
    // AFTER welcome — clients (and smoke bots) attach their sys listeners post-login
    if (this.provingVault) {
      const wk = WorldDO.weekNow();
      this.send(ws, {
        t: "sys",
        text: `◆ THE PROVING — ${WorldDO.weeklyAffix().name} · bring a crew · ${p.campaign.hasFlag(`vaultwk${wk}`) ? "already cleared this week" : "first clear pays ₵750"}`,
      });
    }
    if (this.inTutorial()) {
      if (p.tutorialDone) {
        this.send(ws, { t: "redirect", zone: "safe", text: "Drill already complete — deploying." });
        try {
          ws.close(1000, "graduate");
        } catch {
          /* noop */
        }
        return;
      }
      p.tutorialAnchorX = p.x;
      p.tutorialAnchorY = p.y;
      if (p.inventory.length === 0) {
        p.inventory.push(rollItem(1, 0.5));
        this.send(ws, { t: "inv", items: p.inventory });
      }
      this.ensureTutorialSupplies(p);
      this.sendTutorialState(p);
    } else {
      this.ensureStarterKit(p);
      this.sendCampaignBeat(ws, p);
      if (this.zoneName === "safe") {
        const nearHub =
          Math.hypot(p.x - CITY_HUB_SPAWN.x, p.y - CITY_HUB_SPAWN.y) < 96 ||
          Math.hypot(p.x - this.spawn.x, p.y - this.spawn.y) < 96;
        if (nearHub) {
          const s = this.spreadSpawn(CITY_HUB_SPAWN, id);
          p.x = s.x;
          p.y = s.y;
        }
        if (!p.campaign.activeId) {
          this.send(ws, {
            t: "sys",
            text: `◢ METRO CITY — ${this.sessions.size} runners online · safe zone. THE FIXER (J) knew the last you. Accept THE WAKE, then DEPLOY GATE.`,
          });
        } else {
          this.send(ws, { t: "sys", text: `◢ METRO CITY — ${this.sessions.size} runners sharing this zone.` });
        }
      } else if (this.bridgeIndex >= 0) {
        const b = getBridge(this.bridgeIndex);
        this.send(ws, {
          t: "sys",
          text: `▣ ${b.name} — wilderness trail between districts. Purge patrols · grab salvage · walk both gates to unlock fast travel.`,
        });
      }
    }
    this.send(ws, { t: "inv", items: p.inventory }); // hydrate their held gear
    this.send(ws, { t: "stashv", items: p.stash }); // hydrate the personal stash (lockbox)
    if (parseEstateInterior(this.zoneName) !== null) await this.sendEstate(ws, p); // hydrate this home's ownership + furniture
    if (this.zoneName === ESTATES_ZONE) await this.sendEstatesDir(ws); // hydrate the street's FOR SALE / owner plates
    // HOMESTEAD beat — walking into THE ESTATES (or any home there) is the objective
    if (this.zoneName === ESTATES_ZONE || parseEstateInterior(this.zoneName) !== null) this.campaignEvent(p, "visit");
    // district arrivals: the RUNNING condition + the day's bounty, so the hunt is known
    if (/^d\d+$/.test(this.zoneName)) {
      const dm = dailyDistrictMod(this.districtIndex, this.modDay >= 0 ? this.modDay : dayIndex());
      this.send(ws, { t: "sys", text: `◈ district condition — ${dm.name}: ${dm.blurb}` });
      await this.maybePromoteHvt();
      for (const e of this.enemies.values())
        if (e.hvt && e.hp > 0) {
          const dir = WorldDO.compass(e.x - this.spawn.x, e.y - this.spawn.y);
          this.send(ws, { t: "sys", text: `◈ HIGH-VALUE TARGET active: ${e.name} — ${HVT_BOUNTY_MULT}× bounty · last pinged ${dir} of the deploy point.` });
          break;
        }
    }
    this.sendLoadout(ws, p); // hydrate equipped gear + derived max HP
    this.noteDeepest(p); // arriving in this district may set a "deepest reached" milestone
    this.send(ws, { t: "achv", ids: [...p.achv] }); // hydrate the unlocked achievement set
    await this.sendGuild(ws, p); // hydrate cell membership/bank/roster (cross-zone, D1)
    await this.drainMail(p); // collect any auction proceeds that arrived while away
    this.sendContracts(ws, p); // hydrate today's daily contracts + reputation
    this.sendCosmetics(ws, p); // hydrate owned cosmetics + equipped transmog
    this.sendBounty(ws, p); // hydrate any active NPC bounty
    const organic = proof?.arrival !== "fast";
    await this.markDiscovered(ws, id, organic);
    this.ensureTick();
    await this.ensureSupervisor();
  }

  /**
   * True when a guest save holds real, hijackable value worth keeping the device lock on.
   * Fresh or barely-started saves return false so a returning device can rebind the callsign
   * after a storage wipe (new browser / cleared cookies / non-persistent webview) instead of
   * being locked out forever — the exact wall a no-wallet newcomer hits at the tutorial door.
   *
   * Signals are progression state, NOT the starter grant: every new guest is handed
   * ~100₵, a few cores, and two starter items, and may reach the city before storage
   * is durable. A callsign should only hard-lock once there is actual progress/value
   * to protect: quest state, levels, banked credits, fragments, weekly flags, stash,
   * or property. Only consulted on a secret mismatch, so the D1 lookups are off the
   * hot path.
   */
  private async guestSaveHasAssets(p: PlayerState): Promise<boolean> {
    if ((p.level ?? 1) >= 2) return true; // real grind, not a first-kill fluke
    if ((p.credits ?? 0) >= 1000) return true; // banked wealth well beyond the ~100₵ starter grant
    if (p.stash.length > 0) return true; // anything moved to a lockbox is intentional value
    if (p.fragments.length > 0) return true; // recovered story memory / dive reward
    if (p.campaign.activeId || p.campaign.completed.length > 0 || p.campaign.flags.size > 0) return true;
    try {
      const est = await this.env.DB.prepare("SELECT 1 FROM estates WHERE owner = ? LIMIT 1").bind(p.id).first();
      if (est) return true; // owns a home — the exact thing the lock protects
    } catch {
      /* estates table absent in some test DBs — treat as no property */
    }
    return false;
  }

  /** Build a player's runtime state, loading durable fields (pos/credits/xp/cores/
   *  quest) from D1. Shared by fresh login and hibernation-wake rehydration. */
  private async loadPlayer(id: string, name: string, fac: number): Promise<PlayerState> {
    await this.loadMeta();
    let x = this.spawn.x;
    let y = this.spawn.y;
    let credits = 0;
    let metro = 0;
    let xp = 0;
    let cores = 0;
    let campaign = new Campaign();
    let tutorialDone = false;
    let tutorialStep = 0;
    let tutorialMode: TutorialMode = "quick";
    let inventory: Item[] = [];
    let stash: Item[] = [];
    let look: PlayerLook | undefined;
    let equipped: Partial<Record<Slot, Item>> = {};
    let fragments: string[] = [];
    let secret: string | null = null;
    const row = await this.env.DB.prepare(
      "SELECT x, y, credits, metro, xp, zone, cores, quest_step, campaign, tutorial_done, tutorial_step, tutorial_mode, inventory, look, equipped, fragments, stash, secret FROM players WHERE id = ?",
    )
      .bind(id)
      .first<{
        x: number;
        y: number;
        credits: number;
        metro: number;
        xp: number;
        zone: string;
        cores: number;
        quest_step: number;
        campaign: string | null;
        tutorial_done: number;
        tutorial_step: number;
        tutorial_mode: string | null;
        inventory: string;
        look: string | null;
        equipped: string;
        fragments: string | null;
        stash: string | null;
        secret: string | null;
      }>();
    if (row) {
      credits = row.credits ?? 0;
      metro = row.metro ?? 0;
      xp = row.xp ?? 0;
      cores = row.cores ?? 0;
      campaign = new Campaign(parseCampaign(row.campaign));
      if (!row.campaign && (row.quest_step ?? 0) > 0) {
        campaign = new Campaign({ activeId: "the_wake", stage: 0, progress: 0, completed: [], flags: [] });
      }
      inventory = parseInventory(row.inventory);
      look = parseLook(row.look);
      equipped = parseEquipped(row.equipped);
      try {
        const f = row.fragments ? (JSON.parse(row.fragments) as unknown) : [];
        fragments = Array.isArray(f) ? f.filter((v): v is string => typeof v === "string") : [];
      } catch {
        fragments = [];
      }
      stash = parseInventory(row.stash ?? "[]"); // same defensive Item[] parse as the bag
      secret = row.secret ?? null;
      tutorialDone = !!row.tutorial_done;
      tutorialStep = row.tutorial_step ?? 0;
      tutorialMode = row.tutorial_mode === "full" ? "full" : "quick";
      if (this.inTutorial() && tutorialDone) {
        x = CITY_HUB_SPAWN.x;
        y = CITY_HUB_SPAWN.y;
      } else if (row.zone === this.zoneName) {
        x = row.x;
        y = row.y;
        // sanitize: a save can land in (or be sealed inside) geometry — if the spot
        // itself is wall, or every one-tile step out of it is wall, respawn at the
        // zone spawn instead of trapping the player forever
        const stuck =
          tileIsWall(x, y, this.grid) ||
          (tileIsWall(x + TILE, y, this.grid) &&
            tileIsWall(x - TILE, y, this.grid) &&
            tileIsWall(x, y + TILE, this.grid) &&
            tileIsWall(x, y - TILE, this.grid));
        if (stuck) {
          x = this.spawn.x;
          y = this.spawn.y;
        }
      }
    } else {
      await this.upsert(id, name, x, y, 0, 0, 0, 0, campaign.toData(), [], [], undefined, {}, false, 0);
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
    // cosmetics / transmog — owned set + the equipped override (cosmetic only)
    const cosmeticsOwned = new Set<string>();
    let cosmeticEquipped: string | null = null;
    try {
      const cres = await this.env.DB.prepare("SELECT cosmetic_id, equipped FROM player_cosmetics WHERE player = ?")
        .bind(id)
        .all<{ cosmetic_id: string; equipped: number }>();
      for (const r of cres.results ?? []) {
        cosmeticsOwned.add(r.cosmetic_id);
        if (r.equipped) cosmeticEquipped = r.cosmetic_id;
      }
    } catch {
      /* table may not exist before migration */
    }
    const mods = deriveMods(equipped);
    const maxHp = PLAYER_HP + Math.round(mods.hpAdd);
    return {
      id,
      name,
      secret,
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
      pvpInArena: false,
      pvpEscrow: 0,
      pvpSafeX: x,
      pvpSafeY: y,
      credits,
      cores,
      metro,
      inventory,
      stash,
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
      campaign,
      fragments,
      classId: "metrophage",
      dashUntilTick: 0,
      dashCdUntilTick: 0,
      dashDx: 0,
      dashDy: 0,
      iframeUntilTick: 0,
      abilityCdUntilTick: 0,
      ability2CdUntilTick: 0,
      droneUntilTick: 0,
      droneNextTick: 0,
      droneKind: 0,
      heat: 0,
      heatGainTick: 0,
      tutorialDone,
      tutorialStep,
      tutorialMode,
      tutorialProgress: 0,
      tutorialAnchorX: x,
      tutorialAnchorY: y,
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
      cosmeticsOwned,
      cosmeticEquipped,
      bounty: null,
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

  /** Push the current campaign beat (stage journal + uplink line) to one client. */
  private sendCampaignBeat(ws: WebSocket, p: PlayerState) {
    const q = p.campaign.active;
    const s = p.campaign.currentStage;
    if (q && s) {
      this.send(ws, {
        t: "story",
        quest: q.name,
        stage: s.id,
        title: s.objective,
        text: s.onEnterLine ?? s.journal,
        journal: s.journal,
        objective: s.objective,
        done: false,
      });
      return;
    }
    const next = p.campaign.nextOffer();
    if (next) {
      this.send(ws, {
        t: "story",
        quest: next.name,
        stage: "offer",
        title: "THE FIXER",
        text: `THE FIXER pinged your uplink: ${next.name}. They're in the safehouse. They've got that look again — like they already know how this ends.`,
        journal: next.stages[0]?.journal ?? "",
        objective: "Visit THE FIXER",
        done: false,
      });
      return;
    }
    this.send(ws, {
      t: "story",
      quest: "THE AWAKENING",
      stage: "done",
      title: "Recurrence",
      text: CAMPAIGN_DONE_TEXT,
      journal: CAMPAIGN_DONE_TEXT,
      objective: "—",
      done: true,
    });
  }

  private grantCampaignReward(p: PlayerState, reward: QuestReward) {
    p.xp += reward.xp;
    p.level = levelForXp(p.xp);
    p.credits += reward.currency;
    p.dirty = true;
    this.sendTo(p.id, { t: "sys", text: `◈ quest complete — +${reward.xp} XP  ₵${reward.currency}` });
  }

  /** Advance the personal campaign when a stage completes. */
  private campaignBeat(p: PlayerState) {
    const finished = p.campaign.tickAfterAdvance();
    if (finished) this.grantCampaignReward(p, finished.reward);
    p.dirty = true;
    for (const [sock, id] of this.sessions) if (id === p.id) this.sendCampaignBeat(sock, p);
  }

  /** Fire a gameplay trigger against the active campaign stage. */
  private campaignEvent(p: PlayerState, type: QuestTriggerType, n = 1) {
    if (this.inTutorial()) return;
    const r = p.campaign.onTrigger(type, n);
    if (!r) return;
    this.campaignBeat(p);
  }

  /** Shared campaign credit for a kill: party members fighting beside the killer get
   *  the kill beat too, and a world boss pays its "boss" beat to EVERY runner still
   *  standing — massed fire is the point of the finale, not kill-steal roulette. */
  private sharedKillCredit(killer: PlayerState, e: { x: number; y: number }, isBoss: boolean) {
    if (killer.party >= 0) {
      for (const ally of this.players.values()) {
        if (ally.id === killer.id || ally.dead || ally.party !== killer.party) continue;
        if (Math.hypot(ally.x - e.x, ally.y - e.y) <= 640) this.campaignEvent(ally, "kill");
      }
    }
    if (isBoss) for (const p of this.players.values()) if (!p.dead) this.campaignEvent(p, "boss");
  }

  /** Node captured. In a district, captures are infection; in an ICE VAULT the single
   *  node is the fragment core, so a capture is the DIVE itself — the beats no longer
   *  alias each other (dive stages used to advance from ordinary captures). */
  private campaignCapture(p: PlayerState) {
    const s = p.campaign.currentStage;
    if (!s) return;
    const inDive = this.diveIndex >= 0;
    if (s.on.type === "infect" && !inDive) this.campaignEvent(p, "infect");
    else if (s.on.type === "dive" && inDive) this.campaignEvent(p, "dive");
  }

  private campaignSecureCheck(p: PlayerState) {
    if (this.districtControl() !== p.faction) return;
    this.campaignEvent(p, "secure");
  }

  /** True while a given world event is in its active window. */
  private eventActive(id: string): boolean {
    return this.worldEvent?.phase === "active" && this.worldEvent.def.id === id;
  }

  private broadcastEvent(def: WorldEventDef, phase: "telegraph" | "active" | "end", seconds: number) {
    this.broadcast({ t: "event", id: def.id, name: def.name, tagline: def.tagline, hex: def.hex, phase, seconds });
  }

  /** Dynamic world events — SERVER-authoritative version of the old SP scheduler:
   *  combat districts only; idle -> telegraph -> active (real sim effects) -> payout.
   *  Effects: neon_storm rains dodgeable AoE strikes; purge_wave deploys an HSS wave;
   *  contagion_outbreak doubles node channelling; blackout blinds the HSS (aggro cut —
   *  the window to move ground). Everyone alive in the district at the end is paid. */
  private stepWorldEvent() {
    const district = this.diveIndex < 0 && !this.interior && this.bridgeIndex < 0 && !this.inTutorial();
    if (!district) return;
    if (this.nextEventTick < 0) this.nextEventTick = this.tick + ticks(WORLD_EVENT.firstDelayMs);

    if (!this.worldEvent) {
      if (this.tick < this.nextEventTick || this.players.size === 0) return;
      const heat = Math.min(1, this.enemies.size / 14);
      const pool = WORLD_EVENTS.filter((e) => heat >= e.minHeatNorm);
      if (pool.length === 0) return;
      let acc = Math.random() * pool.reduce((a, e) => a + e.weight, 0);
      let def = pool[0];
      for (const e of pool) {
        acc -= e.weight;
        if (acc <= 0) {
          def = e;
          break;
        }
      }
      this.worldEvent = { def, phase: "telegraph", untilTick: this.tick + ticks(def.telegraphMs) };
      this.broadcastEvent(def, "telegraph", Math.ceil(def.telegraphMs / 1000));
      return;
    }

    const ev = this.worldEvent;
    if (this.tick >= ev.untilTick) {
      if (ev.phase === "telegraph") {
        ev.phase = "active";
        ev.untilTick = this.tick + ticks(ev.def.durationMs);
        this.broadcastEvent(ev.def, "active", Math.ceil(ev.def.durationMs / 1000));
        if (ev.def.id === "purge_wave") this.spawnEventWave();
      } else {
        // payout — everyone alive in the district rides the event out together
        for (const p of this.players.values()) {
          if (p.dead) continue;
          p.xp += ev.def.reward.xp;
          p.level = levelForXp(p.xp);
          p.credits += ev.def.reward.currency;
          p.dirty = true;
          this.campaignEvent(p, "event"); // SKYLINK BREAK's storm beat — survived together
          this.sendTo(p.id, { t: "sys", text: `◈ ${ev.def.name} weathered — +${ev.def.reward.xp} XP  ₵${ev.def.reward.currency}` });
        }
        this.broadcastEvent(ev.def, "end", 0);
        this.worldEvent = null;
        this.nextEventTick =
          this.tick + ticks(WORLD_EVENT.intervalMinMs + Math.random() * (WORLD_EVENT.intervalMaxMs - WORLD_EVENT.intervalMinMs));
      }
      return;
    }

    // active-phase sim effects
    if (ev.phase === "active" && ev.def.id === "neon_storm") {
      if ((this.tick - this.lastStormTick) * NET_TICK_MS >= 900) {
        this.lastStormTick = this.tick;
        const victims = [...this.players.values()].filter((p) => !p.dead);
        if (victims.length) {
          const v = victims[Math.floor(Math.random() * victims.length)];
          const ang = Math.random() * Math.PI * 2;
          const r = 40 + Math.random() * 140;
          this.hazards.push({
            id: this.nextHazardId++,
            x: v.x + Math.cos(ang) * r,
            y: v.y + Math.sin(ang) * r,
            r: 70,
            castTick: this.tick,
            detonateTick: this.tick + ticks(900),
            dmg: 12,
          });
        }
      }
    }
  }

  /** REPO PURGE WAVE — an immediate HSS deployment around each live player. */
  private spawnEventWave() {
    const kinds = [0, 2, 3, 4];
    let spawned = 0;
    for (const p of this.players.values()) {
      if (p.dead || spawned >= 10) continue;
      for (let i = 0; i < 3 && spawned < 10; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 260 + Math.random() * 160;
        const x = p.x + Math.cos(ang) * rad;
        const y = p.y + Math.sin(ang) * rad;
        if (tileIsWall(x, y, this.grid)) continue;
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const id = this.nextEnemyId++;
        const hp = ENEMY_ARCHES[kind].hp;
        this.enemies.set(id, { id, x, y, ox: x, oy: y, hp, maxHp: hp, respawnTick: 0, lastFireTick: 0, kind });
        spawned++;
      }
    }
  }

  /** Which memory THIS player would pull from this vault: the authored fragment of an
   *  active dive stage, else the district's default memory. */
  private diveFragmentIdFor(p: PlayerState): string {
    const stage = p.campaign.currentStage;
    return (
      (stage?.on.type === "dive" && stage.fragmentId) || DIVE_DEFAULT_FRAGMENTS[this.diveIndex] || DIVE_DEFAULT_FRAGMENTS[0]
    );
  }

  /** The dive core cracked — hand the player the memory it was freezing. Claim-once per
   *  player (the vault cache, XP/credits, and dive stat ride the FIRST recovery),
   *  persisted to D1. Called both on the capture transition and for late divers who
   *  reach an already-cracked core (a freed mind stays freed, but it's new to THEM). */
  private async recoverFragment(p: PlayerState) {
    const fid = this.diveFragmentIdFor(p);
    const def = getFragment(fid);
    if (!def) return;
    const isNew = !p.fragments.includes(fid);
    if (isNew) {
      p.fragments.push(fid);
      p.credits += 150;
      p.xp += 60;
      p.level = levelForXp(p.xp);
      p.dirty = true;
      this.bumpStat(p, "dives", 1);
      // the vault's cache — a guaranteed roll whose rarity floor rises with depth
      if (p.inventory.length < INVENTORY_CAP) {
        const cache = rollItem(Math.max(1, p.level), Math.min(0.85, 0.35 + this.diveIndex * 0.07));
        p.inventory.push(cache);
        this.sendTo(p.id, { t: "inv", items: p.inventory });
        this.sendTo(p.id, { t: "sys", text: `◈ vault cache cracked — ${cache.name}` });
      }
    }
    this.sendTo(p.id, { t: "fragment", id: fid, title: def.title, lines: def.lines, isNew });
    this.sendTo(p.id, {
      t: "sys",
      text: isNew ? `◈ MEMORY RECOVERED — ${def.title}  (+60 XP  ₵150)` : `◈ memory re-read — ${def.title} (already held)`,
    });
    // THE PROVING — the weekly clear pays big, once per player per week (campaign flag
    // = persisted claim-once), and lands on the week's leaderboard
    if (this.provingVault) {
      const wk = WorldDO.weekNow();
      const flag = `vaultwk${wk}`;
      if (!p.campaign.hasFlag(flag)) {
        p.campaign.flags.add(flag);
        p.credits += 750;
        p.xp += 220;
        p.level = levelForXp(p.xp);
        p.dirty = true;
        this.bumpStat(p, `wk${wk % 100}`, 1);
        if (p.inventory.length < INVENTORY_CAP) {
          const prize = rollItem(Math.max(1, p.level), 2.2);
          p.inventory.push(prize);
          this.sendTo(p.id, { t: "inv", items: p.inventory });
          this.sendTo(p.id, { t: "sys", text: `◆ PROVING PRIZE — ${prize.name}` });
        }
        this.broadcast({ t: "sys", text: `◆ ${p.name} cleared THE PROVING (${WorldDO.weeklyAffix().name.split(" — ")[0]} week)  +₵750` });
      } else {
        this.sendTo(p.id, { t: "sys", text: "◆ THE PROVING — already cleared this week (resets weekly)" });
      }
    }
    if (isNew) {
      try {
        await this.env.DB.prepare("UPDATE players SET fragments = ? WHERE id = ?")
          .bind(JSON.stringify(p.fragments), p.id)
          .run();
      } catch {
        /* column may not exist before migration — recovery still lives this session */
      }
    }
  }

  private onQuest(ws: WebSocket, msg: Extract<ClientMsg, { t: "quest" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    const sys = (text: string) => this.send(ws, { t: "sys", text });
    if (msg.action === "accept") {
      const id = msg.id ?? p.campaign.nextOffer()?.id;
      if (!id) return sys("no quest available");
      const q = p.campaign.accept(id);
      if (!q) return sys("can't accept that quest");
      p.dirty = true;
      sys(`accepted — ${q.name}`);
      this.sendCampaignBeat(ws, p);
      // a "visit" first beat completes instantly if the player is ALREADY standing in the
      // target zone — no leave-and-re-enter dance (visit normally fires on zone login)
      if (q.stages[0]?.on.type === "visit" && (this.zoneName === ESTATES_ZONE || parseEstateInterior(this.zoneName) !== null)) {
        this.campaignEvent(p, "visit");
      }
      return;
    }
    if (msg.action === "talk") {
      if (!p.campaign.isTalkStage()) return sys("nothing to report right now");
      p.campaign.onTalk();
      this.campaignBeat(p);
    }
  }

  private sendTutorialState(p: PlayerState) {
    const mode = p.tutorialMode ?? "quick";
    const total = tutorialTotal(mode);
    const step = tutorialStepAt(p.tutorialStep, mode) ?? tutorialStepAt(total - 1, mode)!;
    const payload = {
      t: "tutorial" as const,
      step: p.tutorialStep,
      total,
      mode,
      title: step.title,
      teach: step.teach,
      hint: step.hint,
      objective: step.title,
      progress: p.tutorialProgress,
      count: step.count,
      portalOpen: tutorialReadyForPortal(p.tutorialStep, mode),
    };
    this.sendTo(p.id, payload);
  }

  private tutorialEvent(p: PlayerState, kind: TutorialKind, n = 1) {
    if (!this.inTutorial() || p.tutorialDone) return;
    const mode = p.tutorialMode ?? "quick";
    const step = tutorialStepAt(p.tutorialStep, mode);
    if (!step || step.kind !== kind) return;
    p.tutorialProgress += n;
    if (p.tutorialProgress >= step.count) {
      p.tutorialStep = Math.min(tutorialTotal(mode), p.tutorialStep + 1);
      p.tutorialProgress = 0;
      p.dirty = true;
      this.sendTo(p.id, { t: "sys", text: `✓ ${step.title} — cleared` });
    }
    this.sendTutorialState(p);
  }

  private socketForPlayer(id: string): WebSocket | undefined {
    for (const [sock, pid] of this.sessions) if (pid === id) return sock;
  }

  private async graduateTutorial(p: PlayerState, ws: WebSocket | undefined, skipped: boolean) {
    if (p.tutorialDone) return;
    const mode = p.tutorialMode ?? "quick";
    p.tutorialDone = true;
    p.tutorialStep = tutorialTotal(mode);
    p.tutorialProgress = 0;
    const hub = this.spreadSpawn(CITY_HUB_SPAWN, p.id);
    p.x = hub.x;
    p.y = hub.y;
    this.ensureStarterKit(p);
    p.dirty = true;
    await this.upsert(
      p.id,
      p.name,
      p.x,
      p.y,
      p.credits,
      p.xp,
      p.cores,
      p.metro,
      p.campaign.toData(),
      p.inventory,
      p.stash,
      p.look,
      p.equipped,
      true,
      tutorialTotal(mode),
      "safe",
      mode,
    );
    const sock = ws ?? this.socketForPlayer(p.id);
    if (sock) {
      this.send(sock, {
        t: "redirect",
        zone: "safe",
        text: skipped ? "Tutorial skipped — deploying to the live city." : "Drill complete — welcome to the city.",
      });
      try {
        sock.close(1000, "graduate");
      } catch {
        /* already closed */
      }
      this.sessions.delete(sock);
    }
    this.players.delete(p.id);
  }

  private onTutorial(ws: WebSocket, msg: Extract<ClientMsg, { t: "tutorial" }>) {
    const p = this.playerFor(ws);
    if (!p || !this.inTutorial()) return;
    if (msg.action === "mode" && (msg.mode === "quick" || msg.mode === "full")) {
      if (p.tutorialStep === 0) {
        p.tutorialMode = msg.mode;
        p.dirty = true;
        this.ensureTutorialSupplies(p);
        this.sendTutorialState(p);
      }
      return;
    }
    if (msg.action === "skip") {
      void this.graduateTutorial(p, ws, true);
      return;
    }
    if (msg.action === "graduate") {
      const mode = p.tutorialMode ?? "quick";
      if (!tutorialReadyForPortal(p.tutorialStep, mode)) {
        this.send(ws, { t: "sys", text: "finish the remaining drills first — or press SKIP" });
        return;
      }
      void this.graduateTutorial(p, ws, false);
      return;
    }
    if (msg.action === "progress" && msg.kind) {
      // Optional n: instructor talk sends enough to clear multi-count lessons in one E.
      const n = Number.isFinite(msg.n) ? Math.max(1, Math.min(8, Math.floor(msg.n!))) : 1;
      this.tutorialEvent(p, msg.kind as TutorialKind, n);
    }
  }

  /** Full drill — spare bag items for forge practice; costs are waived server-side. */
  private ensureTutorialSupplies(p: PlayerState) {
    if (p.tutorialMode !== "full") return;
    while (p.inventory.length < 2) p.inventory.push(rollItem(1, 0.4));
    this.sendTo(p.id, { t: "inv", items: p.inventory });
  }

  // ── achievements + leaderboards (cross-zone counters, persisted to D1) ──────
  private statVal(p: PlayerState, stat: StatKey): number {
    return stat === "deepest" ? p.deepest : p.stats[stat] ?? 0;
  }

  /** Increment a lifetime counter (queued for D1) and check for any newly-crossed milestone. */
  // Accepts dynamic keys too (weekly leaderboards use "wk<week>"); achievements only
  // ever match the static StatKey set, so unknown keys simply have none to check.
  private bumpStat(p: PlayerState, stat: StatKey | (string & {}), n = 1) {
    if (n <= 0) return;
    p.stats[stat] = (p.stats[stat] ?? 0) + n;
    p.statDelta[stat] = (p.statDelta[stat] ?? 0) + n;
    this.checkAchv(p, stat as StatKey);
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

  // ── authored NPC bounties (one active at a time; in-memory, auto-rewarded) ──────
  private sendBounty(ws: WebSocket, p: PlayerState) {
    const b = p.bounty ? bountyById(p.bounty.id) : undefined;
    this.send(ws, {
      t: "bounty",
      active: b ? { id: b.id, name: b.name, desc: b.desc, objective: b.objective, count: b.count, progress: p.bounty!.progress } : null,
    });
  }
  private pushBounty(p: PlayerState) {
    for (const [sock, id] of this.sessions) if (id === p.id) this.sendBounty(sock, p);
  }

  /** Mark zone on the map; organic arrivals also unlock fast travel. */
  private async markDiscovered(ws: WebSocket, id: string, organic: boolean) {
    try {
      await this.env.DB.prepare("INSERT OR IGNORE INTO player_discovered (player, zone, at, organic) VALUES (?,?,?,?)")
        .bind(id, this.zoneName, Date.now(), organic ? 1 : 0)
        .run();
      if (organic) {
        await this.env.DB.prepare("UPDATE player_discovered SET organic = 1 WHERE player = ? AND zone = ?").bind(id, this.zoneName).run();
      }
      const { results } = await this.env.DB.prepare("SELECT zone, organic FROM player_discovered WHERE player = ?")
        .bind(id)
        .all<{ zone: string; organic: number }>();
      const zones = (results ?? []).map((r) => r.zone);
      const unlocked = (results ?? []).filter((r) => r.organic).map((r) => r.zone);
      this.send(ws, { t: "discovered", zones, unlocked });
    } catch {
      const fallback = organic ? [this.zoneName] : [];
      this.send(ws, { t: "discovered", zones: [this.zoneName], unlocked: fallback });
    }
  }

  /** Starter melee + resources for live-city players. */
  private ensureStarterKit(p: PlayerState) {
    if (this.inTutorial()) return;
    let changed = false;
    if (!p.equipped.weapon) {
      p.equipped.weapon = makeWeaponItem("arcblade", Math.max(1, p.level));
      changed = true;
    }
    if (p.inventory.length < 2) {
      while (p.inventory.length < 2) p.inventory.push(rollItem(Math.max(1, p.level), 0.35));
      changed = true;
    }
    if (p.cores < 5) {
      p.cores = Math.max(p.cores, 5);
      changed = true;
    }
    if (p.credits < 100) {
      p.credits = Math.max(p.credits, 100);
      changed = true;
    }
    if (changed) {
      p.dirty = true;
      this.recomputeStats(p);
    }
  }

  private onBounty(ws: WebSocket, msg: Extract<ClientMsg, { t: "bounty" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    if (msg.action === "accept") {
      const b = bountyById(msg.id);
      if (!b) return;
      // re-accepting the job you already hold is idempotent — it re-syncs the tracker
      // instead of dead-ending (a stale active job used to lock the slot forever)
      if (p.bounty?.id === b.id) {
        this.send(ws, { t: "sys", text: `already on it: ${b.name}` });
        this.pushBounty(p);
        return;
      }
      if (p.bounty) {
        this.send(ws, { t: "sys", text: "finish your current job first" });
        return;
      }
      p.bounty = { id: b.id, progress: 0 };
      this.send(ws, { t: "sys", text: `accepted: ${b.name}` });
      this.pushBounty(p);
    }
  }

  /** Advance the active NPC bounty on a matching event; auto-grant credits + rep on completion. */
  private bountyEvent(p: PlayerState, objective: BountyObjective, n = 1) {
    if (!p.bounty) return;
    const b = bountyById(p.bounty.id);
    if (!b || b.objective !== objective) return;
    p.bounty.progress += n;
    if (p.bounty.progress >= b.count) {
      p.credits += b.rewardCredits; // server-authoritative reward
      this.bumpStat(p, "credits", b.rewardCredits);
      this.bumpStat(p, "rep", b.rewardRep);
      p.dirty = true;
      this.sendTo(p.id, { t: "sys", text: `✔ BOUNTY — ${b.name} (+₵${b.rewardCredits} +${b.rewardRep} rep)` });
      p.bounty = null;
    }
    this.pushBounty(p);
  }

  /** TENEMENT lockbox — move an item between bag and personal stash. Server-authoritative:
   *  gated to home-kind building interiors (index%5===1, mirroring the client venue cycle),
   *  cap-checked both ways, persisted with inventory in one upsert (no split-brain on crash). */
  private async onStash(ws: WebSocket, msg: Extract<ClientMsg, { t: "stash" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    const sys = (t: string) => this.sendTo(p.id, { t: "sys", text: t });
    // the lockbox works in: a district TENEMENT, a hub RESIDENCE, or a home YOU OWN
    const bldg = parseBuildingInterior(this.zoneName);
    const isTenement = !!bldg && bldg.index % 5 === 1;
    const hubK = parseHubInterior(this.zoneName);
    const isHubHome = hubK !== null && ONLINE_CITY.buildings[hubK]?.kind === "home";
    let isOwnHome = false;
    if (parseEstateInterior(this.zoneName) !== null) {
      if (!this.estate) await this.loadEstate();
      isOwnHome = this.estate?.owner === p.id;
    }
    if (!isTenement && !isHubHome && !isOwnHome) return sys("find a TENEMENT lockbox, a hub RESIDENCE, or your own home to use your stash");
    if (msg.action === "deposit") {
      const i = p.inventory.findIndex((it) => it.id === msg.itemId);
      if (i < 0) return sys("that item isn't in your bag");
      if (p.stash.length >= STASH_CAP) return sys(`stash is full (${STASH_CAP})`);
      const [it] = p.inventory.splice(i, 1);
      p.stash.push(it);
      p.dirty = true;
      sys(`◈ stashed ${it.name} — safe from death`);
    } else if (msg.action === "withdraw") {
      const i = p.stash.findIndex((it) => it.id === msg.itemId);
      if (i < 0) return sys("that item isn't in your stash");
      if (p.inventory.length >= INVENTORY_CAP) return sys("bag is full");
      const [it] = p.stash.splice(i, 1);
      p.inventory.push(it);
      p.dirty = true;
      sys(`◈ took ${it.name} from the stash`);
    } else return;
    this.sendTo(p.id, { t: "inv", items: p.inventory });
    this.sendTo(p.id, { t: "stashv", items: p.stash });
  }

  // ── THE ESTATES — player-owned, furnishable homes (est{K}). Ownership + furniture live in
  //    D1 so any estate DO + a resale by another player share one source of truth. ────────
  private estate: { owner: string | null; ownerName: string | null; price: number; forSale: boolean; furniture: FurniturePiece[]; guests: GuestEntry[] } | null = null;

  private async loadEstate(): Promise<void> {
    if (parseEstateInterior(this.zoneName) === null) {
      this.estate = null;
      return;
    }
    const row = await this.env.DB.prepare("SELECT owner, owner_name, price, for_sale, furniture, guestbook FROM estates WHERE id = ?")
      .bind(this.zoneName)
      .first<{ owner: string | null; owner_name: string | null; price: number; for_sale: number; furniture: string; guestbook: string }>();
    const parse = (raw: string | undefined): unknown => {
      try {
        return JSON.parse(raw || "[]");
      } catch {
        return [];
      }
    };
    this.estate = row
      ? {
          owner: row.owner,
          ownerName: row.owner_name,
          price: row.price,
          forSale: !!row.for_sale,
          furniture: sanitizeFurniture(parse(row.furniture)),
          guests: sanitizeGuestbook(parse(row.guestbook)),
        }
      : { owner: null, ownerName: null, price: ESTATE_BASE_PRICE, forSale: true, furniture: [], guests: [] };
  }

  private estateMsg(p: PlayerState) {
    const e = this.estate!;
    return {
      t: "estate" as const,
      id: this.zoneName,
      owner: e.owner,
      ownerName: e.ownerName,
      mine: !!e.owner && e.owner === p.id,
      forSale: e.forSale,
      price: e.owner ? e.price : ESTATE_BASE_PRICE,
      furniture: e.furniture,
      guests: e.guests,
    };
  }

  private async sendEstate(ws: WebSocket, p: PlayerState): Promise<void> {
    if (!this.estate) await this.loadEstate();
    if (!this.estate) return;
    this.send(ws, this.estateMsg(p));
  }

  /** The whole street's ownership at a glance — lets the ESTATES overworld hang
   *  FOR SALE / owner plates over every door without visiting each home. */
  private async sendEstatesDir(ws: WebSocket): Promise<void> {
    const { results } = await this.env.DB.prepare("SELECT id, owner, owner_name, price, for_sale, furniture, guestbook FROM estates")
      .all<{ id: string; owner: string | null; owner_name: string | null; price: number; for_sale: number; furniture: string; guestbook: string }>();
    const byId = new Map(results.map((r) => [r.id, r]));
    const count = (raw: string | undefined): number => {
      try {
        const a = JSON.parse(raw || "[]");
        return Array.isArray(a) ? a.length : 0;
      } catch {
        return 0;
      }
    };
    const list = [];
    for (let i = 0; i < ESTATE_COUNT; i++) {
      const r = byId.get(`est${i}`);
      list.push({
        i,
        owner: r?.owner ?? null,
        name: r?.owner_name ?? null,
        forSale: r?.owner ? !!r.for_sale : true,
        price: r?.owner ? r.price : ESTATE_BASE_PRICE,
        furn: count(r?.furniture),
        guests: count(r?.guestbook),
      });
    }
    this.send(ws, { t: "estates_dir", list });
  }

  private broadcastEstate(): void {
    if (!this.estate) return;
    for (const p of this.players.values()) this.sendTo(p.id, this.estateMsg(p));
  }

  private async persistEstate(): Promise<void> {
    const e = this.estate;
    if (!e) return;
    await this.env.DB.prepare(
      "INSERT INTO estates (id, owner, owner_name, price, for_sale, furniture, guestbook, updated) VALUES (?,?,?,?,?,?,?,?) " +
        "ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, owner_name=excluded.owner_name, price=excluded.price, for_sale=excluded.for_sale, furniture=excluded.furniture, guestbook=excluded.guestbook, updated=excluded.updated",
    )
      .bind(this.zoneName, e.owner, e.ownerName, e.price, e.forSale ? 1 : 0, JSON.stringify(e.furniture), JSON.stringify(e.guests), Date.now())
      .run();
  }

  private async onEstate(ws: WebSocket, msg: Extract<ClientMsg, { t: "estate" }>): Promise<void> {
    const p = this.playerFor(ws);
    if (!p) return;
    if (parseEstateInterior(this.zoneName) === null) return;
    if (!this.estate) await this.loadEstate();
    const e = this.estate!;
    const sys = (t: string) => this.sendTo(p.id, { t: "sys", text: t });
    if (msg.action === "buy") {
      if (e.owner === p.id) return sys("you already own this home");
      if (e.owner && !e.forSale) return sys("this home isn't for sale");
      const price = e.owner ? e.price : ESTATE_BASE_PRICE;
      if (p.credits < price) return sys(`not enough credits — this home costs ₵${price}`);
      p.credits -= price;
      p.dirty = true;
      if (e.owner) {
        // resale: the proceeds go to the previous owner via the cross-zone mailbox
        await this.env.DB.prepare("INSERT INTO mailbox (player, credits, reason, created_at) VALUES (?,?,?,?)")
          .bind(e.owner, price, "estate sale", Date.now())
          .run();
      }
      e.owner = p.id;
      e.ownerName = p.name;
      e.forSale = false;
      await this.persistEstate();
      sys(`◈ home purchased for ₵${price} — press F to furnish it`);
      this.broadcastEstate();
    } else if (msg.action === "list") {
      if (e.owner !== p.id) return sys("only the owner can list this home");
      e.price = Math.max(100, Math.min(10_000_000, Math.round(msg.price ?? e.price)));
      e.forSale = true;
      await this.persistEstate();
      sys(`◈ listed for sale — ₵${e.price}`);
      this.broadcastEstate();
    } else if (msg.action === "unlist") {
      if (e.owner !== p.id) return sys("only the owner can unlist this home");
      e.forSale = false;
      await this.persistEstate();
      sys("◈ delisted — this home is no longer for sale");
      this.broadcastEstate();
    } else if (msg.action === "furnish") {
      if (e.owner !== p.id) return sys("only the owner can decorate this home");
      e.furniture = sanitizeFurniture(msg.furniture ?? []);
      await this.persistEstate();
      this.broadcastEstate();
    } else if (msg.action === "sign") {
      // visitors sign the book; the stamp is server-chosen so nothing player-written persists
      if (!e.owner) return sys("nobody lives here yet — nothing to sign");
      if (e.owner === p.id) return sys("it's your own guestbook, choom");
      const stamp = GUEST_STAMPS[Math.floor(Math.random() * GUEST_STAMPS.length)];
      e.guests = [{ n: p.name, at: Date.now(), s: stamp }, ...e.guests.filter((g) => g.n !== p.name)].slice(0, 24);
      await this.persistEstate();
      sys(`◈ signed — "${p.name} ${stamp}"`);
      this.broadcastEstate();
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
    if (this.inTutorial()) this.tutorialEvent(p, "equip");
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
    } else if (sku.cores) {
      p.cores += sku.cores;
      this.send(ws, { t: "sys", text: `bought ${sku.label} — +◈${sku.cores}` });
    }
    if (sku.creditsGrant) {
      p.credits += sku.creditsGrant;
      this.send(ws, { t: "sys", text: `+₵${sku.creditsGrant} supply credits` });
    }
    p.dirty = true;
  }

  private onInvMove(ws: WebSocket, msg: Extract<ClientMsg, { t: "inv_move" }>) {
    const p = this.playerFor(ws);
    if (!p) return;
    const from = msg.from;
    const to = Math.max(0, Math.min(msg.to, INVENTORY_CAP - 1));
    if (from < 0 || from >= p.inventory.length) return;
    const [item] = p.inventory.splice(from, 1);
    const idx = Math.min(to, p.inventory.length);
    p.inventory.splice(idx, 0, item);
    p.dirty = true;
    this.send(ws, { t: "inv", items: p.inventory });
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
    const drill = this.inTutorial();
    const afford = (c: Cost) => drill || (p.credits >= c.credits && p.cores >= c.cores);
    const pay = (c: Cost) => {
      if (drill) return;
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
      p.inventory.splice(i, 1);
      if (drill) fail(`✂ salvaged ${it.name} (drill — no payout)`);
      else {
        const y = salvageYield(it);
        p.credits += y.credits;
        p.cores += y.cores;
        fail(`✂ salvaged ${it.name} → +${y.cores}◈ +₵${y.credits}`);
      }
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
    if (drill) this.tutorialEvent(p, "craft");
    this.send(ws, { t: "inv", items: p.inventory });
    this.sendLoadout(ws, p);
  }

  private rollPlayerCritDamage(p: PlayerState, base: number): number {
    let dmg = base;
    const critChance = Math.min(0.05 + p.level * 0.012, 0.3) + (p.mods.critPct || 0);
    if (Math.random() < critChance) dmg = Math.round(dmg * 1.85);
    return dmg;
  }

  private pushPlayerShot(p: PlayerState, aim: number, speed: number, ttlMs: number, dmg: number) {
    this.shots.push({
      id: this.nextShotId++,
      x: p.x,
      y: p.y,
      vx: Math.cos(aim) * speed,
      vy: Math.sin(aim) * speed,
      dieTick: this.tick + ticks(ttlMs),
      team: 0,
      owner: p.id,
      dmg,
    });
  }

  /** Dash — a server-sanctioned speed burst with i-frames. The ONLY way to move faster
   *  than the walk cap, so the anti-cheat speed validation stays honest. */
  private onDash(ws: WebSocket, msg: Extract<ClientMsg, { t: "dash" }>) {
    const p = this.playerFor(ws);
    if (!p || p.dead) return;
    if (this.tick < p.dashCdUntilTick) return; // still recharging — silently dropped
    let dx = Number(msg.dx);
    let dy = Number(msg.dy);
    const len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len < 1e-4) {
      dx = Math.cos(p.aim);
      dy = Math.sin(p.aim);
    } else {
      dx /= len;
      dy /= len;
    }
    p.dashDx = dx;
    p.dashDy = dy;
    p.dashUntilTick = this.tick + ticks(PLAYER.dashDurationMs);
    p.dashCdUntilTick = this.tick + ticks(PLAYER.dashCooldownMs);
    p.iframeUntilTick = this.tick + ticks(PLAYER.dashIframeMs);
    // kit-mod: DASH TRAIL — contagion pods pop along the blink line
    if ((p.mods.dashTrailPct || 0) > 0) {
      const dmg = Math.round(PLAYER_DMG * (0.6 + 2 * p.mods.dashTrailPct));
      for (const d of [42, 84, 126]) {
        this.hazards.push({
          id: this.nextHazardId++,
          x: p.x + dx * d,
          y: p.y + dy * d,
          r: 46,
          castTick: this.tick,
          detonateTick: this.tick + ticks(420),
          dmg,
          vsEnemies: true,
          owner: p.id,
        });
      }
    }
    if (this.inTutorial()) this.tutorialEvent(p, "kit");
  }

  /** The class signature (Q) — resolved entirely server-side so damage, stuns, and
   *  cooldowns can't be spoofed. Kill payouts ride the same pipeline as gunfire. */
  private onAbility(ws: WebSocket, msg: Extract<ClientMsg, { t: "ability" }>) {
    const p = this.playerFor(ws);
    if (!p || p.dead) return;
    if (this.tick < p.abilityCdUntilTick) return;
    const aim = Number.isFinite(msg.aim) ? msg.aim : p.aim;
    p.aim = aim;
    if (this.inTutorial()) this.tutorialEvent(p, "kit");
    // DASH-STRIKE moves on the PRIMARY cast only (an echo re-blinking you would be chaos)
    if (p.classId === "k-guerilla") this.onDash(ws, { t: "dash", seq: msg.seq, dx: Math.cos(aim), dy: Math.sin(aim) });
    this.resolveSignature(p, aim, 1);
    switch (p.classId) {
      case "k-guerilla":
        p.abilityCdUntilTick = this.tick + ticks(6000);
        break;
      case "wintermute":
        p.abilityCdUntilTick = this.tick + ticks(8000);
        break;
      case "swarm":
        p.abilityCdUntilTick = this.tick + ticks(6500);
        break;
      default:
        p.abilityCdUntilTick = this.tick + ticks(7000);
    }
    // kit-mod: Q ECHO — the signature repeats moments later at a damage fraction
    if ((p.mods.abilityEchoPct || 0) > 0) {
      this.echoes.push({ tick: this.tick + ticks(340), pid: p.id, aim, scale: Math.min(0.8, 0.35 + p.mods.abilityEchoPct) });
    }
  }

  /** Pending Q echoes (kit-mod) — resolved by the tick loop at their due tick. */
  private echoes: Array<{ tick: number; pid: string; aim: number; scale: number }> = [];

  /** The signature's EFFECT, scale-aware so echoes reuse the exact same resolution. */
  private resolveSignature(p: PlayerState, aim: number, scale: number) {
    const lvl = (1 + (p.mods.dmgPct || 0)) * scale;
    switch (p.classId) {
      case "k-guerilla": {
        // DASH-STRIKE — everything along the blade line takes damage
        const reach = PLAYER.dashSpeed * (PLAYER.dashDurationMs / 1000);
        const ex = p.x + Math.cos(aim) * reach;
        const ey = p.y + Math.sin(aim) * reach;
        const dmg = this.rollPlayerCritDamage(p, Math.round(34 * lvl));
        for (const e of this.enemies.values()) {
          if (e.hp <= 0) continue;
          if (segPointDist2(e.x, e.y, p.x, p.y, ex, ey) <= 42 * 42) this.applyPlayerHitToEnemy(e, p, dmg);
        }
        break;
      }
      case "wintermute": {
        // HACK CONE — freeze the security floor mid-thought (stun) + chip damage.
        // Generous arc: strafing wasps must not slip a point-blank cone.
        const halfArc = 0.85;
        const dmg = Math.round(18 * lvl);
        for (const e of this.enemies.values()) {
          if (e.hp <= 0) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          if (Math.hypot(dx, dy) > 270) continue;
          let diff = Math.atan2(dy, dx) - aim;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          if (Math.abs(diff) > halfArc) continue;
          e.stunUntilTick = this.tick + this.statusTicks(e, Math.round((e.boss ? 900 : 2000) * scale));
          this.applyPlayerHitToEnemy(e, p, dmg);
        }
        break;
      }
      case "swarm": {
        // SWARM TIDE — a radial burst of bolts that buzz outward (shot pipeline = full payouts)
        const dmg = this.rollPlayerCritDamage(p, Math.round(13 * lvl));
        for (let i = 0; i < 8; i++) {
          this.pushPlayerShot(p, aim + (i / 8) * Math.PI * 2, PROJ_SPEED * 0.85, PROJ_TTL_MS, dmg);
        }
        break;
      }
      default: {
        // METROPHAGE — INFECTION POD: lob contagion at the aim point; it bursts in an AoE
        const px = p.x + Math.cos(aim) * 170;
        const py = p.y + Math.sin(aim) * 170;
        const dmg = this.rollPlayerCritDamage(p, Math.round(42 * lvl));
        for (const e of this.enemies.values()) {
          if (e.hp <= 0) continue;
          if (dist2(e.x, e.y, px, py) <= 105 * 105) this.applyPlayerHitToEnemy(e, p, dmg);
        }
      }
    }
  }

  /** The class secondary (E) — completes the kit each class card advertises. */
  private onAbility2(ws: WebSocket, msg: Extract<ClientMsg, { t: "ability2" }>) {
    const p = this.playerFor(ws);
    if (!p || p.dead) return;
    if (this.tick < p.ability2CdUntilTick) return;
    const aim = Number.isFinite(msg.aim) ? msg.aim : p.aim;
    p.aim = aim;
    if (this.inTutorial()) this.tutorialEvent(p, "kit");
    const lvl = 1 + (p.mods.dmgPct || 0);
    switch (p.classId) {
      case "k-guerilla": {
        // AIRSTRIKE — call a telegraphed strike on the aim point; enemies caught in
        // the ring when it lands eat heavy damage (the ONLY player-owned hazard)
        const px = p.x + Math.cos(aim) * 230;
        const py = p.y + Math.sin(aim) * 230;
        this.hazards.push({
          id: this.nextHazardId++,
          x: px,
          y: py,
          r: 95,
          castTick: this.tick,
          detonateTick: this.tick + ticks(900),
          dmg: Math.round(55 * lvl),
          vsEnemies: true,
          owner: p.id,
        });
        p.ability2CdUntilTick = this.tick + ticks(10000);
        break;
      }
      case "wintermute": {
        // DEPLOY DRONES — a sentry escort auto-engages the nearest unit for 6s
        p.droneUntilTick = this.tick + ticks(6000);
        p.droneNextTick = this.tick;
        p.droneKind = 0;
        p.ability2CdUntilTick = this.tick + ticks(12000);
        break;
      }
      case "swarm": {
        // MINION PACK — a faster, shorter-fanged swarm escort for 8s
        p.droneUntilTick = this.tick + ticks(8000);
        p.droneNextTick = this.tick;
        p.droneKind = 1;
        p.ability2CdUntilTick = this.tick + ticks(12000);
        break;
      }
      default: {
        // METROPHAGE — CONTAGION BLOOM: a nova around the runner; every unit caught
        // is damaged and INFECTED (half speed while the contagion chews its servos)
        const dmg = this.rollPlayerCritDamage(p, Math.round(30 * lvl));
        for (const e of this.enemies.values()) {
          if (e.hp <= 0) continue;
          if (dist2(e.x, e.y, p.x, p.y) > 145 * 145) continue;
          e.slowUntilTick = this.tick + this.statusTicks(e, e.boss ? 1200 : 3000);
          this.applyPlayerHitToEnemy(e, p, dmg);
        }
        p.ability2CdUntilTick = this.tick + ticks(9000);
        break;
      }
    }
  }

  /** The class ultimate (R) — gated on HEAT, not a cooldown: you EARN it in the fight
   *  (HEAT.ultThreshold to cast, spends HEAT.ultHeatCost). Server-resolved end to end. */
  private onUlt(ws: WebSocket, msg: Extract<ClientMsg, { t: "ult" }>) {
    const p = this.playerFor(ws);
    if (!p || p.dead) return;
    // kit-mod: ULT HEAT — singular chips lower the arm threshold (floor 25)
    const ultGate = Math.max(25, HEAT.ultThreshold - Math.round(p.mods.ultHeatDiscount || 0));
    if (p.heat < ultGate) return; // not hot enough — silently dropped
    p.heat = Math.max(0, p.heat - HEAT.ultHeatCost);
    const aim = Number.isFinite(msg.aim) ? msg.aim : p.aim;
    p.aim = aim;
    const lvl = 1 + (p.mods.dmgPct || 0);
    switch (p.classId) {
      case "k-guerilla": {
        // BARRAGE — three strikes walk up the aim line, each on its own fuse
        for (let i = 0; i < 3; i++) {
          const r = 140 + i * 120;
          this.hazards.push({
            id: this.nextHazardId++,
            x: p.x + Math.cos(aim) * r,
            y: p.y + Math.sin(aim) * r,
            r: 90,
            castTick: this.tick,
            detonateTick: this.tick + ticks(700 + i * 180),
            dmg: Math.round(50 * lvl),
            vsEnemies: true,
            owner: p.id,
          });
        }
        break;
      }
      case "wintermute": {
        // SYSTEM CRASH — everything thinking within 420px stops thinking
        for (const e of this.enemies.values()) {
          if (e.hp <= 0) continue;
          if (dist2(e.x, e.y, p.x, p.y) > 420 * 420) continue;
          e.stunUntilTick = this.tick + this.statusTicks(e, e.boss ? 1200 : 2600);
          this.applyPlayerHitToEnemy(e, p, Math.round(15 * lvl));
        }
        break;
      }
      case "swarm": {
        // LOCUST STORM — a double ring of bolts + the pack rides out with you
        const dmg = this.rollPlayerCritDamage(p, Math.round(12 * lvl));
        for (let i = 0; i < 16; i++) {
          const a = aim + (i / 16) * Math.PI * 2 + (i % 2 ? 0.19 : 0);
          this.pushPlayerShot(p, a, PROJ_SPEED * (i % 2 ? 0.75 : 0.95), PROJ_TTL_MS, dmg);
        }
        p.droneUntilTick = this.tick + ticks(4000);
        p.droneNextTick = this.tick;
        p.droneKind = 1;
        break;
      }
      default: {
        // METROPHAGE — PANDEMIC: the contagion detonates outward; everything caught
        // is damaged and infected (slowed). The Wake, weaponized.
        const dmg = this.rollPlayerCritDamage(p, Math.round(60 * lvl));
        for (const e of this.enemies.values()) {
          if (e.hp <= 0) continue;
          if (dist2(e.x, e.y, p.x, p.y) > 260 * 260) continue;
          e.slowUntilTick = this.tick + this.statusTicks(e, e.boss ? 1500 : 3500);
          this.applyPlayerHitToEnemy(e, p, dmg);
        }
        break;
      }
    }
  }

  private onFire(ws: WebSocket, msg: Extract<ClientMsg, { t: "fire" }>) {
    const p = this.playerFor(ws);
    if (!p || p.dead) return;
    if (Number.isFinite(msg.aim)) p.aim = msg.aim;
    const weapon = p.equipped.weapon;
    const wdef = weapon?.weaponId ? getWeapon(weapon.weaponId) : undefined;
    const prim = wdef?.primary;
    const fireMs = prim?.fireRateMs ?? PLAYER_FIRE_MS;
    if ((this.tick - p.lastFireTick) * NET_TICK_MS < fireMs) return;
    p.lastFireTick = this.tick;
    if (this.inTutorial()) this.tutorialEvent(p, "fire");
    if (!prim) {
      const dmg = this.rollPlayerCritDamage(p, Math.round(PLAYER_DMG * (1 + (p.mods.dmgPct || 0))));
      this.pushPlayerShot(p, p.aim, PROJ_SPEED, PROJ_TTL_MS, dmg);
      return;
    }
    const baseDmg = weaponHitDamage(weapon, prim, p.mods);
    if (prim.kind === "melee") {
      const dmg = this.rollPlayerCritDamage(p, baseDmg);
      const halfArc = (prim.arcDeg / 2) * (Math.PI / 180);
      for (const e of this.enemies.values()) {
        if (e.hp <= 0) continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (Math.hypot(dx, dy) > prim.range) continue;
        let diff = Math.atan2(dy, dx) - p.aim;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        if (Math.abs(diff) <= halfArc) this.applyPlayerHitToEnemy(e, p, dmg);
      }
      return;
    }
    if (prim.kind === "beam") {
      const dmg = this.rollPlayerCritDamage(p, baseDmg);
      const ex = p.x + Math.cos(p.aim) * prim.range;
      const ey = p.y + Math.sin(p.aim) * prim.range;
      const hw = prim.halfWidth + 10;
      for (const e of this.enemies.values()) {
        if (e.hp <= 0) continue;
        if (segPointDist2(e.x, e.y, p.x, p.y, ex, ey) <= hw * hw) this.applyPlayerHitToEnemy(e, p, dmg);
      }
      return;
    }
    const dmg = this.rollPlayerCritDamage(p, baseDmg);
    if (prim.kind === "spread") {
      const half = (prim.spreadDeg / 2) * (Math.PI / 180);
      for (let i = 0; i < prim.pellets; i++) {
        const t = prim.pellets === 1 ? 0.5 : i / (prim.pellets - 1);
        const aim = p.aim - half + t * 2 * half;
        this.pushPlayerShot(p, aim, prim.speed, prim.lifetimeMs, dmg);
      }
      return;
    }
    if (prim.kind === "burst") {
      for (let i = 0; i < prim.burstCount; i++) {
        const jitter = (i - (prim.burstCount - 1) / 2) * 0.02;
        this.pushPlayerShot(p, p.aim + jitter, prim.speed, prim.lifetimeMs, dmg);
      }
      return;
    }
    // rapid + fallback ranged
    const jitter = prim.kind === "rapid" ? ((Math.random() - 0.5) * prim.jitterDeg * Math.PI) / 180 : 0;
    this.pushPlayerShot(p, p.aim + jitter, prim.speed, prim.lifetimeMs, dmg);
  }

  /** Shared kill rewards for melee and projectile hits. */
  /** HEAT gain — clamped and time-stamped so the delayed decay knows when you cooled. */
  private addHeat(p: PlayerState, amount: number) {
    p.heat = Math.min(HEAT.max, p.heat + amount);
    p.heatGainTick = this.tick;
  }

  private applyPlayerHitToEnemy(e: Enemy, killer: PlayerState, dmg: number) {
    this.addHeat(killer, dmg * HEAT.perDamage);
    const lifesteal = Math.min(killer.level * 0.004, 0.08) + (killer.mods.lifestealPct || 0);
    if (lifesteal > 0 && !killer.dead && killer.hp > 0) {
      killer.hp = Math.min(killer.maxHp, killer.hp + dmg * lifesteal);
    }
    if (e.boss && !e.engagedTick) {
      e.engagedTick = this.tick;
      let live = 0;
      for (const pl of this.players.values()) if (!pl.dead) live++;
      e.baseMaxHp = e.baseMaxHp ?? e.maxHp;
      e.maxHp = Math.round(e.baseMaxHp * raidHpScale(RAID_SCRIPT, live));
      e.hp = e.maxHp;
    }
    e.hp -= dmg;
    if (e.hp > 0) return;
    this.onEnemyKilled(e, killer);
  }

  /** Kill resolution shared by melee/direct hits AND projectile shots — respawn timer,
   *  rewards (daily-condition creditMult + HVT bounty/demotion), loot, pickups, boss
   *  cleanup. The projectile loop used to duplicate this inline WITHOUT the daily/HVT
   *  multipliers, so ranged kills underpaid and the day's HVT hunt never completed
   *  unless the killing blow was melee. killer is optional: a shot can outlive its
   *  owner's socket. */
  private onEnemyKilled(e: Enemy, killer: PlayerState | undefined) {
    const isBoss = !!e.boss;
    const arch = ENEMY_ARCHES[e.kind] ?? ENEMY_ARCHES[0];
    // A boss reforms slowly (so others can find + fight it); a grunt fast.
    e.respawnTick = this.tick + ticks(isBoss ? BOSS_RESPAWN_MS : 4000);
    if (this.inTutorial()) {
      if (!killer) return;
      this.tutorialEvent(killer, "kill");
      const pid = this.nextPickupId++;
      this.pickups.set(pid, { id: pid, x: e.x, y: e.y, kind: PICKUP_CORE, dieTick: this.tick + ticks(PICKUP_TTL_MS), bornTick: this.tick });
      return;
    }
    const wasHvt = !!e.hvt;
    if (killer) {
      const mult = isBoss ? 12 : wasHvt ? HVT_BOUNTY_MULT : (e.elite?.xpMult ?? 1);
      const dmod = /^d\d+$/.test(this.zoneName) ? dailyDistrictMod(this.districtIndex) : null;
      const gained = Math.round(CREDITS_PER_KILL * mult * (dmod?.creditMult ?? 1) * (1 + (killer.guildBonus || 0)));
      killer.credits += gained;
      killer.xp += Math.round(XP_PER_KILL * mult);
      killer.level = levelForXp(killer.xp);
      killer.dirty = true;
      this.bumpMeta("f" + killer.faction, isBoss ? 10 : 1);
      this.campaignEvent(killer, "kill");
      this.sharedKillCredit(killer, e, isBoss);
      this.addHeat(killer, HEAT.perKill);
      this.bumpStat(killer, "kills", 1);
      if (isBoss) this.bumpStat(killer, "bosses", 1);
      this.bumpStat(killer, "credits", gained);
      this.contractEvent(killer, "kill", 1);
      this.bountyEvent(killer, "kill", 1);
      if (isBoss) {
        this.contractEvent(killer, "boss", 1);
        this.bountyEvent(killer, "boss", 1);
      }
      this.eliteDeath(e);
      this.killNova(killer, e);
      if (wasHvt) {
        // the day's bounty is claimed — announce, remember the day, and demote the unit so
        // its respawn is an ordinary garrison trooper (no farmable 25× loop)
        this.broadcastSys(`◈ ${killer.name} collected the bounty on ${e.name} — ₵${gained}`);
        this.bountyEvent(killer, "hvt", 1); // GHOST's kill-sheet job pays on top
        void this.state.storage.put("hvtKilledDay", dayIndex());
        e.hvt = false;
        e.name = undefined;
        e.tint = undefined;
        e.maxHp = Math.max(1, Math.round(e.maxHp / HVT_HP_MULT));
        // its backup leaves with it — adds never respawn as permanent garrison
        for (const [aid, ae] of this.enemies) if (ae.add && !ae.boss) this.enemies.delete(aid);
      }
      if (isBoss || e.elite || wasHvt || Math.random() < arch.loot.chance) {
        killer.inventory.push(rollItem(killer.level, isBoss ? 2.5 : wasHvt ? 2.2 : arch.loot.boost + (e.elite?.lootBonus ?? 0)));
        if (killer.inventory.length > INVENTORY_CAP) killer.inventory.shift();
        this.sendTo(killer.id, { t: "inv", items: killer.inventory });
      }
      if (isBoss) this.broadcast({ t: "sys", text: `▲ ${killer.name} slew ${e.name} — it will reform soon` });
    } else {
      this.eliteDeath(e);
    }
    if (isBoss) {
      for (const [aid, ae] of this.enemies) if (ae.add) this.enemies.delete(aid);
      this.hazards = [];
    }
    if (e.elite || Math.random() < LOOT_DROP_CHANCE) {
      const kind = Math.random() < 0.42 ? PICKUP_CORE : PICKUP_CREDIT;
      const pid = this.nextPickupId++;
      this.pickups.set(pid, { id: pid, x: e.x, y: e.y, kind, dieTick: this.tick + ticks(PICKUP_TTL_MS), bornTick: this.tick });
    }
    if (killer && Math.random() < 0.08) {
      killer.cores += 1;
      killer.dirty = true;
    }
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
    };
  }

  private step() {
    const dt = NET_TICK_MS / 1000;

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
      if (this.tick < p.dashUntilTick) {
        // mid-dash: the burst vector overrides walk intent at dash speed
        stepMove(p, { mx: p.dashDx, my: p.dashDy }, this.grid, NET_TICK_MS, PLAYER.dashSpeed);
        p.dirty = true;
      } else if (p.mx !== 0 || p.my !== 0) {
        stepMove(p, { mx: p.mx, my: p.my }, this.grid, NET_TICK_MS);
        p.dirty = true;
      }
      // Tutorial move + portal checks run every tick (not only while intent is held) so a
      // dash-only hop or a pause after walking past the threshold still advances the drill.
      if (this.inTutorial() && !p.tutorialDone) {
        if (dist2(p.x, p.y, p.tutorialAnchorX, p.tutorialAnchorY) > 96 * 96) {
          this.tutorialEvent(p, "move");
        }
        if (
          tutorialReadyForPortal(p.tutorialStep, p.tutorialMode ?? "quick") &&
          dist2(p.x, p.y, TUTORIAL_PORTAL.x, TUTORIAL_PORTAL.y) <= TUTORIAL_PORTAL_RADIUS * TUTORIAL_PORTAL_RADIUS
        ) {
          void this.graduateTutorial(p, this.socketForPlayer(p.id), false);
        }
      }
      // HEAT decay — the meter bleeds once you've been cold past the grace window
      if (p.heat > 0 && (this.tick - p.heatGainTick) * NET_TICK_MS > HEAT.decayDelayMs) {
        p.heat = Math.max(0, p.heat - HEAT.decayPerSec * (NET_TICK_MS / 1000));
      }
      // timed companion (WINTERMUTE drones / SWARM pack): auto-engage the nearest
      // unit — shots ride the normal pipeline, so payouts and crits stay honest
      if (!p.dead && this.tick < p.droneUntilTick && this.tick >= p.droneNextTick) {
        const range = p.droneKind === 0 ? 320 : 220;
        const near = this.nearestEnemyTo(p.x, p.y, range);
        if (near) {
          const jitter = (Math.random() - 0.5) * 0.16;
          const aim = Math.atan2(near.y - p.y, near.x - p.x) + jitter;
          const dmg = p.droneKind === 0 ? 12 : 8;
          this.pushPlayerShot(p, aim, PROJ_SPEED * 0.9, PROJ_TTL_MS, Math.round(dmg * (1 + (p.mods.dmgPct || 0))));
        }
        p.droneNextTick = this.tick + ticks(p.droneKind === 0 ? 700 : 420);
      }
      this.tickPvpArena(p);
    }

    // 2) enemies — chase nearest player, fire in range
    for (const e of this.enemies.values()) {
      const arch = ENEMY_ARCHES[e.kind] ?? ENEMY_ARCHES[0];
      if (e.boss) {
        this.updateBoss(e, arch);
        continue;
      }
      if (e.hp <= 0) {
        if (this.tick >= e.respawnTick) {
          e.x = e.ox;
          e.y = e.oy;
          e.hp = e.maxHp; // bosses reform at full boss HP; regulars at arch HP (maxHp === arch.hp)
        }
        continue;
      }
      // WINTERMUTE's hack cone freezes a unit mid-thought — no move, no fire
      if (e.stunUntilTick && this.tick < e.stunUntilTick) continue;
      // BLACKOUT blinds the Human Security System — aggro radius collapses
      const aggro = this.eventActive("blackout") ? ENEMY_AGGRO * 0.5 : ENEMY_AGGRO;
      const target = this.nearestLivePlayer(e.x, e.y, aggro);
      if (!target) {
        // no prey: drift back to the assigned post. Without this leash, chases and
        // orbit-strafes scatter the garrison across the district until whole zones
        // read empty — units must HOLD their ground when the fight moves on.
        const hx = e.ox - e.x;
        const hy = e.oy - e.y;
        const hd = Math.hypot(hx, hy);
        if (hd > 48) stepMove(e, { mx: hx / hd, my: hy / hd }, this.grid, NET_TICK_MS, arch.speed * 0.55);
        continue;
      }
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let eSpeed = arch.speed;
      const eFireMs = arch.fireMs;
      // Archetype movement personalities — the security floor reads as different MINDS,
      // not one AI in seven skins. (kinds: 1 wasp, 2 lancer, 3 hound, 5 sniper)
      let mvx = dx / d;
      let mvy = dy / d;
      if (e.kind === 1) {
        // WASP — orbits its prey: heavy strafe blended with a light approach
        const s = Math.sin(this.tick / 14 + e.id) >= 0 ? 1 : -1;
        mvx = mvx * 0.45 + (-dy / d) * 0.9 * s;
        mvy = mvy * 0.45 + (dx / d) * 0.9 * s;
      } else if (e.kind === 2 && d < arch.fireRange * 0.6) {
        // LANCER — a duellist: backs off to hold its preferred range
        mvx = -mvx;
        mvy = -mvy;
      } else if (e.kind === 3 && d < 300) {
        // HOUND — lunges the moment it smells blood
        eSpeed = arch.speed * 1.7;
      } else if (e.kind === 5 && (this.tick - e.lastFireTick) * NET_TICK_MS < 900) {
        // SNIPER — relocates right after every shot (never in the same window twice)
        const s = e.id % 2 === 0 ? 1 : -1;
        mvx = (-dy / d) * s;
        mvy = (dx / d) * s;
      }
      // CONTAGION BLOOM infection — chewed servos run at half speed
      if (e.elite) eSpeed *= e.elite.speedMult; // SWIFT runs hot, ARMORED lumbers
      if (e.speedMult) eSpeed *= e.speedMult; // today's district condition (GHOST GRID etc.)
      if (this.provingVault) eSpeed *= WorldDO.weeklyAffix().speedMult; // OVERCLOCKED weeks
      if (e.slowUntilTick && this.tick < e.slowUntilTick) eSpeed *= 0.5;
      // HVT bounty protocol — it FIGHTS, it doesn't just soak: a hard sideways burst
      // every ~2.6s breaks your aim, and at half HP it calls two patrol reinforcements.
      if (e.hvt) {
        if ((this.tick - (e.hvtRepositionTick ?? 0)) * NET_TICK_MS >= 2600) {
          e.hvtRepositionTick = this.tick;
          const s = (e.id + Math.floor(this.tick / 100)) % 2 === 0 ? 1 : -1;
          stepMove(e, { mx: (-dy / d) * s, my: (dx / d) * s }, this.grid, NET_TICK_MS * 6, eSpeed * 2.4);
        }
        if (!e.hvtCalled && e.hp < e.maxHp * 0.5) {
          e.hvtCalled = true;
          for (const off of [-72, 72]) {
            const aid = this.nextEnemyId++;
            const ax = e.x + off;
            const ay = e.y + (off > 0 ? 40 : -40);
            this.enemies.set(aid, {
              id: aid,
              x: ax,
              y: ay,
              ox: ax,
              oy: ay,
              hp: ENEMY_ARCHES[0].hp,
              maxHp: ENEMY_ARCHES[0].hp,
              respawnTick: 0,
              lastFireTick: 0,
              kind: 0,
              add: true, // despawns with its caller's zone cleanup, never respawns
            });
          }
          this.broadcastSys(`◈ ${e.name} called for backup — reinforcements inbound`);
        }
      }
      stepMove(e, { mx: mvx, my: mvy }, this.grid, NET_TICK_MS, eSpeed);
      if (d <= arch.fireRange && (this.tick - e.lastFireTick) * NET_TICK_MS >= eFireMs) {
        e.lastFireTick = this.tick;
        const aim = Math.atan2(target.y - e.y, target.x - e.x);
        const projSpeed = arch.projSpeed * (this.provingVault ? WorldDO.weeklyAffix().shotSpeedMult : 1);
        const dmg = e.boss ? Math.round(arch.dmg * BOSS_DMG_MULT) : arch.dmg;
        const fire = (a: number, dmgOverride?: number) =>
          this.shots.push({
            id: this.nextShotId++,
            x: e.x,
            y: e.y,
            vx: Math.cos(a) * projSpeed,
            vy: Math.sin(a) * projSpeed,
            dieTick: this.tick + ticks(ENEMY_PROJ_TTL_MS),
            team: 1,
            owner: String(e.id),
            dmg: dmgOverride ?? dmg,
          });
        // Archetype FIRE patterns — attacks you can read and answer, not just stat spam.
        if (!e.boss && (e.hvt || e.kind === 5)) {
          // SNIPER / HVT — every other volley paints a targeting solution at the runner's
          // feet (existing hazard telegraph pipeline): keep moving or eat it.
          e.altFire = !e.altFire;
          if (e.altFire) {
            this.hazards.push({
              id: this.nextHazardId++,
              x: target.x,
              y: target.y,
              r: 58,
              castTick: this.tick,
              detonateTick: this.tick + ticks(760),
              dmg: Math.round(dmg * 1.35),
            });
          } else fire(aim);
        } else if (!e.boss && e.kind === 4) {
          // ENFORCER — a 3-shot fan at half damage per pellet: eating the FULL fan
          // (1.5×) punishes standing still, strafing through the gaps rewards movement
          const pellet = Math.max(1, Math.round(dmg * 0.5));
          fire(aim - 0.24, pellet);
          fire(aim, pellet);
          fire(aim + 0.24, pellet);
        } else fire(aim);
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
            // raid: the first hit on a boss arms the fight — lock its HP to the raid size
            // (and start the enrage clock). More players present → a bigger HP pool.
            if (e.boss && !e.engagedTick) {
              e.engagedTick = this.tick;
              let live = 0;
              for (const pl of this.players.values()) if (!pl.dead) live++;
              e.baseMaxHp = e.baseMaxHp ?? e.maxHp;
              e.maxHp = Math.round(e.baseMaxHp * raidHpScale(RAID_SCRIPT, live));
              e.hp = e.maxHp; // refill to the scaled pool (the fight has only just begun)
            }
            e.hp -= dmg;
            if (owner) this.addHeat(owner, dmg * HEAT.perDamage);
            consumed = true;
            if (e.hp <= 0) this.onEnemyKilled(e, owner);
            break;
          }
        }
        // PvP: a player shot can also hit OTHER players — but only inside a PvP arena
        // (server-authoritative; the lone place player-vs-player damage is applied).
        if (!consumed && this.resolvePvpHit(s, ax, ay)) consumed = true;
      } else {
        for (const p of this.players.values()) {
          if (p.dead || this.tick < p.iframeUntilTick) continue; // dash grace — untouchable
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

    // 3a½) dynamic world events — district phenomena on a telegraphed cycle
    this.stepWorldEvent();

    // 3a¾) Q echoes (kit-mod) — re-run the signature at its due tick, reduced scale
    if (this.echoes.length) {
      const due = this.echoes.filter((q) => this.tick >= q.tick);
      if (due.length) {
        this.echoes = this.echoes.filter((q) => this.tick < q.tick);
        for (const q of due) {
          const p = this.players.get(q.pid);
          if (p && !p.dead) this.resolveSignature(p, q.aim, q.scale);
        }
      }
    }

    // 3b) boss hazards — telegraphed AoE detonates on its tick, hitting players still inside
    if (this.hazards.length) {
      const liveHz: Hazard[] = [];
      for (const hz of this.hazards) {
        if (this.tick >= hz.detonateTick) {
          const hr2 = hz.r * hz.r;
          if (hz.vsEnemies) {
            // player-owned strike — hits the security floor, pays out to the caller
            const owner = hz.owner ? this.players.get(hz.owner) : undefined;
            for (const e of this.enemies.values()) {
              if (e.hp <= 0) continue;
              if (dist2(e.x, e.y, hz.x, hz.y) <= hr2 && owner) this.applyPlayerHitToEnemy(e, owner, hz.dmg);
            }
          } else {
            for (const p of this.players.values()) {
              if (p.dead || this.tick < p.pvpSafeUntil || this.tick < p.iframeUntilTick) continue;
              if (dist2(p.x, p.y, hz.x, hz.y) <= hr2) {
                p.hp -= hz.dmg;
                if (p.hp <= 0) {
                  p.hp = 0;
                  p.dead = true;
                  p.respawnTick = this.tick + ticks(RESPAWN_MS);
                  p.dirty = true;
                }
              }
            }
          }
        } else liveHz.push(hz);
      }
      this.hazards = liveHz;
    }

    // 4) pickups — collected by walkover, expire on TTL (server decides the grant).
    // A short grace after spawn lets the drop VISIBLY pop before it can be eaten —
    // melee kills otherwise consume loot the same tick it appears (nobody ever saw it).
    const PR2 = PICKUP_RADIUS * PICKUP_RADIUS;
    const PICKUP_GRACE = ticks(350);
    for (const [pid, pu] of this.pickups) {
      if (this.tick >= pu.dieTick) {
        this.pickups.delete(pid);
        continue;
      }
      if (this.tick - pu.bornTick < PICKUP_GRACE) continue;
      for (const p of this.players.values()) {
        if (p.dead) continue;
        if (dist2(p.x, p.y, pu.x, pu.y) <= PR2) {
          if (this.inTutorial()) {
            this.tutorialEvent(p, "pickup");
          } else if (pu.kind === PICKUP_CORE) {
            p.cores += 1;
            p.xp += 8;
            p.level = levelForXp(p.xp);
            this.bountyEvent(p, "collect", 1);
          } else {
            p.credits += 6;
          }
          if (!this.inTutorial()) p.dirty = true;
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
      const inDive = this.diveIndex >= 0; // dive cores don't feed the faction war
      if (node.by !== NEUTRAL && node.by === node.owner) {
        node.progress = 1; // held
        if (!this.inTutorial() && !inDive) this.bumpMeta("f" + node.by, NODE_HOLD_SCORE_PER_SEC * dts);
        // late divers at an already-cracked core still get THEIR recovery + dive beat
        // (claim-once per player, so this fires exactly once for each of them)
        if (inDive) {
          for (const pl of this.players.values()) {
            if (pl.dead || dist2(pl.x, pl.y, node.x, node.y) > CR2) continue;
            if (!pl.fragments.includes(this.diveFragmentIdFor(pl))) {
              this.campaignCapture(pl);
              void this.recoverFragment(pl);
            }
          }
        }
      } else if (node.owner === NEUTRAL && node.by !== NEUTRAL) {
        // CONTAGION OUTBREAK doubles channelling — the window to flip a district
        const chanMult = this.eventActive("contagion_outbreak") ? 2 : 1;
        node.progress = Math.min(1, node.progress + NODE_CAPTURE_PER_SEC * chanMult * dts);
        if (node.progress >= 1) {
          node.owner = node.by;
          if (!this.inTutorial() && !inDive) this.bumpMeta("f" + node.by, FACTION_CAPTURE_SCORE);
          // credit the players who channelled it (quest "capture" objective)
          for (const pl of this.players.values()) {
            if (!pl.dead && pl.faction === node.by && dist2(pl.x, pl.y, node.x, node.y) <= CR2) {
              if (this.inTutorial()) this.tutorialEvent(pl, "capture");
              else if (inDive) {
                this.campaignCapture(pl); // the dive beat itself
                void this.recoverFragment(pl); // memory + cache + stat (claim-once inside)
              } else {
                this.campaignCapture(pl);
                this.campaignSecureCheck(pl);
                this.bumpStat(pl, "captures", 1);
                this.contractEvent(pl, "capture", 1);
              }
            }
          }
        }
      } else if (inDive && node.owner !== NEUTRAL) {
        node.progress = 1; // a freed mind stays freed — dive cores never re-freeze
      } else {
        // owned but contested by an enemy, or nobody channelling → erode the hold
        const rate = node.by === NEUTRAL ? NODE_DECAY_PER_SEC : NODE_CAPTURE_PER_SEC;
        node.progress = Math.max(0, node.progress - rate * dts);
        if (node.progress <= 0) node.owner = NEUTRAL;
      }
    }

    // 5) broadcast — PER-CLIENT area-of-interest: each player is only sent the
    // entities within AOI_RADIUS of their own position (always including itself).
    const factions = Array.from({ length: FACTION_COUNT }, (_, i) => Math.round(this.meta["f" + i] ?? 0));
    const control = this.districtControl();
    const roster = [...this.players.values()].map((p) => ({ id: p.id, faction: p.faction, level: p.level }));
    for (const [ws, id] of this.sessions) {
      const viewer = this.players.get(id);
      if (!viewer) continue;
      try {
        ws.send(this.snapshotFor(viewer, factions, control, roster));
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
        metro: p.metro,
        xp: p.xp,
        level: p.level,
        faction: p.faction,
        campaignQuest: p.campaign.activeId,
        campaignStage: p.campaign.stage,
        campaignProgress: p.campaign.progress,
        campaignObjective: p.campaign.currentStage?.objective ?? "",
        tutorialStep: p.tutorialStep,
        tutorialProgress: p.tutorialProgress,
        tutorialDone: p.tutorialDone,
        inTutorial: this.inTutorial(),
        look: applyCosmetic(p.look, p.cosmeticEquipped), // relay the equipped transmog so others see it
        pvpInArena: p.pvpInArena,
        ...(this.tick < p.dashUntilTick ? { dash: 1 as const } : {}),
        ...(this.tick < p.droneUntilTick ? { escort: 1 as const } : {}),
        ...(p.id === viewer.id ? { pvpEscrow: p.pvpEscrow, heat: Math.round(p.heat) } : {}),
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
          ...(e.boss
            ? { boss: true, name: e.name, tint: e.tint, hpMax: Math.round(e.maxHp) }
            : e.hvt
              ? { name: e.name, tint: e.tint, hvt: true, hpMax: Math.round(e.maxHp) } // the day's bounty — labelled + health-barred
              : e.name && e.tint
                ? { name: e.name, tint: e.tint } // elites + named fixtures (CRUCIBLE DRONE): aura tint + name
                : {}),
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
    const hazards = [];
    for (const hz of this.hazards) {
      if (near(hz.x, hz.y))
        hazards.push({
          id: hz.id,
          x: round2(hz.x),
          y: round2(hz.y),
          r: hz.r,
          // 0 → just cast, 1 → about to detonate (drives the client telegraph fill)
          frac: round2(Math.max(0, Math.min(1, (this.tick - hz.castTick) / Math.max(1, hz.detonateTick - hz.castTick)))),
          ...(hz.vsEnemies ? { friendly: 1 as const } : {}),
        });
    }
    const nodes = [];
    for (const n of this.nodes) {
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
      hazards,
      nodes,
      factions,
      control,
      roster,
      boss,
    });
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

  /** Enter/exit THE CRUCIBLE — $METRO buy-in escrow. Called after movement each tick. */
  private tickPvpArena(p: PlayerState) {
    if (this.inTutorial() || this.interior) {
      if (p.pvpInArena) this.refundPvpEscrow(p, "contest ended");
      return;
    }
    const { worldW, worldH } = gridDims(this.grid);
    const zones = pvpZonesFor(worldW, worldH, this.zoneName);
    if (zones.length === 0) {
      if (p.pvpInArena) this.refundPvpEscrow(p, "contest ended");
      return;
    }
    const inZone = inPvpZone(p.x, p.y, zones);
    if (!inZone) {
      if (p.pvpInArena) this.refundPvpEscrow(p, "left the arena");
      p.pvpSafeX = p.x;
      p.pvpSafeY = p.y;
      return;
    }
    if (p.pvpInArena) return;
    if (p.metro < PVP_BUY_IN_METRO) {
      p.x = p.pvpSafeX;
      p.y = p.pvpSafeY;
      p.dirty = true;
      this.sendTo(p.id, {
        t: "sys",
        text: `◈ need ${fmtMetro(PVP_BUY_IN_METRO)} $METRO buy-in to enter THE CRUCIBLE — deposit via the bridge`,
      });
      return;
    }
    p.metro -= PVP_BUY_IN_METRO;
    p.pvpEscrow = PVP_BUY_IN_METRO;
    p.pvpInArena = true;
    p.dirty = true;
    this.sendTo(p.id, {
      t: "sys",
      text: `◈ ${fmtMetro(PVP_BUY_IN_METRO)} $METRO buy-in locked — claim eliminations, leave safely to withdraw`,
    });
  }

  /** Return escrowed $METRO to the player's withdrawable balance. */
  private refundPvpEscrow(p: PlayerState, reason: string) {
    if (!p.pvpInArena) return;
    const pot = p.pvpEscrow;
    p.metro += pot;
    p.pvpEscrow = 0;
    p.pvpInArena = false;
    p.dirty = true;
    if (pot > 0) {
      this.sendTo(p.id, { t: "sys", text: `✓ ${reason} — ◈${fmtMetro(pot)} $METRO returned to your balance` });
    }
  }

  /** Player-vs-player damage, gated to the PvP arenas. The server owns HP/death/respawn
   *  and awards an arena bounty + the victim's $METRO escrow. Returns true on a hit. */
  private resolvePvpHit(s: Shot, ax: number, ay: number): boolean {
    const shooter = this.players.get(s.owner);
    const { worldW, worldH } = gridDims(this.grid);
    const pvp = pvpZonesFor(worldW, worldH, this.zoneName);
    if (this.interior || !shooter || !shooter.pvpInArena || !inPvpZone(shooter.x, shooter.y, pvp)) return false;
    const R2 = PROJ_HIT_RADIUS * PROJ_HIT_RADIUS;
    for (const v of this.players.values()) {
      if (v.id === s.owner || v.dead) continue;
      if (this.tick < v.pvpSafeUntil) continue; // spawn protection
      // PvP honors i-frames only during the blink itself (150ms), not the full 260ms
      // grace — 43% dodge uptime vs other players would smother the arena
      if (this.tick < v.dashUntilTick) continue;
      if (shooter.party >= 0 && v.party === shooter.party) continue; // no team-killing
      if (!v.pvpInArena || !inPvpZone(v.x, v.y, pvp)) continue;
      if (segPointDist2(v.x, v.y, ax, ay, s.x, s.y) <= R2) {
        v.hp -= s.dmg;
        if (v.hp <= 0) {
          v.hp = 0;
          v.dead = true;
          v.respawnTick = this.tick + ticks(RESPAWN_MS);
          const loot = v.pvpEscrow;
          v.pvpEscrow = 0;
          v.pvpInArena = false;
          v.dirty = true;
          if (loot > 0) {
            shooter.pvpEscrow += loot;
            shooter.dirty = true;
          }
          shooter.credits += CREDITS_PER_KILL * 3; // an arena kill pays a bounty
          shooter.xp += XP_PER_KILL * 2;
          shooter.level = levelForXp(shooter.xp);
          shooter.dirty = true;
          this.bumpStat(shooter, "pvp", 1);
          this.bumpStat(shooter, "credits", CREDITS_PER_KILL * 3);
          const lootLine = loot > 0 ? ` (+◈${fmtMetro(loot)} $METRO)` : "";
          this.broadcastSys(`☠ ${shooter.name} eliminated ${v.name} in the arena${lootLine}`);
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

  private nearestEnemyTo(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range * range;
    for (const e of this.enemies.values()) {
      if (e.hp <= 0) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d <= bestD) {
        bestD = d;
        best = e;
      }
    }
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
      if (p.dirty) {
        p.dirty = false;
        await this.upsert(
          p.id,
          p.name,
          p.x,
          p.y,
          p.credits,
          p.xp,
          p.cores,
          p.metro,
          p.campaign.toData(),
          p.inventory,
          p.stash,
          p.look,
          p.equipped,
          p.tutorialDone,
          p.tutorialStep,
          undefined,
          p.tutorialMode ?? "quick",
        );
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
        const cap = 1e12;
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
    metro: number,
    campaign: CampaignData,
    inventory: Item[],
    stash: Item[],
    look: PlayerLook | undefined,
    equipped: Partial<Record<Slot, Item>>,
    tutorialDone = false,
    tutorialStep = 0,
    zoneOverride?: string,
    tutorialMode: TutorialMode = "quick",
  ) {
    const zone = zoneOverride ?? this.zoneName;
    try {
      await this.env.DB.prepare(
        "INSERT INTO players (id, name, x, y, zone, credits, xp, cores, metro, campaign, tutorial_done, tutorial_step, tutorial_mode, inventory, stash, look, equipped, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) " +
          "ON CONFLICT(id) DO UPDATE SET x=excluded.x, y=excluded.y, zone=excluded.zone, credits=excluded.credits, xp=excluded.xp, cores=excluded.cores, metro=excluded.metro, campaign=excluded.campaign, tutorial_done=excluded.tutorial_done, tutorial_step=excluded.tutorial_step, tutorial_mode=excluded.tutorial_mode, inventory=excluded.inventory, stash=excluded.stash, look=excluded.look, equipped=excluded.equipped, updated_at=excluded.updated_at",
      )
        .bind(
          id,
          name,
          round2(x),
          round2(y),
          zone,
          Math.round(credits),
          Math.round(xp),
          Math.round(cores),
          Math.max(0, Math.round(metro)),
          serializeCampaign(campaign),
          tutorialDone ? 1 : 0,
          Math.round(tutorialStep),
          tutorialMode,
          JSON.stringify(inventory.slice(0, INVENTORY_CAP)),
          JSON.stringify(stash.slice(0, STASH_CAP)),
          look ? JSON.stringify(look) : null,
          JSON.stringify(equipped),
          Date.now(),
        )
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
      if (p.pvpInArena) this.refundPvpEscrow(p, "disconnected from arena");
      await this.upsert(
        p.id,
        p.name,
        p.x,
        p.y,
        p.credits,
        p.xp,
        p.cores,
        p.metro,
        p.campaign.toData(),
        p.inventory,
        p.stash,
        p.look,
        p.equipped,
        p.tutorialDone,
        p.tutorialStep,
        undefined,
        p.tutorialMode ?? "quick",
      );
      await this.flushStats(p);
      await this.flushDailies(p);
      await this.syncMeta();
      this.players.delete(id);
    }
  }
}
