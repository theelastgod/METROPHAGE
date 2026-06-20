import Phaser from "phaser";
import { NODE, COLORS } from "../config";
import { NODE_KEY, NODE_INFECTED_KEY } from "../assets/manifest";

type NodeState = "dormant" | "channeling" | "infected";

/**
 * A capturable city node. While the player stands within channelRange the capture
 * progress fills; stepping away bleeds it off. At 100% it becomes infected and
 * (the scene) starts ticking the Singularity meter. Self-contained view + logic;
 * the scene just feeds it the player distance each frame and reads `infected`.
 */
export default class InfectionNode {
  readonly x: number;
  readonly y: number;
  progress = 0; // 0..1 capture progress

  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private state: NodeState = "dormant";
  private locked = false; // guarded by a boss — can't channel until it falls

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;

    this.base = scene.add.image(x, y, NODE_KEY).setDepth(6);
    this.ring = scene.add.graphics().setDepth(7);
    this.label = scene.add
      .text(x, y - 26, "NODE", {
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        color: "#8a5cff",
      })
      .setOrigin(0.5)
      .setDepth(7);

    scene.tweens.add({
      targets: this.base,
      scale: { from: 0.92, to: 1.08 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  get infected(): boolean {
    return this.state === "infected";
  }

  /** Boss districts lock the node until the guardian falls. */
  setLocked(v: boolean) {
    this.locked = v;
    if (v) {
      this.state = "dormant";
      this.progress = 0;
      this.base.setTint(0xff3b6b);
      this.label.setText("◈ GUARDED").setColor("#ff3b6b");
      this.drawRing(0);
    } else {
      this.base.clearTint();
      this.label.setText("NODE EXPOSED").setColor("#39ff88");
      // brief unlock flare
      const wave = this.scene.add
        .circle(this.x, this.y, 16, COLORS.nodeInfected, 0.6)
        .setDepth(5);
      this.scene.tweens.add({
        targets: wave,
        scale: 4,
        alpha: 0,
        duration: 600,
        onComplete: () => wave.destroy(),
      });
    }
  }

  /** Feed the player's distance to the node + frame delta (ms). */
  update(playerDist: number, dtMs: number) {
    if (this.locked) {
      this.drawRing(0);
      return; // guarded — no channel
    }
    if (this.state === "infected") {
      this.drawRing(1);
      return;
    }

    if (playerDist <= NODE.channelRange) {
      this.state = "channeling";
      this.progress = Math.min(1, this.progress + dtMs / NODE.channelTimeMs);
    } else {
      this.progress = Math.max(0, this.progress - dtMs / NODE.channelDecayMs);
      if (this.progress === 0) this.state = "dormant";
    }

    if (this.progress >= 1) {
      this.infect();
      return;
    }

    this.label.setText(
      this.state === "channeling"
        ? `INFECTING ${Math.round(this.progress * 100)}%`
        : "NODE",
    );
    this.drawRing(this.progress);
  }

  private infect() {
    this.state = "infected";
    this.progress = 1;
    this.base.setTexture(NODE_INFECTED_KEY); // swap clean -> glitched-green terminal
    this.label.setText("INFECTED").setColor("#39ff88");
    this.drawRing(1);

    // periodic expanding shockwave so it reads as a corrupted, broadcasting node
    this.scene.time.addEvent({
      delay: 900,
      loop: true,
      callback: () => this.pulse(),
    });
    this.pulse();
  }

  private pulse() {
    const wave = this.scene.add
      .circle(this.x, this.y, 18, COLORS.nodeInfected, 0.5)
      .setDepth(5);
    this.scene.tweens.add({
      targets: wave,
      scale: 3.2,
      alpha: 0,
      duration: 900,
      ease: "Quad.out",
      onComplete: () => wave.destroy(),
    });
  }

  private drawRing(p: number) {
    const r = 28;
    const color = this.state === "infected" ? COLORS.nodeInfected : COLORS.neonMagenta;
    this.ring.clear();
    this.ring.lineStyle(3, 0x2a1740, 0.9).strokeCircle(this.x, this.y, r);
    if (p <= 0) return;
    this.ring.lineStyle(3, color, 1);
    this.ring.beginPath();
    this.ring.arc(
      this.x,
      this.y,
      r,
      -Math.PI / 2,
      -Math.PI / 2 + p * Math.PI * 2,
      false,
    );
    this.ring.strokePath();
  }
}
