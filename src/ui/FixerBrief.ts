// Compact campaign brief from THE FIXER — not the daily contracts board.
// Clamped to the viewport so body copy stays readable on mobile + desktop.
import Phaser from "phaser";
import { COLORS } from "../config";
import { dimBackdrop, fitModalRect, uiDim } from "./uiLayout";
import { bodyFont, displayFont } from "./typography";
import { prefersMobileUx } from "../systems/Mobile";

/**
 * Mid-screen brief for personal campaign (THE WAKE…).
 * Intentionally separate from OnlineContracts so talking to THE FIXER never
 * looks like "daily contracts".
 */
export default class FixerBrief {
  private scene: Phaser.Scene;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private bodyText?: Phaser.GameObjects.Text;
  private titleText?: Phaser.GameObjects.Text;
  private open = false;
  private backdrop?: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get isOpen() {
    return this.open;
  }

  show(opts: { quest: string; title: string; text: string; objective: string }) {
    this.clear();
    this.open = true;
    const D = 1750;
    const mobile = prefersMobileUx();
    // Compact card — was 520×300 design which felt huge and clipped on phones.
    const { x, y, w, h } = fitModalRect(mobile ? 320 : 400, mobile ? 200 : 240, {
      marginDesign: mobile ? 10 : 24,
      vAlign: mobile ? "upper" : "center",
    });
    this.backdrop = dimBackdrop(this.scene, D, 0.55, () => this.close(), { x, y, w, h });
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const g = add(this.scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRoundedRect(x, y, w, h, uiDim(6));
    g.lineStyle(uiDim(2), COLORS.neonGreen, 0.9).strokeRoundedRect(x, y, w, h, uiDim(6));
    g.fillStyle(COLORS.neonGreen, 0.12).fillRect(x, y, w, uiDim(32));

    const pad = uiDim(14);
    this.titleText = add(
      this.scene.add
        .text(x + pad, y + uiDim(8), `THE FIXER · ${opts.quest}`, displayFont(mobile ? 11 : 13, {
          color: "#39ff88",
          fontStyle: "bold",
        }))
        .setScrollFactor(0)
        .setDepth(D + 3),
    );
    add(
      this.scene.add
        .text(x + w - pad, y + uiDim(10), mobile ? "tap outside" : "ESC / outside", bodyFont(9, { color: "#6b7184" }))
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(D + 3),
    );

    const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
    const maxChars = mobile ? 200 : 280;
    const body = `${opts.title}\n\n${clip(opts.text.replace(/\n+/g, " "), maxChars)}\n\n▸ ${opts.objective}`;
    const btnH = uiDim(32);
    const bodyBottom = y + h - uiDim(48) - btnH;
    const bodyTop = y + uiDim(40);
    const bodyMaxH = Math.max(uiDim(60), bodyBottom - bodyTop);

    this.bodyText = add(
      this.scene.add
        .text(x + pad, bodyTop, body, {
          fontFamily: "Courier New, monospace",
          fontSize: `${uiDim(mobile ? 10 : 11)}px`,
          color: "#eafdff",
          wordWrap: { width: w - pad * 2 },
          lineSpacing: 3,
        })
        .setScrollFactor(0)
        .setDepth(D + 3),
    );
    // If body still overflows the card, tighten the clip.
    if (this.bodyText.height > bodyMaxH) {
      const tighter = `${opts.title}\n\n${clip(opts.text.replace(/\n+/g, " "), mobile ? 120 : 180)}\n\n▸ ${clip(opts.objective, 60)}`;
      this.bodyText.setText(tighter);
    }

    const btnW = uiDim(140);
    const bx = x + w / 2 - btnW / 2;
    const by = y + h - uiDim(14) - btnH;
    g.fillStyle(0x39ff88, 0.2).fillRoundedRect(bx, by, btnW, btnH, uiDim(4));
    g.lineStyle(uiDim(1.5), 0x39ff88, 0.95).strokeRoundedRect(bx, by, btnW, btnH, uiDim(4));
    const btn = add(
      this.scene.add
        .text(x + w / 2, by + btnH / 2, "GOT IT →", displayFont(11, { color: "#39ff88", fontStyle: "bold" }))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(D + 4)
        .setInteractive({ useHandCursor: true }),
    );
    btn.on("pointerdown", () => this.close());
    const zone = add(
      this.scene.add
        .zone(bx, by, btnW, btnH)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(D + 5)
        .setInteractive({ useHandCursor: true }),
    );
    zone.on("pointerdown", () => this.close());
  }

  /** Update copy if the brief is already open (story arrived after engage). */
  update(opts: { quest: string; title: string; text: string; objective: string }) {
    if (!this.open) {
      this.show(opts);
      return;
    }
    const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
    this.titleText?.setText(`THE FIXER · ${opts.quest}`);
    this.bodyText?.setText(`${opts.title}\n\n${clip(opts.text.replace(/\n+/g, " "), 240)}\n\n▸ ${opts.objective}`);
  }

  close() {
    this.clear();
    this.open = false;
  }

  private clear() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.backdrop?.destroy();
    this.backdrop = undefined;
    this.bodyText = undefined;
    this.titleText = undefined;
  }

  destroy() {
    this.close();
  }
}
