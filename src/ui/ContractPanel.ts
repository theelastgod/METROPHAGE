import Phaser from "phaser";
import { VIEW_W, VIEW_H } from "../config";
import Contracts from "../systems/Contracts";
import { Contract, objectiveLabel } from "../game/contracts";
import { drawPanelFrame } from "./panelChrome";

const DIFF_HEX = ["#9aa3b2", "#9aa3b2", "#29e7ff", "#ff2bd6"]; // index by difficulty

function needLabel(c: Contract): string {
  const o = c.objectives[0];
  switch (o.type) {
    case "eliminate":
      return `Kill ${o.need} cops`;
    case "hack":
      return `Break ${o.need} shields`;
    case "hold":
      return `Hold a zone ${o.need}s`;
    case "deliver":
      return "Reach the marker";
    case "infect":
      return "Infect the node";
  }
}

/**
 * Contract board overlay. Lists 3 offers (click to accept) + the active contract
 * with progress (and abandon). onAccept/onAbandon let the scene assign zones,
 * show briefings, and persist. Camera-fixed; scene freezes the sim while open.
 */
export default class ContractPanel {
  private scene: Phaser.Scene;
  private contracts: Contracts;
  private onAccept: (c: Contract) => void;
  private onAbandon: () => void;

  private g: Phaser.GameObjects.Graphics;
  private statics: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private activeText!: Phaser.GameObjects.Text;
  private cardTexts: Phaser.GameObjects.Text[] = [];
  private open = false;

  private readonly x = 70;
  private readonly y = 40;
  private readonly w = VIEW_W - 140;
  private readonly h = VIEW_H - 70;
  private readonly cardW = (VIEW_W - 140 - 40) / 3;

  constructor(scene: Phaser.Scene, contracts: Contracts, onAccept: (c: Contract) => void, onAbandon: () => void) {
    this.scene = scene;
    this.contracts = contracts;
    this.onAccept = onAccept;
    this.onAbandon = onAbandon;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.text(this.x + 16, this.y + 12, "CONTRACT BOARD", "#eafdff", "13px", D);
    this.activeText = this.text(this.x + 16, this.y + 34, "", "#39ff88", "11px", D);

    const abandonZone = scene.add
      .zone(this.x + this.w - 130, this.y + 32, 110, 20)
      .setOrigin(0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    abandonZone.on("pointerdown", () => {
      if (this.open && this.contracts.active) {
        this.onAbandon();
        this.refresh();
      }
    });
    this.zones.push(abandonZone);
    this.text(this.x + this.w - 124, this.y + 34, "[ ABANDON ]", "#ff3b6b", "10px", D + 1);

    for (let i = 0; i < 3; i++) {
      const cx = this.x + 20 + i * this.cardW;
      this.cardTexts.push(this.text(cx + 10, this.y + 78, "", "#eafdff", "10px", D + 1));
      const z = scene.add
        .zone(cx, this.y + 70, this.cardW - 12, this.h - 110)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      z.on("pointerdown", () => this.tryAccept(i));
      this.zones.push(z);
    }

    this.text(this.x + this.w - 122, this.y + this.h - 22, "E / ESC to close", "#9aa3b2", "10px", D);
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

  private tryAccept(i: number) {
    if (!this.open || this.contracts.active) return; // one at a time
    const c = this.contracts.offers[i];
    if (!c) return;
    this.onAccept(c);
    this.refresh();
  }

  refresh() {
    const g = this.g;
    g.clear();
    drawPanelFrame(g, this.x, this.y, this.w, this.h);

    const active = this.contracts.active;
    this.activeText.setText(
      active
        ? `ACTIVE: ${active.name} — ${objectiveLabel(active.objectives[0])}`
        : "ACTIVE: (none — accept a contract below)",
    );

    for (let i = 0; i < 3; i++) {
      const cx = this.x + 20 + i * this.cardW;
      const c = this.contracts.offers[i];
      const cardH = this.h - 110;
      const dim = !!active; // can't accept while one is active
      const col = c ? Phaser.Display.Color.HexStringToColor(DIFF_HEX[c.difficulty]).color : 0x3a3350;
      g.fillStyle(0x0c0a18, 0.92).fillRect(cx, this.y + 70, this.cardW - 12, cardH);
      g.lineStyle(2, col, dim ? 0.4 : 0.9).strokeRect(cx, this.y + 70, this.cardW - 12, cardH);

      if (c) {
        const r = c.rewards;
        this.cardTexts[i]
          .setText(
            `${c.name}\n${c.authored ? "◆ STORY" : "DIFF " + c.difficulty}\n\n${needLabel(c)}\n\n` +
              `REWARD\n+${r.xp} XP   ₵${r.currency}\n${r.loot}x loot\n\n` +
              (dim ? "(finish active first)" : "▶ ACCEPT"),
          )
          .setColor(dim ? "#5a6172" : DIFF_HEX[c.difficulty])
          .setAlpha(dim ? 0.6 : 1);
      } else {
        this.cardTexts[i].setText("");
      }
    }
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.zones.forEach((z) => z.setVisible(v));
    this.statics.forEach((t) => t.setVisible(v));
  }

  private text(x: number, y: number, s: string, color: string, size: string, depth: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: size, color, lineSpacing: 2 })
      .setScrollFactor(0)
      .setDepth(depth);
    this.statics.push(t);
    return t;
  }
}
