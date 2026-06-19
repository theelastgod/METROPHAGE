import Phaser from "phaser";
import { NPC } from "../config";
import { UI_FRAME_KEY } from "../assets/manifest";

/**
 * Contract-board terminal in the hub. Shows an "E BOARD" prompt when the player
 * is near; the scene opens the ContractPanel on E.
 */
export default class Terminal {
  readonly x: number;
  readonly y: number;
  private prompt: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.x = x;
    this.y = y;
    const sprite = scene.add.image(x, y, UI_FRAME_KEY).setDepth(6).setTint(0x29e7ff);
    scene.add
      .text(x, y - 24, "CONTRACTS", {
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        color: "#29e7ff",
      })
      .setOrigin(0.5)
      .setDepth(7);
    this.prompt = scene.add
      .text(x, y + 24, "E  BOARD", {
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
