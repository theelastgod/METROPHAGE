import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
import { Item, RARITIES, SLOT_NAMES, itemStatLines } from "../game/items";
import { suggestedPrice, listingFee } from "../game/market";

// METROPHAGE auction house (key K) — a cross-zone player market. LEFT = browse open listings
// (BUY); RIGHT = your stall: your active listings (CANCEL) + your bag (quick-LIST at a
// suggested price). The server escrows the item + settles atomically; this panel only fires
// intent. Custom prices: /list <bagSlot> <price>.

interface Listing {
  id: number;
  seller: string;
  sellerName: string;
  item: Item;
  price: number;
  currency: string;
}

export default class OnlineMarket {
  open = false;
  onBuy?: (id: number) => void;
  onCancel?: (id: number) => void;
  onList?: (itemId: string, price: number) => void;
  onRefresh?: () => void;
  private scene: Phaser.Scene;
  private listings: Listing[] = [];
  private bag: Item[] = [];
  private selfId = "";
  private credits = 0;
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setState(listings: Listing[], bag: Item[], selfId: string, credits: number) {
    this.listings = listings ?? [];
    this.bag = bag ?? [];
    this.selfId = selfId;
    this.credits = credits;
    if (this.open) this.build();
  }
  toggle(listings: Listing[], bag: Item[], selfId: string, credits: number) {
    this.open = !this.open;
    if (this.open) {
      this.setState(listings, bag, selfId, credits);
      this.onRefresh?.(); // ask the server for fresh listings
      this.build();
    } else this.clear();
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.clear();
  }
  private clear() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }

  private build() {
    this.clear();
    const scene = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const D = 1700;
    const w = 1100;
    const h = 640;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    add(scene.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x02020a, 0.66).setScrollFactor(0).setDepth(D));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(2, COLORS.neonYellow, 0.85).strokeRect(x, y, w, h);

    const tx = (s: string, fx: number, fy: number, size: number, color: string, bold = false, origin = 0) =>
      add(
        scene.add
          .text(fx, fy, s, { fontFamily: "Courier New, monospace", fontSize: size + "px", color, fontStyle: bold ? "bold" : "normal" })
          .setOrigin(origin, 0)
          .setScrollFactor(0)
          .setDepth(D + 3),
      );
    const btn = (bx: number, by: number, bw: number, label: string, color: number, enabled: boolean, fn: () => void) => {
      g.fillStyle(enabled ? 0x161232 : 0x0e0c1c, 0.96).fillRect(bx, by, bw, 22);
      g.lineStyle(1.2, color, enabled ? 0.95 : 0.3).strokeRect(bx, by, bw, 22);
      tx(label, bx + bw / 2, by + 5, 10, enabled ? "#cfe8ff" : "#4a5266", false, 0.5);
      if (enabled) {
        const z = add(scene.add.zone(bx, by, bw, 22).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4));
        z.on("pointerdown", fn);
      }
    };
    const itemLine = (it: Item) => `${RARITIES[it.rarity].name} · ${SLOT_NAMES[it.slot]}${(it.ilvl ?? 0) > 0 ? ` +${it.ilvl}` : ""}`;

    tx("▦ AUCTION HOUSE", x + 20, y + 14, 16, "#f7ff3c", true);
    tx(`₵ ${this.credits}`, x + w / 2 - 20, y + 16, 13, "#f7ff3c", true, 1);
    tx("K / ESC close · custom: /list <bagSlot> <price>", x + w - 18, y + 16, 11, "#9aa3b2", false, 1);
    const colMid = x + w * 0.52;
    g.lineStyle(1, 0x2a2440, 0.9).lineBetween(colMid, y + 44, colMid, y + h - 16);

    // ── LEFT: browse open listings (others') ──
    tx("OPEN LISTINGS", x + 20, y + 48, 12, "#29e7ff", true);
    const others = this.listings.filter((l) => l.seller !== this.selfId);
    let ly = y + 72;
    const lw = colMid - x - 36;
    if (others.length === 0) tx("no listings — be the first to sell", x + 20, ly + 10, 11, "#5a6172");
    for (const l of others.slice(0, 8)) {
      const r = RARITIES[l.item.rarity];
      g.fillStyle(0x12102a, 0.92).fillRect(x + 20, ly, lw, 56);
      g.lineStyle(1.4, r.color, 1).strokeRect(x + 20, ly, lw, 56);
      tx(l.item.name, x + 30, ly + 6, 12, r.hex, true);
      tx(itemLine(l.item), x + 30, ly + 22, 9, "#9aa3b2");
      tx(itemStatLines(l.item).filter((s) => !s.startsWith("◈")).join("  ") || "—", x + 30, ly + 36, 9, "#cfe8ff");
      tx(`by ${l.sellerName}`, x + 30, ly + 47, 8, "#5a6172");
      const afford = this.credits >= l.price;
      btn(x + 20 + lw - 116, ly + 17, 108, `BUY ₵${l.price}`, COLORS.neonGreen, afford, () => this.onBuy?.(l.id));
      ly += 60;
    }

    // ── RIGHT: your stall ──
    const rx = colMid + 16;
    const rw = x + w - 16 - rx;
    const mine = this.listings.filter((l) => l.seller === this.selfId);
    tx(`YOUR LISTINGS (${mine.length})`, rx, y + 48, 12, "#ff2bd6", true);
    let my = y + 72;
    if (mine.length === 0) tx("nothing listed", rx, my + 6, 11, "#5a6172");
    for (const l of mine.slice(0, 4)) {
      const r = RARITIES[l.item.rarity];
      g.fillStyle(0x1a1230, 0.92).fillRect(rx, my, rw, 34);
      g.lineStyle(1.2, r.color, 1).strokeRect(rx, my, rw, 34);
      tx(l.item.name, rx + 10, my + 4, 11, r.hex, true);
      tx(`₵${l.price}`, rx + 10, my + 19, 10, "#f7ff3c");
      btn(rx + rw - 88, my + 6, 80, "CANCEL", COLORS.neonMagenta, true, () => this.onCancel?.(l.id));
      my += 38;
    }

    // sell-from-bag
    const sellY = my + 14;
    tx("SELL FROM BAG  (quick-list at 2× value)", rx, sellY, 12, "#39ff88", true);
    let sy = sellY + 22;
    if (this.bag.length === 0) tx("bag empty", rx, sy + 4, 11, "#5a6172");
    for (const it of this.bag.slice(0, 6)) {
      const r = RARITIES[it.rarity];
      const price = suggestedPrice(it);
      const fee = listingFee(price);
      g.fillStyle(0x12102a, 0.92).fillRect(rx, sy, rw, 34);
      g.lineStyle(1.2, r.color, 1).strokeRect(rx, sy, rw, 34);
      tx(`${it.name}${(it.ilvl ?? 0) > 0 ? ` +${it.ilvl}` : ""}`, rx + 10, sy + 4, 11, r.hex, true);
      tx(itemLine(it), rx + 10, sy + 19, 9, "#9aa3b2");
      btn(rx + rw - 150, sy + 6, 142, `LIST ₵${price} (fee ₵${fee})`, COLORS.neonGreen, this.credits >= fee, () => this.onList?.(it.id, price));
      sy += 38;
    }
  }

  destroy() {
    this.clear();
  }
}
