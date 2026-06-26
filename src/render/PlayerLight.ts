import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";

/**
 * A soft light the player carries through the dark wet streets — a wide cool ambient pool
 * plus a tighter warm core, repositioned to the player every frame. Additive at depth 4 (on
 * the ground, below the actors at 5+), so it pools around the player and plays off the
 * wet-street / rooftop lighting as they move. Shared by CityScene and the unified online
 * world so the local avatar reads the same in both. Pure ambiance — no gameplay/collision.
 */
export class PlayerLight {
  private pool: Phaser.GameObjects.Image;
  private core: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, depth = 4) {
    this.pool = scene.add.image(x, y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0x8fc8ff).setDepth(depth).setScale(3.1).setAlpha(0.16);
    this.core = scene.add.image(x, y, GLOW_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd6a0).setDepth(depth).setScale(1.28).setAlpha(0.22);
    // soft contact shadow at the feet (normal blend, drawn over the light pool so it darkens
    // under the avatar) — grounds the player on the lit street instead of floating.
    this.shadow = scene.add.image(x, y, GLOW_KEY).setTint(0x05070d).setDepth(depth + 0.3).setScale(0.66, 0.4).setAlpha(0.42);
  }

  /** Follow the player. Call once per frame from the scene update. */
  update(x: number, y: number): void {
    this.pool.setPosition(x, y);
    this.core.setPosition(x, y);
    this.shadow.setPosition(x, y + 7);
  }

  /** Hide the aura with the avatar (e.g. dead / disconnected online). */
  setVisible(v: boolean): void {
    this.pool.setVisible(v);
    this.core.setVisible(v);
    this.shadow.setVisible(v);
  }

  destroy(): void {
    this.pool.destroy();
    this.core.destroy();
    this.shadow.destroy();
  }
}
