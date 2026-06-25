import Phaser from "phaser";
import { installUiCamera } from "../render/cameras";
import MusicDirector from "../audio/MusicDirector";
import { TILE, COLORS, NPC } from "../config";
import {
  TILESET_KEY,
  PORTRAIT_NPC_KEY,
  GLOW_KEY,
  PROP_PLANTER_KEY,
  PROP_BIN_KEY,
  PROP_STREETLIGHT_KEY,
  PROP_HYDRANT_KEY,
  PROP_TAXI_KEY,
  PROP_CAR_KEY,
  HOLO_KEYS,
} from "../assets/manifest";
import { COLLIDING_TILES, isWall } from "../world/district";
import {
  buildCity,
  buildInterior,
  ENV_IDENTITY,
  envAt,
  HEAL_KINDS,
  LANDMARK_KINDS,
  INTERIOR_NAMES,
  type CityMap,
  type CityBuilding,
  type BuildingKind,
  type PropKind,
  type Env,
  type InteriorProp,
} from "../world/city";
import Player from "../entities/Player";
import CityNpc from "../entities/CityNpc";
import DialogueBox from "../ui/DialogueBox";
import { AMBIENT_NPCS, INTERIOR_PLAN, keeperFor, npcDef, SUBWAY_WARDEN } from "../game/cityNpcs";
import { CityQuests, type TalkResult } from "../game/cityQuests";
import { loadSave, writeSave } from "../systems/Save";
import Inventory from "../systems/Inventory";
import { rollItem, makeWeaponItem } from "../game/items";
import { getWeapon } from "../game/weapons";
import { CONSUMABLES } from "../game/consumables";
import { fmtMetro } from "../economy/metro";
import BlackMarketPanel from "../ui/BlackMarketPanel";
import CityMinimap from "../ui/CityMinimap";
import NeonPipeline from "../render/NeonPipeline";
import Atmosphere from "../render/Atmosphere";
import { shadeWalls } from "../render/wallShade";
import { getClass } from "../game/classes";
import { sanitizeCustomization, bakeCustomPlayer, PLAYER_CUSTOM_KEY, type Customization } from "../game/customization";

/** Scene-restart payload: enter a building interior, or return to the city. */
interface CityEnter {
  interior?: { kind: BuildingKind; returnTile: [number, number]; bldgId?: string };
  returnTo?: [number, number];
}

/**
 * CityScene — the big, walkable RuneScape-style city hub, and the building interiors
 * you enter from it. Walking onto a building's door transitions inside; stepping on the
 * interior's exit returns you to the street. The player roams freely (no combat
 * pressure); NPCs hand out single-player quests (Step 3). From here the player launches
 * into the combat districts and the online world.
 */
export default class CityScene extends Phaser.Scene {
  private player!: Player;
  private cityMap?: CityMap; // present in city mode
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private neon?: NeonPipeline;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private lastDir = new Phaser.Math.Vector2(0, 1);

  private mode: "city" | "interior" = "city";
  private atmosphere?: Atmosphere;
  private doors = new Map<string, CityBuilding>();
  private exitTile?: [number, number];
  private returnTile?: [number, number];
  private transitioning = false;
  private enterCooldownUntil = 0;
  private dialogue!: DialogueBox;
  private npcs: CityNpc[] = [];
  private quests!: CityQuests;
  private collectibles: Array<{ item: string; sprite: Phaser.GameObjects.Image; x: number; y: number }> = [];
  private journalText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private walletText!: Phaser.GameObjects.Text;
  private market?: BlackMarketPanel; // $METRO arms dealer (city mode only)
  private marketX = 0;
  private marketY = 0;
  private marketPrompt?: Phaser.GameObjects.Text;
  private currentEnv?: Env; // which district the player is standing in
  private envPlate?: Phaser.GameObjects.Text; // "▸ DISTRICT" nameplate on entry
  private envSub?: Phaser.GameObjects.Text;
  private neonTint: [number, number, number] = [0, 0.9, 1]; // current screen mood (lerped)
  private neonTarget: [number, number, number] = [0, 0.9, 1];
  private interiorKind?: BuildingKind; // populated interiors
  private interiorSpots?: [number, number][];
  private interiorProps?: InteriorProp[];
  private interiorBldg?: string;
  private cityMinimap?: CityMinimap; // city-mode building-aware minimap + world map

  constructor() {
    super("City");
  }

  create(data?: CityEnter) {
    this.transitioning = false;
    this.doors.clear();
    MusicDirector.for(this)?.play("city", this); // overworld hub bed
    const classDef = getClass(this.registry.get("classId") as string | undefined);
    const cust = sanitizeCustomization(
      this.registry.get("customization") as Partial<Customization> | undefined,
      classDef.id,
    );
    bakeCustomPlayer(this, cust);

    // ── build the active place (city or interior) ───────────────────
    let grid: number[][];
    let spawn: [number, number];
    let title: string;
    if (data?.interior) {
      this.mode = "interior";
      const intr = buildInterior(data.interior.kind);
      grid = intr.grid;
      spawn = intr.spawn;
      this.exitTile = intr.exit;
      this.returnTile = data.interior.returnTile;
      title = intr.name;
      this.interiorKind = data.interior.kind;
      this.interiorSpots = intr.npcSpots;
      this.interiorProps = intr.props;
      this.interiorBldg = data.interior.bldgId;
    } else {
      this.mode = "city";
      this.cityMap = buildCity();
      grid = this.cityMap.grid;
      spawn = data?.returnTo ?? this.cityMap.spawn;
      this.exitTile = undefined;
      for (const b of this.cityMap.buildings) if (b.door) this.doors.set(b.door[0] + "," + b.door[1], b);
      if (data?.returnTo) this.enterCooldownUntil = this.time.now + 600; // grace, so we don't re-enter
      title = "THE CITY";
    }

    const worldW = grid[0].length * TILE;
    const worldH = grid.length * TILE;
    const map = this.make.tilemap({ data: grid, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE, TILE)!;
    this.wallLayer = map.createLayer(0, tileset, 0, 0)!;
    this.wallLayer.setCollision(COLLIDING_TILES);
    shadeWalls(this, grid); // raise buildings off the floor (edge light + cast shadow)

    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    this.physics.world.setBounds(0, 0, worldW, worldH);

    this.player = new Player(this, spawn[0] * TILE + TILE / 2, spawn[1] * TILE + TILE / 2, classDef, {
      textureKey: PLAYER_CUSTOM_KEY,
      color: 0xffffff,
    });
    this.physics.add.collider(this.player, this.wallLayer);
    // City clamps the camera to the big map; a small interior centres + zooms in, so the
    // room fills the frame (reads as "indoors") rather than clamping to a corner.
    if (this.mode === "city") {
      this.cameras.main.setBounds(0, 0, worldW, worldH);
      installUiCamera(this, 1);
    } else {
      this.cameras.main.removeBounds();
      installUiCamera(this, 1.35); // interiors zoom in so the room fills the frame
    }
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.applyNeon();
    this.createAtmosphere(worldW, worldH);
    this.buildHud(title);
    this.cameras.main.fadeIn(300, 4, 2, 10);

    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.input.keyboard!.on("keydown-ESC", () => {
      if (this.transitioning) return;
      if (this.cityMinimap?.isWorldOpen) {
        this.cityMinimap.toggleWorld();
        return;
      }
      if (this.market?.isOpen) {
        this.market.close();
        return;
      }
      if (this.dialogue.isOpen) return;
      if (this.mode === "interior") this.leaveInterior();
      else this.exitTo("Select");
    });

    // NPCs + quests + dialogue
    this.npcs = [];
    this.collectibles = [];
    this.quests = (this.registry.get("cityQuests") as CityQuests) ?? new CityQuests();
    this.registry.set("cityQuests", this.quests); // persists across city ↔ interior
    this.dialogue = new DialogueBox(this);
    this.buildQuestHud();
    if (this.mode === "city") {
      this.assignResidents();
      this.drawEnvWash();
      this.drawDecorations();
      this.placeCityNpcs();
      this.drawResidentSigns();
      this.spawnCollectibles();
      this.setupBlackMarket();
      this.setupEnvPlate();
      this.checkSubwayCleared();
      if (this.cityMap) {
        this.cityMinimap = new CityMinimap(this, this.cityMap);
        this.cityMinimap.setMarkers(
          [Math.floor(this.marketX / TILE), Math.floor(this.marketY / TILE)],
          this.cityMap.npcSpots[0],
        );
      }
    } else {
      this.drawInteriorFurniture();
      this.populateInterior();
    }
    this.input.keyboard!.on("keydown-E", () => this.tryTalk());
    this.input.keyboard!.on("keydown-J", () => this.toggleJournal());
    this.input.keyboard!.on("keydown-M", () => this.cityMinimap?.toggleWorld());
    this.input.keyboard!.on("keydown-B", () => {
      if (this.mode === "city" && !this.dialogue.isOpen && !this.transitioning) this.market?.toggle();
    });
  }

  private buildQuestHud() {
    const w = this.scale.width;
    this.walletText = this.add
      .text(w - 14, 12, "", { fontFamily: "Courier New, monospace", fontSize: "12px", color: "#f7ff3c" })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.toastText = this.add
      .text(w / 2, 70, "", { fontFamily: "Courier New, monospace", fontSize: "13px", color: "#39ff88", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001)
      .setAlpha(0);
    this.toastText.setShadow(0, 0, "#0a0e1a", 4, true, true);
    this.journalText = this.add
      .text(w - 14, 92, "", { fontFamily: "Courier New, monospace", fontSize: "11px", color: "#cfe8ff", align: "right" })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.add
      .text(160, 34, "·  J journal", { fontFamily: "Courier New, monospace", fontSize: "11px", color: "#6b7184" })
      .setScrollFactor(0)
      .setDepth(1000);
    this.refreshWallet();
    this.renderJournal();
  }

  private refreshWallet() {
    const metro = loadSave()?.progress.metro ?? 0;
    this.walletText.setText(`${this.quests.credits}c   ${this.quests.xp} XP   ◈ ${fmtMetro(metro)} $METRO`);
  }

  /** Place the $METRO arms dealer right by the spawn plaza — beacon-marked so it's the
   *  first thing you see — and wire its store panel against the shared save. */
  private setupBlackMarket() {
    if (!this.cityMap) return;
    const [sx, sy] = this.cityMap.spawn;
    let tx = sx + 3;
    let ty = sy - 2;
    if (isWall(this.cityMap.grid[ty]?.[tx])) {
      tx = sx + 2;
      ty = sy;
    }
    this.marketX = tx * TILE + TILE / 2;
    this.marketY = ty * TILE + TILE / 2;

    // beacon: a pulsing magenta ground-glow + a kiosk + a sky-beam so it reads from afar
    const glow = this.add
      .image(this.marketX, this.marketY, GLOW_KEY)
      .setTint(0xff2bd6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(6)
      .setScale(1.7);
    this.tweens.add({ targets: glow, scale: 2.1, alpha: 0.6, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    const beam = this.add
      .rectangle(this.marketX, this.marketY - 130, 10, 260, 0xff2bd6, 0.12)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(5);
    this.tweens.add({ targets: beam, alpha: 0.04, duration: 1400, yoyo: true, repeat: -1 });
    this.add.rectangle(this.marketX, this.marketY, 28, 22, 0x14081e, 0.92).setStrokeStyle(2, 0xff2bd6, 0.95).setDepth(7);
    this.add
      .text(this.marketX, this.marketY - 32, "◈ BLACK MARKET", {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#ff2bd6",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(8)
      .setShadow(0, 0, "#00e5ff", 8, true, true);
    this.add
      .text(this.marketX, this.marketY - 17, "$METRO weapons", { fontFamily: "Courier New, monospace", fontSize: "9px", color: "#9af0ff" })
      .setOrigin(0.5)
      .setDepth(8);
    this.marketPrompt = this.add
      .text(this.marketX, this.marketY + 20, "▸ E to browse", { fontFamily: "Courier New, monospace", fontSize: "10px", color: "#f7ff3c" })
      .setOrigin(0.5)
      .setDepth(8)
      .setVisible(false);

    this.market = new BlackMarketPanel(this, {
      getMetro: () => loadSave()?.progress.metro ?? 0,
      buyWeapon: (id) => this.buyWeapon(id),
      buyConsumable: (id) => this.buyConsumableMetro(id),
    });

    // persistent corner hint so it's discoverable even before you find the stall
    this.add
      .text(160, 50, "·  B black market", { fontFamily: "Courier New, monospace", fontSize: "11px", color: "#ff79c6" })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  /** Buy a weapon against the shared save: deduct $METRO, drop the weapon in the bag. */
  private buyWeapon(weaponId: string): "ok" | "poor" | "full" | "nochar" {
    const save = loadSave();
    if (!save) return "nochar";
    const w = getWeapon(weaponId);
    if (!w) return "nochar";
    const metro = save.progress.metro ?? 0;
    if (metro < w.metro) return "poor";
    const inv = new Inventory();
    inv.load(save.inventory);
    if (inv.full) return "full";
    const item = makeWeaponItem(weaponId, save.progress.level ?? 1);
    if (!inv.add(item)) return "full";
    save.progress.metro = metro - w.metro;
    save.inventory = inv.toData();
    writeSave(save);
    this.refreshWallet();
    this.toast(`◈ ${item.name} → bag`);
    return "ok";
  }

  /** Buy a consumable against the shared save: deduct $METRO, add to the kit. */
  private buyConsumableMetro(id: string): "ok" | "poor" | "nochar" {
    const save = loadSave();
    if (!save) return "nochar";
    const c = CONSUMABLES.find((x) => x.id === id);
    if (!c) return "nochar";
    const metro = save.progress.metro ?? 0;
    if (metro < c.metro) return "poor";
    save.progress.metro = metro - c.metro;
    save.progress.consumables = save.progress.consumables ?? {};
    save.progress.consumables[id] = (save.progress.consumables[id] ?? 0) + 1;
    writeSave(save);
    this.refreshWallet();
    this.toast(`◈ ${c.name} → kit`);
    return "ok";
  }

  // ── environments: per-district colour, props + a "you are entering X" nameplate ──

  /** A translucent mood-wash over every block, coloured by its district. */
  private drawEnvWash() {
    if (!this.cityMap) return;
    const g = this.add.graphics().setDepth(1);
    for (const z of this.cityMap.zones) {
      const id = ENV_IDENTITY[z.env];
      g.fillStyle(id.wash, id.washAlpha);
      g.fillRect(z.rect.x1 * TILE, z.rect.y1 * TILE, (z.rect.x2 - z.rect.x1 + 1) * TILE, (z.rect.y2 - z.rect.y1 + 1) * TILE);
    }
  }

  /** Spawn the env-specific street props the generator placed. */
  private drawDecorations() {
    if (!this.cityMap) return;
    for (const d of this.cityMap.decorations) {
      const env = envAt(d.x, d.y, this.cityMap.w, this.cityMap.h);
      this.spawnProp(d.kind, d.x * TILE + TILE / 2, d.y * TILE + TILE / 2, ENV_IDENTITY[env].accent);
    }
    // Real top-down vehicles (pack) parked in open streets + hydrants tucked against
    // buildings — deterministic + sparse so the city reads as lived-in. Non-colliding decals.
    const grid = this.cityMap.grid;
    const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const wall = (x: number, y: number) => isWall(grid[y]?.[x]);
    const adjWall = (x: number, y: number) => wall(x - 1, y) || wall(x + 1, y) || wall(x, y - 1) || wall(x, y + 1);
    let cars = 0;
    let hyd = 0;
    for (let ty = 2; ty < grid.length - 2; ty++) {
      for (let tx = 2; tx < grid[ty].length - 2; tx++) {
        if (wall(tx, ty)) continue;
        const h = hash(tx, ty);
        const px = tx * TILE + TILE / 2;
        const py = ty * TILE + TILE / 2;
        if (!adjWall(tx, ty) && h % 37 === 0 && cars < 6) {
          this.add.image(px, py, h % 2 ? PROP_TAXI_KEY : PROP_CAR_KEY).setOrigin(0.5, 0.55).setDepth(4);
          cars++;
        } else if (adjWall(tx, ty) && h % 211 === 0 && hyd < 8) {
          this.add.image(px, py + 4, PROP_HYDRANT_KEY).setOrigin(0.5, 0.9).setDepth(4);
          hyd++;
        }
      }
    }
    // Holographic projectors at plaza centres (open civic spaces) — a projection-pool glow
    // + a slow hover. Plaza-anchored so they always land in open ground, spread across the map.
    const HOLO_TINT = [0xff2bd6, 0xffb13c, 0x39ff88, 0x39ff88]; // matches HOLO_KEYS order
    this.cityMap.plazas.slice(0, 6).forEach((p, i) => {
      const cx = Math.floor((p.x1 + p.x2) / 2);
      const cy = Math.floor((p.y1 + p.y2) / 2);
      if (wall(cx, cy)) return;
      const px = cx * TILE + TILE / 2;
      const py = cy * TILE + TILE / 2;
      const k = i % HOLO_KEYS.length;
      this.add.image(px, py, GLOW_KEY).setTint(HOLO_TINT[k]).setBlendMode(Phaser.BlendModes.ADD).setDepth(3).setScale(0.6).setAlpha(0.22);
      const holo = this.add.image(px, py + 3, HOLO_KEYS[k]).setOrigin(0.5, 0.92).setDepth(5);
      this.tweens.add({ targets: holo, y: holo.y - 2, yoyo: true, repeat: -1, duration: 1500 + i * 130, ease: "Sine.inOut" });
    });
  }

  /** Draw one decorative prop (procedural). Glowy props (fire/lantern) pulse. */
  private spawnProp(kind: PropKind, x: number, y: number, accent: number) {
    const D = 4;
    const g = this.add.graphics().setDepth(D);
    const glow = (col: number, r: number, a = 0.5, pulse = false) => {
      const img = this.add.image(x, y - 4, GLOW_KEY).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(D - 1).setScale(r).setAlpha(a);
      if (pulse) this.tweens.add({ targets: img, scale: r * 1.3, alpha: a * 0.55, duration: 600 + Math.random() * 300, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    };
    switch (kind) {
      case "billboard":
        g.fillStyle(0x0a0e1a, 1).fillRect(x - 1, y - 6, 2, 14);
        g.fillStyle(0x05060c, 1).fillRect(x - 9, y - 30, 18, 22);
        g.lineStyle(2, accent, 0.95).strokeRect(x - 9, y - 30, 18, 22);
        g.fillStyle(accent, 0.5).fillRect(x - 6, y - 26, 12, 4);
        g.fillStyle(accent, 0.3).fillRect(x - 6, y - 19, 12, 3);
        glow(accent, 0.9, 0.4);
        break;
      case "planter":
        // Real pack planter (overrides the procedural box).
        this.add.image(x, y + 4, PROP_PLANTER_KEY).setOrigin(0.5, 0.9).setDepth(D);
        break;
      case "stall":
        g.fillStyle(0x2a1c10, 1).fillRect(x - 10, y - 2, 20, 8);
        for (let i = 0; i < 5; i++) g.fillStyle(i % 2 ? 0xff5a4a : 0xffd24a, 1).fillRect(x - 10 + i * 4, y - 12, 4, 8);
        g.fillStyle(0x0a0e1a, 1).fillRect(x - 10, y - 4, 2, 10).fillRect(x + 8, y - 4, 2, 10);
        break;
      case "lantern":
        // Real pack streetlight (overrides the procedural lamp-on-pole) + a soft ground pool.
        this.add.image(x, y + 4, PROP_STREETLIGHT_KEY).setOrigin(0.5, 1).setDepth(D);
        glow(accent, 0.6, 0.32, true);
        break;
      case "pipe":
        g.lineStyle(5, 0x4a5468, 1).lineBetween(x - 12, y, x + 12, y);
        g.fillStyle(0x2b3242, 1).fillCircle(x - 12, y, 4).fillCircle(x + 12, y, 4);
        g.lineStyle(5, 0x4a5468, 1).lineBetween(x + 12, y, x + 12, y - 10);
        g.fillStyle(0x8bff6a, 0.18).fillCircle(x - 4, y - 2, 3);
        break;
      case "barrel":
        g.fillStyle(0x3a4150, 1).fillRect(x - 6, y - 12, 12, 16);
        g.fillStyle(0x2a3040, 1).fillRect(x - 6, y - 9, 12, 2).fillRect(x - 6, y - 2, 12, 2);
        g.fillStyle(0xffb13c, 0.9).fillRect(x - 6, y - 6, 12, 2);
        break;
      case "fire":
        g.fillStyle(0x2a2420, 1).fillRect(x - 6, y - 6, 12, 12);
        g.fillStyle(0xff7a2c, 1).fillTriangle(x - 4, y - 6, x + 4, y - 6, x, y - 16);
        glow(0xff6a2c, 0.95, 0.7, true);
        break;
      case "trash":
        // Real pack bin (overrides the procedural trash heap).
        this.add.image(x, y + 4, PROP_BIN_KEY).setOrigin(0.5, 0.9).setDepth(D);
        break;
      case "tree":
        g.fillStyle(0x3a2a18, 1).fillRect(x - 2, y - 4, 4, 10);
        g.fillStyle(0x1f7a3a, 1).fillCircle(x, y - 12, 10);
        g.fillStyle(0x2fa050, 1).fillCircle(x - 4, y - 14, 6).fillCircle(x + 5, y - 11, 5);
        break;
      case "bench":
        g.fillStyle(0x2a3142, 1).fillRect(x - 9, y - 2, 18, 3);
        g.fillStyle(0x1a2030, 1).fillRect(x - 8, y + 1, 2, 5).fillRect(x + 6, y + 1, 2, 5);
        break;
    }
  }

  private setupEnvPlate() {
    const w = this.scale.width;
    this.envPlate = this.add
      .text(w / 2, 116, "", { fontFamily: "Courier New, monospace", fontSize: "26px", color: "#ffffff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002)
      .setAlpha(0);
    this.envSub = this.add
      .text(w / 2, 144, "DISTRICT", { fontFamily: "Courier New, monospace", fontSize: "11px", color: "#9aa3b2" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002)
      .setAlpha(0);
  }

  /** Crossing into a new district: shift the screen mood + flash the nameplate. */
  private enterEnv(env: Env) {
    this.currentEnv = env;
    const id = ENV_IDENTITY[env];
    this.neonTarget = id.tint;
    if (!this.envPlate || !this.envSub) return;
    const hex = "#" + (id.accent & 0xffffff).toString(16).padStart(6, "0");
    this.envPlate.setText(`▸ ${id.name}`).setColor(hex).setAlpha(1).setScale(0.85).setShadow(0, 0, "#000000", 6, true, true);
    this.envSub.setAlpha(1);
    this.tweens.killTweensOf([this.envPlate, this.envSub]);
    this.tweens.add({ targets: this.envPlate, scale: 1, duration: 300, ease: "Back.out" });
    this.tweens.add({ targets: [this.envPlate, this.envSub], alpha: 0, delay: 1800, duration: 700 });
  }

  private toast(msg: string) {
    this.toastText.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toastText);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 2400, duration: 700 });
  }

  private toggleJournal() {
    this.renderJournal();
    this.journalText.setVisible(!this.journalText.visible);
  }

  private renderJournal() {
    const list = this.quests.journal();
    const body = list.length ? list.map((q) => `${q.name}\n  ${q.objective}`).join("\n\n") : "(no active quests)";
    this.journalText.setText("— JOURNAL —\n\n" + body);
  }

  private spawnCollectibles() {
    for (const c of this.collectibles) c.sprite.destroy();
    this.collectibles = [];
    if (this.mode !== "city" || !this.cityMap) return;
    const need = this.quests.activeCollectItem();
    if (!need || need.remaining <= 0) return;
    const grid = this.cityMap.grid;
    let tries = 0;
    while (this.collectibles.length < need.remaining && tries < 600) {
      tries++;
      const tx = 2 + Math.floor(Math.random() * (this.cityMap.w - 4));
      const ty = 2 + Math.floor(Math.random() * (this.cityMap.h - 4));
      if (isWall(grid[ty][tx])) continue;
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      const sprite = this.add.image(x, y, GLOW_KEY).setTint(0x39ff88).setDepth(7).setScale(0.7);
      this.tweens.add({ targets: sprite, scale: 1.05, alpha: 0.55, duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.collectibles.push({ item: need.item, sprite, x, y });
    }
  }

  /** The open streets carry the ambient crowd — the named NPCs now live in their
   *  buildings (see populateInterior), so the city reads consistent with the quests. */
  private placeCityNpcs() {
    if (!this.cityMap) return;
    const spots = this.cityMap.npcSpots;
    // The Transit Warden (subway quest-giver) takes the most central spot; then any named
    // NPC without a building; then the ambient crowd.
    const homeless = ((this.registry.get("cityHomeless") as string[]) ?? [])
      .map((id) => npcDef(id))
      .filter((d): d is NonNullable<typeof d> => !!d);
    const placed = [SUBWAY_WARDEN, ...homeless];
    for (let i = 0; i < spots.length; i++) {
      const def = i < placed.length ? placed[i] : AMBIENT_NPCS[(i - placed.length) % AMBIENT_NPCS.length];
      const [tx, ty] = spots[i];
      this.npcs.push(new CityNpc(this, tx * TILE + TILE / 2, ty * TILE + TILE / 2, def));
    }
  }

  /** Returning from the subway with THE UNDERLINE cleared → advance the quest. */
  private checkSubwayCleared() {
    if (!this.registry.get("subwayCleared")) return;
    this.registry.set("subwayCleared", false);
    const name = this.quests.clearObjective("subway");
    if (name) this.toast(`${name}: THE UNDERLINE is dead — report to the TRANSIT WARDEN`);
  }

  /** Assign each named NPC to the nearest enterable building of their kind (cached in the
   *  registry so it survives city ↔ interior restarts). Returns bldgId → [npc ids]. */
  private assignResidents(): Record<string, string[]> {
    const cached = this.registry.get("cityResidents") as Record<string, string[]> | undefined;
    if (cached) return cached;
    const map: Record<string, string[]> = {};
    if (!this.cityMap) return map;
    const [sx, sy] = this.cityMap.spawn;
    const doored = this.cityMap.buildings.filter((b) => b.door);
    const distTo = (b: CityBuilding) => Phaser.Math.Distance.Between((b.rect.x1 + b.rect.x2) / 2, (b.rect.y1 + b.rect.y2) / 2, sx, sy);
    const placed = new Set<string>();
    for (const kind in INTERIOR_PLAN) {
      const ranked = doored.filter((b) => b.kind === kind).sort((a, b) => distTo(a) - distTo(b));
      INTERIOR_PLAN[kind].forEach((group, i) => {
        if (ranked[i]) {
          map[ranked[i].id] = group;
          group.forEach((id) => placed.add(id));
        }
      });
    }
    // Safety net: any named NPC with no building (e.g. a seed lacks that kind) stays
    // reachable on the street, so quests that need them never soft-lock.
    const homeless: string[] = [];
    for (const kind in INTERIOR_PLAN) for (const group of INTERIOR_PLAN[kind]) for (const id of group) if (!placed.has(id)) homeless.push(id);
    this.registry.set("cityResidents", map);
    this.registry.set("cityHomeless", homeless);
    return map;
  }

  /** Float the resident's name (or the venue) over each occupied building's door. */
  private drawResidentSigns() {
    if (!this.cityMap) return;
    const residents = this.assignResidents();
    const NAMES: Record<string, string> = { bar: "THE FERAL CAT", clinic: "MED-CLINIC", guild: "RUNNERS' GUILD" };
    const sign = (dx: number, dy: number, label: string, color: string) =>
      this.add
        .text(dx * TILE + TILE / 2, dy * TILE - 4, "▾ " + label, { fontFamily: "Courier New, monospace", fontSize: "10px", color })
        .setOrigin(0.5, 1)
        .setDepth(8)
        .setShadow(0, 0, "#0a0e1a", 4, true, true);
    for (const b of this.cityMap.buildings) {
      if (!b.door) continue;
      // landmarks (hospital/hotel/subway/stadium/spire) — always signed so they're findable
      if (LANDMARK_KINDS.includes(b.kind)) {
        const col = b.kind === "hospital" || b.kind === "hotel" ? "#39ff88" : b.kind === "stadium" ? "#ff3b6b" : "#29e7ff";
        sign(b.door[0], b.door[1], INTERIOR_NAMES[b.kind], col);
        continue;
      }
      const ids = residents[b.id];
      if (!ids || !ids.length) continue;
      sign(b.door[0], b.door[1], NAMES[b.kind] ?? (npcDef(ids[0])?.name ?? ""), "#f7ff3c");
    }
  }

  private tryTalk() {
    if (this.transitioning) return;
    if (this.market?.isOpen) {
      this.market.close();
      return;
    }
    if (this.dialogue.isOpen) return;
    // standing at the arms-dealer stall → open the $METRO black market
    if (this.market && this.mode === "city") {
      const dm = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.marketX, this.marketY);
      if (dm <= NPC.interactRange + 12) {
        this.market.show();
        return;
      }
    }
    let nearest: CityNpc | undefined;
    let best = Infinity;
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.x, n.y);
      if (d <= NPC.interactRange && d < best) {
        best = d;
        nearest = n;
      }
    }
    if (!nearest) return;
    const n = nearest;
    // Hospital / hotel / clinic: the keeper patches you up (restores persisted HP).
    if (this.mode === "interior" && this.interiorKind && HEAL_KINDS.includes(this.interiorKind) && (n.id.startsWith("keep_") || n.id === "doc")) {
      this.healPlayer();
    }
    this.showTalk(this.quests.onTalk(n.id, n.name, n.def.lines, n.def.quest));
  }

  /** Full-heal the persisted HP — the hospital / hotel / clinic service. */
  private healPlayer() {
    const save = loadSave();
    if (!save) {
      this.toast("▣ Rest up — start the campaign first.");
      return;
    }
    if ((save.progress.hp ?? -1) <= 0) {
      this.toast("▣ You're already at full strength.");
      return;
    }
    save.progress.hp = -1; // -1 = full
    writeSave(save);
    this.toast("▣ FULLY HEALED — patched to full strength");
  }

  private showTalk(res: TalkResult) {
    const portrait = { key: PORTRAIT_NPC_KEY, frame: 0 };
    if (res.kind === "offer") {
      const pages = res.lines.map((text, i) => ({
        speaker: res.speaker,
        text,
        portrait,
        choices: i === res.lines.length - 1 ? ["Accept", "Maybe later"] : undefined,
      }));
      this.dialogue.show(pages, undefined, (choice) => {
        if (choice === 0) {
          this.quests.accept(res.questId);
          this.spawnCollectibles();
          this.renderJournal();
          this.toast(`Quest accepted — ${res.name}`);
        }
      });
    } else if (res.kind === "reward") {
      const gear = this.grantQuestGear(res.loot, res.lootBoost);
      this.dialogue.show(
        res.lines.map((text) => ({ speaker: res.speaker, text, portrait })),
        () => {
          this.refreshWallet();
          this.renderJournal();
          const gearMsg = gear.length ? `    +${gear.length} GEAR` : "";
          this.toast(`${res.questName} complete    +${res.xp} XP    +${res.credits}c${gearMsg}`);
          if (gear.length) this.toast(`◈ ${gear.join(", ")} → bag`);
        },
      );
    } else {
      this.dialogue.show(res.lines.map((text) => ({ speaker: res.speaker, text, portrait })));
    }
  }

  /** Roll quest gear into the shared save so it's waiting in the bag in the next district.
   *  No-op if there's no combat character yet (gear would have nowhere to live). */
  private grantQuestGear(loot: number, lootBoost: number): string[] {
    if (loot <= 0) return [];
    const save = loadSave();
    if (!save) return [];
    const inv = new Inventory();
    inv.load(save.inventory);
    const level = save.progress?.level ?? 1;
    const names: string[] = [];
    for (let i = 0; i < loot; i++) {
      const item = rollItem(level, lootBoost);
      if (inv.add(item)) names.push(item.name);
    }
    if (names.length) {
      save.inventory = inv.toData();
      writeSave(save);
    }
    return names;
  }

  update(_time: number, delta: number) {
    this.atmosphere?.update(this.time.now, delta, 0.15); // weather/fog/holos animate always
    // ease the screen mood toward the current district's tint (keeps shifting even when frozen)
    if (this.mode === "city" && this.neon) {
      const t = this.neonTint;
      for (let i = 0; i < 3; i++) t[i] += (this.neonTarget[i] - t[i]) * 0.05;
      this.neon.tint = [t[0], t[1], t[2]];
    }
    if (this.transitioning) return;
    if (this.dialogue.isOpen || this.market?.isOpen || this.cityMinimap?.isWorldOpen) {
      this.player.setVelocity(0, 0);
      return; // freeze while talking / shopping / reading the map
    }
    const left = this.wasd.A.isDown || this.cursors.left.isDown;
    const right = this.wasd.D.isDown || this.cursors.right.isDown;
    const up = this.wasd.W.isDown || this.cursors.up.isDown;
    const down = this.wasd.S.isDown || this.cursors.down.isDown;
    const dx = (right ? 1 : 0) - (left ? 1 : 0);
    const dy = (down ? 1 : 0) - (up ? 1 : 0);
    if (dx !== 0 || dy !== 0) this.lastDir.set(dx, dy);
    this.player.step({
      left,
      right,
      up,
      down,
      dash: false,
      fire: false,
      aimX: this.player.x + this.lastDir.x,
      aimY: this.player.y + this.lastDir.y,
    });

    // NPC "E TALK" prompts by proximity
    for (const n of this.npcs) n.update(Phaser.Math.Distance.Between(this.player.x, this.player.y, n.x, n.y));
    this.cityMinimap?.update(this.player.x, this.player.y);

    // black-market "E to browse" prompt by proximity
    if (this.market && this.marketPrompt) {
      const near = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.marketX, this.marketY) <= NPC.interactRange + 12;
      this.marketPrompt.setVisible(near && !this.market.isOpen);
    }

    // quest collectibles — walk over to pick up
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const c = this.collectibles[i];
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, c.x, c.y) < 24) {
        c.sprite.destroy();
        this.collectibles.splice(i, 1);
        const msg = this.quests.collect(c.item);
        if (msg) {
          this.toast(msg);
          this.renderJournal();
        }
      }
    }

    // ── place transitions (door → interior, exit → street) ──────────
    const tx = Math.floor(this.player.x / TILE);
    const ty = Math.floor(this.player.y / TILE);
    if (this.mode === "city") {
      if (this.cityMap) {
        const env = envAt(tx, ty, this.cityMap.w, this.cityMap.h);
        if (env !== this.currentEnv) this.enterEnv(env);
      }
      if (this.time.now >= this.enterCooldownUntil) {
        const b = this.doors.get(tx + "," + ty);
        if (b?.door) {
          if (b.kind === "subway") this.launchSubway(b);
          else if (b.kind === "stadium") this.launchArena();
          else this.enterInterior(b);
        }
      }
    } else if (this.exitTile && tx === this.exitTile[0] && ty === this.exitTile[1]) {
      this.leaveInterior();
    }
  }

  private enterInterior(b: CityBuilding) {
    this.transitioning = true;
    const payload: CityEnter = { interior: { kind: b.kind, returnTile: b.door!, bldgId: b.id } };
    this.cameras.main.fadeOut(220, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.restart(payload));
  }

  /** The subway descends into THE UNDERLINE — an instanced combat dungeon. */
  private launchSubway(b: CityBuilding) {
    this.transitioning = true;
    const back: [number, number] | undefined = b.door ? [b.door[0], b.door[1] + 1] : undefined;
    this.cameras.main.fadeOut(260, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Subway", { returnTile: back }));
  }

  /** THE CRUCIBLE — step in to fight other players in the online arena. */
  private launchArena() {
    this.transitioning = true;
    this.cameras.main.fadeOut(260, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Online"));
  }

  /** Put the right people in the room: the building's named residents (quest-givers /
   *  targets) behind the counter, generic keeper otherwise, plus a patron or two. */
  private populateInterior() {
    const spots = this.interiorSpots ?? [];
    if (!spots.length || !this.interiorKind) return;
    const residents = (this.registry.get("cityResidents") as Record<string, string[]>) ?? {};
    const ids = (this.interiorBldg && residents[this.interiorBldg]) || [];
    const occupants = ids.length
      ? ids.map((id) => npcDef(id)).filter((d): d is NonNullable<typeof d> => !!d)
      : [keeperFor(this.interiorKind)];
    // fill remaining spots with ambient patrons (deterministic by building id)
    const seed = (this.interiorBldg ?? "x").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    while (occupants.length < spots.length && occupants.length < 3) {
      occupants.push(AMBIENT_NPCS[(seed + occupants.length) % AMBIENT_NPCS.length]);
    }
    occupants.forEach((def, i) => {
      const s = spots[i];
      if (!s) return;
      this.npcs.push(new CityNpc(this, s[0] * TILE + TILE / 2, s[1] * TILE + TILE / 2, def));
    });
  }

  /** Render the room's furniture (procedural; non-colliding). Warm interior palette. */
  private drawInteriorFurniture() {
    for (const p of this.interiorProps ?? []) {
      this.spawnInteriorProp(p.kind, p.x * TILE + TILE / 2, p.y * TILE + TILE / 2);
    }
  }

  private spawnInteriorProp(kind: string, x: number, y: number) {
    const D = 3;
    const g = this.add.graphics().setDepth(D);
    const glow = (col: number, r: number, a: number) =>
      this.add.image(x, y - 3, GLOW_KEY).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(D - 1).setScale(r).setAlpha(a);
    const WOOD = 0x6b4a2a, WOOD_D = 0x3a2818, MET = 0x4a5468, MET_L = 0x868fa3, DARK = 0x15121d, CLOTH = 0x5a2740;
    switch (kind) {
      case "bottles":
        g.fillStyle(WOOD_D, 1).fillRect(x - 11, y - 8, 22, 12); // shelf
        for (let i = 0; i < 5; i++) g.fillStyle([0x39ff88, 0xff79c6, 0x29e7ff, 0xffb13c, 0xb06bff][i], 0.9).fillRect(x - 9 + i * 4, y - 7, 2, 6);
        g.fillStyle(MET_L, 0.5).fillRect(x - 11, y + 3, 22, 1);
        break;
      case "sign":
        g.fillStyle(0xff2bd6, 0.9).fillRect(x - 12, y - 3, 24, 5);
        g.fillStyle(0xffffff, 0.7).fillRect(x - 10, y - 2, 20, 1);
        glow(0xff2bd6, 1.1, 0.5);
        break;
      case "stool":
        g.fillStyle(WOOD_D, 1).fillRect(x - 1, y - 1, 2, 7); // post
        g.fillStyle(MET, 1).fillCircle(x, y - 3, 5); g.fillStyle(MET_L, 1).fillCircle(x, y - 4, 2);
        break;
      case "table":
        g.fillStyle(WOOD_D, 1).fillRect(x - 10, y - 5, 20, 8); g.fillStyle(WOOD, 1).fillRect(x - 9, y - 5, 18, 4);
        g.fillStyle(WOOD_D, 1).fillRect(x - 9, y + 3, 2, 4).fillRect(x + 7, y + 3, 2, 4);
        break;
      case "shelf":
        g.fillStyle(WOOD_D, 1).fillRect(x - 8, y - 11, 16, 22); g.fillStyle(DARK, 1).fillRect(x - 7, y - 10, 14, 20);
        for (let r = 0; r < 3; r++) { g.fillStyle(WOOD, 1).fillRect(x - 7, y - 7 + r * 7, 14, 1); for (let c = 0; c < 3; c++) g.fillStyle([0x29e7ff, 0xffb13c, 0x39ff88][(r + c) % 3], 0.8).fillRect(x - 6 + c * 5, y - 6 + r * 7, 3, 4); }
        break;
      case "cabinet":
        g.fillStyle(0xdfe6ef, 1).fillRect(x - 8, y - 8, 16, 14); g.fillStyle(0xb7c2d2, 1).fillRect(x - 7, y - 7, 7, 12); g.fillStyle(0xb7c2d2, 1).fillRect(x + 1, y - 7, 6, 12);
        g.fillStyle(0xff3b6b, 1).fillRect(x - 1, y - 4, 2, 5).fillRect(x - 3, y - 2, 6, 1); // red cross
        break;
      case "medbay":
        g.fillStyle(MET, 1).fillRect(x - 11, y - 5, 22, 9); g.fillStyle(0x29e7ff, 0.35).fillRect(x - 10, y - 4, 20, 6); // bed
        g.fillStyle(0xeef2f8, 1).fillRect(x - 10, y - 4, 6, 6); // pillow
        g.fillStyle(DARK, 1).fillRect(x + 7, y - 10, 5, 6); g.fillStyle(0x39ff88, 1).fillRect(x + 8, y - 9, 3, 1); // monitor
        glow(0x29e7ff, 0.8, 0.25);
        break;
      case "cross":
        g.fillStyle(0x39ff88, 1).fillRect(x - 1, y - 5, 3, 10).fillRect(x - 4, y - 2, 9, 3);
        glow(0x39ff88, 0.9, 0.5);
        break;
      case "register":
        g.fillStyle(DARK, 1).fillRect(x - 5, y - 5, 10, 7); g.fillStyle(0x29e7ff, 0.9).fillRect(x - 4, y - 4, 8, 2); g.fillStyle(MET_L, 1).fillRect(x - 4, y + 1, 8, 1);
        break;
      case "crate":
        g.fillStyle(WOOD_D, 1).fillRect(x - 7, y - 7, 14, 14); g.fillStyle(WOOD, 1).fillRect(x - 6, y - 6, 12, 12);
        g.lineStyle(1, WOOD_D, 1).lineBetween(x - 6, y - 6, x + 6, y + 6).lineBetween(x + 6, y - 6, x - 6, y + 6);
        break;
      case "board":
        g.fillStyle(0x2a2018, 1).fillRect(x - 12, y - 9, 24, 16); // cork board
        for (let i = 0; i < 6; i++) g.fillStyle([0xeae6ff, 0xf7ff3c, 0x9fdcff][i % 3], 0.9).fillRect(x - 10 + (i % 3) * 8, y - 7 + Math.floor(i / 3) * 8, 5, 5); // notes
        break;
      case "rack":
        g.fillStyle(DARK, 1).fillRect(x - 6, y - 10, 12, 20);
        for (let i = 0; i < 3; i++) { g.fillStyle(MET, 1).fillRect(x - 4, y - 9 + i * 7, 8, 2); g.fillStyle(MET_L, 1).fillRect(x - 4, y - 9 + i * 7, 6, 1); }
        break;
      case "locker":
        g.fillStyle(MET, 1).fillRect(x - 6, y - 11, 12, 22); g.fillStyle(MET_L, 1).fillRect(x - 5, y - 10, 5, 20); g.fillStyle(0x2a3242, 1).fillRect(x + 1, y - 10, 4, 20);
        g.fillStyle(0xf7ff3c, 0.8).fillRect(x - 1, y - 1, 1, 2); // handle
        break;
      case "terminal":
        g.fillStyle(DARK, 1).fillRect(x - 6, y - 8, 12, 10); g.fillStyle(0x29e7ff, 0.85).fillRect(x - 5, y - 7, 10, 7);
        for (let i = 0; i < 3; i++) g.fillStyle(0xeafdff, 0.7).fillRect(x - 4, y - 6 + i * 2, 6 - i, 1);
        g.fillStyle(MET, 1).fillRect(x - 2, y + 2, 4, 4); // stand
        glow(0x29e7ff, 0.8, 0.3);
        break;
      case "bed":
        g.fillStyle(WOOD_D, 1).fillRect(x - 8, y - 6, 16, 16); g.fillStyle(CLOTH, 1).fillRect(x - 7, y - 5, 14, 14); g.fillStyle(0x7a3a58, 1).fillRect(x - 7, y - 5, 14, 4);
        g.fillStyle(0xeef2f8, 1).fillRect(x - 6, y - 4, 6, 4); // pillow
        break;
      case "rug":
        g.fillStyle(0x3a2440, 0.85).fillRect(x - 9, y - 6, 18, 12); g.lineStyle(1, 0xff79c6, 0.5).strokeRect(x - 7, y - 4, 14, 8);
        break;
      case "plant":
        g.fillStyle(WOOD_D, 1).fillRect(x - 3, y + 1, 6, 5); g.fillStyle(0x2fa050, 1).fillCircle(x, y - 3, 5); g.fillStyle(0x39ff88, 1).fillCircle(x - 2, y - 4, 2);
        break;
      case "planter":
        g.fillStyle(0x1a2235, 1).fillRect(x - 8, y - 2, 16, 8); g.fillStyle(0x2fbf5a, 1).fillRect(x - 6, y - 6, 12, 4);
        break;
      case "turnstile":
        g.fillStyle(MET, 1).fillRect(x - 8, y - 2, 16, 5); g.fillStyle(MET_L, 1).fillRect(x - 8, y - 2, 16, 1);
        g.lineStyle(2, MET_L, 1).lineBetween(x - 5, y, x + 5, y - 8); // arm
        g.fillStyle(0x39ff88, 0.9).fillRect(x - 1, y + 3, 2, 2);
        break;
      case "bench":
        g.fillStyle(0x2a3142, 1).fillRect(x - 9, y - 2, 18, 3); g.fillStyle(0x1a2030, 1).fillRect(x - 8, y + 1, 2, 4).fillRect(x + 6, y + 1, 2, 4);
        break;
      case "track":
        g.fillStyle(0x0a0c12, 1).fillRect(x - 12, y - 4, 24, 10); // pit
        g.fillStyle(MET, 1).fillRect(x - 11, y - 1, 24, 2).fillRect(x - 11, y + 3, 24, 2); // rails
        glow(0x29e7ff, 0.7, 0.18);
        break;
      case "scoreboard":
        g.fillStyle(DARK, 1).fillRect(x - 14, y - 5, 28, 10); g.fillStyle(0xff3b6b, 0.9).fillRect(x - 12, y - 3, 11, 6); g.fillStyle(0x29e7ff, 0.9).fillRect(x + 1, y - 3, 11, 6);
        glow(0xff3b6b, 1.0, 0.4);
        break;
      case "banner":
        g.fillStyle(0xff3b6b, 0.9).fillRect(x - 3, y - 10, 6, 18); g.fillStyle(0xffffff, 0.6).fillRect(x - 2, y - 8, 4, 3);
        break;
      case "barrier":
        g.fillStyle(0xffb13c, 1).fillRect(x - 9, y - 3, 18, 5); for (let i = 0; i < 4; i++) g.fillStyle(0x15121d, 1).fillRect(x - 8 + i * 5, y - 3, 2, 5);
        break;
      case "arenamark":
        g.lineStyle(2, 0xff3b6b, 0.7).strokeCircle(x, y, 14); g.lineStyle(2, 0xff3b6b, 0.5).strokeCircle(x, y, 8);
        break;
      case "fountain":
        g.fillStyle(0x14243a, 1).fillCircle(x, y, 14); g.fillStyle(0x29e7ff, 0.45).fillCircle(x, y, 11); g.fillStyle(MET_L, 1).fillCircle(x, y, 3);
        glow(0x29e7ff, 1.1, 0.4);
        break;
      case "directory":
        g.fillStyle(DARK, 1).fillRect(x - 5, y - 8, 10, 12); g.fillStyle(0x4d8cff, 0.9).fillRect(x - 4, y - 7, 8, 8); g.fillStyle(MET, 1).fillRect(x - 2, y + 4, 4, 3);
        glow(0x4d8cff, 0.7, 0.3);
        break;
    }
  }

  private leaveInterior() {
    this.transitioning = true;
    const back = this.returnTile;
    const payload: CityEnter = { returnTo: back ? [back[0], back[1] + 1] : undefined };
    this.cameras.main.fadeOut(220, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.restart(payload));
  }

  private buildHud(title: string) {
    this.add
      .text(14, 12, "METROPHAGE  ·  " + title, {
        fontFamily: "Courier New, monospace",
        fontSize: "15px",
        color: "#00e5ff",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(1000)
      .setShadow(0, 0, "#ff2bd6", 5, true, true);
    this.add
      .text(14, 34, this.mode === "interior" ? "WASD move  ·  ESC / exit door to leave" : "WASD move  ·  walk into a door to enter  ·  ESC leave", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#6b7184",
      })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  /** City rain + drifting fog + holographic shop-signage over the storefronts.
   *  City mode only — interiors stay dry. */
  private createAtmosphere(worldW: number, worldH: number) {
    if (this.mode !== "city" || !this.cityMap) return;
    this.atmosphere = new Atmosphere(this, {
      weather: "rain",
      accent: COLORS.neonCyan,
      worldW,
      worldH,
    });
    const accents = [COLORS.neonMagenta, COLORS.neonCyan, COLORS.neonYellow, COLORS.neonGreen];
    let h = 0;
    for (const b of this.cityMap.buildings) {
      if (!b.door || h >= 10) continue;
      this.atmosphere.addHologram(b.door[0] * TILE + TILE / 2, b.door[1] * TILE + TILE / 2 - 6, accents[h % accents.length]);
      h++;
    }
  }

  private applyNeon() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon");
    this.neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline;
    if (this.neon) {
      this.neon.tint = this.mode === "interior" ? [1, 0.7, 0.2] : [0, 0.9, 1];
      this.neon.tintAmt = this.mode === "interior" ? 0.1 : 0.16;
    }
  }

  private exitTo(scene: string) {
    this.transitioning = true;
    this.cameras.main.fadeOut(250, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start(scene));
  }
}
