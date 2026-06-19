import Phaser from "phaser";
import { COP, COLORS } from "../config";
import { COP_KEY, faceFrame } from "../assets/manifest";

export enum CopState {
  Patrol = "patrol",
  Chase = "chase",
  Attack = "attack",
}

/** Called by a cop to spawn a hostile projectile from (x,y) along angle. */
export type FireFn = (x: number, y: number, angle: number) => void;

/**
 * Turing Cop — the Human Security System grunt.
 * FSM: PATROL (wander near spawn) -> CHASE (player in aggro range) ->
 * ATTACK (in range: stop and fire on a cooldown). Falls back down the chain
 * as the player escapes. Takes damage from player bullets; dies, drops nothing.
 */
export default class TuringCop extends Phaser.Physics.Arcade.Sprite {
  hp: number = COP.hp;
  state: CopState = CopState.Patrol; // public for debug/tests

  private home: Phaser.Math.Vector2;
  private patrolTarget: Phaser.Math.Vector2;
  private nextAttackAt = 0;
  private repathAt = 0;
  private dead = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, COP_KEY);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setDepth(8);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(9, 7, 9);
    this.home = new Phaser.Math.Vector2(x, y);
    this.patrolTarget = this.home.clone();
    this.pickPatrolTarget();
  }

  get isDead(): boolean {
    return this.dead;
  }

  /** Advance the FSM one frame against the player target. */
  step(player: Phaser.Physics.Arcade.Sprite, fire: FireFn) {
    if (this.dead) return;
    const now = this.scene.time.now;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    switch (this.state) {
      case CopState.Patrol:
        if (dist <= COP.aggroRange) {
          this.state = CopState.Chase;
          break;
        }
        this.patrol(now);
        break;

      case CopState.Chase:
        if (dist > COP.deAggroRange) {
          this.state = CopState.Patrol;
          this.pickPatrolTarget();
          break;
        }
        if (dist <= COP.attackRange) {
          this.state = CopState.Attack;
          break;
        }
        this.moveToward(player.x, player.y, COP.chaseSpeed);
        break;

      case CopState.Attack:
        this.setVelocity(0, 0);
        if (dist > COP.attackRange * 1.15) {
          this.state = CopState.Chase;
          break;
        }
        if (now >= this.nextAttackAt) {
          const a = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
          fire(this.x, this.y, a);
          this.nextAttackAt = now + COP.attackCooldownMs;
          this.attackTell();
        }
        break;
    }

    this.faceTarget(player);
  }

  private faceTarget(player: Phaser.Physics.Arcade.Sprite) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    // Directional sheet (0=down 1=left 2=right 3=up): patrol faces travel, else player.
    if (this.state === CopState.Patrol && body.velocity.lengthSq() > 1) {
      this.setFrame(faceFrame(body.velocity.x, body.velocity.y));
    } else {
      this.setFrame(faceFrame(player.x - this.x, player.y - this.y));
    }
  }

  private patrol(now: number) {
    const d = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      this.patrolTarget.x,
      this.patrolTarget.y,
    );
    if (d < 10 || now >= this.repathAt) this.pickPatrolTarget();
    this.moveToward(this.patrolTarget.x, this.patrolTarget.y, COP.patrolSpeed);
  }

  private pickPatrolTarget() {
    const ang = Math.random() * Math.PI * 2;
    const rad = COP.patrolRadius * (0.4 + Math.random() * 0.6);
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
      scaleX: 1.25,
      scaleY: 1.25,
      yoyo: true,
      duration: 70,
    });
  }

  /** Apply damage; returns true if this hit killed the cop. */
  hurt(dmg: number): boolean {
    if (this.dead) return false;
    this.hp -= dmg;
    this.setTint(0xffffff);
    this.scene.time.delayedCall(60, () => {
      if (!this.dead) this.clearTint();
    });
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  private die() {
    this.dead = true;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.stop();
    body.enable = false;

    const burst = this.scene.add
      .circle(this.x, this.y, 8, COLORS.enemy, 0.9)
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
