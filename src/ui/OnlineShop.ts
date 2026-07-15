import Phaser from "phaser";
import { COLORS, VIEW_W, VIEW_H } from "../config";
import Modal from "./Modal";
import { closeHint, dimBackdrop, fitModalRect, uiDim, uiFont } from "./uiLayout";
import { prefersMobileUx } from "../systems/Mobile";
import { bodyFont, displayFont, fitTextToWidth } from "./typography";
import { drawPanelFrame } from "./panelChrome";
import { STUDIO, addPanelGlow, animatePanelIn, drawScanlines } from "./studioChrome";

/** Keep prices in sync with server SHOP (primary economy sink). */
const SKUS: {
  sku: string;
  label: string;
  price: number;
  desc: string;
  color: string;
  repReq?: number;
}[] = [
  // Keep in sync with server SHOP (world.ts) — credit sinks vs CREDITS_PER_KILL.
  { sku: "heal", label: "FIELD PATCH", price: 120, desc: "Restore to full HP", color: "#39ff88" },
  { sku: "supply_kit", label: "SUPPLY KIT", price: 165, desc: "+2 data cores", color: "#f7ff3c" },
  { sku: "reprint_chip", label: "REPRINT CHIP", price: 260, desc: "Insurance stamp (sink)", color: "#ff9d3c" },
  { sku: "core_bundle", label: "CORE BUNDLE", price: 280, desc: "+3 data cores", color: "#29e7ff" },
  { sku: "cache_standard", label: "SALVAGE CACHE", price: 220, desc: "Standard gear roll", color: "#9aa3b2" },
  { sku: "cache_tuned", label: "TUNED CACHE", price: 480, desc: "Tuned gear roll", color: "#39ff88" },
  { sku: "core_crate", label: "CORE CRATE", price: 720, desc: "+8 cores · bulk fuel", color: "#00e5ff", repReq: 1 },
  { sku: "cache_blackice", label: "BLACK-ICE CACHE", price: 1320, desc: "Black-ICE gear roll", color: "#29e7ff", repReq: 1 },
  { sku: "cache_singular", label: "SINGULAR CACHE", price: 3200, desc: "Singular gear roll", color: "#ff2bd6", repReq: 2 },
];

/**
 * Vendor / black market — compact catalog of ₵ sinks.
 * Desktop: content-height card. Mobile: full-bleed sheet with large buy rows.
 */
export default class OnlineShop extends Modal {
  onBuy?: (sku: string) => void;
  private creditsText?: Phaser.GameObjects.Text;
  private credits = 0;
  private repTier = 0;

  setRep(tier: number) {
    this.repTier = tier;
    if (this.open) this.build();
  }

  toggle() {
    this.toggleOpen();
  }

  setCredits(n: number) {
    this.credits = n;
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
    const mobile = prefersMobileUx();

    // ── Geometry ──────────────────────────────────────────────────────────
    // Content-sized on desktop; near full-screen sheet on phones (but layout
    // still fills the sheet cleanly — no orphan header + empty void).
    const headerH = uiDim(mobile ? 64 : 56);
    const footerH = uiDim(mobile ? 40 : 32);
    const rowGap = uiDim(mobile ? 6 : 4);
    const listPad = uiDim(mobile ? 12 : 14);
    // Target row height; will shrink slightly if needed to fit all SKUs.
    let rowH = uiDim(mobile ? 54 : 46);
    let x: number, y: number, w: number, h: number;
    if (mobile) {
      const m = uiDim(6);
      x = m;
      y = m;
      w = VIEW_W - m * 2;
      h = VIEW_H - m * 2;
    } else {
      // Content-height card (design-space), clamped to viewport.
      const r = fitModalRect(520, 92 + SKUS.length * 50, { marginDesign: 24 });
      x = r.x;
      y = r.y;
      w = r.w;
      h = r.h;
    }
    // Pack rows into the list area so nothing overflows the frame.
    // Never force a min row taller than the packed fit — that used to push
    // the last clerk SKUs off-screen on short viewports.
    let visibleSkus = SKUS;
    {
      const avail = h - headerH - footerH - uiDim(12);
      const n = SKUS.length;
      const packed = Math.floor((avail - (n - 1) * rowGap) / n);
      const absMin = uiDim(mobile ? 36 : 32);
      if (packed >= absMin) {
        rowH = Math.min(rowH, packed);
      } else if (packed > 0) {
        rowH = packed; // tight but still fits every SKU
      } else {
        // Extreme short height: show as many full min-rows as fit.
        rowH = absMin;
        const fit = Math.max(1, Math.floor((avail + rowGap) / (rowH + rowGap)));
        visibleSkus = SKUS.slice(0, fit);
      }
    }

    add(dimBackdrop(scene, D, 0.68, () => this.close(), { x, y, w, h }));
    add(addPanelGlow(scene, x, y, w, h, COLORS.neonYellow, 0.1).setScrollFactor(0).setDepth(D + 0.5));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    drawPanelFrame(g, x, y, w, h, COLORS.neonYellow, scene);
    drawScanlines(g, x + uiDim(10), y + headerH, w - uiDim(20), h - headerH - footerH, 0xf7ff3c, 0.02);

    // ── Header ────────────────────────────────────────────────────────────
    const pad = listPad;
    const title = add(
      scene.add
        .text(x + pad, y + uiDim(mobile ? 14 : 12), "BLACK MARKET", displayFont(mobile ? 16 : 15, { color: "#f7ff3c", fontStyle: "bold" }))
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
    fitTextToWidth(title, w - uiDim(180));

    add(
      scene.add
        .text(x + pad, y + uiDim(mobile ? 36 : 32), "₵ sinks · gear & supplies", bodyFont(10, { color: STUDIO.dim }))
        .setScrollFactor(0)
        .setDepth(D + 2),
    );

    // Credits (center-right of header)
    this.creditsText = add(
      scene.add
        .text(x + w - pad - uiDim(mobile ? 52 : 8), y + uiDim(mobile ? 16 : 14), `₵ ${this.credits}`, displayFont(mobile ? 15 : 14, { color: STUDIO.credits, fontStyle: "bold" }))
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(D + 2),
    );

    // Close button — dedicated hit target, never overlaps credits
    const closeW = uiDim(mobile ? 44 : 36);
    const closeH = uiDim(mobile ? 40 : 32);
    const closeX = x + w - pad - closeW;
    const closeY = y + uiDim(8);
    g.fillStyle(0x1a1020, 0.9).fillRect(closeX, closeY, closeW, closeH);
    g.lineStyle(uiDim(1.2), 0xff3b6b, 0.7).strokeRect(closeX, closeY, closeW, closeH);
    add(
      scene.add
        .text(closeX + closeW / 2, closeY + closeH / 2, "✕", bodyFont(mobile ? 15 : 13, { color: "#ff8a9a", fontStyle: "bold" }))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(D + 3),
    );
    const closeZ = add(
      scene.add
        .zone(closeX, closeY, closeW, closeH)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .setDepth(D + 4),
    );
    closeZ.on("pointerdown", () => this.close());

    // Reposition credits left of close so they never collide.
    this.creditsText.setX(closeX - uiDim(10));

    // ── Catalog rows ──────────────────────────────────────────────────────
    const listTop = y + headerH + uiDim(4);
    const listW = w - pad * 2;
    const buyW = uiDim(mobile ? 72 : 64);

    visibleSkus.forEach((s, i) => {
      const ry = listTop + i * (rowH + rowGap);
      // Hard clip — never draw a row past the footer band.
      if (ry + rowH > y + h - footerH) return;
      const locked = !!(s.repReq && this.repTier < s.repReq);
      const rowX = x + pad;

      // Card
      g.fillStyle(locked ? 0x0c0a14 : 0x12102a, 0.95).fillRect(rowX, ry, listW, rowH);
      g.lineStyle(uiDim(1.2), locked ? 0x3a3548 : 0x2a3450, 0.95).strokeRect(rowX, ry, listW, rowH);
      // Left accent bar
      g.fillStyle(locked ? 0x3a3548 : Phaser.Display.Color.HexStringToColor(s.color).color, locked ? 0.5 : 0.85);
      g.fillRect(rowX, ry, uiDim(3), rowH);

      const textLeft = rowX + uiDim(12);
      const textRight = rowX + listW - buyW - uiDim(16);
      const nameW = Math.max(uiDim(80), textRight - textLeft);

      const name = add(
        scene.add
          .text(textLeft, ry + uiDim(mobile ? 8 : 6), s.label, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(mobile ? 13 : 12),
            color: locked ? "#5a6172" : s.color,
            fontStyle: "bold",
          })
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      fitTextToWidth(name, nameW);

      add(
        scene.add
          .text(textLeft, ry + uiDim(mobile ? 28 : 24), locked ? `Locked · rep tier ${s.repReq}` : s.desc, bodyFont(mobile ? 10 : 9, { color: STUDIO.muted }))
          .setScrollFactor(0)
          .setDepth(D + 2),
      );

      // Price + BUY (or LOCKED) on the right
      const buyX = rowX + listW - buyW - uiDim(8);
      const buyY = ry + (rowH - uiDim(mobile ? 32 : 28)) / 2;
      const buyH = uiDim(mobile ? 32 : 28);

      add(
        scene.add
          .text(buyX - uiDim(8), ry + rowH / 2, `₵${s.price}`, displayFont(mobile ? 13 : 12, { color: locked ? "#5a6172" : STUDIO.credits, fontStyle: "bold" }))
          .setOrigin(1, 0.5)
          .setScrollFactor(0)
          .setDepth(D + 2),
      );

      if (locked) {
        g.fillStyle(0x14101c, 0.9).fillRect(buyX, buyY, buyW, buyH);
        g.lineStyle(uiDim(1), 0x3a3548, 0.7).strokeRect(buyX, buyY, buyW, buyH);
        add(
          scene.add
            .text(buyX + buyW / 2, buyY + buyH / 2, "LOCK", bodyFont(10, { color: "#5a6172", fontStyle: "bold" }))
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(D + 3),
        );
      } else {
        g.fillStyle(0x1a1830, 0.95).fillRect(buyX, buyY, buyW, buyH);
        g.lineStyle(uiDim(1.4), 0xf7ff3c, 0.85).strokeRect(buyX, buyY, buyW, buyH);
        add(
          scene.add
            .text(buyX + buyW / 2, buyY + buyH / 2, "BUY", bodyFont(mobile ? 12 : 11, { color: "#f7ff3c", fontStyle: "bold" }))
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(D + 3),
        );
        // Whole row is tappable (easier on phones); BUY is the visual affordance.
        const z = add(
          scene.add
            .zone(rowX, ry, listW, rowH)
            .setOrigin(0)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true })
            .setDepth(D + 4),
        );
        z.on("pointerdown", () => this.onBuy?.(s.sku));
      }
    });

    // ── Footer ────────────────────────────────────────────────────────────
    const more = SKUS.length - visibleSkus.length;
    add(
      scene.add
        .text(
          x + w / 2,
          y + h - footerH / 2,
          more > 0
            ? `${more} more locked/higher tiers · ${closeHint("B / ESC close")}`
            : mobile
              ? "tap a row to buy · ✕ close"
              : `click row to buy · ${closeHint("B / ESC close")}`,
          bodyFont(10, { color: STUDIO.dim }),
        )
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(D + 2),
    );

    animatePanelIn(scene, this.objs.filter((o) => "setAlpha" in o) as Phaser.GameObjects.GameObject[]);
  }
}
