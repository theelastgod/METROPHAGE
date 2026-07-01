import Phaser from "phaser";
import { installUiCamera } from "../render/cameras";
import { createTerrainLayer, type TerrainProfile } from "../render/terrainLayer";
import { paintRooftopLights } from "../render/rooftopLights";
import { PlayerLight } from "../render/PlayerLight";
import Atmosphere from "../render/Atmosphere";
import MusicDirector from "../audio/MusicDirector";
import OnlineInventory from "../ui/OnlineInventory";
import OnlineShop from "../ui/OnlineShop";
import OnlineForge from "../ui/OnlineForge";
import OnlineBoard from "../ui/OnlineBoard";
import OnlineGuild from "../ui/OnlineGuild";
import OnlineMarket from "../ui/OnlineMarket";
import OnlineContracts from "../ui/OnlineContracts";
import OnlineChatPanel from "../ui/OnlineChatPanel";
import { COLORS, TILE, VIEW_W, VIEW_H, NPC, uiDim, uiFont, DISTRICT_GRID_W, DISTRICT_GRID_H } from "../config";
import { PLAYER_KEY, COP_KEY, BULLET_KEY, GLOW_KEY, NODE_KEY, PROP_STREETLIGHT_KEY, PROP_VENDING_KEY, PROP_AC_KEY } from "../assets/manifest";
import { driveChar } from "../assets/anim";
import {
  PLAYER_HP,
  PICKUP_CORE,
  xpIntoLevel,
  FACTION_COLORS,
  FACTION_NAMES,
  NEUTRAL,
  factionForColor,
  inPvpZone,
} from "../net/sim";
import {
  buildGrid,
  buildBridgeGrid,
  buildSafehouse,
  buildSubway,
  buildTutorial,
  SAFEHOUSE_SPAWN,
  TUTORIAL_PORTAL,
  TUTORIAL_PORTAL_RADIUS,
  TUTORIAL_SPAWN,
  isWall,
  type TileGrid,
} from "../world/district";
import {
  parseBridgeZone,
  getBridge,
  bridgeWestTile,
  bridgeEastTile,
  parseDistrictZone,
  type BridgeDef,
} from "../game/bridges";
import { scatterWildernessProps } from "../render/wildernessScatter";
import { TUTORIAL_ZONE, tutorialStepAt, type TutorialKind, type TutorialMode } from "../net/tutorial";
import {
  TUTORIAL_CHAMBERS,
  tutorialInstructorsFor,
  instructorForStep,
  chamberAccentForKind,
  chamberForKind,
  tpx,
} from "../game/tutorialLayout";
import { getSettings } from "../systems/Settings";
import { fadeInScene, transitionTo } from "../systems/transitions";
import { juiceShake, juiceFlash, juiceHitStop, juiceZoomPunch, juiceNeonPulse } from "../systems/juice";
import Particles from "../render/Particles";
import { playCombatPose } from "../assets/combatAnim";
import { gamepadIntent } from "../systems/Input";
import { t } from "../i18n";
import Synth from "../audio/Synth";
import Pops from "../render/Pops";
import OptionsPanel from "../ui/OptionsPanel";
import { DISTRICTS } from "../game/districts";
import { getWeapon, type PrimaryDef } from "../game/weapons";
import { ENEMY_BARKS } from "../game/enemies";
import { gridDims, pvpZonesFor, stepMove, NET_TICK_MS, type MoveState } from "../net/sim";
import PvpCrucibleHud from "../ui/PvpCrucibleHud";
import { drawHubNpcPlate } from "../ui/studioChrome";
import { displayFont, bodyFont, hudFont } from "../ui/typography";
import { onlineHudStack, uiGap } from "../ui/spacing";
import ClickToMove from "../systems/ClickToMove";
import ContextMenu from "../ui/ContextMenu";
import TileCursor, { type TileCursorHint } from "../ui/TileCursor";
import RsSkillsPanel from "../ui/RsSkillsPanel";
import RsActionBar from "../ui/RsActionBar";
import RsGameMessage from "../ui/RsGameMessage";
import { grantSkillXp, loadRsSkills, type RsSkillXp } from "../game/rsSkills";
import { scatterWorldProps } from "../render/propScatter";
import OnlineMinimap from "../ui/OnlineMinimap";
import RsQuestLog from "../ui/RsQuestLog";
import { CITY_HUB_SPAWN, ENV_IDENTITY, envAt, ONLINE_CITY } from "../world/city";
import { paintCityEnvWash, paintCityStorefrontReflections } from "../render/cityTerrainPolish";
import { paintCityBuildingFacades } from "../render/buildingFacades";
import NetClient, { type NetEnemy } from "../net/NetClient";
import NeonPipeline from "../render/NeonPipeline";
import { campaignHud, Campaign } from "../net/campaign";
import OnlineCosmetics from "../ui/OnlineCosmetics";
import OnlineMap from "../ui/OnlineMap";
import { applyCosmetic } from "../game/cosmetics";
import { npcDef, AMBIENT_NPCS, INTERIOR_PLAN, keeperFor } from "../game/cityNpcs";
import { bountyForNpc } from "../game/bounties";
import type { PlayerLook } from "../net/protocol";
import { setOnlinePlayer } from "../economy/session";
import { connectedWallet, signWalletLogin } from "../economy/wallet";
import { loginMessage } from "../net/protocol";
import {
  sanitizeCustomization,
  customizationToLook,
  bakeCustomPlayer,
  bakeRemoteLook,
  lookKey,
  PLAYER_CUSTOM_KEY,
  type Customization,
} from "../game/customization";

const SERVER_URL =
  (import.meta.env as Record<string, string | undefined>).VITE_SERVER_URL ??
  "ws://127.0.0.1:8787/ws";

type ZoneNpc =
  | { kind: "service"; svc: string; name: string; x: number; y: number }
  | { kind: "talk"; npcId?: string; name: string; lines?: string[]; lineIdx?: number; x: number; y: number }
  | { kind: "door"; dest: string; name: string; x: number; y: number }
  | { kind: "transit"; dest: string; name: string; label: string; color: number; x: number; y: number }
  | {
      kind: "instructor";
      lessonKind: TutorialKind;
      name: string;
      tag: string;
      lines: string[];
      lineIdx: number;
      x: number;
      y: number;
      color: number;
    };

/** Baked human look for a plaza operative (colour in the jacket, not a scene tint). */
function hubLook(p: Partial<PlayerLook>): PlayerLook {
  return {
    color: 0x00e5ff,
    build: "normal",
    head: "cap",
    visor: "band",
    shoulders: "none",
    decal: "none",
    cloak: "none",
    skin: 0xc98a5e,
    sex: "m",
    hair: "short",
    hairColor: 0x4a2f1c,
    beard: "none",
    faceMark: "none",
    eyeColor: 0x1a1020,
    gloves: "none",
    legGear: "none",
    accentColor: 0xff2bd6,
    antennae: false,
    emblem: false,
    strap: false,
    ...p,
  };
}

/** Hub tile relative to the procedural city centre — survives CITY_SCALE changes. */
const [HUB_CX, HUB_CY] = ONLINE_CITY.spawn;
const hubT = (dx: number, dy: number): [number, number] => [HUB_CX + dx, HUB_CY + dy];

/** District / bridge edge gates scale with the combat grid. */
function districtEdgeTiles(grid: TileGrid): { east: [number, number]; west: [number, number] } {
  const gw = grid[0]?.length ?? DISTRICT_GRID_W;
  const gh = grid.length ?? DISTRICT_GRID_H;
  const midY = Math.floor(gh / 2);
  return { east: [gw - 8, midY], west: [8, midY] };
}

/** Service operatives that populate the SAFEHOUSE hub — walk up + press E to open each
 *  online system. Static fixtures (deterministic positions, identical for everyone), so
 *  they're pure client-side: the safehouse reads as a populated town, not an empty room. */
/** Operatives on the shared city plaza — anchored to the central plaza. */
const CITY_HUB_NPCS: { svc: string; name: string; tag: string; color: number; tile: [number, number]; look: PlayerLook }[] = [
  {
    svc: "forge",
    name: "ARMORER",
    tag: "FORGE",
    color: 0xff2bd6,
    tile: hubT(-8, -2),
    look: hubLook({ color: 0xff2bd6, sex: "f", skin: 0xe6b58c, hair: "undercut", hairColor: 0x1b1820, gloves: "wraps", cloak: "coat", accentColor: 0x00e5ff }),
  },
  {
    svc: "board",
    name: "ARCHIVIST",
    tag: "DOSSIER",
    color: 0x00e5ff,
    tile: hubT(8, -2),
    look: hubLook({ color: 0x00e5ff, head: "beret", sex: "f", skin: 0xa9794a, hair: "bun", hairColor: 0x1b1820, cloak: "coat" }),
  },
  {
    svc: "vendor",
    name: "QUARTERMASTER",
    tag: "VENDOR",
    color: 0xf7ff3c,
    tile: hubT(8, 4),
    look: hubLook({ color: 0xf7ff3c, skin: 0xc98a5e, hair: "buzz", beard: "stubble", strap: true, cloak: "coat" }),
  },
  {
    svc: "contracts",
    name: "THE FIXER",
    tag: "CONTRACTS",
    color: 0x39ff88,
    tile: hubT(8, 10),
    look: hubLook({ color: 0x39ff88, head: "hood", skin: 0x4f3220, hair: "long", hairColor: 0xc7cdd8, cloak: "coat" }),
  },
  {
    svc: "cosmetics",
    name: "THE TAILOR",
    tag: "WARDROBE",
    color: 0xff79c6,
    tile: hubT(-8, 10),
    look: hubLook({ color: 0xff79c6, head: "beret", sex: "f", skin: 0xf3d2b8, hair: "bun", hairColor: 0xff5fb0, accentColor: 0x00e5ff }),
  },
  {
    svc: "market",
    name: "THE BROKER",
    tag: "WORLD MARKET",
    color: 0xff2bd6,
    tile: hubT(-8, 4),
    look: hubLook({ color: 0xff2bd6, head: "hood", skin: 0x7c4f30, hair: "braids", hairColor: 0x1b1820, cloak: "coat" }),
  },
  {
    svc: "guild",
    name: "ORGANIZER",
    tag: "CELL",
    color: 0x6b9bff,
    tile: hubT(0, 14),
    look: hubLook({ color: 0x6b9bff, skin: 0xf3d2b8, hair: "short", hairColor: 0x4a2f1c, cloak: "coat" }),
  },
];

/** Ambient regulars who linger in the safehouse hub for life (the quest-giver citizens
 *  RIN/DOC/VEX/SABLE now live in their own building interiors below). */
const CITY_HUB_CITIZENS: { id: string; tile: [number, number] }[] = [
  { id: "marek", tile: hubT(-4, 2) },
  { id: "amb_tech", tile: hubT(4, 2) },
];

/** Titles shown atop each interior zone. */
const INTERIOR_TITLES: Record<string, string> = {
  safe: "▣ METRO CITY",
  clinic: "✚ THE CLINIC",
  bar: "▦ THE FERAL CAT",
  den: "◈ THE DEN",
  shop: "▣ MARKET STALL",
};

/** Doors in the hub that open into building interiors (each its own no-combat zone). */
const CITY_HUB_DOORS: { dest: string; label: string; tile: [number, number]; color: number }[] = [
  { dest: "clinic", label: "CLINIC", tile: hubT(-4, -6), color: 0x39ff88 },
  { dest: "shop", label: "MARKET", tile: hubT(4, -6), color: 0x00e5ff },
  { dest: "bar", label: "THE FERAL CAT", tile: hubT(-4, 6), color: 0xff79c6 },
  { dest: "den", label: "THE DEN", tile: hubT(4, 6), color: 0xff2bd6 },
  { dest: "subway", label: "▼ THE UNDERLINE", tile: hubT(-12, 0), color: 0xff3b6b },
  { dest: "d0", label: "▶ DEPLOY GATE", tile: [HUB_CX, HUB_CY + Math.round(ONLINE_CITY.h * 0.14)], color: 0x39ff88 },
];

/** East-edge trail guides — forward into the wilderness corridor before the next district. */
const DISTRICT_TRANSIT_FWD: Array<{ district: number; dest: string; label: string; color: number; look: PlayerLook }> = [
  { district: 0, dest: "w0", label: "▶ GLASS CANYON", color: 0x6ab0ff, look: hubLook({ color: 0x6ab0ff, head: "hood", skin: 0xc98a5e, hair: "short", cloak: "coat", strap: true }) },
  { district: 1, dest: "w1", label: "▶ RELAY CUT", color: 0x9dff3c, look: hubLook({ color: 0x9dff3c, head: "cap", skin: 0x7c4f30, hair: "buzz", beard: "stubble", cloak: "coat" }) },
  { district: 2, dest: "w2", label: "▶ TIDAL SCRUB", color: 0x29e7ff, look: hubLook({ color: 0x29e7ff, head: "beret", sex: "f", skin: 0xe6b58c, hair: "ponytail", cloak: "coat" }) },
  { district: 3, dest: "w3", label: "▶ UNDERCITY VERGE", color: 0xb06bff, look: hubLook({ color: 0xb06bff, skin: 0x4f3220, hair: "dreads", cloak: "coat", legGear: "boots" }) },
  { district: 4, dest: "w4", label: "▶ ORBITAL BRUSH", color: 0xff7a18, look: hubLook({ color: 0xff7a18, head: "cap", sex: "f", skin: 0xa9794a, hair: "braids", cloak: "coat" }) },
  { district: 5, dest: "w5", label: "▶ ASH CORRIDOR", color: 0xf7a23c, look: hubLook({ color: 0xf7a23c, skin: 0xc98a5e, hair: "undercut", beard: "goatee", cloak: "coat", gloves: "wraps" }) },
  { district: 6, dest: "w6", label: "▶ KERNEL APPROACH", color: 0xff3b6b, look: hubLook({ color: 0xff3b6b, head: "beret", skin: 0xf3d2b8, hair: "long", cloak: "coat" }) },
];

/** West-edge trail guides — back into the wilderness corridor toward the previous district. */
const DISTRICT_TRANSIT_BACK: Array<{ district: number; dest: string; label: string; color: number; look: PlayerLook }> = [
  { district: 1, dest: "w0", label: "◀ GLASS CANYON", color: 0x6ab0ff, look: hubLook({ color: 0x6ab0ff, head: "hood", skin: 0x7c4f30, cloak: "coat" }) },
  { district: 2, dest: "w1", label: "◀ RELAY CUT", color: 0x9dff3c, look: hubLook({ color: 0x9dff3c, head: "cap", skin: 0xc98a5e, cloak: "coat" }) },
  { district: 3, dest: "w2", label: "◀ TIDAL SCRUB", color: 0x29e7ff, look: hubLook({ color: 0x29e7ff, head: "beret", skin: 0x4f3220, cloak: "coat" }) },
  { district: 4, dest: "w3", label: "◀ UNDERCITY VERGE", color: 0xb06bff, look: hubLook({ color: 0xb06bff, skin: 0xe6b58c, hair: "long", cloak: "coat" }) },
  { district: 5, dest: "w4", label: "◀ ORBITAL BRUSH", color: 0xff7a18, look: hubLook({ color: 0xff7a18, head: "cap", skin: 0xa9794a, cloak: "coat" }) },
  { district: 6, dest: "w5", label: "◀ ASH CORRIDOR", color: 0xf7a23c, look: hubLook({ color: 0xf7a23c, skin: 0x7c4f30, beard: "stubble", cloak: "coat" }) },
  { district: 7, dest: "w6", label: "◀ KERNEL APPROACH", color: 0xff3b6b, look: hubLook({ color: 0xff3b6b, head: "beret", skin: 0xc98a5e, cloak: "coat" }) },
];

/** Central tiles to seat a building interior's occupants. */
const INTERIOR_NPC_TILES: [number, number][] = [[20, 12], [15, 15], [25, 15], [20, 18]];

/** HSS archetype tints (index = enemy kind), matching the singleplayer reads. */
// 0 patrol · 1 wasp · 2 lancer · 3 hound · 4 enforcer · 5 sniper · 6 wraith
const ENEMY_KIND_TINT = [0xff3b6b, 0x39ffd0, 0xffe06a, 0xff5ad0, 0xff8a3c, 0x4d8cff, 0xb06bff];

/** Emote wheel — first four float over your avatar; the rest drop a world ping marker. */
const EMOTES: Array<{ text: string; ping: boolean }> = [
  { text: "GG", ping: false },
  { text: "NICE", ping: false },
  { text: "HELP!", ping: false },
  { text: "?!", ping: false },
  { text: "▶ RALLY", ping: true },
  { text: "ON ME", ping: true },
  { text: "FALL BACK", ping: true },
  { text: "ENEMY", ping: true },
];

/**
 * Step 2 — the online game client. Renders the real district + player, but the
 * local player's movement is SERVER-AUTHORITATIVE: the client predicts with the
 * shared sim (zero-latency feel) and reconciles against the server's snapshots.
 * Walls, speed and bounds are enforced server-side. A net-debug HUD makes the
 * prediction/reconciliation observable.
 *
 * Combat / loot / currency / progression / Singularity authority layer onto this
 * same client-predicts / server-decides pattern in the next Step-2 commits.
 */
export default class OnlineScene extends Phaser.Scene {
  private net!: NetClient;
  private me!: Phaser.GameObjects.Sprite;
  private meLight!: PlayerLight;
  private remoteSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private remoteLabels = new Map<string, Phaser.GameObjects.Text>();
  private enemySprites = new Map<number, Phaser.GameObjects.Sprite>();
  private bossOverlays = new Map<number, { name: Phaser.GameObjects.Text; bar: Phaser.GameObjects.Graphics }>();
  private bossBanner!: Phaser.GameObjects.Text; // zone boss status (alive / reform countdown)
  private bossArrow!: Phaser.GameObjects.Text; // screen-edge pointer toward an off-screen boss
  private shotSprites = new Map<number, Phaser.GameObjects.Image>();
  private pickupSprites = new Map<number, Phaser.GameObjects.Image>();
  private nodeSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private nodeG!: Phaser.GameObjects.Graphics;
  private hazardG!: Phaser.GameObjects.Graphics; // telegraphed boss AoE rings (raid mechanics)
  private faction = 0;
  private hud!: Phaser.GameObjects.Text;
  private hpBar!: Phaser.GameObjects.Graphics;
  private deadText!: Phaser.GameObjects.Text;
  private atmosphere?: Atmosphere; // rich ambient layer, shared with the SP city
  private connectStartedAt = 0; // when this connection attempt began (for the offline timeout)
  private connectionState: "connecting" | "connected" | "reconnecting" | "offline" = "connecting";
  private connectDots = 0;
  private connectDotTimer = 0;
  private hudRefreshAcc = 0;
  private minimapRefreshAcc = 0;
  private lastHudConnectionState: typeof this.connectionState | null = null;
  private static readonly HUD_REFRESH_MS = 260;
  private static readonly MINIMAP_REFRESH_MS = 150;
  private inv!: OnlineInventory; // bottom hotbar + openable bag, fed by the server
  private shop!: OnlineShop; // vendor panel (credits sink)
  private forge!: OnlineForge; // gear forge — upgrade/reforge/fuse/salvage (credits+cores sink)
  private board!: OnlineBoard; // achievements + cross-zone leaderboards (D1-backed, HTTP)
  private guildPanel!: OnlineGuild; // guild ("Cell") bank/roster/level (D1-backed)
  private market!: OnlineMarket; // auction house — cross-zone player market (D1-backed)
  private contracts!: OnlineContracts; // daily contracts + reputation track (D1-backed)
  private cosmetics!: OnlineCosmetics; // wardrobe / transmog (cosmetic-only, wallet-owned)
  private mapPanel!: OnlineMap; // fast-travel map with per-account discovery fog
  private baseLook?: PlayerLook; // your base appearance (cosmetics merge on top for rendering)
  private chatPanel!: OnlineChatPanel;
  private lastChatShown = 0;
  private rosterText!: Phaser.GameObjects.Text;
  private tradeText!: Phaser.GameObjects.Text;
  private questText!: Phaser.GameObjects.Text;
  private dailyText!: Phaser.GameObjects.Text; // active daily contract — the immediate objective
  private bountyText!: Phaser.GameObjects.Text; // active authored NPC bounty
  private storyPanel!: Phaser.GameObjects.Text;
  private chatOpen = false;
  private chatBuffer = "";
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private color: number = COLORS.player;
  private callsign = "runner";
  private zone = "d0";
  private zoneAccent = 0x29e7ff;
  private districtIndex = 0;
  private interior = false; // true in a no-combat interior (hub / building)
  private isCityHub = false; // shared METRO CITY — the live online hub
  private isSubway = false; // THE UNDERLINE — an indoor COMBAT dungeon zone
  private isBridge = false; // wilderness corridor between two districts
  private bridgeIndex = -1;
  private fromZone = "d0"; // district to return to when leaving the safehouse
  private meDir = new Phaser.Math.Vector2(0, 1); // last facing for the local avatar
  private nextEnemyBarkAt = 0; // throttle for online HSS barks
  private emoteWheelOpen = false;
  private wheelObjs: Phaser.GameObjects.GameObject[] = [];
  private lastEmoteShownAt = 0; // newest relayed emote already rendered
  private pvpHud!: PvpCrucibleHud;
  private clickMove!: ClickToMove;
  private contextMenu!: ContextMenu;
  private tileCursor!: TileCursor;
  private rsSkills!: RsSkillXp;
  private rsSkillsPanel!: RsSkillsPanel;
  private attackTargetId: number | null = null;
  private pendingInteract: ZoneNpc | null = null;
  private footerHint!: Phaser.GameObjects.Text;
  private zoneMinimap?: OnlineMinimap;
  private questLog!: RsQuestLog;
  private rsActionBar?: RsActionBar;
  private rsGameMessage!: RsGameMessage;
  private readonly attackRange = 200;
  // zone interactables — service operatives (open a system), authored citizens (flavour),
  // and doors (travel into a building interior)
  private npcs: ZoneNpc[] = [];
  private nearNpc: ZoneNpc | null = null;
  private interactPrompt?: Phaser.GameObjects.Text;
  private speechBubble?: Phaser.GameObjects.Text;

  private isTutorial = false;
  private tutorialPanel!: Phaser.GameObjects.Text;
  private tutorialSkipBtn!: Phaser.GameObjects.Text;
  private tutorialPortalGlow!: Phaser.GameObjects.Image;
  private tutorialChamberG?: Phaser.GameObjects.Graphics;

  private nearPortal = false;
  private zoneGrid!: TileGrid;
  private worldW = 0;
  private worldH = 0;
  private pvpZones: ReturnType<typeof pvpZonesFor> = [];
  private neon?: NeonPipeline;
  private synth?: Synth;
  private pops?: Pops;
  private particles?: Particles;
  private options?: OptionsPanel;
  private prevHp = PLAYER_HP;
  private prevCredits = 0;
  private prevCores = 0;
  private prevLevel = 1;
  private prevEnemyHp = new Map<number, { hp: number; x: number; y: number; boss?: boolean }>();
  private killStreak = 0;
  private killStreakExpiresAt = 0;
  private footstepAcc = 0;
  private lastShootAt = 0;
  private lastMeleeSlashAt = 0;
  private static readonly PICKUP_MAGNET = 88;
  private static readonly KILL_STREAK_MS = 2800;
  private travelToast?: Phaser.GameObjects.Text;
  /** Offline/connecting drill preview — local movement until the server welcomes us. */
  private drillLocal: MoveState | null = null;
  private drillLocalAcc = 0;
  constructor() {
    super("Online");
  }

  create(data?: { zone?: string; from?: string; tutorialMode?: TutorialMode }) {
    const rawCust = this.registry.get("customization") as Customization | undefined;
    const cust = sanitizeCustomization(rawCust, this.registry.get("classId") as string | undefined);
    this.callsign = (rawCust?.callsign || "runner").toLowerCase();
    this.color = cust.color;
    this.emoteWheelOpen = false; // reset transient UI across scene.restart (travel)
    this.wheelObjs = [];
    this.lastEmoteShownAt = 0;
    this.bossOverlays.clear(); // GO destroyed on shutdown; drop stale refs before re-create
    // Zone = which district (or the safehouse interior) this client is in. Travel hands off
    // to another DO by reconnecting with a new zone.
    // named zones (interiors + the subway dungeon) pass through by name; else a district
    const rawZone = data?.zone ?? TUTORIAL_ZONE;
    const bridgeIdx = parseBridgeZone(rawZone);
    this.isBridge = bridgeIdx >= 0;
    this.bridgeIndex = bridgeIdx;
    const named = !!INTERIOR_TITLES[rawZone] || rawZone === "subway" || rawZone === TUTORIAL_ZONE || this.isBridge;
    this.zone = this.isBridge ? rawZone : named ? rawZone : "d" + this.parseZone(data?.zone);
    this.isTutorial = this.zone === TUTORIAL_ZONE;
    this.interior = !!INTERIOR_TITLES[this.zone] || this.zone === "safe"; // hub + building interiors
    this.isCityHub = this.zone === "safe";
    this.isSubway = this.zone === "subway";
    this.fromZone = data?.from ?? "d0"; // where 'H' returns to from inside an interior
    this.districtIndex = this.interior ? 0 : this.isBridge ? getBridge(bridgeIdx).fromDistrict : this.parseZone(data?.zone);
    // scene.start reuses the instance (field initializers don't re-run) — reset per-zone
    // interactables so NPCs/doors don't accumulate across travel between zones.
    this.npcs = [];
    this.nearNpc = null;
    const bridgeDef = this.isBridge ? getBridge(this.bridgeIndex) : undefined;
    const def = DISTRICTS[this.districtIndex];

    // Score the zone: district zones (d0–d3) get their matching district bed; the
    // subway dungeon its transit bed; the safehouse hub + building interiors the
    // social/online bed. (Re-asserted on every travel since scene.start re-runs create.)
    MusicDirector.for(this)?.play(
      this.isTutorial
        ? "online"
        : this.isSubway
          ? "subway"
          : this.isCityHub
            ? "city"
            : this.interior
              ? "online"
              : this.isBridge
                ? MusicDirector.districtEnv(DISTRICTS[bridgeDef!.fromDistrict].id)
                : MusicDirector.districtEnv(def.id),
      this,
    );

    this.cameras.main.setBackgroundColor(COLORS.bgVoid);

    // Real world — same tile grid the server simulates against.
    const grid = this.isTutorial
      ? buildTutorial()
      : this.isSubway
        ? buildSubway()
        : this.isCityHub
          ? ONLINE_CITY.grid
          : this.interior
            ? buildSafehouse()
            : this.isBridge
              ? buildBridgeGrid(bridgeDef!)
              : buildGrid(def);
    this.zoneGrid = grid;
    const dims = gridDims(grid);
    this.worldW = dims.worldW;
    this.worldH = dims.worldH;
    this.pvpZones = pvpZonesFor(this.worldW, this.worldH, this.zone);
    const zoneAccent = this.isTutorial ? 0x29e7ff : this.isCityHub ? 0x39ff88 : this.isBridge ? bridgeDef!.accent : def.accent;
    this.zoneAccent = zoneAccent;
    const terrainProfile: TerrainProfile = this.isTutorial
      ? "tutorial"
      : this.isCityHub
        ? "city"
        : this.interior
          ? "interior"
          : this.isSubway
            ? "subway"
            : this.isBridge
              ? "wilderness"
              : "district";
    const cityW = grid[0]?.length ?? 0;
    const cityH = grid.length;
    createTerrainLayer(this, grid, {
      profile: terrainProfile,
      accent: zoneAccent,
      accentAt: this.isCityHub
        ? (tx, ty) => ENV_IDENTITY[envAt(tx, ty, cityW, cityH)].accent
        : this.isBridge
          ? (tx, ty) => {
              const h = ((tx * 48271) ^ (ty * 65521) ^ bridgeDef!.fromDistrict) >>> 0;
              return (h & 3) === 0 ? bridgeDef!.accent : zoneAccent;
            }
          : undefined,
      buildings:
        !this.isCityHub && !this.interior && !this.isSubway && !this.isTutorial && !this.isBridge ? def.layout.buildings : undefined,
      lightweight: this.isCityHub,
    });
    if (this.isCityHub) {
      paintCityEnvWash(this, ONLINE_CITY.zones);
      paintCityBuildingFacades(this, ONLINE_CITY.buildings);
      paintCityStorefrontReflections(this, ONLINE_CITY.buildings);
    }
    if (this.isBridge) {
      scatterWildernessProps(this, grid, zoneAccent, 4, bridgeDef!.layout.biome);
    } else if (this.isCityHub || (!this.interior && !this.isSubway && !this.isTutorial)) {
      scatterWorldProps(this, grid, 4, this.isCityHub ? 0.012 : 0.018);
    }
    if (this.isCityHub) {
      this.atmosphere = new Atmosphere(this, { weather: "rain", accent: zoneAccent, worldW: this.worldW, worldH: this.worldH });
    } else if (this.isBridge && bridgeDef) {
      this.atmosphere = new Atmosphere(this, {
        weather: bridgeDef.weather,
        accent: zoneAccent,
        worldW: this.worldW,
        worldH: this.worldH,
      });
    } else if (!this.interior && !this.isSubway && !this.isTutorial) {
      this.atmosphere = new Atmosphere(this, {
        weather: def.weather,
        accent: zoneAccent,
        worldW: this.worldW,
        worldH: this.worldH,
      });
      for (let i = 0; i < def.layout.buildings.length; i += 2) {
        const b = def.layout.buildings[i];
        const cx = ((b.x1 + b.x2) / 2) * TILE * 2 + TILE / 2;
        const cy = ((b.y1 + b.y2) / 2) * TILE * 2 + TILE / 2;
        this.atmosphere.addHologram(cx, cy, zoneAccent);
      }
      const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
      const adjWall = (x: number, y: number) =>
        isWall(grid[y]?.[x - 1]) || isWall(grid[y]?.[x + 1]) || isWall(grid[y - 1]?.[x]) || isWall(grid[y + 1]?.[x]);
      let placed = 0;
      for (let ty = 1; ty < grid.length - 1 && placed < 24; ty++) {
        for (let tx = 1; tx < grid[ty].length - 1; tx++) {
          if (isWall(grid[ty][tx]) || !adjWall(tx, ty)) continue;
          const h = hash(tx, ty);
          if (h % 6 !== 0) continue;
          const px = tx * TILE + TILE / 2;
          const py = ty * TILE + TILE / 2;
          const pick = h % 3;
          const key = pick === 0 ? PROP_STREETLIGHT_KEY : pick === 1 ? PROP_VENDING_KEY : PROP_AC_KEY;
          const tall = key === PROP_STREETLIGHT_KEY;
          this.add.image(px, py + TILE / 2, key).setOrigin(0.5, tall ? 1 : 0.85).setDepth(4);
          placed++;
        }
      }
      paintRooftopLights(this, def.layout.buildings, (b) => ({ x1: b.x1 * 2, y1: b.y1 * 2, x2: b.x2 * 2, y2: b.y2 * 2 }), () => zoneAccent);
    }
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    installUiCamera(this, 1);
    this.applyNeon();
    fadeInScene(this, zoneAccent);
    if (!this.interior && !this.isSubway && !this.isTutorial && !this.isCityHub) this.drawPvpZones();
    if (this.isTutorial) this.buildTutorialZone();
    if (this.interior) {
      if (this.isCityHub) {
        this.add
          .text(this.worldW / 2, 4 * TILE, INTERIOR_TITLES.safe, displayFont(20, { color: "#39ff88", fontStyle: "bold" }))
          .setOrigin(0.5)
          .setDepth(6)
          .setShadow(0, 0, "#39ff88", 8, true, true);
        this.add
          .text(
            this.worldW / 2,
            4 * TILE + 26,
            "shared live city — no combat · all runners in one space · operatives on the plaza · H from districts",
            bodyFont(11, { color: "#9aa3b2" }),
          )
          .setOrigin(0.5)
          .setDepth(6);
        for (const hubNpc of CITY_HUB_NPCS) {
          const px = hubNpc.tile[0] * TILE + TILE / 2;
          const py = hubNpc.tile[1] * TILE + TILE / 2;
          const key = lookKey(hubNpc.look);
          bakeRemoteLook(this, key, hubNpc.look);
          this.add.image(px, py + 8, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(hubNpc.color).setDepth(8).setScale(0.6).setAlpha(0.45);
          const spr = this.add.sprite(px, py, key, 0).setTint(0xffffff).setDepth(9).setInteractive({ useHandCursor: true });
          spr.on("pointerdown", () => this.openService(hubNpc.svc));
          drawHubNpcPlate(this, px, py, hubNpc.name, hubNpc.tag, hubNpc.color);
          this.npcs.push({ kind: "service", svc: hubNpc.svc, name: `${hubNpc.name} · ${hubNpc.tag}`, x: px, y: py });
        }
        for (const door of CITY_HUB_DOORS) this.makeDoor(door);
        for (const c of CITY_HUB_CITIZENS) {
          const cdef = npcDef(c.id);
          if (cdef) this.makeTalkNpc(cdef.name, cdef.look, cdef.lines, c.tile[0] * TILE + TILE / 2, c.tile[1] * TILE + TILE / 2, cdef.id);
        }
      } else {
        this.add
          .text(this.worldW / 2, 4 * TILE, INTERIOR_TITLES[this.zone] ?? "▣ INTERIOR", { fontFamily: "Courier New, monospace", fontSize: "20px", color: "#39ff88", fontStyle: "bold" })
          .setOrigin(0.5)
          .setDepth(6);
        this.add
          .text(this.worldW / 2, 4 * TILE + 26, "no combat · talk: E · H to return to METRO CITY", {
            fontFamily: "Courier New, monospace",
            fontSize: "11px",
            color: "#9aa3b2",
          })
          .setOrigin(0.5)
          .setDepth(6);
        // a building interior — seat its authored occupants (keeper + residents)
        const residents = INTERIOR_PLAN[this.zone]?.[0] ?? [];
        const occupants = [keeperFor(this.zone), ...residents.map((id) => npcDef(id)).filter((d): d is NonNullable<typeof d> => !!d)];
        occupants.forEach((o, i) => {
          const [tx, ty] = INTERIOR_NPC_TILES[i % INTERIOR_NPC_TILES.length];
          this.makeTalkNpc(o.name, o.look, o.lines, tx * TILE + TILE / 2, ty * TILE + TILE / 2, o.id);
        });
      }
    } else if (this.isBridge && bridgeDef) {
      this.buildBridgeZone(bridgeDef);
    } else if (this.isSubway) {
      // THE UNDERLINE — a combat dungeon: just a title; enemies + boss come from the server.
      this.add
        .text(this.worldW / 2, 4 * TILE, "▼ THE UNDERLINE", { fontFamily: "Courier New, monospace", fontSize: "20px", color: "#ff3b6b", fontStyle: "bold" })
        .setOrigin(0.5)
        .setDepth(6);
      this.add
        .text(this.worldW / 2, 4 * TILE + 26, "the subway dark — purge what nests here · H to surface", {
          fontFamily: "Courier New, monospace",
          fontSize: "11px",
          color: "#9aa3b2",
        })
        .setOrigin(0.5)
        .setDepth(6);
    } else {
      // district ambient life — a few authored citizens near the entrance so the world
      // outside the hub feels inhabited (cosmetic fixtures; HSS + player shots ignore them).
      const [sx, sy] = def.spawnTile;
      const S = 2;
      const spots: [number, number][] = [
        [sx * S - 6, sy * S],
        [sx * S + 6, sy * S],
        [sx * S, sy * S + 6],
        [sx * S - 4, sy * S - 4],
        [sx * S + 4, sy * S + 4],
      ];
      let placed = 0;
      for (const [tx, ty] of spots) {
        if (placed >= 3) break;
        if (isWall(grid[ty]?.[tx])) continue;
        const adef = AMBIENT_NPCS[(this.districtIndex * 3 + placed) % AMBIENT_NPCS.length];
        this.makeTalkNpc(adef.name, adef.look, adef.lines, tx * TILE + TILE / 2, ty * TILE + TILE / 2, adef.id);
        placed++;
      }
      const edges = districtEdgeTiles(grid);
      const fwd = DISTRICT_TRANSIT_FWD.find((t) => t.district === this.districtIndex);
      if (fwd && !isWall(grid[edges.east[1]]?.[edges.east[0]])) {
        this.makeTransitNpc(fwd.dest, fwd.label, edges.east, fwd.color, fwd.look);
      }
      const back = DISTRICT_TRANSIT_BACK.find((t) => t.district === this.districtIndex);
      if (back && !isWall(grid[edges.west[1]]?.[edges.west[0]])) {
        this.makeTransitNpc(back.dest, back.label, edges.west, back.color, back.look);
      }
    }
    // floating dialogue bubble + proximity prompt (used in any zone that has NPCs)
    this.speechBubble = this.add
      .text(0, 0, "", bodyFont(12, {
        color: "#eafdff",
        align: "center",
        backgroundColor: "#0b0716e6",
        padding: { x: uiGap("md"), y: uiGap("sm") },
        wordWrap: { width: uiDim(260) },
      }))
      .setOrigin(0.5, 1)
      .setDepth(12)
      .setVisible(false);
    this.interactPrompt = this.add
      .text(this.scale.width / 2, onlineHudStack(this.scale.height).interactY, "", displayFont(14, { color: "#39ff88", fontStyle: "bold", align: "center" }))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1200)
      .setVisible(false);

    // Local player — your full customization (build/head/visor/shoulders/decal/cloak/
    // accessories), baked and tinted by your signature colour, the same as singleplayer.
    bakeCustomPlayer(this, cust);
    this.me = this.add
      .sprite(this.worldW / 2, this.worldH / 2, PLAYER_CUSTOM_KEY, 0)
      .setTint(0xffffff) // baked in final colours — render untinted
      .setDepth(10)
      .setVisible(false);
    this.meLight = new PlayerLight(this, this.me.x, this.me.y, 4, zoneAccent);
    const soloSpawn = this.soloSpawnPoint();
    if (soloSpawn) {
      this.drillLocal = { x: soloSpawn.x, y: soloSpawn.y };
      this.drillLocalAcc = 0;
      this.me.setPosition(soloSpawn.x, soloSpawn.y).setVisible(true);
      this.cameras.main.startFollow(this.me, true, 0.18, 0.18);
      this.meLight.update(soloSpawn.x, soloSpawn.y, 0);
      this.meLight.setVisible(true);
    } else {
      this.drillLocal = null;
    }

    const url = SERVER_URL + (SERVER_URL.includes("?") ? "&" : "?") + "zone=" + this.zone;
    this.faction = factionForColor(this.color); // your cell, from your signature colour
    this.nodeG = this.add.graphics().setDepth(5); // node capture rings (world-space)
    this.hazardG = this.add.graphics().setDepth(8); // boss AoE telegraphs (under shots/players)
    // Send your look so every other player renders your customization (not a generic body).
    this.baseLook = customizationToLook(cust); // cosmetics merge onto this for the rendered avatar
    const fastArrival = !!this.registry.get("fastTravel");
    this.registry.set("fastTravel", false);
    this.net = new NetClient(grid, this.callsign, url, this.faction, this.baseLook);
    this.net.arrival = fastArrival ? "fast" : "organic";
    this.net.travelFrom = fastArrival ? undefined : this.fromZone;
    const tutorialMode =
      data?.tutorialMode ?? (this.registry.get("tutorialMode") as TutorialMode | undefined) ?? getSettings().tutorialMode;
    if (this.isTutorial) this.registry.set("tutorialMode", tutorialMode);

    this.net.onConnectionState = (state) => {
      this.connectionState = state;
      if (state === "connected") this.connectStartedAt = Date.now();
      this.hudRefreshAcc = OnlineScene.HUD_REFRESH_MS;
      this.minimapRefreshAcc = OnlineScene.MINIMAP_REFRESH_MS;
    };
    this.net.onWelcome = (x, y) => {
      this.drillLocal = null;
      this.me.setPosition(x, y).setVisible(true);
      this.cameras.main.startFollow(this.me, true, 0.18, 0.18);
      setOnlinePlayer(this.net.id);
      if (this.isTutorial) this.net.setTutorialMode(tutorialMode);
      this.initCombatTracking();
      juiceFlash(this, 180, 40, 200, 80);
    };
    this.net.onRedirect = (zone) => {
      this.net.disconnect();
      // Defer restart — graduating closes the socket from inside onmessage; restarting
      // synchronously there can drop the hand-off into the live city.
      this.time.delayedCall(0, () => {
        if (this.scene.isActive("Online")) this.travelOrganic(zone);
      });
    };
    this.contextMenu = new ContextMenu(this);
    this.rsGameMessage = new RsGameMessage(this);
    this.inv = new OnlineInventory(this, this.contextMenu);
    this.inv.onEquip = (id) => this.net.equip(id);
    this.inv.onUnequip = (slot) => this.net.unequip(slot);
    this.inv.onExamine = (text) => this.rsExamine(text);
    this.net.onInventory = () => {
      this.inv.setItems(this.net.inventory);
      this.inv.setEquipped(this.net.equipped);
      this.forge.setState(this.net.inventory, this.net.equipped, this.net.credits, this.net.cores);
      if (this.market?.open) this.market.setState(this.net.marketListings, this.net.inventory, this.net.id, this.net.credits, this.net.metro);
    };
    this.shop = new OnlineShop(this);
    this.shop.onBuy = (sku) => this.net.buy(sku);
    this.forge = new OnlineForge(this);
    this.forge.onCraft = (action, id, id2) => this.net.craft(action, id, id2);
    // HTTP base for cross-zone reads (leaderboards): ws(s)://host/ws → http(s)://host
    const httpBase = SERVER_URL.replace(/^ws/, "http").replace(/\/ws$/, "");
    this.board = new OnlineBoard(this, httpBase);
    this.guildPanel = new OnlineGuild(this);
    this.guildPanel.onAction = (action, c, k) => {
      if (action === "leave") this.net.guildAction("leave");
      else if (action === "info") this.net.guildAction("info");
      else this.net.guildAction(action, { credits: c, cores: k });
    };
    this.net.onGuildUpdate = () => this.guildPanel.setGuild(this.net.guild, this.net.id);
    this.market = new OnlineMarket(this);
    this.market.onBuy = (id) => {
      this.net.marketBuy(id);
      const r = grantSkillXp(this.rsSkills, "trading", 18);
      this.rsSkillsPanel.setSkills(this.rsSkills);
      if (r.leveled) this.pops?.popHeal(this.me.x, this.me.y - 30, `Trading ${r.level}!`);
    };
    this.market.onCancel = (id) => this.net.marketCancel(id);
    this.market.onList = (itemId, price, currency) => this.net.marketList(itemId, price, currency);
    this.market.onRefresh = () => this.net.marketBrowse();
    this.net.onMarket = () => {
      if (this.market.open) this.market.setState(this.net.marketListings, this.net.inventory, this.net.id, this.net.credits, this.net.metro);
    };
    this.contracts = new OnlineContracts(this);
    this.net.onContracts = () => {
      if (this.contracts.open) this.contracts.setState(this.net.contracts, this.net.rep);
      this.shop.setRep(this.net.repTier); // higher vendor caches unlock with reputation
    };
    this.cosmetics = new OnlineCosmetics(this);
    this.cosmetics.onAction = (action, id) => this.net.cosmeticAction(action, id);
    this.net.onCosmetics = () => {
      if (this.cosmetics.open) this.cosmetics.setState(this.net.cosmeticsOwned, this.net.cosmeticEquipped, this.net.credits);
      this.applyLocalCosmetic(); // retint your own avatar to match the equipped transmog
    };
    this.mapPanel = new OnlineMap(this, this.contextMenu);
    this.mapPanel.onTravel = (zone) => this.fastTravel(zone);
    this.mapPanel.onWalkToZone = (zone) => this.walkToZoneFromMap(zone);
    this.mapPanel.onExamine = (text) => this.rsExamine(text);
    this.net.onDiscovered = () => {
      if (this.mapPanel.open) this.mapPanel.setState(this.net.discovered, this.net.unlocked, this.zone);
    };
    this.inv.onMove = (from, to) => this.net.moveInv(from, to);
    // World-boss locator: a status banner + a screen-edge arrow toward an off-screen boss.
    this.bossBanner = this.add
      .text(VIEW_W / 2, 46, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: "#39ff88",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
    this.bossBanner.setShadow(0, 0, "#02030a", 4, true, true);
    this.bossArrow = this.add
      .text(0, 0, "➤", { fontFamily: "Arial, sans-serif", fontSize: "30px", color: "#39ff88", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
    this.bossArrow.setShadow(0, 0, "#02030a", 6, true, true);
    this.connectStartedAt = Date.now(); // wall clock — robust to frame-rate throttling
    void this.signInThenConnect();

    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    this.synth = this.registry.get("synth") as Synth | undefined;
    this.pops = new Pops(this);
    this.particles = new Particles(this);
    this.options = new OptionsPanel(this);
    this.input.once("pointerdown", () => this.synth?.ensureStarted());
    this.input.keyboard?.once("keydown", () => this.synth?.ensureStarted());

    const hudStack = onlineHudStack(this.scale.height);
    this.hud = this.add
      .text(uiDim(16), uiDim(16), "connecting…", hudFont(11, { color: "#39ff88", lineSpacing: uiGap("xs") }))
      .setScrollFactor(0)
      .setDepth(1000);
    if (getSettings().highContrast) this.hud.setStroke("#02030a", uiDim(3));
    this.footerHint = this.add
      .text(this.scale.width / 2, hudStack.footerHintY, this.controlHint(), bodyFont(10, { color: "#6b7184", align: "center" }))
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1000);
    this.options.setOnChange(() => {
      MusicDirector.for(this)?.applyVolumes();
      this.synth?.applyVolumes();
      this.footerHint.setText(this.controlHint());
      if (getSettings().highContrast) this.hud.setStroke("#02030a", uiDim(3));
      else this.hud.setStroke("#000000", 0);
    });

    this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(1000);
    this.deadText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "20px",
        color: "#ff3b6b",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);

    this.pvpHud = new PvpCrucibleHud(this);
    this.clickMove = new ClickToMove(this);
    this.clickMove.onPathFailed = () => {
      this.rsGameMessage?.show("You can't reach that.", { ttlMs: 2600, color: "#ff7a3c" });
    };
    this.tileCursor = new TileCursor(this);
    this.zoneMinimap = new OnlineMinimap(this, this.zoneGrid, this.worldW, this.worldH);
    this.zoneMinimap.onWalk = (wx, wy) => {
      if (!getSettings().rsControls || this.blockRsInput()) return;
      this.attackTargetId = null;
      this.pendingInteract = null;
      const pos = this.playerPos();
      this.clickMove.setDestination(wx, wy, this.zoneGrid, pos.x, pos.y);
    };
    this.questLog = new RsQuestLog(this);
    this.tileCursor.setGrid(this.zoneGrid);
    this.rsSkills = loadRsSkills();
    this.rsSkillsPanel = new RsSkillsPanel(this, this.rsSkills);
    this.rsActionBar = new RsActionBar(this, [
      { key: "inv", label: "Bag", sub: "I", color: 0x00e5ff, onClick: () => this.inv?.toggle() },
      { key: "skills", label: "Skills", sub: "'", color: 0xf7ff3c, onClick: () => this.rsSkillsPanel.toggle() },
      { key: "map", label: "Map", sub: "M", color: 0x39ff88, onClick: () => this.mapPanel?.toggle(this.net.discovered, this.net.unlocked, this.zone) },
      { key: "market", label: "Market", sub: "K", color: 0xff2bd6, onClick: () => this.market?.toggle(this.net.marketListings, this.net.inventory, this.net.id, this.net.credits, this.net.metro) },
      { key: "quests", label: "Quests", sub: "Q", color: 0xb06bff, onClick: () => this.refreshQuestLog(true) },
    ]);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.contextMenu.isOpen()) {
        if (!pointer.rightButtonDown()) this.contextMenu.hide();
        return;
      }
      if (pointer.rightButtonDown()) {
        this.handleRightClick(pointer);
        return;
      }
      if (getSettings().rsControls && !this.isTutorial) this.handleLeftClick(pointer);
    });
    if (this.isCityHub) this.spawnMiningNodes([hubT(-2, 2), hubT(2, 6), hubT(-4, 8)]);

    const mapChain = this.registry.get("pendingMapDest") as string | undefined;
    if (mapChain && mapChain !== this.zone && getSettings().rsControls && !this.isTutorial) {
      this.time.delayedCall(650, () => this.walkToZoneFromMap(mapChain));
    }

    // area chat panel (bottom-left) — everyone in this zone sees the same feed
    this.chatPanel = new OnlineChatPanel(
      this,
      12,
      onlineHudStack(this.scale.height).hotbarY - uiDim(172),
      400,
      156,
      1000,
    );
    this.chatPanel.setArea(this.chatAreaLabel());
    this.rosterText = this.add
      .text(this.scale.width - 12, 98, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        color: "#9aa3b2",
        align: "right",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.tradeText = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 70, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: "#f7ff3c",
        align: "center",
        backgroundColor: "#0b0716cc",
        padding: { x: 14, y: 10 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1005)
      .setVisible(false);
    this.questText = this.add
      .text(this.scale.width / 2, 8, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#b06bff",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.dailyText = this.add
      .text(this.scale.width / 2, 26, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#39ff88",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.bountyText = this.add
      .text(this.scale.width / 2, 42, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#f7ff3c",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.storyPanel = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 40, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: "#eafdff",
        align: "center",
        backgroundColor: "#0b0716ee",
        padding: { x: 18, y: 14 },
        wordWrap: { width: 540 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1006)
      .setVisible(false);

    // Unified keyboard: chat mode captures text; game mode moves / travels / exits.
    this.input.keyboard!.on("keydown", (e: KeyboardEvent) => {
      if (this.chatOpen) {
        if (e.key === "Enter") {
          this.submitChat();
          this.closeChat();
        } else if (e.key === "Escape") {
          this.closeChat();
        } else if (e.key === "Backspace") {
          this.chatBuffer = this.chatBuffer.slice(0, -1);
          this.renderChatInput();
        } else if (e.key.length === 1 && this.chatBuffer.length < 200) {
          this.chatBuffer += e.key;
          this.renderChatInput();
        }
        return;
      }
      if (this.emoteWheelOpen) {
        if (e.key === "Escape" || e.key === "v" || e.key === "V") this.closeWheel();
        return;
      }
      if (this.options?.isOpen) {
        if (e.key === "Escape" || e.key === "o" || e.key === "O") this.options.close();
        return;
      }
      if (e.key === "o" || e.key === "O") {
        this.options?.toggle();
        return;
      }
      if (e.key === " " && this.isTutorial) {
        const step = tutorialStepAt(this.net.tutorialStep, this.net.tutorialMode);
        if (step && ["faction", "campaign", "pvp", "trade", "travel"].includes(step.kind)) {
          this.net.reportTutorial(step.kind);
          return;
        }
      }
      if (e.key === "i" || e.key === "I") {
        this.inv.toggle();
        return;
      }
      if (this.inv.open && e.key === "Escape") {
        this.inv.close(); // ESC closes the bag first, before it exits the scene
        return;
      }
      if (e.key === "b" || e.key === "B") {
        this.shop.toggle();
        if (this.shop.open) this.reportTutorialPanel("vendor");
        return;
      }
      if (this.shop.open && e.key === "Escape") {
        this.shop.close();
        return;
      }
      if (e.key === "e" || e.key === "E") {
        if (this.isTutorial && this.nearPortal) {
          this.enterTutorialPortal();
          return;
        }
        if (this.nearNpc) {
          if (this.nearNpc.kind === "service" && this.nearNpc.svc) this.openService(this.nearNpc.svc);
          else if (this.nearNpc.kind === "door" && this.nearNpc.dest) this.enterZone(this.nearNpc.dest);
          else if (this.nearNpc.kind === "transit" && this.nearNpc.dest) this.enterZone(this.nearNpc.dest);
          else if (this.nearNpc.kind === "instructor") this.talkInstructor(this.nearNpc);
          else this.talkNpc(this.nearNpc);
        }
        return;
      }
      if (e.key === "g" || e.key === "G") {
        this.forge.setState(this.net.inventory, this.net.equipped, this.net.credits, this.net.cores);
        this.forge.toggle();
        if (this.forge.open) this.reportTutorialPanel("craft");
        return;
      }
      if (this.forge.open && e.key === "Escape") {
        this.forge.close();
        return;
      }
      if (e.key === "'" || e.key === '"') {
        this.rsSkillsPanel.toggle();
        return;
      }
      if (this.rsSkillsPanel.open && e.key === "Escape") {
        this.rsSkillsPanel.close();
        return;
      }
      if (e.key === "l" || e.key === "L") {
        this.board.toggle(this.net.achievements, this.net.id);
        if (this.board.open) this.reportTutorialPanel("board");
        return;
      }
      if (this.board.open && e.key === "Escape") {
        this.board.close();
        return;
      }
      if (e.key === "c" || e.key === "C") {
        this.net.guildAction("info"); // pull a fresh summary before showing
        this.guildPanel.toggle(this.net.guild, this.net.id);
        if (this.guildPanel.open) this.reportTutorialPanel("guild");
        return;
      }
      if (this.guildPanel.open && e.key === "Escape") {
        this.guildPanel.close();
        return;
      }
      if (e.key === "k" || e.key === "K") {
        this.market.toggle(this.net.marketListings, this.net.inventory, this.net.id, this.net.credits, this.net.metro);
        if (this.market.open) this.reportTutorialPanel("market");
        return;
      }
      if (this.market.open && e.key === "Escape") {
        this.market.close();
        return;
      }
      if (e.key === "q" || e.key === "Q") {
        this.refreshQuestLog(true);
        return;
      }
      if (this.questLog.open && e.key === "Escape") {
        this.questLog.close();
        return;
      }
      if (e.key === "j" || e.key === "J") {
        if (getSettings().rsControls && !this.isTutorial) {
          this.refreshQuestLog(true);
          return;
        }
        this.contracts.toggle(this.net.contracts, this.net.rep);
        if (this.contracts.open) this.reportTutorialPanel("contracts");
        return;
      }
      if (this.contracts.open && e.key === "Escape") {
        this.contracts.close();
        return;
      }
      if (e.key === "y" || e.key === "Y") {
        this.cosmetics.toggle(this.net.cosmeticsOwned, this.net.cosmeticEquipped, this.net.credits);
        if (this.cosmetics.open) this.reportTutorialPanel("cosmetics");
        return;
      }
      if (this.cosmetics.open && e.key === "Escape") {
        this.cosmetics.close();
        return;
      }
      if (e.key === "m" || e.key === "M") {
        this.mapPanel.toggle(this.net.discovered, this.net.unlocked, this.zone);
        if (this.mapPanel.open) this.reportTutorialPanel("map");
        return;
      }
      if (this.mapPanel.open && e.key === "Escape") {
        this.mapPanel.close();
        return;
      }
      if (e.key === "h" || e.key === "H") {
        if (this.isTutorial) {
          this.showBubble(this.me.x, this.me.y, "Finish the drill — or SKIP — then use the portal.");
          return;
        }
        const indoors = this.interior || this.isSubway;
        const dest = indoors ? this.fromZone : "safe";
        const from = indoors ? undefined : this.zone;
        this.travelOrganic(dest, from ? { from } : undefined);
        return;
      }
      if (e.key === "v" || e.key === "V") {
        this.openWheel();
        return;
      }
      if ((e.key === "r" || e.key === "R") && !this.net.connected) {
        this.connectStartedAt = Date.now();
        this.net.retryConnect();
        return;
      }
      if (e.key === "Enter" || e.key === "t" || e.key === "T") {
        this.openChat();
      } else if (e.key === "Escape") {
        this.net.disconnect();
        this.scene.start("Select");
      } else {
        const k = parseInt(e.key, 10);
        if (k >= 1 && k <= DISTRICTS.length) {
          const z = "d" + (k - 1);
          if (z !== this.zone) {
            if (!this.zoneUnlocked(z)) {
              this.showTravelDenied(z);
              return;
            }
            this.travelFast(z);
          }
        }
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.net?.disconnect();
      setOnlinePlayer(null);
    });
  }

  /** Resolve a signed wallet identity (if a wallet is connected), then connect. A
   *  connected wallet signs the login message → a durable wallet account; otherwise,
   *  or if the user declines the signature, we connect as a guest keyed by callsign. */
  private async signInThenConnect() {
    const addr = connectedWallet();
    if (addr) {
      const ts = Date.now();
      const signed = await signWalletLogin(loginMessage(addr, ts));
      if (signed) this.net.setAuth({ wallet: addr, sig: signed.signature, ts });
    }
    this.net.connect();
  }

  /** Local wander spawn while the socket connects (tutorial + safe social zones). */
  private soloSpawnPoint(): { x: number; y: number } | null {
    if (this.isTutorial) return TUTORIAL_SPAWN;
    if (this.isCityHub) return CITY_HUB_SPAWN;
    if (this.interior && !this.isSubway) return SAFEHOUSE_SPAWN;
    return null;
  }

  private playerPos(): { x: number; y: number } {
    if (this.drillLocal && !this.net.connected) return this.drillLocal;
    return this.net.pred;
  }

  private chatAreaLabel(): string {
    if (this.isTutorial) return "DRILL YARD";
    if (this.isCityHub) return "METRO CITY";
    if (this.isSubway) return "THE UNDERLINE";
    if (this.interior && INTERIOR_TITLES[this.zone]) return INTERIOR_TITLES[this.zone]!;
    if (this.isBridge) return getBridge(this.bridgeIndex).name;
    if (/^d\d+$/.test(this.zone)) return DISTRICTS[this.districtIndex]?.name?.toUpperCase() ?? this.zone.toUpperCase();
    if (/^w\d+$/.test(this.zone)) return getBridge(parseBridgeZone(this.zone)).name;
    return this.zone.toUpperCase();
  }

  private openChat() {
    this.chatOpen = true;
    this.chatBuffer = "";
    this.chatPanel.setComposing(true, this.chatBuffer);
  }
  private closeChat() {
    this.chatOpen = false;
    this.chatPanel.setComposing(false, "");
  }
  private renderChatInput() {
    this.chatPanel.setComposing(true, this.chatBuffer);
  }
  /** Parse a chat line — plain text is zone chat; /commands drive whisper/party/mute. */
  private submitChat() {
    const s = this.chatBuffer.trim();
    if (!s) return;
    if (s.startsWith("/w ")) {
      const r = s.slice(3);
      const i = r.indexOf(" ");
      if (i > 0) this.net.sendChat("whisper", r.slice(0, i), r.slice(i + 1));
    } else if (s.startsWith("/p ")) this.net.sendChat("party", undefined, s.slice(3));
    else if (s.startsWith("/party ")) this.net.sendParty("invite", s.slice(7).trim());
    else if (s === "/join") this.net.sendParty("accept");
    else if (s === "/leave") this.net.sendParty("leave");
    // ── guild ("Cell") commands ──
    else if (s.startsWith("/g ")) this.net.sendChat("guild", undefined, s.slice(3));
    else if (s.startsWith("/gcreate ")) {
      const r = s.slice(9).trim();
      const i = r.indexOf(" ");
      if (i > 0) this.net.guildAction("create", { tag: r.slice(0, i), name: r.slice(i + 1) });
      else this.net.guildAction("create", { tag: r, name: r });
    } else if (s.startsWith("/ginvite ")) this.net.guildAction("invite", { to: s.slice(9).trim() });
    else if (s === "/gjoin") this.net.guildAction("accept");
    else if (s === "/gleave") this.net.guildAction("leave");
    else if (s === "/ginfo") this.net.guildAction("info");
    else if (s.startsWith("/gpromote ")) this.net.guildAction("promote", { to: s.slice(10).trim() });
    else if (s.startsWith("/gdemote ")) this.net.guildAction("demote", { to: s.slice(9).trim() });
    else if (s.startsWith("/gkick ")) this.net.guildAction("kick", { to: s.slice(7).trim() });
    else if (s.startsWith("/gdep ")) {
      const parts = s.slice(6).trim().split(/\s+/);
      this.net.guildAction("deposit", { credits: parseInt(parts[0], 10) || 0, cores: parseInt(parts[1], 10) || 0 });
    } else if (s.startsWith("/gwd ")) {
      const parts = s.slice(5).trim().split(/\s+/);
      this.net.guildAction("withdraw", { credits: parseInt(parts[0], 10) || 0, cores: parseInt(parts[1], 10) || 0 });
    }
    // auction house — /list <bagSlot 1-based> <price> for a custom ask (quick-list via the K panel)
    else if (s.startsWith("/list ")) {
      const parts = s.slice(6).trim().split(/\s+/);
      const slot = parseInt(parts[0], 10);
      const price = parseInt(parts[1], 10);
      const cur = parts[2]?.toLowerCase() === "metro" ? "metro" : "credits";
      const it = this.net.inventory[slot - 1];
      if (it && price > 0) this.net.marketList(it.id, price, cur);
    }
    else if (s.startsWith("/mute ")) this.net.sendMute(s.slice(6).trim());
    else if (s.startsWith("/trade ")) this.net.tradeRequest(s.slice(7).trim());
    else if (s === "/taccept") this.net.tradeAccept();
    else if (s.startsWith("/offer ")) {
      const parts = s.slice(7).trim().split(/\s+/);
      this.net.tradeOffer(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0);
    } else if (s === "/confirm") this.net.tradeConfirm();
    else if (s === "/tcancel") this.net.tradeCancel();
    else if (s === "/quest talk") this.net.questTalk();
    else if (s.startsWith("/quest accept")) this.net.questAccept();
    else this.net.sendChat("zone", undefined, s);
  }

  private parseZone(z?: string): number {
    const m = z ? /^d(\d+)$/.exec(z) : null;
    const n = m ? parseInt(m[1], 10) : 0;
    return n >= 0 && n < DISTRICTS.length ? n : 0;
  }

  /** Open the panel a safehouse operative fronts (also bound to its proximity E / click). */
  private openService(svc: string) {
    const n = this.net;
    switch (svc) {
      case "forge":
        this.forge.setState(n.inventory, n.equipped, n.credits, n.cores);
        this.forge.toggle();
        break;
      case "vendor":
        this.shop.setRep(n.repTier);
        this.shop.toggle();
        break;
      case "market":
        this.market.toggle(n.marketListings, n.inventory, n.id, n.credits, n.metro);
        break;
      case "contracts":
        this.contracts.toggle(n.contracts, n.rep);
        this.net.questTalk();
        break;
      case "board":
        this.board.toggle(n.achievements, n.id);
        break;
      case "guild":
        n.guildAction("info");
        this.guildPanel.toggle(n.guild, n.id);
        break;
      case "cosmetics":
        this.cosmetics.toggle(n.cosmeticsOwned, n.cosmeticEquipped, n.credits);
        break;
    }
    const panelKind: Record<string, string> = {
      forge: "craft",
      vendor: "vendor",
      market: "market",
      contracts: "contracts",
      board: "board",
      guild: "guild",
      cosmetics: "cosmetics",
    };
    const kind = panelKind[svc];
    if (kind && kind !== "craft") this.reportTutorialPanel(kind);
  }

  /** Drill yard — distinct chambers, authored instructors, deploy portal at the east end. */
  private buildTutorialZone() {
    const mono = "Courier New, monospace";
    const mode =
      (this.registry.get("tutorialMode") as TutorialMode | undefined) ?? getSettings().tutorialMode;

    this.add
      .text(this.worldW / 2, 2 * TILE, "◢ THE DRILL YARD ◣", {
        fontFamily: mono,
        fontSize: "18px",
        color: "#39ff88",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(6)
      .setShadow(0, 0, "#39ff88", 4, true, true);
    this.add
      .text(this.worldW / 2, 2 * TILE + 22, "walk east · talk to each instructor · complete the lesson · portal at the end", {
        fontFamily: mono,
        fontSize: "9px",
        color: "#6b7184",
      })
      .setOrigin(0.5)
      .setDepth(6);

    const chamberG = this.add.graphics().setDepth(5);
    for (const ch of TUTORIAL_CHAMBERS) {
      const lx = tpx(ch.labelTile[0], ch.labelTile[1]).x;
      const ly = ch.labelTile[1] * TILE + 8;
      const hex = "#" + (ch.accent & 0xffffff).toString(16).padStart(6, "0");
      chamberG.lineStyle(1, ch.accent, 0.35).strokeRect(ch.x1 * TILE, ch.y1 * TILE, (ch.x2 - ch.x1 + 1) * TILE, (ch.y2 - ch.y1 + 1) * TILE);
      this.add
        .text(lx, ly, ch.title, { fontFamily: mono, fontSize: "11px", color: hex, fontStyle: "bold" })
        .setOrigin(0.5)
        .setDepth(6);
      this.add
        .text(lx, ly + 14, ch.subtitle, { fontFamily: mono, fontSize: "8px", color: "#6b7184" })
        .setOrigin(0.5)
        .setDepth(6);
    }
    this.tutorialChamberG = this.add.graphics().setDepth(4);

    for (const inst of tutorialInstructorsFor(mode)) {
      this.makeTutorialInstructor(inst);
    }

    const px = TUTORIAL_PORTAL.x;
    const py = TUTORIAL_PORTAL.y;
    const g = this.add.graphics().setDepth(7);
    g.fillStyle(COLORS.neonCyan, 0.12).fillRect(px - 28, py - 40, 56, 80);
    g.lineStyle(2, COLORS.neonCyan, 0.85).strokeRect(px - 28, py - 40, 56, 80);
    this.tutorialPortalGlow = this.add
      .image(px, py, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(COLORS.neonCyan)
      .setDepth(8)
      .setAlpha(0.55);
    this.tweens.add({
      targets: this.tutorialPortalGlow,
      scale: { from: 0.7, to: 1.15 },
      alpha: { from: 0.35, to: 0.75 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
    });
    const portalZone = this.add
      .zone(px - 28, py - 40, 56, 80)
      .setOrigin(0)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    portalZone.on("pointerdown", () => this.enterTutorialPortal(true));
    this.add
      .text(px, py - 52, "▶ LIVE CITY", { fontFamily: mono, fontSize: "11px", color: "#29e7ff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(9);

    this.tutorialPanel = this.add
      .text(VIEW_W / 2, uiDim(76), "", bodyFont(12, {
        color: "#eafdff",
        align: "center",
        backgroundColor: "#0b0716ee",
        padding: { x: uiGap("lg"), y: uiGap("md") },
        wordWrap: { width: uiDim(540) },
      }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1005);

    this.tutorialSkipBtn = this.add
      .text(VIEW_W - 14, 14, "SKIP TUTORIAL", {
        fontFamily: mono,
        fontSize: uiFont(11),
        color: "#ff7a3c",
        fontStyle: "bold",
        backgroundColor: "#1a1020cc",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1006)
      .setInteractive({ useHandCursor: true });
    this.tutorialSkipBtn.on("pointerover", () => this.tutorialSkipBtn.setColor("#ffb347"));
    this.tutorialSkipBtn.on("pointerout", () => this.tutorialSkipBtn.setColor("#ff7a3c"));
    this.tutorialSkipBtn.on("pointerdown", () => this.net.tutorialSkip());
  }

  private reportTutorialPanel(kind: string) {
    if (!this.isTutorial) return;
    if (this.net.tutorialMode === "full") this.net.reportTutorial(kind);
    else this.net.reportTutorial("panel");
  }

  /** Wilderness corridor — trail signage, gate guides, and a mid-path scavenger. */
  private buildBridgeZone(b: BridgeDef) {
    const mono = "Courier New, monospace";
    this.add
      .text(this.worldW / 2, 3 * TILE, `▣ ${b.name}`, { fontFamily: mono, fontSize: "18px", color: "#" + (b.accent & 0xffffff).toString(16).padStart(6, "0"), fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(6)
      .setShadow(0, 0, "#" + (b.accent & 0xffffff).toString(16).padStart(6, "0"), 6, true, true);
    this.add
      .text(this.worldW / 2, 3 * TILE + 22, `${b.subtitle} · fight through · H to surface`, { fontFamily: mono, fontSize: "9px", color: "#9aa3b2" })
      .setOrigin(0.5)
      .setDepth(6);

    const west = bridgeWestTile(b);
    const east = bridgeEastTile(b);
    const low = `d${b.fromDistrict}`;
    const high = `d${b.toDistrict}`;
    const lowName = DISTRICTS[b.fromDistrict]?.name ?? low.toUpperCase();
    const highName = DISTRICTS[b.toDistrict]?.name ?? high.toUpperCase();

    if (!isWall(this.zoneGrid[west[1]]?.[west[0]])) {
      this.makeTransitNpc(low, `◀ ${lowName}`, west, b.accent, hubLook({ color: b.accent, head: "hood", skin: 0x7c4f30, cloak: "coat" }));
    }
    if (!isWall(this.zoneGrid[east[1]]?.[east[0]])) {
      this.makeTransitNpc(high, `▶ ${highName}`, east, b.accent, hubLook({ color: b.accent, head: "cap", skin: 0xc98a5e, cloak: "coat", strap: true }));
    }

    const [gx, gy] = [b.guideTile[0] * 2, b.guideTile[1] * 2];
    const gpx = gx * TILE + TILE / 2;
    const gpy = gy * TILE + TILE / 2;
    this.makeTalkNpc("TRAIL SCRAPPER", hubLook({ color: b.accent, head: "beret", skin: 0xa9794a, hair: "braids", cloak: "coat" }), b.guideLines, gpx, gpy);
  }

  /** Place one authored drill instructor in their chamber. */
  private makeTutorialInstructor(inst: ReturnType<typeof tutorialInstructorsFor>[number]) {
    const pos = tpx(inst.tile[0], inst.tile[1]);
    const key = lookKey(inst.look);
    bakeRemoteLook(this, key, inst.look);
    const hex = "#" + (inst.color & 0xffffff).toString(16).padStart(6, "0");
    this.add
      .image(pos.x, pos.y + 8, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(inst.color)
      .setDepth(8)
      .setScale(0.55)
      .setAlpha(0.5);
    const spr = this.add.sprite(pos.x, pos.y, key, 0).setTint(0xffffff).setDepth(9).setInteractive({ useHandCursor: true });
    const npc: ZoneNpc = {
      kind: "instructor",
      lessonKind: inst.kind,
      name: inst.name,
      tag: inst.tag,
      lines: inst.lines,
      lineIdx: 0,
      x: pos.x,
      y: pos.y,
      color: inst.color,
    };
    spr.on("pointerdown", () => this.talkInstructor(npc));
    this.add
      .text(pos.x, pos.y - 30, inst.name, { fontFamily: "Courier New, monospace", fontSize: "9px", color: "#eafdff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(9);
    this.add
      .text(pos.x, pos.y + 22, `▸ ${inst.tag}`, { fontFamily: "Courier New, monospace", fontSize: "8px", color: hex })
      .setOrigin(0.5)
      .setDepth(9);
    this.npcs.push(npc);
  }

  private talkInstructor(npc: Extract<ZoneNpc, { kind: "instructor" }>) {
    const step = tutorialStepAt(this.net.tutorialStep, this.net.tutorialMode);
    if (step?.kind === npc.lessonKind) {
      const line = npc.lines[npc.lineIdx % npc.lines.length];
      npc.lineIdx++;
      this.showBubble(npc.x, npc.y, `${npc.name}: ${line}`);
      return;
    }
    if (step) {
      const cur = instructorForStep(step.kind, this.net.tutorialMode);
      this.showBubble(
        npc.x,
        npc.y,
        cur
          ? `${npc.name}: finish ${step.title} with ${cur.name} first — then come back.`
          : `${npc.name}: you're on ${step.title}. Head east along the corridor.`,
      );
      return;
    }
    this.showBubble(npc.x, npc.y, `${npc.name}: drills complete. Deploy through the east gate.`);
  }

  /** Deploy through the east portal — E key, click, or server walk-in. */
  private enterTutorialPortal(fromClick = false) {
    if (!this.isTutorial || !this.net) return;
    if (!this.net.connected) {
      this.showBubble(this.me.x, this.me.y, "Connecting to drill server…");
      return;
    }
    if (!this.net.tutorialPortalOpen) {
      this.showBubble(this.me.x, this.me.y, "Finish the drills first — or press SKIP (top-right).");
      return;
    }
    if (!fromClick && !this.nearPortal) return;
    this.net.tutorialGraduate();
  }

  /** Build an authored, talkable citizen at a world position (baked from its PlayerLook).
   *  Pass the npc id so quest-givers can offer their bounty on interact. */
  private makeTalkNpc(name: string, look: PlayerLook, lines: string[], px: number, py: number, npcId?: string) {
    const key = lookKey(look);
    bakeRemoteLook(this, key, look);
    const npc = { kind: "talk" as const, npcId, name, lines, lineIdx: 0, x: px, y: py };
    const spr = this.add.sprite(px, py, key, 0).setTint(0xffffff).setDepth(9).setInteractive({ useHandCursor: true });
    spr.on("pointerdown", () => this.talkNpc(npc));
    const givesBounty = npcId && bountyForNpc(npcId);
    this.add
      .text(px, py - 26, givesBounty ? `${name} ◈` : name, { fontFamily: "Courier New, monospace", fontSize: "9px", color: givesBounty ? "#f7ff3c" : "#9aa3b2" })
      .setOrigin(0.5)
      .setDepth(9);
    this.npcs.push(npc);
  }

  /** Interact with a citizen: a quest-giver offers/updates their bounty, others bark flavour. */
  private talkNpc(npc: { npcId?: string; name: string; lines?: string[]; lineIdx?: number; x: number; y: number }) {
    const b = npc.npcId ? bountyForNpc(npc.npcId) : undefined;
    if (b) {
      const active = this.net.bounty;
      if (active && active.id === b.id) this.showBubble(npc.x, npc.y, `${npc.name}: still on it — ${active.progress}/${active.count}.`);
      else if (active) this.showBubble(npc.x, npc.y, `${npc.name}: finish your current job first.`);
      else {
        this.net.bountyAccept(b.id);
        this.showBubble(npc.x, npc.y, `${npc.name}: ${b.offer}`);
      }
    } else this.sayLine(npc);
  }

  /** Show a floating speech bubble above a world point (auto-fades). */
  private showBubble(x: number, y: number, text: string) {
    if (!this.speechBubble) return;
    this.speechBubble.setText(text).setPosition(x, y - 34).setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.speechBubble);
    this.tweens.add({ targets: this.speechBubble, alpha: 0, delay: 3200, duration: 700, onComplete: () => this.speechBubble?.setVisible(false) });
  }

  /** Transit operative at a district edge — organic deploy to the next zone. */
  private makeTransitNpc(dest: string, label: string, tile: [number, number], color: number, look: PlayerLook) {
    const px = tile[0] * TILE + TILE / 2;
    const py = tile[1] * TILE + TILE / 2;
    const key = lookKey(look);
    bakeRemoteLook(this, key, look);
    const g = this.add.graphics().setDepth(8);
    g.fillStyle(color, 0.14).fillRect(px - 20, py - 28, 40, 56);
    g.lineStyle(2, color, 0.9).strokeRect(px - 20, py - 28, 40, 56);
    this.add.image(px, py, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(color).setDepth(8).setScale(0.55).setAlpha(0.45);
    const spr = this.add.sprite(px, py, key, 0).setTint(0xffffff).setDepth(9).setInteractive({ useHandCursor: true });
    spr.on("pointerdown", () => this.enterZone(dest));
    this.add
      .text(px, py - 40, "TRANSIT", { fontFamily: "Courier New, monospace", fontSize: "9px", color: "#cfe8ff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(9);
    this.add
      .text(px, py + 22, label, { fontFamily: "Courier New, monospace", fontSize: "9px", color: "#" + (color & 0xffffff).toString(16).padStart(6, "0"), fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(9);
    this.npcs.push({ kind: "transit", dest, name: label, label, color, x: px, y: py });
  }

  /** A door into a building interior — a glowing portal you enter with E (or click). */
  private makeDoor(door: { dest: string; label: string; tile: [number, number]; color: number }) {
    const px = door.tile[0] * TILE + TILE / 2;
    const py = door.tile[1] * TILE + TILE / 2;
    const g = this.add.graphics().setDepth(8);
    g.fillStyle(door.color, 0.16).fillRect(px - 18, py - 24, 36, 48);
    g.lineStyle(2, door.color, 0.9).strokeRect(px - 18, py - 24, 36, 48);
    this.add.image(px, py, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(door.color).setDepth(8).setScale(0.5).setAlpha(0.4);
    this.add
      .text(px, py - 36, door.label, { fontFamily: "Courier New, monospace", fontSize: "10px", color: "#" + (door.color & 0xffffff).toString(16).padStart(6, "0"), fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(9);
    const z = this.add.zone(px - 18, py - 24, 36, 48).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(9);
    z.on("pointerdown", () => this.enterZone(door.dest));
    this.npcs.push({ kind: "door", dest: door.dest, name: door.label, x: px, y: py });
  }

  /** Travel into another zone (door/interior/transit) — organic arrival unlocks fast travel. */
  private enterZone(dest: string) {
    if (dest === TUTORIAL_ZONE) return;
    const r = grantSkillXp(this.rsSkills, "exploration", 22);
    this.rsSkillsPanel.setSkills(this.rsSkills);
    if (r.leveled) this.pops?.popHeal(this.me.x, this.me.y - 36, `Exploration ${r.level}!`);
    if (dest === "d0" && this.zone === "safe") {
      this.deployOrganic(dest);
      return;
    }
    this.travelOrganic(dest, { from: this.zone });
  }

  private fastTravel(zone: string) {
    this.registry.set("pendingMapDest", null);
    if (zone === TUTORIAL_ZONE || zone === this.zone) return;
    if (!this.zoneUnlocked(zone)) {
      this.showTravelDenied(zone);
      return;
    }
    this.travelFast(zone);
  }

  /** Walk/deploy — unlocks fast travel to this zone. */
  private travelOrganic(zone: string, extra?: { from?: string; tutorialMode?: TutorialMode }) {
    this.registry.set("fastTravel", false);
    this.travelTo(zone, extra);
  }

  /** Map / number-key teleport — requires prior organic visit. */
  private travelFast(zone: string, extra?: { from?: string; tutorialMode?: TutorialMode }) {
    this.registry.set("fastTravel", true);
    this.travelTo(zone, extra);
  }

  /** First deployment into combat — gated on accepting THE WAKE. */
  private deployOrganic(zone: string) {
    if (!this.net.campaignQuest) {
      this.showBubble(this.me.x, this.me.y, "Visit THE FIXER (J) and accept THE WAKE before deploying.");
      return;
    }
    this.travelOrganic(zone, this.zone === "safe" ? { from: this.zone } : undefined);
  }

  /** Premium zone handoff — fade/deploy instead of a hard scene.restart. */
  private travelTo(zone: string, extra?: { from?: string; tutorialMode?: TutorialMode }) {
    const destBridge = parseBridgeZone(zone);
    const destNamed = !!INTERIOR_TITLES[zone] || zone === "subway" || zone === TUTORIAL_ZONE || destBridge >= 0;
    const di = destNamed && destBridge < 0 ? 0 : destBridge >= 0 ? destBridge : this.parseZone(zone);
    const accent =
      zone === TUTORIAL_ZONE
        ? 0x29e7ff
        : zone === "subway"
          ? 0xff3b6b
          : zone === "safe"
            ? 0x39ff88
            : destBridge >= 0
              ? getBridge(destBridge).accent
              : (DISTRICTS[di]?.accent ?? 0x29e7ff);
    const style = zone === "safe" || this.interior ? "fade" : "deploy";
    transitionTo(this, "Online", { zone, ...extra }, { style, accent, onMid: () => this.net?.disconnect() });
  }

  private zoneUnlocked(zone: string): boolean {
    return zone === this.zone || zone === "safe" || this.net.unlocked.includes(zone);
  }

  /** Client-side melee arc — server still resolves hits. */
  private drawMeleeSlash(angle: number, prim: Extract<PrimaryDef, { kind: "melee" }>) {
    const px = this.net.pred.x;
    const py = this.net.pred.y;
    const halfArc = Phaser.Math.DegToRad(prim.arcDeg / 2);
    const range = prim.range;
    const weapon = this.net.equipped.find((it) => it.slot === "weapon");
    const tint = weapon?.weaponId ? (getWeapon(weapon.weaponId)?.tint ?? 0x29e7ff) : 0x29e7ff;
    const g = this.add.graphics().setDepth(11);
    g.lineStyle(5, tint, 0.85);
    g.beginPath();
    g.arc(px, py, range, angle - halfArc, angle + halfArc);
    g.strokePath();
    g.lineStyle(2, 0xffffff, 0.9);
    g.beginPath();
    g.arc(px, py, range * 0.9, angle - halfArc * 0.92, angle + halfArc * 0.92);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 140, onComplete: () => g.destroy() });
  }

  private showTravelDenied(zone: string) {
    const bi = parseBridgeZone(zone);
    const di = bi >= 0 ? -1 : this.parseZone(zone);
    const label = bi >= 0 ? getBridge(bi).name : DISTRICTS[di]?.name ?? INTERIOR_TITLES[zone] ?? zone.toUpperCase();
    this.travelToast?.destroy();
    this.travelToast = this.add
      .text(this.scale.width / 2, 108, `◇ ${label} — reach it on foot first (deploy gate / transit)`, {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(12),
        color: "#ff7a3c",
        fontStyle: "bold",
        align: "center",
        backgroundColor: "#0b0716dd",
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1007);
    this.tweens.add({ targets: this.travelToast, alpha: 0, delay: 2200, duration: 600, onComplete: () => this.travelToast?.destroy() });
  }

  /** Find the nearest gate / door in the current zone that advances toward `dest`. */
  private walkTargetForZone(dest: string): ZoneNpc | null {
    if (dest === this.zone) return null;

    if (this.isCityHub) {
      const door = CITY_HUB_DOORS.find((d) => d.dest === dest);
      if (door) return this.npcs.find((n) => (n.kind === "door" || n.kind === "transit") && n.dest === dest) ?? null;
      if (dest.startsWith("d")) return this.npcs.find((n) => (n.kind === "door" || n.kind === "transit") && n.dest === "d0") ?? null;
    }

    if (dest === "safe") return null;

    const destMatch = dest.match(/^d(\d+)$/);
    if (destMatch && !this.interior && !this.isCityHub && !this.isSubway) {
      const destDi = parseInt(destMatch[1], 10);
      if (this.isBridge) {
        const b = getBridge(this.bridgeIndex);
        if (destDi === b.fromDistrict) {
          return this.npcs.find((n) => n.kind === "transit" && n.dest === `d${b.fromDistrict}`) ?? null;
        }
        if (destDi === b.toDistrict) {
          return this.npcs.find((n) => n.kind === "transit" && n.dest === `d${b.toDistrict}`) ?? null;
        }
        if (destDi > b.toDistrict) {
          return this.npcs.find((n) => n.kind === "transit" && n.dest === `d${b.toDistrict}`) ?? null;
        }
        if (destDi < b.fromDistrict) {
          return this.npcs.find((n) => n.kind === "transit" && n.dest === `d${b.fromDistrict}`) ?? null;
        }
        return null;
      }
      if (destDi === this.districtIndex) return null;
      if (destDi > this.districtIndex) {
        const bridge = `w${this.districtIndex}`;
        return this.npcs.find((n) => n.kind === "transit" && n.dest === bridge) ?? null;
      }
      if (destDi < this.districtIndex) {
        const bridge = `w${destDi}`;
        return this.npcs.find((n) => n.kind === "transit" && n.dest === bridge) ?? null;
      }
    }

    const destBridge = parseBridgeZone(dest);
    if (destBridge >= 0 && /^d\d+$/.test(this.zone)) {
      const here = parseDistrictZone(this.zone);
      if (destBridge === here) return this.npcs.find((n) => n.kind === "transit" && n.dest === dest) ?? null;
      if (destBridge === here - 1) return this.npcs.find((n) => n.kind === "transit" && n.dest === dest) ?? null;
    }

    return null;
  }

  /** RS world map — close panel and path to the deploy gate / transit that leads toward `dest`. */
  private walkToZoneFromMap(dest: string) {
    if (dest === this.zone) {
      this.registry.set("pendingMapDest", null);
      this.rsExamine(`You arrive at ${INTERIOR_TITLES[dest] ?? DISTRICTS[this.parseZone(dest)]?.name ?? dest}.`);
      return;
    }

    this.registry.set("pendingMapDest", dest);

    if (dest === "safe" && !this.isCityHub) {
      this.rsExamine("Press H to surface to Metro City — route will resume.");
      return;
    }

    const npc = this.walkTargetForZone(dest);
    if (!npc) {
      if (this.interior && !this.isCityHub) {
        this.rsExamine("Press H to return to Metro City — route will resume.");
        return;
      }
      this.registry.set("pendingMapDest", null);
      this.showTravelDenied(dest);
      return;
    }

    this.attackTargetId = null;
    this.pendingInteract = npc;
    this.clickMove.setDestination(npc.x, npc.y, this.zoneGrid, this.net.pred.x, this.net.pred.y);
    const label = DISTRICTS[this.parseZone(dest)]?.name ?? INTERIOR_TITLES[dest] ?? dest.toUpperCase();
    if (dest.startsWith("d") && this.isCityHub && dest !== "d0") {
      this.rsExamine(`Walking to deploy gate — transit onward to ${label}.`);
    } else {
      this.rsExamine(`Walking to ${npc.name ?? label}…`);
    }
  }

  private rsExamine(text: string) {
    this.rsGameMessage?.show(text);
  }

  private syncRsChrome() {
    if (!getSettings().rsControls || this.isTutorial) return;
    const key = this.inv?.open
      ? "inv"
      : this.rsSkillsPanel?.open
        ? "skills"
        : this.mapPanel?.open
          ? "map"
          : this.market?.open
            ? "market"
            : this.questLog?.open
              ? "quests"
              : null;
    this.rsActionBar?.setActive(key);
  }

  private initCombatTracking() {
    this.prevHp = this.net.hp;
    this.prevCredits = this.net.credits;
    this.prevCores = this.net.cores;
    this.prevLevel = this.net.level;
    this.prevEnemyHp.clear();
    for (const [id, e] of this.net.enemies) {
      this.prevEnemyHp.set(id, { hp: e.hp, x: e.x, y: e.y, boss: e.boss });
    }
  }

  private killStreakLabel(): string | null {
    if (this.killStreak < 2) return null;
    if (this.killStreak === 2) return t("combat.double");
    if (this.killStreak === 3) return t("combat.triple");
    if (this.killStreak === 4) return t("combat.rampage");
    return t("combat.annihilation");
  }

  /** React to server state deltas — shake, SFX, floating damage numbers, particles. */
  private processCombatFeedback() {
    if (!this.net.connected) return;
    const n = this.net;

    if (n.hp < this.prevHp && !n.dead) {
      const dmg = this.prevHp - n.hp;
      juiceShake(this, 120, 0.005);
      juiceFlash(this, 140, 180, 0, 40);
      if (dmg >= 18) juiceHitStop(this, 42);
      this.synth?.hit();
      playCombatPose(this.me, "hit");
      this.particles?.spark(this.me.x, this.me.y, 0xff5a6b, 1.4);
      this.pops?.pop(this.me.x, this.me.y - 20, `-${Math.round(dmg)}`, "#ff5a6b");
    } else if (n.dead && this.prevHp > 0) {
      juiceShake(this, 200, 0.008);
      juiceFlash(this, 280, 200, 0, 60);
      juiceHitStop(this, 72);
      playCombatPose(this.me, "dead");
      this.particles?.burst(this.me.x, this.me.y, 1.2);
    }
    this.prevHp = n.hp;

    if (n.credits > this.prevCredits || n.cores > this.prevCores) {
      this.synth?.pickup();
      if (n.cores > this.prevCores) this.pops?.popPickup(this.me.x, this.me.y - 16, `◈ +${n.cores - this.prevCores}`);
      else if (n.credits > this.prevCredits) this.pops?.popPickup(this.me.x, this.me.y - 16, `₵ +${n.credits - this.prevCredits}`);
      this.particles?.spark(this.me.x, this.me.y - 8, 0xf7ff3c, 1.2);
      juiceShake(this, 60, 0.002);
    }
    this.prevCredits = n.credits;
    this.prevCores = n.cores;

    if (n.level > this.prevLevel) {
      this.synth?.levelUp();
      juiceFlash(this, 220, 60, 200, 80);
      juiceZoomPunch(this, 0.03, 140);
      this.pops?.popHeal(this.me.x, this.me.y - 24, `LV ${n.level}`);
    }
    this.prevLevel = n.level;

    const live = new Set<number>();
    for (const [id, e] of n.enemies) {
      live.add(id);
      const prev = this.prevEnemyHp.get(id);
      if (prev && e.hp < prev.hp) {
        const dmg = prev.hp - e.hp;
        const crit = dmg >= (e.boss ? 40 : 22);
        if (crit) {
          this.synth?.crit();
          juiceHitStop(this, e.boss ? 56 : 36);
          juiceZoomPunch(this, e.boss ? 0.045 : 0.03, 95);
        } else {
          this.synth?.hit();
        }
        juiceShake(this, e.boss ? 90 : 50, e.boss ? 0.004 : 0.002);
        const tint = ENEMY_KIND_TINT[e.kind] ?? 0xff8a9a;
        this.particles?.spark(e.x, e.y, tint, e.boss ? 2 : crit ? 1.8 : 1.5);
        const es = this.enemySprites.get(id);
        if (es) playCombatPose(es, "hit");
        this.pops?.pop(e.x, e.y - 24, `-${Math.round(dmg)}`, e.boss ? "#f7ff3c" : crit ? "#ffffff" : "#ff8a9a");
        if (crit) juiceNeonPulse(this, e.boss ? 0.22 : 0.14, 130);
        if (e.boss) juiceNeonPulse(this, 0.18, 160);
      }
      this.prevEnemyHp.set(id, { hp: e.hp, x: e.x, y: e.y, boss: e.boss });
    }
    for (const [id, prev] of this.prevEnemyHp) {
      if (!live.has(id)) {
        this.killStreak++;
        this.killStreakExpiresAt = this.time.now + OnlineScene.KILL_STREAK_MS;
        this.synth?.kill();
        juiceShake(this, prev.boss ? 220 : 100, prev.boss ? 0.007 : 0.004);
        this.particles?.burst(prev.x, prev.y, prev.boss ? 1.35 : 0.95);
        if (prev.boss) {
          juiceNeonPulse(this, 0.35, 420);
          juiceFlash(this, 260, 40, 120, 60);
          juiceHitStop(this, 88);
          juiceZoomPunch(this, 0.05, 200);
        } else {
          juiceZoomPunch(this, 0.025 + Math.min(0.02, this.killStreak * 0.004), 105);
          if (this.killStreak >= 2) juiceHitStop(this, 22 + Math.min(18, this.killStreak * 4));
        }
        const streak = this.killStreakLabel();
        if (streak) {
          this.pops?.popCrit(prev.x, prev.y - 36, streak);
          juiceNeonPulse(this, 0.12 + Math.min(0.22, this.killStreak * 0.05), 140);
        }
        this.pops?.popCrit(prev.x, prev.y - 20, prev.boss ? t("combat.bossDown") : t("combat.purged"));
        const r = grantSkillXp(this.rsSkills, "combat", prev.boss ? 120 : 35);
        this.rsSkillsPanel.setSkills(this.rsSkills);
        if (r.leveled) this.pops?.popHeal(this.me.x, this.me.y - 36, `Combat ${r.level}!`);
      }
    }
    for (const id of [...this.prevEnemyHp.keys()]) {
      if (!live.has(id)) this.prevEnemyHp.delete(id);
    }

  }

  private muzzleAt(angle: number, dist = 22): { x: number; y: number } {
    return {
      x: this.net.pred.x + Math.cos(angle) * dist,
      y: this.net.pred.y + Math.sin(angle) * dist,
    };
  }

  /** Speak an authored citizen's next flavour line in a floating bubble (cycles their lines). */
  private sayLine(npc: { name: string; lines?: string[]; lineIdx?: number; x: number; y: number }) {
    if (!npc.lines || npc.lines.length === 0) return;
    const line = npc.lines[(npc.lineIdx ?? 0) % npc.lines.length];
    npc.lineIdx = (npc.lineIdx ?? 0) + 1;
    this.showBubble(npc.x, npc.y, `${npc.name}: ${line}`);
  }

  /** Retint the LOCAL avatar to the equipped transmog (remotes get it via the relayed look). */
  private applyLocalCosmetic() {
    if (!this.me || !this.baseLook) return;
    const id = this.net.cosmeticEquipped;
    if (id) {
      const merged = applyCosmetic(this.baseLook, id);
      if (merged) {
        const k = lookKey(merged);
        bakeRemoteLook(this, k, merged);
        this.me.setTexture(k, 0).setTint(0xffffff);
      }
    } else {
      this.me.setTexture(PLAYER_CUSTOM_KEY, 0).setTint(0xffffff);
    }
  }

  update(_t: number, dt: number) {
    if (!this.net) return;
    const k = this.keys;
    const dn = (key?: Phaser.Input.Keyboard.Key) => (!this.chatOpen && key?.isDown ? 1 : 0);
    let mx = Math.sign(dn(k.D) + dn(k.RIGHT) - dn(k.A) - dn(k.LEFT));
    let my = Math.sign(dn(k.S) + dn(k.DOWN) - dn(k.W) - dn(k.UP));
    const pad = gamepadIntent(this);
    if (pad.active) {
      mx = Math.sign(pad.mx);
      my = Math.sign(pad.my);
    }
    const rs = getSettings().rsControls && !this.isTutorial;
    if (rs) {
      if (mx !== 0 || my !== 0) {
        this.clickMove.cancel();
        this.attackTargetId = null;
        this.pendingInteract = null;
      } else {
        this.tickRsMovement();
        const pos = this.playerPos();
        const ci = this.clickMove.intent(pos.x, pos.y);
        mx = ci.mx;
        my = ci.my;
        this.clickMove.tick(dt);
      }
      if (!this.blockRsInput()) {
        const wp = this.cameras.main.getWorldPoint(this.input.activePointer.x, this.input.activePointer.y);
        let hint: TileCursorHint = "walk";
        if (this.pickEnemyAt(wp.x, wp.y) !== null) hint = "enemy";
        else if (this.pickNpcAt(wp.x, wp.y)) hint = "npc";
        this.tileCursor.update(wp.x, wp.y, this.cameras.main, hint);
      } else {
        this.tileCursor.hide();
      }
    }
    if (!this.net.connected) {
      this.connectDotTimer += dt;
      if (this.connectDotTimer >= 420) {
        this.connectDotTimer = 0;
        this.connectDots = (this.connectDots + 1) % 4;
      }
    }

    this.net.setIntent(mx, my);
    this.net.update(dt);
    if (this.killStreak > 0 && this.time.now > this.killStreakExpiresAt) this.killStreak = 0;
    if (
      !this.net.dead &&
      !this.chatOpen &&
      (mx !== 0 || my !== 0) &&
      (this.net.connected || !!this.drillLocal)
    ) {
      this.footstepAcc += dt;
      if (this.footstepAcc >= 320) {
        this.footstepAcc = 0;
        this.synth?.footstep();
      }
    } else {
      this.footstepAcc = 0;
    }
    this.processCombatFeedback();
    this.processEmotes();
    this.processChatBubbles();
    if (this.net.connected) {
      const combat = Math.min(1, this.net.enemies.size / 12);
      if (this.synth) this.synth.setIntensity(combat);
      MusicDirector.for(this)?.setCombatIntensity(combat, this);
    }
    if (this.neon && this.net.connected) {
      const combat = Math.min(1, this.net.enemies.size / 14);
      this.neon.heat = 0.05 + combat * 0.42;
    }
    this.atmosphere?.update(this.time.now, dt, Math.min(1, this.net.enemies.size / 16));
    this.updateBossLocator();
    if (this.shop.open) this.shop.setCredits(this.net.credits);
    if (this.forge.open) this.forge.setWallet(this.net.credits, this.net.cores);
    if (this.market.open) this.market.refreshBalances(this.net.credits, this.net.metro);

    if (this.drillLocal && !this.net.connected) {
      this.drillLocalAcc += dt;
      while (this.drillLocalAcc >= NET_TICK_MS) {
        this.drillLocalAcc -= NET_TICK_MS;
        stepMove(this.drillLocal, { mx, my }, this.zoneGrid, NET_TICK_MS);
      }
      this.me.setPosition(this.drillLocal.x, this.drillLocal.y);
      const moving = mx !== 0 || my !== 0;
      if (moving) this.meDir.set(mx, my);
      driveChar(this.me, this.meDir.x, this.meDir.y, moving);
    } else if (this.net.connected) {
      this.me.setPosition(this.net.pred.x, this.net.pred.y);
      const moving = mx !== 0 || my !== 0;
      if (moving) this.meDir.set(mx, my);
      driveChar(this.me, this.meDir.x, this.meDir.y, moving);
    }

    // remote players (interpolated by NetClient) — each rendered with ITS OWN
    // customization (baked from the look the server relays; colour as a tint).
    for (const [id, r] of this.net.remotes) {
      let s = this.remoteSprites.get(id);
      if (!s) {
        s = this.add.sprite(r.x, r.y, PLAYER_KEY, 0).setDepth(9);
        this.remoteSprites.set(id, s);
        this.remoteLabels.set(
          id,
          this.add
            .text(r.x, r.y - 22, id, { fontFamily: "Courier New, monospace", fontSize: "9px", color: "#ff79c6" })
            .setOrigin(0.5)
            .setDepth(9),
        );
      }
      // swap to the remote's baked look-texture when it first arrives / changes (cached by shape)
      const key = r.look ? lookKey(r.look) : PLAYER_KEY;
      if (s.getData("lk") !== key) {
        if (r.look) bakeRemoteLook(this, key, r.look);
        s.setTexture(key, 0);
        s.setData("lk", key);
        const col = r.look ? r.look.color : 0xff79c6;
        this.remoteLabels.get(id)?.setColor("#" + (col & 0xffffff).toString(16).padStart(6, "0"));
      }
      s.setTint(r.look ? 0xffffff : 0xff79c6); // look is baked in colour; only the fallback tints
      const rdx = r.tx - r.x;
      const rdy = r.ty - r.y;
      driveChar(s, rdx, rdy, rdx * rdx + rdy * rdy > 0.4); // walk from their heading
      s.setPosition(r.x, r.y).setVisible(!r.dead).setAlpha(r.dead ? 0.25 : 1);
      this.remoteLabels.get(id)?.setPosition(r.x, r.y - 22).setVisible(!r.dead);
    }
    for (const [id, s] of this.remoteSprites) {
      if (!this.net.remotes.has(id)) {
        s.destroy();
        this.remoteSprites.delete(id);
        this.remoteLabels.get(id)?.destroy();
        this.remoteLabels.delete(id);
      }
    }

    // FIRE — RS mode auto-attacks locked target; action mode fires while held.
    const ptr = this.input.activePointer;
    const rsFire = rs && this.attackTargetId !== null;
    const actionFire = !rs && ptr.isDown;
    let aim: number | null = null;
    if (rsFire) {
      const tgt = this.net.enemies.get(this.attackTargetId!);
      if (!tgt) this.attackTargetId = null;
      else {
        const dist = Math.hypot(tgt.x - this.net.pred.x, tgt.y - this.net.pred.y);
        if (dist <= this.attackRange) aim = Math.atan2(tgt.y - this.net.pred.y, tgt.x - this.net.pred.x);
      }
    } else if (actionFire) {
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      aim = Math.atan2(wp.y - this.net.pred.y, wp.x - this.net.pred.x);
    }
    if (
      aim !== null &&
      this.net.connected &&
      !this.net.dead &&
      !this.chatOpen &&
      !this.emoteWheelOpen &&
      !this.options?.isOpen
    ) {
      this.net.fire(aim);
      const now = this.time.now;
      const weapon = this.net.equipped.find((it) => it.slot === "weapon");
      const prim = weapon?.weaponId ? getWeapon(weapon.weaponId)?.primary : undefined;
      const melee = prim?.kind === "melee";
      const fireMs = prim?.fireRateMs ?? 280;
      if (melee && now - this.lastMeleeSlashAt > fireMs * 0.85) {
        this.lastMeleeSlashAt = now;
        this.drawMeleeSlash(aim, prim as Extract<PrimaryDef, { kind: "melee" }>);
        juiceShake(this, 70, 0.004);
        juiceZoomPunch(this, 0.028, 90);
        playCombatPose(this.me, "attack", this.color);
        const m = this.muzzleAt(aim, 18);
        this.particles?.spark(m.x, m.y, this.color, 1.8);
      } else if (now - this.lastShootAt > 120) {
        playCombatPose(this.me, "attack", this.color);
        this.lastShootAt = now;
        this.synth?.shoot();
        const m = this.muzzleAt(aim);
        const tint = weapon?.weaponId ? (getWeapon(weapon.weaponId)?.tint ?? this.color) : this.color;
        this.particles?.muzzle(m.x, m.y, aim, 0.85);
        this.particles?.flash(m.x, m.y, tint, 0.42);
        juiceShake(this, 40, 0.0018);
        juiceZoomPunch(this, 0.014, 75);
      }
      if (mx === 0 && my === 0) {
        this.meDir.set(Math.cos(aim), Math.sin(aim));
        driveChar(this.me, this.meDir.x, this.meDir.y, false);
      }
    }
    this.me.setVisible(!this.net.dead && (this.net.connected || !!this.drillLocal));
    this.meLight.update(this.me.x, this.me.y, this.time.now);
    this.meLight.setVisible(this.me.visible);

    this.minimapRefreshAcc += dt;
    if (this.zoneMinimap && !this.isTutorial && this.minimapRefreshAcc >= OnlineScene.MINIMAP_REFRESH_MS) {
      this.minimapRefreshAcc = 0;
      const blips: Array<{ x: number; y: number; color: number; r?: number }> = [];
      for (const e of this.net.enemies.values()) {
        blips.push({ x: e.x, y: e.y, color: e.boss ? 0xf7ff3c : 0xff5a6b, r: e.boss ? uiDim(3.2) : uiDim(2) });
      }
      for (const n of this.npcs) blips.push({ x: n.x, y: n.y, color: 0x00e5ff, r: uiDim(1.8) });
      const pos = this.playerPos();
      this.zoneMinimap.render({ x: pos.x, y: pos.y, color: this.color }, blips, this.clickMove.destination);
    }
    if (this.questLog.open) this.refreshQuestLog();
    this.syncRsChrome();

    // PvP arena state — warn on enter/exit; the SERVER enforces the actual damage.
    const inPvp = this.net.connected && !this.interior && !this.isSubway && inPvpZone(this.net.pred.x, this.net.pred.y, this.pvpZones);
    this.pvpHud.update({
      inZone: inPvp,
      inArena: this.net.pvpInArena,
      escrow: this.net.pvpEscrow,
    });

    // tutorial drill — lesson panel, chamber highlight, instructor + portal prompts
    if (this.isTutorial && this.tutorialPanel) {
      const step = tutorialStepAt(this.net.tutorialStep, this.net.tutorialMode);
      const count = step?.count ?? 1;
      const prog = this.net.tutorialProgress;
      const inst = step ? instructorForStep(step.kind, this.net.tutorialMode) : undefined;
      const chamber = step ? chamberForKind(step.kind) : undefined;
      const stepLine = step
        ? `◢ ${step.title}${inst ? `  ·  ${inst.name}` : ""}  (${Math.min(prog, count)}/${count})`
        : "◢ DRILL COMPLETE";
      const body = [
        stepLine,
        chamber ? `📍 ${chamber.title.replace("◢ ", "")} — ${chamber.subtitle}` : "",
        this.net.tutorialTeach || "",
        `▸ ${this.net.tutorialHint || ""}`,
      ]
        .filter(Boolean)
        .join("\n");
      this.tutorialPanel.setText(body);

      if (this.tutorialChamberG) {
        this.tutorialChamberG.clear();
        if (chamber) {
          const accent = chamberAccentForKind(step!.kind);
          this.tutorialChamberG
            .fillStyle(accent, 0.1)
            .fillRect(chamber.x1 * TILE, chamber.y1 * TILE, (chamber.x2 - chamber.x1 + 1) * TILE, (chamber.y2 - chamber.y1 + 1) * TILE);
          this.tutorialChamberG.lineStyle(2, accent, 0.55).strokeRect(
            chamber.x1 * TILE + 2,
            chamber.y1 * TILE + 2,
            (chamber.x2 - chamber.x1 + 1) * TILE - 4,
            (chamber.y2 - chamber.y1 + 1) * TILE - 4,
          );
        }
      }

      const mx = this.me.x;
      const my = this.me.y;
      const pr = TUTORIAL_PORTAL_RADIUS;
      const d2 = (mx - TUTORIAL_PORTAL.x) ** 2 + (my - TUTORIAL_PORTAL.y) ** 2;
      this.nearPortal = d2 < pr * pr;

      let near: ZoneNpc | null = null;
      let best = 56 * 56;
      for (const npc of this.npcs) {
        if (npc.kind !== "instructor") continue;
        const dist = (npc.x - mx) ** 2 + (npc.y - my) ** 2;
        if (dist < best) {
          best = dist;
          near = npc;
        }
      }
      this.nearNpc = near;

      if (this.interactPrompt) {
        let msg = "";
        if (this.net.tutorialPortalOpen && this.nearPortal) {
          msg = "▸ E — enter DEPLOY GATE (one way · live city)";
        } else if (near && step && near.kind === "instructor" && near.lessonKind === step.kind) {
          msg = `▸ E — talk to ${near.name}`;
        } else if (inst && step?.kind !== "portal") {
          msg = `▸ head to ${chamber?.title.replace("◢ ", "") ?? "the next chamber"} · find ${inst.name}`;
        } else if (this.net.tutorialPortalOpen) {
          msg = "▸ walk east to the DEPLOY GATE";
        }
        this.interactPrompt.setText(msg).setVisible(!!msg);
      }
      this.questText.setVisible(false);
      this.dailyText.setVisible(false);
      this.bountyText.setVisible(false);
    }

    // NPCs (hub operatives + authored citizens) — surface the nearest one's interaction prompt
    if (this.interactPrompt && this.npcs.length && !this.isTutorial) {
      let near: (typeof this.npcs)[number] | null = null;
      let best = 60 * 60; // interact radius²
      const pos = this.playerPos();
      for (const npc of this.npcs) {
        const d = (npc.x - pos.x) ** 2 + (npc.y - pos.y) ** 2;
        if (d < best) {
          best = d;
          near = npc;
        }
      }
      this.nearNpc = near;
      const label = near
        ? near.kind === "service"
          ? near.name
          : near.kind === "door"
            ? `enter ${near.name}`
            : near.kind === "transit"
              ? near.label
              : `talk to ${near.name}`
        : "";
      this.interactPrompt.setText(near ? `▸ E — ${label}` : "").setVisible(!!near);
    }

    // enemies (server-simulated) — tinted by HSS archetype (matches singleplayer reads)
    for (const [id, e] of this.net.enemies) {
      let s = this.enemySprites.get(id);
      if (!s) {
        s = this.add.sprite(e.x, e.y, COP_KEY, 0).setDepth(8);
        this.enemySprites.set(id, s);
        this.maybeEnemyBark(e.x, e.y, e.kind); // deploy bark on first appearance
      }
      if (e.boss) {
        if (!s.getData("boss")) {
          s.setData("boss", true);
          s.setScale(2.6).setDepth(9).setTint(e.tint ?? COLORS.enemy); // a looming, named commander
        }
        this.updateBossOverlay(id, e);
      } else if (s.getData("kind") !== e.kind) {
        s.setTint(ENEMY_KIND_TINT[e.kind] ?? COLORS.enemy);
        s.setData("kind", e.kind);
      }
      const edx = e.tx - e.x;
      const edy = e.ty - e.y;
      driveChar(s, edx, edy, edx * edx + edy * edy > 0.4); // walk from their heading
      s.setPosition(e.x, e.y);
    }
    for (const [id, s] of this.enemySprites)
      if (!this.net.enemies.has(id)) {
        s.destroy();
        this.enemySprites.delete(id);
        const o = this.bossOverlays.get(id); // a slain boss leaves the snapshot → drop its overlay
        if (o) {
          o.name.destroy();
          o.bar.destroy();
          this.bossOverlays.delete(id);
        }
      }

    // boss AoE telegraphs (raid mechanics) — a ring that fills as it nears detonation
    this.hazardG.clear();
    for (const hz of this.net.hazards) {
      const danger = hz.frac;
      const col = danger > 0.72 ? 0xff2b2b : 0xff7a3c;
      this.hazardG.fillStyle(col, 0.1 + 0.32 * danger);
      this.hazardG.fillCircle(hz.x, hz.y, hz.r * (0.22 + 0.78 * danger)); // inner fill rushes outward
      this.hazardG.lineStyle(3, col, 0.85);
      this.hazardG.strokeCircle(hz.x, hz.y, hz.r);
    }

    // projectiles (server-simulated)
    for (const [id, sh] of this.net.shots) {
      let s = this.shotSprites.get(id);
      if (!s) {
        s = this.add
          .image(sh.x, sh.y, BULLET_KEY)
          .setDepth(9)
          .setTint(sh.team === 0 ? COLORS.bullet : COLORS.enemy);
        this.shotSprites.set(id, s);
      }
      s.setPosition(sh.x, sh.y);
    }
    for (const [id, s] of this.shotSprites)
      if (!this.net.shots.has(id)) {
        s.destroy();
        this.shotSprites.delete(id);
      }

    // pickups (server-spawned loot — magnet toward player, pulse, burst on collect)
    const px = this.net.pred.x;
    const py = this.net.pred.y;
    const magnetR = OnlineScene.PICKUP_MAGNET;
    const magnetR2 = magnetR * magnetR;
    const collectR2 = 120 * 120;
    for (const [id, pu] of this.net.pickups) {
      let s = this.pickupSprites.get(id);
      if (!s) {
        const col = pu.kind === PICKUP_CORE ? COLORS.neonCyan : COLORS.neonYellow;
        s = this.add
          .image(pu.x, pu.y, GLOW_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(col)
          .setDepth(7);
        s.setData("kind", pu.kind);
        this.pickupSprites.set(id, s);
      }
      let vx = pu.x;
      let vy = pu.y;
      const dx = px - pu.x;
      const dy = py - pu.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < magnetR2 && d2 > 16) {
        const pull = 1 - Math.sqrt(d2) / magnetR;
        vx = pu.x + dx * pull * 0.58;
        vy = pu.y + dy * pull * 0.58;
      }
      s.setPosition(vx, vy);
      s.setScale(0.5 + 0.08 * Math.sin(this.time.now * 0.006 + id));
    }
    for (const [id, s] of this.pickupSprites)
      if (!this.net.pickups.has(id)) {
        const sx = s.x;
        const sy = s.y;
        const collected = (sx - px) ** 2 + (sy - py) ** 2 < collectR2;
        if (collected) {
          const kind = s.getData("kind") as number | undefined;
          const col = kind === PICKUP_CORE ? COLORS.neonCyan : COLORS.neonYellow;
          this.particles?.burst(sx, sy, 0.75);
          this.particles?.spark(sx, sy, col, 1.35);
          juiceShake(this, 38, 0.0016);
        }
        s.destroy();
        this.pickupSprites.delete(id);
      }

    // territory nodes (server-owned) — tinted by controlling faction, capture ring
    this.nodeG.clear();
    for (const [id, n] of this.net.nodes) {
      let s = this.nodeSprites.get(id);
      if (!s) {
        s = this.add.sprite(n.x, n.y, NODE_KEY).setDepth(6);
        this.nodeSprites.set(id, s);
      }
      const ownerCol = n.owner === NEUTRAL ? 0x8a8f9c : FACTION_COLORS[n.owner];
      s.setTint(ownerCol).setPosition(n.x, n.y);
      if (n.progress > 0.01) {
        const col = n.by === NEUTRAL ? ownerCol : FACTION_COLORS[n.by];
        this.nodeG.lineStyle(3, col, 0.95);
        this.nodeG.beginPath();
        this.nodeG.arc(n.x, n.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Phaser.Math.Clamp(n.progress, 0, 1));
        this.nodeG.strokePath();
      }
    }
    for (const [id, s] of this.nodeSprites)
      if (!this.net.nodes.has(id)) {
        s.destroy();
        this.nodeSprites.delete(id);
      }

    // HP bar + death overlay
    this.hpBar.clear();
    if (this.net.connected) {
      const bw = 180;
      const bx = 12;
      const by = this.scale.height - 60;
      this.hpBar.fillStyle(0x140a1e, 0.9).fillRect(bx, by, bw, 12);
      const hpN = Phaser.Math.Clamp(this.net.hp / PLAYER_HP, 0, 1);
      this.hpBar.fillStyle(hpN > 0.3 ? COLORS.hp : COLORS.hpLow, 1).fillRect(bx + 1, by + 1, (bw - 2) * hpN, 10);
    }
    this.deadText.setVisible(this.net.dead).setText(t("combat.eliminated"));

    this.hudRefreshAcc += dt;
    const connChanged = this.lastHudConnectionState !== this.connectionState;
    if (connChanged) this.lastHudConnectionState = this.connectionState;
    if (this.hudRefreshAcc >= OnlineScene.HUD_REFRESH_MS || connChanged) {
      this.hudRefreshAcc = 0;
      this.refreshHudPanels();
    }
  }

  /** HUD, chat, roster, quest — throttled to ~4 Hz; connection changes refresh immediately. */
  private refreshHudPanels() {
    const st = this.net.stats();
    const ctrl = this.net.control === NEUTRAL ? "—" : FACTION_NAMES[this.net.control];
    const war = FACTION_NAMES.map((nm, i) => `${nm[0]}:${this.net.factions[i]}`).join("  ");
    if (!st.connected && (this.connectionState === "offline" || Date.now() - this.connectStartedAt > 24000)) {
      this.hud.setColor("#ff6a6a");
      if (this.isTutorial) {
        this.hud.setText([
          "⚠  DRILL SERVER OFFLINE — preview movement only",
          "Start the game server, then press R to retry:",
          "  cd server && npm run dev",
          "  (or from project root: npm run dev:online)",
          "Press ESC to return to the menu.",
        ]);
      } else {
        this.hud.setText([
          "⚠  SERVER OFFLINE",
          "The online realm isn't reachable right now.",
          "Press R to retry · ESC for menu",
          "Start server: cd server && npm run dev",
        ]);
      }
    } else if (this.isTutorial) {
      this.hud.setColor("#39ff88");
      const lesson = this.net.tutorialStep + 1;
      const dots = ".".repeat(this.connectDots);
      this.hud.setText([
        st.connected
          ? `◢ DRILL YARD  ${this.callsign}  ·  ${this.net.tutorialMode === "full" ? "FULL" : "QUICK"}  ·  lesson ${Math.min(lesson, this.net.tutorialTotal)}/${this.net.tutorialTotal}`
          : this.connectionState === "reconnecting"
            ? `reconnecting to drill yard${dots}`
            : `connecting to drill yard${dots}`,
        "no XP · no leveling · rewards unlock in the live city",
        `players: ${st.players}   hostiles: ${this.net.enemies.size}   nodes: ${this.net.nodes.size}`,
        `HP ${Math.round(this.net.hp)}   ₵ ${this.net.credits}  ◈ ${this.net.cores}  (drill only — not saved)`,
        this.net.tutorialPortalOpen ? "portal open — deploy east when ready (one way)" : "complete each lesson to unlock the portal",
      ]);
    } else {
      this.hud.setColor("#39ff88");
      const dots = ".".repeat(this.connectDots);
      const zoneTitle = this.isCityHub
        ? "METRO CITY (shared)"
        : this.interior
          ? INTERIOR_TITLES[this.zone] ?? "▣ INTERIOR"
          : this.isSubway
            ? "▼ THE UNDERLINE"
            : `${this.zone.toUpperCase()} ${DISTRICTS[this.districtIndex].name}`;
      const soloWander = !!this.drillLocal && !st.connected && (this.isCityHub || (this.interior && !this.isSubway));
      this.hud.setText([
        st.connected
          ? `◢ ONLINE  ${this.callsign}  ·  ${zoneTitle}`
          : soloWander
            ? `◢ ${this.isCityHub ? "CITY PREVIEW" : "SOLO PREVIEW"}  ${this.callsign}${this.connectionState === "reconnecting" ? `  ·  ${t("online.reconnecting")}${dots}` : `  ·  ${t("online.connecting")}${dots}`}`
            : this.connectionState === "reconnecting"
              ? `${t("online.reconnecting")}${dots}`
              : `${t("online.connecting")}${dots}`,
        soloWander && !st.connected
          ? "walk the city while the server links · quests & trade need the live grid"
          : `CELL ${FACTION_NAMES[this.net.faction]}   ·   DISTRICT CONTROL: ${ctrl}`,
        `players: ${st.players}   enemies: ${this.net.enemies.size}   nodes: ${this.net.nodes.size}`,
        st.connected
          ? `LV ${this.net.level}  XP ${xpIntoLevel(this.net.xp)}/100   ₵ ${this.net.credits}  ◈ ${this.net.cores}   HP ${Math.round(this.net.hp)}`
          : soloWander
            ? `preview mode · press R to retry link · ESC for menu`
            : `LV ${this.net.level}  XP ${xpIntoLevel(this.net.xp)}/100   ₵ ${this.net.credits}  ◈ ${this.net.cores}   HP ${Math.round(this.net.hp)}`,
        st.connected ? `FACTION WAR  ${war}  (server-wide contribution)` : "",
      ].filter(Boolean));
    }

    this.chatPanel.setArea(this.chatAreaLabel());
    this.chatPanel.setMessages(this.net.chatLog);
    this.rosterText.setText([
      `◢ ONLINE (${this.net.roster.length})`,
      ...this.net.roster
        .slice(0, 12)
        .map((r) => `${this.net.party.includes(r.id) ? "◆" : "·"} ${r.id} L${r.level}`),
    ]);

    const tr = this.net.trade;
    if (tr) {
      this.tradeText.setVisible(true).setText([
        `◢ SECURE TRADE — ${tr.with}`,
        `you offer:  ₵${tr.youOffer.credits}  ◈${tr.youOffer.cores}   ${tr.youConfirm ? "✓ CONFIRMED" : ""}`,
        `they offer: ₵${tr.theyOffer.credits}  ◈${tr.theyOffer.cores}   ${tr.theyConfirm ? "✓ CONFIRMED" : ""}`,
        `/offer <credits> <cores>  ·  /confirm  ·  /tcancel`,
      ]);
    } else {
      this.tradeText.setVisible(false);
    }

    if (!this.isTutorial) {
      const camp = new Campaign({
        activeId: this.net.campaignQuest,
        stage: this.net.campaignStage,
        progress: this.net.campaignProgress,
        completed: [],
        flags: [],
      });
      this.questText.setText(campaignHud(camp));
    }
    if (!this.isTutorial) {
      const active = this.net.contracts.find((c) => !c.done);
      if (active) {
        this.dailyText.setVisible(true).setText(`◇ CONTRACT — ${active.name}  ${Math.min(active.progress, active.count)}/${active.count}`);
      } else if (this.net.contracts.length > 0) {
        this.dailyText.setVisible(true).setText("◇ daily contracts complete — see THE FIXER tomorrow");
      } else {
        this.dailyText.setVisible(false);
      }
      const bty = this.net.bounty;
      if (bty) this.bountyText.setVisible(true).setText(`◈ BOUNTY — ${bty.name}  ${Math.min(bty.progress, bty.count)}/${bty.count}`);
      else this.bountyText.setVisible(false);
    }
    const story = this.net.story;
    if (story && performance.now() - story.at < 8000) {
      this.storyPanel.setVisible(true).setText(`◢ ${story.quest} — ${story.title} ◣\n\n${story.text}`);
    } else {
      this.storyPanel.setVisible(false);
    }
  }

  /** Floating HSS deploy bark above a newly-seen online enemy (throttled), tinted to
   *  its archetype — matches the singleplayer feel. */
  /** World-space boss decoration: a name plate + an HP bar floating above the commander. */
  private updateBossOverlay(id: number, e: NetEnemy) {
    let o = this.bossOverlays.get(id);
    const hex = "#" + ((e.tint ?? 0xffffff) & 0xffffff).toString(16).padStart(6, "0");
    if (!o) {
      const name = this.add
        .text(e.x, e.y - 58, e.name ?? "HSS COMMANDER", {
          fontFamily: "Courier New, monospace",
          fontSize: "12px",
          color: hex,
          fontStyle: "bold",
          align: "center",
        })
        .setOrigin(0.5)
        .setDepth(20);
      name.setShadow(0, 0, "#02030a", 5, true, true);
      const bar = this.add.graphics().setDepth(20);
      o = { name, bar };
      this.bossOverlays.set(id, o);
    }
    o.name.setPosition(e.x, e.y - 58);
    const w = 90;
    const hpn = e.hpMax ? Phaser.Math.Clamp(e.hp / e.hpMax, 0, 1) : 1;
    o.bar.clear();
    o.bar.fillStyle(0x140a1e, 0.9).fillRect(e.x - w / 2, e.y - 46, w, 6);
    o.bar.fillStyle(e.tint ?? COLORS.enemy, 1).fillRect(e.x - w / 2 + 1, e.y - 45, (w - 2) * hpn, 4);
  }

  /** Boss locator: a status banner + a screen-edge arrow pointing toward the zone boss,
   *  so players can find it from across the map (or watch its respawn countdown). */
  private updateBossLocator() {
    const b = this.net.boss;
    if (!b) {
      this.bossBanner.setVisible(false);
      this.bossArrow.setVisible(false);
      return;
    }
    this.bossBanner.setVisible(true);
    if (!b.alive) {
      this.bossBanner.setText(`◆ ${b.name} — reforms in ${b.respawnSec}s`).setColor("#9aa3b2");
      this.bossArrow.setVisible(false);
      return;
    }
    const dx = b.x - this.me.x;
    const dy = b.y - this.me.y;
    this.bossBanner.setText(`◆ ${b.name} — ALIVE · ${Math.round(Math.hypot(dx, dy) / 8)}m`).setColor("#39ff88");
    const zoom = this.cameras.main.zoom || 1;
    if (Math.abs(dx) < VIEW_W / 2 / zoom - 48 && Math.abs(dy) < VIEW_H / 2 / zoom - 48) {
      this.bossArrow.setVisible(false); // on-screen — the boss + its overlay are already visible
      return;
    }
    const ang = Math.atan2(dy, dx);
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const t = Math.min((cx - 70) / (Math.abs(Math.cos(ang)) || 1e-6), (cy - 96) / (Math.abs(Math.sin(ang)) || 1e-6));
    this.bossArrow.setVisible(true).setPosition(cx + Math.cos(ang) * t, cy + Math.sin(ang) * t).setRotation(ang);
  }

  private maybeEnemyBark(x: number, y: number, kind: number) {
    const now = this.time.now;
    if (now < this.nextEnemyBarkAt || Math.random() > 0.4) return;
    const ids = ["patrol", "wasp", "lancer", "hound", "patrol", "lancer", "hound"]; // 4-6 reuse pools
    const pool = ENEMY_BARKS[ids[kind] ?? "patrol"];
    if (!pool?.length) return;
    this.nextEnemyBarkAt = now + 2200;
    const tint = ENEMY_KIND_TINT[kind] ?? COLORS.enemy;
    const hex = "#" + (tint & 0xffffff).toString(16).padStart(6, "0");
    const t = this.add
      .text(x, y - 20, pool[Math.floor(Math.random() * pool.length)], {
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        color: hex,
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.tweens.add({ targets: t, y: y - 42, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  // ── emote / ping wheel ──────────────────────────────────────────────
  private openWheel() {
    if (this.emoteWheelOpen) return;
    this.emoteWheelOpen = true;
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const bg = this.add
      .circle(cx, cy, 94, 0x0b0716, 0.62)
      .setStrokeStyle(2, 0x29e7ff, 0.5)
      .setScrollFactor(0)
      .setDepth(1500);
    this.wheelObjs.push(bg);
    this.wheelObjs.push(
      this.add
        .text(cx, cy, "EMOTE\nV / ESC", { fontFamily: "Courier New, monospace", fontSize: "9px", color: "#6b7184", align: "center" })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1501),
    );
    EMOTES.forEach((em, i) => {
      const a = (i / EMOTES.length) * Math.PI * 2 - Math.PI / 2;
      const t = this.add
        .text(cx + Math.cos(a) * 72, cy + Math.sin(a) * 72, em.text, {
          fontFamily: "Courier New, monospace",
          fontSize: "12px",
          color: em.ping ? "#f7ff3c" : "#9af0ff",
          fontStyle: "bold",
          align: "center",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1501)
        .setInteractive({ useHandCursor: true });
      t.on("pointerover", () => t.setScale(1.25));
      t.on("pointerout", () => t.setScale(1));
      t.on("pointerdown", () => this.pickEmote(i));
      this.wheelObjs.push(t);
    });
  }

  private closeWheel() {
    this.emoteWheelOpen = false;
    this.wheelObjs.forEach((o) => o.destroy());
    this.wheelObjs = [];
  }

  private pickEmote(i: number) {
    const em = EMOTES[i];
    if (this.net.connected) this.net.sendEmote(i, em.ping, this.net.pred.x, this.net.pred.y);
    this.closeWheel();
  }

  /** Show speech bubbles when players send area chat — visible to everyone nearby. */
  private processChatBubbles() {
    const log = this.net.chatLog;
    while (this.lastChatShown < log.length) {
      const c = log[this.lastChatShown++]!;
      if (c.sys || c.ch === "whisper") continue;
      if (c.ch !== "zone" && c.ch !== "party" && c.ch !== "guild") continue;
      const pos = this.chatBubblePos(c.from, c.x, c.y);
      if (pos) this.spawnChatBubble(c.from, c.text, pos.x, pos.y);
    }
  }

  private chatBubblePos(from: string, x?: number, y?: number): { x: number; y: number } | null {
    if (x != null && y != null) return { x, y };
    if (from === this.callsign || from === this.net.id) return { x: this.net.pred.x, y: this.net.pred.y };
    const remote = this.remoteSprites.get(from);
    if (remote) return { x: remote.x, y: remote.y };
    const r = this.net.remotes.get(from);
    if (r) return { x: r.x, y: r.y };
    return null;
  }

  private spawnChatBubble(from: string, text: string, x: number, y: number) {
    const line = text.length > 64 ? text.slice(0, 61) + "…" : text;
    const txt = this.add
      .text(x, y - 28, `${from}: ${line}`, {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#f7ff3c",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: 220 },
      })
      .setOrigin(0.5, 1)
      .setDepth(1002);
    txt.setShadow(0, 0, "#0a0e1a", 5, true, true);
    this.tweens.add({
      targets: txt,
      y: y - 52,
      alpha: { from: 1, to: 0 },
      duration: 3200,
      onComplete: () => txt.destroy(),
    });
  }

  /** Render newly-relayed emotes/pings — floats over the sender, or a world ping marker. */
  private processEmotes() {
    let newest = this.lastEmoteShownAt;
    for (const e of this.net.emotes) {
      if (e.at <= this.lastEmoteShownAt) continue;
      this.spawnEmoteVisual(e.kind, e.ping, e.x, e.y);
      if (e.at > newest) newest = e.at;
    }
    this.lastEmoteShownAt = newest;
  }

  private spawnEmoteVisual(kind: number, ping: boolean, x: number, y: number) {
    const def = EMOTES[kind] ?? EMOTES[0];
    if (ping) {
      const ring = this.add.circle(x, y, 16, 0xf7ff3c, 0.12).setStrokeStyle(2, 0xf7ff3c, 0.9).setDepth(7);
      this.tweens.add({ targets: ring, scale: { from: 0.4, to: 1.5 }, alpha: { from: 0.9, to: 0 }, duration: 850, repeat: 3 });
      const txt = this.add
        .text(x, y - 26, def.text, { fontFamily: "Courier New, monospace", fontSize: "12px", color: "#f7ff3c", fontStyle: "bold" })
        .setOrigin(0.5)
        .setDepth(1002);
      txt.setShadow(0, 0, "#0a0e1a", 4, true, true);
      this.tweens.add({ targets: txt, alpha: 0, delay: 3200, duration: 800, onComplete: () => { txt.destroy(); ring.destroy(); } });
    } else {
      const txt = this.add
        .text(x, y - 22, def.text, { fontFamily: "Courier New, monospace", fontSize: "13px", color: "#9af0ff", fontStyle: "bold" })
        .setOrigin(0.5)
        .setDepth(1002);
      txt.setShadow(0, 0, "#0a0e1a", 4, true, true);
      this.tweens.add({ targets: txt, y: y - 50, alpha: { from: 1, to: 0 }, duration: 1700, onComplete: () => txt.destroy() });
    }
  }

  /** Paint the PvP arenas onto the world: a faint red fill, a border, hazard-stripe
   *  corners and a banner — so the free-for-all zones are obvious before you walk in. */
  private drawPvpZones() {
    const g = this.add.graphics().setDepth(4);
    for (const z of this.pvpZones) {
      g.fillStyle(0xff2b3b, 0.05).fillRect(z.x, z.y, z.w, z.h);
      g.lineStyle(2, 0xff3b6b, 0.55).strokeRect(z.x, z.y, z.w, z.h);
      g.lineStyle(3, 0xff3b6b, 0.85);
      const c = 28;
      const corner = (cx: number, cy: number, dx: number, dy: number) => {
        g.beginPath();
        g.moveTo(cx, cy + dy * c);
        g.lineTo(cx, cy);
        g.lineTo(cx + dx * c, cy);
        g.strokePath();
      };
      corner(z.x, z.y, 1, 1);
      corner(z.x + z.w, z.y, -1, 1);
      corner(z.x, z.y + z.h, 1, -1);
      corner(z.x + z.w, z.y + z.h, -1, -1);
      this.add
        .text(z.x + z.w / 2, z.y + uiDim(10), `⚔ ${z.name}`, displayFont(12, { color: "#ff5a6b", fontStyle: "bold" }))
        .setOrigin(0.5, 0)
        .setDepth(4)
        .setShadow(0, 0, "#ff3b6b", 6, true, true);
      this.add
        .text(z.x + z.w / 2, z.y + uiDim(26), `◈ $METRO CONTEST ZONE`, bodyFont(9, { color: "#9aa3b2" }))
        .setOrigin(0.5, 0)
        .setDepth(4);
    }
  }

  /** RS-style harvest nodes — click to mine data for crafting XP. */
  private spawnMiningNodes(tiles: Array<[number, number]>) {
    for (const [tx, ty] of tiles) {
      const px = tx * TILE + TILE / 2;
      const py = ty * TILE + TILE / 2;
      this.add
        .image(px, py, GLOW_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0x39ff88)
        .setDepth(7)
        .setScale(1.4)
        .setAlpha(0.35);
      this.add
        .text(px, py - 18, "▣ DATA NODE", bodyFont(8, { color: "#39ff88", fontStyle: "bold" }))
        .setOrigin(0.5)
        .setDepth(8);
      const z = this.add.zone(px - 16, py - 16, 32, 32).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(9);
      z.on("pointerdown", () => {
        if (!getSettings().rsControls) return;
        const r = grantSkillXp(this.rsSkills, "mining", 28);
        this.rsSkillsPanel.setSkills(this.rsSkills);
        const craft = grantSkillXp(this.rsSkills, "crafting", 8);
        this.rsSkillsPanel.setSkills(this.rsSkills);
        this.showBubble(px, py, r.leveled ? `Data mined — Mining ${r.level}!` : craft.leveled ? `Refined — Crafting ${craft.level}!` : "Data fragment harvested.");
        this.synth?.pickup();
      });
    }
  }

  private controlHint() {
    if (this.isTutorial) return "WASD move · CLICK fire · I bag · J/G/B/K panels · ENTER chat · SKIP (top-right)";
    if (getSettings().rsControls) {
      return "CLICK walk · RIGHT-CLICK menu · M map (shift+click walk) · minimap · Q/J quests · examine bar below";
    }
    return "WASD · HOLD CLICK fire · I bag · K market · J jobs · M map · H safehouse · O options";
  }

  private blockRsInput() {
    return (
      this.chatOpen ||
      this.emoteWheelOpen ||
      !!this.options?.isOpen ||
      this.inv?.open ||
      this.shop?.open ||
      this.forge?.open ||
      this.market?.open ||
      this.board?.open ||
      this.contracts?.open ||
      this.rsSkillsPanel?.open ||
      this.mapPanel?.open ||
      this.questLog?.open
    );
  }

  private refreshQuestLog(toggle = false) {
    const state = {
      campaignId: this.net.campaignQuest,
      campaignStage: this.net.campaignStage,
      campaignProgress: this.net.campaignProgress,
      campaignObjective: this.net.campaignObjective,
      contracts: this.net.contracts,
      bounty: this.net.bounty,
    };
    if (toggle) this.questLog.toggle(state);
    else this.questLog.setState(state);
  }

  private pickEnemyAt(wx: number, wy: number) {
    let best: { id: number; d: number } | null = null;
    for (const [id, e] of this.net.enemies) {
      const d = Math.hypot(e.x - wx, e.y - wy);
      if (d < 28 && (!best || d < best.d)) best = { id, d };
    }
    return best?.id ?? null;
  }

  private pickNpcAt(wx: number, wy: number) {
    let best: ZoneNpc | null = null;
    let bd = Infinity;
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d < 36 && d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  private handleLeftClick(pointer: Phaser.Input.Pointer) {
    const soloWalk = !!this.drillLocal && !this.net.connected && (this.isCityHub || (this.interior && !this.isSubway));
    if (this.blockRsInput() || this.net.dead || (!this.net.connected && !soloWalk)) return;
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const pos = this.playerPos();
    const enemyId = this.pickEnemyAt(wp.x, wp.y);
    if (enemyId !== null && !this.interior && !this.isCityHub) {
      this.attackTargetId = enemyId;
      this.pendingInteract = null;
      const e = this.net.enemies.get(enemyId)!;
      this.clickMove.setDestination(e.x, e.y, this.zoneGrid, pos.x, pos.y);
      return;
    }
    const npc = this.pickNpcAt(wp.x, wp.y);
    if (npc) {
      this.attackTargetId = null;
      this.pendingInteract = npc;
      this.clickMove.setDestination(npc.x, npc.y, this.zoneGrid, pos.x, pos.y);
      return;
    }
    this.attackTargetId = null;
    this.pendingInteract = null;
    this.clickMove.setDestination(wp.x, wp.y, this.zoneGrid, pos.x, pos.y);
  }

  private handleRightClick(pointer: Phaser.Input.Pointer) {
    if (this.blockRsInput()) return;
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const enemyId = this.pickEnemyAt(wp.x, wp.y);
    const npc = this.pickNpcAt(wp.x, wp.y);
    const pos = this.playerPos();
    const actions: Array<{ label: string; color?: string; onPick: () => void }> = [];
    const walk = () => {
      this.attackTargetId = null;
      this.pendingInteract = null;
      this.clickMove.setDestination(wp.x, wp.y, this.zoneGrid, pos.x, pos.y);
    };
    if (enemyId !== null) {
      actions.push({
        label: "Attack",
        onPick: () => {
          this.attackTargetId = enemyId;
          const e = this.net.enemies.get(enemyId)!;
          this.clickMove.setDestination(e.x, e.y, this.zoneGrid, pos.x, pos.y);
        },
      });
      actions.push({ label: "Walk here", onPick: walk });
    } else if (npc) {
      const label = npc.name ?? "NPC";
      actions.push({
        label: `Talk-to ${label}`,
        onPick: () => {
          this.pendingInteract = npc;
          this.clickMove.setDestination(npc.x, npc.y, this.zoneGrid, pos.x, pos.y);
        },
      });
      if (npc.kind === "service" && npc.svc) {
        actions.push({
          label: `Open ${label}`,
          onPick: () => this.openService(npc.svc!),
        });
      }
      actions.push({ label: "Walk here", onPick: walk });
    } else {
      actions.push({ label: "Walk here", onPick: walk });
      actions.push({
        label: "Examine ground",
        color: "#c8c8c8",
        onPick: () => this.rsExamine("Wet neon asphalt. The city breathes beneath your boots."),
      });
    }
    this.contextMenu.show(pointer.x, pointer.y, enemyId !== null ? "HSS Unit" : npc?.name ?? "Metro City", actions);
  }

  private tickRsMovement() {
    const pos = this.playerPos();
    if (this.attackTargetId !== null) {
      const e = this.net.enemies.get(this.attackTargetId);
      if (!e) {
        this.attackTargetId = null;
        return;
      }
      const dist = Math.hypot(e.x - pos.x, e.y - pos.y);
      if (dist > this.attackRange) {
        this.clickMove.setDestination(e.x, e.y, this.zoneGrid, pos.x, pos.y);
      } else {
        this.clickMove.cancel();
      }
    }
    if (this.pendingInteract) {
      const n = this.pendingInteract;
      const dist = Math.hypot(n.x - pos.x, n.y - pos.y);
      if (dist <= NPC.interactRange + 8) {
        this.pendingInteract = null;
        this.clickMove.cancel();
        if (n.kind === "service" && n.svc) this.openService(n.svc);
        else if (n.kind === "door" && n.dest) this.enterZone(n.dest);
        else if (n.kind === "transit" && n.dest) this.enterZone(n.dest);
        else if (n.kind === "instructor") this.talkInstructor(n);
        else this.talkNpc(n);
      }
    }
  }

  private applyNeon() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon");
    this.neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline | undefined;
    if (this.neon) {
      const a = this.zoneAccent;
      this.neon.heat = 0.05;
      this.neon.tint = [((a >> 16) & 0xff) / 255, ((a >> 8) & 0xff) / 255, (a & 0xff) / 255];
      this.neon.tintAmt = this.isCityHub ? 0.18 : this.interior ? 0.12 : 0.24;
    }
  }
}
