import Phaser from "phaser";
import { PLAYER, COLORS, SHIELD } from "../config";
import { PLAYER_KEY, playerKeyFor } from "../assets/manifest";
import { driveChar } from "../assets/anim";
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
  maxShield = 0;
  shield = 0;
  private shieldRegenAt = 0;
  /** Movement multiplier applied by the scene from Heat (overclock buff). */
  speedMult = 1;
  /** Persistent move-speed bonus from skills/gear (1 = none). */
  bonusSpeedMult = 1;
  /** Ability / ultimate cooldown timestamps (scene-managed). */
  nextAbilityAt = 0;
  nextUltAt = 0;
  /** Primary fire cadence — defaults to the class primary, overridden by an equipped weapon. */
  fireRateMs: number;

  private dashUntil = 0;
  private dashReadyAt = 0;
  private invulnUntil = 0;
  private nextFireAt = 0;
  private firedAt = -1e9; // for the fire-recoil squash
  private dashVx = 0;
  private dashVy = 0;
  private lastGhostAt = 0;
  /** Neutral tint the sprite returns to after a flash. The custom sprite is baked in
   *  its FINAL colours, so this is white (identity) — flashes restore the baked look. */
  private baseTint = 0xffffff;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    classDef: ClassDef,
    opts?: { textureKey?: string; color?: number },
  ) {
    // Prefer a custom sprite, then the per-class sprite, then the default.
    const fallback = playerKeyFor(classDef.id);
    const key =
      opts?.textureKey && scene.textures.exists(opts.textureKey)
        ? opts.textureKey
        : scene.textures.exists(fallback)
          ? fallback
          : PLAYER_KEY;
    super(scene, x, y, key);
    this.classDef = classDef;
    this.maxHp = classDef.maxHp;
    this.hp = classDef.maxHp;
    this.fireRateMs = classDef.primary.fireRateMs;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.baseTint = opts?.color ?? 0xffffff;
    this.setTint(this.baseTint);
    this.setCollideWorldBounds(true);
    this.setDepth(10);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(9, 7, 9);
  }

  /** Base display scale — keeps the runner legible against dense neon floors. */
  private static readonly BASE_SCALE = 1.18;

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

    // Aim angle drives the facing; the walk cycle plays while moving (set below).
    const aim = Phaser.Math.Angle.Between(this.x, this.y, input.aimX, input.aimY);

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

    // Breathing / step bob + fire recoil — visual squash only (kept tiny so the
    // physics body is effectively unchanged).
    const moving = (this.body as Phaser.Physics.Arcade.Body).velocity.lengthSq() > 900;
    // Facing follows the aim; legs/arms cycle while moving (or dashing).
    driveChar(this, Math.cos(aim), Math.sin(aim), moving);
    const s = Math.sin(now * (moving ? 0.02 : 0.006));
    const B = Player.BASE_SCALE;
    let sx = B * (1 - s * (moving ? 0.05 : 0.02));
    let sy = B * (1 + s * (moving ? 0.1 : 0.045));
    const since = now - this.firedAt;
    if (since < 130) {
      const k = 1 - since / 130;
      sx -= 0.13 * B * k;
      sy += 0.11 * B * k;
    }
    this.setScale(sx, sy);
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
    this.nextFireAt = now + this.fireRateMs;
    this.firedAt = now; // trigger the recoil squash
    return Phaser.Math.Angle.Between(this.x, this.y, input.aimX, input.aimY);
  }

  /** Update max shield from gear; grant newly-added shield immediately. */
  setMaxShield(value: number) {
    const added = value - this.maxShield;
    this.maxShield = value;
    if (added > 0) this.shield = Math.min(value, this.shield + added);
    if (this.shield > value) this.shield = value;
  }

  /** Regenerate shields after a safe window. */
  tickShield(now: number, dtMs: number) {
    if (this.maxShield <= 0 || this.shield >= this.maxShield) return;
    if (now >= this.shieldRegenAt) {
      this.shield = Math.min(this.maxShield, this.shield + SHIELD.regenPerSec * (dtMs / 1000));
    }
  }

  /** Take damage (shield absorbs first) unless invulnerable. Returns true if it killed. */
  applyDamage(dmg: number): boolean {
    if (this.invulnerable) return false;
    this.shieldRegenAt = this.scene.time.now + SHIELD.regenDelayMs;
    let rem = dmg;
    if (this.shield > 0) {
      const used = Math.min(this.shield, rem);
      this.shield -= used;
      rem -= used;
    }
    if (rem > 0) this.hp = Math.max(0, this.hp - rem);
    this.invulnUntil = this.scene.time.now + PLAYER.hitIframeMs;
    this.setTint(COLORS.hurt);
    this.scene.time.delayedCall(90, () => this.setTint(this.baseTint));
    return this.hp <= 0;
  }

  respawn(x: number, y: number) {
    this.hp = this.maxHp;
    this.shield = this.maxShield;
    this.setPosition(x, y);
    this.setVelocity(0, 0);
    this.setTint(this.baseTint);
    this.invulnUntil = this.scene.time.now + 1200; // brief grace on respawn
  }

  private spawnAfterimage() {
    const ghost = this.scene.add
      .image(this.x, this.y, this.texture.key, this.frame.name)
      .setDepth(9)
      .setAlpha(0.4)
      .setTint(this.baseTint);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 220,
      onComplete: () => ghost.destroy(),
    });
  }
}
