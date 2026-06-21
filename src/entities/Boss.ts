import Phaser from "phaser";
import { COP_KEY, faceFrame } from "../assets/manifest";
import { EnemyHost } from "../game/enemies";
import { BossDef } from "../game/bosses";
import { juiceShake } from "../systems/juice";

/**
 * District boss. Implements the same surface GameScene uses on a TuringCop
 * (isDead/shielded/hurt/tier/knock/disable/step), so it can live in the `enemies`
 * group and reuse every bullet / beam / ability / minion hook for free. Runs a
 * phased fight: ranged volleys + telegraphed slams, then enrages (faster, full-ring
 * volleys, summons adds) once HP crosses the threshold. The scene watches for its
 * death (instanceof Boss) to unlock the node and pay out.
 */
export default class Boss extends Phaser.Physics.Arcade.Sprite {
  readonly def: BossDef;
  readonly maxHp: number;
  hp: number;
  enraged = false;

  private dead = false;
  private summon: (x: number, y: number, tier: string) => void;
  private nextVolleyAt = 0;
  private nextSlamAt = 0;
  private disabledUntil = 0;
  private strafeDir = Math.random() < 0.5 ? 1 : -1;
  private strafeFlipAt = 0;
  private aura: Phaser.GameObjects.Arc;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    def: BossDef,
    hp: number,
    summon: (x: number, y: number, tier: string) => void,
  ) {
    super(scene, x, y, COP_KEY);
    this.def = def;
    this.maxHp = hp;
    this.hp = hp;
    this.summon = summon;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(8).setScale(def.scale).setTint(def.tint);
    this.setCollideWorldBounds(true);
    const r = def.bodyRadius;
    (this.body as Phaser.Physics.Arcade.Body).setCircle(r, 16 - r, 18 - r);

    this.nextVolleyAt = scene.time.now + 700;
    this.nextSlamAt = scene.time.now + 1600;
    this.strafeFlipAt = scene.time.now + 1500;

    // Menacing aura ring.
    this.aura = scene.add
      .circle(x, y, def.bodyRadius * def.scale + 10, def.tint, 0.07)
      .setStrokeStyle(2, def.tint, 0.55)
      .setDepth(7);
    scene.tweens.add({
      targets: this.aura,
      scale: { from: 0.96, to: 1.12 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  get isDead(): boolean {
    return this.dead;
  }
  get shielded(): boolean {
    return false; // no breakable shield; pure HP + phases
  }
  /** Reward surface read by GameScene (kept shaped like an EnemyTierDef). */
  get tier() {
    return { id: "boss", name: this.def.name, xp: this.def.xp, credits: this.def.credits };
  }

  /** Bosses are immovable — ignore knockback. */
  knock() {
    /* no-op */
  }

  /** Hacks barely faze a boss: a brief stagger, capped. */
  disable(ms: number) {
    if (this.dead) return;
    this.disabledUntil = Math.max(this.disabledUntil, this.scene.time.now + Math.min(ms, 500));
    this.setTint(0x29e7ff);
  }

  step(player: Phaser.Physics.Arcade.Sprite, host: EnemyHost) {
    if (this.dead) return;
    const now = this.scene.time.now;
    this.aura.setPosition(this.x, this.y);

    if (now < this.disabledUntil) {
      this.setVelocity(0, 0);
      return;
    }
    if (this.tintTopLeft === 0x29e7ff) this.setTint(this.enraged ? 0xff5bbf : this.def.tint);

    const d = this.def;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const ang = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);

    // Hold preferred range, with a strafe component so it circles the player.
    let mx = 0;
    let my = 0;
    if (dist > d.preferredRange + 24) {
      mx = Math.cos(ang);
      my = Math.sin(ang);
    } else if (dist < d.preferredRange - 24) {
      mx = -Math.cos(ang);
      my = -Math.sin(ang);
    }
    const strafe = ang + (Math.PI / 2) * this.strafeDir;
    mx += Math.cos(strafe) * 0.55;
    my += Math.sin(strafe) * 0.55;
    const spd = d.speed * (this.enraged ? d.enrageSpeedMult : 1);
    const len = Math.hypot(mx, my) || 1;
    this.setVelocity((mx / len) * spd, (my / len) * spd);
    if (now >= this.strafeFlipAt) {
      this.strafeDir *= -1;
      this.strafeFlipAt = now + 1400 + Math.random() * 1200;
    }

    this.setFrame(faceFrame(player.x - this.x, player.y - this.y));

    const cdMult = this.enraged ? d.enrageCooldownMult : 1;
    if (now >= this.nextVolleyAt) {
      this.nextVolleyAt = now + d.volleyCooldownMs * cdMult;
      this.volley(ang, host);
    }
    if (dist <= d.slamRange && now >= this.nextSlamAt) {
      this.nextSlamAt = now + d.slamCooldownMs * cdMult;
      this.tell();
      host.enemySlam(player.x, player.y, d.slamRadius, d.slamDamage, d.slamWindupMs);
    }
  }

  private volley(centerAngle: number, host: EnemyHost) {
    this.tell();
    const n = this.def.volleyCount;
    if (this.enraged) {
      // Full radial ring.
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        host.enemyShot(this.x, this.y, a, this.def.shotDamage);
      }
    } else {
      // Fan toward the player.
      const spread = Phaser.Math.DegToRad(110);
      const half = spread / 2;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        host.enemyShot(this.x, this.y, centerAngle - half + t * spread, this.def.shotDamage);
      }
    }
  }

  /** Apply damage; crosses into enrage at the threshold. Returns true if killed. */
  hurt(dmg: number, _shieldMult = 1): boolean {
    if (this.dead) return false;
    this.hp -= dmg;
    this.flash();
    if (!this.enraged && this.hp <= this.maxHp * this.def.enrageAt) this.enrage();
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  private enrage() {
    this.enraged = true;
    this.setTint(0xff5bbf);
    this.aura.setStrokeStyle(3, 0xff5bbf, 0.8);
    juiceShake(this.scene, 240, 0.007);
    const flare = this.scene.add.circle(this.x, this.y, 14, 0xff5bbf, 0.5).setDepth(7);
    this.scene.tweens.add({
      targets: flare,
      scale: 6,
      alpha: 0,
      duration: 500,
      onComplete: () => flare.destroy(),
    });
    for (let i = 0; i < this.def.addCount; i++) {
      const a = (i / this.def.addCount) * Math.PI * 2 + Math.random() * 0.5;
      this.summon(this.x + Math.cos(a) * 72, this.y + Math.sin(a) * 72, this.def.addTier);
    }
  }

  private flash() {
    this.setTint(0xffffff);
    this.scene.time.delayedCall(55, () => {
      if (!this.dead) this.setTint(this.enraged ? 0xff5bbf : this.def.tint);
    });
  }

  private tell() {
    this.scene.tweens.add({
      targets: this,
      scaleX: this.def.scale * 1.1,
      scaleY: this.def.scale * 1.1,
      yoyo: true,
      duration: 90,
    });
  }

  private die() {
    this.dead = true;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.stop();
    body.enable = false;
    this.aura.destroy();

    // Capture scene + position so the staggered bursts survive this sprite's
    // own destroy() (Phaser nulls instance refs on destroy).
    const scene = this.scene;
    const dx = this.x;
    const dy = this.y;
    const tint = this.def.tint;
    const r = 12 * this.def.scale;
    for (let i = 0; i < 3; i++) {
      scene.time.delayedCall(i * 90, () => {
        const burst = scene.add
          .circle(dx + Phaser.Math.Between(-20, 20), dy + Phaser.Math.Between(-20, 20), r, tint, 0.9)
          .setDepth(11);
        scene.tweens.add({
          targets: burst,
          scale: 3,
          alpha: 0,
          duration: 320,
          onComplete: () => burst.destroy(),
        });
      });
    }
    scene.tweens.add({
      targets: this,
      alpha: 0,
      scale: this.def.scale * 0.3,
      angle: this.angle + 220,
      duration: 460,
      onComplete: () => this.destroy(),
    });
  }
}
