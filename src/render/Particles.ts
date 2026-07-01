import Phaser from "phaser";
import { GLOW_KEY, SPARK_KEY, FX_MUZZLE_KEY, FX_IMPACT_KEY } from "../assets/manifest";
import { effectiveLowFx } from "../systems/Settings";

/**
 * Particles — pooled additive spark + glow images. Hit sparks and muzzle flashes
 * fire on nearly every frame in combat, so allocating/destroying an Image per call
 * is real GC churn; this round-robins over fixed pools instead. On the low-FX tier
 * it thins sparks and drops muzzle flashes entirely.
 */
export default class Particles {
  private scene: Phaser.Scene;
  private sparks: Phaser.GameObjects.Image[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private muzzles: Phaser.GameObjects.Image[] = [];
  private bursts: Phaser.GameObjects.Image[] = [];
  private si = 0;
  private gi = 0;
  private mi = 0;
  private bi = 0;
  private hasMuzzle: boolean;
  private hasBurst: boolean;

  constructor(scene: Phaser.Scene, sparkCount = 48, glowCount = 24) {
    this.scene = scene;
    const mk = (key: string, blend = Phaser.BlendModes.ADD) =>
      scene.add
        .image(0, 0, key)
        .setBlendMode(blend)
        .setDepth(11)
        .setActive(false)
        .setVisible(false);
    for (let i = 0; i < sparkCount; i++) this.sparks.push(mk(SPARK_KEY));
    for (let i = 0; i < glowCount; i++) this.glows.push(mk(GLOW_KEY));
    // Real pack FX — only pooled if the art actually loaded (otherwise the procedural
    // glow/spark above carry the effect on their own).
    this.hasMuzzle = scene.textures.exists(FX_MUZZLE_KEY);
    this.hasBurst = scene.textures.exists(FX_IMPACT_KEY);
    if (this.hasMuzzle) for (let i = 0; i < 16; i++) this.muzzles.push(mk(FX_MUZZLE_KEY));
    if (this.hasBurst) for (let i = 0; i < 12; i++) this.bursts.push(mk(FX_IMPACT_KEY, Phaser.BlendModes.NORMAL));
  }

  spark(x: number, y: number, color: number, scale = 1.6) {
    if (effectiveLowFx() && Math.random() < 0.55) return; // thin out on low-FX
    const s = this.sparks[this.si];
    this.si = (this.si + 1) % this.sparks.length;
    this.scene.tweens.killTweensOf(s);
    s.setPosition(x, y).setTint(color).setScale(0.8).setAlpha(1).setVisible(true);
    this.scene.tweens.add({
      targets: s,
      scale: scale * 1.4,
      alpha: 0,
      duration: 160,
      onComplete: () => s.setVisible(false),
    });
  }

  /** Muzzle flash — a brief additive glow. Dropped on the low-FX tier. */
  flash(x: number, y: number, color: number, scale = 0.45) {
    if (effectiveLowFx()) return;
    const f = this.glows[this.gi];
    this.gi = (this.gi + 1) % this.glows.length;
    this.scene.tweens.killTweensOf(f);
    f.setPosition(x, y).setTint(color).setScale(scale).setAlpha(1).setVisible(true);
    this.scene.tweens.add({
      targets: f,
      scale: 0,
      alpha: 0,
      duration: 110,
      onComplete: () => f.setVisible(false),
    });
  }

  /** Real muzzle flame jutting along the aim. No-op if the pack art didn't load. */
  muzzle(x: number, y: number, angle: number, scale = 1) {
    if (!this.hasMuzzle || effectiveLowFx()) return;
    const m = this.muzzles[this.mi];
    this.mi = (this.mi + 1) % this.muzzles.length;
    this.scene.tweens.killTweensOf(m);
    // Flame art points "up" (−Y); rotate so its tip follows the aim direction.
    m.setPosition(x, y).setRotation(angle + Math.PI / 2).setScale(scale * 0.9).setAlpha(1).setVisible(true);
    this.scene.tweens.add({
      targets: m,
      scaleX: scale * 1.15,
      scaleY: scale * 1.25,
      alpha: 0,
      duration: 90,
      onComplete: () => m.setVisible(false),
    });
  }

  /** Real explosion burst (e.g. on a kill). No-op if the pack art didn't load. */
  burst(x: number, y: number, scale = 1) {
    if (!this.hasBurst) return;
    const b = this.bursts[this.bi];
    this.bi = (this.bi + 1) % this.bursts.length;
    this.scene.tweens.killTweensOf(b);
    b.setPosition(x, y).setRotation(Math.random() * Math.PI * 2).setScale(scale * 0.5).setAlpha(1).setVisible(true);
    this.scene.tweens.add({
      targets: b,
      scale: scale * 1.15,
      alpha: 0,
      duration: 260,
      ease: "Quad.out",
      onComplete: () => b.setVisible(false),
    });
  }
}
