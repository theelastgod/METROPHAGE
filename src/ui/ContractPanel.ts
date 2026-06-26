import Phaser from "phaser";
import Contracts from "../systems/Contracts";
import { Contract, objectiveLabel } from "../game/contracts";
import { drawPanelFrame } from "./panelChrome";
import { overlayRect, uiDim, uiFont } from "./uiLayout";

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

  private readonly frame = overlayRect(18);
  private readonly x = this.frame.x;
  private readonly y = this.frame.y;
  private readonly w = this.frame.w;
  private readonly h = this.frame.h;
  private readonly cardW = (this.frame.w - uiDim(40)) / 3;

  constructor(scene: Phaser.Scene, contracts: Contracts, onAccept: (c: Contract) => void, onAbandon: () => void) {
    this.scene = scene;
    this.contracts = contracts;
    this.onAccept = onAccept;
    this.onAbandon = onAbandon;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.text(this.x + uiDim(18), this.y + uiDim(14), "CONTRACT BOARD", "#eafdff", 15, D);
    this.activeText = this.text(this.x + uiDim(18), this.y + uiDim(38), "", "#39ff88", 12, D);

    const abandonZone = scene.add
      .zone(this.x + this.w - uiDim(140), this.y + uiDim(34), uiDim(118), uiDim(22))
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
    this.text(this.x + this.w - uiDim(132), this.y + uiDim(38), "[ ABANDON ]", "#ff3b6b", 11, D + 1);

    for (let i = 0; i < 3; i++) {
      const cx = this.x + uiDim(22) + i * this.cardW;
      this.cardTexts.push(this.text(cx + uiDim(12), this.y + uiDim(84), "", "#eafdff", 11, D + 1));
      const z = scene.add
        .zone(cx, this.y + uiDim(76), this.cardW - uiDim(14), this.h - uiDim(118))
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      z.on("pointerdown", () => this.tryAccept(i));
      this.zones.push(z);
    }

    this.text(this.x + this.w - uiDim(130), this.y + this.h - uiDim(26), "E / ESC to close", "#9aa3b2", 11, D);
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
    if (!this.open || this.contracts.active) return;
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
      const cx = this.x + uiDim(22) + i * this.cardW;
      const c = this.contracts.offers[i];
      const cardH = this.h - uiDim(118);
      const dim = !!active;
      const col = c ? Phaser.Display.Color.HexStringToColor(DIFF_HEX[c.difficulty]).color : 0x3a3350;
      g.fillStyle(0x0c0a18, 0.92).fillRect(cx, this.y + uiDim(76), this.cardW - uiDim(14), cardH);
      g.lineStyle(uiDim(2), col, dim ? 0.4 : 0.9).strokeRect(cx, this.y + uiDim(76), this.cardW - uiDim(14), cardH);

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

  private text(x: number, y: number, s: string, color: string, sizePx: number, depth: number) {
    const t = this.scene.add
      .text(x, y, s, {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(sizePx),
        color,
        lineSpacing: uiDim(2),
      })
      .setScrollFactor(0)
      .setDepth(depth);
    this.statics.push(t);
    return t;
  }
}