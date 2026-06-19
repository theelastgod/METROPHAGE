import Phaser from "phaser";
import { NPC } from "../config";
import { UI_FRAME_KEY } from "../assets/manifest";

/**
 * A hub interaction point (contract board / vendor). Shows an "E …" prompt when
 * the player is near; the scene opens the matching panel on E.
 */
export default class Terminal {
  readonly x: number;
  readonly y: number;
  private prompt: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label = "CONTRACTS",
    promptText = "E  BOARD",
    tint = 0x29e7ff,
  ) {
    this.x = x;
    this.y = y;
    const sprite = scene.add.image(x, y, UI_FRAME_KEY).setDepth(6).setTint(tint);
    scene.add
      .text(x, y - 24, label, {
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        color: "#" + tint.toString(16).padStart(6, "0"),
      })
      .setOrigin(0.5)
      .setDepth(7);
    this.prompt = scene.add
      .text(x, y + 24, promptText, {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#f7ff3c",
      })
      .setOrigin(0.5)
      .setDepth(7)
      .setVisible(false);

    scene.tweens.add({
      targets: sprite,
      scale: { from: 0.92, to: 1.06 },
      yoyo: true,
      repeat: -1,
      duration: 1100,
      ease: "Sine.inOut",
    });
  }

  update(playerDist: number): boolean {
    const near = playerDist <= NPC.interactRange;
    this.prompt.setVisible(near);
    return near;
  }
}
