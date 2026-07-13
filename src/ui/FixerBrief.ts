// Compact campaign brief from THE FIXER — not the daily contracts board.
import Phaser from "phaser";
import { COLORS } from "../config";
import { dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";
import { bodyFont, displayFont } from "./typography";

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
    const { x, y, w, h } = modalRect(520, 300);
    this.backdrop = dimBackdrop(this.scene, D, 0.55, () => this.close(), { x, y, w, h });
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const g = add(this.scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), COLORS.neonGreen, 0.9).strokeRect(x, y, w, h);
    g.fillStyle(COLORS.neonGreen, 0.12).fillRect(x, y, w, uiDim(36));

    this.titleText = add(
      this.scene.add
        .text(x + uiDim(18), y + uiDim(10), `THE FIXER · ${opts.quest}`, displayFont(14, { color: "#39ff88", fontStyle: "bold" }))
        .setScrollFactor(0)
        .setDepth(D + 3),
    );
    add(
      this.scene.add
        .text(x + w - uiDim(16), y + uiDim(12), "ESC / click outside", bodyFont(10, { color: "#6b7184" }))
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(D + 3),
    );

    const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
    const body = `${opts.title}\n\n${clip(opts.text.replace(/\n+/g, " "), 320)}\n\n▸ ${opts.objective}`;
    this.bodyText = add(
      this.scene.add
        .text(x + uiDim(18), y + uiDim(48), body, {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(12),
          color: "#eafdff",
          wordWrap: { width: w - uiDim(36) },
          lineSpacing: 4,
        })
        .setScrollFactor(0)
        .setDepth(D + 3),
    );

    // Primary dismiss / acknowledge
    const btnW = uiDim(160);
    const btnH = uiDim(36);
    const bx = x + w / 2 - btnW / 2;
    const by = y + h - uiDim(48);
    g.fillStyle(0x39ff88, 0.2).fillRoundedRect(bx, by, btnW, btnH, 4);
    g.lineStyle(uiDim(1.5), 0x39ff88, 0.95).strokeRoundedRect(bx, by, btnW, btnH, 4);
    const btn = add(
      this.scene.add
        .text(x + w / 2, by + btnH / 2, "GOT IT →", displayFont(12, { color: "#39ff88", fontStyle: "bold" }))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(D + 4)
        .setInteractive({ useHandCursor: true }),
    );
    btn.on("pointerdown", () => this.close());
    const zone = add(
      this.scene.add.zone(bx, by, btnW, btnH).setOrigin(0).setScrollFactor(0).setDepth(D + 5).setInteractive({ useHandCursor: true }),
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
    this.bodyText?.setText(`${opts.title}\n\n${clip(opts.text.replace(/\n+/g, " "), 320)}\n\n▸ ${opts.objective}`);
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
