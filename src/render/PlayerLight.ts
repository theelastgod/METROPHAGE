import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";

/**
 * A soft light the player carries through the dark wet streets — wide cool ambient pool,
 * tighter warm core, faint accent ring, ground reflection, and contact shadow.
 */
export class PlayerLight {
  private pool: Phaser.GameObjects.Image;
  private core: Phaser.GameObjects.Image;
  private accent: Phaser.GameObjects.Image;
  private streak: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private pulse = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, depth = 4, accentColor = 0x29e7ff) {
    // Stronger presence so the runner is the brightest thing on the wet street.
    this.pool = scene.add.image(x, y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0x8fc8ff).setDepth(depth).setScale(4.4).setAlpha(0.26);
    this.core = scene.add.image(x, y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd6a0).setDepth(depth).setScale(1.7).setAlpha(0.34);
    this.accent = scene.add.image(x, y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(accentColor).setDepth(depth).setScale(2.6).setAlpha(0.16);
    this.streak = scene.add
      .image(x, y + 10, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(accentColor)
      .setDepth(depth - 0.05)
      .setScale(0.95, 3.1)
      .setAlpha(0.18)
      .setOrigin(0.5, 0.08);
    this.shadow = scene.add.image(x, y, GLOW_KEY).setTint(0x03050a).setDepth(depth + 0.3).setScale(0.95, 0.55).setAlpha(0.55);
  }

  update(x: number, y: number, t = 0): void {
    this.pool.setPosition(x, y);
    this.core.setPosition(x, y);
    this.accent.setPosition(x, y);
    this.streak.setPosition(x, y + 11);
    this.shadow.setPosition(x, y + 8);
    this.pulse = 0.11 * Math.sin(t * 0.0035);
    this.core.setAlpha(0.3 + this.pulse);
    this.accent.setAlpha(0.14 + this.pulse * 0.5);
    this.pool.setAlpha(0.22 + this.pulse * 0.3);
  }

  setVisible(v: boolean): void {
    this.pool.setVisible(v);
    this.core.setVisible(v);
    this.accent.setVisible(v);
    this.streak.setVisible(v);
    this.shadow.setVisible(v);
  }

  destroy(): void {
    this.pool.destroy();
    this.core.destroy();
    this.accent.destroy();
    this.streak.destroy();
    this.shadow.destroy();
  }
}