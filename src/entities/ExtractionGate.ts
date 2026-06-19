import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";

/**
 * Extraction gate — a corrupted exit portal. Hidden until the district's node is
 * infected; then it lights up at the player's insertion point. Walking into it
 * (within triggerRange) advances the run to the next district. Self-contained
 * view; the scene feeds it the player position and reads `triggered`.
 */
export const GATE_TRIGGER_RANGE = 30;

export default class ExtractionGate {
  readonly x: number;
  readonly y: number;
  active = false;

  private scene: Phaser.Scene;
  private accent: number;
  private core: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private spin = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, accent: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.accent = accent;

    this.core = scene.add
      .image(x, y, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(accent)
      .setDepth(6)
      .setScale(1.1)
      .setVisible(false);
    this.ring = scene.add.graphics().setDepth(7).setVisible(false);
    this.label = scene.add
      .text(x, y - 30, "▲ EXTRACT", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#" + accent.toString(16).padStart(6, "0"),
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(7)
      .setVisible(false);
  }

  /** Light up the gate (node captured). */
  activate() {
    if (this.active) return;
    this.active = true;
    this.core.setVisible(true);
    this.ring.setVisible(true);
    this.label.setVisible(true);
    this.scene.tweens.add({
      targets: this.core,
      scale: { from: 0.9, to: 1.4 },
      alpha: { from: 0.7, to: 1 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
    this.scene.tweens.add({
      targets: this.label,
      alpha: { from: 1, to: 0.4 },
      duration: 600,
      yoyo: true,
      repeat: -1,
    });
    // Arrival flare.
    const flare = this.scene.add
      .circle(this.x, this.y, 10, this.accent, 0.6)
      .setDepth(6);
    this.scene.tweens.add({
      targets: flare,
      scale: 5,
      alpha: 0,
      duration: 600,
      ease: "Quad.out",
      onComplete: () => flare.destroy(),
    });
  }

  /** True while the player stands in the gate. */
  contains(px: number, py: number): boolean {
    if (!this.active) return false;
    return Phaser.Math.Distance.Between(px, py, this.x, this.y) <= GATE_TRIGGER_RANGE;
  }

  update(dtMs: number) {
    if (!this.active) return;
    this.spin += dtMs * 0.004;
    const g = this.ring;
    g.clear();
    const r = 22;
    g.lineStyle(2, this.accent, 0.9);
    for (let i = 0; i < 3; i++) {
      const a = this.spin + (i * Math.PI * 2) / 3;
      g.beginPath();
      g.arc(this.x, this.y, r, a, a + 1.4, false);
      g.strokePath();
    }
    g.lineStyle(1, 0xffffff, 0.5).strokeCircle(this.x, this.y, r - 6);
  }

  destroy() {
    this.core.destroy();
    this.ring.destroy();
    this.label.destroy();
  }
}
