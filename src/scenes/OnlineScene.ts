import Phaser from "phaser";
import { installUiCamera } from "../render/cameras";
import { installRoofParallax, type RoofParallax } from "../render/roofParallax";
import { createTerrainLayer, type TerrainProfile } from "../render/terrainLayer";
import { paintRooftopLights } from "../render/rooftopLights";
import { PlayerLight } from "../render/PlayerLight";
import Atmosphere from "../render/Atmosphere";
import MusicDirector from "../audio/MusicDirector";
import OnlineInventory from "../ui/OnlineInventory";
import OnlineShop from "../ui/OnlineShop";
import OnlineForge from "../ui/OnlineForge";
import OnlineBoard from "../ui/OnlineBoard";
import OnlineJournal from "../ui/OnlineJournal";
import OnlineGuild from "../ui/OnlineGuild";
import OnlineMarket from "../ui/OnlineMarket";
import OnlineStash from "../ui/OnlineStash";
import { installDecorCulling } from "../render/decorCull";
import OnlineContracts from "../ui/OnlineContracts";
import FixerBrief from "../ui/FixerBrief";
import OnlineChatPanel from "../ui/OnlineChatPanel";
import { COLORS, TILE, VIEW_W, VIEW_H, NPC, PLAYER, HEAT, uiDim, uiFont, DISTRICT_SCALE } from "../config";
import { effectiveMods } from "../game/items";
import {
  PLAYER_KEY,
  COP_KEY,
  BULLET_KEY,
  GLOW_KEY,
  NODE_KEY,
  PROP_STREETLIGHT_KEY,
  PROP_VENDING_KEY,
  PROP_AC_KEY,
  PROP_CAR_KEY,
  PICKUP_COIN_KEY,
  PICKUP_CORE_KEY,
  BULLET_PLAYER_KEY,
  BULLET_ENEMY_KEY,
  GUARDIAN_WRAITH_KEY,
  PORTRAIT_CAST_KEY,
  PORTRAIT_KEEPERS_KEY,
  PORTRAIT_RESIDENTS_KEY,
  PORTRAIT_BOSSES_KEY,
  PORTRAIT_INTERACT_KEY,
  STINGER_BOSS_KEY,
} from "../assets/manifest";
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
  resolveOpenSpawn,
  gridDims,
  pvpZonesFor,
  stepMove,
  NET_TICK_MS,
  RESPAWN_MS,
  type MoveState,
} from "../net/sim";
import {
  buildGrid,
  buildBridgeGrid,
  buildSafehouse,
  buildVenueRoom,
  districtBuildings,
  VENUE_MAT_TILE,
  VENUE_ROOM_W,
  VENUE_ROOM_H,
  venueLayoutFor,
  venueSpawnFor,
  buildSubway,
  buildDive,
  parseDiveZone,
  DIVE_CORE_TILE,
  buildTutorial,
  SAFEHOUSE_SPAWN,
  TUTORIAL_PORTAL,
  TUTORIAL_PORTAL_RADIUS,
  TUTORIAL_SPAWN,
  isVenueSizedZone,
  isSafehouseSizedInterior,
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
import { TUTORIAL_ZONE, tutorialStepAt, isTutorialTalkKind, type TutorialMode } from "../net/tutorial";
import {
  TUTORIAL_CHAMBERS,
  tutorialInstructorsFor,
  instructorForStep,
  chamberAccentForKind,
  chamberForKind,
  tpx,
} from "../game/tutorialLayout";
import { getSettings, effectiveLowFx } from "../systems/Settings";
import {
  firstSessionLine,
  coreLoopLine,
  getFirstSession,
  noteTalkedFixer,
  noteDeployed,
  noteKill,
  noteOpenedContracts,
  noteAcceptedBounty,
  noteOpenedGear,
  setGodSessionUnlock,
  noteReturnedToHub,
  noteHeatCoached,
  firstHourSystemsLocked,
  noteCampaignProgress,
} from "../game/firstSession";
import {
  secondHourLine,
  noteSecondBuyCache,
  noteSecondForge,
  noteSecondBountyDone,
  noteSecondBossTouch,
  noteSecondCapture,
} from "../game/secondHour";
import { downloadShareCard } from "../ui/ShareCard";
import { noteNpcTalk, noteNpcBountyDone, npcMemoryLine } from "../game/npcMemory";
import { buildStamp } from "../buildInfo";
import { raidScriptFor } from "../game/raid";
import { dailyDistrictMod } from "../game/districtMods";
import { fadeInScene, transitionTo } from "../systems/transitions";
import { juiceShake, juiceFlash, juiceHitStop, juiceZoomPunch, juiceNeonPulse } from "../systems/juice";
import Particles from "../render/Particles";
import { playCombatPose, resetCombatPose } from "../assets/combatAnim";
import { gamepadIntent, keyDown, fireControlLabel } from "../systems/Input";
import { t } from "../i18n";
import Synth from "../audio/Synth";
import Pops from "../render/Pops";
import OptionsPanel from "../ui/OptionsPanel";
import { DISTRICTS } from "../game/districts";
import { getWeapon, type PrimaryDef } from "../game/weapons";
import { ENEMY_BARKS } from "../game/enemies";
import PvpCrucibleHud from "../ui/PvpCrucibleHud";
import { topIntelRailGeometry } from "../ui/topIntelRail";
import { drawHubNpcPlate } from "../ui/studioChrome";
import { displayFont, bodyFont, hudFont, fitTextToWidth, setFittedText } from "../ui/typography";
import { onlineHudStack, uiGap, panelPadInner } from "../ui/spacing";
import { drawHudPanel, drawPremiumBar, ensureHudPanelImage } from "../ui/panelChrome";
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
import { ESTATES, ESTATES_ZONE, buildHomeRoom, parseEstateInterior, FURNITURE, furnitureKind, furnitureFits, furnitureHomeBuffs, occupiedTiles, pieceAt, type FurniturePiece } from "../world/estates";
import { drawFurniture } from "../render/furnitureArt";
import { paintCityEnvWash, paintCityStorefrontReflections } from "../render/cityTerrainPolish";
import { paintCityBuildingFacades, buildingExteriorAccent } from "../render/buildingFacades";
import NetClient, { ensureGuestDeviceSecret, type NetEnemy } from "../net/NetClient";
import NeonPipeline from "../render/NeonPipeline";
import { campaignHud, Campaign } from "../net/campaign";
import OnlineCosmetics from "../ui/OnlineCosmetics";
import OnlineMap from "../ui/OnlineMap";
import PanelRouter from "./online/PanelRouter";
import {
  CITY_HUB_CITIZENS,
  CITY_HUB_DOORS,
  CITY_HUB_NPCS,
  DISTRICT_TRANSIT_BACK,
  DISTRICT_TRANSIT_FWD,
  DISTRICT_VENUE_TITLE,
  EMOTES,
  ENEMY_KIND_TINT,
  HUB_CX,
  HUB_CY,
  HUB_DOOR_COLOR,
  HUB_INTERIOR_TITLE,
  INTERIOR_NPC_TILES,
  INTERIOR_TITLES,
  districtBuildingKind,
  districtEdgeTiles,
  hexColor,
  hubLook,
  hubT,
  parseBuildingInterior,
  parseHubInterior,
  type ZoneNpc,
} from "./online/sceneConfig";
import { applyCosmetic } from "../game/cosmetics";
import { npcDef, AMBIENT_NPCS, INTERIOR_PLAN, keeperFor, districtResident, hubResident, campaignAllyLines, STORY_ALLIES } from "../game/cityNpcs";
import { portraitFor, portraitForName, portraitForBoss, type PortraitRef } from "../game/portraits";
import { bountyForNpc } from "../game/bounties";
import { noteRecentPlayer, listRecentPlayers, pinRecentPlayer } from "../game/recentPlayers";
import {
  CLIENT_OPEN_SERVICES,
  npcHasMenu,
  type NpcServiceId,
} from "../game/npcServices";
import NpcTalkPanel from "../ui/NpcTalkPanel";
import type { PlayerLook } from "../net/protocol";
import { setOnlinePlayer } from "../economy/session";
import {
  connectedWallet,
  signWalletLogin,
  walletSessionSecret,
  rotateWalletSessionSecret,
  restoreWalletSession,
} from "../economy/wallet";
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
import { writeLocalRunner } from "../systems/LocalRunner";
import { prefersMobileUx } from "../systems/Mobile";
import MobileControls from "../ui/MobileControls";

const SERVER_URL =
  (import.meta.env as Record<string, string | undefined>).VITE_SERVER_URL ??
  "ws://127.0.0.1:8787/ws";

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
  private escortOrbs = new Map<string, Phaser.GameObjects.Image[]>(); // orbiting companions per player
  private meShadow!: Phaser.GameObjects.Image; // soft ground contact under the local player
  private meRing!: Phaser.GameObjects.Graphics; // bright "you-are-here" focal ring
  private roofParallax?: RoofParallax; // fake-3D roof projection (city + districts)
  private remoteLabels = new Map<string, Phaser.GameObjects.Text>();
  private enemySprites = new Map<number, Phaser.GameObjects.Sprite>();
  private bossOverlays = new Map<number, { name: Phaser.GameObjects.Text; bar: Phaser.GameObjects.Graphics }>();
  private bossBanner!: Phaser.GameObjects.Text; // zone boss status (alive / reform countdown)
  private bossArrow!: Phaser.GameObjects.Text; // screen-edge pointer toward an off-screen boss
  private questArrow!: Phaser.GameObjects.Text; // screen-edge pointer toward the campaign objective
  private questMarker!: Phaser.GameObjects.Text; // world-space marker above the objective when on-screen
  private questTarget: { x: number; y: number; label: string } | null = null;
  private eventBanner!: Phaser.GameObjects.Text; // live world-event banner (telegraph/active + countdown)
  private eventOverlay!: Phaser.GameObjects.Rectangle; // full-screen ambience wash per event
  private eventOverlayAlpha = 0; // eased toward the active event's target each frame
  private shotSprites = new Map<number, Phaser.GameObjects.Image>();
  private pickupSprites = new Map<number, Phaser.GameObjects.Image | Phaser.GameObjects.Sprite>();
  private nodeSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private nodeG!: Phaser.GameObjects.Graphics;
  private hazardG!: Phaser.GameObjects.Graphics; // telegraphed boss AoE rings (raid mechanics)
  private faction = 0;
  private hud!: Phaser.GameObjects.Text;
  private hudPanelG!: Phaser.GameObjects.Graphics; // backing frame behind the status stack
  /** Painted Higgsfield panel images (desktop + mobile); null if texture missing. */
  private hudPanelImg: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image | null = null;
  private trackerPanelImg: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image | null = null;
  private hpBarRect = { x: 0, y: 0, w: 0, h: 0 }; // laid out with the status panel at refresh
  private hpBar!: Phaser.GameObjects.Graphics;
  private kitPipsRect = { x: 0, y: 0, w: 0, h: 0 }; // dash + ability cooldown bars
  private deadText!: Phaser.GameObjects.Text;
  private deathSub!: Phaser.GameObjects.Text; // reboot countdown under SIGNAL LOST
  private deathOverlay!: Phaser.GameObjects.Rectangle;
  private deathStartedAt = 0; // wall-clock start of the current death, for the countdown
  private wasDead = false;
  private coachText?: Phaser.GameObjects.Text; // first-session + core-loop strip
  private enemyHpG?: Phaser.GameObjects.Graphics; // floating enemy HP bars
  private killFeed: string[] = [];
  private killFeedText?: Phaser.GameObjects.Text;
  private phantomOnline = 0; // ambient population illusion when solo
  private bossIntroShown = ""; // boss name whose title card already played this visit
  /** Last-seen node owners — detect captures for second-hour coach. */
  private prevNodeOwners = new Map<number, number>();
  private atmosphere?: Atmosphere; // rich ambient layer, shared with the SP city
  private connectStartedAt = 0; // when this connection attempt began (for the offline timeout)
  /** Bumped on connect / shutdown so async wallet auth cannot open a zombie socket. */
  private sceneConnectGen = 0;
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
  private journal!: OnlineJournal; // memory fragments codex
  private guildPanel!: OnlineGuild; // guild ("Cell") bank/roster/level (D1-backed)
  private market!: OnlineMarket; // auction house — cross-zone player market (D1-backed)
  private contracts!: OnlineContracts; // daily contracts + reputation track (D1-backed)
  private buildBannerShown = false;
  private fixerBrief!: FixerBrief; // campaign brief (THE WAKE) — never the dailies board
  private npcTalk!: NpcTalkPanel; // multi-choice citizen services (heal / job / rumor…)
  private cosmetics!: OnlineCosmetics; // wardrobe / transmog (cosmetic-only, wallet-owned)
  private stashPanel!: OnlineStash; // TENEMENT lockbox — personal safe storage (D1-backed)
  private mapPanel!: OnlineMap; // fast-travel map with per-account discovery fog
  private baseLook?: PlayerLook; // your base appearance (cosmetics merge on top for rendering)
  private chatPanel!: OnlineChatPanel;
  private lastChatShown = 0;
  private rosterText!: Phaser.GameObjects.Text;
  private tradeText!: Phaser.GameObjects.Text;
  private trackerG!: Phaser.GameObjects.Graphics; // backing frame behind the objective tracker
  private trackerBottomY = 0; // where the boss banner may start
  private intelEventMaxW = 0; // fixed top-rail width used by the per-frame event countdown
  private intelRailX = 0;
  private intelRailW = 0;
  private questText!: Phaser.GameObjects.Text;
  private dailyText!: Phaser.GameObjects.Text; // active daily contract — the immediate objective
  private bountyText!: Phaser.GameObjects.Text; // active authored NPC bounty
  private storyPanel!: Phaser.GameObjects.Text;
  /** Hold campaign / fragment dialogue until this timestamp (ms, performance.now). */
  private storyHoldUntil = 0;
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
  private isDive = false; // ICE VAULT — the instanced fragment dive (v0–v6)
  private isBridge = false; // wilderness corridor between two districts
  private isEstates = false; // THE ESTATES — the residential street of purchasable homes
  private bridgeIndex = -1;
  private fromZone = "d0"; // district to return to when leaving the safehouse
  private districtDoors: { tx: number; ty: number; dest: string }[] = []; // FRLG walk-in doors
  private doorTransit = false; // an auto walk-in/walk-out is underway — fire once
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
  private footerHintBg?: Phaser.GameObjects.Graphics;
  private zoneMinimap?: OnlineMinimap;
  private questLog!: RsQuestLog;
  private rsActionBar?: RsActionBar;
  private rsGameMessage!: RsGameMessage;
  /** Double-ESC quit arm (avoids accidental title dumps). */
  private quitConfirmArmed = false;
  private quitConfirmUntil = 0;
  private readonly attackRange = 200;
  // zone interactables — service operatives (open a system), authored citizens (flavour),
  // and doors (travel into a building interior)
  private npcs: ZoneNpc[] = [];
  private nearNpc: ZoneNpc | null = null;
  private interactPrompt?: Phaser.GameObjects.Text;
  private speechBubble?: Phaser.GameObjects.Text;
  // painted bust chip shown beside the bubble when an authored NPC speaks
  private speechPortrait?: Phaser.GameObjects.Image;
  private speechPortraitRing?: Phaser.GameObjects.Graphics;

  // THE ESTATES — home interior state (ownership prompt + furniture editor)
  private homeIdx = -1;
  private homeFurnLayer?: Phaser.GameObjects.Container;
  private homeEditing = false;
  private homeSelKind: string | null = null;
  private homeDraft: FurniturePiece[] = [];
  private homeUi: Phaser.GameObjects.GameObject[] = [];
  private homeGhostG?: Phaser.GameObjects.Graphics; // cursor ghost while placing furniture
  private estatePlateObjs: Phaser.GameObjects.GameObject[] = []; // FOR SALE / owner plates on the street
  // ambient pedestrians strolling the hub streets — pure client-side set dressing
  private wanderers: { spr: Phaser.GameObjects.Sprite; x: number; y: number; tx: number; ty: number; speed: number; pauseUntil: number; bob: number }[] = [];
  private wandererGrid: TileGrid | null = null; // which grid the wanderers path on (hub or estates)
  // HOUSING REGISTRY — the estates street's featured-homes board
  private registryObjs: Phaser.GameObjects.GameObject[] = [];
  private registryOpen = false;
  // Overlay orchestration (open-state, ESC routing, mobile ✕) — see online/PanelRouter.
  private panelRouter!: PanelRouter;

  private isTutorial = false;
  private tutorialPanel!: Phaser.GameObjects.Text;
  private tutorialSkipBtn!: Phaser.GameObjects.Text;
  private tutorialSkipSub?: Phaser.GameObjects.Text;
  private mobilePad?: MobileControls;
  private lastDashGhostAt = 0;
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
  /** Long-press → context menu on touch (no right-click). */
  private longPressTimer?: Phaser.Time.TimerEvent;
  private longPressPtr: { x: number; y: number; id: number } | null = null;
  private longPressConsumed = false;
  constructor() {
    super("Online");
  }

  preload() {
    const sheets = [
      [PORTRAIT_CAST_KEY, "assets/portraits/cast_sheet.jpg"],
      [PORTRAIT_KEEPERS_KEY, "assets/portraits/keepers_sheet.jpg"],
      [PORTRAIT_RESIDENTS_KEY, "assets/portraits/residents_sheet.jpg"],
      [PORTRAIT_INTERACT_KEY, "assets/portraits/interact_sheet.jpg"],
      [PORTRAIT_BOSSES_KEY, "assets/portraits/bosses_sheet.jpg"],
    ] as const;
    for (const [key, file] of sheets) {
      if (!this.textures.exists(key)) this.load.spritesheet(key, file, { frameWidth: 256, frameHeight: 256 });
    }
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
    const diveIdx = parseDiveZone(rawZone);
    this.isDive = diveIdx >= 0;
    const named =
      !!INTERIOR_TITLES[rawZone] ||
      rawZone === "subway" ||
      rawZone === TUTORIAL_ZONE ||
      rawZone === ESTATES_ZONE ||
      !!parseBuildingInterior(rawZone) ||
      parseHubInterior(rawZone) !== null ||
      parseEstateInterior(rawZone) !== null ||
      this.isBridge ||
      this.isDive;
    this.zone = this.isBridge ? rawZone : named ? rawZone : "d" + this.parseZone(data?.zone);
    this.isTutorial = this.zone === TUTORIAL_ZONE;
    // Fresh skip state each time we enter the drill (registry survives zone hops).
    if (this.isTutorial) this.registry.remove("tutorialSkipFired");
    this.interior =
      !!INTERIOR_TITLES[this.zone] ||
      this.zone === "safe" ||
      this.zone === ESTATES_ZONE ||
      !!parseBuildingInterior(this.zone) ||
      parseHubInterior(this.zone) !== null ||
      parseEstateInterior(this.zone) !== null; // hub plaza + estates street + all building/home interiors
    this.isCityHub = this.zone === "safe";
    this.isEstates = this.zone === ESTATES_ZONE;
    this.isSubway = this.zone === "subway";
    this.fromZone = data?.from ?? "d0"; // where 'H' returns to from inside an interior
    // Persist offline resume (zone + ensure profile exists even if they only had registry state).
    this.persistLocalRunnerSnapshot();
    this.homeIdx = -1; // reset home-editor state unless this zone is an est{K} interior
    this.homeEditing = false;
    this.homeUi = []; // scene restart destroyed the objects — drop the stale refs
    this.homeFurnLayer = undefined;
    this.homeGhostG = undefined;
    this.homeDraft = [];
    this.hudPanelImg = null;
    this.trackerPanelImg = null;
    this.estatePlateObjs = [];
    this.wanderers = []; // scene restart destroyed the sprites — drop the stale refs
    this.wandererGrid = null;
    this.registryObjs = [];
    this.registryOpen = false;
    this.districtDoors = [];
    this.doorTransit = false; // scene instances are reused across zone starts — reset triggers
    this.districtIndex = this.isDive
      ? diveIdx
      : this.interior
        ? 0
        : this.isBridge
          ? getBridge(bridgeIdx).fromDistrict
          : this.parseZone(data?.zone);
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
        : this.isSubway || this.isDive
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
        : this.isDive
          ? buildDive()
          : this.isCityHub
            ? ONLINE_CITY.grid
            : this.interior
              ? this.isEstates
                ? ESTATES.grid
                : parseEstateInterior(this.zone) !== null
                  ? buildHomeRoom()
                  : parseBuildingInterior(this.zone) || parseHubInterior(this.zone) !== null
                    ? buildVenueRoom(this.zone)
                    : buildSafehouse()
              : this.isBridge
                ? buildBridgeGrid(bridgeDef!)
                : buildGrid(def);
    this.zoneGrid = grid;
    const dims = gridDims(grid);
    this.worldW = dims.worldW;
    this.worldH = dims.worldH;
    this.pvpZones = pvpZonesFor(this.worldW, this.worldH, this.zone);
    const zoneAccent = this.isTutorial
      ? 0x29e7ff
      : this.isDive
        ? 0x9fe8ff // ICE — frozen-mind cyan
        : this.isCityHub
          ? 0x39ff88
          : this.isBridge
            ? bridgeDef!.accent
            : def.accent;
    this.zoneAccent = zoneAccent;
    const terrainProfile: TerrainProfile = this.isTutorial
      ? "tutorial"
      : this.isCityHub
        ? "city"
        : this.interior
          ? "interior"
          : this.isSubway || this.isDive
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
        !this.isCityHub && !this.interior && !this.isSubway && !this.isDive && !this.isTutorial && !this.isBridge ? districtBuildings(def) : undefined,
      districtId: def?.id,
      // High-contagion districts (undercity / core / wastes) get infected exteriors mixed in.
      infected: !!def && (def.id === "undercity" || def.id === "wastes" || def.contagion >= 14),
      lightweight: this.isCityHub,
    });
    if (this.isCityHub) {
      paintCityEnvWash(this, ONLINE_CITY.zones);
      paintCityBuildingFacades(this, ONLINE_CITY.buildings);
      paintCityStorefrontReflections(this, ONLINE_CITY.buildings);
      this.roofParallax = installRoofParallax(this, ONLINE_CITY.buildings.map((b) => b.rect), zoneAccent);
    }
    if (this.isBridge) {
      scatterWildernessProps(this, grid, zoneAccent, 4, bridgeDef!.layout.biome);
    } else if (this.isCityHub || (!this.interior && !this.isSubway && !this.isDive && !this.isTutorial)) {
      scatterWorldProps(this, grid, 4, this.isCityHub ? 0.003 : 0.006);
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
    } else if (!this.interior && !this.isSubway && !this.isDive && !this.isTutorial) {
      this.atmosphere = new Atmosphere(this, {
        weather: def.weather,
        accent: zoneAccent,
        worldW: this.worldW,
        worldH: this.worldH,
      });
      for (let i = 0; i < districtBuildings(def).length; i += 3) {
        const b = districtBuildings(def)[i];
        const cx = ((b.x1 + b.x2) / 2) * TILE * 2 + TILE / 2;
        const cy = ((b.y1 + b.y2) / 2) * TILE * 2 + TILE / 2;
        this.atmosphere.addHologram(cx, cy, zoneAccent);
      }
      const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
      const adjWall = (x: number, y: number) =>
        isWall(grid[y]?.[x - 1]) || isWall(grid[y]?.[x + 1]) || isWall(grid[y - 1]?.[x]) || isWall(grid[y + 1]?.[x]);
      let placed = 0;
      for (let ty = 1; ty < grid.length - 1 && placed < 12; ty++) {
        for (let tx = 1; tx < grid[ty].length - 1; tx++) {
          if (isWall(grid[ty][tx]) || !adjWall(tx, ty)) continue;
          const h = hash(tx, ty);
          if (h % 10 !== 0) continue;
          const px = tx * TILE + TILE / 2;
          const py = ty * TILE + TILE / 2;
          const pick = h % 3;
          const key = pick === 0 ? PROP_STREETLIGHT_KEY : pick === 1 ? PROP_VENDING_KEY : PROP_AC_KEY;
          const tall = key === PROP_STREETLIGHT_KEY;
          this.add.image(px, py + TILE / 2, key).setOrigin(0.5, tall ? 1 : 0.85).setDepth(4);
          placed++;
        }
      }
      paintRooftopLights(this, districtBuildings(def), (b) => ({ x1: b.x1 * 2, y1: b.y1 * 2, x2: b.x2 * 2, y2: b.y2 * 2 }), () => zoneAccent);
      this.roofParallax = installRoofParallax(
        this,
        districtBuildings(def).map((b) => ({ x1: b.x1 * 2, y1: b.y1 * 2, x2: b.x2 * 2, y2: b.y2 * 2 })),
        zoneAccent,
      );
    }
    // Interiors play zoomed-in (FRLG readability). Zoomed rooms get an UNBOUNDED
    // follow camera so the runner — including the arrival spawn on the south mat —
    // sits dead-centre on screen; bounds clamping was pinning arrivals to the room
    // edge. The void past the walls reads like a GBA interior. Streets/combat zones
    // keep bounds + the full field of view.
    const interiorZoom = this.interior && !this.isCityHub && !this.isEstates ? 2 : 1;
    if (interiorZoom === 1) this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    installUiCamera(this, interiorZoom);
    this.applyNeon();
    fadeInScene(this, zoneAccent);
    if (!this.interior && !this.isSubway && !this.isDive && !this.isTutorial && !this.isCityHub) this.drawPvpZones();
    // Every district building gets an enterable door on its south face — walk up + E (or click)
    // drops you into that building's interior ("d{N}i{K}"); H returns to the district.
    if (!this.interior && !this.isSubway && !this.isDive && !this.isTutorial && !this.isCityHub && !this.isBridge) {
      districtBuildings(def).forEach((b, i) => {
        // door colour matches the building's roof (buildingExteriorAccent) so you can
        // read "amber shop / magenta bar" at a glance and orient by landmark colour
        const doorColor = buildingExteriorAccent(districtBuildingKind(i));
        const tx = Math.round((b.x1 + b.x2) / 2) * DISTRICT_SCALE;
        const doorstep = b.y2 * DISTRICT_SCALE + 1; // walkable street tile just south of the south wall
        if (grid[doorstep]?.[tx] === undefined || isWall(grid[doorstep][tx])) return;
        this.makeDoor({
          dest: `d${this.districtIndex}i${i}`,
          label: DISTRICT_VENUE_TITLE[districtBuildingKind(i)],
          tile: [tx, doorstep],
          color: doorColor,
          flat: true,
        });
        // FRLG doorway carved into the south face — dark opening, lit lintel, light seam
        const dg = this.add.graphics().setDepth(4.5);
        const wx = tx * TILE;
        const wy = (doorstep - 1) * TILE;
        dg.fillStyle(0x05060f, 0.96).fillRect(wx + 6, wy + 8, TILE - 12, TILE - 8);
        dg.fillStyle(doorColor, 0.9).fillRect(wx + 4, wy + 5, TILE - 8, 3);
        dg.lineStyle(2, doorColor, 0.65).strokeRect(wx + 6, wy + 8, TILE - 12, TILE - 8);
        dg.fillStyle(0xeafdff, 0.22).fillRect(wx + TILE / 2 - 2, wy + 14, 4, TILE - 14);
        this.add.image(wx + TILE / 2, wy + TILE / 2, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(doorColor).setDepth(4.4).setScale(0.42).setAlpha(0.3);
        // FRLG walk-in: pressing up while on the doorstep enters (E/click still works)
        this.districtDoors.push({ tx, ty: doorstep, dest: `d${this.districtIndex}i${i}` });
      });
      this.dressDistrictWeather();
    }
    if (this.isTutorial) this.buildTutorialZone();
    if (this.interior) {
      if (this.isCityHub) {
        this.add
          .text(this.worldW / 2, 4 * TILE, INTERIOR_TITLES.safe, displayFont(18, { color: "#39ff88", fontStyle: "bold" }))
          .setOrigin(0.5)
          .setDepth(6)
          .setShadow(0, 0, "#39ff88", 8, true, true)
          .setAlpha(0.85);
        // One short line — the old multi-clause subtitle competed with every stall/door label.
        this.add
          .text(this.worldW / 2, 4 * TILE + 22, "safe zone · talk to THE FIXER · deploy south", bodyFont(10, { color: "#6b7184" }))
          .setOrigin(0.5)
          .setDepth(6);
        for (const hubNpc of CITY_HUB_NPCS) {
          const px = hubNpc.tile[0] * TILE + TILE / 2;
          const py = hubNpc.tile[1] * TILE + TILE / 2;
          const key = lookKey(hubNpc.look);
          bakeRemoteLook(this, key, hubNpc.look);
          // Stall shows TAG only (FORGE / VENDOR…) — name appears on hover / interact bubble.
          this.drawServiceStall(px, py, hubNpc.name, hubNpc.tag, hubNpc.color);
          const isFixer = hubNpc.svc === "contracts";
          // THE FIXER is the first-session north star — brighter beacon than other stalls.
          const g = this.add
            .image(px, py + 6, GLOW_KEY)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(hubNpc.color)
            .setDepth(8)
            .setScale(isFixer ? 0.85 : 0.5)
            .setAlpha(isFixer ? 0.55 : 0.4);
          if (isFixer) {
            this.tweens.add({
              targets: g,
              alpha: { from: 0.35, to: 0.7 },
              scale: { from: 0.75, to: 1.05 },
              duration: 900,
              yoyo: true,
              repeat: -1,
              ease: "Sine.inOut",
            });
          }
          const spr = this.add.sprite(px, py, key, 0).setTint(0xffffff).setDepth(9).setInteractive({ useHandCursor: true }).setScale(1.12);
          spr.on("pointerdown", () => this.openService(hubNpc.svc));
          this.npcs.push({ kind: "service", svc: hubNpc.svc, name: `${hubNpc.name} · ${hubNpc.tag}`, x: px, y: py });
        }
        for (const door of CITY_HUB_DOORS) this.makeDoor(door);
        for (const c of CITY_HUB_CITIZENS) {
          const cdef = npcDef(c.id);
          if (!cdef) continue;
          const px = c.tile[0] * TILE + TILE / 2;
          const py = c.tile[1] * TILE + TILE / 2;
          // story allies react to the player's questline act; ambient citizens keep static lines
          const isAlly = (STORY_ALLIES as readonly string[]).includes(c.id);
          const lines = isAlly ? campaignAllyLines(c.id, this.net?.campaignQuest) : cdef.lines;
          // No permanent floating name tags — hover reveals them (see makeTalkNpc).
          this.makeTalkNpc(cdef.name, cdef.look, lines, px, py, cdef.id, isAlly);
        }
        // EVERY building on the plaza is enterable — wire each one's door to its own h{K}
        // interior (a distinct resident lives inside). FRLG walk-in + click/E both enter.
        ONLINE_CITY.buildings.forEach((b, k) => {
          if (!b.door) return;
          const [dtx, dty] = b.door;
          if (isWall(grid[dty]?.[dtx] as number)) return;
          const dest = `h${k}`;
          const doorColor = HUB_DOOR_COLOR[b.kind] ?? 0x8dfff0;
          this.makeDoor({ dest, label: HUB_INTERIOR_TITLE[b.kind] ?? "BUILDING", tile: [dtx, dty], color: doorColor, flat: true });
          const dg = this.add.graphics().setDepth(4.5);
          const wx = dtx * TILE;
          const wy = (dty - 1) * TILE;
          dg.fillStyle(0x05060f, 0.96).fillRect(wx + 6, wy + 8, TILE - 12, TILE - 8);
          dg.fillStyle(doorColor, 0.9).fillRect(wx + 4, wy + 5, TILE - 8, 3);
          dg.lineStyle(2, doorColor, 0.6).strokeRect(wx + 6, wy + 8, TILE - 12, TILE - 8);
          this.add.image(wx + TILE / 2, wy + TILE / 2, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(doorColor).setDepth(4.4).setScale(0.4).setAlpha(0.28);
          this.districtDoors.push({ tx: dtx, ty: dty, dest });
        });
        this.drawHubProps();
        this.spawnSkyTraffic();
        this.spawnHubWanderers();
        this.spawnTrainingYard(); // clickable drill targets near deploy — first combat without leaving hub
      } else if (this.isEstates) {
        this.buildEstatesZone();
      } else if (parseEstateInterior(this.zone) !== null) {
        this.buildHomeInterior(parseEstateInterior(this.zone)!);
      } else {
        const bi = parseBuildingInterior(this.zone);
        const hb = bi ? null : parseHubInterior(this.zone);
        const isBldg = !!bi || hb !== null;
        const kind = bi ? districtBuildingKind(bi.index) : hb !== null ? ONLINE_CITY.buildings[hb].kind : this.zone;
        const accent = bi ? (DISTRICTS[bi.district]?.accent ?? 0x39ff88) : hb !== null ? (HUB_DOOR_COLOR[kind] ?? 0x39ff88) : 0x39ff88;
        const venueTitle = DISTRICT_VENUE_TITLE[kind as keyof typeof DISTRICT_VENUE_TITLE];
        const title =
          INTERIOR_TITLES[this.zone] ?? (isBldg ? `▣ ${venueTitle ?? HUB_INTERIOR_TITLE[kind] ?? kind.toUpperCase()}` : "▣ INTERIOR");
        const backName = bi ? (DISTRICTS[bi.district]?.name ?? "the district") : "METRO CITY";
        this.add
          .text(this.worldW / 2, 4 * TILE, title, { fontFamily: "Courier New, monospace", fontSize: "20px", color: "#39ff88", fontStyle: "bold" })
          .setOrigin(0.5)
          .setDepth(6);
        this.add
          .text(this.worldW / 2, 4 * TILE + 26, isBldg ? `no combat · talk: E · step on the door mat to leave` : `no combat · talk: E · H to return to ${backName}`, {
            fontFamily: "Courier New, monospace",
            fontSize: "11px",
            color: "#9aa3b2",
          })
          .setOrigin(0.5)
          .setDepth(6);
        // seat the room's occupants. Every building interior (district + hub) gets its own
        // DISTINCT named resident so every door opens on a unique face; the safehouse keeps
        // its authored keeper + residents.
        const residents = INTERIOR_PLAN[this.zone]?.[0] ?? [];
        const occupants = bi
          ? [districtResident(bi.district, bi.index)]
          : hb !== null
            ? [hubResident(hb)]
            : [keeperFor(kind), ...residents.map((id) => npcDef(id)).filter((d): d is NonNullable<typeof d> => !!d)];
        const seats = isBldg ? venueLayoutFor(this.zone).seats : INTERIOR_NPC_TILES;
        occupants.forEach((o, i) => {
          const [tx, ty] = seats[i % seats.length];
          this.makeTalkNpc(o.name, o.look, o.lines, tx * TILE + TILE / 2, ty * TILE + TILE / 2, o.id);
        });
        // venue services — each service-kind building DOES something: shop=vendor caches,
        // home=personal stash, guild=cell registrar + forge, den=black market, bar=contracts
        if (isBldg) {
          const VENUE_SERVICES: Record<string, { svc: string; name: string; tag: string; color: number; look: PlayerLook }[]> = {
            shop: [{ svc: "vendor", name: "CLERK", tag: "WARES", color: 0x00e5ff, look: hubLook({ color: 0x00e5ff, skin: 0xe6b58c, hair: "buzz", hairColor: 0x2a1d14 }) }],
            home: [{ svc: "stash", name: "CUSTODIAN", tag: "LOCKBOX", color: 0xffb13c, look: hubLook({ color: 0xffb13c, skin: 0xc98a5e, hair: "bun", hairColor: 0x1b1820 }) }],
            guild: [
              { svc: "guild", name: "REGISTRAR", tag: "CELL", color: 0x4d8cff, look: hubLook({ color: 0x4d8cff, skin: 0xf3d2b8, hair: "short", hairColor: 0x4a2f1c, beard: "stubble", cloak: "coat" }) },
              { svc: "forge", name: "ARMORER", tag: "FORGE", color: 0xff2bd6, look: hubLook({ color: 0xff2bd6, sex: "f", skin: 0xe6b58c, hair: "undercut", hairColor: 0x1b1820, gloves: "wraps" }) },
            ],
            den: [{ svc: "market", name: "FENCE", tag: "BLACK MARKET", color: 0xff2bd6, look: hubLook({ color: 0xff2bd6, head: "hood", skin: 0xa9794a, hair: "short", hairColor: 0x1b1820, cloak: "coat" }) }],
            bar: [{ svc: "contracts", name: "FIXER", tag: "THE WAKE", color: 0x9dff3c, look: hubLook({ color: 0x9dff3c, skin: 0x7c4f30, hair: "dreads", hairColor: 0x1b1820, cloak: "coat" }) }],
          };
          (VENUE_SERVICES[kind] ?? []).forEach((s, j) => {
            const [tx, ty] = seats[(occupants.length + j) % seats.length];
            const px = tx * TILE + TILE / 2;
            const py = ty * TILE + TILE / 2;
            const key = lookKey(s.look);
            bakeRemoteLook(this, key, s.look);
            this.add.image(px, py + 8, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(s.color).setDepth(8).setScale(0.6).setAlpha(0.45);
            const spr = this.add.sprite(px, py, key, 0).setTint(0xffffff).setDepth(9).setInteractive({ useHandCursor: true });
            spr.on("pointerdown", () => this.openService(s.svc));
            drawHubNpcPlate(this, px, py, s.name, s.tag, s.color);
            this.npcs.push({ kind: "service", svc: s.svc, name: `${s.name} · ${s.tag}`, x: px, y: py });
          });
          // the exit — an FRLG door mat against the south wall; stepping on it walks out
          const [matTx, matTy] = venueLayoutFor(this.zone).mat;
          const matX = matTx * TILE;
          const matY = matTy * TILE;
          const mg = this.add.graphics().setDepth(2.5);
          mg.fillStyle(0x0a0e18, 0.9).fillRect(matX + 3, matY + 2, TILE - 6, TILE - 4);
          mg.lineStyle(2, accent, 0.85).strokeRect(matX + 3, matY + 2, TILE - 6, TILE - 4);
          mg.fillStyle(accent, 0.35).fillRect(matX + 7, matY + TILE - 9, TILE - 14, 3);
          this.add
            .text(matX + TILE / 2, matY + TILE / 2 - 2, "▼", { fontFamily: "Courier New, monospace", fontSize: "13px", color: "#eafdff", fontStyle: "bold" })
            .setOrigin(0.5)
            .setDepth(2.6);
          this.dressVenueRoom(kind, accent);
        } else {
          this.dressServiceRoom(kind, accent);
        }
      }
    } else if (this.isBridge && bridgeDef) {
      this.buildBridgeZone(bridgeDef);
    } else if (this.isDive) {
      // ICE VAULT — the instanced dive: guardians + the fragment core come from the
      // server; the client dresses the vault and points at the core chamber.
      this.add
        .text(this.worldW / 2, 4 * TILE, `▼ ICE VAULT — ${DISTRICTS[this.districtIndex].name}`, {
          fontFamily: "Courier New, monospace",
          fontSize: "20px",
          color: "#9fe8ff",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(6);
      this.add
        .text(this.worldW / 2, 4 * TILE + 26, "break the guardians · channel the core · free the memory · H to surface", {
          fontFamily: "Courier New, monospace",
          fontSize: "11px",
          color: "#9aa3b2",
        })
        .setOrigin(0.5)
        .setDepth(6);
      this.dressDive(grid);
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
      this.dressSubwayLife();
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
      // ICE SHAFT — the way down into this district's instanced dive (fragment core).
      // First walkable candidate near the spawn plaza wins.
      const shaftSpots: [number, number][] = [
        [sx * S + 4, sy * S - 5],
        [sx * S - 4, sy * S - 5],
        [sx * S + 8, sy * S + 3],
        [sx * S, sy * S + 8],
      ];
      for (const tile of shaftSpots) {
        if (isWall(grid[tile[1]]?.[tile[0]])) continue;
        this.makeDoor({ dest: `v${this.districtIndex}`, label: "▼ ICE SHAFT", tile, color: 0x9fe8ff });
        break;
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
    // painted speaker bust docked to the bubble's left edge (portraits.ts sheets)
    const ps = uiDim(56);
    this.speechPortraitRing = this.add.graphics().setDepth(12).setVisible(false);
    this.speechPortraitRing.fillStyle(0x0b0716, 0.92).fillRect(-ps / 2 - uiDim(3), -ps / 2 - uiDim(3), ps + uiDim(6), ps + uiDim(6));
    this.speechPortraitRing.lineStyle(uiDim(2), 0x29e7ff, 0.85).strokeRect(-ps / 2 - uiDim(3), -ps / 2 - uiDim(3), ps + uiDim(6), ps + uiDim(6));
    this.speechPortrait = this.add.image(0, 0, "__WHITE").setDepth(12.1).setVisible(false);
    // Mobile gets a bigger, pill-backed prompt — it doubles as the tap target for
    // doors/NPCs, so it has to read (and press) like a button under a thumb. It sits
    // above the bottom hotbar + menu rows there.
    this.interactPrompt = this.add
      .text(
        this.scale.width / 2,
        this.mobileUx() ? this.scale.height - uiDim(176) : onlineHudStack(this.scale.height).interactY,
        "",
        this.mobileUx()
          ? displayFont(16, {
              color: "#39ff88",
              fontStyle: "bold",
              align: "center",
              backgroundColor: "#07130add",
              padding: { x: uiDim(18), y: uiDim(12) },
            })
          : displayFont(14, { color: "#39ff88", fontStyle: "bold", align: "center" }),
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1200)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    // Tap the prompt on phones (no E key).
    this.interactPrompt.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      ptr.event?.stopPropagation?.();
      this.doInteract();
    });
    // Mobile landscape: floating stick + action arc + surface exit.
    if (this.mobileUx()) {
      if (this.isSubway || this.isDive || (this.interior && !this.isCityHub)) {
        // Top-right: the old top-centre slot is the phone hotbar band.
        const surface = this.add
          .text(this.scale.width - uiDim(12), uiDim(8), "▲ SURFACE", displayFont(14, {
            color: "#eafdff",
            fontStyle: "bold",
            backgroundColor: "#0b0716dd",
            padding: { x: uiDim(16), y: uiDim(10) },
          }))
          .setOrigin(1, 0)
          .setScrollFactor(0)
          .setDepth(1200)
          .setInteractive({ useHandCursor: true });
        surface.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
          ptr.event?.stopPropagation?.();
          this.travelOrganic(this.fromZone);
        });
      }
      this.mobilePad = new MobileControls(this, {
        onDash: () => this.tryDash(),
        onAbility: () => this.tryAbility(),
        onAbility2: () => this.tryAbility2(),
        onUlt: () => this.tryUlt(),
        onInteract: () => this.doInteract(),
      });
    }

    // Local player — your full customization (build/head/visor/shoulders/decal/cloak/
    // accessories), baked and tinted by your signature colour, the same as singleplayer.
    bakeCustomPlayer(this, cust);
    this.me = this.add
      .sprite(this.worldW / 2, this.worldH / 2, PLAYER_CUSTOM_KEY, 0)
      .setTint(0xffffff) // baked in final colours — render untinted
      .setDepth(10)
      .setVisible(false);
    this.meShadow = this.groundShadow(this.me.x, this.me.y);
    // focal ring — a bright cyan "you" marker under the LOCAL player only, so you can
    // always find yourself in a busy world (remotes never get one). Pulses in update().
    this.meRing = this.add.graphics().setDepth(6).setVisible(false);
    this.meRing.lineStyle(4, 0x39ffea, 0.16).strokeCircle(0, 0, 16);
    this.meRing.lineStyle(1.5, 0x8dfff0, 0.95).strokeCircle(0, 0, 16);
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
    // Pages + localhost WS footgun — surface in the world, not only the console.
    if (typeof location !== "undefined") {
      const host = location.hostname || "";
      const publicHost = host && host !== "localhost" && host !== "127.0.0.1";
      if (publicHost && /\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(SERVER_URL)) {
        this.time.delayedCall(200, () => {
          this.add
            .text(VIEW_W / 2, VIEW_H / 2, "⚠ BUILD MISCONFIGURED\nClient targets localhost.\nRebuild with VITE_SERVER_URL=wss://…/ws", {
              fontFamily: "Courier New, monospace",
              fontSize: "14px",
              color: "#ff3b6b",
              align: "center",
              backgroundColor: "#0b0716ee",
              padding: { x: 16, y: 12 },
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(5000);
        });
      }
    }
    this.faction = factionForColor(this.color); // your cell, from your signature colour
    this.nodeG = this.add.graphics().setDepth(5); // node capture rings (world-space)
    this.hazardG = this.add.graphics().setDepth(8); // boss AoE telegraphs (under shots/players)
    // Send your look so every other player renders your customization (not a generic body).
    this.baseLook = customizationToLook(cust); // cosmetics merge onto this for the rendered avatar
    const fastArrival = !!this.registry.get("fastTravel");
    this.registry.set("fastTravel", false);
    this.net = new NetClient(grid, this.callsign, url, this.faction, this.baseLook);
    this.net.classId = (this.registry.get("classId") as string) || "metrophage";
    this.net.arrival = fastArrival ? "fast" : "organic";
    this.net.travelFrom = fastArrival ? undefined : this.fromZone;
    this.wireHomeAfterNet(); // if this is an est{K} home, hook estate updates + furniture placement
    this.net.onCampaign = () => {
      this.refreshAllyLines(); // story allies re-react as the questline advances
      if (this.questLog?.open) this.refreshQuestLog();
      // Returning players / wiped localStorage: unlock hub systems if campaign is live.
      noteCampaignProgress(!!this.net.campaignQuest || (this.net.campaignCompleted?.length ?? 0) > 0);
    };
    this.net.onStory = () => this.presentStoryBeat();
    this.net.onBounty = () => {
      const b = this.net.bounty;
      if (b && b.progress >= b.count) {
        noteSecondBountyDone();
        const npcId = b.id.includes("_") ? b.id.split("_")[0] : "";
        // Best-effort memory key from bounty id prefix
        if (npcId) noteNpcBountyDone(npcId);
      }
      this.journal?.setOwned(this.net.fragments);
    };
    const tutorialMode =
      data?.tutorialMode ?? (this.registry.get("tutorialMode") as TutorialMode | undefined) ?? getSettings().tutorialMode;
    if (this.isTutorial) this.registry.set("tutorialMode", tutorialMode);

    this.net.onConnectionState = (state) => {
      this.connectionState = state;
      if (state === "connected") this.connectStartedAt = Date.now();
      if (state === "reconnecting") {
        this.rsGameMessage?.show("Reconnecting to the grid…", { ttlMs: 2800, color: "#f7ff3c" });
      }
      if (state === "offline") {
        this.rsGameMessage?.show("Link lost — solo preview until rejoin", { ttlMs: 3500, color: "#ff7a9a" });
      }
      this.hudRefreshAcc = OnlineScene.HUD_REFRESH_MS;
      this.minimapRefreshAcc = OnlineScene.MINIMAP_REFRESH_MS;
    };
    this.net.onWelcome = (x, y) => {
      this.drillLocal = null;
      this.restoreLocalBody();
      this.me.setPosition(x, y).setVisible(true);
      this.cameras.main.startFollow(this.me, true, 0.18, 0.18);
      setOnlinePlayer(this.net.id);
      this.journal?.setOwned(this.net.fragments);
      if (!this.buildBannerShown) {
        this.buildBannerShown = true;
        this.time.delayedCall(400, () => {
          this.rsGameMessage?.show(`build ${buildStamp()} · N memory · L dossier · /contacts`, {
            ttlMs: 4200,
            color: "#9fe8ff",
          });
        });
      }
      // District condition callout (combat zones)
      if (/^d\d+$/.test(this.zone)) {
        const mod = dailyDistrictMod(this.districtIndex);
        this.time.delayedCall(900, () => {
          this.rsGameMessage?.show(`◈ ${mod.name} — ${mod.blurb}`, { ttlMs: 4500, color: "#f7ff3c" });
        });
      }
      if (this.isTutorial) this.net.setTutorialMode(tutorialMode);
      if (this.net.godMode) {
        setGodSessionUnlock(true);
        if (this.mapPanel) this.mapPanel.godMode = true;
        // Skip drill yard entirely for operators.
        if (this.isTutorial) {
          this.time.delayedCall(200, () => this.forceClientDeployToCity());
        }
        // Visible HUD cue so god is obvious.
        this.time.delayedCall(400, () => {
          if (!this.sys.isActive() || !this.net?.godMode) return;
          this.hud?.setColor("#f7ff3c");
          this.showBubble(this.me?.x ?? 0, this.me?.y ?? 0, "◆ GOD MODE — full access");
        });
      }
      this.initCombatTracking();
      juiceFlash(this, 180, 40, 200, 80);
    };
    this.net.onRedirect = (zone) => {
      // Flush current zone first, then hand off (avoids dual-session race with graduate).
      void (async () => {
        await this.net?.disconnectAwait(2500);
        if (this.scene.isActive("Online")) this.travelOrganic(zone);
      })();
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
      this.stashPanel?.refresh(this.net.stash, this.net.inventory); // bag column live-updates
    };
    this.shop = new OnlineShop(this);
    this.shop.onBuy = (sku) => this.net.buy(sku);
    this.forge = new OnlineForge(this);
    this.forge.onCraft = (action, id, id2) => this.net.craft(action, id, id2);
    // HTTP base for cross-zone reads (leaderboards): ws(s)://host/ws → http(s)://host
    const httpBase = SERVER_URL.replace(/^ws/, "http").replace(/\/ws$/, "");
    this.board = new OnlineBoard(this, httpBase);
    this.journal = new OnlineJournal(this);
    this.guildPanel = new OnlineGuild(this);
    this.guildPanel.onAction = (action, c, k) => {
      if (action === "leave") this.net.guildAction("leave");
      else if (action === "info") this.net.guildAction("info");
      else if (action === "claim_goal") this.net.guildAction("claim_goal");
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
    this.fixerBrief = new FixerBrief(this);
    this.npcTalk = new NpcTalkPanel(this);
    this.npcTalk.onPick = (service, npcId, npcName) => this.applyNpcService(service, npcId, npcName);
    this.net.onContracts = () => {
      if (this.contracts.open) this.contracts.setState(this.net.contracts, this.net.rep);
      this.shop.setRep(this.net.repTier); // higher vendor caches unlock with reputation
    };
    this.cosmetics = new OnlineCosmetics(this);
    this.cosmetics.onAction = (action, id) => this.net.cosmeticAction(action, id);
    this.stashPanel = new OnlineStash(this);
    this.stashPanel.onDeposit = (id) => this.net.stashAction("deposit", id);
    this.stashPanel.onWithdraw = (id) => this.net.stashAction("withdraw", id);
    this.net.onStash = () => this.stashPanel.refresh(this.net.stash, this.net.inventory);
    this.net.onFragment = (_id, isNew) => {
      // the vault cracks — a beat of white-out + the story panel carries the memory
      juiceFlash(this, 300, 159, 232, 255);
      juiceZoomPunch(this, 0.05, 220);
      juiceShake(this, 180, 0.004);
      this.synth?.levelUp();
      if (isNew) this.pops?.popHeal(this.me.x, this.me.y - 28, "MEMORY RECOVERED");
      if (this.questLog.open) this.refreshQuestLog();
    };
    this.net.onCosmetics = () => {
      if (this.cosmetics.open) this.cosmetics.setState(this.net.cosmeticsOwned, this.net.cosmeticEquipped, this.net.credits);
      this.applyLocalCosmetic(); // retint your own avatar to match the equipped transmog
    };
    this.mapPanel = new OnlineMap(this, this.contextMenu);
    this.mapPanel.onTravel = (zone) => this.fastTravel(zone);
    this.mapPanel.onWalkToZone = (zone) => this.walkToZoneFromMap(zone);
    this.mapPanel.onExamine = (text) => this.rsExamine(text);
    this.net.onDiscovered = () => {
      this.mapPanel.godMode = !!this.net.godMode;
      if (this.mapPanel.open) this.mapPanel.setState(this.net.discovered, this.net.unlocked, this.zone);
    };
    this.inv.onMove = (from, to) => this.net.moveInv(from, to);
    // World-boss locator: a status banner + a screen-edge arrow toward an off-screen boss.
    // The banner rides just below the objective tracker (y updated in updateBossLocator).
    this.bossBanner = this.add
      .text(VIEW_W / 2, uiDim(48), "", hudFont(11, { color: "#39ff88", fontStyle: "bold", align: "center" }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
    this.bossBanner.setWordWrapWidth(Math.min(this.scale.width - uiDim(32), uiDim(720)));
    this.bossBanner.setShadow(0, 0, "#02030a", 4, true, true);
    this.bossArrow = this.add
      .text(0, 0, "➤", { fontFamily: "Arial, sans-serif", fontSize: uiFont(24), color: "#39ff88", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
    this.bossArrow.setShadow(0, 0, "#02030a", 6, true, true);
    // Quest waypoint — same locator pattern as the boss arrow, tinted campaign-violet:
    // an edge arrow while the objective is off-screen, a bobbing marker above it when
    // visible. Target resolved at HUD refresh (resolveQuestTarget), tracked per frame.
    this.questArrow = this.add
      .text(0, 0, "➤", { fontFamily: "Arial, sans-serif", fontSize: uiFont(20), color: "#b06bff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
    this.questArrow.setShadow(0, 0, "#02030a", 6, true, true);
    this.questMarker = this.add
      .text(0, 0, "", hudFont(10, { color: "#b06bff", fontStyle: "bold", align: "center" }))
      .setOrigin(0.5, 1)
      .setDepth(20)
      .setVisible(false);
    this.questMarker.setShadow(0, 0, "#02030a", 5, true, true);
    // Live world-event row — laid into the shared top intel rail by layoutHudChrome().
    this.eventBanner = this.add
      .text(VIEW_W / 2, uiDim(72), "", hudFont(9, { fontStyle: "bold", align: "center" }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
    this.eventBanner.setWordWrapWidth(Math.min(this.scale.width - uiDim(32), uiDim(720)));
    this.eventBanner.setShadow(0, 0, "#02030a", 4, true, true);
    // full-screen ambience wash — each event owns the district's light while it runs
    // (below the HUD chrome at depth 999+, above the world; UI camera, so no post-FX)
    this.eventOverlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(990)
      .setAlpha(0);
    this.net.onWorldEvent = (phase, name) => {
      if (phase === "active") {
        juiceFlash(this, 200, 255, 255, 255);
        juiceShake(this, 160, 0.004);
        this.rsGameMessage?.show(`⚠ ${name} — NOW`, { ttlMs: 2600, color: this.net.worldEvent?.hex ?? "#f7ff3c" });
      } else if (phase === "end") {
        this.rsGameMessage?.show("event weathered — payout issued", { ttlMs: 2600, color: "#39ff88" });
      }
    };
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
    this.hudPanelG = this.add.graphics().setScrollFactor(0).setDepth(999);
    this.hud = this.add
      .text(uiDim(12) + panelPadInner(), uiDim(12) + panelPadInner(), "connecting…", hudFont(11, { color: "#39ff88", lineSpacing: uiGap("xs") }))
      .setScrollFactor(0)
      .setDepth(1000);
    if (getSettings().highContrast) this.hud.setStroke("#02030a", uiDim(3));
    // Mobile: the bottom edge belongs to the hotbar + menu rows, and every control is
    // labelled on-screen anyway (MOVE ghost, ATK/Q/E/R, Bag/Map…) — drop the hint line.
    // Desktop: always-on solid control bar (never fade — was unreadable at low alpha).
    const showFooter = !this.mobileUx();
    this.footerHintBg = this.add.graphics().setScrollFactor(0).setDepth(1098).setVisible(showFooter);
    this.footerHint = this.add
      .text(this.scale.width / 2, hudStack.footerHintY - uiDim(4), this.controlHint(), bodyFont(12, {
        color: "#eafdff",
        align: "center",
        fontStyle: "bold",
      }))
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1099)
      .setVisible(showFooter)
      .setAlpha(1)
      .setShadow(0, 1, "#000000", 4, true, true);
    this.layoutFooterHint();
    this.options.setOnChange(() => {
      MusicDirector.for(this)?.applyVolumes();
      this.synth?.applyVolumes();
      this.footerHint.setText(this.controlHint());
      this.layoutFooterHint();
      if (getSettings().highContrast) this.hud.setStroke("#02030a", uiDim(3));
      else this.hud.setStroke("#000000", 0);
    });

    this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(1000);
    // death sequence — SIGNAL LOST card over a blood-dark wash + reboot countdown
    this.deathOverlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x0a0208, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setAlpha(0);
    this.deadText = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - uiDim(24), "", displayFont(30, { color: "#ff3b6b", fontStyle: "bold" }))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);
    this.deadText.setShadow(0, 0, "#2a0510", 8, true, true);
    this.deathSub = this.add
      .text(this.scale.width / 2, this.scale.height / 2 + uiDim(16), "", hudFont(12, { color: "#9aa3b2", align: "center" }))
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
    // Enterable doors read on the radar as gold ticks (districts, hub, estates street).
    if (this.districtDoors.length) {
      this.zoneMinimap.setPois(
        this.districtDoors.map((d) => ({ x: d.tx * TILE + TILE / 2, y: d.ty * TILE + TILE / 2 })),
        this,
      );
    }
    this.zoneMinimap.onWalk = (wx, wy) => {
      if (!this.usingRsControls() || this.blockRsInput()) return;
      this.attackTargetId = null;
      this.pendingInteract = null;
      const pos = this.playerPos();
      this.clickMove.setDestination(wx, wy, this.zoneGrid, pos.x, pos.y);
    };
    this.questLog = new RsQuestLog(this);
    this.tileCursor.setGrid(this.zoneGrid);
    this.rsSkills = loadRsSkills();
    this.rsSkillsPanel = new RsSkillsPanel(this, this.rsSkills);
    const simpleHud = getSettings().uiDensity === "new";
    // Simple HUD: Bag / Map / Quests only — market & skills open via keys once you need them.
    const mobile = this.mobileUx();
    this.rsActionBar = new RsActionBar(
      this,
      simpleHud
        ? [
            { key: "inv", label: "Bag", sub: mobile ? "tap" : "I", color: 0x00e5ff, onClick: () => this.inv?.toggle() },
            { key: "map", label: "Map", sub: mobile ? "tap" : "M", color: 0x39ff88, onClick: () => this.mapPanel?.toggle(this.net.discovered, this.net.unlocked, this.zone) },
            { key: "quests", label: "Quests", sub: mobile ? "tap" : "J", color: 0xb06bff, onClick: () => this.refreshQuestLog(true) },
            // keep key consistent in both mobile/desktop bars
            { key: "dailies", label: "Dailies", sub: mobile ? "tap" : "C", color: 0x00e5ff, onClick: () => this.contracts?.toggle(this.net.contracts, this.net.rep) },
            ...(mobile
              ? [
                  { key: "chat", label: "Chat", sub: "tap", color: 0x9aa3b2, onClick: () => this.openChat() },
                  // Touch has no 'O' key — Settings needs an on-screen entry point.
                  { key: "opts", label: "Opts", sub: "tap", color: 0x8dfff0, onClick: () => this.options?.toggle() },
                ]
              : []),
          ]
        : [
            { key: "inv", label: "Bag", sub: mobile ? "tap" : "I", color: 0x00e5ff, onClick: () => this.inv?.toggle() },
            { key: "skills", label: "Skills", sub: mobile ? "tap" : "'", color: 0xf7ff3c, onClick: () => this.rsSkillsPanel.toggle() },
            { key: "map", label: "Map", sub: mobile ? "tap" : "M", color: 0x39ff88, onClick: () => this.mapPanel?.toggle(this.net.discovered, this.net.unlocked, this.zone) },
            { key: "market", label: "Market", sub: mobile ? "tap" : "K", color: 0xff2bd6, onClick: () => this.market?.toggle(this.net.marketListings, this.net.inventory, this.net.id, this.net.credits, this.net.metro) },
            { key: "quests", label: "Quests", sub: mobile ? "tap" : "J", color: 0xb06bff, onClick: () => this.refreshQuestLog(true) },
            // keep key consistent in both mobile/desktop bars
            { key: "dailies", label: "Dailies", sub: mobile ? "tap" : "C", color: 0x00e5ff, onClick: () => this.contracts?.toggle(this.net.contracts, this.net.rep) },
            ...(mobile
              ? [
                  { key: "chat", label: "Chat", sub: "tap", color: 0x9aa3b2, onClick: () => this.openChat() },
                  // Touch has no 'O' key — Settings needs an on-screen entry point.
                  { key: "opts", label: "Opts", sub: "tap", color: 0x8dfff0, onClick: () => this.options?.toggle() },
                ]
              : []),
          ],
    );
    // Overlay orchestration: registration order = close-priority order (the ESC path).
    // Closures read live fields, so panels constructed later are still covered.
    this.panelRouter = new PanelRouter(this);
    const reg = (open: () => boolean, close: () => void) => this.panelRouter.register({ open, close });
    reg(() => !!this.options?.isOpen, () => this.options!.close());
    reg(() => !!this.shop?.open, () => this.shop.close());
    reg(() => !!this.forge?.open, () => this.forge.close());
    reg(() => !!this.market?.open, () => this.market.close());
    reg(() => !!this.stashPanel?.open, () => this.stashPanel.close());
    reg(() => !!this.contracts?.open, () => this.contracts.close());
    reg(() => !!this.fixerBrief?.isOpen, () => this.fixerBrief.close());
    reg(() => !!this.npcTalk?.isOpen, () => this.npcTalk.close());
    reg(() => !!this.board?.open, () => this.board.close());
    reg(() => !!this.guildPanel?.open, () => this.guildPanel.close());
    reg(() => !!this.cosmetics?.open, () => this.cosmetics.close());
    reg(() => !!this.rsSkillsPanel?.open, () => this.rsSkillsPanel.close());
    reg(() => !!this.questLog?.open, () => this.questLog.close());
    reg(() => !!this.mapPanel?.open, () => this.mapPanel.close());
    reg(() => this.registryOpen, () => this.toggleRegistry());
    reg(() => !!this.inv?.open, () => this.inv.close());
    // Touchscreens have no ESC key — give every overlay a universal tap-to-close.
    if (mobile) this.panelRouter.buildMobileCloseButton();
    // DEV: testability probe for the E2E panel smoke (tools/panel-smoke.mjs).
    if (import.meta.env.DEV) {
      (window as unknown as { __panelProbe?: unknown }).__panelProbe = {
        anyOpen: () => this.anyPanelOpen(),
        closeTop: () => this.closeTopPanel(),
        closeBtnShown: () => this.panelRouter.closeButtonShown(),
        closeBtnXY: () => this.panelRouter.closeButtonXY(),
        // camera-juice hook for tools/zoom-ratchet-probe.mjs (overlap regression)
        zoomPunch: () => juiceZoomPunch(this, 0.07, 160),
        camZoom: () => this.cameras.main.zoom,
      };
    }
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.contextMenu.isOpen()) {
        if (!pointer.rightButtonDown()) this.contextMenu.hide();
        return;
      }
      if (pointer.rightButtonDown()) {
        this.handleRightClick(pointer);
        return;
      }
      // Furnishing mode owns world clicks (place/remove) — never pathfind underneath.
      if (this.homeEditing) return;
      if (!this.usingRsControls()) return;
      // Virtual stick / action buttons own the gesture — never pathfind under thumbs.
      if (this.mobilePad?.containsScreen(pointer.x, pointer.y)) return;
      // HUD / kit buttons / interactive sprites own the gesture — don't pathfind under them.
      const hits = this.input.hitTestPointer(pointer);
      if (
        hits.some((go) => {
          const o = go as Phaser.GameObjects.GameObject & { scrollFactorX?: number; depth?: number };
          return (o.scrollFactorX ?? 1) === 0 || (o.depth ?? 0) >= 1000;
        })
      ) {
        return;
      }
      // Mobile: hold for context menu; short tap walks/attacks on release.
      if (this.mobileUx()) {
        this.beginLongPress(pointer);
        return;
      }
      this.handleLeftClick(pointer);
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.endMobilePointer(pointer);
    });
    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => {
      this.endMobilePointer(pointer);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.longPressPtr || this.longPressPtr.id !== pointer.id) return;
      const dx = pointer.x - this.longPressPtr.x;
      const dy = pointer.y - this.longPressPtr.y;
      // Drag cancels long-press menu but still walks on release from new pos.
      if (dx * dx + dy * dy > 22 * 22) {
        this.longPressTimer?.remove(false);
        this.longPressTimer = undefined;
      }
    });
    if (this.isCityHub) this.spawnMiningNodes([hubT(-2, 2), hubT(2, 6), hubT(-4, 8)]);

    const mapChain = this.registry.get("pendingMapDest") as string | undefined;
    if (mapChain && mapChain !== this.zone && this.usingRsControls() && !this.isTutorial) {
      this.time.delayedCall(650, () => this.walkToZoneFromMap(mapChain));
    }

    // area chat panel (bottom-left) — everyone in this zone sees the same feed.
    // Mobile: compact + lifted so it doesn't sit under the virtual stick.
    const mobileHud = this.mobileUx();
    const chatH = uiDim(mobileHud ? 88 : 176);
    const chatW = uiDim(mobileHud ? 280 : 380);
    const chatX = mobileHud ? this.scale.width / 2 - chatW / 2 : uiDim(12);
    // Mobile: top-center under the tracker + coach band (44..~180) — the bottom edge
    // belongs to the hotbar + menu rows now.
    const chatY = mobileHud
      ? uiDim(190)
      : onlineHudStack(this.scale.height).hotbarY - uiGap("sm") - chatH;
    this.chatPanel = new OnlineChatPanel(this, chatX, chatY, chatW, chatH, 1000);
    this.chatPanel.setArea(this.chatAreaLabel());
    // Drill yard on a phone: the lesson card owns the centre — the passive chat feed
    // just collides with it (the Chat button / overlay still works).
    if (mobileHud && this.isTutorial) this.chatPanel.setVisible(false);
    // online roster — right edge, tucked under the area map
    this.rosterText = this.add
      .text(this.scale.width - uiDim(14), uiDim(206), "", hudFont(9, { color: "#9aa3b2", align: "right" }))
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.tradeText = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - uiDim(70), "", hudFont(12, {
        color: "#f7ff3c",
        align: "center",
        backgroundColor: "#0b0716cc",
        padding: { x: uiDim(14), y: uiDim(10) },
      }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1005)
      .setVisible(false);
    // objective tracker — quest / contract / bounty stacked top-center on one frame,
    // laid out in refreshHudPanels() as rows appear and disappear
    this.trackerG = this.add.graphics().setScrollFactor(0).setDepth(999);
    this.questText = this.add
      .text(this.scale.width / 2, uiDim(12), "", hudFont(8, { color: "#c9a0ff", align: "left", fontStyle: "bold" }))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.dailyText = this.add
      .text(this.scale.width / 2, 0, "", hudFont(7, { color: "#39ff88", align: "left" }))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.bountyText = this.add
      .text(this.scale.width / 2, 0, "", hudFont(7, { color: "#f7ff3c", align: "left" }))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    // Compact story toast (was a large mid-screen banner).
    this.storyPanel = this.add
      .text(this.scale.width / 2, this.scale.height * (this.mobileUx() ? 0.28 : 0.14), "", hudFont(10, {
        color: "#eafdff",
        align: "center",
        backgroundColor: "#0b0716f0",
        padding: { x: uiDim(12), y: uiDim(8) },
        wordWrap: { width: uiDim(380) },
      }))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1900)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.storyPanel.setWordWrapWidth(Math.min(this.scale.width - uiDim(80), uiDim(380)));
    this.storyPanel.on("pointerdown", () => {
      this.storyHoldUntil = 0;
      this.storyPanel.setVisible(false);
    });
    // First-session coach — one slim line.
    this.coachText = this.add
      .text(this.scale.width / 2, uiDim(44), "", hudFont(9, {
        color: "#39ff88",
        fontStyle: "bold",
        align: "center",
        backgroundColor: "#05070fe8",
        padding: { x: uiDim(10), y: uiDim(4) },
      }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1001);
    this.coachText.setWordWrapWidth(Math.min(this.scale.width - uiDim(64), uiDim(420)));
    this.killFeedText = this.add
      .text(this.scale.width - uiDim(14), this.scale.height * 0.42, "", hudFont(10, {
        color: "#ff8a9a",
        align: "right",
      }))
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setAlpha(0.9);
    this.enemyHpG = this.add.graphics().setDepth(9.2);

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
      // SPACE near the current instructor (or for soft-clear lessons) advances the drill
      // without dashing. Kit still needs a real dash — only skip dash when it would
      // soft-clear a non-kit lesson, or when standing next to the matching instructor.
      if (e.key === " " && this.isTutorial && this.net?.connected) {
        const step = tutorialStepAt(this.net.tutorialStep, this.net.tutorialMode);
        if (step) {
          const nearMatch =
            this.nearNpc?.kind === "instructor" && this.nearNpc.lessonKind === step.kind;
          // Kit lesson: SPACE must dash (count includes dash). All other instructor
          // lessons can soft-clear with SPACE when near the right trainer.
          if (nearMatch && step.kind !== "kit") {
            const need = Math.max(1, step.count - (this.net.tutorialProgress || 0));
            this.net.reportTutorial(step.kind, need);
            return;
          }
          if (!nearMatch && isTutorialTalkKind(step.kind) && step.kind !== "kit" && step.kind !== "fire" && step.kind !== "kill") {
            // Briefings / systems: SPACE anywhere is a fallback if the player misses the NPC.
            const need = Math.max(1, step.count - (this.net.tutorialProgress || 0));
            this.net.reportTutorial(step.kind, need);
            return;
          }
        }
      }
      if (e.key === "i" || e.key === "I") {
        this.inv.toggle();
        if (this.inv.open) noteOpenedGear();
        return;
      }
      if (this.inv.open && e.key === "Escape") {
        this.inv.close(); // ESC closes the bag first, before it exits the scene
        return;
      }
      if (this.registryOpen && e.key === "Escape") {
        this.toggleRegistry();
        return;
      }
      // home controls run BEFORE the global B=shop / G=forge bindings, or they'd shadow
      // these inside an est{K} home: (F)urnish, (B)uy, si(G)n the guestbook
      if ((e.key === "f" || e.key === "F") && this.homeIdx >= 0 && this.net.estate?.mine && !this.homeEditing) {
        this.startFurnishing();
        return;
      }
      if ((e.key === "b" || e.key === "B") && this.homeIdx >= 0 && !this.homeEditing) {
        const es = this.net.estate;
        if (es && (!es.owner || es.forSale) && !es.mine) this.net.estateBuy();
        return;
      }
      if ((e.key === "g" || e.key === "G") && this.homeIdx >= 0 && !this.homeEditing) {
        const es = this.net.estate;
        if (es?.owner && !es.mine) this.net.estateSign();
        return;
      }
      // ── contextual key router ────────────────────────────────────────────
      // Home (estates) owns B/G/F before global shop/forge/guild. First-hour
      // funnel locks secondary systems until THE FIXER talk (tutorial exempt).
      if (e.key === "b" || e.key === "B") {
        this.tryOpenCitySystem(() => {
          this.shop.toggle();
          if (this.shop.open) this.reportTutorialPanel("vendor");
        });
        return;
      }
      if (this.shop.open && e.key === "Escape") {
        this.shop.close();
        return;
      }
      if (e.key === "e" || e.key === "E") {
        this.doInteract();
        return;
      }
      if (e.key === "g" || e.key === "G") {
        this.tryOpenCitySystem(() => {
          this.forge.setState(this.net.inventory, this.net.equipped, this.net.credits, this.net.cores);
          this.forge.toggle();
          if (this.forge.open) {
            noteSecondForge();
            this.reportTutorialPanel("craft");
          }
        });
        return;
      }
      if (this.forge.open && e.key === "Escape") {
        this.forge.close();
        return;
      }
      // U = Cell (guild) — C is dailies; G is forge.
      if (e.key === "u" || e.key === "U") {
        this.tryOpenCitySystem(() => {
          this.net.guildAction("info");
          this.guildPanel.toggle(this.net.guild, this.net.id);
          if (this.guildPanel.open) this.reportTutorialPanel("guild");
        });
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
        this.tryOpenCitySystem(() => {
          this.board.toggle(this.net.achievements, this.net.id);
          if (this.board.open) this.reportTutorialPanel("board");
        });
        return;
      }
      if (this.board.open && e.key === "Escape") {
        this.board.close();
        return;
      }
      if (e.key === "n" || e.key === "N") {
        // Memory journal — fragments from ICE dives (always allowed; discovery loop).
        this.journal.toggle(this.net.fragments);
        return;
      }
      if (this.journal?.open && e.key === "Escape") {
        this.journal.close();
        return;
      }
      if (this.guildPanel.open && e.key === "Escape") {
        this.guildPanel.close();
        return;
      }
      if (e.key === "k" || e.key === "K") {
        this.tryOpenCitySystem(() => {
          this.market.toggle(this.net.marketListings, this.net.inventory, this.net.id, this.net.credits, this.net.metro);
          if (this.market.open) this.reportTutorialPanel("market");
        });
        return;
      }
      if (this.market.open && e.key === "Escape") {
        this.market.close();
        return;
      }
      // Q belongs to the class signature ability now (as the class cards promise);
      // the quest log lives on J and the action-bar button.
      if (this.questLog.open && e.key === "Escape") {
        this.questLog.close();
        return;
      }
      if (e.key === "j" || e.key === "J") {
        // J = QUEST LOG (main / side / completed). Daily contracts board is C.
        if (this.fixerBrief?.isOpen) this.fixerBrief.close();
        this.refreshQuestLog(true);
        if (this.questLog.open) this.reportTutorialPanel("panel");
        return;
      }
      if (e.key === "c" || e.key === "C") {
        // Daily contracts (action-bar "Dailies" · C). Cell/guild opens via service NPC or /ginfo.
        this.tryOpenCitySystem(() => {
          this.contracts.toggle(this.net.contracts, this.net.rep);
          if (this.contracts.open) {
            noteOpenedContracts();
            this.reportTutorialPanel("contracts");
          }
        });
        return;
      }
      if (this.fixerBrief?.isOpen && e.key === "Escape") {
        this.fixerBrief.close();
        return;
      }
      if (this.npcTalk?.isOpen && e.key === "Escape") {
        this.npcTalk.close();
        return;
      }
      if (this.contracts.open && e.key === "Escape") {
        this.contracts.close();
        return;
      }
      if (this.stashPanel.open && e.key === "Escape") {
        this.stashPanel.close();
        return;
      }
      if (e.key === "y" || e.key === "Y") {
        this.tryOpenCitySystem(() => {
          this.cosmetics.toggle(this.net.cosmeticsOwned, this.net.cosmeticEquipped, this.net.credits);
          if (this.cosmetics.open) this.reportTutorialPanel("cosmetics");
        });
        return;
      }
      if (this.cosmetics.open && e.key === "Escape") {
        this.cosmetics.close();
        return;
      }
      if (e.key === "m" || e.key === "M") {
        // Map is always allowed — discovery + deploy pathfinding are part of the funnel.
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
          this.showBubble(this.me.x, this.me.y, "Finish the drill — or hit SKIP TO CITY (top-right).");
          return;
        }
        const indoors = this.interior || this.isSubway || this.isDive;
        const dest = indoors ? this.fromZone : "safe";
        // leaving a district-building interior tells the district WHICH door to spawn at;
        // all other exits keep their classic entry spawn
        const from = indoors ? (parseBuildingInterior(this.zone) ? this.zone : undefined) : this.zone;
        this.travelOrganic(dest, from ? { from } : undefined);
        return;
      }
      if (e.key === "v" || e.key === "V") {
        this.openWheel();
        this.reportTutorialPanel("emote");
        return;
      }
      if (e.key === " " || e.key === "Shift") {
        this.tryDash();
        return;
      }
      if (e.key === "q" || e.key === "Q") {
        this.tryAbility();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        if (this.net.connected) {
          this.tryUlt(); // class ultimate — HEAT-gated, no cooldown
          return;
        }
        this.connectStartedAt = Date.now();
        this.net.retryConnect();
        return;
      }
      if (e.key === "Enter" || e.key === "t" || e.key === "T") {
        this.openChat();
      } else if (e.key === "Escape") {
        // Story toast first (bounty / memory) — don't dump to menu mid-dialogue.
        if (this.storyHoldUntil > performance.now() || this.storyPanel?.visible) {
          this.storyHoldUntil = 0;
          this.storyPanel?.setVisible(false);
          return;
        }
        // Cancel home furnish before quitting to title.
        if (this.homeEditing) {
          this.homeEditing = false;
          this.homeSelKind = null;
          this.homeDraft = [];
          this.homeGhostG?.clear();
          this.refreshHome();
          this.showBubble(this.me.x, this.me.y, "furnish cancelled");
          return;
        }
        if (this.closeTopPanel()) return;
        // Accidental ESC is common — confirm before dumping to title.
        if (this.quitConfirmArmed && performance.now() < this.quitConfirmUntil) {
          this.quitConfirmArmed = false;
          this.net.disconnect();
          this.scene.start("Select");
          return;
        }
        this.quitConfirmArmed = true;
        this.quitConfirmUntil = performance.now() + 2500;
        this.showBubble(this.me.x, this.me.y, "Press ESC again to quit to title");
        this.rsGameMessage?.show("ESC again to quit to title", { ttlMs: 2500, color: "#f7ff3c" });
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
      this.sceneConnectGen++;
      this.unmountMobileChatInput();
      this.cancelLongPress();
      this.net?.disconnect();
      setOnlinePlayer(null);
    });

    // Big outdoor maps drown the renderer in static decor (measured: hub 3.5k objects,
    // 4 FPS on integrated GPUs). Cell-cull the ground band once the zone is fully built.
    // The hub counts: it's flagged `interior` (no-combat) but is the biggest map of all.
    if (this.isCityHub || (!this.interior && !this.isSubway && !this.isDive && !this.isTutorial)) {
      const culled = installDecorCulling(this);
      if (import.meta.env.DEV) console.info(`[decor-cull] adopted ${culled.adopted} objects into ${culled.cells} cells`);
    }
  }

  /**
   * Keep a device-local runner profile so CONTINUE works without MetaMask.
   * Guest server progress still keys off callsign + device secret on login.
   */
  private isGuestRun(): boolean {
    const wallet = this.registry.get("walletAddress") as string | undefined;
    const guest =
      !wallet &&
      (!!this.registry.get("guestPlay") ||
        !!this.registry.get("offlinePlay"));
    return guest;
  }

  private persistLocalRunnerSnapshot() {
    if (!this.isGuestRun()) return;
    const cust = this.registry.get("customization") as Customization | undefined;
    if (!cust?.callsign) return;
    const classId = (this.registry.get("classId") as string) || "metrophage";
    // Keep device secret on the profile every time we touch it (CONTINUE must never mint a new one).
    const deviceSecret = ensureGuestDeviceSecret(cust.callsign);
    writeLocalRunner({
      callsign: cust.callsign,
      classId,
      customization: cust,
      lastZone: this.zone,
      deviceSecret,
    });
  }

  /**
   * Wallet identity for WS login — prefer a silent path so zone travel never
   * re-opens MetaMask:
   *  1) fresh title-screen signature (≤2 min)
   *  2) device session secret (bound after first successful signed login)
   *  3) only then prompt MetaMask (first connect / session never bound)
   */
  private async signInThenConnect() {
    // Generation token: ignore auth completion if the scene was shut down mid-await
    // (Esc to title / zone travel) so we never open a zombie socket.
    const gen = (this.sceneConnectGen = (this.sceneConnectGen ?? 0) + 1);
    const stillHere = () => this.sceneConnectGen === gen && this.sys?.isActive?.() !== false && !!this.net;

    const guest = this.isGuestRun();
    let addr = guest
      ? undefined
      : (this.registry.get("walletAddress") as string | undefined) || connectedWallet() || undefined;
    if (!guest && !addr) {
      // Silent restore after page reload (eth_accounts — no popup).
      addr = (await restoreWalletSession()) ?? undefined;
      if (!stillHere()) return;
      if (addr) this.registry.set("walletAddress", addr);
    }
    if (!stillHere()) return;
    if (!guest && addr) {
      await this.applyWalletAuth(addr, /* allowPrompt */ false);
    }
    if (!stillHere()) return;
    // If session resume fails (never bound / new device), re-sign once silently-as-possible.
    this.net.onAuthRequired = () => {
      void (async () => {
        if (!stillHere() || this.isGuestRun()) return;
        const a =
          (this.registry.get("walletAddress") as string | undefined) || connectedWallet();
        if (!a) return;
        await this.applyWalletAuth(a, /* allowPrompt */ true);
        if (!stillHere()) return;
        this.net.retryConnect();
      })();
    };
    // Guest/wallet login rejected outright: surface the reason. In the drill yard,
    // still offer an immediate escape to the city instead of trapping them offline.
    this.net.onGuestAuthFailed = (reason) => {
      if (!stillHere()) return;
      this.registry.set("guestAuthError", reason);
      this.hud?.setColor("#ff3b6b");
      if (this.isTutorial) {
        this.hud?.setText([
          "⚠ SIGN-IN BLOCKED",
          reason,
          "Hit SKIP TO CITY (top-right) — or wait, returning to title…",
        ]);
        this.showOfflineSkipBanner();
        this.time.delayedCall(6000, () => {
          if (!stillHere() || !this.isTutorial) return;
          // Still on drill after 6s without a skip click → title with the error.
          transitionTo(this, "Select", undefined, { style: "glitch", accent: 0xff3b6b });
        });
        return;
      }
      this.hud?.setText(["⚠ SIGN-IN REJECTED", reason, "returning to title…"]);
      this.time.delayedCall(1400, () => {
        if (!stillHere()) return;
        transitionTo(this, "Select", undefined, { style: "glitch", accent: 0xff3b6b });
      });
    };
    this.net.connect();
  }

  /** Prefer cached sig → device session (silent) → optional MetaMask personal_sign. */
  private async applyWalletAuth(addr: string, allowPrompt: boolean) {
    // Always mint/load the device session so NetClient can attach it.
    walletSessionSecret(addr);
    const cached = this.registry.get("walletProof") as
      | { wallet: string; sig: string; ts: number }
      | undefined;
    // Match server FRESH_MS (120s) with a small safety margin.
    if (cached?.wallet && cached.sig && Math.abs(Date.now() - cached.ts) < 110_000) {
      this.net.setAuth({ wallet: cached.wallet, sig: cached.sig, ts: cached.ts });
      return;
    }
    if (!allowPrompt) {
      // Session resume — no personal_sign. Server accepts wallet + bound session.
      // If the session was never bound, onAuthRequired re-signs once.
      this.net.setAuth({ wallet: addr });
      return;
    }
    const ts = Date.now();
    const signed = await signWalletLogin(loginMessage(addr, ts), addr);
    if (signed) {
      // Fresh signature → rotate device session so stolen old secrets die.
      rotateWalletSessionSecret(signed.address);
      const proof = { wallet: signed.address, sig: signed.signature, ts };
      this.net.setAuth(proof);
      this.registry.set("walletProof", proof);
    }
  }

  /** Local wander spawn while the socket connects (tutorial + safe social zones). */
  private soloSpawnPoint(): { x: number; y: number } | null {
    let preferred: { x: number; y: number } | null = null;
    if (this.isTutorial) preferred = TUTORIAL_SPAWN;
    else if (this.isCityHub) preferred = CITY_HUB_SPAWN;
    // Compact FRLG rooms (district buildings, hub facades, estate homes) — mat entry tile.
    // SAFEHOUSE_SPAWN is centre of the large safehouse plan and sits OUTSIDE 15×11 walls.
    else if (isVenueSizedZone(this.zone)) preferred = venueSpawnFor(this.zone, this.zoneGrid);
    else if (isSafehouseSizedInterior(this.zone)) preferred = SAFEHOUSE_SPAWN;
    else if (this.interior && !this.isSubway) preferred = SAFEHOUSE_SPAWN;
    if (!preferred || !this.zoneGrid) return preferred;
    // Never park the drill/local preview inside walls.
    return resolveOpenSpawn(this.zoneGrid, preferred);
  }

  private playerPos(): { x: number; y: number } {
    if (this.drillLocal && !this.net.connected) return this.drillLocal;
    return this.net.pred;
  }

  private chatAreaLabel(): string {
    if (this.isTutorial) return "DRILL YARD";
    if (this.isCityHub) return "METRO CITY";
    if (this.isSubway) return "THE UNDERLINE";
    if (this.isDive) return `ICE VAULT ${this.zone.toUpperCase()}`;
    if (this.isEstates) return "THE ESTATES";
    if (this.interior && INTERIOR_TITLES[this.zone]) return INTERIOR_TITLES[this.zone]!;
    const estInt = parseEstateInterior(this.zone);
    if (estInt !== null) return `THE ESTATES · HOME ${estInt + 1}`;
    const hubInt = parseHubInterior(this.zone);
    if (hubInt !== null) return `METRO CITY · ${HUB_INTERIOR_TITLE[ONLINE_CITY.buildings[hubInt].kind] ?? "BUILDING"}`;
    const bldgInt = parseBuildingInterior(this.zone);
    if (bldgInt) return `${DISTRICTS[bldgInt.district]?.name?.toUpperCase() ?? "DISTRICT"} · ${DISTRICT_VENUE_TITLE[districtBuildingKind(bldgInt.index)]}`;
    if (this.isBridge) return getBridge(this.bridgeIndex).name;
    if (/^d\d+$/.test(this.zone)) return DISTRICTS[this.districtIndex]?.name?.toUpperCase() ?? this.zone.toUpperCase();
    if (/^w\d+$/.test(this.zone)) return getBridge(parseBridgeZone(this.zone)).name;
    return this.zone.toUpperCase();
  }

  /** Human-readable label for ANY zone id — interiors, homes, districts, corridors.
   *  (The naive `DISTRICTS[parseZone(z)]` fallback labels every named zone
   *  "PALANTIR PLAZA" because parseZone returns 0 for non-district ids.) */
  private zoneLabelFor(z: string): string {
    if (INTERIOR_TITLES[z]) return INTERIOR_TITLES[z]!;
    if (z === ESTATES_ZONE) return "THE ESTATES";
    if (z === "subway") return "THE UNDERLINE";
    const est = parseEstateInterior(z);
    if (est !== null) return `HOME ${est + 1}`;
    const hb = parseHubInterior(z);
    if (hb !== null) return HUB_INTERIOR_TITLE[ONLINE_CITY.buildings[hb].kind] ?? "BUILDING";
    const bi = parseBuildingInterior(z);
    if (bi) return DISTRICT_VENUE_TITLE[districtBuildingKind(bi.index)];
    if (/^d\d+$/.test(z)) return DISTRICTS[this.parseZone(z)]?.name ?? z.toUpperCase();
    if (/^w\d+$/.test(z)) return getBridge(parseBridgeZone(z)).name;
    return z.toUpperCase();
  }

  private openChat(prefill = "") {
    this.chatOpen = true;
    this.chatBuffer = prefill;
    this.chatPanel.setComposing(true, this.chatBuffer);
    // Mobile soft keyboard: Phaser keyboard often doesn't receive text on iOS/Android.
    if (this.mobileUx()) this.mountMobileChatInput();
  }
  private closeChat() {
    this.chatOpen = false;
    this.chatPanel.setComposing(false, "");
    this.unmountMobileChatInput();
  }

  private mobileChatEl: HTMLInputElement | null = null;

  private mobileChatWrap: HTMLDivElement | null = null;

  private mountMobileChatInput() {
    this.unmountMobileChatInput();
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;gap:8px;align-items:center;" +
      "padding:10px 10px max(12px,env(safe-area-inset-bottom));" +
      "background:linear-gradient(180deg,transparent,rgba(4,2,10,.94) 28%);" +
      "box-sizing:border-box;touch-action:manipulation;";
    const el = document.createElement("input");
    el.type = "text";
    el.autocomplete = "off";
    el.autocapitalize = "off";
    el.spellcheck = false;
    el.maxLength = 200;
    el.placeholder = "say something…";
    el.setAttribute("enterkeyhint", "send");
    el.style.cssText =
      "flex:1;min-width:0;box-sizing:border-box;padding:12px 14px;" +
      "font:14px 'IBM Plex Mono',monospace;color:#eafdff;" +
      "background:rgba(7,6,26,.96);border:1px solid #00e5ff;border-radius:6px;" +
      "outline:none;-webkit-user-select:text;user-select:text;touch-action:manipulation;";
    const send = document.createElement("button");
    send.type = "button";
    send.textContent = "SEND";
    send.style.cssText =
      "flex:0 0 auto;padding:12px 14px;font:12px 'IBM Plex Mono',monospace;font-weight:700;" +
      "letter-spacing:.08em;color:#04020a;background:#00e5ff;border:none;border-radius:6px;" +
      "touch-action:manipulation;";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "✕";
    cancel.style.cssText =
      "flex:0 0 auto;padding:12px 12px;font:14px 'IBM Plex Mono',monospace;" +
      "color:#9aa3b2;background:rgba(20,16,40,.95);border:1px solid #2a2440;border-radius:6px;" +
      "touch-action:manipulation;";
    el.addEventListener("input", () => {
      this.chatBuffer = el.value.slice(0, 200);
      this.renderChatInput();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submitChat();
        this.closeChat();
      }
    });
    send.addEventListener("click", (e) => {
      e.preventDefault();
      this.chatBuffer = el.value.slice(0, 200);
      this.submitChat();
      this.closeChat();
    });
    cancel.addEventListener("click", (e) => {
      e.preventDefault();
      this.closeChat();
    });
    wrap.append(el, send, cancel);
    document.body.appendChild(wrap);
    this.mobileChatWrap = wrap;
    this.mobileChatEl = el;
    window.setTimeout(() => el.focus(), 30);
  }

  private unmountMobileChatInput() {
    if (this.mobileChatEl) {
      try {
        this.mobileChatEl.blur();
      } catch {
        /* ignore */
      }
      this.mobileChatEl = null;
    }
    if (this.mobileChatWrap) {
      try {
        this.mobileChatWrap.remove();
      } catch {
        /* ignore */
      }
      this.mobileChatWrap = null;
    }
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
    else if (s === "/revive" || s.startsWith("/revive ")) this.net.sendParty("revive", s.slice(8).trim() || undefined);
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
    // Friends-lite — local recent / pinned contacts (no server graph).
    else if (s === "/contacts" || s === "/c") {
      const list = listRecentPlayers();
      if (!list.length) {
        this.pushKillFeed("no contacts yet — right-click a runner to pin");
        this.rsGameMessage?.show("No contacts yet — right-click a runner → Pin", { ttlMs: 3200, color: "#d4c45a" });
      } else {
        const lines = list.slice(0, 12).map((p) => `${p.pinned ? "★" : "·"} ${p.name}  (${p.id.slice(0, 16)})`);
        this.rsGameMessage?.show(`CONTACTS · /w <id> msg · ${list.length} saved`, { ttlMs: 4000, color: "#9fe8ff" });
        for (const line of lines) this.pushKillFeed(line);
      }
    } else if (s.startsWith("/pin ")) {
      const id = s.slice(5).trim();
      if (id) {
        pinRecentPlayer(id, true);
        noteRecentPlayer(id, id);
        this.rsGameMessage?.show(`Pinned ${id}`, { ttlMs: 2000, color: "#d4c45a" });
      }
    } else this.net.sendChat("zone", undefined, s);
  }

  private parseZone(z?: string): number {
    const m = z ? /^d(\d+)$/.exec(z) : null;
    const n = m ? parseInt(m[1], 10) : 0;
    return n >= 0 && n < DISTRICTS.length ? n : 0;
  }

  /** Open the panel a safehouse operative fronts (also bound to its proximity E / click). */
  private openService(svc: string) {
    const n = this.net;
    // FIXER / contracts is the first-hour north star — never lock it. Everything else waits.
    if (svc !== "contracts" && svc !== "stash" && firstHourSystemsLocked() && !this.isTutorial) {
      this.pointBlockedPlayerToFixer();
      return;
    }
    if (svc === "contracts") noteOpenedContracts();
    if (svc === "vendor" || svc === "forge" || svc === "market" || svc === "cosmetics") noteOpenedGear();
    if (svc === "vendor") noteSecondBuyCache();
    if (svc === "forge") noteSecondForge();
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
        // FIXER is campaign first (THE WAKE + talk beats). Daily contracts = C key.
        this.engageFixer();
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
      case "stash":
        this.stashPanel.toggle(n.stash, n.inventory);
        break;
      case "registry":
        this.toggleRegistry();
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
      .text(this.worldW / 2, 2 * TILE + 22, "walk east · do each lesson · talk (E) to instructors · portal at the end", {
        fontFamily: mono,
        fontSize: "10px",
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
        .text(lx, ly + 14, ch.subtitle, { fontFamily: mono, fontSize: "10px", color: "#6b7184" })
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

    // High-visibility skip — big enough to notice on load / mobile, works while linking.
    this.buildTutorialSkipCta();
  }

  /** Always-on SKIP control so runners can bail into the live city during cold start. */
  private buildTutorialSkipCta() {
    const btnW = uiDim(this.mobileUx() ? 180 : 210);
    const btnH = uiDim(this.mobileUx() ? 48 : 54);
    // Top-right on every device: the top-left corner belongs to the drill status
    // panel (they were overlapping on phones), and the minimap doesn't start until
    // y≈96 so even the mobile button clears it.
    const bx = this.scale.width - uiDim(this.mobileUx() ? 10 : 14) - btnW;
    const by = uiDim(this.mobileUx() ? 6 : 10);

    const bg = this.add.graphics().setScrollFactor(0).setDepth(2400);
    const drawBg = (hot: boolean) => {
      bg.clear();
      bg.fillStyle(hot ? 0x39ff88 : 0x0d1a14, hot ? 0.98 : 0.94);
      bg.fillRoundedRect(bx, by, btnW, btnH, uiDim(6));
      bg.lineStyle(uiDim(2), hot ? 0xffffff : 0x39ff88, 1);
      bg.strokeRoundedRect(bx, by, btnW, btnH, uiDim(6));
      if (!hot) {
        bg.fillStyle(0x39ff88, 0.14);
        bg.fillRoundedRect(bx + uiDim(2), by + uiDim(2), btnW - uiDim(4), btnH - uiDim(4), uiDim(4));
      }
    };
    drawBg(false);

    this.tutorialSkipBtn = this.add
      .text(bx + btnW / 2, by + uiDim(12), "SKIP TO CITY →", displayFont(this.mobileUx() ? 14 : 15, {
        color: "#39ff88",
        fontStyle: "bold",
      }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2401)
      .setShadow(0, 0, "#39ff88", 8, true, true);

    this.tutorialSkipSub = this.add
      .text(bx + btnW / 2, by + uiDim(32), "works offline · enter now", bodyFont(10, { color: "#9dffc4" }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2401);

    const zone = this.add
      .zone(bx, by, btnW, btnH)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(2402)
      .setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => {
      drawBg(true);
      this.tutorialSkipBtn.setColor("#041208");
      this.tutorialSkipSub?.setColor("#0a2014");
    });
    zone.on("pointerout", () => {
      drawBg(false);
      this.tutorialSkipBtn.setColor("#39ff88");
      this.tutorialSkipSub?.setColor("#9dffc4");
    });
    // Use pointerup so mobile kits that steal pointerdown still allow a clean skip.
    zone.on("pointerup", () => this.skipTutorialToCity());
    zone.on("pointerdown", () => this.skipTutorialToCity());

    this.tweens.add({
      targets: [this.tutorialSkipBtn, this.tutorialSkipSub],
      alpha: { from: 0.88, to: 1 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    // Backup center CTA if still offline after a few seconds (top-right easy to miss on phones).
    this.time.delayedCall(5000, () => {
      if (!this.isTutorial || !this.sys.isActive() || this.net?.connected) return;
      this.showOfflineSkipBanner();
    });
  }

  /** Large center button when the drill socket never links. */
  private showOfflineSkipBanner() {
    if (!this.isTutorial || this.net?.connected) return;
    const w = uiDim(this.mobileUx() ? 280 : 320);
    const h = uiDim(72);
    const x = (this.scale.width - w) / 2;
    const y = this.scale.height * 0.58;
    const g = this.add.graphics().setScrollFactor(0).setDepth(2450);
    g.fillStyle(0x0a0614, 0.92).fillRoundedRect(x, y, w, h, uiDim(8));
    g.lineStyle(uiDim(2), 0x39ff88, 0.95).strokeRoundedRect(x, y, w, h, uiDim(8));
    const label = this.add
      .text(x + w / 2, y + uiDim(18), "ENTER CITY ANYWAY →", displayFont(16, { color: "#39ff88", fontStyle: "bold" }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2451);
    const sub = this.add
      .text(x + w / 2, y + uiDim(42), "server still linking — skip the drill", bodyFont(11, { color: "#9aa3b2" }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2451);
    const hit = this.add
      .zone(x, y, w, h)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(2452)
      .setInteractive({ useHandCursor: true });
    const go = () => {
      g.destroy();
      label.destroy();
      sub.destroy();
      hit.destroy();
      this.skipTutorialToCity();
    };
    hit.on("pointerdown", go);
    hit.on("pointerup", go);
  }

  /** Skip drill immediately — server skip when linked; hard-jump to city when not. */
  private skipTutorialToCity() {
    if (!this.isTutorial || !this.net) return;
    // Prevent double-fire from pointerdown+up.
    if (this.registry.get("tutorialSkipFired")) return;
    this.registry.set("tutorialSkipFired", true);
    this.tutorialSkipBtn?.setText("DEPLOYING…");
    this.tutorialSkipSub?.setText("opening the city");

    if (this.net.connected) {
      this.net.tutorialSkip();
      // Failsafe: if redirect never arrives (D1 hang, race), leave client-side.
      this.time.delayedCall(2500, () => {
        if (!this.isTutorial || !this.sys.isActive()) return;
        this.forceClientDeployToCity();
      });
      return;
    }

    // Offline / still linking: queue skip for when welcome lands, AND leave now.
    this.net.tutorialSkip();
    this.showBubble(
      this.me?.x ?? 0,
      this.me?.y ?? 0,
      "Deploying to the city — linking continues in the background.",
    );
    this.forceClientDeployToCity();
  }

  /** Client-side leave for drill yard when the socket cannot graduate us. */
  private forceClientDeployToCity() {
    if (!this.sys.isActive()) return;
    try {
      localStorage.setItem("metrophage_tutorial_skip_v1", "1");
    } catch {
      /* ignore */
    }
    this.registry.set("tutorialMode", getSettings().tutorialMode);
    void this.net?.disconnectAwait(800).finally(() => {
      if (!this.sys.isActive()) return;
      transitionTo(this, "Online", { zone: "safe" }, { style: "deploy", accent: 0x39ff88 });
    });
  }

  private reportTutorialPanel(kind: string) {
    if (!this.isTutorial) return;
    const step = tutorialStepAt(this.net.tutorialStep, this.net.tutorialMode);
    // Full mode collapses many panels into one count-N "panel" lesson; quick uses panel once.
    if (step?.kind === "panel") this.net.reportTutorial("panel");
    else if (step?.kind === kind) this.net.reportTutorial(kind);
  }

  /** First-hour funnel: secondary systems stay closed until THE FIXER talk. */
  private tryOpenCitySystem(open: () => void): boolean {
    if (this.isTutorial) {
      open();
      return true;
    }
    if (firstHourSystemsLocked()) {
      this.pointBlockedPlayerToFixer();
      return false;
    }
    open();
    return true;
  }

  /** A first-hour lock fired — don't just say "talk to THE FIXER", point there.
   *  In the hub the green waypoint can mark him directly; anywhere else the map
   *  (never locked) opens so travelling to the hub is one tap, not a scavenger hunt. */
  private pointBlockedPlayerToFixer() {
    if (this.isCityHub) {
      const fixer = CITY_HUB_NPCS.find((n) => n.svc === "contracts");
      if (fixer) {
        this.questTarget = {
          x: fixer.tile[0] * TILE + TILE / 2,
          y: fixer.tile[1] * TILE + TILE / 2,
          label: "THE FIXER",
        };
      }
      this.showBubble(this.me?.x ?? 0, this.me?.y ?? 0, "Locked until you take a job. Follow the green ◆ to THE FIXER.");
      return;
    }
    this.showBubble(this.me?.x ?? 0, this.me?.y ?? 0, "Locked until you take a job from THE FIXER — he's in METRO HUB.");
    // Surface the travel tool instead of leaving the player to find it.
    if (!this.mapPanel?.open) this.mapPanel?.toggle(this.net.discovered, this.net.unlocked, this.zone);
  }

  /** Phone / tablet primary UX — do NOT use Phaser's touch flag (true on most desktops). */
  private mobileUx(): boolean {
    return prefersMobileUx();
  }

  /**
   * RS click-to-walk: opt-in on desktop; on mobile, tap still paths when the
   * D-pad is idle (phones also get directional arrows + action buttons).
   * Tutorial also allows click/tap pathing so runners can walk chamber-to-chamber
   * without fighting pure-WASD (was a soft-lock between instructors on trackpads).
   */
  private usingRsControls(): boolean {
    if (prefersMobileUx()) return true;
    if (this.isTutorial) return true; // drill yard: click-walk between instructors
    return getSettings().rsControls;
  }

  private beginLongPress(pointer: Phaser.Input.Pointer) {
    this.cancelLongPress();
    this.longPressConsumed = false;
    this.longPressPtr = { x: pointer.x, y: pointer.y, id: pointer.id };
    this.longPressTimer = this.time.delayedCall(420, () => {
      if (!this.longPressPtr) return;
      this.longPressConsumed = true;
      const px = this.longPressPtr.x;
      const py = this.longPressPtr.y;
      this.longPressPtr = null;
      this.longPressTimer = undefined;
      this.handleRightClick({ x: px, y: py } as Phaser.Input.Pointer);
    });
  }

  private cancelLongPress() {
    this.longPressTimer?.remove(false);
    this.longPressTimer = undefined;
    this.longPressPtr = null;
  }

  /** End of a mobile tap: walk/attack if it wasn't a long-press menu. */
  private endMobilePointer(pointer: Phaser.Input.Pointer) {
    if (!this.mobileUx()) {
      this.cancelLongPress();
      return;
    }
    const pending = this.longPressPtr;
    const wasMenu = this.longPressConsumed;
    this.longPressTimer?.remove(false);
    this.longPressTimer = undefined;
    this.longPressPtr = null;
    if (wasMenu) {
      this.longPressConsumed = false;
      return;
    }
    if (!pending || pending.id !== pointer.id) return;
    // Walk/attack from release position (or start if they barely moved).
    this.handleLeftClick({ x: pointer.x, y: pointer.y } as Phaser.Input.Pointer);
  }

  /** Shared interact (E key / prompt tap / ◆ kit button). */
  private doInteract() {
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
      return;
    }
    this.tryAbility2();
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
      .text(this.worldW / 2, 3 * TILE + 22, `${b.subtitle} · fight through · H to surface`, { fontFamily: mono, fontSize: "10px", color: "#9aa3b2" })
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
    this.makeTalkNpc(
      "TRAIL SCRAPPER",
      hubLook({ color: b.accent, head: "beret", skin: 0xa9794a, hair: "braids", cloak: "coat" }),
      b.guideLines,
      gpx,
      gpy,
      "arc_tech", // quiet vent HEAT — not a job board
    );
    this.dressBridgeWilds(b);
  }

  /** The wilds between districts get LIVED-IN: a wayfarer camp with a fire, seated
   *  travellers, trail wanderers, scattered rocks/wrecks, and drifting motes. All
   *  client-side dressing, deterministically placed on walkable trail tiles. */
  private dressBridgeWilds(b: BridgeDef) {
    // collect walkable tiles once; deterministic picks via a stride over the list
    const floors: Array<[number, number]> = [];
    for (let ty = 1; ty < this.zoneGrid.length - 1; ty++) {
      for (let tx = 3; tx < (this.zoneGrid[ty]?.length ?? 0) - 3; tx++) {
        if (!isWall(this.zoneGrid[ty][tx])) floors.push([tx, ty]);
      }
    }
    if (floors.length < 24) return;
    const pick = (i: number) => floors[(i * 97 + b.fromDistrict * 31) % floors.length];
    const px = (t: [number, number]) => ({ x: t[0] * TILE + TILE / 2, y: t[1] * TILE + TILE / 2 });

    // ── wayfarer camp: fire + log seats + two travellers with trail gossip ──
    const camp = px(pick(3));
    const cg = this.add.graphics().setDepth(3);
    cg.fillStyle(0x241408, 1).fillEllipse(camp.x, camp.y + 6, 34, 14); // scorched ground
    cg.fillStyle(0x4a2c12, 1).fillRect(camp.x - 12, camp.y - 2, 24, 5); // crossed logs
    cg.fillStyle(0x3a2410, 1).fillRect(camp.x - 3, camp.y - 9, 6, 14);
    const flame = this.add.image(camp.x, camp.y - 4, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff8a1f).setDepth(3.2).setScale(0.5).setAlpha(0.5);
    this.tweens.add({ targets: flame, alpha: { from: 0.35, to: 0.6 }, scale: { from: 0.42, to: 0.58 }, duration: 340, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    const seatA = { x: camp.x - 34, y: camp.y + 10 };
    const seatB = { x: camp.x + 34, y: camp.y + 6 };
    this.makeTalkNpc(
      "WAYFARER SOL",
      hubLook({ color: 0xffb13c, head: "hood", skin: 0x7c4f30, cloak: "cape" }),
      [`Fire's warm, ${b.name} isn't. Patrols run heavier past the midpoint.`, "Sit a minute. Nobody crosses the wilds in a straight line."],
      seatA.x,
      seatA.y,
      "amb_drifter",
    );
    this.makeTalkNpc(
      "WAYFARER JUNE",
      hubLook({ color: 0x9dff3c, sex: "f", hair: "braids", skin: 0xe6b58c, cloak: "coat" }),
      ["Counted the pylons on the way in. Two are dark. That's new.", "The scrapper knows the safe cuts — worth the toll."],
      seatB.x,
      seatB.y,
      "amb_courier",
    );

    // ── scattered rocks + a burnt-out wreck: the trail reads travelled, not empty ──
    const rg = this.add.graphics().setDepth(2.8);
    for (let i = 0; i < 9; i++) {
      const t = px(pick(11 + i * 5));
      const s = 4 + ((i * 7) % 6);
      rg.fillStyle(0x1c2230, 1).fillEllipse(t.x + 4, t.y + 3, s * 2.2, s * 1.1); // shadow
      rg.fillStyle(0x39445c, 1).fillCircle(t.x, t.y, s);
      rg.fillStyle(0x556488, 0.8).fillCircle(t.x - s * 0.3, t.y - s * 0.35, s * 0.45);
    }
    const wreckT = px(pick(29));
    if (this.textures.exists(PROP_CAR_KEY)) {
      this.add.image(wreckT.x, wreckT.y, PROP_CAR_KEY).setDepth(3).setScale(0.9).setTint(0x556070).setAngle(8);
      this.add.image(wreckT.x - 6, wreckT.y - 4, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff3b6b).setDepth(3.1).setScale(0.25).setAlpha(0.2);
    }

    // ── two trail wanderers pacing the corridor ──
    for (let i = 0; i < 2; i++) {
      const t = px(pick(41 + i * 13));
      const look = hubLook({ color: i ? 0x8dfff0 : 0xff2bd6, head: i ? "cap" : "none", skin: i ? 0xc98a5e : 0xa9794a, cloak: "coat" });
      const key = lookKey(look);
      bakeRemoteLook(this, key, look);
      const spr = this.add.sprite(t.x, t.y, key, 0).setDepth(9).setAlpha(0.95);
      const span = TILE * (3 + i * 2);
      this.tweens.add({
        targets: spr,
        x: { from: t.x - span / 2, to: t.x + span / 2 },
        duration: 5200 + i * 1700,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
        onYoyo: () => spr.setFlipX(true),
        onRepeat: () => spr.setFlipX(false),
      });
    }

    // ── drifting motes: dust/fireflies in the corridor air (garnish — skip on low) ──
    for (let i = 0; i < (effectiveLowFx() ? 0 : 6); i++) {
      const t = px(pick(61 + i * 7));
      const mote = this.add.image(t.x, t.y - 10, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(i % 2 ? 0x9dff3c : b.accent).setDepth(7).setScale(0.08 + (i % 3) * 0.03).setAlpha(0.14);
      this.tweens.add({
        targets: mote,
        y: t.y - 26 - (i % 4) * 6,
        x: t.x + ((i % 2) * 2 - 1) * 14,
        alpha: { from: 0.08, to: 0.2 },
        duration: 2600 + i * 700,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    }
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
      .text(pos.x, pos.y - 30, inst.name, { fontFamily: "Courier New, monospace", fontSize: "10px", color: "#eafdff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(9);
    this.add
      .text(pos.x, pos.y + 22, `▸ ${inst.tag}`, { fontFamily: "Courier New, monospace", fontSize: "10px", color: hex })
      .setOrigin(0.5)
      .setDepth(9);
    this.npcs.push(npc);
  }

  private talkInstructor(npc: Extract<ZoneNpc, { kind: "instructor" }>) {
    const face = this.bubblePortrait(undefined, npc.name);
    const step = tutorialStepAt(this.net.tutorialStep, this.net.tutorialMode);
    if (step?.kind === npc.lessonKind) {
      const line = npc.lines[npc.lineIdx % npc.lines.length];
      npc.lineIdx++;
      this.showBubble(npc.x, npc.y, `${npc.name}: ${line}`, face);
      // Talking to the CURRENT lesson's instructor clears that lesson (full count).
      // Action paths (swing / dash / kill) still work in parallel — either unlocks the next trainer.
      if (this.net.connected) {
        const need = Math.max(1, step.count - (this.net.tutorialProgress || 0));
        this.net.reportTutorial(step.kind, need);
      } else {
        this.showBubble(npc.x, npc.y - 18, "…link the drill server — lessons need the live grid.", face);
      }
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
        face,
      );
      return;
    }
    this.showBubble(npc.x, npc.y, `${npc.name}: drills complete. Deploy through the east gate.`, face);
  }

  /** Deploy through the east portal — E key, click, or server walk-in. */
  private enterTutorialPortal(fromClick = false) {
    if (!this.isTutorial || !this.net) return;
    if (!this.net.connected) {
      // Offline portal = skip path (same as SKIP TO CITY). Never dead-end.
      this.showBubble(this.me.x, this.me.y, "Server still linking — deploying you to the city.");
      this.skipTutorialToCity();
      return;
    }
    if (!this.net.tutorialPortalOpen) {
      this.showBubble(this.me.x, this.me.y, "Finish the drills first — or hit SKIP TO CITY (top-right).");
      return;
    }
    if (!fromClick && !this.nearPortal) return;
    this.net.tutorialGraduate();
    // Failsafe if graduate never redirects.
    this.time.delayedCall(2500, () => {
      if (!this.isTutorial || !this.sys.isActive()) return;
      this.forceClientDeployToCity();
    });
  }

  /** Build an authored, talkable citizen at a world position (baked from its PlayerLook).
   *  Pass the npc id so quest-givers can offer their bounty on interact.
   *  Names are hidden until hover so the plaza isn't a cloud of labels. */
  private makeTalkNpc(
    name: string,
    look: PlayerLook,
    lines: string[],
    px: number,
    py: number,
    npcId?: string,
    important = false,
  ) {
    const key = lookKey(look);
    bakeRemoteLook(this, key, look);
    const npc = { kind: "talk" as const, npcId, name, lines, lineIdx: 0, x: px, y: py };
    const spr = this.add
      .sprite(px, py, key, 0)
      .setTint(0xffffff)
      .setDepth(9)
      .setScale(1.12)
      .setInteractive({ useHandCursor: true });
    spr.on("pointerdown", () => this.talkNpc(npc));
    // Labels: job givers and story allies only — not every tip/meal NPC.
    const givesBounty = !!(npcId && bountyForNpc(npcId));
    const marked = important || givesBounty;
    const label = this.add
      .text(px, py - 26, givesBounty ? `${name} ·` : important ? name : name, {
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        color: givesBounty ? "#c8b85a" : important ? "#9aa8b8" : "#7a8494",
        fontStyle: marked ? "bold" : "normal",
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setAlpha(marked ? 0.4 : 0);
    spr.on("pointerover", () => label.setAlpha(1));
    spr.on("pointerout", () => label.setAlpha(marked ? 0.4 : 0));
    this.npcs.push(npc);
  }

  /** Talk: most people bark a line; a few open a small choice menu. */
  private talkNpc(npc: { npcId?: string; name: string; lines?: string[]; lineIdx?: number; x: number; y: number }) {
    if (npc.npcId) noteNpcTalk(npc.npcId);
    const mem = npc.npcId ? npcMemoryLine(npc.npcId, npc.name) : null;
    const line = mem ?? `${npc.name}: ${this.advanceLine(npc)}`;
    this.showBubble(npc.x, npc.y, line.startsWith(npc.name) ? line : `${npc.name}: ${line}`, this.bubblePortrait(npc.npcId, npc.name));

    if (!npc.npcId) return;
    const hasBounty = !!bountyForNpc(npc.npcId);
    if (!npcHasMenu(npc.npcId, hasBounty)) return;

    if (this.npcTalk?.isOpen) this.npcTalk.close();
    this.npcTalk.show({
      npcId: npc.npcId,
      name: npc.name,
      line: mem ?? this.advanceLine(npc),
      credits: this.net.credits,
      cores: this.net.cores,
      hasBountyActive: !!this.net.bounty,
      activeBountyId: this.net.bounty?.id ?? null,
    });
  }

  private advanceLine(npc: { lines?: string[]; lineIdx?: number }): string {
    if (!npc.lines || npc.lines.length === 0) return "…";
    const line = npc.lines[(npc.lineIdx ?? 0) % npc.lines.length];
    npc.lineIdx = (npc.lineIdx ?? 0) + 1;
    return line;
  }

  /**
   * Resolve a chosen NPC service: client opens panels locally; server owns
   * paid/cooldowned effects (heal, meal, rumor, train, fence, bless, bounty).
   */
  private applyNpcService(service: NpcServiceId, npcId: string, npcName: string) {
    const face = this.bubblePortrait(npcId, npcName);
    const px = this.nearNpc?.x ?? this.me?.x ?? 0;
    const py = this.nearNpc?.y ?? this.me?.y ?? 0;

    if (service === "chat") {
      // Extra bark — menu already showed one line.
      const def = npcDef(npcId);
      if (def?.lines?.length) {
        const i = Math.floor(Math.random() * def.lines.length);
        this.showBubble(px, py, `${npcName}: ${def.lines[i]}`, face);
      }
      return;
    }

    if (service === "bounty") {
      if (!this.net.connected) {
        this.showBubble(px, py, `${npcName}: …link the city first — I don't hand jobs offline.`, face);
        return;
      }
      const b = bountyForNpc(npcId);
      if (!b) {
        this.showBubble(px, py, `${npcName}: nothing on the board right now.`, face);
        return;
      }
      const active = this.net.bounty;
      if (active && active.id === b.id) {
        this.showBubble(px, py, `${npcName}: still on it — ${active.progress}/${active.count}.`, face);
        return;
      }
      if (active) {
        this.showBubble(px, py, `${npcName}: finish your current job first.`, face);
        return;
      }
      this.net.bountyAccept(b.id);
      noteAcceptedBounty();
      noteNpcTalk(npcId);
      this.showBubble(px, py, `${npcName}: ${b.offer}`, face);
      this.net.story = {
        quest: b.name,
        stage: "bounty",
        title: npcName,
        text: b.offer,
        journal: b.offer,
        objective: b.desc,
        done: false,
        at: performance.now(),
      };
      this.presentStoryBeat();
      return;
    }

    // Panel hand-offs (no server trip)
    if (CLIENT_OPEN_SERVICES.has(service) && service.startsWith("open_")) {
      const map: Record<string, string> = {
        open_vendor: "vendor",
        open_forge: "forge",
        open_market: "market",
        open_guild: "guild",
        open_contracts: "contracts",
        open_stash: "stash",
        open_board: "board",
        open_cosmetics: "cosmetics",
      };
      const svc = map[service];
      if (svc) {
        this.showBubble(px, py, `${npcName}: right this way.`, face);
        this.openService(svc);
      }
      return;
    }

    // Server-authoritative services
    if (!this.net.connected) {
      this.showBubble(px, py, `${npcName}: grid's dark — I can't do that offline.`, face);
      return;
    }
    this.net.npcService(npcId, service);
    // Optimistic flavour — server sys line carries the real outcome.
    const pending: Partial<Record<NpcServiceId, string>> = {
      heal_paid: "hold still.",
      heal_charity: "easy — this one's free.",
      meal: "here.",
      cool_down: "breathe.",
      rumor: "heard this…",
      intel: "don't repeat it.",
      train: "again.",
      buy_core: "one core.",
      sell_core: "done.",
      bless: "…go careful.",
    };
    if (pending[service]) this.showBubble(px, py, `${npcName}: ${pending[service]}`, face);
  }

  /**
   * THE FIXER interact — starts / advances the personal campaign (THE WAKE…).
   * Daily contracts board is separate (J only after you have a mission).
   */
  private engageFixer() {
    noteTalkedFixer();
    const face = this.bubblePortrait(undefined, "THE FIXER");
    const fx = this.nearNpc?.x ?? this.me?.x ?? 0;
    const fy = this.nearNpc?.y ?? this.me?.y ?? 0;

    // Always close dailies — talking to FIXER must never open that board.
    this.contracts?.close();
    this.shop?.close();
    this.forge?.close();
    this.market?.close();
    this.questLog?.close?.();

    if (!this.net.connected) {
      this.showBubble(fx, fy, "THE FIXER: …grid's dark. Wait for the link — then we'll talk.", face);
      this.fixerBrief?.show({
        quest: "OFFLINE",
        title: "No uplink",
        text: "Can't accept THE WAKE until the server links. Wait for LINKING to clear, then talk again.",
        objective: "Stay near THE FIXER · wait for link",
      });
      return;
    }

    this.showBubble(fx, fy, "THE FIXER: …yeah. You again. Listen.", face);
    // Immediate placeholder so the player never only sees a blank / wrong panel.
    this.fixerBrief?.show({
      quest: this.net.campaignQuest ? "BRIEFING" : "THE WAKE",
      title: this.net.campaignQuest ? "Checking the books…" : "New job",
      text: this.net.campaignQuest
        ? "Hold on — pulling your current beat."
        : "Signing you onto THE WAKE. Don't walk off.",
      objective: this.net.campaignQuest ? "…" : "Accepting…",
    });
    this.net.questEngage();
    // Failsafe re-engage if the first packet was lost mid-reconnect.
    this.time.delayedCall(800, () => {
      if (!this.sys.isActive() || !this.net?.connected) return;
      if (!this.net.campaignQuest) this.net.questEngage();
    });
  }

  /** Surface campaign / fragment / bounty dialogue via FIXER brief + small toast. */
  private presentStoryBeat() {
    const story = this.net.story;
    if (!story) return;
    this.contracts?.close();
    // Prefer dedicated FIXER panel for campaign beats (not dailies).
    const isCampaign =
      !!story.quest &&
      !story.quest.startsWith("MEMORY") &&
      story.stage !== "bounty";
    if (isCampaign) {
      this.fixerBrief?.update({
        quest: story.quest,
        title: story.title,
        text: story.text,
        objective: story.objective,
      });
    }
    // Short toast as secondary cue.
    this.storyHoldUntil = performance.now() + 8_000;
    const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
    const body = `◢ ${clip(story.quest, 28)} · ${clip(story.title, 36)}\n${clip(story.text.replace(/\n+/g, " "), 120)}\n▸ ${clip(story.objective, 42)}`;
    this.storyPanel
      .setText(body)
      .setVisible(true)
      .setAlpha(1)
      .setDepth(1900);
    this.hudRefreshAcc = OnlineScene.HUD_REFRESH_MS;
    this.refreshAllyLines();
  }

  /** Painted bust for a bubble speaker; sex from the NPC def keeps the face on-sprite. */
  private bubblePortrait(npcId?: string, name?: string): PortraitRef | undefined {
    if (npcId) return portraitFor(npcId, npcDef(npcId)?.look?.sex);
    // Hub services / instructors ship display names like "THE FIXER · CONTRACTS".
    if (name) {
      const byName = portraitForName(name);
      if (byName) return byName;
      return portraitFor("n_" + name.toLowerCase().replace(/\W+/g, "_"));
    }
    return undefined;
  }

  /** Show a floating speech bubble above a world point (auto-fades). */
  private showBubble(x: number, y: number, text: string, portrait?: PortraitRef) {
    if (!this.speechBubble) return;
    this.speechBubble.setText(text).setPosition(x, y - 34).setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.speechBubble);
    const fading: Phaser.GameObjects.GameObject[] = [this.speechBubble];
    if (this.speechPortrait && this.speechPortraitRing) {
      this.tweens.killTweensOf([this.speechPortrait, this.speechPortraitRing]);
      if (portrait && this.textures.exists(portrait.key)) {
        const ps = uiDim(56);
        const bx = x - this.speechBubble.displayWidth / 2 - ps / 2 - uiDim(6);
        const by = y - 34 - this.speechBubble.displayHeight / 2;
        this.speechPortrait
          .setTexture(portrait.key, portrait.frame)
          .setDisplaySize(ps, ps)
          .setPosition(bx, by)
          .setVisible(true)
          .setAlpha(1);
        this.speechPortraitRing.setPosition(bx, by).setVisible(true).setAlpha(1);
        fading.push(this.speechPortrait, this.speechPortraitRing);
      } else {
        this.speechPortrait.setVisible(false);
        this.speechPortraitRing.setVisible(false);
      }
    }
    this.tweens.add({
      targets: fading,
      alpha: 0,
      delay: 3200,
      duration: 700,
      onComplete: () => {
        this.speechBubble?.setVisible(false);
        this.speechPortrait?.setVisible(false);
        this.speechPortraitRing?.setVisible(false);
      },
    });
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
      .text(px, py - 40, "TRANSIT", { fontFamily: "Courier New, monospace", fontSize: "10px", color: "#cfe8ff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(9);
    this.add
      .text(px, py + 22, label, { fontFamily: "Courier New, monospace", fontSize: "10px", color: "#" + (color & 0xffffff).toString(16).padStart(6, "0"), fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(9);
    this.npcs.push({ kind: "transit", dest, name: label, label, color, x: px, y: py });
  }

  /** Furnish an FRLG venue room so it reads as a lived-in place, not an empty box:
   *  a counter surface, a rug, warm light, and a couple of kind-specific set pieces.
   *  Tiles avoid the NPC seats (7,2)/(4,5)/(10,5)/(11,7) and the mat column. */
  /** The hub's named service rooms share one safehouse floor plan — give each a
   *  DISTINCT dressing so a clinic doesn't feel like the den: beds + cross, bottle
   *  shelf, contraband crates, stock shelves, or blinking cred-vault racks. Pure
   *  graphics anchored to the fixed plan — zero collision risk. */
  private dressServiceRoom(kind: string, accent: number) {
    const g = this.add.graphics().setDepth(2.4);
    const t = (n: number) => n * TILE;
    if (kind === "clinic") {
      for (const bx of [14, 17]) {
        g.fillStyle(0x2a3244, 1).fillRect(t(bx), t(10) + 6, TILE + 10, TILE + 16); // bed frame
        g.fillStyle(0xd8e4ec, 0.95).fillRect(t(bx) + 3, t(10) + 9, TILE + 4, TILE - 2); // sheet
        g.fillStyle(0x9fe8ff, 0.9).fillRect(t(bx) + 3, t(10) + 9, TILE + 4, 7); // pillow
      }
      g.fillStyle(0xff3b6b, 0.9).fillRect(t(21) + 10, t(9) - 12, 14, 4).fillRect(t(21) + 15, t(9) - 17, 4, 14); // wall cross
      this.add.image(t(16), t(11), GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fe8ff).setDepth(2.5).setScale(0.8).setAlpha(0.1);
    } else if (kind === "bar") {
      for (let i = 0; i < 7; i++) {
        const bx = t(14) + i * 12;
        g.fillStyle([0x39ff88, 0xff2bd6, 0xf7ff3c, 0x00e5ff][i % 4], 0.85).fillRect(bx, t(9) - 14, 5, 12); // backbar bottles
      }
      g.fillStyle(0x120a1e, 0.85).fillRect(t(14) - 4, t(9) - 2, 100, 4); // shelf
      g.fillStyle(accent, 0.08).fillRect(t(15), t(13), t(4), t(2)); // dance-rug wash
      this.add.image(t(17), t(11), GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff2bd6).setDepth(2.5).setScale(1).setAlpha(0.12);
    } else if (kind === "den") {
      const crate = (cx: number, cy: number) => {
        g.fillStyle(0x2a1a2e, 0.95).fillRect(t(cx) + 4, t(cy) + 6, 22, 18);
        g.lineStyle(1, 0x6a3a5e, 0.8).strokeRect(t(cx) + 4, t(cy) + 6, 22, 18);
      };
      crate(13, 10);
      crate(13, 11);
      crate(14, 10);
      crate(26, 16);
      const lamp = this.add.image(t(20), t(10), GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff3b6b).setDepth(2.5).setScale(0.6).setAlpha(0.25);
      this.tweens.add({ targets: lamp, alpha: { from: 0.16, to: 0.3 }, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    } else if (kind === "shop") {
      for (const sy of [10, 13]) {
        g.fillStyle(0x1a2234, 0.95).fillRect(t(14), t(sy) + 8, t(5), 10); // stock shelf
        for (let i = 0; i < 8; i++) {
          g.fillStyle([0x00e5ff, 0xf7ff3c, 0x39ff88][i % 3], 0.8).fillRect(t(14) + 5 + i * 18, t(sy) + 1, 8, 8); // goods
        }
      }
    } else if (kind === "vault") {
      for (let i = 0; i < 3; i++) {
        const rx = t(14 + i * 4);
        g.fillStyle(0x0e1626, 1).fillRect(rx, t(10) - 8, 26, 42); // rack
        g.lineStyle(1, 0x29e7ff, 0.5).strokeRect(rx, t(10) - 8, 26, 42);
        const led = this.add.image(rx + 13, t(10) + 4 + i * 6, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(i % 2 ? 0x39ff88 : 0x29e7ff).setDepth(2.6).setScale(0.14).setAlpha(0.5);
        this.tweens.add({ targets: led, alpha: { from: 0.2, to: 0.6 }, duration: 380 + i * 170, yoyo: true, repeat: -1 });
      }
    }
  }

  private dressVenueRoom(kind: string, accent: number) {
    const g = this.add.graphics().setDepth(2.4);
    const t = (n: number) => n * TILE;
    const L = venueLayoutFor(this.zone);
    // counter surface — the plan's counter wall run reads as furniture
    for (let x = L.counter.x0; x <= L.counter.x1; x++) {
      if (x === L.counter.gap) continue;
      g.fillStyle(0x1a2234, 0.9).fillRect(t(x) + 1, t(L.counter.y) + TILE - 9, TILE - 2, 8);
      g.fillStyle(accent, 0.5).fillRect(t(x) + 1, t(L.counter.y) + TILE - 10, TILE - 2, 2);
    }
    // interior wall blocks (pillars / partitions / islands) get a top surface too
    for (const [bx0, by0, bx1] of L.blocks ?? []) {
      for (let x = bx0; x <= bx1; x++) {
        g.fillStyle(0x141c2c, 0.9).fillRect(t(x) + 1, t(by0) + TILE - 8, TILE - 2, 7);
        g.fillStyle(accent, 0.3).fillRect(t(x) + 1, t(by0) + TILE - 9, TILE - 2, 2);
      }
    }
    // rug — centre of the floor, sized to the room
    const rugW = t(Math.min(4, L.w - 8)) - 12;
    const rugX = t(Math.floor(L.w / 2) - 2) + 6;
    const rugY = t(Math.floor(L.h / 2) - 1) + 4;
    g.fillStyle(accent, 0.1).fillRect(rugX, rugY, rugW, t(2) + TILE - 8);
    g.lineStyle(1, accent, 0.3).strokeRect(rugX, rugY, rugW, t(2) + TILE - 8);
    // warm light pooling at the counter gap + room centre
    this.add.image(t(L.counter.gap) + TILE / 2, t(L.counter.y) + TILE, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb86a).setDepth(2.5).setScale(0.9).setAlpha(0.14);
    this.add.image(t(Math.floor(L.w / 2)) + TILE / 2, t(Math.floor(L.h / 2)), GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(accent).setDepth(2.5).setScale(1.3).setAlpha(0.08);

    const crate = (cx: number, cy: number, c = 0x3a3020) => {
      g.fillStyle(c, 0.95).fillRect(t(cx) + 5, t(cy) + 8, 20, 16);
      g.lineStyle(1, 0x6a5a30, 0.8).strokeRect(t(cx) + 5, t(cy) + 8, 20, 16);
      g.lineStyle(1, 0x6a5a30, 0.5).lineBetween(t(cx) + 5, t(cy) + 16, t(cx) + 25, t(cy) + 16);
    };
    if (kind === "shop") {
      if (this.textures.exists(PROP_VENDING_KEY)) this.add.image(t(12) + TILE / 2, t(2) + TILE - 4, PROP_VENDING_KEY).setOrigin(0.5, 0.85).setDepth(5).setScale(0.8);
      crate(2, 7);
      crate(2, 6);
    } else if (kind === "home") {
      // a bunk against the west wall — warm blanket + pillow
      g.fillStyle(0x2a2440, 1).fillRect(t(1) + 6, t(2) + 4, TILE + 14, TILE + 20);
      g.fillStyle(0x8a4a3c, 0.9).fillRect(t(1) + 6, t(2) + 18, TILE + 14, TILE + 6);
      g.fillStyle(0xd8cfc0, 0.95).fillRect(t(1) + 10, t(2) + 7, 18, 9);
      if (this.textures.exists(PROP_AC_KEY)) this.add.image(t(12) + TILE / 2, t(2) + TILE - 4, PROP_AC_KEY).setOrigin(0.5, 0.85).setDepth(5).setScale(0.7);
    } else if (kind === "guild") {
      // faction banners on the north wall
      for (const bx of [4, 10]) {
        g.fillStyle(accent, 0.8).fillRect(t(bx) + 10, t(1) - 6, 12, 26);
        g.fillStyle(0x0a0e18, 0.9).fillRect(t(bx) + 13, t(1) + 2, 6, 8);
      }
    } else if (kind === "den") {
      crate(2, 7, 0x2a1a2e);
      crate(12, 2, 0x2a1a2e);
      this.add.image(t(12) + TILE / 2, t(7), GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff3b6b).setDepth(2.5).setScale(0.5).setAlpha(0.22);
    } else if (kind === "bar") {
      for (const bx of [3, 11]) {
        g.fillStyle(0x1a2234, 1).fillCircle(t(bx) + TILE / 2, t(6) + TILE / 2, 12);
        g.lineStyle(2, accent, 0.5).strokeCircle(t(bx) + TILE / 2, t(6) + TILE / 2, 12);
        this.add.image(t(bx) + TILE / 2, t(6) + TILE / 2, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb86a).setDepth(2.5).setScale(0.4).setAlpha(0.16);
      }
      // bottle rack — accent dashes along the counter face
      for (let x = 4; x <= 10; x++) {
        if (x === 7) continue;
        g.fillStyle(x % 2 ? 0x39ff88 : 0xff79c6, 0.75).fillRect(t(x) + 8, t(3) + 6, 3, 9);
        g.fillStyle(0x29e7ff, 0.75).fillRect(t(x) + 17, t(3) + 4, 3, 11);
      }
    }
  }

  /** A market STALL that houses a hub service operative: striped awning, a counter the
   *  NPC stands behind, and an always-visible sign board so a runner reads what each
   *  stand offers from across the plaza. Purely cosmetic — the NPC sprite + interaction
   *  are placed by the caller. */
  private drawServiceStall(px: number, py: number, name: string, tag: string, color: number) {
    const hex = "#" + (color & 0xffffff).toString(16).padStart(6, "0");
    const W = 72, hw = W / 2;
    const ay = py - 36; // awning line
    const g = this.add.graphics().setDepth(6);
    // support posts
    g.fillStyle(0x161c2c, 1).fillRect(px - hw + 1, ay + 10, 3, 42).fillRect(px + hw - 4, ay + 10, 3, 42);
    // striped awning
    g.fillStyle(0x0a0e18, 0.94).fillRect(px - hw, ay, W, 12);
    for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? color : 0x141a2a, 0.9).fillRect(px - hw + 2 + i * 11.2, ay + 2, 9, 8);
    g.fillStyle(color, 0.9).fillRect(px - hw, ay, W, 2);
    // sign board — service TAG only (FORGE / VENDOR); operator name is not permanent world UI
    const sy = ay - 15;
    g.fillStyle(0x05060f, 0.96).fillRect(px - hw, sy, W, 14);
    g.lineStyle(1.5, color, 0.95).strokeRect(px - hw, sy, W, 14);
    this.add.image(px, sy + 7, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(color).setDepth(5.8).setScale(0.65, 0.32).setAlpha(0.28);
    this.add.text(px, sy + 7, tag, displayFont(10, { color: hex, fontStyle: "bold" })).setOrigin(0.5).setDepth(10);
    // counter drawn OVER the NPC's feet so they read as standing behind the stand
    const cg = this.add.graphics().setDepth(9.5);
    cg.fillStyle(0x111730, 0.98).fillRect(px - hw + 4, py + 12, W - 8, 12);
    cg.fillStyle(color, 0.5).fillRect(px - hw + 4, py + 12, W - 8, 2);
    cg.fillStyle(0x05060f, 0.6).fillRect(px - hw + 4, py + 22, W - 8, 2);
    // Name only on hover of the stall zone (pointer on sign area) — keeps plaza readable.
    const nameLbl = this.add
      .text(px, py + 30, name, bodyFont(8, { color: "#9aa3b2" }))
      .setOrigin(0.5)
      .setDepth(10)
      .setAlpha(0);
    const hit = this.add.zone(px - hw, sy, W, py + 24 - sy).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(10);
    hit.on("pointerover", () => nameLbl.setAlpha(1));
    hit.on("pointerout", () => nameLbl.setAlpha(0));
  }

  /** Decorative city furniture for the hub plaza — a centre fountain, benches, and a
   *  holo-board — so the safe zone reads as a lived-in square, not an empty tile field. */
  /** Dress the hub plaza into a lived-in neon square: paving decal, a centre fountain,
   *  streetlights, planters, ramen carts, arcade cabinets, holo-boards, benches and a
   *  wayfinding post. All decorative (no collision) — the interactables are placed
   *  elsewhere; these fill the space between them so the safe zone reads as a real city. */
  /** Screen-space weather per district biome — rain over downtown, smog over the
   *  yards, cold drizzle + a scan band under the spire, embers rising in the core.
   *  All scrollFactor-0 sprites on looping tweens: the UI camera draws them over
   *  the world (under the HUD) at zero per-frame logic cost. */
  private dressDistrictWeather() {
    const env = MusicDirector.districtEnv(DISTRICTS[this.districtIndex]?.id ?? "downtown");
    const W = this.scale.width;
    const H = this.scale.height;
    // Low tier: half-density weather (it's screen-space additive overdraw).
    const dens = effectiveLowFx() ? 0.5 : 1;
    const n = (full: number) => Math.max(3, Math.round(full * dens));
    const seeded = (i: number, m: number) => (i * 73 + 29) % m;
    const mk = (tint: number, alpha: number, sx: number, sy: number, depth = 900) =>
      this.add.image(0, 0, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setAlpha(alpha).setScale(sx, sy).setScrollFactor(0).setDepth(depth);
    if (env === "district_downtown") {
      // neon rain — thin streaks angling down-left
      for (let i = 0; i < n(26); i++) {
        const s = mk(0xbfe8ff, 0.13 + (i % 3) * 0.03, 0.035, 0.5 + (i % 4) * 0.12);
        const x0 = (seeded(i, 97) / 97) * W;
        s.setPosition(x0, -40 - seeded(i, 41) * 8);
        this.tweens.add({ targets: s, y: H + 60, x: x0 - uiDim(30), duration: 620 + seeded(i, 7) * 60, repeat: -1, delay: seeded(i, 13) * 90, ease: "Linear" });
      }
    } else if (env === "district_stacks") {
      // industrial smog wisps crawling across the screen
      for (let i = 0; i < n(7); i++) {
        const s = mk(0xa8a06a, 0.05, 2.6 + (i % 3) * 0.7, 1.1);
        s.setPosition(-240, (seeded(i, 89) / 89) * H);
        this.tweens.add({ targets: s, x: W + 260, duration: 26000 + seeded(i, 9) * 3000, repeat: -1, delay: seeded(i, 11) * 1800, ease: "Sine.inOut" });
      }
    } else if (env === "district_spire") {
      // cold drizzle + a slow surveillance scan band sweeping the screen
      for (let i = 0; i < n(14); i++) {
        const s = mk(0x9fe8ff, 0.09, 0.03, 0.4);
        const x0 = (seeded(i, 83) / 83) * W;
        s.setPosition(x0, -30);
        this.tweens.add({ targets: s, y: H + 40, duration: 900 + seeded(i, 7) * 90, repeat: -1, delay: seeded(i, 17) * 130, ease: "Linear" });
      }
      const band = mk(0x29e7ff, 0.045, W / 128, 0.5, 899);
      band.setPosition(W / 2, -20);
      this.tweens.add({ targets: band, y: H + 20, duration: 7000, repeat: -1, repeatDelay: 5200, ease: "Sine.inOut" });
    } else if (env === "district_core") {
      // embers rising off the meltdown floor
      for (let i = 0; i < n(16); i++) {
        const s = mk(i % 3 ? 0xff8a1f : 0xff3b6b, 0.16, 0.07 + (i % 3) * 0.02, 0.07 + (i % 3) * 0.02);
        const x0 = (seeded(i, 79) / 79) * W;
        s.setPosition(x0, H + 20 + seeded(i, 31) * 4);
        this.tweens.add({ targets: s, y: -30, x: x0 + (i % 2 ? 40 : -40), alpha: { from: 0.2, to: 0.04 }, duration: 5200 + seeded(i, 13) * 400, repeat: -1, delay: seeded(i, 19) * 300, ease: "Sine.in" });
      }
    }
  }

  /** THE UNDERLINE: an express train screams down a random platform row every so
   *  often — a light streak + head lamp + a kiss of camera shake as it passes. */
  private dressSubwayLife() {
    const rows = [7.5, 15.5, 23.5]; // centres of the carved platform row pairs
    const run = () => {
      if (!this.scene.isActive()) return;
      const y = rows[(Math.random() * rows.length) | 0] * TILE;
      const ltr = Math.random() < 0.5;
      const body = this.add.image(ltr ? -140 : this.worldW + 140, y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0x8dfff0).setDepth(2.5).setScale(3.2, 0.35).setAlpha(0.3);
      const lamp = this.add.image(body.x + (ltr ? 90 : -90), y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffffff).setDepth(2.6).setScale(0.5).setAlpha(0.5);
      this.tweens.add({
        targets: [body, lamp],
        x: `+=${(ltr ? 1 : -1) * (this.worldW + 280)}`,
        duration: 1400,
        ease: "Cubic.in",
        onComplete: () => {
          body.destroy();
          lamp.destroy();
        },
      });
      juiceShake(this, 240, 0.0022);
      this.time.delayedCall(7000 + Math.random() * 6000, run);
    };
    this.time.delayedCall(2500, run);
  }

  /** Faint aircar silhouettes drifting high over the plaza — four sprites on slow
   *  looping tweens. Vibrancy that lives ABOVE the play space: zero ground clutter,
   *  zero per-frame draw cost. */
  private spawnSkyTraffic() {
    // Ambient sky layers are pure garnish — skip them all on the low tier so the
    // hard-won iGPU hub frame-rate keeps its budget (additive overdraw isn't free).
    if (effectiveLowFx()) return;
    // Landmark searchlights: two slow beams sweeping from the city's marquee roofs.
    const marquees = ONLINE_CITY.buildings.filter((b) => b.kind === "citycenter" || b.kind === "stadium").slice(0, 2);
    marquees.forEach((b, i) => {
      const bx = ((b.rect.x1 + b.rect.x2) / 2) * TILE;
      const by = ((b.rect.y1 + b.rect.y2) / 2) * TILE;
      const beam = this.add
        .image(bx, by, GLOW_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(i ? 0xff2bd6 : 0x29e7ff)
        .setOrigin(0.05, 0.5)
        .setDepth(29)
        .setScale(2.4, 0.3)
        .setAlpha(0.1)
        .setAngle(i ? 140 : -40);
      this.tweens.add({ targets: beam, angle: `+=${i ? -80 : 80}`, duration: 9000 + i * 2600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    });
    const lanes = [0.18, 0.34, 0.55, 0.74];
    const tints = [0x00e5ff, 0xff2bd6, 0xf7ff3c, 0x9dff3c];
    lanes.forEach((laneN, i) => {
      const y = this.worldH * laneN;
      const leftward = i % 2 === 1;
      const car = this.add
        .image(leftward ? this.worldW + 80 : -80, y, GLOW_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(tints[i])
        .setDepth(30) // above roofs, below HUD
        .setScale(1.7, 0.16)
        .setAlpha(0.16);
      const trail = this.add
        .image(car.x, y, GLOW_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffffff)
        .setDepth(30)
        .setScale(0.5, 0.08)
        .setAlpha(0.1);
      const dur = 26000 + i * 7000;
      this.tweens.add({
        targets: [car, trail],
        x: leftward ? -120 : this.worldW + 120,
        y: y + (i % 2 ? -1 : 1) * this.worldH * 0.06,
        duration: dur,
        delay: i * 4200,
        repeat: -1,
        onRepeat: () => {
          const ny = this.worldH * lanes[(i + ((Math.random() * 3) | 0)) % lanes.length];
          car.setPosition(leftward ? this.worldW + 80 : -80, ny);
          trail.setPosition(car.x + (leftward ? 26 : -26), ny);
        },
      });
    });
  }

  private drawHubProps() {
    const ADD = Phaser.BlendModes.ADD;
    const w = (dx: number, dy: number): [number, number] => [(HUB_CX + dx) * TILE + TILE / 2, (HUB_CY + dy) * TILE + TILE / 2];
    const hex = (c: number) => "#" + (c & 0xffffff).toString(16).padStart(6, "0");
    const glow = (x: number, y: number, c: number, sx: number, sy: number, a: number, d = 3.5) =>
      this.add.image(x, y, GLOW_KEY).setBlendMode(ADD).setTint(c).setDepth(d).setScale(sx, sy).setAlpha(a);

    // ── plaza paving: concentric neon rings centred on the square + a lit path south ──
    const [cx, cy] = w(0, 0);
    const ring = this.add.graphics().setDepth(2.6);
    ring.lineStyle(2, 0x29e7ff, 0.13).strokeEllipse(cx, cy, 320, 158);
    ring.lineStyle(1, 0xff2bd6, 0.1).strokeEllipse(cx, cy, 230, 116);
    ring.lineStyle(1, 0x29e7ff, 0.07).strokeEllipse(cx, cy, 410, 205);
    for (let i = 0; i < 5; i++) ring.fillStyle(0x39ff88, 0.05).fillRect(cx - 24 + i * 11, cy + 120, 6, 96); // guide stripes → deploy gate

    // ── central fountain ──
    const [fx, fy] = w(0, -8);
    const f = this.add.graphics().setDepth(4);
    f.fillStyle(0x0d1220, 1).fillEllipse(fx, fy + 5, 104, 56);
    f.lineStyle(3, 0x2a3350, 1).strokeEllipse(fx, fy, 100, 50);
    f.fillStyle(0x123048, 0.95).fillEllipse(fx, fy, 90, 44);
    f.fillStyle(0x1e5a78, 0.5).fillEllipse(fx, fy - 2, 66, 30);
    f.fillStyle(0x0a1420, 1).fillEllipse(fx, fy - 2, 22, 13);
    f.fillStyle(0x2a3350, 1).fillRect(fx - 3, fy - 24, 6, 24);
    glow(fx, fy - 24, 0x29e7ff, 0.85, 0.85, 0.32, 5);
    for (let i = 0; i < 5; i++) {
      const gl = glow(fx + (i - 2) * 18, fy + ((i % 2) - 0.5) * 16, 0x8dfff0, 0.28, 0.28, 0.18, 5);
      this.tweens.add({ targets: gl, alpha: 0.42, scale: 0.42, duration: 1300 + i * 260, yoyo: true, repeat: -1, ease: "sine.inout" });
    }

    // ── streetlights ringing the plaza (warm ground pools) ──
    const streetlight = (x: number, y: number) => {
      const g = this.add.graphics().setDepth(6);
      g.fillStyle(0x0a0e18, 1).fillRect(x - 2, y - 34, 4, 38);
      g.fillStyle(0x1a2233, 1).fillRect(x - 8, y - 38, 16, 5);
      g.fillStyle(0xffe0a0, 0.95).fillRect(x - 7, y - 34, 14, 2);
      glow(x, y - 32, 0xffb86a, 1.0, 0.5, 0.22, 5.5);
      glow(x, y + 10, 0xffd98a, 1.5, 0.8, 0.12, 3);
    };
    for (const [x, y] of [w(-10, -6), w(10, -6), w(-10, 6), w(10, 6), w(-10, 0), w(10, 0), w(-2, -11), w(2, -11)]) streetlight(x, y);

    // ── planters (neon foliage) ──
    const planter = (x: number, y: number, c: number) => {
      const g = this.add.graphics().setDepth(4);
      g.fillStyle(0x141a26, 1).fillRect(x - 10, y - 3, 20, 9);
      g.fillStyle(0x0a0e18, 1).fillRect(x - 10, y + 6, 20, 3);
      for (let i = 0; i < 5; i++) g.fillStyle(c, 0.8).fillRect(x - 8 + i * 4, y - 3 - (i % 2 ? 9 : 5), 2, i % 2 ? 9 : 5);
      glow(x, y - 6, c, 0.4, 0.4, 0.14);
    };
    for (const [x, y, c] of [[...w(-6, -3), 0x39ff88], [...w(6, -3), 0x39ff88], [...w(-6, 3), 0x9dff3c], [...w(6, 3), 0x9dff3c], [...w(-2, 9), 0x39ff88], [...w(2, 9), 0x39ff88]] as [number, number, number][]) planter(x, y, c);

    // ── ramen carts (rising steam) ──
    const cart = (x: number, y: number) => {
      const g = this.add.graphics().setDepth(6);
      g.fillStyle(0x2a1a14, 1).fillRect(x - 16, y - 6, 32, 16);
      for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? 0xff7a4c : 0x1a1010, 0.95).fillRect(x - 16 + i * 5.4, y - 14, 4, 7);
      g.fillStyle(0xffd98a, 0.6).fillRect(x - 14, y - 4, 28, 2);
      glow(x, y - 2, 0xff9a5c, 0.5, 0.4, 0.16, 5.5);
      const st = glow(x, y - 16, 0xdfe8ff, 0.4, 0.4, 0.16, 6);
      this.tweens.add({ targets: st, y: y - 32, alpha: 0, scale: 0.7, duration: 2200, repeat: -1 });
    };
    cart(...w(-10, 3));
    cart(...w(10, -3));

    // ── arcade cabinets (glowing screens) ──
    const arcade = (x: number, y: number, c: number) => {
      const g = this.add.graphics().setDepth(6);
      g.fillStyle(0x12172a, 1).fillRect(x - 9, y - 20, 18, 26);
      g.fillStyle(c, 0.9).fillRect(x - 7, y - 17, 14, 10);
      g.fillStyle(0x0a0e18, 1).fillRect(x - 6, y - 4, 12, 4);
      glow(x, y - 12, c, 0.5, 0.5, 0.22, 5.8);
    };
    arcade(...w(-10, -3), 0xff2bd6);
    arcade(...w(10, 3), 0x00e5ff);

    // ── holo-billboards ──
    const billboard = (x: number, y: number, text: string, c: number) => {
      const g = this.add.graphics().setDepth(4);
      g.fillStyle(0x0a0e18, 0.92).fillRect(x - 38, y - 22, 76, 28);
      g.lineStyle(1.5, c, 0.85).strokeRect(x - 38, y - 22, 76, 28);
      g.fillStyle(c, 1).fillRect(x - 1, y + 6, 2, 16);
      glow(x, y - 8, c, 1.2, 0.6, 0.16, 3.9);
      const t = this.add.text(x, y - 8, text, bodyFont(9, { color: hex(c), align: "center" })).setOrigin(0.5).setDepth(6);
      this.tweens.add({ targets: t, alpha: 0.55, duration: 1700, yoyo: true, repeat: -1 });
    };
    billboard(...w(0, -13), "METRO CITY\nSAFE ZONE", 0x39ff88);
    billboard(...w(-14, -9), "NEON\nCORE", 0xff2bd6);
    billboard(...w(14, -9), "CORP\nROW", 0x29e7ff);

    // ── benches ──
    for (const [bx, by] of [w(-6, 1), w(6, 1), w(-4, 5), w(4, 5)]) {
      const bg = this.add.graphics().setDepth(4);
      bg.fillStyle(0x151b2c, 1).fillRect(bx - 16, by - 3, 32, 7);
      bg.fillStyle(0x0a0e18, 1).fillRect(bx - 14, by + 4, 3, 5).fillRect(bx + 11, by + 4, 3, 5);
      bg.fillStyle(0x29e7ff, 0.3).fillRect(bx - 16, by - 3, 32, 1);
    }

    // ── wayfinding post → the deploy gate just south ──
    const [sx, sy] = w(0, 4);
    const sg = this.add.graphics().setDepth(6);
    sg.fillStyle(0x0a0e18, 0.95).fillRect(sx - 32, sy - 9, 64, 15);
    sg.lineStyle(1.5, 0x39ff88, 0.9).strokeRect(sx - 32, sy - 9, 64, 15);
    this.add.text(sx, sy - 2, "▼ DEPLOY", displayFont(9, { color: "#39ff88", fontStyle: "bold" })).setOrigin(0.5).setDepth(7);

    // ── PVP herald → make THE CRUCIBLE findable the moment you spawn ──
    // A red billboard up top + a signpost by the deploy gate: PvP is the arena in the SE
    // corner of every combat district, so a new runner reads where to fight from the plaza.
    billboard(...w(8, -13), "⚔ PVP\nCRUCIBLE", 0xff3b6b);
    const [px, py] = w(5, 4);
    const pg = this.add.graphics().setDepth(6);
    pg.fillStyle(0x14060a, 0.96).fillRect(px - 60, py - 10, 120, 17);
    pg.lineStyle(1.5, 0xff3b6b, 0.95).strokeRect(px - 60, py - 10, 120, 17);
    pg.fillStyle(0xff3b6b, 1).fillRect(px - 62, py - 10, 2, 17);
    glow(px, py - 2, 0xff3b6b, 1.1, 0.5, 0.14, 3.6);
    this.add
      .text(px, py - 2, "⚔ PVP · THE CRUCIBLE — SE of every district", displayFont(9, { color: "#ff6b7a", fontStyle: "bold" }))
      .setOrigin(0.5)
      .setDepth(7);
  }

  /** THE ESTATES overworld — a residential street; each facade door opens an est{K} home. */
  private buildEstatesZone() {
    this.add
      .text(this.worldW / 2, 3 * TILE, "▣ THE ESTATES", displayFont(20, { color: "#ffb13c", fontStyle: "bold" }))
      .setOrigin(0.5)
      .setDepth(6)
      .setShadow(0, 0, "#ffb13c", 8, true, true);
    this.add
      .text(this.worldW / 2, 3 * TILE + 24, "residential district · buy a home, then furnish it · H returns to METRO CITY", bodyFont(11, { color: "#9aa3b2" }))
      .setOrigin(0.5)
      .setDepth(6);
    for (const plot of ESTATES.plots) {
      const [dtx, dty] = plot.door;
      const color = 0xffb13c;
      this.makeDoor({ dest: `est${plot.id}`, label: `HOME ${plot.id + 1}`, tile: [dtx, dty], color, flat: true });
      this.add
        .image(dtx * TILE + TILE / 2, dty * TILE + TILE / 2, GLOW_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(color)
        .setDepth(4.4)
        .setScale(0.42)
        .setAlpha(0.3);
      this.add.text(dtx * TILE + TILE / 2, dty * TILE - 12, `▣ ${plot.id + 1}`, bodyFont(9, { color: "#ffcf8a", fontStyle: "bold" })).setOrigin(0.5).setDepth(7);
      this.districtDoors.push({ tx: dtx, ty: dty, dest: `est${plot.id}` });
    }
    this.add
      .text(this.worldW / 2, this.worldH - TILE, "▲ H — return to METRO CITY", displayFont(10, { color: "#39ff88", fontStyle: "bold" }))
      .setOrigin(0.5)
      .setDepth(7);

    // ── HOUSING REGISTRY kiosk — the street's featured-homes board ──
    const [sx, sy] = ESTATES.spawn;
    const kx = (sx + 4) * TILE + TILE / 2;
    const ky = sy * TILE + TILE / 2;
    const kg = this.add.graphics().setDepth(6);
    kg.fillStyle(0x0a0e18, 0.95).fillRoundedRect(kx - 30, ky - 26, 60, 34, 4);
    kg.lineStyle(1.5, 0xffb13c, 0.95).strokeRoundedRect(kx - 30, ky - 26, 60, 34, 4);
    kg.fillStyle(0xffb13c, 1).fillRect(kx - 2, ky + 8, 4, 12);
    this.add.image(kx, ky - 9, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb13c).setDepth(5.9).setScale(0.7).setAlpha(0.3);
    const kt = this.add.text(kx, ky - 9, "▣ REGISTRY", displayFont(9, { color: "#ffcf8a", fontStyle: "bold" })).setOrigin(0.5).setDepth(7).setInteractive({ useHandCursor: true });
    kt.on("pointerdown", () => this.toggleRegistry());
    this.tweens.add({ targets: kt, alpha: 0.6, duration: 1500, yoyo: true, repeat: -1 });
    this.npcs.push({ kind: "service", svc: "registry", name: "HOUSING REGISTRY · all 12 homes", x: kx, y: ky });

    // ── street lamps along the walk, so the strip reads like a neighbourhood ──
    for (const lx of [8, 20, 32, 44, 56, 68, 80, 94]) {
      for (const ly of [10, 15]) {
        const px = lx * TILE + TILE / 2;
        const py = ly * TILE + TILE / 2;
        const lg = this.add.graphics().setDepth(5);
        lg.fillStyle(0x151b2c, 1).fillRect(px - 1.5, py - 14, 3, 16);
        lg.fillStyle(0xffe08a, 0.95).fillCircle(px, py - 15, 3);
        this.add.image(px, py - 6, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe08a).setDepth(4.9).setScale(0.55).setAlpha(0.22);
      }
    }

    // a few neighbours strolling the street
    this.spawnWanderers(ESTATES.grid, ESTATES.spawn[0], ESTATES.spawn[1], 5);
  }

  /** A private home interior (est{K}) — an empty room the owner furnishes. Ownership +
   *  furniture are server-authoritative; the client reacts to the pushed estate state. */
  private buildHomeInterior(idx: number) {
    this.homeIdx = idx;
    this.homeEditing = false;
    this.homeSelKind = null;
    this.homeDraft = [];
    this.add
      .text(this.worldW / 2, 2.4 * TILE, `▣ HOME ${idx + 1}`, displayFont(18, { color: "#ffb13c", fontStyle: "bold" }))
      .setOrigin(0.5)
      .setDepth(6);
    this.add
      .text(this.worldW / 2, 2.4 * TILE + 20, "no combat · door mat (▼) to leave · owners: F to furnish, your LOCKBOX works here", bodyFont(10, { color: "#9aa3b2" }))
      .setOrigin(0.5)
      .setDepth(6);
    // exit mat → returns to THE ESTATES street
    const matX = VENUE_MAT_TILE[0] * TILE;
    const matY = VENUE_MAT_TILE[1] * TILE;
    const mg = this.add.graphics().setDepth(2.5);
    mg.fillStyle(0x0a0e18, 0.9).fillRect(matX + 3, matY + 2, TILE - 6, TILE - 4);
    mg.lineStyle(2, 0xffb13c, 0.85).strokeRect(matX + 3, matY + 2, TILE - 6, TILE - 4);
    mg.fillStyle(0xffb13c, 0.35).fillRect(matX + 7, matY + TILE - 9, TILE - 14, 3);
    this.add.text(matX + TILE / 2, matY + TILE / 2 - 2, "▼", displayFont(13, { color: "#eafdff", fontStyle: "bold" })).setOrigin(0.5).setDepth(2.6);
    this.homeFurnLayer = this.add.container(0, 0).setDepth(3);
    this.homeGhostG = this.add.graphics().setDepth(3.5);
    // NOTE: net-dependent wiring (onEstate callback, pointer placement, first render) is
    // deferred to wireHomeAfterNet() — this method runs before this.net is constructed.
  }

  /** Re-point the hub's story allies at the dialogue for the player's current questline act. */
  private refreshAllyLines() {
    if (!this.isCityHub) return;
    for (const n of this.npcs) {
      if (n.kind === "talk" && n.npcId && (STORY_ALLIES as readonly string[]).includes(n.npcId)) {
        n.lines = campaignAllyLines(n.npcId, this.net.campaignQuest);
        n.lineIdx = 0;
      }
    }
  }

  /** Home wiring that needs this.net (called once the NetClient exists). */
  private wireHomeAfterNet() {
    if (this.isEstates) {
      this.net.onEstatesDir = () => this.drawEstatePlates();
      return;
    }
    if (this.homeIdx < 0) return;
    this.net.onEstate = () => this.refreshHome();
    this.input.off("pointerdown", this.onHomePointer, this);
    this.input.on("pointerdown", this.onHomePointer, this);
    this.input.off("pointermove", this.onHomeHover, this);
    this.input.on("pointermove", this.onHomeHover, this);
    this.refreshHome();
  }

  /** FOR SALE / owner plates over every door on the ESTATES street (from the server directory). */
  private drawEstatePlates() {
    for (const o of this.estatePlateObjs) o.destroy();
    this.estatePlateObjs = [];
    if (!this.isEstates) return;
    for (const entry of this.net.estatesDir) {
      const plot = ESTATES.plots[entry.i];
      if (!plot) continue;
      const px = plot.door[0] * TILE + TILE / 2;
      const py = plot.door[1] * TILE - 46; // above the door's own "HOME N" label — no overlap
      const forSale = entry.forSale;
      const label = forSale ? `FOR SALE ₵${entry.price}` : `◈ ${(entry.name ?? "OWNED").toUpperCase()}`;
      const color = forSale ? 0x39ff88 : 0xffb13c;
      const g = this.add.graphics().setDepth(7.5);
      const tw = label.length * 6 + 12;
      g.fillStyle(0x0a0e18, 0.92).fillRect(px - tw / 2, py - 8, tw, 14);
      g.lineStyle(1, color, 0.85).strokeRect(px - tw / 2, py - 8, tw, 14);
      const t = this.add.text(px, py - 1, label, bodyFont(8, { color: hexColor(color), fontStyle: "bold" })).setOrigin(0.5).setDepth(7.6);
      this.estatePlateObjs.push(g, t);
      if (forSale) this.tweens.add({ targets: t, alpha: 0.55, duration: 1400, yoyo: true, repeat: -1 });
    }
  }

  /** HOUSING REGISTRY — every home at a glance: owner, price, furnishings, signatures.
   *  The most-furnished owned home gets a ✦ FEATURED badge; click a row to walk there. */
  /** True while any full-screen overlay is open — delegates to the PanelRouter. */
  private anyPanelOpen(): boolean {
    return this.panelRouter?.anyOpen() ?? false;
  }

  /** Close the one open overlay (the ESC path) — delegates to the PanelRouter. */
  private closeTopPanel(): boolean {
    return this.panelRouter?.closeTop() ?? false;
  }

  private toggleRegistry() {
    if (this.registryOpen) {
      for (const o of this.registryObjs) o.destroy();
      this.registryObjs = [];
      this.registryOpen = false;
      return;
    }
    this.registryOpen = true;
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.registryObjs.push(o);
      return o;
    };
    const W = this.scale.width;
    const pw = Math.min(560, W - 40);
    const px = (W - pw) / 2;
    const py = 40;
    const rowH = 22; // 20 homes must fit the 540-design-height screen
    const ph = 66 + ESTATES.plots.length * rowH;
    const g = push(this.add.graphics().setScrollFactor(0).setDepth(1300));
    g.fillStyle(0x0a0818, 0.96).fillRoundedRect(px, py, pw, ph, 6);
    g.lineStyle(1.5, 0xffb13c, 0.9).strokeRoundedRect(px, py, pw, ph, 6);
    push(this.add.text(px + 16, py + 12, "▣ HOUSING REGISTRY", displayFont(15, { color: "#ffcf8a", fontStyle: "bold" })).setScrollFactor(0).setDepth(1301));
    push(this.add.text(px + pw - 16, py + 14, "click a home to walk there · E/ESC close", bodyFont(9, { color: "#9aa3b2" })).setOrigin(1, 0).setScrollFactor(0).setDepth(1301));
    const dir = this.net.estatesDir;
    const featured = dir.filter((d) => d.owner).sort((a, b) => b.furn - a.furn)[0];
    let ry = py + 40;
    for (const entry of dir) {
      const plot = ESTATES.plots[entry.i];
      if (!plot) continue;
      const isFeat = featured && entry.i === featured.i && entry.furn > 0;
      const rowColor = entry.forSale ? 0x39ff88 : 0xffb13c;
      g.fillStyle(entry.i % 2 ? 0x12102a : 0x0e0c1c, 0.9).fillRect(px + 10, ry, pw - 20, rowH - 3);
      if (isFeat) g.lineStyle(1.2, 0xf7ff3c, 0.9).strokeRect(px + 10, ry, pw - 20, rowH - 3);
      push(
        this.add
          .text(px + 20, ry + 4, `HOME ${entry.i + 1}${isFeat ? " ✦" : ""}`, bodyFont(10, { color: isFeat ? "#f7ff3c" : "#cfe8ff", fontStyle: "bold" }))
          .setScrollFactor(0)
          .setDepth(1301),
      );
      push(
        this.add
          .text(px + pw / 2 - 30, ry + 4, entry.forSale ? `FOR SALE ₵${entry.price}` : `◈ ${(entry.name ?? "OWNED").toUpperCase()}`, bodyFont(9, { color: hexColor(rowColor) }))
          .setScrollFactor(0)
          .setDepth(1301),
      );
      push(
        this.add
          .text(px + pw - 20, ry + 4, `★${entry.furn} furn · ✎${entry.guests}`, bodyFont(9, { color: "#9aa3b2" }))
          .setOrigin(1, 0)
          .setScrollFactor(0)
          .setDepth(1301),
      );
      const z = push(this.add.zone(px + 10, ry, pw - 20, rowH - 3).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(1302));
      const door = plot.door;
      z.on("pointerdown", () => {
        this.toggleRegistry();
        const wx = door[0] * TILE + TILE / 2;
        const wy = door[1] * TILE + TILE / 2;
        this.clickMove.setDestination(wx, wy, this.zoneGrid, this.net.pred.x, this.net.pred.y);
        this.rsExamine(`Walking to HOME ${entry.i + 1}.`);
      });
      ry += rowH;
    }
  }

  /** Ambient pedestrians for the hub — dense enough that the city never feels empty
   *  at low player counts. Pure set dressing: seeded looks, grid-aware wandering. */
  private spawnHubWanderers() {
    this.spawnWanderers(ONLINE_CITY.grid, HUB_CX, HUB_CY, 22);
    // Fake concurrent runners so the "ONLINE (0)" death-spiral never shows raw.
    this.phantomOnline = 8 + Math.floor(Math.random() * 14);
  }

  /**
   * South-plaza training yard — three clickable HSS holograms so a new runner can
   * get their first "kill" without leaving the safe hub. Pure client set dressing;
   * grants first-session kill credit + combat XP whisper.
   */
  private spawnTrainingYard() {
    const gate = CITY_HUB_DOORS.find((d) => d.dest === "d0");
    if (!gate) return;
    const gx = gate.tile[0] * TILE + TILE / 2;
    const gy = gate.tile[1] * TILE + TILE / 2;
    const offsets: [number, number][] = [
      [-48, -28],
      [0, -40],
      [48, -28],
    ];
    offsets.forEach(([ox, oy], i) => {
      const x = gx + ox;
      const y = gy + oy;
      const tint = ENEMY_KIND_TINT[i % ENEMY_KIND_TINT.length] ?? 0xff5a6e;
      const spr = this.add
        .sprite(x, y, COP_KEY, 0)
        .setTint(tint)
        .setAlpha(0.72)
        .setDepth(8)
        .setScale(1.1)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, y - 28, "DRILL", bodyFont(8, { color: "#ff8a9a", fontStyle: "bold" }))
        .setOrigin(0.5)
        .setDepth(9)
        .setAlpha(0.7);
      const glow = this.add
        .image(x, y + 4, GLOW_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(tint)
        .setScale(0.55)
        .setAlpha(0.28)
        .setDepth(7);
      let hp = 3;
      spr.on("pointerdown", () => {
        hp--;
        this.particles?.spark(x, y, tint, 1.6);
        this.pops?.pop(x, y - 18, "-1", "#ff8a9a");
        this.synth?.hit();
        juiceShake(this, 40, 0.002);
        spr.setTint(0xffffff);
        this.time.delayedCall(50, () => {
          if (spr.active && hp > 0) spr.setTint(tint);
        });
        if (hp <= 0) {
          noteKill();
          this.pushKillFeed("drill target purged");
          this.synth?.kill();
          this.particles?.burst(x, y, 0.9);
          this.pops?.popCrit(x, y - 24, "DRILL CLEAR");
          spr.destroy();
          glow.destroy();
          const r = grantSkillXp(this.rsSkills, "combat", 18);
          this.rsSkillsPanel.setSkills(this.rsSkills);
          if (r.leveled) this.pops?.popHeal(this.me.x, this.me.y - 36, `Combat ${r.level}!`);
        }
      });
    });
  }

  private spawnWanderers(grid: TileGrid, cx: number, cy: number, count: number) {
    this.wandererGrid = grid;
    let seed = 90210 + cx * 31 + cy;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const colors = [0x8bff6a, 0x6b9bff, 0xff79c6, 0xf7ff3c, 0x9aa3b2, 0xb06bff, 0x39ff88, 0xffb13c];
    const skins = [0xf3d2b8, 0xe6b58c, 0xc98a5e, 0xa9794a, 0x7c4f30, 0x4f3220];
    const hairs = ["short", "long", "buzz", "undercut", "bun", "braids", "dreads", "ponytail"] as const;
    const cloaks = ["coat", "cape", "none", "none"] as const;
    const walkable = (tx: number, ty: number) => grid[ty]?.[tx] !== undefined && !isWall(grid[ty][tx]);
    for (let i = 0; i < count; i++) {
      // scatter on walkable street tiles in a ring around the anchor
      let tx = 0;
      let ty = 0;
      for (let tries = 0; tries < 40; tries++) {
        const ang = rnd() * Math.PI * 2;
        const r = 4 + rnd() * 20;
        tx = Math.round(cx + Math.cos(ang) * r);
        ty = Math.round(cy + Math.sin(ang) * r * 0.8);
        if (walkable(tx, ty)) break;
      }
      if (!walkable(tx, ty)) continue;
      const look = hubLook({
        color: colors[Math.floor(rnd() * colors.length)],
        sex: rnd() < 0.5 ? "f" : "m",
        skin: skins[Math.floor(rnd() * skins.length)],
        hair: hairs[Math.floor(rnd() * hairs.length)],
        hairColor: rnd() < 0.3 ? colors[Math.floor(rnd() * colors.length)] : 0x1b1820,
        cloak: cloaks[Math.floor(rnd() * cloaks.length)],
        head: rnd() < 0.25 ? "cap" : "none",
      });
      const key = lookKey(look);
      bakeRemoteLook(this, key, look);
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      const spr = this.add.sprite(x, y, key, 0).setDepth(8.5).setAlpha(0.92).setScale(1.08);
      this.wanderers.push({ spr, x, y, tx, ty, speed: 34 + rnd() * 26, pauseUntil: this.time.now + rnd() * 3000, bob: rnd() * Math.PI * 2 });
    }
  }

  /** Per-frame stroll: walk 3–8 tiles along a walkable cardinal run, pause, turn. */
  private updateWanderers(dt: number) {
    if (this.wanderers.length === 0 || !this.wandererGrid) return;
    const grid = this.wandererGrid;
    const walkable = (tx: number, ty: number) => grid[ty]?.[tx] !== undefined && !isWall(grid[ty][tx]);
    const now = this.time.now;
    for (const wd of this.wanderers) {
      if (now < wd.pauseUntil) continue;
      const gx = wd.tx * TILE + TILE / 2;
      const gy = wd.ty * TILE + TILE / 2;
      const dx = gx - wd.x;
      const dy = gy - wd.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) {
        // arrived — pick a new walkable cardinal run (3-8 tiles), else pause and retry
        const curTx = Math.round((wd.x - TILE / 2) / TILE);
        const curTy = Math.round((wd.y - TILE / 2) / TILE);
        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].sort(() => Math.random() - 0.5);
        let picked = false;
        for (const [ddx, ddy] of dirs) {
          const len = 3 + Math.floor(Math.random() * 6);
          let reach = 0;
          for (let s = 1; s <= len; s++) {
            if (!walkable(curTx + ddx * s, curTy + ddy * s)) break;
            reach = s;
          }
          if (reach >= 2) {
            wd.tx = curTx + ddx * reach;
            wd.ty = curTy + ddy * reach;
            wd.spr.setFlipX(ddx < 0);
            picked = true;
            break;
          }
        }
        wd.pauseUntil = now + (picked ? 600 + Math.random() * 2200 : 1500);
        continue;
      }
      const step = (wd.speed * dt) / 1000;
      wd.x += (dx / dist) * Math.min(step, dist);
      wd.y += (dy / dist) * Math.min(step, dist);
      wd.bob += dt * 0.012;
      wd.spr.setPosition(wd.x, wd.y + Math.sin(wd.bob) * 1.2);
    }
  }

  /** Cursor ghost while placing furniture — shows the piece footprint + red when blocked. */
  private onHomeHover(pointer: Phaser.Input.Pointer) {
    if (!this.homeGhostG) return;
    this.homeGhostG.clear();
    if (!this.homeEditing || !this.homeSelKind || this.homeIdx < 0) return;
    const k = furnitureKind(this.homeSelKind);
    if (!k) return;
    const tx = Math.floor(pointer.worldX / TILE);
    const ty = Math.floor(pointer.worldY / TILE);
    if (tx < 1 || tx > VENUE_ROOM_W - 2 || ty < 1 || ty > VENUE_ROOM_H - 2) return;
    // Hovering an existing piece → red "remove" cursor over its full footprint; otherwise the
    // green/red placement footprint tells you exactly whether the whole piece fits here.
    const overIdx = pieceAt(this.homeDraft, tx, ty);
    if (overIdx >= 0) {
      const pc = this.homeDraft[overIdx];
      const pk = furnitureKind(pc.k)!;
      this.homeGhostG.fillStyle(0xff3b6b, 0.22).fillRoundedRect(pc.x * TILE + 2, pc.y * TILE + 2, pk.w * TILE - 4, pk.h * TILE - 4, 4);
      this.homeGhostG.lineStyle(1.5, 0xff3b6b, 0.95).strokeRoundedRect(pc.x * TILE + 2, pc.y * TILE + 2, pk.w * TILE - 4, pk.h * TILE - 4, 4);
      return;
    }
    const fits = furnitureFits(tx, ty, k, occupiedTiles(this.homeDraft));
    const c = fits ? k.color : 0xff3b6b;
    this.homeGhostG.fillStyle(c, 0.25).fillRoundedRect(tx * TILE + 2, ty * TILE + 2, k.w * TILE - 4, k.h * TILE - 4, 4);
    this.homeGhostG.lineStyle(1.5, c, 0.9).strokeRoundedRect(tx * TILE + 2, ty * TILE + 2, k.w * TILE - 4, k.h * TILE - 4, 4);
  }

  /** Re-render placed furniture + the ownership/editor controls from the current estate state. */
  private refreshHome() {
    if (this.homeIdx < 0 || !this.homeFurnLayer) return;
    const e = this.net.estate;
    const pieces = this.homeEditing ? this.homeDraft : e?.furniture ?? [];
    this.homeFurnLayer.removeAll(true);
    // While editing, lay a faint tile grid over the floor so placement snaps read clearly.
    if (this.homeEditing) {
      const grid = this.add.graphics().setDepth(2.2);
      grid.lineStyle(1, 0x8dfff0, 0.12);
      for (let gx = 1; gx <= VENUE_ROOM_W - 1; gx++) grid.lineBetween(gx * TILE, 1 * TILE, gx * TILE, (VENUE_ROOM_H - 1) * TILE);
      for (let gy = 1; gy <= VENUE_ROOM_H - 1; gy++) grid.lineBetween(1 * TILE, gy * TILE, (VENUE_ROOM_W - 1) * TILE, gy * TILE);
      this.homeFurnLayer.add(grid);
    }
    // rugs draw first so everything else sits ON them
    const ordered = [...pieces].sort((a, b) => (a.k === "rug" ? -1 : 0) - (b.k === "rug" ? -1 : 0));
    for (const pc of ordered) {
      const k = furnitureKind(pc.k);
      if (!k) continue;
      const x = pc.x * TILE;
      const y = pc.y * TILE;
      const w = k.w * TILE;
      const h = k.h * TILE;
      const g = this.add.graphics();
      if (!drawFurniture(g, k.id, k.color, x, y, w, h)) {
        // unknown/future kind — the old glyph card still reads
        g.fillStyle(k.color, 0.5).fillRoundedRect(x + 2, y + 2, w - 4, h - 4, 4);
        g.lineStyle(1.5, k.color, 0.95).strokeRoundedRect(x + 2, y + 2, w - 4, h - 4, 4);
        const t = this.add.text(x + w / 2, y + h / 2, k.glyph, bodyFont(10, { color: hexColor(k.color), fontStyle: "bold" })).setOrigin(0.5);
        this.homeFurnLayer.add(t);
      }
      this.homeFurnLayer.add(g);
    }
    this.renderHomeControls();
  }

  /** The estate control bar (buy / furnish / list) + the furniture palette when editing. */
  private renderHomeControls() {
    for (const o of this.homeUi) o.destroy();
    this.homeUi = [];
    if (!this.homeEditing) this.homeGhostG?.clear(); // drop the cursor ghost when the editor closes
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.homeUi.push(o);
      return o;
    };
    const W = this.scale.width;
    const H = this.scale.height;
    const btn = (x: number, y: number, label: string, color: number, cb: () => void) => {
      const t = push(this.add.text(x, y, label, displayFont(12, { color: hexColor(color), fontStyle: "bold" })))
        .setScrollFactor(0)
        .setDepth(1200)
        .setPadding(9, 5, 9, 5)
        .setInteractive({ useHandCursor: true });
      t.setBackgroundColor("#0a0e18dd");
      t.on("pointerdown", cb);
      return t;
    };
    const e = this.net.estate;
    if (!e) {
      push(this.add.text(16, H - 40, "loading home…", bodyFont(11, { color: "#9aa3b2" })).setScrollFactor(0).setDepth(1200));
      return;
    }
    if (this.homeEditing) {
      const mobile = prefersMobileUx();
      // Responsive swatch palette: colour chips sized to the screen, wrapping to as many rows
      // as it takes — never the old fixed 6×120px grid that ran off the right of a phone.
      const pad = 12;
      const paletteX = pad;
      const paletteW = W - pad * 2;
      const sw = mobile ? 42 : 52; // swatch size
      const gap = mobile ? 6 : 8;
      const cols = Math.max(4, Math.floor((paletteW + gap) / (sw + gap)));
      const headY = mobile ? 10 : 12;
      const gridTop = headY + (mobile ? 40 : 44);
      // backdrop behind the palette so swatches read over the room art
      const rowsN = Math.ceil(FURNITURE.length / cols);
      const bg = push(this.add.graphics().setScrollFactor(0).setDepth(1198));
      const bgH = gridTop + rowsN * (sw + gap) + 6;
      bg.fillStyle(0x07061a, 0.9).fillRoundedRect(paletteX - 4, headY - 6, paletteW + 8, bgH, 8);
      bg.lineStyle(1.5, 0xffb13c, 0.35).strokeRoundedRect(paletteX - 4, headY - 6, paletteW + 8, bgH, 8);

      const sel = furnitureKind(this.homeSelKind ?? "");
      push(this.add.text(paletteX + 2, headY, "FURNISH YOUR HOME", displayFont(mobile ? 12 : 14, { color: "#ffcf8a", fontStyle: "bold" })).setScrollFactor(0).setDepth(1200));
      const buffBits: string[] = [];
      if (sel?.buff?.regenPerSec) buffBits.push(`+${sel.buff.regenPerSec} HP/s`);
      if (sel?.buff?.heatDecayPct) buffBits.push(`HEAT −${Math.round(sel.buff.heatDecayPct * 100)}%`);
      if (sel?.buff?.shieldHome) buffBits.push(`+${sel.buff.shieldHome} shield`);
      if (sel?.buff?.movePct) buffBits.push(`+${Math.round(sel.buff.movePct * 100)}% move`);
      const selLine = sel
        ? `▸ ${sel.name}  ·  ${sel.w}×${sel.h}  ·  ₵${sel.price}${buffBits.length ? `  ·  ${buffBits.join(" ")}` : ""}`
        : "pick an item below — some pieces grant home buffs";
      push(this.add.text(paletteX + 2, headY + (mobile ? 18 : 20), selLine, bodyFont(mobile ? 10 : 11, { color: "#eafdff" })).setScrollFactor(0).setDepth(1200));
      push(
        this.add
          .text(paletteX + paletteW, headY + 2, mobile ? "tap floor: place · tap piece: remove" : "click floor to place · click a piece to remove", bodyFont(mobile ? 8 : 10, { color: "#9aa3b2" }))
          .setOrigin(1, 0)
          .setScrollFactor(0)
          .setDepth(1200),
      );

      FURNITURE.forEach((f, i) => {
        const cx = paletteX + (i % cols) * (sw + gap);
        const cy = gridTop + Math.floor(i / cols) * (sw + gap);
        const isSel = this.homeSelKind === f.id;
        const g = push(this.add.graphics().setScrollFactor(0).setDepth(1200));
        g.fillStyle(f.color, isSel ? 0.4 : 0.16).fillRoundedRect(cx, cy, sw, sw, 6);
        g.lineStyle(isSel ? 2.5 : 1.5, isSel ? 0xffffff : f.color, isSel ? 1 : 0.7).strokeRoundedRect(cx, cy, sw, sw, 6);
        // footprint pips (top-left) so 2×1 / 2×2 pieces are obvious before you place them
        if (f.w > 1 || f.h > 1) push(this.add.text(cx + 4, cy + 3, `${f.w}×${f.h}`, bodyFont(8, { color: "#eafdff" })).setScrollFactor(0).setDepth(1201));
        push(this.add.text(cx + sw / 2, cy + sw / 2 - 4, f.glyph, displayFont(mobile ? 13 : 15, { color: hexColor(f.color), fontStyle: "bold" })).setOrigin(0.5).setScrollFactor(0).setDepth(1201));
        push(this.add.text(cx + sw / 2, cy + sw - 8, `₵${f.price}`, bodyFont(8, { color: "#9aa3b2" })).setOrigin(0.5).setScrollFactor(0).setDepth(1201));
        const z = push(this.add.zone(cx, cy, sw, sw).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(1202));
        z.on("pointerdown", () => {
          this.homeSelKind = f.id;
          this.synth?.footstep();
          this.renderHomeControls();
        });
      });

      // Action bar pinned to the bottom edge (thumb-reachable on mobile).
      const barY = H - (mobile ? 44 : 40);
      push(this.add.text(paletteX, barY - (mobile ? 20 : 22), `placed ${this.homeDraft.length} / 40`, bodyFont(mobile ? 10 : 11, { color: "#9aa3b2" })).setScrollFactor(0).setDepth(1200));
      btn(paletteX, barY, "✓ SAVE", 0x39ff88, () => {
        this.net.estateFurnish(this.homeDraft);
        this.homeEditing = false;
        this.synth?.pickup();
        this.refreshHome();
      });
      btn(paletteX + (mobile ? 96 : 108), barY, "✕ CANCEL", 0xff3b6b, () => {
        this.homeEditing = false;
        this.refreshHome();
      });
      btn(W - pad - (mobile ? 92 : 104), barY, "⌫ CLEAR ALL", 0xff9d3c, () => {
        if (this.homeDraft.length === 0) return;
        this.homeDraft = [];
        this.synth?.footstep();
        this.refreshHome();
      });
      return;
    }
    const status = e.mine ? "YOUR HOME" : e.owner ? `Owned by ${e.ownerName ?? "someone"}` : "UNCLAIMED HOME";
    push(this.add.text(16, H - 60, status, displayFont(13, { color: "#ffcf8a", fontStyle: "bold" })).setScrollFactor(0).setDepth(1200));
    if (e.mine) {
      const buffs = furnitureHomeBuffs(e.furniture ?? []);
      const bits: string[] = [];
      if (buffs.regenPerSec > 0) bits.push(`+${buffs.regenPerSec.toFixed(1)} HP/s`);
      if (buffs.heatDecayPct > 0) bits.push(`HEAT −${Math.round(buffs.heatDecayPct * 100)}%`);
      if (buffs.shieldHome > 0) bits.push(`+${buffs.shieldHome} shield`);
      if (buffs.movePct > 0) bits.push(`+${Math.round(buffs.movePct * 100)}% move`);
      if (bits.length) {
        push(
          this.add
            .text(16, H - 78, `HOME BUFFS · ${bits.join(" · ")}`, bodyFont(10, { color: "#39ff88" }))
            .setScrollFactor(0)
            .setDepth(1200),
        );
      }
      btn(16, H - 38, "FURNISH (F)", 0xffb13c, () => this.startFurnishing());
      btn(140, H - 38, "LOCKBOX", 0x8dfff0, () => this.openService("stash"));
      if (e.forSale) {
        btn(250, H - 38, `LISTED ₵${e.price} · UNLIST`, 0x9aa3b2, () => this.net.estateUnlist());
      } else {
        // asking-price presets scale with the furnishings you've invested
        const furnValue = (e.furniture ?? []).reduce((s, p) => s + (furnitureKind(p.k)?.price ?? 0), 0);
        const fair = Math.max(2500, Math.round((2500 + furnValue * 1.5) / 50) * 50);
        const high = Math.round((fair * 2) / 50) * 50;
        push(this.add.text(250, H - 58, "LIST FOR SALE:", bodyFont(10, { color: "#9aa3b2" })).setScrollFactor(0).setDepth(1200));
        btn(250, H - 38, `₵2500`, 0x39ff88, () => this.net.estateList(2500));
        btn(330, H - 38, `₵${fair} FAIR`, 0x00e5ff, () => this.net.estateList(fair));
        btn(460, H - 38, `₵${high} HIGH`, 0xff79c6, () => this.net.estateList(high));
      }
    } else if (!e.owner || e.forSale) {
      btn(16, H - 38, `BUY THIS HOME ₵${e.price} (B)`, 0x39ff88, () => this.net.estateBuy());
      if (e.owner) btn(260, H - 38, "SIGN GUESTBOOK (G)", 0xb06bff, () => this.net.estateSign());
    } else {
      push(this.add.text(16, H - 38, "not for sale", bodyFont(11, { color: "#9aa3b2" })).setScrollFactor(0).setDepth(1200));
      btn(130, H - 38, "SIGN GUESTBOOK (G)", 0xb06bff, () => this.net.estateSign());
    }
    // visitor book — latest signatures, bottom-right (owned homes only)
    if (e.owner) {
      const guests = e.guests ?? [];
      push(
        this.add
          .text(W - 16, H - 104, `◈ GUESTBOOK (${guests.length})`, displayFont(11, { color: "#b06bff", fontStyle: "bold" }))
          .setOrigin(1, 0)
          .setScrollFactor(0)
          .setDepth(1200),
      );
      guests.slice(0, 3).forEach((gst, i) => {
        push(
          this.add
            .text(W - 16, H - 86 + i * 16, `${gst.n} — ${gst.s}`, bodyFont(10, { color: "#cbb3e8" }))
            .setOrigin(1, 0)
            .setScrollFactor(0)
            .setDepth(1200),
        );
      });
      if (guests.length === 0)
        push(this.add.text(W - 16, H - 86, "no signatures yet", bodyFont(10, { color: "#6b7184" })).setOrigin(1, 0).setScrollFactor(0).setDepth(1200));
    }
  }

  private startFurnishing() {
    const e = this.net.estate;
    if (!e?.mine) return;
    this.homeDraft = (e.furniture ?? []).map((p) => ({ ...p }));
    this.homeSelKind = this.homeSelKind ?? FURNITURE[0].id;
    this.homeEditing = true;
    this.refreshHome();
  }

  /** Click-to-place / click-to-remove furniture while editing a home. */
  private onHomePointer(pointer: Phaser.Input.Pointer) {
    if (!this.homeEditing || !this.homeSelKind || this.homeIdx < 0) return;
    const tx = Math.floor(pointer.worldX / TILE);
    const ty = Math.floor(pointer.worldY / TILE);
    if (tx < 1 || tx > VENUE_ROOM_W - 2 || ty < 1 || ty > VENUE_ROOM_H - 2) return; // inside the room walls
    // Click any tile of an existing piece to remove it (not just its anchor corner).
    const overIdx = pieceAt(this.homeDraft, tx, ty);
    if (overIdx >= 0) {
      this.homeDraft.splice(overIdx, 1);
      this.synth?.footstep();
      this.refreshHome();
      return;
    }
    const k = furnitureKind(this.homeSelKind);
    if (!k) return;
    if (this.homeDraft.length >= 40) {
      this.rsExamine("Home is full — 40 pieces max. Remove something first.");
      return;
    }
    if (!furnitureFits(tx, ty, k, occupiedTiles(this.homeDraft))) {
      this.rsExamine(k.w > 1 || k.h > 1 ? `${k.name} needs a clear ${k.w}×${k.h} space here.` : "Something's already there.");
      return;
    }
    this.homeDraft.push({ k: this.homeSelKind, x: tx, y: ty });
    this.synth?.pickup();
    this.refreshHome();
  }

  /** A door into a building interior — a glowing portal you enter with E (or click).
   *  `flat` skips the free-standing portal box (district doorways draw their own
   *  recessed FRLG-style opening in the wall face instead). */
  private makeDoor(door: { dest: string; label: string; tile: [number, number]; color: number; flat?: boolean }) {
    const px = door.tile[0] * TILE + TILE / 2;
    const py = door.tile[1] * TILE + TILE / 2;
    if (!door.flat) {
      const g = this.add.graphics().setDepth(8);
      g.fillStyle(door.color, 0.16).fillRect(px - 18, py - 24, 36, 48);
      g.lineStyle(2, door.color, 0.9).strokeRect(px - 18, py - 24, 36, 48);
      this.add.image(px, py, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(door.color).setDepth(8).setScale(0.5).setAlpha(0.4);
    }
    if (door.flat) {
      // Building doors get a real SIGN: a neon board mounted on the facade above the
      // doorway that reads at a glance — no hovering required to know what a place is.
      this.drawBuildingSign(px, py - TILE - 6, door.label, door.color);
    } else {
      // Stall/transit markers keep the soft hover label so the plaza isn't a wall of text.
      const lbl = this.add
        .text(px, py - 36, door.label, {
          fontFamily: "Courier New, monospace",
          fontSize: "9px",
          color: "#" + (door.color & 0xffffff).toString(16).padStart(6, "0"),
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(9)
        .setAlpha(0.42);
      const zl = this.add.zone(px - 18, py - 24, 36, 48).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(9);
      zl.on("pointerover", () => lbl.setAlpha(1));
      zl.on("pointerout", () => lbl.setAlpha(0.42));
      zl.on("pointerdown", () => this.enterZone(door.dest));
      this.npcs.push({ kind: "door", dest: door.dest, name: door.label, x: px, y: py });
      return;
    }
    const z = this.add.zone(px - 18, py - 24, 36, 48).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(9);
    z.on("pointerdown", () => this.enterZone(door.dest));
    this.npcs.push({ kind: "door", dest: door.dest, name: door.label, x: px, y: py });
  }

  /** A neon signboard on a building facade — dark board, lit rim, the venue name in
   *  its accent colour, a light-wash below. A few signs flicker like tired neon. */
  private drawBuildingSign(cx: number, cy: number, label: string, color: number) {
    const text = this.add
      .text(cx, cy, label, {
        fontFamily: "Courier New, monospace",
        fontSize: "9px",
        color: "#eafdff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(6.2)
      .setShadow(0, 0, "#" + (color & 0xffffff).toString(16).padStart(6, "0"), 4, true, true);
    const w = Math.max(34, text.width + 12);
    const g = this.add.graphics().setDepth(6.1);
    g.fillStyle(0x070912, 0.94).fillRect(cx - w / 2, cy - 9, w, 18);
    g.lineStyle(1.5, color, 0.95).strokeRect(cx - w / 2, cy - 9, w, 18);
    g.fillStyle(color, 0.75).fillRect(cx - w / 2 + 2, cy + 7, w - 4, 2); // lit underside
    // mounting stubs so the board reads attached to the wall, not floating
    g.fillStyle(0x2a3244, 1).fillRect(cx - w / 2 + 3, cy - 12, 3, 4).fillRect(cx + w / 2 - 6, cy - 12, 3, 4);
    this.add.image(cx, cy + 8, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(color).setDepth(6).setScale(0.55).setAlpha(0.3);
    // ~1 in 4 signs has a lazy neon flicker — life, not chaos (deterministic per spot)
    if ((Math.abs(cx * 31 + cy * 17) >> 3) % 4 === 0) {
      this.tweens.add({
        targets: text,
        alpha: { from: 1, to: 0.55 },
        duration: 120 + ((cx | 0) % 90),
        yoyo: true,
        repeat: -1,
        repeatDelay: 1400 + ((cy | 0) % 1700),
        ease: "Stepped",
      });
    }
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

  /** First deployment into combat — gated on accepting THE WAKE (or first-session FIXER talk). */
  private deployOrganic(zone: string) {
    const fs = getFirstSession();
    const allowed =
      this.net.godMode || !!this.net.campaignQuest || fs.talkedFixer || fs.step !== "meet_fixer";
    if (!allowed) {
      this.showBubble(this.me.x, this.me.y, "Visit THE FIXER (green light) first — then deploy south.");
      return;
    }
    // Soft-unlock: if they talked to FIXER but campaign didn't latch yet, still let them fight.
    noteDeployed();
    this.travelOrganic(zone, this.zone === "safe" ? { from: this.zone } : undefined);
  }

  /** Premium zone handoff — fade/deploy instead of a hard scene.restart. */
  private travelTo(zone: string, extra?: { from?: string; tutorialMode?: TutorialMode }) {
    const destBridge = parseBridgeZone(zone);
    const bldgInt = parseBuildingInterior(zone);
    const hubInt = parseHubInterior(zone);
    const estateInt = parseEstateInterior(zone);
    const destDive = parseDiveZone(zone);
    const destNamed =
      !!INTERIOR_TITLES[zone] ||
      zone === "subway" ||
      zone === TUTORIAL_ZONE ||
      zone === ESTATES_ZONE ||
      destBridge >= 0 ||
      destDive >= 0 ||
      !!bldgInt ||
      hubInt !== null ||
      estateInt !== null;
    const di = bldgInt ? bldgInt.district : destNamed && destBridge < 0 ? 0 : destBridge >= 0 ? destBridge : this.parseZone(zone);
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
    const style = zone === "safe" || this.interior || bldgInt || hubInt !== null || estateInt !== null ? "fade" : "deploy";
    transitionTo(this, "Online", { zone, ...extra }, {
      style,
      accent,
      // Wait for server onClose flush before the next zone DO claims session_zone.
      onMid: () => this.net?.disconnectAwait(2500) ?? Promise.resolve(),
    });
  }

  private zoneUnlocked(zone: string): boolean {
    if (this.net.godMode) return true;
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
    if (destMatch && !this.interior && !this.isCityHub && !this.isSubway && !this.isDive) {
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
      this.rsExamine(`You arrive at ${this.zoneLabelFor(dest)}.`);
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
    const label = this.zoneLabelFor(dest);
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
    if (!this.usingRsControls()) return;
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
      if (n.cores > this.prevCores) {
        this.synth?.corePickup();
        this.pops?.popPickup(this.me.x, this.me.y - 16, `◈ +${n.cores - this.prevCores}`);
      } else {
        this.synth?.pickup();
        if (n.credits > this.prevCredits) this.pops?.popPickup(this.me.x, this.me.y - 16, `₵ +${n.credits - this.prevCredits}`);
      }
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
          juiceHitStop(this, e.boss ? 64 : 44);
          juiceZoomPunch(this, e.boss ? 0.055 : 0.038, 110);
        } else {
          this.synth?.hit();
          juiceHitStop(this, e.boss ? 28 : 14);
        }
        juiceShake(this, e.boss ? 110 : 65, e.boss ? 0.0055 : 0.003);
        const tint = ENEMY_KIND_TINT[e.kind] ?? 0xff8a9a;
        this.particles?.spark(e.x, e.y, tint, e.boss ? 2.4 : crit ? 2.1 : 1.7);
        this.particles?.flash(e.x, e.y, crit ? 0xffffff : tint, e.boss ? 0.7 : crit ? 0.55 : 0.4);
        const es = this.enemySprites.get(id);
        if (es) {
          playCombatPose(es, "hit");
          // Brief white flash so hits read at distance, then restore tier/elite tint.
          const restore =
            (es.getData("boss") ? e.tint : null) ??
            (es.getData("elite") ? e.tint : null) ??
            ENEMY_KIND_TINT[e.kind] ??
            COLORS.enemy;
          es.setTint(0xffffff);
          this.time.delayedCall(55, () => {
            if (es.active) es.setTint(restore ?? COLORS.enemy);
          });
        }
        this.pops?.pop(e.x, e.y - 24, `-${Math.round(dmg)}`, e.boss ? "#f7ff3c" : crit ? "#ffffff" : "#ff8a9a");
        if (crit) juiceNeonPulse(this, e.boss ? 0.28 : 0.18, 150);
        if (e.boss) juiceNeonPulse(this, 0.22, 180);
      }
      this.prevEnemyHp.set(id, { hp: e.hp, x: e.x, y: e.y, boss: e.boss });
    }
    for (const [id, prev] of this.prevEnemyHp) {
      if (!live.has(id)) {
        this.killStreak++;
        this.killStreakExpiresAt = this.time.now + OnlineScene.KILL_STREAK_MS;
        noteKill();
        this.pushKillFeed(prev.boss ? `BOSS DOWN` : `HSS purged`);
        this.synth?.kill();
        juiceShake(this, prev.boss ? 220 : 100, prev.boss ? 0.007 : 0.004);
        this.particles?.burst(prev.x, prev.y, prev.boss ? 1.35 : 0.95);
        this.groundGlow(prev.x, prev.y, prev.boss ? 0xffe08a : 0xff8a5c, prev.boss ? 1.5 : 0.8, prev.boss ? 620 : 380);
        if (prev.boss) {
          juiceNeonPulse(this, 0.35, 420);
          juiceFlash(this, 260, 40, 120, 60);
          juiceHitStop(this, 88);
          juiceZoomPunch(this, 0.05, 200);
          // Share card for social posts (no external API; local PNG download).
          try {
            downloadShareCard({
              title: "BOSS DOWN",
              subtitle: this.net.boss?.name ? `${this.net.boss.name} fell` : "HSS commander purged",
              detail: `${this.callsign || this.net.id || "runner"} · ${this.zoneLabelFor(this.zone)} · ₵${this.net.credits}`,
              accent: "#f7ff3c",
            });
          } catch {
            /* canvas / download blocked */
          }
        } else {
          juiceZoomPunch(this, 0.025 + Math.min(0.02, this.killStreak * 0.004), 105);
          // every kill lands a beat of stop — streaks stack more on top
          juiceHitStop(this, this.killStreak >= 2 ? 22 + Math.min(18, this.killStreak * 4) : 14);
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
    this.panelRouter?.syncMobileCloseButton(); // show the touch ✕ whenever an overlay is open
    if (this.isCityHub || this.isEstates) this.updateWanderers(dt); // ambient pedestrians
    const k = this.keys;
    const dn = (key?: Phaser.Input.Keyboard.Key) => (!this.chatOpen && key?.isDown ? 1 : 0);
    let mx = Math.sign(dn(k.D) + dn(k.RIGHT) - dn(k.A) - dn(k.LEFT));
    let my = Math.sign(dn(k.S) + dn(k.DOWN) - dn(k.W) - dn(k.UP));
    const pad = gamepadIntent(this);
    if (pad.active) {
      mx = Math.sign(pad.mx);
      my = Math.sign(pad.my);
    }
    // On-screen D-pad (mobile landscape) — same authority as WASD / stick.
    const touchPad = this.mobilePad?.intent();
    if (touchPad?.active) {
      mx = touchPad.mx;
      my = touchPad.my;
    }
    // Mobile includes tutorial; desktop drill stays pure action (no auto-path).
    const rs = this.usingRsControls() && (!this.isTutorial || prefersMobileUx());
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
      if (!this.blockRsInput() && !this.mobileUx()) {
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

    // Hide on-screen controls while menus / chat steal focus.
    if (this.mobilePad) {
      const showPad = !this.blockRsInput() && !this.chatOpen && !this.net.dead;
      this.mobilePad.setVisible(showPad);
    }

    this.net.setIntent(mx, my);
    this.net.update(dt);
    // FRLG doors — walk-in: pressing up on a doorstep enters the venue; walk-out:
    // stepping onto the room's south mat leaves. Both fire once per zone visit.
    if (!this.doorTransit) {
      if (this.districtDoors.length && my < 0 && mx === 0) {
        const p = this.playerPos(); // prefer live avatar (solo walk + connected), not raw pred
        const ptx = Math.floor(p.x / TILE);
        const pty = Math.floor(p.y / TILE);
        const d = this.districtDoors.find((dd) => dd.tx === ptx && dd.ty === pty && Math.abs(p.x - (dd.tx * TILE + TILE / 2)) < 12);
        if (d) {
          this.doorTransit = true;
          this.enterZone(d.dest);
        }
      } else if (this.interior && (parseBuildingInterior(this.zone) || parseHubInterior(this.zone) !== null || parseEstateInterior(this.zone) !== null)) {
        const p = this.playerPos();
        const [matTx, matTy] = venueLayoutFor(this.zone).mat; // est homes resolve to the classic [7,9]
        if (Math.floor(p.x / TILE) === matTx && Math.floor(p.y / TILE) === matTy) {
          this.doorTransit = true;
          this.travelOrganic(this.fromZone, { from: this.zone });
        }
      }
    }
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
      // Adaptive combat layer: enemy density + nearby boss + recent damage heat.
      let combat = Math.min(1, this.net.enemies.size / 12);
      if (this.net.boss?.alive) {
        const bdx = this.net.boss.x - this.me.x;
        const bdy = this.net.boss.y - this.me.y;
        const bd = Math.hypot(bdx, bdy);
        if (bd < 480) combat = Math.min(1, combat + 0.35 * (1 - bd / 480));
        else combat = Math.min(1, combat + 0.12);
      }
      if (this.net.heat > 0) combat = Math.min(1, combat + (this.net.heat / 100) * 0.25);
      if (this.synth) this.synth.setIntensity(combat);
      this.synth?.setCombatLayer?.(combat);
      MusicDirector.for(this)?.setCombatIntensity(combat, this);
    }
    // Capture coach — flip a node (owner change while we were channelling).
    this.trackNodeCaptures();
    if (this.neon && this.net.connected) {
      const combat = Math.min(1, this.net.enemies.size / 14);
      // the city glow answers both the district (enemy density) and the runner's HEAT
      this.neon.heat = 0.05 + combat * 0.42 + (this.net.heat / HEAT.max) * 0.3;
    }
    this.atmosphere?.update(this.time.now, dt, Math.min(1, this.net.enemies.size / 16));
    this.updateBossLocator();
    this.updateQuestWaypoint();
    this.updateEventBanner();
    this.drawEnemyHpBars();
    this.maybeHeatCoach();
    if (this.isCityHub && getFirstSession().step === "return") noteReturnedToHub();
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
      // Local dash afterimages — throttle so we don't spawn one sprite per render frame.
      if (performance.now() < this.net.predDashUntil && !this.net.dead) {
        const nowDash = this.time.now;
        if (nowDash - (this.lastDashGhostAt ?? 0) > 45) {
          this.lastDashGhostAt = nowDash;
          const ghost = this.add
            .sprite(this.me.x, this.me.y, this.me.texture.key, this.me.frame.name)
            .setAlpha(0.35)
            .setDepth(8)
            .setScale(this.me.scaleX, this.me.scaleY)
            .setTint(0x00e5ff);
          this.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
        }
      }
    }
    this.updateEscort("me", this.me.x, this.me.y, this.net.connected && this.net.escortActive && !this.net.dead);
    this.meShadow.setPosition(this.me.x, this.me.y + 12).setVisible(this.me.visible);
    // focal ring rides the player's feet with a gentle breathing pulse
    this.meRing
      .setVisible(this.me.visible && !this.net.dead)
      .setPosition(this.me.x, this.me.y + 10)
      .setScale(1 + 0.1 * Math.sin(this.time.now * 0.005), 0.5 + 0.05 * Math.sin(this.time.now * 0.005));
    // fake-3D: roofs project around the camera; the camera leads your movement
    this.roofParallax?.update(this.cameras.main);
    const fo = this.cameras.main.followOffset;
    fo.x += (-mx * 26 - fo.x) * 0.055;
    fo.y += (-my * 22 - fo.y) * 0.055;

    // remote players (interpolated by NetClient) — each rendered with ITS OWN
    // customization (baked from the look the server relays; colour as a tint).
    for (const [id, r] of this.net.remotes) {
      let s = this.remoteSprites.get(id);
      if (!s) {
        s = this.add.sprite(r.x, r.y, PLAYER_KEY, 0).setDepth(9).setScale(1.15);
        s.setData("born", this.time.now); // AOI pop-in reads amateur — fade arrivals in
        s.setData("shadow", this.groundShadow(r.x, r.y));
        this.remoteSprites.set(id, s);
        this.remoteLabels.set(
          id,
          this.add
            .text(r.x, r.y - 24, id, { fontFamily: "Courier New, monospace", fontSize: "9px", color: "#ff79c6" })
            .setOrigin(0.5)
            .setDepth(9)
            .setAlpha(0.75),
        );
      }
      // remote dash afterimage — throttled (was one sprite every render frame)
      if (r.dash && !r.dead) {
        const nowR = this.time.now;
        const last = (s.getData("dashGhostAt") as number) ?? 0;
        if (nowR - last > 50) {
          s.setData("dashGhostAt", nowR);
          const ghost = this.add.sprite(s.x, s.y, s.texture.key, s.frame.name).setAlpha(0.3).setDepth(8);
          this.tweens.add({ targets: ghost, alpha: 0, duration: 240, onComplete: () => ghost.destroy() });
        }
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
      // spawn fade (260ms). Alive remotes always full solid — never leave death-ghost alpha.
      const bornFade = Math.min(1, (this.time.now - (s.getData("born") ?? 0)) / 260);
      if (!r.dead && (s.alpha < 0.95 || s.angle !== 0 || Math.abs(s.scaleX - 1.15) > 0.2)) {
        this.tweens.killTweensOf(s);
        s.setAngle(0).setScale(1.15).setTint(r.look ? 0xffffff : 0xff79c6);
      }
      s.setPosition(r.x, r.y).setVisible(!r.dead).setAlpha((r.dead ? 0.3 : 1) * bornFade);
      const rShadow = s.getData("shadow") as Phaser.GameObjects.Image | undefined;
      rShadow?.setPosition(r.x, r.y + 12).setVisible(!r.dead).setAlpha(0.4 * bornFade);
      this.remoteLabels.get(id)?.setPosition(r.x, r.y - 22).setVisible(!r.dead);
      this.updateEscort(id, r.x, r.y, !!r.escort && !r.dead);
    }
    for (const [id, s] of this.remoteSprites) {
      if (!this.net.remotes.has(id)) {
        (s.getData("shadow") as Phaser.GameObjects.Image | undefined)?.destroy();
        s.destroy();
        this.remoteSprites.delete(id);
        this.remoteLabels.get(id)?.destroy();
        this.remoteLabels.delete(id);
        this.updateEscort(id, 0, 0, false);
      }
    }

    // FIRE — RS auto-attacks locked target; action mode hold-click / F / Ctrl; mobile ATK.
    const ptr = this.input.activePointer;
    const mobileFire = !!this.mobilePad?.isFireHeld();
    // Keyboard fire (F / Ctrl) — works even when panels aren't stealing focus; never in chat.
    const keyFire =
      !this.chatOpen &&
      !this.emoteWheelOpen &&
      !this.options?.isOpen &&
      !this.blockRsInput() &&
      keyDown(this, "fire");
    // Mobile ATK always works (even in RS/tap mode). Desktop action uses hold-click + keys.
    const rsFire = rs && this.attackTargetId !== null && !mobileFire && !keyFire;
    const mouseFire = !rs && ptr.isDown && !this.mobilePad?.containsScreen(ptr.x, ptr.y) && !this.blockRsInput();
    const actionFire = mouseFire || mobileFire || keyFire;
    let aim: number | null = null;
    if (rsFire) {
      const tgt = this.net.enemies.get(this.attackTargetId!);
      if (!tgt) this.attackTargetId = null;
      else {
        const origin = this.playerPos();
        const dist = Math.hypot(tgt.x - origin.x, tgt.y - origin.y);
        if (dist <= this.attackRange) aim = Math.atan2(tgt.y - origin.y, tgt.x - origin.x);
      }
    } else if (actionFire) {
      if (mobileFire) {
        // Hold ATK: aim at nearest enemy in range, else face walk direction.
        let bestId: number | null = null;
        let best: { x: number; y: number } | null = null;
        let bestD = this.attackRange * 1.35;
        const origin = this.playerPos();
        for (const [id, e] of this.net.enemies) {
          if (e.hp <= 0) continue;
          const d = Math.hypot(e.x - origin.x, e.y - origin.y);
          if (d < bestD) {
            bestD = d;
            best = e;
            bestId = id;
          }
        }
        if (best && bestId !== null) {
          this.attackTargetId = bestId;
          aim = Math.atan2(best.y - origin.y, best.x - origin.x);
        } else {
          const fx = this.meDir.x || (mx !== 0 ? mx : 1);
          const fy = this.meDir.y || my;
          aim = Math.atan2(fy, fx);
        }
      } else {
        const origin = this.playerPos();
        const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        aim = Math.atan2(wp.y - origin.y, wp.x - origin.x);
      }
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
        this.groundGlow(this.me.x, this.me.y, tint, 0.5, 170); // muzzle light on the pavement
        this.particles?.flash(m.x, m.y, tint, 0.42);
        juiceShake(this, 40, 0.0018);
        juiceZoomPunch(this, 0.014, 75);
      }
      if (mx === 0 && my === 0) {
        this.meDir.set(Math.cos(aim), Math.sin(aim));
        driveChar(this.me, this.meDir.x, this.meDir.y, false);
      }
    }
    const showMe = !this.net.dead && (this.net.connected || !!this.drillLocal);
    this.me.setVisible(showMe);
    // Death pose ends at alpha ~0.35; hit flash only dips to ~0.55. Catch stuck ghosts
    // without cancelling a mid-hit flash every frame.
    if (showMe && this.me.alpha <= 0.4) this.restoreLocalBody();
    this.meLight.update(this.me.x, this.me.y, this.time.now);
    this.meLight.setVisible(this.me.visible);

    this.minimapRefreshAcc += dt;
    if (this.zoneMinimap && !this.isTutorial && this.minimapRefreshAcc >= OnlineScene.MINIMAP_REFRESH_MS) {
      this.minimapRefreshAcc = 0;
      const blips: Array<{ x: number; y: number; color: number; r?: number }> = [];
      for (const e of this.net.enemies.values()) {
        // today's HVT burns hot orange on the radar — the 25× bounty is findable
        blips.push({
          x: e.x,
          y: e.y,
          color: e.hvt ? 0xff8a1f : e.boss ? 0xf7ff3c : 0xff5a6b,
          r: e.hvt ? uiDim(3.4) : e.boss ? uiDim(3.2) : uiDim(2),
        });
      }
      for (const n of this.npcs) blips.push({ x: n.x, y: n.y, color: 0x00e5ff, r: uiDim(1.8) });
      // other runners — party members pop gold so groups can regroup at a glance
      for (const [id, r] of this.net.remotes) {
        blips.push({ x: r.x, y: r.y, color: this.net.party.includes(id) ? 0xf7ff3c : 0xeafdff, r: uiDim(2.2) });
      }
      const pos = this.playerPos();
      this.zoneMinimap.render({ x: pos.x, y: pos.y, color: this.color }, blips, this.clickMove.destination);
    }
    if (this.questLog.open) this.refreshQuestLog();
    this.syncRsChrome();

    // PvP arena state — warn on enter/exit; the SERVER enforces the actual damage.
    const inPvp = this.net.connected && !this.interior && !this.isSubway && !this.isDive && inPvpZone(this.net.pred.x, this.net.pred.y, this.pvpZones);
    this.pvpHud.update({
      inZone: inPvp,
      inArena: this.net.pvpInArena,
      escrow: this.net.pvpEscrow,
    });

    // tutorial drill — lesson panel, chamber highlight, instructor + portal prompts
    if (this.isTutorial && this.tutorialPanel) {
      // Prefer local step defs so teach/hint stay in sync even when only snapshots
      // update tutorialStep (server tutorial messages also fill net.* fields).
      const step = tutorialStepAt(this.net.tutorialStep, this.net.tutorialMode);
      const count = step?.count ?? 1;
      const prog = this.net.tutorialProgress;
      const inst = step ? instructorForStep(step.kind, this.net.tutorialMode) : undefined;
      const chamber = step ? chamberForKind(step.kind) : undefined;
      const teach = this.net.tutorialTeach || step?.teach || "";
      const hint = this.net.tutorialHint || step?.hint || "";
      let body: string;
      if (!this.net.connected) {
        // Offline walk is preview-only — lessons are server-authoritative and will not
        // advance until the drill yard socket is up (was the silent "stuck on movement" bug).
        body = [
          "◢ DRILL YARD — LINKING…",
          "You can walk while connecting. Lessons need the server.",
          this.connectionState === "reconnecting" ? "▸ reconnecting — hold on" : "▸ connecting to drill server…",
          "▸ want in now? hit SKIP TO CITY (top-right) — works during load",
        ].join("\n");
      } else {
        const stepLine = step
          ? `◢ ${step.title}${inst ? `  ·  ${inst.name}` : ""}  (${Math.min(prog, count)}/${count})`
          : "◢ DRILL COMPLETE";
        body = [stepLine, chamber ? `📍 ${chamber.title.replace("◢ ", "")} — ${chamber.subtitle}` : "", teach, hint ? `▸ ${hint}` : ""]
          .filter(Boolean)
          .join("\n");
      }
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
        const tap = prefersMobileUx();
        let msg = "";
        if (this.net.tutorialPortalOpen && this.nearPortal) {
          msg = tap ? "▸ TAP — enter DEPLOY GATE (one way · live city)" : "▸ E — enter DEPLOY GATE (one way · live city)";
        } else if (near && step && near.kind === "instructor" && near.lessonKind === step.kind) {
          msg = tap ? `▸ TAP — talk to ${near.name}` : `▸ E — talk to ${near.name}`;
        } else if (inst && step?.kind !== "portal") {
          msg = tap
            ? `▸ tap-walk to ${chamber?.title.replace("◢ ", "") ?? "the next chamber"} · find ${inst.name}`
            : `▸ head to ${chamber?.title.replace("◢ ", "") ?? "the next chamber"} · find ${inst.name}`;
        } else if (this.net.tutorialPortalOpen) {
          msg = tap ? "▸ tap-walk east to the DEPLOY GATE" : "▸ walk east to the DEPLOY GATE";
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
      const walkIn = !!near && near.kind === "door" && !!near.dest && /^d\d+i\d+$/.test(near.dest);
      const tap = prefersMobileUx();
      const prompt = near
        ? walkIn
          ? tap
            ? `▸ TAP / walk up — ${near.name}`
            : `▸ walk up / E — ${near.name}`
          : tap
            ? `▸ TAP — ${label}`
            : `▸ E — ${label}`
        : "";
      this.interactPrompt.setText(prompt).setVisible(!!near);
    }

    // enemies (server-simulated) — tinted by HSS archetype (matches singleplayer reads)
    for (const [id, e] of this.net.enemies) {
      let s = this.enemySprites.get(id);
      if (!s) {
        // ICE-dive guardians render as the floating wraith (Resources pack) — a frozen-mind
        // spectre, not an HSS trooper. Non-boss dive enemies only; falls back to COP_KEY.
        const wraith = this.isDive && !e.boss && this.textures.exists(GUARDIAN_WRAITH_KEY);
        s = this.add.sprite(e.x, e.y, wraith ? GUARDIAN_WRAITH_KEY : COP_KEY, 0).setDepth(8).setAlpha(0).setScale(wraith ? 0.95 : 1.15);
        if (wraith) s.setData("wraith", this.textures.get(GUARDIAN_WRAITH_KEY).frameTotal - 1);
        this.tweens.add({ targets: s, alpha: 1, duration: 260 }); // AOI arrivals fade in
        s.setData("shadow", this.groundShadow(e.x, e.y, 0.48));
        this.enemySprites.set(id, s);
        this.maybeEnemyBark(e.x, e.y, e.kind); // deploy bark on first appearance
      }
      if (e.boss) {
        if (!s.getData("boss")) {
          s.setData("boss", true);
          s.setScale(2.6).setDepth(9).setTint(e.tint ?? COLORS.enemy); // a looming, named commander
          (s.getData("shadow") as Phaser.GameObjects.Image | undefined)?.setScale(1.3, 0.55).setAlpha(0.5);
        }
        this.updateBossOverlay(id, e);
      } else if (e.name && e.tint) {
        // ELITE — affix aura under the unit so the threat reads before the first hit
        if (!s.getData("elite")) {
          s.setData("elite", true);
          s.setTint(e.tint);
          const aura = this.add
            .image(e.x, e.y, GLOW_KEY)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(e.tint)
            .setScale(e.hvt ? 0.9 : 0.55, e.hvt ? 0.5 : 0.3)
            .setAlpha(e.hvt ? 0.42 : 0.3)
            .setDepth(7.6);
          s.setData("aura", aura);
          if (e.hvt) {
            // the day's bounty — bigger silhouette + a floating gold name so the hunt reads
            s.setScale(1.45);
            const label = this.add
              .text(e.x, e.y - 30, `◈ ${e.name}`, bodyFont(10, { color: "#ffd24a", fontStyle: "bold" }))
              .setOrigin(0.5)
              .setDepth(9.5)
              .setShadow(0, 0, "#ffd24a", 6, true, true);
            s.setData("hvtLabel", label);
          }
        }
      } else if (s.getData("kind") !== e.kind) {
        s.setTint(ENEMY_KIND_TINT[e.kind] ?? COLORS.enemy);
        s.setData("kind", e.kind);
      }
      const edx = e.tx - e.x;
      const edy = e.ty - e.y;
      const wraithFrames = s.getData("wraith") as number | undefined;
      if (wraithFrames) {
        // wraiths float in place (frame cycle) + bob + face travel; no walk anim
        s.setFrame(Math.floor(this.time.now / 160 + id) % wraithFrames);
        s.setFlipX(edx < -0.1);
        s.setPosition(e.x, e.y + Math.sin(this.time.now * 0.004 + id) * 3);
      } else {
        driveChar(s, edx, edy, edx * edx + edy * edy > 0.4); // walk from their heading
        s.setPosition(e.x, e.y);
      }
      (s.getData("shadow") as Phaser.GameObjects.Image | undefined)?.setPosition(e.x, e.y + (e.boss ? 26 : 12));
      const aura = s.getData("aura") as Phaser.GameObjects.Image | undefined;
      aura?.setPosition(e.x, e.y + 10).setAlpha(0.24 + Math.sin(this.time.now / 260) * 0.08);
      (s.getData("hvtLabel") as Phaser.GameObjects.Text | undefined)?.setPosition(e.x, e.y - 30);
    }
    for (const [id, s] of this.enemySprites)
      if (!this.net.enemies.has(id)) {
        (s.getData("shadow") as Phaser.GameObjects.Image | undefined)?.destroy();
        (s.getData("aura") as Phaser.GameObjects.Image | undefined)?.destroy();
        (s.getData("hvtLabel") as Phaser.GameObjects.Text | undefined)?.destroy();
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
      // friendly = a called airstrike (hits the HSS): magenta, not threat-red
      const col = hz.friendly ? 0xff2bd6 : danger > 0.72 ? 0xff2b2b : 0xff7a3c;
      this.hazardG.fillStyle(col, 0.1 + 0.32 * danger);
      this.hazardG.fillCircle(hz.x, hz.y, hz.r * (0.22 + 0.78 * danger)); // inner fill rushes outward
      this.hazardG.lineStyle(3, col, 0.85);
      this.hazardG.strokeCircle(hz.x, hz.y, hz.r);
    }

    // projectiles (server-simulated)
    for (const [id, sh] of this.net.shots) {
      let s = this.shotSprites.get(id);
      if (!s) {
        // real pre-coloured projectile art (Resources pack): player round vs HSS bolt,
        // no tint. Falls back to the tinted procedural bullet when the art isn't loaded.
        const artKey = sh.team === 0 ? BULLET_PLAYER_KEY : BULLET_ENEMY_KEY;
        if (this.textures.exists(artKey)) {
          s = this.add.image(sh.x, sh.y, artKey).setDepth(9).setRotation(Math.atan2(sh.ty - sh.y, sh.tx - sh.x));
        } else {
          s = this.add.image(sh.x, sh.y, BULLET_KEY).setDepth(9).setTint(sh.team === 0 ? COLORS.bullet : COLORS.enemy);
        }
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
        // real animated loot art (Resources pack) with a neon halo behind; falls back to
        // the tinted glow blob if the texture is missing (procedural / load failure)
        const artKey = pu.kind === PICKUP_CORE ? PICKUP_CORE_KEY : PICKUP_COIN_KEY;
        if (this.textures.exists(artKey)) {
          const halo = this.add.image(pu.x, pu.y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(col).setDepth(6.9).setScale(0.42).setAlpha(0.5);
          s = this.add.sprite(pu.x, pu.y, artKey, 0).setDepth(7).setScale(1.6);
          s.setData("halo", halo);
          s.setData("frames", this.textures.get(artKey).frameTotal - 1); // frameTotal includes __BASE
        } else {
          s = this.add.image(pu.x, pu.y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(col).setDepth(7);
        }
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
      const frames = s.getData("frames") as number | undefined;
      if (frames && frames > 0 && (s as Phaser.GameObjects.Sprite).setFrame) {
        (s as Phaser.GameObjects.Sprite).setFrame(Math.floor(this.time.now / 90 + id) % frames);
        s.setScale(1.5 + 0.12 * Math.sin(this.time.now * 0.006 + id));
        const halo = s.getData("halo") as Phaser.GameObjects.Image | undefined;
        halo?.setPosition(vx, vy).setAlpha(0.4 + 0.12 * Math.sin(this.time.now * 0.006 + id));
      } else {
        s.setScale(0.5 + 0.08 * Math.sin(this.time.now * 0.006 + id));
      }
      s.setPosition(vx, vy);
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
        (s.getData("halo") as Phaser.GameObjects.Image | undefined)?.destroy();
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

    // HP bar + kit cooldowns + death overlay (rects laid out with the status panel)
    this.hpBar.clear();
    if (this.net.connected && this.hpBarRect.w > 0) {
      const { x, y, w, h } = this.hpBarRect;
      const hpN = Phaser.Math.Clamp(this.net.hp / Math.max(1, this.net.maxHp || PLAYER_HP), 0, 1);
      drawPremiumBar(this.hpBar, x, y, w, h, hpN, hpN > 0.3 ? COLORS.hp : COLORS.hpLow);
      // dash (SPACE) + signature (Q) + secondary (E) readiness + HEAT (R) — the fourth
      // quarter fills with damage dealt and burns bright once the ultimate is armed
      const k = this.kitPipsRect;
      if (k.w > 0) {
        const now = performance.now();
        const gap = uiGap("xs");
        const quarterW = (k.w - gap * 3) / 4;
        const dashN = 1 - Phaser.Math.Clamp((this.net.dashCdUntil - now) / PLAYER.dashCooldownMs, 0, 1);
        const abN = 1 - Phaser.Math.Clamp((this.net.abilityCdUntil - now) / this.abilityCooldownMs(), 0, 1);
        const ab2N = 1 - Phaser.Math.Clamp((this.net.ability2CdUntil - now) / this.ability2CooldownMs(), 0, 1);
        const heatN = Phaser.Math.Clamp(this.net.heat / HEAT.max, 0, 1);
        const ultReady = this.net.heat >= this.ultThresholdNow();
        drawPremiumBar(this.hpBar, k.x, k.y, quarterW, k.h, dashN, dashN >= 1 ? 0x00e5ff : 0x3a5a70);
        drawPremiumBar(this.hpBar, k.x + quarterW + gap, k.y, quarterW, k.h, abN, abN >= 1 ? this.color : 0x4a4460);
        drawPremiumBar(this.hpBar, k.x + (quarterW + gap) * 2, k.y, quarterW, k.h, ab2N, ab2N >= 1 ? 0xf7ff3c : 0x5a5440);
        drawPremiumBar(this.hpBar, k.x + (quarterW + gap) * 3, k.y, quarterW, k.h, heatN, ultReady ? 0xff8a1f : 0x6a4020);
        // same readiness, mirrored onto the on-screen ability buttons (phones)
        this.mobilePad?.setReadiness({ dash: dashN, q: abN, e: ab2N, r: heatN, ultArmed: ultReady });
      }
    }
    this.updateDeathSequence();

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
    const waitMs = Date.now() - this.connectStartedAt;
    // Free-tier Durable Object wake — brief status, never a permanent wall.
    if (!st.connected && (this.connectionState === "connecting" || this.connectionState === "reconnecting") && waitMs > 1500 && waitMs < 18000) {
      this.hud.setColor("#f7ff3c");
      this.hud.setText(
        this.isTutorial
          ? [
              this.connectionState === "reconnecting" ? "⏳ RECONNECTING…" : "⏳ LINKING…",
              "Server waking — usually under 10s. Walk freely.",
              "SKIP TO CITY (top-right) works anytime.",
            ]
          : [
              this.connectionState === "reconnecting" ? "⏳ RECONNECTING…" : "⏳ LINKING…",
              "Server waking — usually under 10s. Walk freely.",
              "R retry · ESC menu",
            ],
      );
      return;
    }
    if (!st.connected && (this.connectionState === "offline" || waitMs > 18000)) {
      this.hud.setColor("#ff6a6a");
      if (this.isTutorial) {
        this.hud.setText([
          "⚠  STILL OFFLINE — preview only",
          "SKIP TO CITY (top-right) · or R to retry link",
          "ESC menu",
        ]);
      } else {
        this.hud.setText([
          "⚠  LINK LOST",
          "R retry · ESC menu · check connection",
        ]);
      }
    } else if (this.isTutorial) {
      this.hud.setColor(this.net.godMode ? "#f7ff3c" : "#39ff88");
      const lesson = this.net.tutorialStep + 1;
      const dots = ".".repeat(this.connectDots);
      // the lesson card carries the teaching — this panel stays a two-line status strip
      this.hud.setText([
        st.connected
          ? `◢ DRILL YARD  ${this.callsign}  ·  ${this.net.tutorialMode === "full" ? "FULL" : "QUICK"}  ·  lesson ${Math.min(lesson, this.net.tutorialTotal)}/${this.net.tutorialTotal}${this.net.godMode ? "  ·  GOD" : ""}`
          : this.connectionState === "reconnecting"
            ? `reconnecting to drill yard${dots}`
            : `connecting to drill yard${dots}`,
        this.net.tutorialPortalOpen
          ? "portal open — deploy east when ready (one way)"
          : `₵ ${this.net.credits}  ◈ ${this.net.cores}  (drill only — not saved)`,
      ]);
    } else {
      this.hud.setColor(this.net.godMode ? "#f7ff3c" : "#39ff88");
      const dots = ".".repeat(this.connectDots);
      const zoneTitle = this.isCityHub
        ? "METRO CITY (shared)"
        : this.interior
          ? INTERIOR_TITLES[this.zone] ?? "▣ INTERIOR"
          : this.isSubway
            ? "▼ THE UNDERLINE"
            : `${this.zone.toUpperCase()} ${DISTRICTS[this.districtIndex].name}`;
      const soloWander = !!this.drillLocal && !st.connected && (this.isCityHub || (this.interior && !this.isSubway));
      // two compact lines — cell/war detail lives in the L leaderboard, HP is the bar
      this.hud.setText([
        st.connected
          ? `◢ ${this.callsign}  ·  ${zoneTitle}  ·  ${st.players} online${ctrl !== "—" ? `  ·  CTRL ${ctrl}` : ""}${this.net.godMode ? "  ·  ◆ GOD" : ""}`
          : soloWander
            ? `◢ ${this.isCityHub ? "CITY PREVIEW" : "SOLO PREVIEW"}  ${this.callsign}${this.connectionState === "reconnecting" ? `  ·  ${t("online.reconnecting")}${dots}` : `  ·  ${t("online.connecting")}${dots}`}`
            : this.connectionState === "reconnecting"
              ? `${t("online.reconnecting")}${dots}`
              : `${t("online.connecting")}${dots}`,
        soloWander && !st.connected
          ? "walk the city while the server links · R retry · ESC menu"
          : `LV ${this.net.level}  XP ${xpIntoLevel(this.net.xp)}/100   ₵ ${this.net.credits}  ◈ ${this.net.cores}${this.net.godMode ? "  ·  invuln" : ""}`,
      ].filter(Boolean));
    }

    this.chatPanel.setArea(this.chatAreaLabel());
    this.chatPanel.setMessages(this.net.chatLog);
    // Roster: real players first; when solo, show ambient "runners" so the city feels lived-in.
    const others = this.net.roster.filter((r) => r.id !== this.net.id);
    // Friends-lite: remember runners we share a zone with.
    for (const r of others.slice(0, 12)) noteRecentPlayer(r.id, r.id);
    const simple = getSettings().uiDensity === "new";
    if (simple && others.length === 0) {
      // Simple HUD: one whisper line, not a column.
      this.rosterText
        .setVisible(true)
        .setText(`◢ ${Math.max(1, this.phantomOnline)} runners in metro (ambient)`);
    } else if (others.length === 0) {
      const phantoms = ["VEX", "RIN", "HALO", "DOC", "NYX", "KITE", "ZERO", "ASH"].slice(0, Math.min(5, this.phantomOnline));
      this.rosterText.setVisible(true).setText([
        `◢ ONLINE (~${this.phantomOnline + 1})`,
        ...phantoms.map((n) => `· ${n}  L${3 + (n.charCodeAt(0) % 12)}`),
        "  (ambient runners)",
      ]);
    } else {
      this.rosterText.setVisible(true).setText([
        `◢ ONLINE (${this.net.roster.length})`,
        ...others
          .slice(0, 5)
          .map((r) => `${this.net.party.includes(r.id) ? "◆" : "·"} ${r.id} L${r.level}`),
        ...(others.length > 5 ? [`  +${others.length - 5} more`] : []),
      ]);
    }

    // First-session coach + core loop strip
    this.refreshCoachStrip();

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
      const hasActive = !!(camp.active && camp.currentStage);
      // Single compact line — strip "MISSION //" chrome that ballooned the top rail.
      const showQuest = this.isCityHub ? !camp.done : hasActive;
      let line = "";
      if (showQuest) {
        if (hasActive && camp.currentStage) {
          const n = camp.currentStage.on.count ?? 1;
          const prog =
            camp.currentStage.on.type === "talk" ? "" : ` ${camp.progress}/${n}`;
          line = `◈ ${camp.currentStage.objective}${prog}`;
        } else {
          line = campaignHud(camp); // short "talk to THE FIXER — …" when no active stage
          if (line.length > 48) line = line.slice(0, 46) + "…";
        }
      }
      this.questText.setText(line).setVisible(!!line);
      // Waypoint always tracks the next physical beat (FIXER / gate / estates).
      this.questTarget = this.resolveQuestTarget(camp);
    }
    if (!this.isTutorial) {
      const active = this.net.contracts.find((c) => !c.done);
      // Hide "contracts complete" noise — only surface in-progress work.
      if (active) {
        this.dailyText
          .setVisible(true)
          .setText(`D ${active.name} ${Math.min(active.progress, active.count)}/${active.count}`);
      } else {
        this.dailyText.setVisible(false);
      }
      const bty = this.net.bounty;
      if (bty) {
        this.bountyText
          .setVisible(true)
          .setText(`B ${bty.name} ${Math.min(bty.progress, bty.count)}/${bty.count}`);
      } else this.bountyText.setVisible(false);
    }
    const story = this.net.story;
    const hold = this.storyHoldUntil > 0 ? this.storyHoldUntil : story ? story.at + 6_000 : 0;
    if (story && performance.now() < hold) {
      if (!this.storyPanel.visible) {
        const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
        this.storyPanel.setText(
          `◢ ${clip(story.quest, 28)} · ${clip(story.title, 36)}\n${clip(story.text.replace(/\n+/g, " "), 140)}\n▸ ${clip(story.objective, 42)} · tap`,
        );
      }
      this.storyPanel.setVisible(true).setDepth(1900);
    } else {
      this.storyPanel.setVisible(false);
      this.storyHoldUntil = 0;
    }
    this.layoutHudChrome();
  }

  /** Frame the status stack + objective tracker around their live text so nothing
   *  overlaps as rows change — the single place HUD chrome geometry is decided. */
  private layoutHudChrome() {
    const pad = panelPadInner();
    // top-left status panel: text block + the HP bar row beneath it
    const px = uiDim(12);
    const py = uiDim(12);
    const barH = uiDim(10);
    const barGap = uiGap("sm");
    this.hud.setPosition(px + pad, py + pad);
    const showBar = this.net.connected;
    const pipH = uiDim(8);
    const innerW = Math.max(this.hud.width, uiDim(200));
    const innerH = this.hud.height + (showBar ? barGap + barH + uiGap("xs") + pipH : 0);
    const panelW = innerW + pad * 2;
    const panelH = innerH + pad * 2;
    this.hudPanelG.clear();
    // Painted Higgsfield neon glass when available (both desktop + mobile sizes).
    this.hudPanelImg = ensureHudPanelImage(this, this.hudPanelImg, px, py, panelW, panelH, 999, 0x8dffc8);
    if (!this.hudPanelImg) {
      drawHudPanel(this.hudPanelG, px, py, panelW, panelH, 0x1fbf6a);
    } else {
      // Soft accent wash under the art so bars still read on dark glass.
      this.hudPanelG.fillStyle(0x05040e, 0.35).fillRect(px + uiDim(8), py + uiDim(8), panelW - uiDim(16), panelH - uiDim(16));
    }
    this.hpBarRect = showBar
      ? { x: px + pad, y: py + pad + this.hud.height + barGap, w: innerW, h: barH }
      : { x: 0, y: 0, w: 0, h: 0 };
    this.kitPipsRect = showBar
      ? { x: px + pad, y: py + pad + this.hud.height + barGap + barH + uiGap("xs"), w: innerW, h: pipH }
      : { x: 0, y: 0, w: 0, h: 0 };
    // the tutorial lesson card is wide + centered — keep it clear of the status panel
    // (and, on phones, of the tracker + coach band up top)
    if (this.isTutorial && this.tutorialPanel) {
      this.tutorialPanel.setY(Math.max(uiDim(this.mobileUx() ? 150 : 76), py + innerH + pad * 2 + uiGap("sm")));
    }

    // Top intel rail: mission + the most urgent secondary objective share a compact
    // two-row panel beside status. Keeping the live event INSIDE this rail prevents
    // mobile's old status -> quests -> boss -> event chain from drifting mid-screen.
    const mobile = this.mobileUx();
    const screenPad = uiDim(12);
    const statusRight = px + panelW;
    const statusBottom = py + panelH;
    const laneGap = uiGap(mobile ? "sm" : "md");
    // Pathological narrow/status-heavy layouts still get a safe full-width row below
    // status; normal phone landscape (including 844x390) always takes the true top lane.
    const rail = topIntelRailGeometry({
      viewW: this.scale.width,
      top: py,
      screenPad,
      statusRight,
      statusBottom,
      laneGap,
      fallbackGap: uiGap("sm"),
      minTopWidth: uiDim(220),
      maxWidth: uiDim(mobile ? 320 : 300),
    });
    const trackerTop = rail.y;
    const left = rail.x;
    // Slim objective chip — never a wide multi-line billboard.
    const railPad = uiDim(6);
    const capW = Math.max(uiDim(120), Math.min(rail.w, uiDim(mobile ? 260 : 280)));
    const railMaxInner = Math.max(uiDim(100), capW - railPad * 2);
    this.intelRailX = left;
    this.intelRailW = capW;
    this.intelEventMaxW = railMaxInner;

    const questVisible = this.questText.visible && this.questText.text.length > 0;
    const eventVisible = this.eventBanner.visible && this.eventBanner.text.length > 0;
    const dailyVisible = this.dailyText.visible && this.dailyText.text.length > 0;
    const bountyVisible = this.bountyText.visible && this.bountyText.text.length > 0;
    const secondaryVisible = eventVisible || dailyVisible || bountyVisible;

    // Events own the urgency row while live. Daily/bounty state stays visible=true at
    // alpha 0, so it returns instantly when an event ends instead of waiting on data.
    this.dailyText.setAlpha(eventVisible ? 0 : 1);
    this.bountyText.setAlpha(eventVisible ? 0 : 1);
    this.eventBanner.setAlpha(1);
    for (const row of [this.questText, this.dailyText, this.bountyText, this.eventBanner]) {
      row.setOrigin(0, 0).setWordWrapWidth(0);
    }
    this.trackerG.clear();
    if (!questVisible && !secondaryVisible) {
      if (this.trackerPanelImg) this.trackerPanelImg.setVisible(false);
      this.trackerBottomY = statusBottom;
      this.positionCoach();
      return;
    }

    let y = trackerTop + railPad;
    let contentW = 0;
    if (questVisible) {
      fitTextToWidth(this.questText, railMaxInner, { minScale: mobile ? 0.74 : 0.8 });
      this.questText.setPosition(left + railPad, y);
      y += this.questText.displayHeight;
      contentW = Math.max(contentW, this.questText.displayWidth);
    }

    let secondaryY = y;
    let secondaryH = 0;
    if (secondaryVisible) {
      if (questVisible) y += uiGap("xs");
      secondaryY = y;
      if (eventVisible) {
        fitTextToWidth(this.eventBanner, railMaxInner, { minScale: mobile ? 0.72 : 0.78 });
        this.eventBanner.setPosition(left + railPad, y);
        secondaryH = this.eventBanner.displayHeight;
        contentW = Math.max(contentW, this.eventBanner.displayWidth);
      } else {
        // Daily + bounty ride one row, packed tight so the panel hugs them rather than
        // reserving two fixed half-width slots.
        const chipGap = dailyVisible && bountyVisible ? uiGap("sm") : 0;
        const chipCap = (railMaxInner - chipGap) / (dailyVisible && bountyVisible ? 2 : 1);
        let cx = left + railPad;
        if (dailyVisible) {
          fitTextToWidth(this.dailyText, chipCap, { minScale: mobile ? 0.72 : 0.78 });
          this.dailyText.setPosition(cx, y);
          secondaryH = Math.max(secondaryH, this.dailyText.displayHeight);
          cx += this.dailyText.displayWidth + chipGap;
        }
        if (bountyVisible) {
          fitTextToWidth(this.bountyText, chipCap, { minScale: mobile ? 0.72 : 0.78 });
          this.bountyText.setPosition(cx, y);
          secondaryH = Math.max(secondaryH, this.bountyText.displayHeight);
          cx += this.bountyText.displayWidth;
        }
        contentW = Math.max(contentW, cx - (left + railPad));
      }
      y += secondaryH;
    }
    const frameW = Math.max(uiDim(140), Math.min(capW, contentW + railPad * 2));
    this.intelRailW = frameW;
    const frameH = y + railPad - trackerTop;

    this.trackerPanelImg = ensureHudPanelImage(
      this,
      this.trackerPanelImg,
      left,
      trackerTop,
      frameW,
      frameH,
      999,
      0xd0a0ff,
    );
    this.trackerG.setDepth(999.1);
    if (!this.trackerPanelImg) {
      drawHudPanel(this.trackerG, left, trackerTop, frameW, frameH, 0xb06bff);
    } else {
      this.trackerG.fillStyle(0x0a0618, 0.3).fillRect(left + uiDim(6), trackerTop + uiDim(6), frameW - uiDim(12), frameH - uiDim(12));
    }
    if (questVisible && secondaryVisible) {
      this.trackerG
        .lineStyle(1, 0xb06bff, 0.24)
        .lineBetween(left + railPad, secondaryY - uiGap("xs") / 2, left + frameW - railPad, secondaryY - uiGap("xs") / 2);
    }
    if (eventVisible) {
      const parsed = Number.parseInt((this.net.worldEvent?.hex ?? "#f7ff3c").replace("#", ""), 16);
      this.trackerG
        .fillStyle(Number.isFinite(parsed) ? parsed : 0xf7ff3c, 0.82)
        .fillRect(left + uiDim(5), secondaryY, uiDim(2), Math.max(uiDim(10), secondaryH));
    }
    this.trackerBottomY = Math.max(statusBottom, trackerTop + frameH);
    this.positionCoach();
    this.layoutFooterHint();
  }

  /** The coach line rides the top-centre chain — below the objective tracker AND any
   *  boss/event banners. Its old fixed y=44 slot collided with the boss locator on
   *  desktop ("GO TO THE FIXER" printed through "THE GUTTER KING — ALIVE"). */
  private positionCoach() {
    if (!this.coachText) return;
    const mobile = this.mobileUx();
    this.coachText.setWordWrapWidth(
      Math.min(this.scale.width - uiDim(48), mobile && this.intelRailW > 0 ? this.intelRailW : uiDim(640)),
    );
    let y = this.trackerBottomY + uiGap("sm");
    if (this.bossBanner?.visible) y = Math.max(y, this.bossBanner.y + this.bossBanner.height + uiGap("xs"));
    if (this.eventBanner?.visible) y = Math.max(y, this.eventBanner.y + this.eventBanner.height + uiGap("xs"));
    this.coachText.setY(y);
    // Mobile: ride under the same right-of-status rail, never back over the action.
    if (mobile && this.intelRailW > 0) this.coachText.setX(this.intelRailX + this.intelRailW / 2);
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
    this.bossBanner
      .setVisible(true)
      .setY(this.trackerBottomY + uiGap("xs"))
      .setWordWrapWidth(Math.min(this.scale.width - uiDim(32), uiDim(720)));
    // first time you close with a living boss this visit: the title card plays
    if (b.alive && this.bossIntroShown !== b.name && this.me && Math.hypot(b.x - this.me.x, b.y - this.me.y) < 640) {
      this.bossIntroShown = b.name;
      this.playBossIntro(b.name);
    }
    if (!b.alive) {
      this.bossBanner.setText(`◆ ${b.name} — reforms in ${b.respawnSec}s`).setColor("#9aa3b2");
      this.bossArrow.setVisible(false);
      this.positionCoach();
      return;
    }
    const dx = b.x - this.me.x;
    const dy = b.y - this.me.y;
    this.bossBanner.setText(`◆ ${b.name} — ALIVE · ${Math.round(Math.hypot(dx, dy) / 8)}m`).setColor("#39ff88");
    this.positionCoach();
    const zoom = this.cameras.main.zoom || 1;
    if (Math.abs(dx) < VIEW_W / 2 / zoom - uiDim(36) && Math.abs(dy) < VIEW_H / 2 / zoom - uiDim(36)) {
      this.bossArrow.setVisible(false); // on-screen — the boss + its overlay are already visible
      return;
    }
    const ang = Math.atan2(dy, dx);
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const t = Math.min((cx - uiDim(56)) / (Math.abs(Math.cos(ang)) || 1e-6), (cy - uiDim(72)) / (Math.abs(Math.sin(ang)) || 1e-6));
    this.bossArrow.setVisible(true).setPosition(cx + Math.cos(ang) * t, cy + Math.sin(ang) * t).setRotation(ang);
  }

  /** Where the current campaign beat physically happens, for the waypoint. Talk beats
   *  live at THE FIXER's stall; combat/territory/dive beats start at the deploy gate.
   *  Hub-only: districts are the objective themselves once you're inside one. */
  private resolveQuestTarget(camp: Campaign): { x: number; y: number; label: string } | null {
    if (!this.isCityHub) return null;
    const toWorld = (tile: [number, number]) => ({ x: tile[0] * TILE + TILE / 2, y: tile[1] * TILE + TILE / 2 });
    const fixerTarget = () => {
      const fixer = CITY_HUB_NPCS.find((n) => n.svc === "contracts");
      return fixer ? { ...toWorld(fixer.tile), label: "THE FIXER" } : null;
    };
    const stage = camp.currentStage;
    // No active quest: the next beat is accepting one from THE FIXER — the moment a
    // brand-new player is most lost, so point straight at him (unless the arc is done).
    if (!stage) return camp.done ? null : fixerTarget();
    if (stage.on.type === "talk") return fixerTarget();
    if (stage.on.type === "visit") {
      // HOMESTEAD — the objective is walking THE ESTATES street, so aim at its hub door
      const est = CITY_HUB_DOORS.find((d) => d.dest === "estates");
      if (est) return { ...toWorld(est.tile), label: "THE ESTATES" };
    }
    const gate = CITY_HUB_DOORS.find((d) => d.dest === "d0");
    if (!gate) return null;
    return { ...toWorld(gate.tile), label: "DEPLOY GATE" };
  }

  private refreshCoachStrip() {
    if (!this.coachText) return;
    if (!getSettings().firstSessionCoach) {
      this.coachText.setVisible(false);
      return;
    }
    const coach = firstSessionLine();
    const fs = getFirstSession();
    const hour2 = secondHourLine(fs.step === "done" || fs.kills >= 3);
    const simple = getSettings().uiDensity === "new";
    // New players: coach only. Then second-hour beats. Full mode: core loop.
    const line = coach ?? hour2 ?? (simple ? null : coreLoopLine());
    if (!line) {
      this.coachText.setVisible(false);
      return;
    }
    this.coachText
      .setVisible(true)
      .setText(line)
      .setColor(coach ? "#39ff88" : hour2 ? "#f7ff3c" : "#6b7184");
  }

  private pushKillFeed(line: string) {
    this.killFeed.unshift(line);
    if (this.killFeed.length > 4) this.killFeed.length = 4;
    this.killFeedText?.setText(this.killFeed.join("\n"));
    this.time.delayedCall(4200, () => {
      this.killFeed = this.killFeed.filter((l) => l !== line);
      this.killFeedText?.setText(this.killFeed.join("\n"));
    });
  }

  /** Draw HP bars over live hostiles — always on for combat readability (dim when full). */
  private drawEnemyHpBars() {
    const g = this.enemyHpG;
    if (!g) return;
    g.clear();
    for (const [, e] of this.net.enemies) {
      if (e.hp <= 0) continue;
      const max = Math.max(1, e.hpMax ?? (e.boss ? 800 : e.hvt ? 220 : 80));
      const w = e.boss ? 48 : e.hvt ? 36 : 28;
      const h = e.boss ? 5 : 3;
      const x = e.x - w / 2;
      const y = e.y - (e.boss ? 42 : 28);
      const pct = Math.max(0, Math.min(1, e.hp / max));
      const full = pct >= 0.98;
      g.fillStyle(0x05060f, full ? 0.45 : 0.85).fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle(0x2a1520, full ? 0.55 : 1).fillRect(x, y, w, h);
      g.fillStyle(e.boss ? 0xf7ff3c : e.hvt ? 0xffd166 : pct < 0.3 ? 0xff3b6b : 0x39ff88, full ? 0.55 : 1).fillRect(x, y, w * pct, h);
    }
  }

  /** First time HEAT crosses the ult gate — coach R once. */
  private maybeHeatCoach() {
    if (this.isTutorial || !this.net.connected) return;
    const fs = getFirstSession();
    if (fs.heatCoached || fs.dismissed) return;
    if (this.net.heat < this.ultThresholdNow()) return;
    noteHeatCoached();
    this.showBubble(this.me.x, this.me.y, "HEAT ARMED — press R for your class ultimate");
    this.pushKillFeed("HEAT · R ultimate ready");
  }

  /** Detect territory flips for the second-hour capture coach. */
  private trackNodeCaptures() {
    if (!this.net.connected || this.isTutorial) return;
    const myFac = this.net.faction;
    for (const [id, n] of this.net.nodes) {
      const prev = this.prevNodeOwners.get(id);
      // NEUTRAL is -1; any non-neutral flip to our faction counts as a capture.
      if (prev !== undefined && prev !== n.owner && n.owner === myFac && myFac >= 0) {
        noteSecondCapture();
        this.pushKillFeed("NODE SECURED");
      }
      this.prevNodeOwners.set(id, n.owner);
    }
    for (const id of [...this.prevNodeOwners.keys()]) {
      if (!this.net.nodes.has(id)) this.prevNodeOwners.delete(id);
    }
  }

  /** Campaign objective locator — bobbing marker when the target is on-screen, a
   *  violet screen-edge arrow when it isn't (same math as the boss locator). */
  private updateQuestWaypoint() {
    const t = this.questTarget;
    if (!t || !this.me) {
      this.questArrow.setVisible(false);
      this.questMarker.setVisible(false);
      return;
    }
    const dx = t.x - this.me.x;
    const dy = t.y - this.me.y;
    const zoom = this.cameras.main.zoom || 1;
    const near = Math.hypot(dx, dy) < 90; // at the target — the interact prompt takes over
    const onScreen = Math.abs(dx) < VIEW_W / 2 / zoom - uiDim(36) && Math.abs(dy) < VIEW_H / 2 / zoom - uiDim(36);
    // FIXER / deploy get warmer colors so the first objective reads as "go here".
    const isFixer = t.label === "THE FIXER";
    const col = isFixer ? "#39ff88" : t.label === "DEPLOY GATE" ? "#f7ff3c" : "#b06bff";
    if (onScreen) {
      this.questArrow.setVisible(false);
      this.questMarker
        .setVisible(!near)
        .setColor(col)
        .setText(isFixer ? `◆ TALK — ${t.label}\n▼` : `◆ ${t.label}\n▼`)
        .setPosition(t.x, t.y - 36 + Math.sin(this.time.now / 240) * 4);
      return;
    }
    this.questMarker.setVisible(false);
    const ang = Math.atan2(dy, dx);
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const d = Math.min((cx - uiDim(56)) / (Math.abs(Math.cos(ang)) || 1e-6), (cy - uiDim(104)) / (Math.abs(Math.sin(ang)) || 1e-6));
    this.questArrow.setVisible(true).setColor(col).setPosition(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d).setRotation(ang);
  }

  /** The class signature's cooldown (client mirror of the server's timers, for the pips). */
  private abilityCooldownMs(): number {
    switch (this.net.classId) {
      case "k-guerilla":
        return 6000;
      case "wintermute":
        return 8000;
      case "swarm":
        return 6500;
      default:
        return 7000; // metrophage — INFECTION POD
    }
  }

  /** The secondary's cooldown (client mirror of the server timers, for the pips). */
  private ability2CooldownMs(): number {
    switch (this.net.classId) {
      case "k-guerilla":
        return 10000; // AIRSTRIKE
      case "wintermute":
        return 12000; // DEPLOY DRONES
      case "swarm":
        return 12000; // MINION PACK
      default:
        return 9000; // metrophage — CONTAGION BLOOM
    }
  }

  /** E (away from interactables) — the class secondary. */
  private tryAbility2() {
    const aim = this.combatAim();
    if (!this.net.ability2(aim, this.ability2CooldownMs())) return;
    this.synth?.cast();
    const cls = this.net.classId;
    if (cls === "k-guerilla") {
      // airstrike called — the telegraph ring renders from the server hazard
      juiceShake(this, 70, 0.002);
      this.particles?.spark(this.me.x + Math.cos(aim) * 230, this.me.y + Math.sin(aim) * 230, 0xff2bd6, 1.2);
    } else if (cls === "wintermute" || cls === "swarm") {
      // escort deployed — a ring of glows spins up around the runner
      const tint = cls === "swarm" ? 0xb06bff : 0x9fe8ff;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const orb = this.add
          .image(this.me.x + Math.cos(a) * 30, this.me.y + Math.sin(a) * 30, GLOW_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(tint)
          .setScale(0.3)
          .setAlpha(0.8)
          .setDepth(11);
        this.tweens.add({ targets: orb, scale: 0.55, alpha: 0, duration: 900, delay: i * 120, onComplete: () => orb.destroy() });
      }
      juiceNeonPulse(this, 0.18, 240);
    } else {
      // contagion bloom — the nova blossoms from the runner
      this.particles?.burst(this.me.x, this.me.y, 1.5);
      this.particles?.spark(this.me.x, this.me.y, 0x39ff88, 1.6);
      juiceFlash(this, 160, 57, 255, 136);
      juiceShake(this, 110, 0.004);
    }
  }

  /** The ultimate's arm threshold, kit-mod aware (ULT HEAT chips lower it; floor 25). */
  private ultThresholdNow(): number {
    let disc = 0;
    for (const it of this.net.equipped) disc += effectiveMods(it).ultHeatDiscount ?? 0;
    return Math.max(25, HEAT.ultThreshold - Math.round(disc));
  }

  /** R — the class ultimate. HEAT is the gate and the cost; the server holds the meter,
   *  so a cold press is silently ignored (we mirror the threshold to skip dead FX). */
  private tryUlt() {
    const aim = this.combatAim();
    const gate = this.ultThresholdNow();
    if (!this.net.ult(aim, gate)) {
      if (this.net.heat < gate) this.showBubble(this.me.x, this.me.y, "HEAT LOW — keep fighting");
      return;
    }
    this.synth?.cast();
    this.synth?.meltdown();
    juiceShake(this, 200, 0.006);
    juiceZoomPunch(this, 0.045, 180);
    const cls = this.net.classId;
    if (cls === "k-guerilla") {
      // BARRAGE — three strike markers walk out along the aim line
      for (let i = 0; i < 3; i++) {
        const d = 140 + i * 120;
        this.particles?.spark(this.me.x + Math.cos(aim) * d, this.me.y + Math.sin(aim) * d, 0xff2bd6, 1.5);
      }
      juiceFlash(this, 200, 255, 43, 214);
    } else if (cls === "wintermute") {
      // SYSTEM CRASH — a frost shockwave rolls out of the runner
      const ring = this.add
        .image(this.me.x, this.me.y, GLOW_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0x9fe8ff)
        .setScale(0.4)
        .setAlpha(0.9)
        .setDepth(11);
      this.tweens.add({ targets: ring, scale: 7, alpha: 0, duration: 650, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
      juiceFlash(this, 220, 159, 232, 255);
    } else if (cls === "swarm") {
      // LOCUST STORM — the double ring renders via shot snapshots; sell the release
      juiceNeonPulse(this, 0.35, 420);
      this.particles?.burst(this.me.x, this.me.y, 1.8);
      juiceFlash(this, 180, 176, 107, 255);
    } else {
      // METROPHAGE PANDEMIC — the whole block sickens
      this.particles?.burst(this.me.x, this.me.y, 2.2);
      this.particles?.spark(this.me.x, this.me.y, 0x39ff88, 2.0);
      juiceFlash(this, 260, 57, 255, 136);
    }
  }

  /** Transient light pool — a burst of light cast onto the pavement (muzzle flashes,
   *  kills, detonations). The floor answering the action is half of fake-3D lighting. */
  private groundGlow(x: number, y: number, tint: number, scale = 0.6, ms = 260) {
    if (effectiveLowFx()) return;
    const g = this.add
      .image(x, y + 8, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint)
      .setScale(scale, scale * 0.45)
      .setAlpha(0.3)
      .setDepth(6.5);
    this.tweens.add({ targets: g, alpha: 0, scaleX: scale * 1.5, duration: ms, ease: "Quad.out", onComplete: () => g.destroy() });
  }

  /** Soft contact shadow — grounds an entity on the pavement. One tinted radial glow,
   *  squashed to an ellipse; costs nothing and sells "standing IN the world" on every
   *  tier (this is the cheapest studio-look win in the whole stack). */
  private groundShadow(x: number, y: number, w = 0.52): Phaser.GameObjects.Image {
    return this.add
      .image(x, y + 12, GLOW_KEY)
      .setTint(0x000006)
      .setAlpha(0.4)
      .setScale(w, w * 0.42)
      .setDepth(7.5);
  }

  /** Orbiting escort companions — two glows circle any player whose snapshot says
   *  drones/minions are live (self included). Created/destroyed on the flag edge;
   *  positions follow the owner every frame so they never lag a fast runner. */
  private updateEscort(id: string, x: number, y: number, active: boolean) {
    let orbs = this.escortOrbs.get(id);
    if (!active) {
      if (orbs) {
        for (const o of orbs) {
          this.tweens.add({ targets: o, alpha: 0, scale: 0.1, duration: 260, onComplete: () => o.destroy() });
        }
        this.escortOrbs.delete(id);
      }
      return;
    }
    if (!orbs) {
      orbs = [];
      for (let i = 0; i < 2; i++) {
        orbs.push(
          this.add
            .image(x, y, GLOW_KEY)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(i === 0 ? 0x9fe8ff : 0xb06bff)
            .setScale(0.22)
            .setAlpha(0.85)
            .setDepth(10),
        );
      }
      this.escortOrbs.set(id, orbs);
    }
    const t = this.time.now / 1000;
    for (let i = 0; i < orbs.length; i++) {
      const a = t * 2.6 + (i / orbs.length) * Math.PI * 2;
      orbs[i].setPosition(x + Math.cos(a) * 26, y + Math.sin(a) * 26 - 6);
      orbs[i].setScale(0.2 + Math.sin(t * 5 + i) * 0.035);
    }
  }

  /** Aim from the pointer (world space) — desktop mouse; mobile uses combatAim(). */
  private pointerAim(): number {
    const ptr = this.input.activePointer;
    const origin = this.playerPos();
    const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
    return Math.atan2(wp.y - origin.y, wp.x - origin.x);
  }

  /**
   * Combat aim for dash / Q / E / R. On touch the active pointer sits on the UI pad,
   * so we aim from pad/facing/nearest enemy — never at the finger-on-button.
   */
  private combatAim(): number {
    if (this.mobileUx()) {
      // Prefer nearest live enemy in a generous ring (mirrors hold-ATK).
      let best: { x: number; y: number } | null = null;
      let bestD = this.attackRange * 1.5;
      const origin = this.playerPos();
      for (const e of this.net.enemies.values()) {
        if (e.hp <= 0) continue;
        const d = Math.hypot(e.x - origin.x, e.y - origin.y);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best) return Math.atan2(best.y - origin.y, best.x - origin.x);
      const fx = this.meDir.x;
      const fy = this.meDir.y;
      if (Math.abs(fx) + Math.abs(fy) > 1e-3) return Math.atan2(fy, fx);
      return 0; // default face right
    }
    return this.pointerAim();
  }

  /** SPACE/SHIFT — dash along current move intent (or combat aim when standing still). */
  private tryDash() {
    let dx = 0;
    let dy = 0;
    if (this.keys.A?.isDown || this.keys.LEFT?.isDown) dx -= 1;
    if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) dx += 1;
    if (this.keys.W?.isDown || this.keys.UP?.isDown) dy -= 1;
    if (this.keys.S?.isDown || this.keys.DOWN?.isDown) dy += 1;
    // Mobile stick / last facing when no keyboard keys.
    if (dx === 0 && dy === 0 && this.mobileUx()) {
      if (Math.abs(this.meDir.x) + Math.abs(this.meDir.y) > 1e-3) {
        dx = this.meDir.x;
        dy = this.meDir.y;
      }
    }
    if (dx === 0 && dy === 0) {
      const aim = this.combatAim();
      dx = Math.cos(aim);
      dy = Math.sin(aim);
    }
    if (!this.net.dash(dx, dy)) return;
    // FX — afterimages peel off along the burst
    this.synth?.dash();
    juiceZoomPunch(this, 0.02, 90);
    const frame = this.me.frame.name;
    for (let i = 0; i < 3; i++) {
      const ghost = this.add
        .sprite(this.me.x, this.me.y, this.me.texture.key, frame)
        .setAlpha(0.35 - i * 0.09)
        .setTint(this.color)
        .setDepth(9);
      this.tweens.add({ targets: ghost, alpha: 0, duration: 220 + i * 70, onComplete: () => ghost.destroy() });
    }
  }

  /** Q — the class signature. The server resolves the effect; we sell the moment. */
  private tryAbility() {
    const aim = this.combatAim();
    if (!this.net.ability(aim, this.abilityCooldownMs())) return;
    this.synth?.cast();
    juiceShake(this, 90, 0.003);
    const cls = this.net.classId;
    if (cls === "k-guerilla") {
      // strike trail — ghosts peel off along the blink line
      const frame = this.me.frame.name;
      for (let i = 0; i < 4; i++) {
        const ghost = this.add
          .sprite(this.me.x + Math.cos(aim) * i * 22, this.me.y + Math.sin(aim) * i * 22, this.me.texture.key, frame)
          .setAlpha(0.4 - i * 0.08)
          .setTint(0xff2bd6)
          .setDepth(9);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 200 + i * 60, onComplete: () => ghost.destroy() });
      }
      juiceZoomPunch(this, 0.03, 110);
    } else if (cls === "wintermute") {
      // hack cone — a fan of frost sparks
      for (let i = -2; i <= 2; i++) {
        const a = aim + i * 0.24;
        this.particles?.spark(this.me.x + Math.cos(a) * 120, this.me.y + Math.sin(a) * 120, 0x9fe8ff, 1.1);
      }
      juiceFlash(this, 140, 159, 232, 255);
    } else if (cls === "swarm") {
      juiceNeonPulse(this, 0.22, 260); // the tide itself renders via the shot snapshots
    } else {
      // infection pod — contagion bursts at the lobbed point
      const px = this.me.x + Math.cos(aim) * 170;
      const py = this.me.y + Math.sin(aim) * 170;
      this.particles?.burst(px, py, 1.15);
      this.particles?.spark(px, py, 0x39ff88, 1.4);
      juiceFlash(this, 150, 57, 255, 136);
    }
  }

  /** Dress the ICE VAULT so it reads as a frozen-mind archive, not bare corridors:
   *  shimmering frozen-mind obelisks in the chambers, drifting ice dust, and a slow
   *  pulsing glow over the fragment core. Pure decoration — nothing collides. */
  private dressDive(grid: TileGrid) {
    const spots: [number, number][] = [
      [13, 7], [17, 10], [15, 8], // north chamber
      [13, 23], [17, 20], [15, 22], // south chamber
      [22, 14], [23, 16], // antechamber
      [27, 11], [31, 12], [27, 19], [31, 18], [35, 13], [35, 17], // core chamber walls of the frozen
    ];
    for (const [tx, ty] of spots) {
      if (isWall(grid[ty]?.[tx])) continue;
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      const mind = this.add.image(x, y, NODE_KEY).setTint(0x9fe8ff).setAlpha(0.42).setDepth(5);
      this.add.image(x, y + 6, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fe8ff).setScale(0.5).setAlpha(0.1).setDepth(4);
      this.tweens.add({
        targets: mind,
        alpha: { from: 0.3, to: 0.55 },
        duration: 1600 + ((tx * 7 + ty * 13) % 900),
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
      });
    }
    // the core — a deep pulsing glow marks the vault's heart from across the chamber
    const cx = DIVE_CORE_TILE[0] * TILE + TILE / 2;
    const cy = DIVE_CORE_TILE[1] * TILE + TILE / 2;
    const core = this.add.image(cx, cy, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fe8ff).setScale(2.6).setAlpha(0.3).setDepth(4);
    this.tweens.add({ targets: core, scale: 3.2, alpha: 0.45, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    // ice dust — slow drifting motes; skipped under low-FX
    if (!getSettings().lowFx) {
      for (let i = 0; i < 14; i++) {
        const px = 80 + ((i * 173) % (this.worldW - 160));
        const py = 60 + ((i * 251) % (this.worldH - 120));
        const mote = this.add
          .image(px, py, GLOW_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xcdf2ff)
          .setScale(0.06 + (i % 3) * 0.03)
          .setAlpha(0.22)
          .setDepth(12);
        this.tweens.add({
          targets: mote,
          y: py + 46 + (i % 5) * 10,
          x: px + ((i % 2 ? 1 : -1) * (14 + (i % 4) * 6)),
          alpha: { from: 0.22, to: 0.05 },
          duration: 5200 + (i % 7) * 800,
          repeat: -1,
          yoyo: true,
          ease: "Sine.InOut",
        });
      }
    }
  }

  /** Boss title card — letterbox bars sweep in, splash portrait + name land with a
   *  sting, holds a beat, and sweeps out. Once per boss per zone visit. */
  private playBossIntro(name: string) {
    noteSecondBossTouch();
    const script = raidScriptFor(name);
    const phase0 = script.phases[0]?.name ?? "ASSAULT";
    const w = this.scale.width;
    const h = this.scale.height;
    const barH = uiDim(52);
    const D = 1600;
    const top = this.add.rectangle(0, -barH, w, barH, 0x02030a, 0.92).setOrigin(0).setScrollFactor(0).setDepth(D);
    const bot = this.add.rectangle(0, h, w, barH, 0x02030a, 0.92).setOrigin(0).setScrollFactor(0).setDepth(D);
    const bossPort = portraitForBoss(name);
    let portrait: Phaser.GameObjects.Image | undefined;
    if (bossPort && this.textures.exists(bossPort.key)) {
      portrait = this.add
        .image(w / 2, h / 2 - uiDim(36), bossPort.key, bossPort.frame)
        .setDisplaySize(uiDim(148), uiDim(148))
        .setScrollFactor(0)
        .setDepth(D + 1)
        .setAlpha(0)
        .setScale(1.2);
    }
    const title = this.add
      .text(w / 2, h / 2 + (portrait ? uiDim(56) : 0), name, displayFont(34, { color: "#ff3b6b", fontStyle: "bold" }))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(D + 1)
      .setAlpha(0)
      .setScale(1.35);
    title.setShadow(0, 0, "#2a0510", 10, true, true);
    const tag = this.add
      .text(
        w / 2,
        h / 2 + uiDim(portrait ? 86 : 30),
        `— HSS COMMANDER · PHASE ${phase0} —`,
        hudFont(11, { color: "#9aa3b2" }),
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(D + 1)
      .setAlpha(0);
    this.synth?.kill();
    // Seed Audio boss stinger when present; otherwise Synth.kill() covers the hit.
    if (this.cache.audio.exists(STINGER_BOSS_KEY)) {
      try {
        this.sound.play(STINGER_BOSS_KEY, { volume: getSettings().sfx * getSettings().master * 0.85 });
      } catch {
        /* audio unlock / decode edge */
      }
    }
    juiceShake(this, 240, 0.006);
    juiceNeonPulse(this, 0.3, 500);
    this.tweens.add({ targets: top, y: 0, duration: 260, ease: "Quad.Out" });
    this.tweens.add({ targets: bot, y: h - barH, duration: 260, ease: "Quad.Out" });
    if (portrait) {
      this.tweens.add({ targets: portrait, alpha: 1, scale: 1, duration: 360, delay: 80, ease: "Back.Out" });
    }
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 320, delay: 140, ease: "Back.Out" });
    this.tweens.add({ targets: tag, alpha: 1, duration: 260, delay: 320 });
    this.time.delayedCall(2300, () => {
      const fade = portrait ? [title, tag, portrait] : [title, tag];
      this.tweens.add({ targets: fade, alpha: 0, duration: 260 });
      this.tweens.add({ targets: top, y: -barH, duration: 300, ease: "Quad.In" });
      this.tweens.add({
        targets: bot,
        y: h,
        duration: 300,
        ease: "Quad.In",
        onComplete: () => {
          top.destroy();
          bot.destroy();
          title.destroy();
          tag.destroy();
          portrait?.destroy();
        },
      });
    });
  }

  /** Undo death/hit combat poses so the runner is fully solid again. */
  private restoreLocalBody() {
    if (!this.me) return;
    resetCombatPose(this.me, 1);
  }

  /** Death is a MOMENT: hit-stop + blood-dark wash + SIGNAL LOST / REPRINT + reboot countdown,
   *  then a white rebirth flash when the server respawns you. */
  private updateDeathSequence() {
    const dead = this.net.dead;
    if (dead && !this.wasDead) {
      this.deathStartedAt = performance.now();
      this.synth?.kill();
      juiceHitStop(this, 120);
      juiceShake(this, 260, 0.008);
      this.tweens.add({ targets: this.deathOverlay, alpha: 0.62, duration: 420, ease: "Quad.Out" });
      this.deadText.setVisible(true).setText("✖ SIGNAL LOST").setScale(1.6).setAlpha(0);
      this.tweens.add({ targets: this.deadText, scale: 1, alpha: 1, duration: 340, ease: "Back.Out" });
      this.time.delayedCall(900, () => {
        if (this.net.dead) this.deadText.setText("◈ REPRINT QUEUED");
      });
      this.deathSub.setVisible(true);
    } else if (!dead && this.wasDead) {
      this.tweens.add({ targets: this.deathOverlay, alpha: 0, duration: 300 });
      this.deadText.setVisible(false);
      this.deathSub.setVisible(false);
      // Death pose leaves alpha 0.25 + crushed scale + tilted angle — reset or you
      // respawn as a permanent ghost (the "body disappeared" bug).
      this.restoreLocalBody();
      juiceFlash(this, 260, 220, 240, 255);
      juiceZoomPunch(this, 0.04, 180);
      this.pops?.popHeal(this.me.x, this.me.y - 28, "REPRINT COMPLETE");
    }
    if (dead) {
      const left = Math.max(0, RESPAWN_MS - (performance.now() - this.deathStartedAt));
      this.deathSub.setText(
        left > 0
          ? `reprinting body in ${(left / 1000).toFixed(1)}s — billed to your ledger`
          : "printing…",
      );
    }
    this.wasDead = dead;
  }

  /** Live world-event row inside the fixed top intel rail. The timer precedes the
   *  tagline so narrow-phone truncation never hides the urgent part. */
  private updateEventBanner() {
    const ev = this.net.worldEvent;
    const wasVisible = this.eventBanner.visible;
    if (!ev) {
      this.eventBanner.setVisible(false);
      if (wasVisible) this.layoutHudChrome();
      this.updateEventAmbience(null);
      return;
    }
    const secs = Math.max(0, Math.ceil((ev.untilAt - performance.now()) / 1000));
    const line =
      ev.phase === "telegraph"
        ? `EVENT // ⚠ ${ev.name} · IN ${secs}s — ${ev.tagline}`
        : `EVENT // ◆ ${ev.name} · LIVE ${secs}s — ${ev.tagline}`;
    this.eventBanner
      .setVisible(true)
      .setColor(ev.hex)
      .setWordWrapWidth(0);
    setFittedText(
      this.eventBanner,
      line,
      this.intelEventMaxW || Math.min(this.scale.width - uiDim(48), uiDim(640)),
      { minScale: this.mobileUx() ? 0.72 : 0.78 },
    );
    if (!wasVisible) this.layoutHudChrome();
    else this.positionCoach();
    this.updateEventAmbience(ev.phase === "active" ? ev.id : null);
  }

  /** Each active event owns the district's light: BLACKOUT drops it to near-dark,
   *  the storm strobes violet (suppressed by reduce-flashing), contagion breathes
   *  green, the purge burns a red alert. Eases in/out so transitions feel physical. */
  private updateEventAmbience(active: string | null) {
    let target = 0;
    let color = 0x000000;
    const t = this.time.now;
    switch (active) {
      case "blackout":
        color = 0x01030a;
        target = 0.52;
        break;
      case "neon_storm": {
        color = 0x8a5cff;
        const flicker = getSettings().reduceFlashing ? 0 : Math.random() < 0.04 ? 0.22 : 0;
        target = 0.1 + Math.sin(t / 350) * 0.02 + flicker;
        break;
      }
      case "contagion_outbreak":
        color = 0x39ff88;
        target = 0.09 + Math.sin(t / 600) * 0.03;
        break;
      case "purge_wave":
        color = 0xff3b6b;
        target = 0.1 + Math.sin(t / 260) * 0.025;
        break;
    }
    this.eventOverlayAlpha += (target - this.eventOverlayAlpha) * 0.08;
    if (this.eventOverlayAlpha < 0.005 && target === 0) this.eventOverlayAlpha = 0;
    this.eventOverlay.setFillStyle(color, 1).setAlpha(this.eventOverlayAlpha);
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
      .circle(cx, cy, uiDim(94), 0x0b0716, 0.62)
      .setStrokeStyle(uiDim(2), 0x29e7ff, 0.5)
      .setScrollFactor(0)
      .setDepth(1500);
    this.wheelObjs.push(bg);
    this.wheelObjs.push(
      this.add
        .text(cx, cy, "EMOTE\nV / ESC", hudFont(9, { color: "#6b7184", align: "center" }))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1501),
    );
    EMOTES.forEach((em, i) => {
      const a = (i / EMOTES.length) * Math.PI * 2 - Math.PI / 2;
      const t = this.add
        .text(cx + Math.cos(a) * uiDim(72), cy + Math.sin(a) * uiDim(72), em.text, hudFont(12, {
          color: em.ping ? "#f7ff3c" : "#9af0ff",
          fontStyle: "bold",
          align: "center",
        }))
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
      // a spawn-side beacon that points at the arena, so a runner who just deployed can
      // find PvP from where they land (the arena is tucked in the district's SE corner)
      const def = DISTRICTS[this.districtIndex];
      if (def) {
        const spx = def.spawnTile[0] * DISTRICT_SCALE * TILE + TILE / 2;
        const spy = def.spawnTile[1] * DISTRICT_SCALE * TILE + TILE / 2;
        const acx = z.x + z.w / 2;
        const acy = z.y + z.h / 2;
        const ang = Math.atan2(acy - spy, acx - spx);
        const bx = spx + Math.cos(ang) * 46;
        const by = spy + Math.sin(ang) * 46 - 24;
        const bg = this.add.graphics().setDepth(6);
        bg.fillStyle(0x14060a, 0.95).fillRect(bx - 52, by - 9, 104, 15);
        bg.lineStyle(1.5, 0xff3b6b, 0.9).strokeRect(bx - 52, by - 9, 104, 15);
        this.add
          .text(bx, by - 2, "⚔ THE CRUCIBLE ▶", displayFont(9, { color: "#ff6b7a", fontStyle: "bold" }))
          .setOrigin(0.5)
          .setDepth(7)
          .setRotation(0);
      }
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
        .text(px, py - 16, "▣", bodyFont(11, { color: "#39ff88", fontStyle: "bold" }))
        .setOrigin(0.5)
        .setDepth(8)
        .setAlpha(0.7);
      const z = this.add.zone(px - 16, py - 16, 32, 32).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(9);
      z.on("pointerdown", () => {
        if (!this.usingRsControls()) return;
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
    const fire = fireControlLabel(); // "HOLD CLICK or F"
    if (this.isTutorial) {
      return prefersMobileUx() || this.mobileUx()
        ? "touch LEFT to move · hold ATK to fire · Q/E/R/⇢ · ◆ use · SKIP TO CITY"
        : `WASD move · ${fire} attack · SPACE dash · SKIP TO CITY (top-right)`;
    }
    if (prefersMobileUx() || (this.usingRsControls() && this.mobileUx())) {
      return "touch LEFT to move · TAP to walk/attack · hold ATK · Q/E/R/⇢ · ◆ use";
    }
    if (this.usingRsControls()) {
      return `CLICK walk · ${fire} attack · RIGHT-CLICK menu · SPACE dash · Q/E/R · M map`;
    }
    return `WASD move · ${fire} attack · SPACE dash · Q/E abilities · R ultimate · E use`;
  }

  /** Solid bottom bar behind control keys — full opacity, high contrast, no fade. */
  private layoutFooterHint() {
    if (!this.footerHint || this.mobileUx()) {
      this.footerHintBg?.setVisible(false);
      this.footerHint?.setVisible(false);
      return;
    }
    this.footerHint.setVisible(true).setAlpha(1);
    const padX = uiDim(16);
    const padY = uiDim(6);
    const tw = Math.max(this.footerHint.width, uiDim(200));
    const th = Math.max(this.footerHint.height, uiDim(14));
    const cx = this.scale.width / 2;
    const bottom = onlineHudStack(this.scale.height).footerHintY - uiDim(2);
    this.footerHint.setPosition(cx, bottom);
    const bx = cx - tw / 2 - padX;
    const by = bottom - th - padY;
    const bw = tw + padX * 2;
    const bh = th + padY * 2;
    const g = this.footerHintBg;
    if (!g) return;
    g.clear().setVisible(true).setAlpha(1);
    g.fillStyle(0x04020a, 0.92);
    g.fillRoundedRect(bx, by, bw, bh, uiDim(4));
    g.lineStyle(uiDim(1), 0x00e5ff, 0.55);
    g.strokeRoundedRect(bx, by, bw, bh, uiDim(4));
  }

  private blockRsInput() {
    return (
      this.chatOpen ||
      this.emoteWheelOpen ||
      this.homeEditing ||
      !!this.options?.isOpen ||
      this.inv?.open ||
      this.shop?.open ||
      this.forge?.open ||
      this.market?.open ||
      this.board?.open ||
      this.contracts?.open ||
      this.fixerBrief?.isOpen ||
      this.npcTalk?.isOpen ||
      this.rsSkillsPanel?.open ||
      this.mapPanel?.open ||
      this.questLog?.open ||
      this.cosmetics?.open ||
      this.guildPanel?.open ||
      this.stashPanel?.open ||
      !!this.registryOpen
    );
  }

  private refreshQuestLog(toggle = false) {
    const state = {
      campaignId: this.net.campaignQuest,
      campaignStage: this.net.campaignStage,
      campaignProgress: this.net.campaignProgress,
      campaignObjective: this.net.campaignObjective,
      campaignCompleted: this.net.campaignCompleted ?? [],
      contracts: this.net.contracts,
      bounty: this.net.bounty,
      fragments: this.net.fragments,
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
    // Solo walk while socket connects: hub, interiors, and the drill yard.
    const soloWalk =
      !!this.drillLocal &&
      !this.net.connected &&
      (this.isTutorial || this.isCityHub || (this.interior && !this.isSubway));
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
    const remote = this.pickRemoteAt(wp.x, wp.y);
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
      this.contextMenu.show(pointer.x, pointer.y, "HSS Unit", actions);
      return;
    }
    if (remote) {
      // Prefer player id for server resolve (wallet ids); short label for the menu.
      const id = remote.id;
      const label =
        id.startsWith("w:") && id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
      actions.push({
        label: `Walk-to ${label}`,
        onPick: () => {
          this.attackTargetId = null;
          this.pendingInteract = null;
          this.clickMove.setDestination(remote.x, remote.y, this.zoneGrid, pos.x, pos.y);
        },
      });
      if (this.net.connected) {
        noteRecentPlayer(id, label);
        actions.push({
          label: `Whisper ${label}`,
          color: "#9fe8ff",
          onPick: () => {
            this.openChat(`/w ${id} `);
            this.rsGameMessage?.show(`Whisper ${label} — type message + Enter`, { ttlMs: 2800, color: "#9fe8ff" });
          },
        });
        actions.push({
          label: `Invite to party`,
          color: "#39ff88",
          onPick: () => {
            this.net.sendParty("invite", id);
            this.rsGameMessage?.show(`Invited ${label}`, { ttlMs: 2200, color: "#39ff88" });
          },
        });
        actions.push({
          label: `Trade with ${label}`,
          color: "#f7ff3c",
          onPick: () => {
            this.net.tradeRequest(id);
            this.rsGameMessage?.show(`Trade request → ${label}`, { ttlMs: 2200, color: "#f7ff3c" });
          },
        });
        actions.push({
          label: `Pin contact`,
          color: "#d4c45a",
          onPick: () => {
            pinRecentPlayer(id, true);
            noteRecentPlayer(id, label);
            this.rsGameMessage?.show(`Pinned ${label} (contacts in chat /c)`, { ttlMs: 2400, color: "#d4c45a" });
          },
        });
        actions.push({
          label: `Mute ${label}`,
          color: "#ff7a9a",
          onPick: () => {
            this.net.sendMute(id);
            this.rsGameMessage?.show(`Muted ${label}`, { ttlMs: 2000, color: "#ff7a9a" });
          },
        });
      }
      actions.push({ label: "Walk here", onPick: walk });
      this.contextMenu.show(pointer.x, pointer.y, label, actions);
      return;
    }
    if (npc) {
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
      this.contextMenu.show(pointer.x, pointer.y, npc.name ?? "NPC", actions);
      return;
    }
    actions.push({ label: "Walk here", onPick: walk });
    actions.push({
      label: "Examine ground",
      color: "#c8c8c8",
      onPick: () => this.rsExamine("Wet neon asphalt. The city breathes beneath your boots."),
    });
    this.contextMenu.show(pointer.x, pointer.y, "Metro City", actions);
  }

  /** Nearest remote player under the cursor (for social context menu). */
  private pickRemoteAt(wx: number, wy: number): { id: string; x: number; y: number } | null {
    let best: { id: string; x: number; y: number } | null = null;
    let bestD = 40 * 40;
    for (const [id, r] of this.net.remotes) {
      if (r.dead) continue;
      const d = (r.x - wx) ** 2 + (r.y - wy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { id, x: r.x, y: r.y };
      }
    }
    return best;
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
      // lighter signature wash — 0.24 flattened whole districts to one hue and buried
      // the per-building colour-coding + tile variation; a subtle tint still reads
      // Weaker district wash so tile variety + building colour read through the accent.
      this.neon.tintAmt = this.isCityHub ? 0.08 : this.interior ? 0.06 : 0.07;
    }
  }
}
