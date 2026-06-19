import Phaser from "phaser";
import { PLAYER, COLORS } from "../config";
import { PLAYER_KEY, faceFrame } from "../assets/manifest";
import { ClassDef } from "../game/classes";

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
 * invulnerability frames, and a fire-rate-gated primary weapon. The chosen class
 * supplies stats + the primary config; the scene reads classDef.primary to fire.
 */
export default class Player extends Phaser.Physics.Arcade.Sprite {
  readonly classDef: ClassDef;
  maxHp: number;
  hp: number;
  /** Movement multiplier applied by the scene from Heat (overclock buff). */
  speedMult = 1;
  /** Persistent move-speed bonus from skills/gear (1 = none). */
  bonusSpeedMult = 1;
  /** Ability / ultimate cooldown timestamps (scene-managed). */
  nextAbilityAt = 0;
  nextUltAt = 0;

  private dashUntil = 0;
  private dashReadyAt = 0;
  private invulnUntil = 0;
  private nextFireAt = 0;
  private dashVx = 0;
  private dashVy = 0;
  private lastGhostAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, classDef: ClassDef) {
    super(scene, x, y, PLAYER_KEY);
    this.classDef = classDef;
    this.maxHp = classDef.maxHp;
    this.hp = classDef.maxHp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setTint(classDef.color);
    this.setCollideWorldBounds(true);
    this.setDepth(10);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(9, 7, 9);
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

    // Aim: face the pointer via the directional sheet (0=down 1=left 2=right 3=up).
    const aim = Phaser.Math.Angle.Between(this.x, this.y, input.aimX, input.aimY);
    this.setFrame(faceFrame(Math.cos(aim), Math.sin(aim)));

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
      dir.normalize().scale(this.classDef.speed * this.speedMult * this.bonusSpeedMult);
      this.setVelocity(dir.x, dir.y);
    } else {
      this.setVelocity(0, 0);
    }

    // i-frame flicker.
    this.setAlpha(this.invulnerable ? 0.55 : 1);
  }

  /** Update max HP from skills/gear; keep current HP within the new cap. */
  setMaxHp(value: number) {
    this.maxHp = value;
    if (this.hp > value) this.hp = value;
  }

  /** Ability-driven dash (e.g. K-GUERILLA Dash-Strike). */
  forceDash(angle: number, speed: number, durMs: number) {
    const now = this.scene.time.now;
    this.dashVx = Math.cos(angle) * speed;
    this.dashVy = Math.sin(angle) * speed;
    this.dashUntil = now + durMs;
    this.invulnUntil = Math.max(this.invulnUntil, now + durMs + 80);
    this.spawnAfterimage();
  }

  /** If firing and off cooldown, returns the aim angle. Cadence = class primary. */
  tryFire(input: PlayerInput): number | null {
    if (!input.fire) return null;
    const now = this.scene.time.now;
    if (now < this.nextFireAt) return null;
    this.nextFireAt = now + this.classDef.primary.fireRateMs;
    return Phaser.Math.Angle.Between(this.x, this.y, input.aimX, input.aimY);
  }

  /** Take damage unless invulnerable (dash i-frames negate it). Returns true if it killed. */
  applyDamage(dmg: number): boolean {
    if (this.invulnerable) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.invulnUntil = this.scene.time.now + PLAYER.hitIframeMs;
    this.setTint(COLORS.hurt);
    this.scene.time.delayedCall(90, () => this.setTint(this.classDef.color));
    return this.hp <= 0;
  }

  respawn(x: number, y: number) {
    this.hp = this.maxHp;
    this.setPosition(x, y);
    this.setVelocity(0, 0);
    this.setTint(this.classDef.color);
    this.invulnUntil = this.scene.time.now + 1200; // brief grace on respawn
  }

  private spawnAfterimage() {
    const ghost = this.scene.add
      .image(this.x, this.y, this.texture.key, this.frame.name)
      .setDepth(9)
      .setAlpha(0.4)
      .setTint(this.classDef.color);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 220,
      onComplete: () => ghost.destroy(),
    });
  }
}
