import Phaser from "phaser";

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
        .text(0, 0, "", {
          fontFamily: "Courier New, monospace",
          fontSize: "14px",
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(40)
        .setVisible(false);
      this.pool.push(t);
    }
  }

  pop(x: number, y: number, text: string, color = "#ffffff", size = 14, rise = 26) {
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
      scale: { from: 1.25, to: 1 },
      duration: 620,
      ease: "Quad.out",
      onComplete: () => t.setVisible(false),
    });
  }
}
