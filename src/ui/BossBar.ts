import Phaser from "phaser";
import { VIEW_W } from "../config";

/**
 * Boss health bar — a wide framed meter near the top of the screen, with the
 * boss name + epithet. Hidden until a boss is active; the scene feeds it the
 * HP fraction each frame. Camera-fixed.
 */
export default class BossBar {
  private g: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private titleText: Phaser.GameObjects.Text;
  private accent = 0xff3b6b;
  private frac = 1;
  private shown = false;

  private readonly w = 360;
  private readonly h = 12;
  // Tucked right of the top-left HUD panel so the two never overlap.
  private readonly x = VIEW_W - 360 - 30;
  private readonly y = 26;
  private readonly cx = VIEW_W - 360 - 30 + 180;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1500);
    this.nameText = scene.add
      .text(this.cx, this.y - 12, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: "#ff3b6b",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1501);
    this.titleText = scene.add
      .text(this.cx, this.y + this.h + 4, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "9px",
        color: "#9aa3b2",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1501);
    this.setVisible(false);
  }

  show(name: string, title: string, hex: string) {
    this.accent = Phaser.Display.Color.HexStringToColor(hex).color;
    this.frac = 1;
    this.nameText.setText("⚠  " + name).setColor(hex);
    this.titleText.setText(title);
    this.shown = true;
    this.setVisible(true);
    this.draw();
  }

  update(frac: number) {
    if (!this.shown) return;
    this.frac = Phaser.Math.Clamp(frac, 0, 1);
    this.draw();
  }

  hide() {
    this.shown = false;
    this.setVisible(false);
  }

  private draw() {
    const g = this.g;
    g.clear();
    g.fillStyle(0x07061a, 0.82).fillRect(this.x - 4, this.y - 4, this.w + 8, this.h + 8);
    g.lineStyle(2, this.accent, 0.9).strokeRect(this.x - 4, this.y - 4, this.w + 8, this.h + 8);
    g.fillStyle(0x140a1e, 0.95).fillRect(this.x, this.y, this.w, this.h);
    // depletes right-to-left, hot core
    g.fillStyle(this.accent, 1).fillRect(this.x, this.y, this.w * this.frac, this.h);
    g.fillStyle(0xffffff, 0.5).fillRect(this.x, this.y, this.w * this.frac, 2);
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.nameText.setVisible(v);
    this.titleText.setVisible(v);
  }
}
