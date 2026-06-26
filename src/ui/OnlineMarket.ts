import Phaser from "phaser";
import { COLORS } from "../config";
import { Item, RARITIES, SLOT_NAMES, itemStatLines } from "../game/items";
import { suggestedPrice, listingFee } from "../game/market";
import { dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";

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
      this.onRefresh?.();
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
    const { x, y, w, h } = modalRect(1120, 660);
    const listRowH = uiDim(60);
    const listCardH = uiDim(58);
    const stallRowH = uiDim(38);
    const btnH = uiDim(24);

    add(dimBackdrop(scene, D, 0.66));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), COLORS.neonYellow, 0.85).strokeRect(x, y, w, h);

    const tx = (s: string, fx: number, fy: number, size: number, color: string, bold = false, origin = 0) =>
      add(
        scene.add
          .text(fx, fy, s, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(size),
            color,
            fontStyle: bold ? "bold" : "normal",
          })
          .setOrigin(origin, 0)
          .setScrollFactor(0)
          .setDepth(D + 3),
      );
    const btn = (bx: number, by: number, bw: number, label: string, color: number, enabled: boolean, fn: () => void) => {
      g.fillStyle(enabled ? 0x161232 : 0x0e0c1c, 0.96).fillRect(bx, by, bw, btnH);
      g.lineStyle(uiDim(1.2), color, enabled ? 0.95 : 0.3).strokeRect(bx, by, bw, btnH);
      tx(label, bx + bw / 2, by + uiDim(6), 11, enabled ? "#cfe8ff" : "#4a5266", false, 0.5);
      if (enabled) {
        const z = add(
          scene.add.zone(bx, by, bw, btnH).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4),
        );
        z.on("pointerdown", fn);
      }
    };
    const itemLine = (it: Item) => `${RARITIES[it.rarity].name} · ${SLOT_NAMES[it.slot]}${(it.ilvl ?? 0) > 0 ? ` +${it.ilvl}` : ""}`;

    tx("▦ AUCTION HOUSE", x + uiDim(22), y + uiDim(16), 17, "#f7ff3c", true);
    tx(`₵ ${this.credits}`, x + w / 2 - uiDim(22), y + uiDim(18), 14, "#f7ff3c", true, 1);
    tx("K / ESC close · custom: /list <bagSlot> <price>", x + w - uiDim(20), y + uiDim(18), 12, "#9aa3b2", false, 1);
    const colMid = x + w * 0.52;
    g.lineStyle(uiDim(1), 0x2a2440, 0.9).lineBetween(colMid, y + uiDim(48), colMid, y + h - uiDim(18));

    tx("OPEN LISTINGS", x + uiDim(22), y + uiDim(52), 13, "#29e7ff", true);
    const others = this.listings.filter((l) => l.seller !== this.selfId);
    let ly = y + uiDim(76);
    const lw = colMid - x - uiDim(38);
    if (others.length === 0) tx("no listings — be the first to sell", x + uiDim(22), ly + uiDim(12), 12, "#5a6172");
    for (const l of others.slice(0, 8)) {
      const r = RARITIES[l.item.rarity];
      g.fillStyle(0x12102a, 0.92).fillRect(x + uiDim(22), ly, lw, listCardH);
      g.lineStyle(uiDim(1.4), r.color, 1).strokeRect(x + uiDim(22), ly, lw, listCardH);
      tx(l.item.name, x + uiDim(32), ly + uiDim(8), 13, r.hex, true);
      tx(itemLine(l.item), x + uiDim(32), ly + uiDim(24), 10, "#9aa3b2");
      tx(itemStatLines(l.item).filter((s) => !s.startsWith("◈")).join("  ") || "—", x + uiDim(32), ly + uiDim(38), 10, "#cfe8ff");
      tx(`by ${l.sellerName}`, x + uiDim(32), ly + uiDim(49), 9, "#5a6172");
      const afford = this.credits >= l.price;
      btn(x + uiDim(22) + lw - uiDim(120), ly + uiDim(18), uiDim(112), `BUY ₵${l.price}`, COLORS.neonGreen, afford, () => this.onBuy?.(l.id));
      ly += listRowH;
    }

    const rx = colMid + uiDim(18);
    const rw = x + w - uiDim(18) - rx;
    const mine = this.listings.filter((l) => l.seller === this.selfId);
    tx(`YOUR LISTINGS (${mine.length})`, rx, y + uiDim(52), 13, "#ff2bd6", true);
    let my = y + uiDim(76);
    if (mine.length === 0) tx("nothing listed", rx, my + uiDim(8), 12, "#5a6172");
    for (const l of mine.slice(0, 4)) {
      const r = RARITIES[l.item.rarity];
      g.fillStyle(0x1a1230, 0.92).fillRect(rx, my, rw, stallRowH);
      g.lineStyle(uiDim(1.2), r.color, 1).strokeRect(rx, my, rw, stallRowH);
      tx(l.item.name, rx + uiDim(12), my + uiDim(6), 12, r.hex, true);
      tx(`₵${l.price}`, rx + uiDim(12), my + uiDim(21), 11, "#f7ff3c");
      btn(rx + rw - uiDim(92), my + uiDim(6), uiDim(84), "CANCEL", COLORS.neonMagenta, true, () => this.onCancel?.(l.id));
      my += stallRowH + uiDim(2);
    }

    const sellY = my + uiDim(16);
    tx("SELL FROM BAG  (quick-list at 2× value)", rx, sellY, 13, "#39ff88", true);
    let sy = sellY + uiDim(24);
    if (this.bag.length === 0) tx("bag empty", rx, sy + uiDim(6), 12, "#5a6172");
    for (const it of this.bag.slice(0, 6)) {
      const r = RARITIES[it.rarity];
      const price = suggestedPrice(it);
      const fee = listingFee(price);
      g.fillStyle(0x12102a, 0.92).fillRect(rx, sy, rw, stallRowH);
      g.lineStyle(uiDim(1.2), r.color, 1).strokeRect(rx, sy, rw, stallRowH);
      tx(`${it.name}${(it.ilvl ?? 0) > 0 ? ` +${it.ilvl}` : ""}`, rx + uiDim(12), sy + uiDim(6), 12, r.hex, true);
      tx(itemLine(it), rx + uiDim(12), sy + uiDim(21), 10, "#9aa3b2");
      btn(rx + rw - uiDim(156), sy + uiDim(6), uiDim(148), `LIST ₵${price} (fee ₵${fee})`, COLORS.neonGreen, this.credits >= fee, () =>
        this.onList?.(it.id, price),
      );
      sy += stallRowH + uiDim(2);
    }
  }

  destroy() {
    this.clear();
  }
}