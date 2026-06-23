import Phaser from "phaser";
import { NPC } from "../config";
import { NPC_KEY } from "../assets/manifest";

/**
 * A friendly, stationary contact. Shows an "E TALK" prompt when the player is in
 * range; the scene opens the dialogue on the E press. (Step 8 adds the wandering
 * ambient crowd — this one is the talkable quest-giver.)
 */
export default class Npc {
  readonly x: number;
  readonly y: number;
  private sprite: Phaser.GameObjects.Image;
  private prompt: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.x = x;
    this.y = y;
    this.sprite = scene.add.image(x, y, NPC_KEY, 0).setDepth(8); // frame 0 = facing down
    this.prompt = scene.add
      .text(x, y - 26, "E  TALK", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#9dff3c",
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setVisible(false);
    this.prompt.setShadow(0, 0, "#9dff3c", 6, true, true);

    // Gentle breathing so the contact reads as a living figure, not a prop.
    this.sprite.setOrigin(0.5, 0.62);
    scene.tweens.add({
      targets: this.sprite,
      scaleY: 1.06,
      scaleX: 0.97,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  /** Returns whether the player is in interaction range; toggles the prompt. */
  update(playerDist: number): boolean {
    const near = playerDist <= NPC.interactRange;
    this.prompt.setVisible(near);
    return near;
  }
}
