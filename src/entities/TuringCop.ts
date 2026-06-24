import Phaser from "phaser";
import { COLORS } from "../config";
import { COP_KEY } from "../assets/manifest";
import { driveChar } from "../assets/anim";
import { EnemyTierDef, ENEMY_TIERS, EnemyHost } from "../game/enemies";

export enum CopState {
  Patrol = "patrol",
  Chase = "chase",
  Attack = "attack",
}

/**
 * Human Security System unit. One class, driven by an EnemyTierDef:
 *  - Patrol: grunt, ranged shot.
 *  - Enforcer: shielded (break first; WINTERMUTE counters), kites, ranged.
 *  - Purge Unit: heavy/high-HP, telegraphed slam.
 * FSM: PATROL -> CHASE -> ATTACK, falling back as the player escapes.
 */
export default class TuringCop extends Phaser.Physics.Arcade.Sprite {
  readonly tier: EnemyTierDef;
  hp: number;
  maxHp: number;
  shield: number;
  state: CopState = CopState.Patrol;

  private home: Phaser.Math.Vector2;
  private patrolTarget: Phaser.Math.Vector2;
  private nextAttackAt = 0;
  private repathAt = 0;
  private dead = false;
  private disabledUntil = 0;
  private staggerUntil = 0;
  private shieldArc?: Phaser.GameObjects.Arc;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    tier: EnemyTierDef = ENEMY_TIERS.patrol,
  ) {
    super(scene, x, y, COP_KEY);
    this.tier = tier;
    this.hp = tier.hp;
    this.maxHp = tier.hp;
    this.shield = tier.shieldHp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setDepth(8);
    this.setScale(tier.scale);
    this.applyTierTint();
    const r = tier.bodyRadius;
    (this.body as Phaser.Physics.Arcade.Body).setCircle(r, 16 - r, 18 - r);

    this.home = new Phaser.Math.Vector2(x, y);
    this.patrolTarget = this.home.clone();
    this.pickPatrolTarget();

    if (this.shield > 0) {
      this.shieldArc = scene.add
        .circle(x, y, tier.bodyRadius * tier.scale + 9, 0x6ab0ff, 0.08)
        .setStrokeStyle(2, 0x6ab0ff, 0.7)
        .setDepth(9);
    }
  }

  get isDead(): boolean {
    return this.dead;
  }
  get shielded(): boolean {
    return this.shield > 0;
  }

  /** NG+ scaling: multiply this unit's pools. Applied once at spawn. */
  scaleHp(mult: number) {
    this.hp = Math.round(this.hp * mult);
    this.maxHp = Math.round(this.maxHp * mult);
    if (this.shield > 0) this.shield = Math.round(this.shield * mult);
  }

  /** MENDER support pulse: restore HP up to this unit's (scaled) max. */
  heal(amount: number): boolean {
    if (this.dead || this.hp >= this.maxHp) return false;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.setTint(0x6affa0);
    this.scene.time.delayedCall(80, () => {
      if (!this.dead) this.applyTierTint();
    });
    return true;
  }

  private applyTierTint() {
    if (this.tier.tint === null) this.clearTint();
    else this.setTint(this.tier.tint);
  }

  /** Brief knockback impulse from a hit (heavier tiers resist via scale). */
  knock(dx: number, dy: number, force: number) {
    if (this.dead) return;
    const len = Math.hypot(dx, dy) || 1;
    const f = force / this.tier.scale;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity((dx / len) * f, (dy / len) * f);
    this.staggerUntil = this.scene.time.now + 110;
  }

  /** Hacked: stunned + shield dropped (WINTERMUTE's Hack Cone). */
  disable(ms: number) {
    if (this.dead) return;
    this.disabledUntil = Math.max(this.disabledUntil, this.scene.time.now + ms);
    if (this.shield > 0) this.breakShield();
    this.setTint(0x29e7ff);
  }

  step(player: Phaser.Physics.Arcade.Sprite, host: EnemyHost) {
    if (this.dead) return;
    const now = this.scene.time.now;
    if (this.shieldArc) this.shieldArc.setPosition(this.x, this.y);

    if (now < this.disabledUntil) {
      this.setVelocity(0, 0);
      return; // hacked: frozen
    }
    if (now < this.staggerUntil) {
      (this.body as Phaser.Physics.Arcade.Body).velocity.scale(0.85); // ride out knockback
      return;
    }
    if (this.tintTopLeft === 0x29e7ff) this.applyTierTint(); // hack expired

    const t = this.tier;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    switch (this.state) {
      case CopState.Patrol:
        if (dist <= t.aggroRange) {
          this.state = CopState.Chase;
          break;
        }
        this.patrol(now);
        break;

      case CopState.Chase:
        if (dist > t.deAggroRange) {
          this.state = CopState.Patrol;
          this.pickPatrolTarget();
          break;
        }
        if (dist <= t.attackRange) {
          this.state = CopState.Attack;
          break;
        }
        this.moveToward(player.x, player.y, t.chaseSpeed);
        break;

      case CopState.Attack:
        if (dist > t.attackRange * 1.15) {
          this.state = CopState.Chase;
          break;
        }
        // Enforcer kites: back off if the player gets too close.
        if (t.kite && dist < t.attackRange * 0.55) {
          this.moveToward(player.x, player.y, -t.chaseSpeed);
        } else {
          this.setVelocity(0, 0);
        }
        if (now >= this.nextAttackAt) {
          this.nextAttackAt = now + t.attackCooldownMs;
          this.attackTell();
          if (t.attack === "shot") {
            const a = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
            host.enemyShot(this.x, this.y, a, t.attackDamage);
          } else if (t.attack === "heal") {
            host.enemyHeal(this.x, this.y, t.slamRadius, t.healAmount ?? 20);
          } else {
            host.enemySlam(player.x, player.y, t.slamRadius, t.attackDamage, t.slamWindupMs);
          }
        }
        break;
    }

    this.faceTarget(player);
  }

  private faceTarget(player: Phaser.Physics.Arcade.Sprite) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const moving = body.velocity.lengthSq() > 64;
    // Walking (patrol/chase): face + animate along travel. Holding/attacking: face the
    // player on the neutral stance.
    if (moving) driveChar(this, body.velocity.x, body.velocity.y, true);
    else driveChar(this, player.x - this.x, player.y - this.y, false);
  }

  private patrol(now: number) {
    const d = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      this.patrolTarget.x,
      this.patrolTarget.y,
    );
    if (d < 10 || now >= this.repathAt) this.pickPatrolTarget();
    this.moveToward(this.patrolTarget.x, this.patrolTarget.y, this.tier.patrolSpeed);
  }

  private pickPatrolTarget() {
    const ang = Math.random() * Math.PI * 2;
    const rad = 110 * (0.4 + Math.random() * 0.6);
    this.patrolTarget.set(
      this.home.x + Math.cos(ang) * rad,
      this.home.y + Math.sin(ang) * rad,
    );
    this.repathAt = this.scene.time.now + 2200 + Math.random() * 1500;
  }

  private moveToward(tx: number, ty: number, speed: number) {
    const a = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    this.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
  }

  private attackTell() {
    this.scene.tweens.add({
      targets: this,
      scaleX: this.tier.scale * 1.18,
      scaleY: this.tier.scale * 1.18,
      yoyo: true,
      duration: 80,
    });
  }

  /** Apply damage; shields absorb first (shieldMult >1 for WINTERMUTE beams). */
  hurt(dmg: number, shieldMult = 1): boolean {
    if (this.dead) return false;

    if (this.shield > 0) {
      this.shield -= dmg * shieldMult;
      this.flashShield();
      if (this.shield <= 0) {
        this.shield = 0;
        this.breakShield();
      }
      return false; // shield tanked the hit
    }

    this.hp -= dmg;
    this.setTint(0xffffff);
    this.scene.time.delayedCall(60, () => {
      if (!this.dead) this.applyTierTint();
    });
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  private flashShield() {
    if (!this.shieldArc) return;
    this.shieldArc.setStrokeStyle(3, 0xeafdff, 1);
    this.scene.time.delayedCall(70, () => this.shieldArc?.setStrokeStyle(2, 0x6ab0ff, 0.7));
  }

  private breakShield() {
    this.shield = 0;
    if (this.shieldArc) {
      const a = this.shieldArc;
      this.shieldArc = undefined;
      this.scene.tweens.add({
        targets: a,
        scale: 1.6,
        alpha: 0,
        duration: 220,
        onComplete: () => a.destroy(),
      });
    }
  }

  private die() {
    this.dead = true;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.stop();
    body.enable = false;
    this.shieldArc?.destroy();

    const burst = this.scene.add
      .circle(this.x, this.y, 8 * this.tier.scale, COLORS.enemy, 0.9)
      .setDepth(11);
    this.scene.tweens.add({
      targets: burst,
      scale: 3,
      alpha: 0,
      duration: 260,
      onComplete: () => burst.destroy(),
    });
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scale: 0.2,
      angle: this.angle + 140,
      duration: 200,
      onComplete: () => this.destroy(),
    });
  }
}
