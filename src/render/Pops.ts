import Phaser from "phaser";
import { hudFont, uiDim } from "../ui/typography";

/**
 * Pops — a pooled set of world-space text pops (damage numbers, pickups, callouts).
 * Round-robin over a fixed pool so there's no per-hit allocation/GC churn; each pop
 * rises and fades. Sits above the world, below the HUD.
 */
export default class Pops {
  private scene: Phaser.Scene;
  private pool: Phaser.GameObjects.Text[] = [];
  private idx = 0;

  constructor(scene: Phaser.Scene, count = 28) {
    this.scene = scene;
    for (let i = 0; i < count; i++) {
      const t = scene.add
        .text(0, 0, "", hudFont(14, { color: "#ffffff", fontStyle: "bold" }))
        .setOrigin(0.5)
        .setDepth(40)
        .setVisible(false);
      this.pool.push(t);
    }
  }

  popCrit(x: number, y: number, text: string) {
    this.popStyled(x, y, text, "#f7ff3c", uiDim(18), uiDim(34), 1.45);
  }

  popHeal(x: number, y: number, text: string) {
    this.popStyled(x, y, text, "#39ff88", uiDim(15), uiDim(28), 1.2);
  }

  popPickup(x: number, y: number, text: string) {
    this.popStyled(x, y, text, "#00e5ff", uiDim(13), uiDim(22), 1.1);
  }

  pop(x: number, y: number, text: string, color = "#ffffff", size = 14, rise = 26) {
    this.popStyled(x, y, text, color, size, rise, 1.25);
  }

  private popStyled(x: number, y: number, text: string, color: string, size: number, rise: number, peakScale: number) {
    const t = this.pool[this.idx];
    this.idx = (this.idx + 1) % this.pool.length;
    this.scene.tweens.killTweensOf(t);
    t.setText(text)
      .setColor(color)
      .setFontSize(size)
      .setPosition(x + Phaser.Math.Between(-6, 6), y)
      .setScale(1)
      .setAlpha(1)
      .setVisible(true);
    this.scene.tweens.add({
      targets: t,
      y: y - rise,
      alpha: { from: 1, to: 0 },
      scale: { from: peakScale, to: 1 },
      duration: 620,
      ease: "Quad.out",
      onComplete: () => t.setVisible(false),
    });
  }
}
