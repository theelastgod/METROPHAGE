import Phaser from "phaser";
import { VIEW_W, VIEW_H } from "../config";
import Memory from "../systems/Memory";
import { FRAGMENTS } from "../game/fragments";
import { drawPanelFrame } from "./panelChrome";

/**
 * Memory log (J) — recovered fragments, with the rest shown encrypted as a
 * collect-them hook. Camera-fixed; the scene freezes the sim while it's open.
 * The quest journal (later) extends this surface.
 */
export default class MemoryPanel {
  private scene: Phaser.Scene;
  private memory: Memory;

  private g: Phaser.GameObjects.Graphics;
  private statics: Phaser.GameObjects.Text[] = [];
  private titleTexts: Phaser.GameObjects.Text[] = [];
  private bodyTexts: Phaser.GameObjects.Text[] = [];
  private countText!: Phaser.GameObjects.Text;
  private open = false;

  private readonly x = 70;
  private readonly y = 40;
  private readonly w = VIEW_W - 140;
  private readonly h = VIEW_H - 70;

  constructor(scene: Phaser.Scene, memory: Memory) {
    this.scene = scene;
    this.memory = memory;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.text(this.x + 16, this.y + 12, "MEMORY LOG", "#eafdff", "13px", D);
    this.countText = this.text(this.x + this.w - 16, this.y + 12, "", "#8a5cff", "11px", D);
    this.countText.setOrigin(1, 0);

    const startY = this.y + 42;
    const rowH = (this.h - 64) / FRAGMENTS.length;
    FRAGMENTS.forEach((_f, i) => {
      const ty = startY + i * rowH;
      this.titleTexts.push(this.text(this.x + 20, ty, "", "#39ff88", "12px", D));
      this.bodyTexts.push(
        this.scene.add
          .text(this.x + 30, ty + 16, "", {
            fontFamily: "Courier New, monospace",
            fontSize: "10px",
            color: "#9aa3b2",
            lineSpacing: 2,
            wordWrap: { width: this.w - 60 },
          })
          .setScrollFactor(0)
          .setDepth(D),
      );
      this.statics.push(this.bodyTexts[i]);
    });

    this.text(this.x + this.w - 116, this.y + this.h - 20, "J / ESC to close", "#9aa3b2", "10px", D);
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

  refresh() {
    const g = this.g;
    g.clear();
    drawPanelFrame(g, this.x, this.y, this.w, this.h);
    this.countText.setText(`FRAGMENTS ${this.memory.count} / ${this.memory.total}`);

    FRAGMENTS.forEach((f, i) => {
      const known = this.memory.has(f.id);
      this.titleTexts[i]
        .setText(known ? `◆ ${f.title}` : "◇ ??? — [ENCRYPTED]")
        .setColor(known ? "#39ff88" : "#5a6172");
      this.bodyTexts[i]
        .setText(known ? f.lines.join("\n") : "")
        .setColor("#9aa3b2");
    });
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.statics.forEach((t) => t.setVisible(v));
    this.titleTexts.forEach((t) => t.setVisible(v));
  }

  private text(x: number, y: number, s: string, color: string, size: string, depth: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: size, color })
      .setScrollFactor(0)
      .setDepth(depth);
    this.statics.push(t);
    return t;
  }
}
