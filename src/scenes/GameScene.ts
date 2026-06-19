import Phaser from "phaser";
import {
  TILE,
  WORLD_W,
  WORLD_H,
  COLORS,
  BULLET,
  ENEMY_BULLET,
  HEAT,
} from "../config";
import { buildGrid, spawnPoint, isWall, TILE_WALL, TileGrid } from "../world/district";
import { TILESET_KEY } from "../assets/manifest";
import Player, { PlayerInput } from "../entities/Player";
import Bullets from "../entities/Bullets";
import TuringCop from "../entities/TuringCop";
import Heat from "../systems/Heat";
import NeonPipeline from "../render/NeonPipeline";

/**
 * GameScene — Phase 0.
 * Step 1: movable, colliding player. Step 2: mouse-aim, dash, projectile weapon.
 * Step 3: Turing Cops with a patrol->chase->attack FSM that take damage and die.
 */
export default class GameScene extends Phaser.Scene {
  private player!: Player;
  private bullets!: Bullets; // player weapon
  private enemyBullets!: Bullets; // hostile fire
  private enemies!: Phaser.Physics.Arcade.Group;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private grid!: TileGrid;
  private spawn = { x: 0, y: 0 };

  private heat = new Heat();
  private neon?: NeonPipeline;
  private hud!: Phaser.GameObjects.Graphics;
  private heatLabel!: Phaser.GameObjects.Text;

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
    this.setupProjectiles();
    this.setupEnemies();
    this.setupCamera();
    this.setupPostFX();
    this.setupInput();
    this.addHint();
  }

  private setupPostFX() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon");
    this.neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline;
  }

  private buildDistrict() {
    this.grid = buildGrid();
    const map = this.make.tilemap({
      data: this.grid,
      tileWidth: TILE,
      tileHeight: TILE,
    });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE, TILE)!;
    this.wallLayer = map.createLayer(0, tileset, 0, 0)!;
    this.wallLayer.setCollision(TILE_WALL);

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    this.spawn = spawnPoint(this.grid);
  }

  private spawnPlayer() {
    this.player = new Player(this, this.spawn.x, this.spawn.y);
    this.physics.add.collider(this.player, this.wallLayer);
  }

  private setupProjectiles() {
    this.bullets = new Bullets(this);
    this.enemyBullets = new Bullets(this, {
      speed: ENEMY_BULLET.speed,
      lifetimeMs: ENEMY_BULLET.lifetimeMs,
      radius: ENEMY_BULLET.radius,
      maxActive: ENEMY_BULLET.maxActive,
      tint: ENEMY_BULLET.tint,
    });

    this.physics.add.collider(
      this.bullets.group,
      this.wallLayer,
      (b) => this.onBulletHitWall(this.bullets, b as Phaser.Physics.Arcade.Image),
      undefined,
      this,
    );
    this.physics.add.collider(
      this.enemyBullets.group,
      this.wallLayer,
      (b) =>
        this.onBulletHitWall(this.enemyBullets, b as Phaser.Physics.Arcade.Image),
      undefined,
      this,
    );
  }

  private setupEnemies() {
    this.enemies = this.physics.add.group();
    this.spawnCops();

    this.physics.add.collider(this.enemies, this.wallLayer);
    this.physics.add.overlap(
      this.bullets.group,
      this.enemies,
      (b, c) =>
        this.onBulletHitsCop(
          b as Phaser.Physics.Arcade.Image,
          c as TuringCop,
        ),
      undefined,
      this,
    );
    // NOTE: pass (player, group) so the callback args are unambiguous — Phaser
    // swaps a (group, sprite) overlap to sprite-vs-group internally.
    this.physics.add.overlap(
      this.player,
      this.enemyBullets.group,
      (_p, b) => this.onEnemyBulletHitsPlayer(b as Phaser.Physics.Arcade.Image),
      undefined,
      this,
    );
  }

  private spawnCops() {
    // Hand-picked patrol posts; validated against the grid so none spawn in a wall.
    const posts: Array<[number, number]> = [
      [13, 5],
      [27, 6],
      [34, 11],
      [27, 16],
      [8, 16],
      [20, 27],
      [13, 23],
    ];
    let placed = 0;
    for (const [tx, ty] of posts) {
      if (placed >= 5) break;
      if (this.grid[ty]?.[tx] === undefined || isWall(this.grid[ty][tx])) continue;
      const cop = new TuringCop(
        this,
        tx * TILE + TILE / 2,
        ty * TILE + TILE / 2,
      );
      this.enemies.add(cop);
      placed++;
    }
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

    // Temporary Heat gauge (replaced by the full HUD in Step 7).
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(1000);
    this.heatLabel = this.add
      .text(18, 38, "HEAT 0", {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#ff2bd6",
      })
      .setScrollFactor(0)
      .setDepth(1001);
  }

  private drawHud() {
    const x = 18;
    const y = 54;
    const w = 180;
    const n = this.heat.normalized;
    const buff = this.heat.buffActive;

    this.hud.clear();
    this.hud.fillStyle(0x1a0a1e, 0.85).fillRect(x, y, w, 8);
    this.hud
      .fillStyle(buff ? COLORS.neonYellow : COLORS.neonMagenta, 1)
      .fillRect(x + 1, y + 1, (w - 2) * n, 6);
    // threshold tick at 50
    this.hud
      .fillStyle(COLORS.neonCyan, 0.8)
      .fillRect(x + (w - 2) * 0.5, y - 1, 1, 10);

    this.heatLabel
      .setText(`HEAT ${Math.round(this.heat.value)}${buff ? "  ⚡OVERCLOCK" : ""}`)
      .setColor(buff ? "#f7ff3c" : "#ff2bd6");
  }

  update(_time: number, delta: number) {
    const now = this.time.now;

    // HEAT: decay when passive, apply overclock buff, drive the post-FX.
    this.heat.update(now, delta);
    this.player.speedMult = this.heat.speedMult;
    if (this.neon) this.neon.heat = this.heat.normalized;

    const input = this.readInput();
    this.player.step(input);

    const angle = this.player.tryFire(input);
    if (angle !== null) this.fireWeapon(angle);

    this.bullets.update(now);
    this.enemyBullets.update(now);

    this.enemies.getChildren().forEach((go) => {
      const cop = go as TuringCop;
      if (cop.active && !cop.isDead) {
        cop.step(this.player, (x, y, a) =>
          this.enemyBullets.fire(x + Math.cos(a) * 16, y + Math.sin(a) * 16, a),
        );
      }
    });

    this.drawHud();
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
    this.cameras.main.shake(40, 0.0018);
  }

  private onBulletHitWall(manager: Bullets, bullet: Phaser.Physics.Arcade.Image) {
    const { x, y } = bullet;
    manager.kill(bullet);
    this.spark(x, y, COLORS.spark, 2);
  }

  private onBulletHitsCop(bullet: Phaser.Physics.Arcade.Image, cop: TuringCop) {
    if (!cop.active || cop.isDead) return;
    this.bullets.kill(bullet);
    this.spark(bullet.x, bullet.y, COLORS.enemyEdge, 1.6);

    const dmg = BULLET.damage * this.heat.damageMult; // overclock hits harder
    const killed = cop.hurt(dmg);
    this.heat.add(dmg * HEAT.perDamage, this.time.now);
    if (killed) this.heat.add(HEAT.perKill, this.time.now);
    // (Singularity gain on kills is wired in Step 5.)
  }

  private onEnemyBulletHitsPlayer(bullet: Phaser.Physics.Arcade.Image) {
    this.enemyBullets.kill(bullet);
    if (this.player.invulnerable) return; // negated by dash / respawn i-frames
    const died = this.player.applyDamage(ENEMY_BULLET.damage);
    this.cameras.main.shake(60, 0.004);
    if (died) this.respawnPlayer();
  }

  private respawnPlayer() {
    this.player.respawn(this.spawn.x, this.spawn.y);
    this.cameras.main.flash(220, 60, 0, 24);
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

  private spark(x: number, y: number, color: number, scale: number) {
    const s = this.add.circle(x, y, 5, color, 1).setDepth(11);
    this.tweens.add({
      targets: s,
      scale,
      alpha: 0,
      duration: 140,
      onComplete: () => s.destroy(),
    });
  }
}
