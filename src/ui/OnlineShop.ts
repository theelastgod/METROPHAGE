import Phaser from "phaser";
import { COLORS } from "../config";
import Modal from "./Modal";
import { dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";
import { prefersMobileUx } from "../systems/Mobile";
import { fitTextToWidth } from "./typography";

/** Keep prices in sync with server SHOP (primary economy sink). */
const SKUS: { sku: string; label: string; price: number; desc: string; color: string; repReq?: number }[] = [
  { sku: "heal", label: "FIELD PATCH", price: 95, desc: "restore to full HP", color: "#39ff88" },
  { sku: "supply_kit", label: "SUPPLY KIT", price: 140, desc: "+2 data cores (pure sink)", color: "#f7ff3c" },
  { sku: "reprint_chip", label: "REPRINT CHIP", price: 220, desc: "insurance stamp — pure sink", color: "#ff9d3c" },
  { sku: "core_bundle", label: "CORE BUNDLE", price: 240, desc: "+3 data cores for forging", color: "#29e7ff" },
  { sku: "cache_standard", label: "SALVAGE CACHE", price: 180, desc: "a Standard gear roll", color: "#9aa3b2" },
  { sku: "cache_tuned", label: "TUNED CACHE", price: 420, desc: "a Tuned gear roll", color: "#39ff88" },
  { sku: "core_crate", label: "CORE CRATE", price: 620, desc: "+8 cores — bulk forge fuel", color: "#00e5ff", repReq: 1 },
  { sku: "cache_blackice", label: "BLACK-ICE CACHE", price: 1180, desc: "a Black-ICE gear roll", color: "#29e7ff", repReq: 1 },
  { sku: "cache_singular", label: "SINGULAR CACHE", price: 2800, desc: "a Singular gear roll", color: "#ff2bd6", repReq: 2 },
];

export default class OnlineShop extends Modal {
  onBuy?: (sku: string) => void;
  private creditsText?: Phaser.GameObjects.Text;
  private repTier = 0;

  setRep(tier: number) {
    this.repTier = tier;
    if (this.open) this.build();
  }

  toggle() {
    this.toggleOpen();
  }

  setCredits(n: number) {
    this.creditsText?.setText(`₵ ${n}`);
  }

  protected clear() {
    super.clear();
    this.creditsText = undefined;
  }

  protected build() {
    this.clear();
    const scene = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const D = 1700;
    const { x, y, w, h } = modalRect(580, 88 + SKUS.length * 56);

    add(dimBackdrop(scene, D, 0.62, () => this.close(), { x, y, w, h }));
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

    const title = add(
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
    fitTextToWidth(title, w - uiDim(170));
    this.creditsText = add(
      scene.add
        .text(x + w - uiDim(20), y + uiDim(18), "₵ 0", {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(14),
          color: "#f7ff3c",
          fontStyle: "bold",
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
    add(
      scene.add
        .text(x + uiDim(20), y + uiDim(38), "prices are sinks — ₵ burns here, not on the street", {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(10),
          color: "#6b7184",
        })
        .setScrollFactor(0)
        .setDepth(D + 2),
    );

    const mobile = prefersMobileUx();
    SKUS.forEach((s, i) => {
      const ry = y + uiDim(58) + i * uiDim(56);
      const locked = !!(s.repReq && this.repTier < s.repReq);
      g.fillStyle(locked ? 0x0c0a14 : 0x12102a, 0.95).fillRect(x + uiDim(14), ry, w - uiDim(28), uiDim(48));
      g.lineStyle(1, locked ? 0x3a3548 : 0x2a3450, 0.9).strokeRect(x + uiDim(14), ry, w - uiDim(28), uiDim(48));
      add(
        scene.add
          .text(x + uiDim(26), ry + uiDim(8), s.label, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(mobile ? 12 : 13),
            color: locked ? "#5a6172" : s.color,
            fontStyle: "bold",
          })
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      add(
        scene.add
          .text(x + uiDim(26), ry + uiDim(26), locked ? `rep tier ${s.repReq} required` : s.desc, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(10),
            color: "#7a8190",
          })
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      add(
        scene.add
          .text(x + w - uiDim(110), ry + uiDim(16), `₵${s.price}`, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(13),
            color: locked ? "#5a6172" : "#f7ff3c",
            fontStyle: "bold",
          })
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      if (!locked) {
        const z = add(
          scene.add
            .zone(x + uiDim(14), ry, w - uiDim(28), uiDim(48))
            .setOrigin(0)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true })
            .setDepth(D + 3),
        );
        z.on("pointerdown", () => this.onBuy?.(s.sku));
      }
    });
  }
}
