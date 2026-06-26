import Phaser from "phaser";
import { COLORS } from "../config";
import { dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";

const SKUS: { sku: string; label: string; price: number; desc: string; color: string; repReq?: number }[] = [
  { sku: "heal", label: "FIELD PATCH", price: 40, desc: "restore to full HP", color: "#39ff88" },
  { sku: "cache_standard", label: "SALVAGE CACHE", price: 60, desc: "a Standard gear roll", color: "#9aa3b2" },
  { sku: "cache_tuned", label: "TUNED CACHE", price: 180, desc: "a Tuned gear roll", color: "#39ff88" },
  { sku: "cache_blackice", label: "BLACK-ICE CACHE", price: 480, desc: "a Black-ICE gear roll", color: "#29e7ff", repReq: 1 },
  { sku: "cache_singular", label: "SINGULAR CACHE", price: 1200, desc: "a Singular gear roll", color: "#ff2bd6", repReq: 2 },
];

export default class OnlineShop {
  open = false;
  onBuy?: (sku: string) => void;
  private scene: Phaser.Scene;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private creditsText?: Phaser.GameObjects.Text;
  private repTier = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setRep(tier: number) {
    this.repTier = tier;
    if (this.open) this.build();
  }

  toggle() {
    this.open = !this.open;
    if (this.open) this.build();
    else this.clear();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.clear();
  }

  setCredits(n: number) {
    this.creditsText?.setText(`₵ ${n}`);
  }

  private clear() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.creditsText = undefined;
  }

  private build() {
    this.clear();
    const scene = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const D = 1700;
    const rowH = uiDim(56);
    const { x, y, w, h } = modalRect(580, 88 + SKUS.length * 56);

    add(dimBackdrop(scene, D));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), COLORS.neonYellow, 0.85).strokeRect(x, y, w, h);
    g.lineStyle(uiDim(2), COLORS.neonMagenta, 0.9);
    const corner = uiDim(16);
    g.beginPath();
    g.moveTo(x, y + corner);
    g.lineTo(x, y);
    g.lineTo(x + corner, y);
    g.strokePath();

    add(
      scene.add
        .text(x + uiDim(20), y + uiDim(16), "◢ VENDOR — BLACK MARKET", {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(17),
          color: "#f7ff3c",
          fontStyle: "bold",
        })
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
    this.creditsText = add(
      scene.add
        .text(x + w - uiDim(20), y + uiDim(18), "₵ 0", {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(15),
          color: "#f7ff3c",
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(D + 2),
    );

    SKUS.forEach((s, i) => {
      const ry = y + uiDim(56) + i * rowH;
      const locked = !!s.repReq && this.repTier < s.repReq;
      const strokeCol = locked ? 0x3a3350 : Phaser.Display.Color.HexStringToColor(s.color).color;
      const cardH = uiDim(48);
      g.fillStyle(0x12102a, locked ? 0.6 : 0.92).fillRect(x + uiDim(18), ry, w - uiDim(36), cardH);
      g.lineStyle(uiDim(1.5), strokeCol, locked ? 0.4 : 0.9).strokeRect(x + uiDim(18), ry, w - uiDim(36), cardH);
      add(
        scene.add
          .text(x + uiDim(30), ry + uiDim(8), s.label, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(14),
            color: locked ? "#5a6172" : s.color,
            fontStyle: "bold",
          })
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      add(
        scene.add
          .text(x + uiDim(30), ry + uiDim(28), s.desc, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(11),
            color: locked ? "#4a5266" : "#9aa3b2",
          })
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      add(
        scene.add
          .text(x + w - uiDim(30), ry + uiDim(18), locked ? `🔒 REP TIER ${s.repReq}` : `₵ ${s.price}  ▸ BUY`, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(14),
            color: locked ? "#5a6172" : "#f7ff3c",
            fontStyle: "bold",
          })
          .setOrigin(1, 0)
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      if (!locked) {
        const z = add(
          scene.add
            .zone(x + uiDim(18), ry, w - uiDim(36), cardH)
            .setOrigin(0)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true })
            .setDepth(D + 3),
        );
        z.on("pointerdown", () => this.onBuy?.(s.sku));
      }
    });

    add(
      scene.add
        .text(x + w / 2, y + h - uiDim(22), "click to buy · B / ESC to close", {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(12),
          color: "#9aa3b2",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
  }

  destroy() {
    this.clear();
  }
}