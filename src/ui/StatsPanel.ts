import Phaser from "phaser";
import { VIEW_H } from "../config";
import { drawPanelFrame } from "./panelChrome";

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

  private readonly x = 270;
  private readonly y = 48;
  private readonly w = 420;
  private readonly h = VIEW_H - 96;

  constructor(scene: Phaser.Scene, provider: () => StatLine[]) {
    this.scene = scene;
    this.provider = provider;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);

    this.header = this.text(this.x + 18, this.y + 14, "", "#eafdff", "14px");
    this.text(this.x + this.w - 132, this.y + 16, "C / ESC to close", "#9aa3b2", "10px");

    // Pre-create a row (label + right-aligned value) per stat; values refresh on open.
    const lines = provider();
    lines.forEach((ln, i) => {
      const ry = this.y + 50 + i * 27;
      this.labelTexts.push(this.text(this.x + 28, ry, ln.label, "#9aa3b2", "12px"));
      const v = this.text(this.x + this.w - 28, ry, ln.value, ln.color ?? "#eafdff", "13px");
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
    this.header.setText("CYBERIAN — CHARACTER");
    const lines = this.provider();
    lines.forEach((ln, i) => {
      this.labelTexts[i]?.setText(ln.label);
      this.valueTexts[i]?.setText(ln.value).setColor(ln.color ?? "#eafdff");
      // faint separators between groups read better than a wall of rows
      const ry = this.y + 50 + i * 27;
      g.lineStyle(1, 0x2a2440, 0.5).lineBetween(this.x + 24, ry + 20, this.x + this.w - 24, ry + 20);
    });
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.header.setVisible(v);
    this.staticTexts.forEach((t) => t.setVisible(v));
    this.labelTexts.forEach((t) => t.setVisible(v));
    this.valueTexts.forEach((t) => t.setVisible(v));
  }

  private text(x: number, y: number, s: string, color: string, size: string) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: size, color })
      .setScrollFactor(0)
      .setDepth(1601);
    this.staticTexts.push(t);
    return t;
  }
}
