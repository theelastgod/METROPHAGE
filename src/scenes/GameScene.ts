import Phaser from "phaser";
import {
  TILE,
  WORLD_W,
  WORLD_H,
  PLAYER_SPEED,
  COLORS,
} from "../config";
import { buildGrid, spawnPoint, TILE_WALL } from "../world/district";
import { TILESET_KEY, PLAYER_KEY } from "../assets/manifest";

/**
 * GameScene — Phase 0 / Step 1: a movable, colliding player in the district.
 *
 * Movement reads input and applies velocity; the actual integration + collision
 * is Arcade Physics. World *data* (the grid) lives in world/district.ts so the
 * sim model stays separable from rendering.
 */
export default class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;

  constructor() {
    super("Game");
  }

  create() {
    // Drop the HTML boot flash now that the world is up.
    const boot = document.getElementById("boot");
    if (boot) {
      boot.style.opacity = "0";
      window.setTimeout(() => boot.remove(), 600);
    }

    this.buildDistrict();
    this.spawnPlayer();
    this.setupCamera();
    this.setupInput();
    this.addHint();
  }

  private buildDistrict() {
    const grid = buildGrid();
    const map = this.make.tilemap({
      data: grid,
      tileWidth: TILE,
      tileHeight: TILE,
    });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE, TILE)!;
    this.wallLayer = map.createLayer(0, tileset, 0, 0)!;
    this.wallLayer.setCollision(TILE_WALL);

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor(COLORS.bgVoid);

    // stash spawn for the player step
    this.registry.set("spawn", spawnPoint(grid));
  }

  private spawnPlayer() {
    const spawn = this.registry.get("spawn") as { x: number; y: number };
    this.player = this.physics.add.sprite(spawn.x, spawn.y, PLAYER_KEY);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCircle(9, 4, 4); // tighter round hitbox vs. the 26px sprite

    this.physics.add.collider(this.player, this.wallLayer);
  }

  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setZoom(1.5);
  }

  private setupInput() {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys("W,A,S,D") as typeof this.wasd;
  }

  private addHint() {
    const txt = this.add
      .text(16, 16, "WASD / ARROWS — MOVE", {
        fontFamily: "Courier New, monospace",
        fontSize: "14px",
        color: "#00e5ff",
      })
      .setScrollFactor(0)
      .setDepth(1000);
    txt.setShadow(0, 0, "#00e5ff", 8, true, true);
  }

  update() {
    this.handleMovement();
  }

  private handleMovement() {
    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;

    const dir = new Phaser.Math.Vector2(
      (right ? 1 : 0) - (left ? 1 : 0),
      (down ? 1 : 0) - (up ? 1 : 0),
    );

    if (dir.lengthSq() > 0) {
      dir.normalize().scale(PLAYER_SPEED);
      this.player.setVelocity(dir.x, dir.y);
      // face travel direction (nub points up at rotation 0)
      this.player.setRotation(Math.atan2(dir.y, dir.x) + Math.PI / 2);
    } else {
      this.player.setVelocity(0, 0);
    }
  }
}
