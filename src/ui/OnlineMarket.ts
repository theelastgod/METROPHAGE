import Phaser from "phaser";
import { COLORS } from "../config";
import { Item, RARITIES, SLOT_NAMES, itemStatLines } from "../game/items";
import { suggestedPrice, listingFee, suggestedMetroPrice, metroListingFee } from "../game/market";
import { fmtMetro } from "../economy/metro";
import { drawPanelFrame } from "./panelChrome";
import Modal from "./Modal";
import { closeHint, dimBackdrop, modalRect, uiDim } from "./uiLayout";
import { bodyFont, displayFont, fitTextToWidth } from "./typography";
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
    // design space is 960×540; the old 1120×680 rendered at ~116%×126% and overflowed
    // the page. Keep it a compact modal with comfortable margins.
    const { x, y, w, h } = modalRect(792, 452);
    const listRowH = uiDim(60);
    const listCardH = uiDim(58);
    const stallRowH = uiDim(38);
    const btnH = uiDim(26);

    add(dimBackdrop(scene, D, 0.68, () => this.close(), { x, y, w, h }).setAlpha(0));
    add(addPanelGlow(scene, x, y, w, h, COLORS.neonMagenta, 0.1).setScrollFactor(0).setDepth(D + 1).setAlpha(0));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 2).setAlpha(0));
    drawPanelFrame(g, x, y, w, h);
    drawScanlines(g, x + uiDim(12), y + uiDim(60), w - uiDim(24), h - uiDim(72));

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
      { subtitle: "cross-zone player exchange · premium $METRO listings", accent: COLORS.neonYellow, rightLabel: closeHint("K / ESC close") },
      add,
    );

    // balance chips
    const chipY = y + uiDim(62);
    const chipW = uiDim(168);
    g.fillStyle(0x0a1020, 0.9).fillRoundedRect(x + uiDim(22), chipY, chipW, uiDim(30), 5);
    g.lineStyle(1, COLORS.neonYellow, 0.7).strokeRoundedRect(x + uiDim(22), chipY, chipW, uiDim(30), 5);
    tx(`₵ ${this.credits.toLocaleString()}`, x + uiDim(22) + chipW / 2, chipY + uiDim(8), 12, STUDIO.credits, true, 0.5, chipW - uiDim(12));

    g.fillStyle(0x120a24, 0.9).fillRoundedRect(x + uiDim(22) + chipW + uiDim(10), chipY, chipW, uiDim(30), 5);
    g.lineStyle(1, COLORS.neonMagenta, 0.75).strokeRoundedRect(x + uiDim(22) + chipW + uiDim(10), chipY, chipW, uiDim(30), 5);
    tx(`◈ ${fmtMetro(this.metro)} $METRO`, x + uiDim(22) + chipW + uiDim(10) + chipW / 2, chipY + uiDim(8), 12, STUDIO.metro, true, 0.5, chipW - uiDim(12));

    tx("/list <slot> <price> [metro]", x + w - uiDim(22), chipY + uiDim(8), 10, STUDIO.dim, false, 1, w - uiDim(392));

    const tabY = headerEnd + uiDim(36);
    drawStudioTabs(
      g,
      scene,
      x + uiDim(22),
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
      uiDim(72),
      (id) => {
        this.filter = id as Filter;
        this.build();
      },
      add,
      D,
    );

    const colMid = x + w * 0.52;
    g.lineStyle(uiDim(1), 0x2a2440, 0.9).lineBetween(colMid, tabY + uiDim(38), colMid, y + h - uiDim(18));

    tx("OPEN LISTINGS", x + uiDim(22), tabY + uiDim(44), 12, "#29e7ff", true);
    const others = this.listings.filter((l) => l.seller !== this.selfId && matchesFilter(l));
    let ly = tabY + uiDim(68);
    const lw = colMid - x - uiDim(38);
    if (others.length === 0) {
      tx(
        this.filter === "all" ? "no listings — be the first broker on the exchange" : `no ${this.filter === "metro" ? "$METRO" : "credit"} listings yet`,
        x + uiDim(22),
        ly + uiDim(12),
        11,
        STUDIO.dim,
        false,
        0,
        lw,
      );
    }
    for (const l of others.slice(0, 8)) {
      const r = RARITIES[l.item.rarity];
      const isMetro = l.currency === "metro";
      drawStudioListCard(g, x + uiDim(22), ly, lw, listCardH, r.color, isMetro);
      const listingTextW = lw - uiDim(134);
      tx(l.item.name, x + uiDim(32), ly + uiDim(8), 12, r.hex, true, 0, listingTextW);
      tx(itemLine(l.item), x + uiDim(32), ly + uiDim(24), 9, STUDIO.muted, false, 0, listingTextW);
      tx(itemStatLines(l.item).filter((s) => !s.startsWith("◈")).join("  ") || "—", x + uiDim(32), ly + uiDim(38), 9, STUDIO.ink, false, 0, listingTextW);
      tx(`by ${l.sellerName}`, x + uiDim(32), ly + uiDim(49), 8, STUDIO.dim, false, 0, listingTextW);
      const afford = isMetro ? this.metro >= l.price : this.credits >= l.price;
      const buyLabel = isMetro ? `BUY ◈${fmtMetro(l.price)}` : `BUY ₵${l.price}`;
      drawStudioBtn(g, scene, {
        x: x + uiDim(22) + lw - uiDim(120),
        y: ly + uiDim(16),
        w: uiDim(112),
        h: btnH,
        label: buyLabel,
        color: isMetro ? COLORS.neonMagenta : COLORS.neonGreen,
        enabled: afford,
        onClick: () => this.onBuy?.(l.id),
      }, add, D);
      ly += listRowH;
    }

    const rx = colMid + uiDim(18);
    const rw = x + w - uiDim(18) - rx;
    const mine = this.listings.filter((l) => l.seller === this.selfId);
    tx(`YOUR STALL (${mine.length})`, rx, tabY + uiDim(44), 12, STUDIO.metro, true);
    let my = tabY + uiDim(68);
    if (mine.length === 0) tx("nothing listed", rx, my + uiDim(8), 11, STUDIO.dim);
    for (const l of mine.slice(0, 4)) {
      const r = RARITIES[l.item.rarity];
      const isMetro = l.currency === "metro";
      drawStudioListCard(g, rx, my, rw, stallRowH, r.color, isMetro);
      tx(l.item.name, rx + uiDim(12), my + uiDim(6), 11, r.hex, true, 0, rw - uiDim(112));
      tx(priceLabel(l), rx + uiDim(12), my + uiDim(21), 10, isMetro ? STUDIO.metro : STUDIO.credits, false, 0, rw - uiDim(112));
      drawStudioBtn(g, scene, {
        x: rx + rw - uiDim(92),
        y: my + uiDim(6),
        w: uiDim(84),
        h: btnH,
        label: "CANCEL",
        color: COLORS.neonMagenta,
        enabled: true,
        primary: false,
        onClick: () => this.onCancel?.(l.id),
      }, add, D);
      my += stallRowH + uiDim(2);
    }

    const sellY = my + uiDim(16);
    tx("QUICK-LIST FROM BAG  (2× appraised value)", rx, sellY, 12, STUDIO.ready, true);
    let sy = sellY + uiDim(24);
    if (this.bag.length === 0) tx("bag empty", rx, sy + uiDim(6), 11, STUDIO.dim);
    for (const it of this.bag.slice(0, 5)) {
      const r = RARITIES[it.rarity];
      const cPrice = suggestedPrice(it);
      const cFee = listingFee(cPrice);
      const mPrice = suggestedMetroPrice(it);
      const mFee = metroListingFee(mPrice);
      const cardH = stallRowH + uiDim(4);
      drawStudioListCard(g, rx, sy, rw, cardH, r.color);
      tx(`${it.name}${(it.ilvl ?? 0) > 0 ? ` +${it.ilvl}` : ""}`, rx + uiDim(12), sy + uiDim(6), 11, r.hex, true, 0, rw - uiDim(24));
      tx(itemLine(it), rx + uiDim(12), sy + uiDim(21), 9, STUDIO.muted, false, 0, rw - uiDim(24));
      drawStudioBtn(g, scene, {
        x: rx + rw - uiDim(310),
        y: sy + uiDim(30),
        w: uiDim(148),
        h: btnH,
        label: `₵${cPrice} (fee ₵${cFee})`,
        color: COLORS.neonGreen,
        enabled: this.credits >= cFee,
        primary: false,
        onClick: () => this.onList?.(it.id, cPrice, "credits"),
      }, add, D);
      drawStudioBtn(g, scene, {
        x: rx + rw - uiDim(156),
        y: sy + uiDim(30),
        w: uiDim(148),
        h: btnH,
        label: `◈${mPrice} (fee ◈${mFee})`,
        color: COLORS.neonMagenta,
        enabled: this.metro >= mFee,
        onClick: () => this.onList?.(it.id, mPrice, "metro"),
      }, add, D);
      sy += stallRowH + uiDim(8);
    }

    g.fillStyle(0x0e1830, 0.45).fillRect(x + uiDim(18), y + h - uiDim(30), w - uiDim(36), uiDim(20));
    tx("premium $METRO listings cross every combat zone · credits stay local", x + w / 2, y + h - uiDim(24), 9, STUDIO.dim, false, 0.5, w - uiDim(48));

    const animTargets = this.objs.filter((o) => "setAlpha" in o);
    animatePanelIn(scene, animTargets);
  }

}
