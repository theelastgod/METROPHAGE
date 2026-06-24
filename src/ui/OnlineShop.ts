import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";

// METROPHAGE online vendor — the credits sink. A field-patch heal + gear "caches" that
// roll an item of a guaranteed rarity into your bag. The server validates + deducts
// credits (authoritative); this panel just lists the catalogue and fires buy requests.
// SKUs mirror the server SHOP table in world.ts.
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
  private repTier = 0; // reputation tier — gates the higher caches (set by the scene)

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

  /** Live-update the credits header (the scene calls this each frame while open). */
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
    const w = 560;
    const h = 80 + SKUS.length * 54;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;

    add(scene.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x02020a, 0.62).setScrollFactor(0).setDepth(D));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(2, COLORS.neonYellow, 0.85).strokeRect(x, y, w, h);
    g.lineStyle(2, COLORS.neonMagenta, 0.9);
    g.beginPath();
    g.moveTo(x, y + 16);
    g.lineTo(x, y);
    g.lineTo(x + 16, y);
    g.strokePath();

    add(
      scene.add
        .text(x + 18, y + 14, "◢ VENDOR — BLACK MARKET", {
          fontFamily: "Courier New, monospace",
          fontSize: "16px",
          color: "#f7ff3c",
          fontStyle: "bold",
        })
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
    this.creditsText = add(
      scene.add
        .text(x + w - 18, y + 16, "₵ 0", {
          fontFamily: "Courier New, monospace",
          fontSize: "14px",
          color: "#f7ff3c",
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(D + 2),
    );

    SKUS.forEach((s, i) => {
      const ry = y + 52 + i * 54;
      const locked = !!s.repReq && this.repTier < s.repReq; // rep gate (vendor tiers)
      const strokeCol = locked ? 0x3a3350 : Phaser.Display.Color.HexStringToColor(s.color).color;
      g.fillStyle(0x12102a, locked ? 0.6 : 0.92).fillRect(x + 16, ry, w - 32, 46);
      g.lineStyle(1.5, strokeCol, locked ? 0.4 : 0.9).strokeRect(x + 16, ry, w - 32, 46);
      add(
        scene.add
          .text(x + 28, ry + 7, s.label, { fontFamily: "Courier New, monospace", fontSize: "13px", color: locked ? "#5a6172" : s.color, fontStyle: "bold" })
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      add(
        scene.add
          .text(x + 28, ry + 26, s.desc, { fontFamily: "Courier New, monospace", fontSize: "10px", color: locked ? "#4a5266" : "#9aa3b2" })
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      add(
        scene.add
          .text(x + w - 28, ry + 16, locked ? `🔒 REP TIER ${s.repReq}` : `₵ ${s.price}  ▸ BUY`, {
            fontFamily: "Courier New, monospace",
            fontSize: "13px",
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
            .zone(x + 16, ry, w - 32, 46)
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
        .text(VIEW_W / 2, y + h - 18, "click to buy · B / ESC to close", {
          fontFamily: "Courier New, monospace",
          fontSize: "11px",
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
