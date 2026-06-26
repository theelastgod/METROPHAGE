import Phaser from "phaser";
import { installUiCamera } from "../render/cameras";
import { shadeWalls } from "../render/wallShade";
import { applyTileVariants } from "../render/tileVariants";
import { paintWetStreets } from "../render/wetStreets";
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
import { COLORS, TILE, TILESET_PX, VIEW_W, VIEW_H, uiFont } from "../config";
import { TILESET_KEY, PLAYER_KEY, COP_KEY, BULLET_KEY, GLOW_KEY, NODE_KEY, PROP_STREETLIGHT_KEY, PROP_VENDING_KEY, PROP_AC_KEY } from "../assets/manifest";
import { driveChar } from "../assets/anim";
import {
  PLAYER_HP,
  SING_MAX,
  PICKUP_CORE,
  xpIntoLevel,
  FACTION_COLORS,
  FACTION_NAMES,
  NEUTRAL,
  factionForColor,
  PVP_ZONES,
  inPvpZone,
} from "../net/sim";
import {
  buildGrid,
  buildSafehouse,
  buildSubway,
  buildTutorial,
  TUTORIAL_PORTAL,
  TUTORIAL_NODE_TILE,
  isWall,
} from "../world/district";
import { TUTORIAL_ZONE, tutorialStepAt, type TutorialMode } from "../net/tutorial";
import { getSettings } from "../systems/Settings";
import { DISTRICTS } from "../game/districts";
import { ENEMY_BARKS } from "../game/enemies";
import { WORLD_W, WORLD_H } from "../net/sim";
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

/** Service operatives that populate the SAFEHOUSE hub — walk up + press E to open each
 *  online system. Static fixtures (deterministic positions, identical for everyone), so
 *  they're pure client-side: the safehouse reads as a populated town, not an empty room. */
const SAFEHOUSE_NPCS: { svc: string; name: string; tag: string; color: number; tile: [number, number] }[] = [
  { svc: "forge", name: "ARMORER", tag: "FORGE", color: 0xff2bd6, tile: [7, 6] },
  { svc: "board", name: "ARCHIVIST", tag: "DOSSIER", color: 0x00e5ff, tile: [20, 5] },
  { svc: "vendor", name: "QUARTERMASTER", tag: "VENDOR", color: 0xf7ff3c, tile: [33, 6] },
  { svc: "contracts", name: "THE FIXER", tag: "CONTRACTS", color: 0x39ff88, tile: [33, 15] },
  { svc: "cosmetics", name: "THE TAILOR", tag: "WARDROBE", color: 0xff79c6, tile: [33, 24] },
  { svc: "market", name: "THE FENCE", tag: "MARKET", color: 0xff7a3c, tile: [20, 25] },
  { svc: "guild", name: "ORGANIZER", tag: "CELL", color: 0x6b9bff, tile: [7, 24] },
];

/** Ambient regulars who linger in the safehouse hub for life (the quest-giver citizens
 *  RIN/DOC/VEX/SABLE now live in their own building interiors below). */
const SAFEHOUSE_CITIZENS: { id: string; tile: [number, number] }[] = [
  { id: "marek", tile: [16, 13] },
  { id: "amb_synth", tile: [24, 17] },
];

/** Titles shown atop each interior zone. */
const INTERIOR_TITLES: Record<string, string> = {
  safe: "▣ SAFEHOUSE",
  clinic: "✚ THE CLINIC",
  bar: "▦ THE FERAL CAT",
  den: "◈ THE DEN",
  shop: "▣ MARKET STALL",
};

/** Doors in the hub that open into building interiors (each its own no-combat zone). */
const HUB_DOORS: { dest: string; label: string; tile: [number, number]; color: number }[] = [
  { dest: "clinic", label: "CLINIC", tile: [13, 6], color: 0x39ff88 },
  { dest: "shop", label: "MARKET", tile: [27, 6], color: 0x00e5ff },
  { dest: "bar", label: "THE FERAL CAT", tile: [13, 24], color: 0xff79c6 },
  { dest: "den", label: "THE DEN", tile: [27, 24], color: 0xff2bd6 },
  { dest: "subway", label: "▼ THE UNDERLINE", tile: [10, 15], color: 0xff3b6b }, // combat dungeon
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
  private meltdownFx!: Phaser.GameObjects.Rectangle;
  private meltdownText!: Phaser.GameObjects.Text;
  private atmosphere?: Atmosphere; // rich ambient layer, shared with the SP city
  private connectStartedAt = 0; // when this connection attempt began (for the offline timeout)
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
  private lastSeason = -1;
  private chatLogText!: Phaser.GameObjects.Text;
  private chatInput!: Phaser.GameObjects.Text;
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
  private districtIndex = 0;
  private interior = false; // true in a no-combat interior (hub / building)
  private isSubway = false; // THE UNDERLINE — an indoor COMBAT dungeon zone
  private fromZone = "d0"; // district to return to when leaving the safehouse
  private meDir = new Phaser.Math.Vector2(0, 1); // last facing for the local avatar
  private nextEnemyBarkAt = 0; // throttle for online HSS barks
  private emoteWheelOpen = false;
  private wheelObjs: Phaser.GameObjects.GameObject[] = [];
  private lastEmoteShownAt = 0; // newest relayed emote already rendered
  private wasInPvp = false; // last-frame PvP-arena state (for enter/exit warnings)
  private pvpWarn!: Phaser.GameObjects.Text;
  // zone interactables — service operatives (open a system), authored citizens (flavour),
  // and doors (travel into a building interior)
  private npcs: { kind: "service" | "talk" | "door"; svc?: string; dest?: string; npcId?: string; name: string; lines?: string[]; lineIdx?: number; x: number; y: number }[] = [];
  private nearNpc: { kind: "service" | "talk" | "door"; svc?: string; dest?: string; npcId?: string; name: string; lines?: string[]; lineIdx?: number; x: number; y: number } | null = null;
  private interactPrompt?: Phaser.GameObjects.Text;
  private speechBubble?: Phaser.GameObjects.Text;
  private pvpTag!: Phaser.GameObjects.Text;
  private isTutorial = false;
  private tutorialPanel!: Phaser.GameObjects.Text;
  private tutorialSkipBtn!: Phaser.GameObjects.Text;
  private tutorialPortalGlow!: Phaser.GameObjects.Image;

  private nearPortal = false;

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
    const named = !!INTERIOR_TITLES[rawZone] || rawZone === "subway" || rawZone === TUTORIAL_ZONE;
    this.zone = named ? rawZone : "d" + this.parseZone(data?.zone);
    this.isTutorial = this.zone === TUTORIAL_ZONE;
    this.interior = !!INTERIOR_TITLES[this.zone]; // no-combat interior (NOT the subway / tutorial)
    this.isSubway = this.zone === "subway";
    this.fromZone = data?.from ?? "d0"; // where 'H' returns to from inside an interior
    this.districtIndex = this.interior ? 0 : this.parseZone(data?.zone);
    // scene.start reuses the instance (field initializers don't re-run) — reset per-zone
    // interactables so NPCs/doors don't accumulate across travel between zones.
    this.npcs = [];
    this.nearNpc = null;
    const def = DISTRICTS[this.districtIndex];

    // Score the zone: district zones (d0–d3) get their matching district bed; the
    // subway dungeon its transit bed; the safehouse hub + building interiors the
    // social/online bed. (Re-asserted on every travel since scene.start re-runs create.)
    MusicDirector.for(this)?.play(
      this.isTutorial ? "online" : this.isSubway ? "subway" : this.interior ? "online" : MusicDirector.districtEnv(def.id),
      this,
    );

    this.cameras.main.setBackgroundColor(COLORS.bgVoid);

    // Real world — same grid + tileset the server simulates against (or the safehouse room).
    const grid = this.isTutorial
      ? buildTutorial()
      : this.isSubway
        ? buildSubway()
        : this.interior
          ? buildSafehouse()
          : buildGrid(def);
    const map = this.make.tilemap({ data: grid, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILESET_PX, TILESET_PX)!;
    const layer = map.createLayer(0, tileset, 0, 0)!;
    applyTileVariants(layer); // scatter real-art tile variants (render-only; collision is server-side)
    // Building-silhouette pass (also shades the interior walls). The atmospheric weather is
    // outdoors-only — the safehouse is a calm, indoor social hub.
    const zoneAccent = this.isTutorial ? 0x29e7ff : def.accent;
    shadeWalls(this, grid, zoneAccent);
    if (!this.interior && !this.isSubway) {
      this.atmosphere = new Atmosphere(this, {
        weather: def.weather,
        accent: zoneAccent,
        worldW: WORLD_W,
        worldH: WORLD_H,
      });
      for (let i = 0; i < def.layout.buildings.length; i += 2) {
        const b = def.layout.buildings[i];
        const cx = ((b.x1 + b.x2) / 2) * TILE + TILE / 2;
        const cy = ((b.y1 + b.y2) / 2) * TILE + TILE / 2;
        this.atmosphere.addHologram(cx, cy, zoneAccent);
      }
      // CyberPunk street props — non-colliding client decals on walkable tiles set against
      // a building, deterministically scattered (sparse) so the streets read as lived-in.
      const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
      const adjWall = (x: number, y: number) =>
        isWall(grid[y]?.[x - 1]) || isWall(grid[y]?.[x + 1]) || isWall(grid[y - 1]?.[x]) || isWall(grid[y + 1]?.[x]);
      let placed = 0;
      for (let ty = 1; ty < grid.length - 1 && placed < 16; ty++) {
        for (let tx = 1; tx < grid[ty].length - 1; tx++) {
          if (isWall(grid[ty][tx]) || !adjWall(tx, ty)) continue;
          const h = hash(tx, ty);
          if (h % 6 !== 0) continue; // sparse
          const px = tx * TILE + TILE / 2;
          const py = ty * TILE + TILE / 2;
          const pick = h % 3;
          const key = pick === 0 ? PROP_STREETLIGHT_KEY : pick === 1 ? PROP_VENDING_KEY : PROP_AC_KEY;
          const tall = key === PROP_STREETLIGHT_KEY;
          this.add.image(px, py + TILE / 2, key).setOrigin(0.5, tall ? 1 : 0.85).setDepth(4);
          placed++;
        }
      }
      // Rain-slicked street lighting + lit rooftop accents — the SAME shared renderers as the
      // offline city hub, tinted to the zone accent, so the unified world reads identically.
      paintWetStreets(this, grid, () => zoneAccent);
      paintRooftopLights(this, def.layout.buildings, (b) => b, () => zoneAccent);
    }
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    installUiCamera(this, 1);
    this.applyNeon();
    if (!this.interior && !this.isSubway && !this.isTutorial) this.drawPvpZones();
    if (this.isTutorial) this.buildTutorialZone();
    if (this.interior) {
      const isHub = this.zone === "safe";
      this.add
        .text(WORLD_W / 2, 4 * TILE, INTERIOR_TITLES[this.zone] ?? "▣ INTERIOR", { fontFamily: "Courier New, monospace", fontSize: "20px", color: "#39ff88", fontStyle: "bold" })
        .setOrigin(0.5)
        .setDepth(6);
      this.add
        .text(WORLD_W / 2, 4 * TILE + 26, isHub ? "the safehouse — no combat · operatives + doors · press E · H to deploy" : "no combat · talk: E · H to return to the safehouse", {
          fontFamily: "Courier New, monospace",
          fontSize: "11px",
          color: "#9aa3b2",
        })
        .setOrigin(0.5)
        .setDepth(6);
      if (isHub) {
        // Service operatives — each opens one online system (walk up + E, or click).
        for (const def of SAFEHOUSE_NPCS) {
          const px = def.tile[0] * TILE + TILE / 2;
          const py = def.tile[1] * TILE + TILE / 2;
          this.add.image(px, py + 8, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(def.color).setDepth(8).setScale(0.6).setAlpha(0.45);
          const spr = this.add.sprite(px, py, PLAYER_KEY, 0).setTint(def.color).setDepth(9).setInteractive({ useHandCursor: true });
          spr.on("pointerdown", () => this.openService(def.svc));
          this.add
            .text(px, py - 28, def.name, { fontFamily: "Courier New, monospace", fontSize: "10px", color: "#cfe8ff", fontStyle: "bold" })
            .setOrigin(0.5)
            .setDepth(9);
          this.add
            .text(px, py + 20, "▸ " + def.tag, { fontFamily: "Courier New, monospace", fontSize: "9px", color: "#" + (def.color & 0xffffff).toString(16).padStart(6, "0") })
            .setOrigin(0.5)
            .setDepth(9);
          this.npcs.push({ kind: "service", svc: def.svc, name: `${def.name} · ${def.tag}`, x: px, y: py });
        }
        for (const door of HUB_DOORS) this.makeDoor(door); // doors into the building interiors
        // ambient regulars for life
        for (const c of SAFEHOUSE_CITIZENS) {
          const cdef = npcDef(c.id);
          if (cdef) this.makeTalkNpc(cdef.name, cdef.look, cdef.lines, c.tile[0] * TILE + TILE / 2, c.tile[1] * TILE + TILE / 2, cdef.id);
        }
      } else {
        // a building interior — seat its authored occupants (keeper + residents)
        const residents = INTERIOR_PLAN[this.zone]?.[0] ?? [];
        const occupants = [keeperFor(this.zone), ...residents.map((id) => npcDef(id)).filter((d): d is NonNullable<typeof d> => !!d)];
        occupants.forEach((o, i) => {
          const [tx, ty] = INTERIOR_NPC_TILES[i % INTERIOR_NPC_TILES.length];
          this.makeTalkNpc(o.name, o.look, o.lines, tx * TILE + TILE / 2, ty * TILE + TILE / 2, o.id);
        });
      }
    } else if (this.isSubway) {
      // THE UNDERLINE — a combat dungeon: just a title; enemies + boss come from the server.
      this.add
        .text(WORLD_W / 2, 4 * TILE, "▼ THE UNDERLINE", { fontFamily: "Courier New, monospace", fontSize: "20px", color: "#ff3b6b", fontStyle: "bold" })
        .setOrigin(0.5)
        .setDepth(6);
      this.add
        .text(WORLD_W / 2, 4 * TILE + 26, "the subway dark — purge what nests here · H to surface", {
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
      const spots: [number, number][] = [
        [sx - 3, sy],
        [sx + 3, sy],
        [sx, sy + 3],
        [sx - 2, sy - 2],
        [sx + 2, sy + 2],
      ];
      let placed = 0;
      for (const [tx, ty] of spots) {
        if (placed >= 3) break;
        if (isWall(grid[ty]?.[tx])) continue;
        const adef = AMBIENT_NPCS[(this.districtIndex * 3 + placed) % AMBIENT_NPCS.length];
        this.makeTalkNpc(adef.name, adef.look, adef.lines, tx * TILE + TILE / 2, ty * TILE + TILE / 2, adef.id);
        placed++;
      }
    }
    // floating dialogue bubble + proximity prompt (used in any zone that has NPCs)
    this.speechBubble = this.add
      .text(0, 0, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#eafdff",
        align: "center",
        backgroundColor: "#0b0716e6",
        padding: { x: 10, y: 7 },
        wordWrap: { width: 240 },
      })
      .setOrigin(0.5, 1)
      .setDepth(12)
      .setVisible(false);
    this.interactPrompt = this.add
      .text(this.scale.width / 2, this.scale.height - 64, "", { fontFamily: "Courier New, monospace", fontSize: "14px", color: "#39ff88", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1200)
      .setVisible(false);

    // Local player — your full customization (build/head/visor/shoulders/decal/cloak/
    // accessories), baked and tinted by your signature colour, the same as singleplayer.
    bakeCustomPlayer(this, cust);
    this.me = this.add
      .sprite(WORLD_W / 2, WORLD_H / 2, PLAYER_CUSTOM_KEY, 0)
      .setTint(0xffffff) // baked in final colours — render untinted
      .setDepth(10)
      .setVisible(false);
    this.meLight = new PlayerLight(this, this.me.x, this.me.y); // soft carried light (same as the city hub)

    const url = SERVER_URL + (SERVER_URL.includes("?") ? "&" : "?") + "zone=" + this.zone;
    this.faction = factionForColor(this.color); // your cell, from your signature colour
    this.nodeG = this.add.graphics().setDepth(5); // node capture rings (world-space)
    this.hazardG = this.add.graphics().setDepth(8); // boss AoE telegraphs (under shots/players)
    // Send your look so every other player renders your customization (not a generic body).
    this.baseLook = customizationToLook(cust); // cosmetics merge onto this for the rendered avatar
    this.net = new NetClient(grid, this.callsign, url, this.faction, this.baseLook);
    const tutorialMode =
      data?.tutorialMode ?? (this.registry.get("tutorialMode") as TutorialMode | undefined) ?? getSettings().tutorialMode;
    if (this.isTutorial) this.registry.set("tutorialMode", tutorialMode);

    this.net.onWelcome = (x, y) => {
      this.me.setPosition(x, y).setVisible(true);
      this.cameras.main.startFollow(this.me, true, 0.18, 0.18);
      setOnlinePlayer(this.net.id);
      if (this.isTutorial) this.net.setTutorialMode(tutorialMode);
    };
    this.net.onRedirect = (zone) => {
      this.net.disconnect();
      this.scene.restart({ zone });
    };
    this.inv = new OnlineInventory(this);
    this.inv.onEquip = (id) => this.net.equip(id);
    this.inv.onUnequip = (slot) => this.net.unequip(slot);
    this.net.onInventory = () => {
      this.inv.setItems(this.net.inventory);
      this.inv.setEquipped(this.net.equipped);
      this.forge.setState(this.net.inventory, this.net.equipped, this.net.credits, this.net.cores);
      if (this.market?.open) this.market.setState(this.net.marketListings, this.net.inventory, this.net.id, this.net.credits);
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
    this.market.onBuy = (id) => this.net.marketBuy(id);
    this.market.onCancel = (id) => this.net.marketCancel(id);
    this.market.onList = (itemId, price) => this.net.marketList(itemId, price);
    this.market.onRefresh = () => this.net.marketBrowse();
    this.net.onMarket = () => {
      if (this.market.open) this.market.setState(this.net.marketListings, this.net.inventory, this.net.id, this.net.credits);
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
    this.mapPanel = new OnlineMap(this);
    this.mapPanel.onTravel = (zone) => this.fastTravel(zone);
    this.net.onDiscovered = () => {
      if (this.mapPanel.open) this.mapPanel.setState(this.net.discovered, this.zone);
    };
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

    this.hud = this.add
      .text(12, 12, "connecting…", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#39ff88",
        lineSpacing: 3,
      })
      .setScrollFactor(0)
      .setDepth(1000);
    this.add
      .text(
        this.scale.width / 2,
        this.scale.height - 12,
        this.isTutorial
          ? "WASD move · CLICK fire · I bag · J/G/B/K panels · ENTER chat · SKIP (top-right) · portal = one-way deploy"
          : `WASD · CLICK fire · I bag · G forge · B vendor · K market · J jobs · Y style · C cell · L board · M map · H safehouse · V emote · ENTER chat`,
        { fontFamily: "Courier New, monospace", fontSize: uiFont(11), color: "#6b7184" },
      )
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1000);

    // server-wide meltdown FX (everyone sees it together)
    this.meltdownFx = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xff2b3b, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1002);
    this.meltdownText = this.add
      .text(this.scale.width / 2, 74, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "20px",
        color: "#ff3b6b",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1003)
      .setVisible(false);

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

    // PvP arena warning (center) + a persistent tag while you're inside one
    this.pvpWarn = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 110, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "16px",
        color: "#ff3b6b",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1004)
      .setAlpha(0);
    this.pvpTag = this.add
      .text(12, this.scale.height - 80, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#ff5a6b",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);

    // chat log (bottom-left), input line, roster panel (top-right)
    this.chatLogText = this.add
      .text(12, this.scale.height - 70, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#cdd6e6",
        lineSpacing: 2,
      })
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(1000);
    this.chatInput = this.add
      .text(12, this.scale.height - 38, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#f7ff3c",
      })
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);
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
      if (e.key === " " && this.isTutorial) {
        const step = tutorialStepAt(this.net.tutorialStep, this.net.tutorialMode);
        if (step && ["faction", "campaign", "pvp", "singularity", "trade", "travel"].includes(step.kind)) {
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
        if (this.isTutorial && this.nearPortal && this.net.tutorialPortalOpen) {
          this.net.tutorialGraduate();
          return;
        }
        if (this.nearNpc) {
          if (this.nearNpc.kind === "service" && this.nearNpc.svc) this.openService(this.nearNpc.svc);
          else if (this.nearNpc.kind === "door" && this.nearNpc.dest) this.enterZone(this.nearNpc.dest);
          else this.talkNpc(this.nearNpc);
        }
        return;
      }
      if (e.key === "g" || e.key === "G") {
        this.forge.setState(this.net.inventory, this.net.equipped, this.net.credits, this.net.cores);
        this.forge.toggle();
        return;
      }
      if (this.forge.open && e.key === "Escape") {
        this.forge.close();
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
        this.market.toggle(this.net.marketListings, this.net.inventory, this.net.id, this.net.credits);
        if (this.market.open) this.reportTutorialPanel("market");
        return;
      }
      if (this.market.open && e.key === "Escape") {
        this.market.close();
        return;
      }
      if (e.key === "j" || e.key === "J") {
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
        this.mapPanel.toggle(this.net.discovered, this.zone);
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
        this.net.disconnect();
        this.scene.restart({ zone: dest, from });
        return;
      }
      if (e.key === "v" || e.key === "V") {
        this.openWheel();
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
            this.net.disconnect();
            this.scene.restart({ zone: z });
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

  private openChat() {
    this.chatOpen = true;
    this.chatBuffer = "";
    this.chatInput.setVisible(true);
    this.renderChatInput();
  }
  private closeChat() {
    this.chatOpen = false;
    this.chatInput.setVisible(false);
  }
  private renderChatInput() {
    this.chatInput.setText("> " + this.chatBuffer + "_");
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
      const it = this.net.inventory[slot - 1];
      if (it && price > 0) this.net.marketList(it.id, price);
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

  /** Brief "new era" banner when a meltdown resets the world into the next season. */
  private flashEra(season: number) {
    const t = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 40, `◢ NEW ERA — SEASON ${season} ◣`, {
        fontFamily: "Courier New, monospace",
        fontSize: "26px",
        color: "#39ff88",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1004);
    this.tweens.add({ targets: t, alpha: 0, scale: 1.4, duration: 2400, onComplete: () => t.destroy() });
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
        this.market.toggle(n.marketListings, n.inventory, n.id, n.credits);
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

  /** Drill yard — signage, skip control, lesson panel, and the one-way deploy portal. */
  private buildTutorialZone() {
    const mono = "Courier New, monospace";
    const label = (x: number, y: number, title: string, sub: string, color = "#9aa3b2") => {
      this.add
        .text(x, y, title, { fontFamily: mono, fontSize: "14px", color, fontStyle: "bold" })
        .setOrigin(0.5)
        .setDepth(6);
      this.add
        .text(x, y + 18, sub, { fontFamily: mono, fontSize: "9px", color: "#6b7184" })
        .setOrigin(0.5)
        .setDepth(6);
    };

    label(WORLD_W / 2, 3 * TILE, "◢ THE DRILL YARD ◣", "learn each system · no XP here · one-way portal east", "#39ff88");
    label(6 * TILE + TILE / 2, 11 * TILE, "SPAWN", "WASD / arrows");
    label(10 * TILE + TILE / 2, 11 * TILE, "COMBAT", "click to fire · drop the patrol");
    label(TUTORIAL_NODE_TILE[0] * TILE + TILE / 2, 11 * TILE, "TERRITORY", "stand on the node");
    label(TUTORIAL_PORTAL.x, 11 * TILE, "DEPLOY PORTAL", "one way · no return", "#29e7ff");

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
    this.add
      .text(px, py - 52, "▶ LIVE CITY", { fontFamily: mono, fontSize: "11px", color: "#29e7ff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(9);

    this.tutorialPanel = this.add
      .text(VIEW_W / 2, 72, "", {
        fontFamily: mono,
        fontSize: uiFont(12),
        color: "#eafdff",
        align: "center",
        backgroundColor: "#0b0716ee",
        padding: { x: 16, y: 12 },
        wordWrap: { width: 520 },
      })
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

  /** Build an authored, talkable citizen at a world position (baked from its PlayerLook).
   *  Pass the npc id so quest-givers can offer their bounty on interact. */
  private makeTalkNpc(name: string, look: PlayerLook, lines: string[], px: number, py: number, npcId?: string) {
    const key = lookKey(look);
    bakeRemoteLook(this, key, look);
    const npc = { kind: "talk" as const, npcId, name, lines, lineIdx: 0, x: px, y: py };
    const spr = this.add.sprite(px, py, key, 0).setDepth(9).setInteractive({ useHandCursor: true });
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

  /** Travel into another zone (door/interior) — reconnect to that zone's DO, like H-travel. */
  private enterZone(dest: string) {
    if (dest === TUTORIAL_ZONE) return;
    this.net.disconnect();
    this.scene.restart({ zone: dest, from: this.zone });
  }

  private fastTravel(zone: string) {
    if (zone === TUTORIAL_ZONE || zone === this.zone) return;
    this.net.disconnect();
    this.scene.restart({ zone });
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
    const mx = Math.sign(dn(k.D) + dn(k.RIGHT) - dn(k.A) - dn(k.LEFT));
    const my = Math.sign(dn(k.S) + dn(k.DOWN) - dn(k.W) - dn(k.UP));
    this.net.setIntent(mx, my);
    this.net.update(dt);
    this.processEmotes();
    // Drift fog + flicker the holo-signage; the shared singularity swells the haze.
    this.atmosphere?.update(this.time.now, dt, Phaser.Math.Clamp(this.net.singularity / SING_MAX, 0, 1));
    this.updateBossLocator();
    if (this.shop.open) this.shop.setCredits(this.net.credits);
    if (this.forge.open) this.forge.setWallet(this.net.credits, this.net.cores);

    if (this.net.connected) {
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

    // FIRE — send aim intent while the mouse is held; the SERVER validates rate
    // and resolves the hit. We only render.
    const ptr = this.input.activePointer;
    if (this.net.connected && !this.net.dead && !this.chatOpen && !this.emoteWheelOpen && ptr.isDown) {
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      const aim = Math.atan2(wp.y - this.net.pred.y, wp.x - this.net.pred.x);
      this.net.fire(aim);
      // Aim steers the facing only when standing still, so it doesn't stop the walk.
      if (mx === 0 && my === 0) {
        this.meDir.set(Math.cos(aim), Math.sin(aim));
        driveChar(this.me, this.meDir.x, this.meDir.y, false);
      }
    }
    this.me.setVisible(this.net.connected && !this.net.dead);
    this.meLight.update(this.me.x, this.me.y, this.time.now);
    this.meLight.setVisible(this.me.visible);

    // PvP arena state — warn on enter/exit; the SERVER enforces the actual damage.
    const inPvp = this.net.connected && !this.interior && !this.isSubway && inPvpZone(this.net.pred.x, this.net.pred.y);
    if (inPvp !== this.wasInPvp) {
      this.wasInPvp = inPvp;
      this.pvpWarn
        .setText(inPvp ? "⚔ ENTERING PVP ARENA — players can kill you here" : "✓ leaving the arena — safe")
        .setColor(inPvp ? "#ff3b6b" : "#39ff88")
        .setAlpha(1);
      this.tweens.killTweensOf(this.pvpWarn);
      this.tweens.add({ targets: this.pvpWarn, alpha: 0, delay: 1600, duration: 800 });
    }
    this.pvpTag.setVisible(inPvp).setText("⚔ PVP — free-for-all");

    // tutorial drill — lesson panel, portal proximity, deploy prompt
    if (this.isTutorial && this.tutorialPanel) {
      const step = tutorialStepAt(this.net.tutorialStep, this.net.tutorialMode);
      const count = step?.count ?? 1;
      const prog = this.net.tutorialProgress;
      const stepLine = step ? `◢ ${step.title}  (${Math.min(prog, count)}/${count})` : "◢ DRILL COMPLETE";
      const body = [stepLine, this.net.tutorialTeach || "", `▸ ${this.net.tutorialHint || ""}`].filter(Boolean).join("\n");
      this.tutorialPanel.setText(body);
      const d2 = (this.net.pred.x - TUTORIAL_PORTAL.x) ** 2 + (this.net.pred.y - TUTORIAL_PORTAL.y) ** 2;
      this.nearPortal = d2 < 72 * 72;
      if (this.interactPrompt) {
        const portalMsg =
          this.net.tutorialPortalOpen && this.nearPortal
            ? "▸ E — enter portal (one way · no return)"
            : this.net.tutorialPortalOpen
              ? "▸ walk east to the deploy portal"
              : "";
        this.interactPrompt.setText(portalMsg).setVisible(!!portalMsg);
      }
      this.questText.setVisible(false);
      this.dailyText.setVisible(false);
      this.bountyText.setVisible(false);
    }

    // NPCs (hub operatives + authored citizens) — surface the nearest one's interaction prompt
    if (this.interactPrompt && this.npcs.length && !this.isTutorial) {
      let near: (typeof this.npcs)[number] | null = null;
      let best = 60 * 60; // interact radius²
      for (const npc of this.npcs) {
        const d = (npc.x - this.net.pred.x) ** 2 + (npc.y - this.net.pred.y) ** 2;
        if (d < best) {
          best = d;
          near = npc;
        }
      }
      this.nearNpc = near;
      const label = near ? (near.kind === "service" ? near.name : near.kind === "door" ? `enter ${near.name}` : `talk to ${near.name}`) : "";
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

    // pickups (server-spawned loot — glow, pulsing)
    for (const [id, pu] of this.net.pickups) {
      let s = this.pickupSprites.get(id);
      if (!s) {
        const col = pu.kind === PICKUP_CORE ? COLORS.neonCyan : COLORS.neonYellow;
        s = this.add
          .image(pu.x, pu.y, GLOW_KEY)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(col)
          .setDepth(7);
        this.pickupSprites.set(id, s);
      }
      s.setScale(0.5 + 0.08 * Math.sin(this.time.now * 0.006 + id));
    }
    for (const [id, s] of this.pickupSprites)
      if (!this.net.pickups.has(id)) {
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
    this.deadText.setVisible(this.net.dead).setText("✖ ELIMINATED — respawning…");

    // seasonal meltdown — a server-wide event everyone experiences together
    if (this.net.meltdown) {
      this.meltdownFx.setFillStyle(0xff2b3b, 0.16 + 0.12 * Math.abs(Math.sin(this.time.now * 0.012)));
      this.meltdownText.setVisible(true).setText(`▲ SINGULARITY MELTDOWN · SEASON ${this.net.season} ▲`);
    } else {
      this.meltdownFx.setFillStyle(0xff2b3b, 0);
      this.meltdownText.setVisible(false);
    }
    if (this.net.connected) {
      if (this.lastSeason < 0) this.lastSeason = this.net.season;
      else if (this.net.season > this.lastSeason) {
        this.flashEra(this.net.season);
        this.lastSeason = this.net.season;
      }
    }

    const st = this.net.stats();
    const ctrl = this.net.control === NEUTRAL ? "—" : FACTION_NAMES[this.net.control];
    const war = FACTION_NAMES.map((nm, i) => `${nm[0]}:${this.net.factions[i]}`).join("  ");
    if (!st.connected && Date.now() - this.connectStartedAt > 8000) {
      // Server unreachable (e.g. a single-player-only static deploy) — don't hang on
      // "connecting…" forever; tell the player how to get back. ESC returns to the menu.
      this.hud.setColor("#ff6a6a");
      this.hud.setText([
        "⚠  SERVER OFFLINE",
        "The online realm isn't reachable right now.",
        "Press ESC to return to the menu.",
        "(Single-player — THE CITY and class runs — works fully offline.)",
      ]);
    } else if (this.isTutorial) {
      this.hud.setColor("#39ff88");
      const lesson = this.net.tutorialStep + 1;
      this.hud.setText([
        st.connected
          ? `◢ DRILL YARD  ${this.callsign}  ·  ${this.net.tutorialMode === "full" ? "FULL" : "QUICK"}  ·  lesson ${Math.min(lesson, this.net.tutorialTotal)}/${this.net.tutorialTotal}`
          : "connecting to drill yard…",
        "no XP · no leveling · rewards unlock in the live city",
        `players: ${st.players}   hostiles: ${this.net.enemies.size}   nodes: ${this.net.nodes.size}`,
        `HP ${Math.round(this.net.hp)}   ₵ ${this.net.credits}  ◈ ${this.net.cores}  (drill only — not saved)`,
        this.net.tutorialPortalOpen ? "portal open — deploy east when ready (one way)" : "complete each lesson to unlock the portal",
      ]);
    } else {
      this.hud.setColor("#39ff88");
      this.hud.setText([
        st.connected
          ? `◢ ONLINE  ${this.callsign}  ·  ${this.interior ? INTERIOR_TITLES[this.zone] ?? "▣ INTERIOR" : this.isSubway ? "▼ THE UNDERLINE" : `${this.zone.toUpperCase()} ${DISTRICTS[this.districtIndex].name}`}`
          : "connecting to server…",
        `CELL ${FACTION_NAMES[this.net.faction]}   ·   DISTRICT CONTROL: ${ctrl}`,
        `players: ${st.players}   enemies: ${this.net.enemies.size}   nodes: ${this.net.nodes.size}`,
        `LV ${this.net.level}  XP ${xpIntoLevel(this.net.xp)}/100   ₵ ${this.net.credits}  ◈ ${this.net.cores}   HP ${Math.round(this.net.hp)}`,
        `SINGULARITY ${this.net.singularity.toFixed(1)} / ${SING_MAX}${this.net.meltdown ? "  ▲ MELTDOWN" : ""}  (shared · ERA ${this.net.season})`,
        `FACTION WAR  ${war}  (server-wide contribution)`,
      ]);
    }

    // chat log (recent) + presence roster
    this.chatLogText.setText(
      this.net.chatLog.slice(-7).map((c) => {
        if (c.sys) return "» " + c.text;
        const tag = c.ch === "whisper" ? "[w] " : c.ch === "party" ? "[p] " : "";
        return `${tag}${c.from}: ${c.text}`;
      }),
    );
    this.rosterText.setText([
      `◢ ONLINE (${this.net.roster.length})`,
      ...this.net.roster
        .slice(0, 12)
        .map((r) => `${this.net.party.includes(r.id) ? "◆" : "·"} ${r.id} L${r.level}`),
    ]);

    // secure trade panel
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

    // personal campaign — per-player arc in the shared world (hidden during drill)
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
    // immediate objective: the first unfinished daily contract (or a done/empty state)
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
    for (const z of PVP_ZONES) {
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
        .text(z.x + z.w / 2, z.y + 12, `⚔ ${z.name} · PVP ARENA`, {
          fontFamily: "Courier New, monospace",
          fontSize: "13px",
          color: "#ff5a6b",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0)
        .setDepth(4)
        .setShadow(0, 0, "#000000", 4, true, true);
    }
  }

  private applyNeon() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon");
    const neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline | undefined;
    if (neon) {
      neon.heat = 0.14;
      neon.tint = [0, 0.9, 1];
      neon.tintAmt = 0.22;
    }
  }
}
