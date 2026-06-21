import Phaser from "phaser";
import { GLOW_KEY, SPARK_KEY } from "../assets/manifest";
import { getSettings } from "../systems/Settings";

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
  private si = 0;
  private gi = 0;

  constructor(scene: Phaser.Scene, sparkCount = 48, glowCount = 24) {
    this.scene = scene;
    const mk = (key: string) =>
      scene.add
        .image(0, 0, key)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(11)
        .setActive(false)
        .setVisible(false);
    for (let i = 0; i < sparkCount; i++) this.sparks.push(mk(SPARK_KEY));
    for (let i = 0; i < glowCount; i++) this.glows.push(mk(GLOW_KEY));
  }

  spark(x: number, y: number, color: number, scale = 1.6) {
    if (getSettings().lowFx && Math.random() < 0.55) return; // thin out on low-FX
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
    if (getSettings().lowFx) return;
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
}
