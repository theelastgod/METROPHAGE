import Phaser from "phaser";
import { TILE, WORLD_W, WORLD_H, COLORS } from "../config";
import { buildGrid, spawnPoint, TILE_WALL } from "../world/district";
import { TILESET_KEY } from "../assets/manifest";
import Player, { PlayerInput } from "../entities/Player";
import Bullets from "../entities/Bullets";

/**
 * GameScene — Phase 0.
 * Step 1: movable, colliding player in the district.
 * Step 2: mouse-aim, dash w/ i-frames, one projectile weapon.
 */
export default class GameScene extends Phaser.Scene {
  private player!: Player;
  private bullets!: Bullets;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private spawn = { x: 0, y: 0 };

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private dashKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super("Game");
  }

  create() {
    const boot = document.getElementById("boot");
    if (boot) {
      boot.style.opacity = "0";
      window.setTimeout(() => boot.remove(), 600);
    }

    this.buildDistrict();
    this.spawnPlayer();
    this.setupCombat();
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
    this.spawn = spawnPoint(grid);
  }

  private spawnPlayer() {
    this.player = new Player(this, this.spawn.x, this.spawn.y);
    this.physics.add.collider(this.player, this.wallLayer);
  }

  private setupCombat() {
    this.bullets = new Bullets(this);
    this.physics.add.collider(
      this.bullets.group,
      this.wallLayer,
      (bullet) => this.onBulletHitWall(bullet as Phaser.Physics.Arcade.Image),
      undefined,
      this,
    );
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
    this.dashKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    // Don't let the right mouse button pop the context menu over the canvas.
    this.input.mouse?.disableContextMenu();
  }

  private addHint() {
    const txt = this.add
      .text(16, 16, "WASD MOVE · MOUSE AIM · CLICK FIRE · SPACE DASH", {
        fontFamily: "Courier New, monospace",
        fontSize: "14px",
        color: "#00e5ff",
      })
      .setScrollFactor(0)
      .setDepth(1000);
    txt.setShadow(0, 0, "#00e5ff", 8, true, true);
  }

  update() {
    const input = this.readInput();
    this.player.step(input);

    const angle = this.player.tryFire(input);
    if (angle !== null) this.fireWeapon(angle);

    this.bullets.update(this.time.now);
  }

  private readInput(): PlayerInput {
    const p = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(p.x, p.y);
    return {
      left: this.cursors.left.isDown || this.wasd.A.isDown,
      right: this.cursors.right.isDown || this.wasd.D.isDown,
      up: this.cursors.up.isDown || this.wasd.W.isDown,
      down: this.cursors.down.isDown || this.wasd.S.isDown,
      dash: Phaser.Input.Keyboard.JustDown(this.dashKey),
      fire: p.isDown,
      aimX: world.x,
      aimY: world.y,
    };
  }

  private fireWeapon(angle: number) {
    const sx = this.player.x + Math.cos(angle) * 14;
    const sy = this.player.y + Math.sin(angle) * 14;
    this.bullets.fire(sx, sy, angle);
    this.muzzleFlash(sx, sy);
    this.cameras.main.shake(40, 0.0018); // small kick; real hit-stop lands in Step 9
  }

  private muzzleFlash(x: number, y: number) {
    const f = this.add.circle(x, y, 6, COLORS.bullet, 0.9).setDepth(11);
    this.tweens.add({
      targets: f,
      scale: 0,
      alpha: 0,
      duration: 90,
      onComplete: () => f.destroy(),
    });
  }

  private onBulletHitWall(bullet: Phaser.Physics.Arcade.Image) {
    const { x, y } = bullet;
    this.bullets.kill(bullet);
    const s = this.add.circle(x, y, 5, COLORS.spark, 1).setDepth(11);
    this.tweens.add({
      targets: s,
      scale: 2,
      alpha: 0,
      duration: 140,
      onComplete: () => s.destroy(),
    });
  }
}
