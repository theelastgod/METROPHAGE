import Phaser from "phaser";
import { TILE, COLORS } from "../config";
import { TILESET_KEY } from "../assets/manifest";
import { COLLIDING_TILES } from "../world/district";
import { buildCity, buildInterior, type CityMap, type CityBuilding, type BuildingKind } from "../world/city";
import Player from "../entities/Player";
import NeonPipeline from "../render/NeonPipeline";
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
  private doors = new Map<string, CityBuilding>();
  private exitTile?: [number, number];
  private returnTile?: [number, number];
  private transitioning = false;
  private enterCooldownUntil = 0;

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
    this.buildHud(title);
    this.cameras.main.fadeIn(300, 4, 2, 10);

    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.input.keyboard!.on("keydown-ESC", () => {
      if (this.transitioning) return;
      if (this.mode === "interior") this.leaveInterior();
      else this.exitTo("Select");
    });
  }

  update() {
    if (this.transitioning) return;
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
