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

const MAX_LINES = 8;

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

/** Persistent area chat — messages from everyone in the same zone/environment. */
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
  private hint!: Phaser.GameObjects.Text;
  private input!: Phaser.GameObjects.Text;

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
    this.frame = this.scene.add.graphics().setScrollFactor(0).setDepth(this.depth);
    drawPanelFrame(this.frame, this.x, this.y, this.w, this.h);

    this.title = this.scene.add
      .text(this.x + uiDim(12), this.y + uiDim(8), "◢ CHAT", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(11),
        color: "#00e5ff",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(this.depth + 1);

    this.body = this.scene.add
      .text(this.x + uiDim(12), this.y + uiDim(28), "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(11),
        color: "#cdd6e6",
        lineSpacing: uiDim(3),
        wordWrap: { width: this.w - uiDim(24) },
      })
      .setScrollFactor(0)
      .setDepth(this.depth + 1);

    this.hint = this.scene.add
      .text(this.x + uiDim(12), this.y + this.h - uiDim(22), "ENTER — talk to this area", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(10),
        color: "#6b7184",
      })
      .setScrollFactor(0)
      .setDepth(this.depth + 1);

    this.input = this.scene.add
      .text(this.x + uiDim(12), this.y + this.h - uiDim(40), "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(12),
        color: "#f7ff3c",
      })
      .setScrollFactor(0)
      .setDepth(this.depth + 2)
      .setVisible(false);
  }

  setArea(name: string) {
    this.title.setText(`◢ CHAT — ${name}`);
  }

  setMessages(lines: ChatLine[]) {
    const recent = lines.slice(-MAX_LINES);
    const parts: string[] = [];
    const colors: string[] = [];
    for (const c of recent) {
      const f = formatLine(c);
      parts.push(f.text);
      colors.push(f.color);
    }
    this.body.setText(parts.join("\n"));
    this.body.setColor("#eafdff");
  }

  setComposing(open: boolean, buffer: string) {
    this.input.setVisible(open);
    this.hint.setVisible(!open);
    if (open) this.input.setText(`> ${buffer}_`);
  }

  setVisible(visible: boolean) {
    this.frame.setVisible(visible);
    this.title.setVisible(visible);
    this.body.setVisible(visible);
    this.hint.setVisible(visible);
    if (!visible) this.input.setVisible(false);
  }

  destroy() {
    this.frame.destroy();
    this.title.destroy();
    this.body.destroy();
    this.hint.destroy();
    this.input.destroy();
  }
}