import Phaser from "phaser";
import { drawHudPanel } from "./panelChrome";
import { drawScanlines } from "./studioChrome";
import { bodyFont } from "./typography";
import { uiDim } from "./uiLayout";

/** RS-style bottom message line — examine text, system notices (persists until replaced). */
export default class RsGameMessage {
  private scene: Phaser.Scene;
  private g: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private readonly x: number;
  private y: number;
  private readonly w: number;
  private h = uiDim(28);
  private readonly bottomY: number;
  private fadeTimer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const margin = uiDim(14);
    this.w = Math.min(uiDim(520), scene.scale.width - margin * 2);
    this.x = (scene.scale.width - this.w) / 2;
    this.bottomY = scene.scale.height - uiDim(90);
    this.y = this.bottomY - this.h;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1045);
    this.label = scene.add
      .text(this.x + uiDim(12), this.y + uiDim(7), "", bodyFont(11, { color: "#f7ff3c", wordWrap: { width: this.w - uiDim(24) } }))
      .setScrollFactor(0)
      .setDepth(1046)
      .setAlpha(0);
    this.g.setAlpha(0); // frame only shows while a message is live
    this.drawFrame();
  }

  private drawFrame() {
    const g = this.g;
    g.clear();
    drawHudPanel(g, this.x, this.y, this.w, this.h, 0xffe06a);
    drawScanlines(g, this.x, this.y, this.w, this.h, 0xf7ff3c, 0.018);
    g.fillStyle(0x1a1810, 0.5).fillRect(this.x + uiDim(4), this.y + uiDim(4), this.w - uiDim(8), this.h - uiDim(8));
  }

  show(text: string, opts?: { ttlMs?: number; color?: string }) {
    if (this.fadeTimer) {
      this.fadeTimer.remove();
      this.fadeTimer = undefined;
    }
    this.label.setText(text).setColor(opts?.color ?? "#f7ff3c").setAlpha(1);
    // Examine copy can now carry a compact district dossier. Grow upward from the
    // same HUD anchor instead of drawing wrapped text outside a fixed 28px strip.
    this.h = Math.min(uiDim(180), Math.max(uiDim(28), this.label.height + uiDim(14)));
    this.y = this.bottomY - this.h;
    this.label.setPosition(this.x + uiDim(12), this.y + uiDim(7));
    this.drawFrame();
    this.scene.tweens.killTweensOf([this.label, this.g]);
    this.g.setAlpha(1);
    if (opts?.ttlMs) {
      this.fadeTimer = this.scene.time.delayedCall(opts.ttlMs, () => {
        this.scene.tweens.add({ targets: [this.label, this.g], alpha: 0, duration: 500 });
      });
    }
  }

  clear() {
    if (this.fadeTimer) {
      this.fadeTimer.remove();
      this.fadeTimer = undefined;
    }
    this.scene.tweens.killTweensOf([this.label, this.g]);
    this.label.setAlpha(0);
    this.g.setAlpha(0);
  }

  setVisible(visible: boolean) {
    this.g.setVisible(visible);
    this.label.setVisible(visible);
    if (!visible) this.clear();
  }

  destroy() {
    this.fadeTimer?.remove();
    this.g.destroy();
    this.label.destroy();
  }
}
