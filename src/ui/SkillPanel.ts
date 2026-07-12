import Phaser from "phaser";
import { treeFor, SkillNode } from "../game/skills";
import Progression, { RESPEC_COST } from "../systems/Progression";
import { ClassDef } from "../game/classes";
import { drawPanelFrame } from "./panelChrome";
import { overlayRect, uiDim, uiFont } from "./uiLayout";
import { setFittedText } from "./typography";

const BRANCHES = ["ASSAULT", "CHASSIS", "SYSTEMS"];

/**
 * Skill-tree overlay (toggle K). Renders the class tree from data, spends points
 * on click (respecting prereqs/ranks), and respecs for currency. Camera-fixed;
 * the scene freezes the sim while it's open. onChange -> recompute stats + save.
 */
export default class SkillPanel {
  private scene: Phaser.Scene;
  private prog: Progression;
  private onChange: () => void;
  private g: Phaser.GameObjects.Graphics;
  private parts: Phaser.GameObjects.GameObject[] = [];
  private nodeTexts = new Map<string, Phaser.GameObjects.Text>();
  private header!: Phaser.GameObjects.Text;
  private respecText!: Phaser.GameObjects.Text;
  private open = false;

  private readonly frame = overlayRect(18);
  private readonly x = this.frame.x;
  private readonly y = this.frame.y;
  private readonly w = this.frame.w;
  private readonly h = this.frame.h;
  private readonly colW = (this.frame.w - uiDim(40)) / 3;
  private readonly nodeH = uiDim(48);

  constructor(scene: Phaser.Scene, classDef: ClassDef, prog: Progression, onChange: () => void) {
    this.scene = scene;
    this.prog = prog;
    this.onChange = onChange;

    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.header = this.text(this.x + uiDim(18), this.y + uiDim(14), "", "#eafdff", 15, D);
    BRANCHES.forEach((b, col) => this.text(this.colX(col) + uiDim(12), this.y + uiDim(48), b, classDef.hex, 12, D));

    for (const node of treeFor(classDef.id)) {
      const bx = this.colX(node.col) + uiDim(10);
      const by = this.rowY(node.row);
      const txt = this.text(bx + uiDim(10), by + uiDim(8), "", "#eafdff", 10, D + 1);
      this.nodeTexts.set(node.id, txt);
      const zone = scene.add
        .zone(bx, by, this.nodeW, this.nodeH)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => this.tryAllocate(node));
      this.parts.push(zone);
    }

    const ry = this.y + this.h - uiDim(34);
    this.respecText = this.text(this.x + uiDim(26), ry + uiDim(6), "", "#f7ff3c", 12, D + 1);
    const rzone = scene.add
      .zone(this.x + uiDim(18), ry, uiDim(160), uiDim(26))
      .setOrigin(0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    rzone.on("pointerdown", () => this.tryRespec());
    this.parts.push(rzone);

    this.text(this.x + this.w - uiDim(160), ry + uiDim(6), "K / ESC to close", "#9aa3b2", 11, D + 1);

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

  private get nodeW() {
    return this.colW - uiDim(18);
  }
  private colX(col: number) {
    return this.x + uiDim(22) + col * this.colW;
  }
  private rowY(row: number) {
    return this.y + uiDim(70) + row * uiDim(58);
  }

  private tryAllocate(node: SkillNode) {
    if (!this.open) return;
    if (this.prog.allocate(node)) {
      this.onChange();
      this.refresh();
    }
  }
  private tryRespec() {
    if (!this.open) return;
    if (this.prog.respec()) {
      this.onChange();
      this.refresh();
    }
  }

  private refresh() {
    const g = this.g;
    g.clear();
    drawPanelFrame(g, this.x, this.y, this.w, this.h);

    setFittedText(
      this.header,
      `SKILL TREE   LV ${this.prog.level}   POINTS ${this.prog.skillPoints}   ₵ ${this.prog.currency}`,
      this.w - uiDim(220),
      { minScale: 0.72 },
    );

    for (const node of treeFor(this.prog.classId)) {
      const rank = this.prog.rankOf(node.id);
      const can = this.prog.canAllocate(node);
      const maxed = rank >= node.maxRank;
      const locked = !!node.requires && this.prog.rankOf(node.requires) <= 0;
      const bx = this.colX(node.col) + uiDim(10);
      const by = this.rowY(node.row);

      const border = maxed ? 0x39ff88 : can ? 0xeafdff : locked ? 0x3a3350 : 0x6a6488;
      g.fillStyle(rank > 0 ? 0x14102a : 0x0c0a18, 0.92).fillRect(bx, by, this.nodeW, this.nodeH);
      g.lineStyle(can ? uiDim(2) : uiDim(1), border, locked ? 0.5 : 1).strokeRect(bx, by, this.nodeW, this.nodeH);

      const nodeText = this.nodeTexts.get(node.id)!;
      nodeText.setColor(locked ? "#6a6488" : "#eafdff").setAlpha(locked ? 0.7 : 1);
      setFittedText(nodeText, `${node.name}  ${rank}/${node.maxRank}\n${node.desc}`, this.nodeW - uiDim(20), { minScale: 0.68 });
    }

    const respecW = uiDim(160);
    const respecH = uiDim(26);
    g.fillStyle(0x1a1206, 0.9).fillRect(this.x + uiDim(18), this.y + this.h - uiDim(34), respecW, respecH);
    g.lineStyle(uiDim(1), 0xf7ff3c, 0.8).strokeRect(this.x + uiDim(18), this.y + this.h - uiDim(34), respecW, respecH);
    setFittedText(this.respecText, `RESPEC  (₵${RESPEC_COST})`, respecW - uiDim(16));
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.parts.forEach((p) => (p as Phaser.GameObjects.Zone).setVisible(v));
    this.nodeTexts.forEach((t) => t.setVisible(v));
    this.header.setVisible(v);
    this.respecText.setVisible(v);
    this.staticTexts.forEach((t) => t.setVisible(v));
  }

  private staticTexts: Phaser.GameObjects.Text[] = [];
  private text(x: number, y: number, s: string, color: string, sizePx: number, depth: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: uiFont(sizePx), color })
      .setScrollFactor(0)
      .setDepth(depth);
    this.staticTexts.push(t);
    return t;
  }
}
