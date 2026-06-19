import Phaser from "phaser";
import { VIEW_W, VIEW_H } from "../config";
import { treeFor, SkillNode } from "../game/skills";
import Progression, { RESPEC_COST } from "../systems/Progression";
import { ClassDef } from "../game/classes";

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

  private readonly x = 70;
  private readonly y = 40;
  private readonly w = VIEW_W - 140;
  private readonly h = VIEW_H - 80;
  private readonly colW = (VIEW_W - 140 - 40) / 3;

  constructor(scene: Phaser.Scene, classDef: ClassDef, prog: Progression, onChange: () => void) {
    this.scene = scene;
    this.prog = prog;
    this.onChange = onChange;

    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.header = this.text(this.x + 16, this.y + 12, "", "#eafdff", "13px", D);
    BRANCHES.forEach((b, col) =>
      this.text(this.colX(col) + 10, this.y + 44, b, classDef.hex, "11px", D),
    );

    for (const node of treeFor(classDef.id)) {
      const bx = this.colX(node.col) + 8;
      const by = this.rowY(node.row);
      const txt = this.text(bx + 8, by + 6, "", "#eafdff", "9px", D + 1);
      this.nodeTexts.set(node.id, txt);
      const zone = scene.add
        .zone(bx, by, this.nodeW, this.nodeH)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => this.tryAllocate(node));
      this.parts.push(zone);
    }

    // RESPEC button
    const ry = this.y + this.h - 30;
    this.respecText = this.text(this.x + 24, ry + 5, "", "#f7ff3c", "11px", D + 1);
    const rzone = scene.add
      .zone(this.x + 16, ry, 150, 22)
      .setOrigin(0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    rzone.on("pointerdown", () => this.tryRespec());
    this.parts.push(rzone);

    this.text(this.x + this.w - 150, ry + 5, "K / ESC to close", "#9aa3b2", "10px", D + 1);

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
    return this.colW - 16;
  }
  private get nodeH() {
    return 44;
  }
  private colX(col: number) {
    return this.x + 20 + col * this.colW;
  }
  private rowY(row: number) {
    return this.y + 64 + row * 54;
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
    g.fillStyle(0x07061a, 0.95).fillRect(this.x, this.y, this.w, this.h);
    g.lineStyle(2, 0x00e5ff, 0.9).strokeRect(this.x, this.y, this.w, this.h);

    this.header.setText(
      `SKILL TREE   LV ${this.prog.level}   POINTS ${this.prog.skillPoints}   ₵ ${this.prog.currency}`,
    );

    for (const node of treeFor(this.prog.classId)) {
      const rank = this.prog.rankOf(node.id);
      const can = this.prog.canAllocate(node);
      const maxed = rank >= node.maxRank;
      const locked = !!node.requires && this.prog.rankOf(node.requires) <= 0;
      const bx = this.colX(node.col) + 8;
      const by = this.rowY(node.row);

      const border = maxed ? 0x39ff88 : can ? 0xeafdff : locked ? 0x3a3350 : 0x6a6488;
      g.fillStyle(rank > 0 ? 0x14102a : 0x0c0a18, 0.92).fillRect(bx, by, this.nodeW, this.nodeH);
      g.lineStyle(can ? 2 : 1, border, locked ? 0.5 : 1).strokeRect(bx, by, this.nodeW, this.nodeH);

      this.nodeTexts
        .get(node.id)!
        .setText(`${node.name}  ${rank}/${node.maxRank}\n${node.desc}`)
        .setColor(locked ? "#6a6488" : "#eafdff")
        .setAlpha(locked ? 0.7 : 1);
    }

    g.fillStyle(0x1a1206, 0.9).fillRect(this.x + 16, this.y + this.h - 30, 150, 22);
    g.lineStyle(1, 0xf7ff3c, 0.8).strokeRect(this.x + 16, this.y + this.h - 30, 150, 22);
    this.respecText.setText(`RESPEC  (₵${RESPEC_COST})`);
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
  private text(x: number, y: number, s: string, color: string, size: string, depth: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: size, color })
      .setScrollFactor(0)
      .setDepth(depth);
    this.staticTexts.push(t);
    return t;
  }
}
