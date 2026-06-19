import Phaser from "phaser";
import { MINION } from "../config";
import { AGENT_KEY } from "../assets/manifest";
import TuringCop from "./TuringCop";

/**
 * Ally minion — spawned by WINTERMUTE drones / SWARM. Hunts the nearest cop and
 * melees on a cooldown; self-despawns after its lifetime. Driven by the scene
 * (step) like cops/agents.
 */
export default class Minion extends Phaser.Physics.Arcade.Sprite {
  private dmg: number;
  private nextAttackAt = 0;
  private dead = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    lifeMs: number,
    tint: number,
    dmg: number,
  ) {
    super(scene, x, y, AGENT_KEY);
    this.dmg = dmg;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setTint(tint);
    this.setScale(0.85);
    this.setDepth(9);
    this.setCollideWorldBounds(true);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(7, 2, 6);

    scene.time.delayedCall(lifeMs, () => this.expire());
  }

  get isDead(): boolean {
    return this.dead;
  }

  step(now: number, cops: TuringCop[], hit: (cop: TuringCop, dmg: number) => void) {
    if (this.dead) return;

    let nearest: TuringCop | null = null;
    let nd: number = MINION.aggroRange;
    for (const c of cops) {
      if (!c.active || c.isDead) continue;
      const d = Phaser.Math.Distance.Between(this.x, this.y, c.x, c.y);
      if (d < nd) {
        nd = d;
        nearest = c;
      }
    }

    if (!nearest) {
      this.setVelocity(0, 0);
      return;
    }

    if (nd <= MINION.meleeRange) {
      this.setVelocity(0, 0);
      if (now >= this.nextAttackAt) {
        this.nextAttackAt = now + MINION.attackCooldownMs;
        hit(nearest, this.dmg);
        this.scene.tweens.add({
          targets: this,
          scaleX: 1.05,
          scaleY: 1.05,
          yoyo: true,
          duration: 70,
        });
      }
    } else {
      const a = Phaser.Math.Angle.Between(this.x, this.y, nearest.x, nearest.y);
      this.setVelocity(Math.cos(a) * MINION.speed, Math.sin(a) * MINION.speed);
    }
  }

  private expire() {
    if (this.dead) return;
    this.dead = true;
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scale: 0.3,
      duration: 260,
      onComplete: () => this.destroy(),
    });
  }
}
