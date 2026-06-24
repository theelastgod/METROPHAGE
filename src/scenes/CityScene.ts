import Phaser from "phaser";
import { TILE, COLORS, NPC } from "../config";
import { TILESET_KEY, PORTRAIT_NPC_KEY, GLOW_KEY } from "../assets/manifest";
import { COLLIDING_TILES, isWall } from "../world/district";
import { buildCity, buildInterior, type CityMap, type CityBuilding, type BuildingKind } from "../world/city";
import Player from "../entities/Player";
import CityNpc from "../entities/CityNpc";
import DialogueBox from "../ui/DialogueBox";
import { KEY_NPCS, CITIZENS } from "../game/cityNpcs";
import { CityQuests, type TalkResult } from "../game/cityQuests";
import { loadSave, writeSave } from "../systems/Save";
import Inventory from "../systems/Inventory";
import { rollItem, makeExoticWeaponItem } from "../game/items";
import { getWeapon } from "../game/weapons";
import { fmtMetro, metroUsdLabel } from "../economy/metro";
import BlackMarketPanel from "../ui/BlackMarketPanel";
import NeonPipeline from "../render/NeonPipeline";
import Atmosphere from "../render/Atmosphere";
import { shadeWalls } from "../render/wallShade";
import { getClass } from "../game/classes";
import { sanitizeCustomization, bakeCustomPlayer, PLAYER_CUSTOM_KEY, type Customization } from "../game/customization";

/** Scene-restart payload: enter a building interior, or return to the city. */
interface CityEnter {
  interior?: { kind: BuildingKind; returnTile: [number, number] };
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

  constructor() {
    super("City");
  }

  create(data?: CityEnter) {
    this.transitioning = false;
    this.doors.clear();
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
      this.cameras.main.setZoom(1);
      this.cameras.main.setBounds(0, 0, worldW, worldH);
    } else {
      this.cameras.main.removeBounds();
      this.cameras.main.setZoom(1.35);
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
      this.placeCityNpcs();
      this.spawnCollectibles();
      this.setupBlackMarket();
    }
    this.input.keyboard!.on("keydown-E", () => this.tryTalk());
    this.input.keyboard!.on("keydown-J", () => this.toggleJournal());
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
    this.walletText.setText(`${this.quests.credits}c   ${this.quests.xp} XP   ◈ ${fmtMetro(metro)} $METRO (${metroUsdLabel(metro)})`);
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
      buy: (weaponId) => this.buyExotic(weaponId),
    });

    // persistent corner hint so it's discoverable even before you find the stall
    this.add
      .text(160, 50, "·  B black market", { fontFamily: "Courier New, monospace", fontSize: "11px", color: "#ff79c6" })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  /** Buy an exotic against the shared save: deduct $METRO, drop the weapon in the bag. */
  private buyExotic(weaponId: string): "ok" | "poor" | "full" | "nochar" {
    const save = loadSave();
    if (!save) return "nochar";
    const price = getWeapon(weaponId)?.metro ?? 0;
    const metro = save.progress.metro ?? 0;
    if (metro < price) return "poor";
    const inv = new Inventory();
    inv.load(save.inventory);
    if (inv.full) return "full";
    const item = makeExoticWeaponItem(weaponId, save.progress.level ?? 1);
    if (!inv.add(item)) return "full";
    save.progress.metro = metro - price;
    save.inventory = inv.toData();
    writeSave(save);
    this.refreshWallet();
    this.toast(`◈ ${item.name} → bag`);
    return "ok";
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

  private placeCityNpcs() {
    if (!this.cityMap) return;
    const spots = this.cityMap.npcSpots;
    const roster = [...KEY_NPCS, ...CITIZENS];
    for (let i = 0; i < roster.length && i < spots.length; i++) {
      const [tx, ty] = spots[i];
      this.npcs.push(new CityNpc(this, tx * TILE + TILE / 2, ty * TILE + TILE / 2, roster[i]));
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
    this.showTalk(this.quests.onTalk(n.id, n.name, n.def.lines, n.def.quest));
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
    if (this.transitioning) return;
    if (this.dialogue.isOpen || this.market?.isOpen) {
      this.player.setVelocity(0, 0);
      return; // freeze while talking / shopping
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
      if (this.time.now >= this.enterCooldownUntil) {
        const b = this.doors.get(tx + "," + ty);
        if (b?.door) this.enterInterior(b);
      }
    } else if (this.exitTile && tx === this.exitTile[0] && ty === this.exitTile[1]) {
      this.leaveInterior();
    }
  }

  private enterInterior(b: CityBuilding) {
    this.transitioning = true;
    const payload: CityEnter = { interior: { kind: b.kind, returnTile: b.door! } };
    this.cameras.main.fadeOut(220, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.restart(payload));
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
      .setShadow(0, 0, "#ff2bd6", 10, true, true);
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
