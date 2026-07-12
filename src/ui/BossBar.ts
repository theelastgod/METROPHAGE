import Phaser from "phaser";
import { VIEW_W } from "../config";
import { uiDim, uiFont } from "./uiLayout";
import { setFittedText } from "./typography";

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

  private readonly w = uiDim(380);
  private readonly h = uiDim(14);
  private readonly x = VIEW_W - uiDim(380) - uiDim(30);
  private readonly y = uiDim(28);
  private readonly cx = this.x + this.w / 2;
  private readonly pad = uiDim(4);

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1500);
    this.nameText = scene.add
      .text(this.cx, this.y - uiDim(14), "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(14),
        color: "#ff3b6b",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1501);
    this.titleText = scene.add
      .text(this.cx, this.y + this.h + uiDim(5), "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(10),
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
    this.nameText.setColor(hex);
    setFittedText(this.nameText, "⚠  " + name, this.w + uiDim(40), { minScale: 0.72 });
    setFittedText(this.titleText, title, this.w + uiDim(40), { minScale: 0.72 });
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
    g.fillStyle(0x07061a, 0.82).fillRect(this.x - this.pad, this.y - this.pad, this.w + this.pad * 2, this.h + this.pad * 2);
    g.lineStyle(uiDim(2), this.accent, 0.9).strokeRect(this.x - this.pad, this.y - this.pad, this.w + this.pad * 2, this.h + this.pad * 2);
    g.fillStyle(0x140a1e, 0.95).fillRect(this.x, this.y, this.w, this.h);
    g.fillStyle(this.accent, 1).fillRect(this.x, this.y, this.w * this.frac, this.h);
    g.fillStyle(0xffffff, 0.5).fillRect(this.x, this.y, this.w * this.frac, uiDim(2));
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.nameText.setVisible(v);
    this.titleText.setVisible(v);
  }
}
