import Phaser from "phaser";
import Memory from "../systems/Memory";
import Quests from "../systems/Quests";
import { FRAGMENTS } from "../game/fragments";
import { drawPanelFrame } from "./panelChrome";
import { overlayRect, uiDim, uiFont } from "./uiLayout";

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

  private readonly frame = overlayRect(18);
  private readonly x = this.frame.x;
  private readonly y = this.frame.y;
  private readonly w = this.frame.w;
  private readonly h = this.frame.h;

  constructor(scene: Phaser.Scene, memory: Memory, quests: Quests) {
    this.scene = scene;
    this.memory = memory;
    this.quests = quests;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.text(this.x + uiDim(18), this.y + uiDim(12), "JOURNAL", "#eafdff", 15, D);
    this.countText = this.text(this.x + this.w - uiDim(18), this.y + uiDim(12), "", "#8a5cff", 12, D);
    this.countText.setOrigin(1, 0);

    this.text(this.x + uiDim(18), this.y + uiDim(38), "ACTIVE", "#f7ff3c", 11, D);
    this.questTitle = this.text(this.x + uiDim(22), this.y + uiDim(54), "", "#39ff88", 13, D);
    this.questBody = this.body(this.x + uiDim(22), this.y + uiDim(74), this.w - uiDim(44), D);

    this.text(this.x + uiDim(18), this.y + uiDim(112), "MEMORY", "#29e7ff", 11, D);
    const startY = this.y + uiDim(130);
    const rowH = (this.h - uiDim(142)) / FRAGMENTS.length;
    FRAGMENTS.forEach((_f, i) => {
      const ty = startY + i * rowH;
      this.fragTitles.push(this.text(this.x + uiDim(22), ty, "", "#39ff88", 12, D));
      this.fragBodies.push(this.body(this.x + uiDim(32), ty + uiDim(16), this.w - uiDim(64), D));
    });

    this.text(this.x + this.w - uiDim(124), this.y + this.h - uiDim(22), "J / ESC to close", "#9aa3b2", 11, D);
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
        fontSize: uiFont(11),
        color: "#9aa3b2",
        lineSpacing: uiDim(2),
        wordWrap: { width: w },
      })
      .setScrollFactor(0)
      .setDepth(depth);
  }

  private text(x: number, y: number, s: string, color: string, sizePx: number, depth: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: uiFont(sizePx), color })
      .setScrollFactor(0)
      .setDepth(depth);
    this.statics.push(t);
    return t;
  }
}