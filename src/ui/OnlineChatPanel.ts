import Phaser from "phaser";
import { COLORS } from "../config";
import { FACTION_COLORS } from "../net/sim";
import { drawPanelFrame } from "./panelChrome";
import { uiDim, uiFont } from "./uiLayout";

export interface ChatLine {
  from: string;
  ch: string;
  text: string;
  faction: number;
  sys: boolean;
}

const MAX_LINES = 8; // composing — the full framed feed
const TICKER_LINES = 4; // idle — a frameless whisper above the hotbar

function factionColor(faction: number): string {
  const c = FACTION_COLORS[faction] ?? COLORS.neonCyan;
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function formatLine(c: ChatLine): { text: string; color: string } {
  if (c.sys) return { text: `» ${c.text}`, color: "#9aa3b2" };
  const tag =
    c.ch === "whisper" ? "[whisper] " : c.ch === "party" ? "[party] " : c.ch === "guild" ? "[cell] " : "";
  return { text: `${tag}${c.from}: ${c.text}`, color: factionColor(c.faction) };
}

/**
 * Persistent area chat. IDLE it is just the last few lines of frameless text
 * hugging the hotbar — the game stays visible behind it. Pressing ENTER expands
 * the framed panel with the full feed + the compose line.
 */
export default class OnlineChatPanel {
  private scene: Phaser.Scene;
  private x: number;
  private y: number;
  private w: number;
  private h: number;
  private depth: number;
  private frame!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private body!: Phaser.GameObjects.Text;
  private input!: Phaser.GameObjects.Text;
  private expanded = false;
  private lines: ChatLine[] = [];
  private areaName = "";
  private shown = true;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, depth = 1000) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.depth = depth;
    this.build();
  }

  private build() {
    this.frame = this.scene.add.graphics().setScrollFactor(0).setDepth(this.depth).setVisible(false);
    drawPanelFrame(this.frame, this.x, this.y, this.w, this.h);

    this.title = this.scene.add
      .text(this.x + uiDim(12), this.y + uiDim(8), "◢ CHAT", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(11),
        color: "#00e5ff",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(this.depth + 1)
      .setVisible(false);

    // grows upward from its anchor so idle lines hug the hotbar
    this.body = this.scene.add
      .text(this.x + uiDim(12), this.y + this.h - uiDim(10), "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(11),
        color: "#cdd6e6",
        lineSpacing: uiDim(3),
        wordWrap: { width: this.w - uiDim(24) },
      })
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(this.depth + 1)
      .setShadow(0, uiDim(1), "#05060f", uiDim(3), true, true);

    this.input = this.scene.add
      .text(this.x + uiDim(12), this.y + this.h - uiDim(28), "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(12),
        color: "#f7ff3c",
      })
      .setScrollFactor(0)
      .setDepth(this.depth + 2)
      .setVisible(false);
  }

  private refresh() {
    const recent = this.lines.slice(-(this.expanded ? MAX_LINES : TICKER_LINES));
    this.body.setText(recent.map((c) => formatLine(c).text).join("\n"));
    this.body.setColor("#eafdff");
    this.body.setAlpha(this.expanded ? 1 : 0.8);
    // expanded: keep the feed clear of the compose line
    this.body.setY(this.y + this.h - (this.expanded ? uiDim(34) : uiDim(10)));
    this.title.setText(`◢ CHAT — ${this.areaName}`);
    const chrome = this.shown && this.expanded;
    this.frame.setVisible(chrome);
    this.title.setVisible(chrome);
  }

  setArea(name: string) {
    this.areaName = name;
    this.refresh();
  }

  setMessages(lines: ChatLine[]) {
    this.lines = lines;
    this.refresh();
  }

  setComposing(open: boolean, buffer: string) {
    this.expanded = open;
    this.input.setVisible(this.shown && open);
    if (open) this.input.setText(`> ${buffer}_`);
    this.refresh();
  }

  setVisible(visible: boolean) {
    this.shown = visible;
    this.body.setVisible(visible);
    if (!visible) {
      this.frame.setVisible(false);
      this.title.setVisible(false);
      this.input.setVisible(false);
    } else {
      this.refresh();
    }
  }

  destroy() {
    this.frame.destroy();
    this.title.destroy();
    this.body.destroy();
    this.input.destroy();
  }
}
