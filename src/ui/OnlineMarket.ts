import Phaser from "phaser";
import { COLORS } from "../config";
import { Item, RARITIES, SLOT_NAMES, itemStatLines } from "../game/items";
import { suggestedPrice, listingFee, suggestedMetroPrice, metroListingFee } from "../game/market";
import { fmtMetro } from "../economy/metro";
import { drawPanelFrame } from "./panelChrome";
import Modal from "./Modal";
import { closeHint, dimBackdrop, fitModalRect, uiDim } from "./uiLayout";
import { bodyFont, displayFont, fitTextToWidth } from "./typography";
import { prefersMobileUx } from "../systems/Mobile";
import {
  STUDIO,
  addPanelGlow,
  animatePanelIn,
  drawScanlines,
  drawStudioBtn,
  drawStudioHeaderBand,
  drawStudioListCard,
  drawStudioTabs,
} from "./studioChrome";

type Currency = "credits" | "metro";
type Filter = "all" | Currency | "weapon" | "armor" | "rare";

interface Listing {
  id: number;
  seller: string;
  sellerName: string;
  item: Item;
  price: number;
  currency: string;
}

export default class OnlineMarket extends Modal {
  onBuy?: (id: number) => void;
  onCancel?: (id: number) => void;
  onList?: (itemId: string, price: number, currency: Currency) => void;
  onRefresh?: () => void;
  private listings: Listing[] = [];
  private bag: Item[] = [];
  private selfId = "";
  private credits = 0;
  private metro = 0;
  private filter: Filter = "all";

  setState(listings: Listing[], bag: Item[], selfId: string, credits: number, metro = 0) {
    this.listings = listings ?? [];
    this.bag = bag ?? [];
    this.selfId = selfId;
    this.credits = credits;
    this.metro = metro;
    if (this.open) this.build();
  }

  refreshBalances(credits: number, metro: number) {
    if (this.credits === credits && this.metro === metro) return;
    this.credits = credits;
    this.metro = metro;
    if (this.open) this.build();
  }

  toggle(listings: Listing[], bag: Item[], selfId: string, credits: number, metro = 0) {
    if (!this.open) {
      this.open = true;
      this.setState(listings, bag, selfId, credits, metro); // builds (open is set)
      this.onRefresh?.();
    } else {
      this.close();
    }
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
    // Clamp to the viewport — fixed 792×452 was larger than mobile sheets and
    // list rows used to paint past the frame (and off the screen).
    const { x, y, w, h } = fitModalRect(mobile ? 360 : 792, mobile ? 500 : 452, {
      marginDesign: mobile ? 6 : 16,
    });
    const footerH = uiDim(28);
    const contentBottom = y + h - footerH - uiDim(4);
    // Pack row heights into the available column so nothing spills off-frame.
    let listRowH = uiDim(mobile ? 52 : 56);
    let listCardH = listRowH - uiDim(2);
    let stallRowH = uiDim(mobile ? 34 : 36);
    let bagRowH = stallRowH + uiDim(mobile ? 18 : 22);
    const btnH = uiDim(mobile ? 28 : 24);

    add(dimBackdrop(scene, D, 0.68, () => this.close(), { x, y, w, h }).setAlpha(0));
    add(addPanelGlow(scene, x, y, w, h, COLORS.neonMagenta, 0.1).setScrollFactor(0).setDepth(D + 1).setAlpha(0));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 2).setAlpha(0));
    drawPanelFrame(g, x, y, w, h);
    drawScanlines(g, x + uiDim(12), y + uiDim(56), w - uiDim(24), h - uiDim(68));

    const tx = (s: string, fx: number, fy: number, size: number, color: string, bold = false, origin = 0, maxWidth?: number) => {
      const t = add(
        scene.add
          .text(fx, fy, s, bold ? displayFont(size, { color, fontStyle: "bold" }) : bodyFont(size, { color }))
          .setOrigin(origin, 0)
          .setScrollFactor(0)
          .setDepth(D + 4),
      );
      if (maxWidth !== undefined) fitTextToWidth(t, maxWidth);
      return t;
    };

    const itemLine = (it: Item) => `${RARITIES[it.rarity].name} · ${SLOT_NAMES[it.slot]}${(it.ilvl ?? 0) > 0 ? ` +${it.ilvl}` : ""}`;
    const priceLabel = (l: Listing) => (l.currency === "metro" ? `◈${fmtMetro(l.price)}` : `₵${l.price}`);
    const matchesFilter = (l: Listing) => {
      if (this.filter === "all") return true;
      if (this.filter === "credits" || this.filter === "metro") return l.currency === this.filter;
      if (this.filter === "weapon") return l.item.slot === "weapon";
      if (this.filter === "armor") return l.item.slot === "armor" || l.item.slot === "implant";
      if (this.filter === "rare") return l.item.rarity === "blackice" || l.item.rarity === "singular";
      return true;
    };

    const headerEnd = drawStudioHeaderBand(
      g,
      scene,
      x,
      y,
      w,
      "▦ WORLD MARKET",
      {
        subtitle: mobile ? "player exchange" : "cross-zone player exchange · premium $METRO listings",
        accent: COLORS.neonYellow,
        rightLabel: closeHint("K / ESC close"),
      },
      add,
    );

    // balance chips
    const chipY = Math.min(headerEnd + uiDim(4), y + uiDim(58));
    const chipW = Math.min(uiDim(150), (w - uiDim(56)) / 2);
    g.fillStyle(0x0a1020, 0.9).fillRoundedRect(x + uiDim(16), chipY, chipW, uiDim(28), 5);
    g.lineStyle(1, COLORS.neonYellow, 0.7).strokeRoundedRect(x + uiDim(16), chipY, chipW, uiDim(28), 5);
    tx(`₵ ${this.credits.toLocaleString()}`, x + uiDim(16) + chipW / 2, chipY + uiDim(7), 11, STUDIO.credits, true, 0.5, chipW - uiDim(10));

    g.fillStyle(0x120a24, 0.9).fillRoundedRect(x + uiDim(16) + chipW + uiDim(8), chipY, chipW, uiDim(28), 5);
    g.lineStyle(1, COLORS.neonMagenta, 0.75).strokeRoundedRect(x + uiDim(16) + chipW + uiDim(8), chipY, chipW, uiDim(28), 5);
    tx(`◈ ${fmtMetro(this.metro)}`, x + uiDim(16) + chipW + uiDim(8) + chipW / 2, chipY + uiDim(7), 11, STUDIO.metro, true, 0.5, chipW - uiDim(10));

    if (!mobile) {
      tx("/list <slot> <price> [metro]", x + w - uiDim(18), chipY + uiDim(7), 10, STUDIO.dim, false, 1, w - uiDim(340));
    }

    const tabY = chipY + uiDim(34);
    const tabW = Math.max(uiDim(48), Math.min(uiDim(72), Math.floor((w - uiDim(40)) / 6)));
    drawStudioTabs(
      g,
      scene,
      x + uiDim(16),
      tabY,
      [
        { id: "all", label: "ALL", color: COLORS.neonCyan },
        { id: "credits", label: "₵", color: COLORS.neonYellow },
        { id: "metro", label: "◈", color: COLORS.neonMagenta },
        { id: "weapon", label: "WEP", color: COLORS.neonGreen },
        { id: "armor", label: "ARM", color: 0x6b9bff },
        { id: "rare", label: "RARE", color: COLORS.neonMagenta },
      ],
      this.filter,
      tabW,
      (id) => {
        this.filter = id as Filter;
        this.build();
      },
      add,
      D,
    );

    // Two columns on desktop; stacked single column on narrow/mobile so nothing clips.
    const dualCol = w >= uiDim(560);
    const colMid = dualCol ? x + w * 0.52 : x + w;
    const listTop = tabY + uiDim(40);
    if (dualCol) {
      g.lineStyle(uiDim(1), 0x2a2440, 0.9).lineBetween(colMid, listTop - uiDim(4), colMid, contentBottom);
    }

    tx("OPEN LISTINGS", x + uiDim(16), listTop - uiDim(18), 11, "#29e7ff", true);
    const others = this.listings.filter((l) => l.seller !== this.selfId && matchesFilter(l));
    const leftBottom = dualCol ? contentBottom : y + h * 0.48;
    const leftAvail = Math.max(uiDim(40), leftBottom - listTop);
    const maxListRows = Math.max(1, Math.floor(leftAvail / listRowH));
    // Shrink rows if needed so at least 2 listings fit.
    if (maxListRows < 2 && leftAvail > uiDim(60)) {
      listRowH = Math.max(uiDim(40), Math.floor(leftAvail / 2));
      listCardH = listRowH - uiDim(2);
    }
    const listCap = Math.max(1, Math.floor(leftAvail / listRowH));
    let ly = listTop;
    const lw = dualCol ? colMid - x - uiDim(30) : w - uiDim(32);
    if (others.length === 0) {
      tx(
        this.filter === "all" ? "no listings — be the first broker" : `no ${this.filter === "metro" ? "$METRO" : "credit"} listings yet`,
        x + uiDim(16),
        ly + uiDim(8),
        11,
        STUDIO.dim,
        false,
        0,
        lw,
      );
    }
    const shownListings = others.slice(0, listCap);
    for (const l of shownListings) {
      if (ly + listCardH > leftBottom) break;
      const r = RARITIES[l.item.rarity];
      const isMetro = l.currency === "metro";
      drawStudioListCard(g, x + uiDim(16), ly, lw, listCardH, r.color, isMetro);
      const buyBtnW = uiDim(mobile ? 96 : 108);
      const listingTextW = Math.max(uiDim(60), lw - buyBtnW - uiDim(20));
      tx(l.item.name, x + uiDim(24), ly + uiDim(6), 11, r.hex, true, 0, listingTextW);
      tx(itemLine(l.item), x + uiDim(24), ly + uiDim(20), 9, STUDIO.muted, false, 0, listingTextW);
      if (listCardH >= uiDim(48)) {
        tx(itemStatLines(l.item).filter((s) => !s.startsWith("◈")).join("  ") || "—", x + uiDim(24), ly + uiDim(32), 8, STUDIO.ink, false, 0, listingTextW);
      }
      if (listCardH >= uiDim(54)) {
        tx(`by ${l.sellerName}`, x + uiDim(24), ly + listCardH - uiDim(12), 8, STUDIO.dim, false, 0, listingTextW);
      }
      const afford = isMetro ? this.metro >= l.price : this.credits >= l.price;
      const buyLabel = isMetro ? `BUY ◈${fmtMetro(l.price)}` : `BUY ₵${l.price}`;
      drawStudioBtn(
        g,
        scene,
        {
          x: x + uiDim(16) + lw - buyBtnW - uiDim(6),
          y: ly + Math.max(uiDim(4), (listCardH - btnH) / 2),
          w: buyBtnW,
          h: btnH,
          label: buyLabel,
          color: isMetro ? COLORS.neonMagenta : COLORS.neonGreen,
          enabled: afford,
          onClick: () => this.onBuy?.(l.id),
        },
        add,
        D,
      );
      ly += listRowH;
    }
    if (others.length > shownListings.length) {
      tx(`+${others.length - shownListings.length} more — refresh/filter`, x + uiDim(16), Math.min(ly, leftBottom - uiDim(14)), 9, STUDIO.dim, false, 0, lw);
    }

    const rx = dualCol ? colMid + uiDim(14) : x + uiDim(16);
    const rw = dualCol ? x + w - uiDim(16) - rx : w - uiDim(32);
    const rightTop = dualCol ? listTop : leftBottom + uiDim(12);
    const mine = this.listings.filter((l) => l.seller === this.selfId);
    tx(`YOUR STALL (${mine.length})`, rx, rightTop - uiDim(18), 11, STUDIO.metro, true);
    let my = rightTop;

    // Reserve room for at least one quick-list row when bag has items.
    const bagNeed = this.bag.length > 0 ? uiDim(20) + bagRowH : 0;
    const stallAreaBottom = Math.max(my + uiDim(40), contentBottom - bagNeed - uiDim(28));
    const stallCap = Math.max(0, Math.floor((stallAreaBottom - my) / (stallRowH + uiDim(2))));
    if (mine.length === 0) {
      if (my + uiDim(20) <= contentBottom) tx("nothing listed", rx, my + uiDim(4), 11, STUDIO.dim);
      my += uiDim(22);
    } else {
      const shownMine = mine.slice(0, Math.max(1, stallCap));
      for (const l of shownMine) {
        if (my + stallRowH > contentBottom) break;
        const r = RARITIES[l.item.rarity];
        const isMetro = l.currency === "metro";
        drawStudioListCard(g, rx, my, rw, stallRowH, r.color, isMetro);
        const cancelW = uiDim(72);
        tx(l.item.name, rx + uiDim(10), my + uiDim(4), 11, r.hex, true, 0, rw - cancelW - uiDim(16));
        tx(priceLabel(l), rx + uiDim(10), my + uiDim(18), 10, isMetro ? STUDIO.metro : STUDIO.credits, false, 0, rw - cancelW - uiDim(16));
        drawStudioBtn(
          g,
          scene,
          {
            x: rx + rw - cancelW - uiDim(6),
            y: my + Math.max(uiDim(2), (stallRowH - btnH) / 2),
            w: cancelW,
            h: btnH,
            label: "✕",
            color: COLORS.neonMagenta,
            enabled: true,
            primary: false,
            onClick: () => this.onCancel?.(l.id),
          },
          add,
          D,
        );
        my += stallRowH + uiDim(2);
      }
      if (mine.length > shownMine.length) {
        tx(`+${mine.length - shownMine.length} more on stall`, rx, my, 9, STUDIO.dim, false, 0, rw);
        my += uiDim(14);
      }
    }

    const sellY = Math.min(my + uiDim(10), contentBottom - bagRowH - uiDim(22));
    if (sellY + uiDim(16) < contentBottom) {
      tx(mobile ? "QUICK-LIST" : "QUICK-LIST FROM BAG", rx, sellY, 11, STUDIO.ready, true);
      let sy = sellY + uiDim(18);
      if (this.bag.length === 0) {
        if (sy + uiDim(14) <= contentBottom) tx("bag empty", rx, sy, 11, STUDIO.dim);
      } else {
        const bagCap = Math.max(1, Math.floor((contentBottom - sy) / bagRowH));
        // Tighten bag rows if needed so at least one fits.
        if (bagCap < 1 && contentBottom - sy > uiDim(36)) {
          bagRowH = Math.max(uiDim(36), contentBottom - sy);
        }
        const fitBag = Math.max(1, Math.floor((contentBottom - sy) / bagRowH));
        const shownBag = this.bag.slice(0, fitBag);
        for (const it of shownBag) {
          if (sy + bagRowH > contentBottom + uiDim(2)) break;
          const r = RARITIES[it.rarity];
          const cPrice = suggestedPrice(it);
          const cFee = listingFee(cPrice);
          const mPrice = suggestedMetroPrice(it);
          const mFee = metroListingFee(mPrice);
          const cardH = Math.min(bagRowH - uiDim(2), contentBottom - sy);
          if (cardH < uiDim(32)) break;
          drawStudioListCard(g, rx, sy, rw, cardH, r.color);
          tx(`${it.name}${(it.ilvl ?? 0) > 0 ? ` +${it.ilvl}` : ""}`, rx + uiDim(10), sy + uiDim(4), 11, r.hex, true, 0, rw - uiDim(16));
          if (cardH >= uiDim(40)) {
            tx(itemLine(it), rx + uiDim(10), sy + uiDim(18), 9, STUDIO.muted, false, 0, rw - uiDim(16));
          }
          // Side-by-side list buttons when wide enough; stacked on narrow.
          const listBtnH = Math.min(btnH, uiDim(24));
          if (rw >= uiDim(280) && cardH >= uiDim(48)) {
            const bw = Math.min(uiDim(130), (rw - uiDim(20)) / 2);
            drawStudioBtn(
              g,
              scene,
              {
                x: rx + rw - bw * 2 - uiDim(12),
                y: sy + cardH - listBtnH - uiDim(4),
                w: bw,
                h: listBtnH,
                label: `₵${cPrice}`,
                color: COLORS.neonGreen,
                enabled: this.credits >= cFee,
                primary: false,
                onClick: () => this.onList?.(it.id, cPrice, "credits"),
              },
              add,
              D,
            );
            drawStudioBtn(
              g,
              scene,
              {
                x: rx + rw - bw - uiDim(6),
                y: sy + cardH - listBtnH - uiDim(4),
                w: bw,
                h: listBtnH,
                label: `◈${mPrice}`,
                color: COLORS.neonMagenta,
                enabled: this.metro >= mFee,
                onClick: () => this.onList?.(it.id, mPrice, "metro"),
              },
              add,
              D,
            );
          } else if (cardH >= uiDim(36)) {
            // Single credit list action on very tight rows.
            drawStudioBtn(
              g,
              scene,
              {
                x: rx + rw - uiDim(88),
                y: sy + Math.max(uiDim(2), (cardH - listBtnH) / 2),
                w: uiDim(80),
                h: listBtnH,
                label: `₵${cPrice}`,
                color: COLORS.neonGreen,
                enabled: this.credits >= cFee,
                primary: false,
                onClick: () => this.onList?.(it.id, cPrice, "credits"),
              },
              add,
              D,
            );
          }
          sy += bagRowH;
        }
        if (this.bag.length > shownBag.length && sy <= contentBottom) {
          tx(`+${this.bag.length - shownBag.length} in bag`, rx, Math.min(sy, contentBottom - uiDim(12)), 9, STUDIO.dim, false, 0, rw);
        }
      }
    }

    g.fillStyle(0x0e1830, 0.45).fillRect(x + uiDim(14), y + h - footerH, w - uiDim(28), footerH - uiDim(4));
    tx(
      mobile ? "tap outside / ✕ to close" : "premium $METRO listings cross zones · credits stay local",
      x + w / 2,
      y + h - footerH + uiDim(6),
      9,
      STUDIO.dim,
      false,
      0.5,
      w - uiDim(40),
    );

    const animTargets = this.objs.filter((o) => "setAlpha" in o);
    animatePanelIn(scene, animTargets);
  }

}
