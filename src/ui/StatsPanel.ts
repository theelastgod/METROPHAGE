import Phaser from "phaser";
import { VIEW_H } from "../config";
import { drawPanelFrame } from "./panelChrome";
import { uiDim, uiFont } from "./uiLayout";
import { setFittedText } from "./typography";

/** A row in the stats sheet: label + formatted value (+ optional value colour). */
export interface StatLine {
  label: string;
  value: string;
  color?: string;
}

/**
 * Character sheet (toggle C). Read-only panel listing the player's effective derived
 * stats — class/level/HP/shield plus the full ModBag (damage, crit, lifesteal, move,
 * cooldown, infection, hack, heat, element). Pulls fresh values from a provider each
 * time it opens. Camera-fixed; the scene freezes the sim while it's up.
 */
export default class StatsPanel {
  private scene: Phaser.Scene;
  private provider: () => StatLine[];
  private g: Phaser.GameObjects.Graphics;
  private header: Phaser.GameObjects.Text;
  private staticTexts: Phaser.GameObjects.Text[] = [];
  private labelTexts: Phaser.GameObjects.Text[] = [];
  private valueTexts: Phaser.GameObjects.Text[] = [];
  private open = false;

  private readonly x = uiDim(270);
  private readonly y = uiDim(48);
  private readonly w = uiDim(440);
  private readonly h = VIEW_H - uiDim(96);
  private readonly rowH = uiDim(29);

  constructor(scene: Phaser.Scene, provider: () => StatLine[]) {
    this.scene = scene;
    this.provider = provider;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);

    this.header = this.text(this.x + uiDim(20), this.y + uiDim(16), "", "#eafdff", 15);
    this.text(this.x + this.w - uiDim(140), this.y + uiDim(18), "C / ESC to close", "#9aa3b2", 11);

    const lines = provider();
    lines.forEach((ln, i) => {
      const ry = this.y + uiDim(54) + i * this.rowH;
      this.labelTexts.push(this.text(this.x + uiDim(30), ry, ln.label, "#9aa3b2", 13));
      const v = this.text(this.x + this.w - uiDim(30), ry, ln.value, ln.color ?? "#eafdff", 14);
      v.setOrigin(1, 0);
      this.valueTexts.push(v);
    });

    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }
  toggle() {
    this.open ? this.close() : this.show();
  }
  show() {
    this.open = true;
    this.setVisible(true);
    this.refresh();
  }
  close() {
    this.open = false;
    this.setVisible(false);
  }

  private refresh() {
    const g = this.g;
    g.clear();
    drawPanelFrame(g, this.x, this.y, this.w, this.h);
    setFittedText(this.header, "RUNNER — CHARACTER", this.w - uiDim(180));
    const lines = this.provider();
    lines.forEach((ln, i) => {
      if (this.labelTexts[i]) setFittedText(this.labelTexts[i], ln.label, this.w * 0.55 - uiDim(30), { minScale: 0.72 });
      if (this.valueTexts[i]) {
        this.valueTexts[i].setColor(ln.color ?? "#eafdff");
        setFittedText(this.valueTexts[i], ln.value, this.w * 0.38, { minScale: 0.72 });
      }
      const ry = this.y + uiDim(54) + i * this.rowH;
      g.lineStyle(uiDim(1), 0x2a2440, 0.5).lineBetween(
        this.x + uiDim(26),
        ry + uiDim(22),
        this.x + this.w - uiDim(26),
        ry + uiDim(22),
      );
    });
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.header.setVisible(v);
    this.staticTexts.forEach((t) => t.setVisible(v));
    this.labelTexts.forEach((t) => t.setVisible(v));
    this.valueTexts.forEach((t) => t.setVisible(v));
  }

  private text(x: number, y: number, s: string, color: string, sizePx: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: uiFont(sizePx), color })
      .setScrollFactor(0)
      .setDepth(1601);
    this.staticTexts.push(t);
    return t;
  }
}
