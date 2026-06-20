import Phaser from "phaser";
import { VIEW_W, VIEW_H } from "../config";
import Memory from "../systems/Memory";
import Quests from "../systems/Quests";
import { FRAGMENTS } from "../game/fragments";
import { drawPanelFrame } from "./panelChrome";

/**
 * Journal (J) — the active quest + its objective/log, plus recovered memory
 * fragments (the rest encrypted). Extends the old Memory log into the quest
 * surface. Camera-fixed; the scene freezes the sim while it's open.
 */
export default class JournalPanel {
  private scene: Phaser.Scene;
  private memory: Memory;
  private quests: Quests;

  private g: Phaser.GameObjects.Graphics;
  private statics: Phaser.GameObjects.Text[] = [];
  private questTitle!: Phaser.GameObjects.Text;
  private questBody!: Phaser.GameObjects.Text;
  private fragTitles: Phaser.GameObjects.Text[] = [];
  private fragBodies: Phaser.GameObjects.Text[] = [];
  private countText!: Phaser.GameObjects.Text;
  private open = false;

  private readonly x = 70;
  private readonly y = 36;
  private readonly w = VIEW_W - 140;
  private readonly h = VIEW_H - 64;

  constructor(scene: Phaser.Scene, memory: Memory, quests: Quests) {
    this.scene = scene;
    this.memory = memory;
    this.quests = quests;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.text(this.x + 16, this.y + 10, "JOURNAL", "#eafdff", "13px", D);
    this.countText = this.text(this.x + this.w - 16, this.y + 10, "", "#8a5cff", "11px", D);
    this.countText.setOrigin(1, 0);

    this.text(this.x + 16, this.y + 34, "ACTIVE", "#f7ff3c", "10px", D);
    this.questTitle = this.text(this.x + 20, this.y + 48, "", "#39ff88", "12px", D);
    this.questBody = this.body(this.x + 20, this.y + 66, this.w - 40, D);

    this.text(this.x + 16, this.y + 104, "MEMORY", "#29e7ff", "10px", D);
    const startY = this.y + 120;
    const rowH = (this.h - 132) / FRAGMENTS.length;
    FRAGMENTS.forEach((_f, i) => {
      const ty = startY + i * rowH;
      this.fragTitles.push(this.text(this.x + 20, ty, "", "#39ff88", "11px", D));
      this.fragBodies.push(this.body(this.x + 30, ty + 14, this.w - 60, D));
    });

    this.text(this.x + this.w - 116, this.y + this.h - 18, "J / ESC to close", "#9aa3b2", "10px", D);
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

    const q = this.quests.active;
    const s = this.quests.currentStage;
    if (q && s) {
      this.questTitle.setText(`◆ ${q.name} — ${s.objective}`).setColor("#39ff88");
      this.questBody.setText(s.journal).setColor("#c8d2e0");
    } else if (this.quests.completed.length) {
      this.questTitle.setText("◆ (no active contract)").setColor("#9aa3b2");
      this.questBody.setText(`Completed: ${this.quests.completed.length}`).setColor("#5a6172");
    } else {
      this.questTitle.setText("◆ (no active contract)").setColor("#9aa3b2");
      this.questBody.setText("Find a contact in the plaza.").setColor("#5a6172");
    }

    FRAGMENTS.forEach((f, i) => {
      const known = this.memory.has(f.id);
      this.fragTitles[i]
        .setText(known ? `◆ ${f.title}` : "◇ ??? — [ENCRYPTED]")
        .setColor(known ? "#39ff88" : "#5a6172");
      this.fragBodies[i].setText(known ? f.lines.join(" ") : "").setColor("#9aa3b2");
    });
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.statics.forEach((t) => t.setVisible(v));
    this.questTitle?.setVisible(v);
    this.questBody?.setVisible(v);
    this.fragTitles.forEach((t) => t.setVisible(v));
    this.fragBodies.forEach((t) => t.setVisible(v));
  }

  private body(x: number, y: number, w: number, depth: number) {
    return this.scene.add
      .text(x, y, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        color: "#9aa3b2",
        lineSpacing: 2,
        wordWrap: { width: w },
      })
      .setScrollFactor(0)
      .setDepth(depth);
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
