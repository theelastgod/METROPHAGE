import Phaser from "phaser";
import { PLAYER, COLORS } from "../config";
import { PLAYER_KEY } from "../assets/manifest";

/** Per-frame input snapshot, decoupled from the raw key/pointer objects. */
export interface PlayerInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  dash: boolean; // dash just-pressed this frame
  fire: boolean; // fire held
  aimX: number; // pointer world-x
  aimY: number; // pointer world-y
}

/**
 * Player entity: twin-stick movement (WASD move, mouse aim), a dash with
 * invulnerability frames, and a fire-rate-gated projectile weapon. Combat state
 * lives here so the scene stays thin.
 */
export default class Player extends Phaser.Physics.Arcade.Sprite {
  hp: number = PLAYER.maxHp;
  /** Movement multiplier applied by the scene from Heat (overclock buff). */
  speedMult = 1;

  private dashUntil = 0;
  private dashReadyAt = 0;
  private invulnUntil = 0;
  private nextFireAt = 0;
  private dashVx = 0;
  private dashVy = 0;
  private lastGhostAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, PLAYER_KEY);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setDepth(10);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(9, 4, 4);
  }

  get invulnerable(): boolean {
    return this.scene.time.now < this.invulnUntil;
  }
  get dashing(): boolean {
    return this.scene.time.now < this.dashUntil;
  }
  get dashReady(): boolean {
    return this.scene.time.now >= this.dashReadyAt;
  }

  /** Advance the player from an input snapshot. */
  step(input: PlayerInput) {
    const now = this.scene.time.now;

    // Aim: face the pointer (sprite nub points "up" at rotation 0).
    const aim = Phaser.Math.Angle.Between(this.x, this.y, input.aimX, input.aimY);
    this.setRotation(aim + Math.PI / 2);

    const dir = new Phaser.Math.Vector2(
      (input.right ? 1 : 0) - (input.left ? 1 : 0),
      (input.down ? 1 : 0) - (input.up ? 1 : 0),
    );

    // Begin a dash.
    if (input.dash && this.dashReady) {
      const d =
        dir.lengthSq() > 0
          ? dir.clone().normalize()
          : new Phaser.Math.Vector2(Math.cos(aim), Math.sin(aim));
      this.dashVx = d.x * PLAYER.dashSpeed;
      this.dashVy = d.y * PLAYER.dashSpeed;
      this.dashUntil = now + PLAYER.dashDurationMs;
      this.invulnUntil = now + PLAYER.dashIframeMs;
      this.dashReadyAt = now + PLAYER.dashDurationMs + PLAYER.dashCooldownMs;
      this.spawnAfterimage();
    }

    if (this.dashing) {
      this.setVelocity(this.dashVx, this.dashVy);
      if (now - this.lastGhostAt > 28) {
        this.spawnAfterimage();
        this.lastGhostAt = now;
      }
    } else if (dir.lengthSq() > 0) {
      dir.normalize().scale(PLAYER.speed * this.speedMult);
      this.setVelocity(dir.x, dir.y);
    } else {
      this.setVelocity(0, 0);
    }

    // i-frame flicker.
    this.setAlpha(this.invulnerable ? 0.55 : 1);
  }

  /** If firing and off cooldown, returns the aim angle to spawn a bullet at. */
  tryFire(input: PlayerInput): number | null {
    if (!input.fire) return null;
    const now = this.scene.time.now;
    if (now < this.nextFireAt) return null;
    this.nextFireAt = now + PLAYER.fireRateMs;
    return Phaser.Math.Angle.Between(this.x, this.y, input.aimX, input.aimY);
  }

  /** Take damage unless invulnerable (dash i-frames negate it). Returns true if it killed. */
  applyDamage(dmg: number): boolean {
    if (this.invulnerable) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.invulnUntil = this.scene.time.now + PLAYER.hitIframeMs;
    this.setTint(COLORS.hurt);
    this.scene.time.delayedCall(90, () => this.clearTint());
    return this.hp <= 0;
  }

  respawn(x: number, y: number) {
    this.hp = PLAYER.maxHp;
    this.setPosition(x, y);
    this.setVelocity(0, 0);
    this.clearTint();
    this.invulnUntil = this.scene.time.now + 1200; // brief grace on respawn
  }

  private spawnAfterimage() {
    const ghost = this.scene.add
      .image(this.x, this.y, this.texture.key)
      .setRotation(this.rotation)
      .setDepth(9)
      .setAlpha(0.4)
      .setTint(COLORS.neonCyan);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 220,
      onComplete: () => ghost.destroy(),
    });
  }
}
