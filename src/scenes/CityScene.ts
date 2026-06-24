import Phaser from "phaser";
import { TILE, COLORS } from "../config";
import { TILESET_KEY } from "../assets/manifest";
import { COLLIDING_TILES } from "../world/district";
import { buildCity, type CityMap } from "../world/city";
import Player from "../entities/Player";
import NeonPipeline from "../render/NeonPipeline";
import { getClass } from "../game/classes";
import { sanitizeCustomization, bakeCustomPlayer, PLAYER_CUSTOM_KEY, type Customization } from "../game/customization";

/**
 * CityScene — the big, walkable RuneScape-style city hub. A procedural city (an avenue
 * street-grid of building blocks + plazas) far larger than the combat districts. The
 * player roams freely (no combat pressure); buildings become enterable in Step 2 and
 * NPCs hand out single-player quests in Step 3. From here the player launches into the
 * combat districts and the online world.
 */
export default class CityScene extends Phaser.Scene {
  private player!: Player;
  private cityMap!: CityMap;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private neon?: NeonPipeline;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private lastDir = new Phaser.Math.Vector2(0, 1); // facing (default: down)

  constructor() {
    super("City");
  }

  create() {
    const classDef = getClass(this.registry.get("classId") as string | undefined);
    const cust = sanitizeCustomization(
      this.registry.get("customization") as Partial<Customization> | undefined,
      classDef.id,
    );
    bakeCustomPlayer(this, cust);

    // ── build the city ──────────────────────────────────────────────
    this.cityMap = buildCity();
    const worldW = this.cityMap.w * TILE;
    const worldH = this.cityMap.h * TILE;
    const map = this.make.tilemap({ data: this.cityMap.grid, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE, TILE)!;
    this.wallLayer = map.createLayer(0, tileset, 0, 0)!;
    this.wallLayer.setCollision(COLLIDING_TILES);

    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    this.physics.world.setBounds(0, 0, worldW, worldH);

    // ── player ──────────────────────────────────────────────────────
    const [stx, sty] = this.cityMap.spawn;
    this.player = new Player(this, stx * TILE + TILE / 2, sty * TILE + TILE / 2, classDef, {
      textureKey: PLAYER_CUSTOM_KEY,
      color: 0xffffff,
    });
    this.physics.add.collider(this.player, this.wallLayer);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.applyNeon();
    this.buildHud();
    this.cameras.main.fadeIn(400, 4, 2, 10);

    // ── input ───────────────────────────────────────────────────────
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.input.keyboard!.on("keydown-ESC", () => this.exitTo("Select"));
  }

  update() {
    const left = this.wasd.A.isDown || this.cursors.left.isDown;
    const right = this.wasd.D.isDown || this.cursors.right.isDown;
    const up = this.wasd.W.isDown || this.cursors.up.isDown;
    const down = this.wasd.S.isDown || this.cursors.down.isDown;
    const dx = (right ? 1 : 0) - (left ? 1 : 0);
    const dy = (down ? 1 : 0) - (up ? 1 : 0);
    if (dx !== 0 || dy !== 0) this.lastDir.set(dx, dy); // remember facing when idle
    // face the way we move (no combat aim here)
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
  }

  private buildHud() {
    const t = this.add
      .text(14, 12, "METROPHAGE  ·  THE CITY", {
        fontFamily: "Courier New, monospace",
        fontSize: "15px",
        color: "#00e5ff",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(1000)
      .setShadow(0, 0, "#ff2bd6", 10, true, true);
    this.add
      .text(14, 34, "WASD move  ·  ESC leave", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#6b7184",
      })
      .setScrollFactor(0)
      .setDepth(1000);
    void t;
  }

  private applyNeon() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon");
    this.neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline;
    if (this.neon) {
      this.neon.tint = [0, 0.9, 1];
      this.neon.tintAmt = 0.16;
    }
  }

  private exitTo(scene: string) {
    this.cameras.main.fadeOut(250, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start(scene));
  }
}
