import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";

/**
 * A soft light the player carries through the dark wet streets — wide cool ambient pool,
 * tighter warm core, faint accent ring, and a contact shadow. Additive at depth 4.
 */
export class PlayerLight {
  private pool: Phaser.GameObjects.Image;
  private core: Phaser.GameObjects.Image;
  private accent: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private pulse = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, depth = 4, accentColor = 0x29e7ff) {
    this.pool = scene.add.image(x, y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0x8fc8ff).setDepth(depth).setScale(3.4).setAlpha(0.18);
    this.core = scene.add.image(x, y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd6a0).setDepth(depth).setScale(1.35).setAlpha(0.24);
    this.accent = scene.add.image(x, y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(accentColor).setDepth(depth).setScale(2.1).setAlpha(0.1);
    this.shadow = scene.add.image(x, y, GLOW_KEY).setTint(0x05070d).setDepth(depth + 0.3).setScale(0.7, 0.42).setAlpha(0.45);
  }

  /** Follow the player. Call once per frame from the scene update. */
  update(x: number, y: number, t = 0): void {
    this.pool.setPosition(x, y);
    this.core.setPosition(x, y);
    this.accent.setPosition(x, y);
    this.shadow.setPosition(x, y + 7);
    this.pulse = 0.08 * Math.sin(t * 0.004);
    this.core.setAlpha(0.22 + this.pulse);
    this.accent.setAlpha(0.09 + this.pulse * 0.5);
  }

  setVisible(v: boolean): void {
    this.pool.setVisible(v);
    this.core.setVisible(v);
    this.accent.setVisible(v);
    this.shadow.setVisible(v);
  }

  destroy(): void {
    this.pool.destroy();
    this.core.destroy();
    this.accent.destroy();
    this.shadow.destroy();
  }
}