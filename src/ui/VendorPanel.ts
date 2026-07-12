import Phaser from "phaser";
import Vendor from "../systems/Vendor";
import Progression from "../systems/Progression";
import Inventory from "../systems/Inventory";
import { itemValue, sellValue, RARITIES } from "../game/items";
import { CONSUMABLES } from "../game/consumables";
import { drawPanelFrame } from "./panelChrome";
import { overlayRect, uiDim, uiFont } from "./uiLayout";
import { setFittedText } from "./typography";

const BUY_ROWS = 8; // 5 gear + 3 consumables
const SELL_ROWS = 13;

/**
 * Vendor overlay: BUY (gear stock + consumables) | SELL (your loot) + RESPEC.
 * Click a row to transact. onChange recomputes stats + saves. Freezes the sim.
 */
export default class VendorPanel {
  private scene: Phaser.Scene;
  private vendor: Vendor;
  private prog: Progression;
  private inv: Inventory;
  private onChange: () => void;

  private g: Phaser.GameObjects.Graphics;
  private statics: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private header!: Phaser.GameObjects.Text;
  private buyTexts: Phaser.GameObjects.Text[] = [];
  private sellTexts: Phaser.GameObjects.Text[] = [];
  private respecText!: Phaser.GameObjects.Text;
  private open = false;

  private readonly frame = overlayRect(18);
  private readonly x = this.frame.x;
  private readonly y = this.frame.y;
  private readonly w = this.frame.w;
  private readonly h = this.frame.h;
  private readonly colW = this.frame.w / 2;
  private readonly rowH = uiDim(24);

  constructor(scene: Phaser.Scene, vendor: Vendor, prog: Progression, inv: Inventory, onChange: () => void) {
    this.scene = scene;
    this.vendor = vendor;
    this.prog = prog;
    this.inv = inv;
    this.onChange = onChange;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.header = this.text(this.x + uiDim(16), this.y + uiDim(12), "", "#eafdff", 15, D);
    this.text(this.x + uiDim(16), this.y + uiDim(36), "BUY", "#39ff88", 12, D);
    this.text(this.x + this.colW + uiDim(16), this.y + uiDim(36), "SELL", "#f7ff3c", 12, D);

    for (let i = 0; i < BUY_ROWS; i++) {
      const ry = this.rowY(i);
      this.buyTexts.push(this.text(this.x + uiDim(22), ry + uiDim(5), "", "#eafdff", 11, D + 1));
      const z = scene.add
        .zone(this.x + uiDim(14), ry, this.colW - uiDim(28), this.rowH)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      z.on("pointerdown", () => this.buy(i));
      this.zones.push(z);
    }
    for (let i = 0; i < SELL_ROWS; i++) {
      const ry = this.rowY(i);
      this.sellTexts.push(this.text(this.x + this.colW + uiDim(22), ry + uiDim(5), "", "#eafdff", 11, D + 1));
      const z = scene.add
        .zone(this.x + this.colW + uiDim(14), ry, this.colW - uiDim(28), this.rowH)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      z.on("pointerdown", () => this.sell(i));
      this.zones.push(z);
    }

    const by = this.y + this.h - uiDim(30);
    this.respecText = this.text(this.x + uiDim(22), by + uiDim(5), "", "#f7ff3c", 12, D + 1);
    const rz = scene.add
      .zone(this.x + uiDim(14), by, uiDim(180), this.rowH)
      .setOrigin(0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    rz.on("pointerdown", () => this.doRespec());
    this.zones.push(rz);
    this.text(this.x + this.w - uiDim(130), by + uiDim(5), "E / ESC to close", "#9aa3b2", 11, D);

    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }
  toggle() {
    this.open ? this.close() : this.show();
  }
  show() {
    this.open = true;
    this.setVisible(true);
    this.refresh();
  }
  close() {
    this.open = false;
    this.setVisible(false);
  }

  private rowY(i: number) {
    return this.y + uiDim(54) + i * this.rowH;
  }

  private buy(i: number) {
    if (!this.open) return;
    const gear = this.vendor.gearStock;
    if (i < gear.length) {
      this.vendor.buyGear(gear[i], this.prog, this.inv);
    } else {
      const c = CONSUMABLES[i - gear.length];
      if (c) this.vendor.buyConsumable(c.id, this.prog);
    }
    this.onChange();
    this.refresh();
  }
  private sell(i: number) {
    if (!this.open) return;
    const it = this.inv.items[i];
    if (it) {
      this.vendor.sell(it, this.prog, this.inv);
      this.onChange();
      this.refresh();
    }
  }
  private doRespec() {
    if (!this.open) return;
    if (this.vendor.respec(this.prog)) {
      this.onChange();
      this.refresh();
    }
  }

  private refresh() {
    const g = this.g;
    g.clear();
    drawPanelFrame(g, this.x, this.y, this.w, this.h);
    g.lineStyle(uiDim(1), 0x29e7ff, 0.3).lineBetween(
      this.x + this.colW,
      this.y + uiDim(32),
      this.x + this.colW,
      this.y + this.h - uiDim(36),
    );

    setFittedText(this.header, `FIXER          ₵ ${this.prog.currency}`, this.w - uiDim(32));

    const gear = this.vendor.gearStock;
    for (let i = 0; i < BUY_ROWS; i++) {
      const txt = this.buyTexts[i];
      if (i < gear.length) {
        const it = gear[i];
        txt.setColor(RARITIES[it.rarity].hex);
        setFittedText(txt, `${it.name}  —  ₵${itemValue(it)}`, this.colW - uiDim(44), { minScale: 0.7 });
      } else {
        const c = CONSUMABLES[i - gear.length];
        if (c) {
          const have = this.prog.consumables[c.id] ?? 0;
          txt.setColor(c.hex);
          setFittedText(txt, `${c.name} (${c.desc})  —  ₵${c.price}   x${have}`, this.colW - uiDim(44), { minScale: 0.7 });
        } else txt.setText("");
      }
    }

    for (let i = 0; i < SELL_ROWS; i++) {
      const it = this.inv.items[i];
      this.sellTexts[i]
        .setColor(it ? RARITIES[it.rarity].hex : "#5a6172");
      setFittedText(this.sellTexts[i], it ? `${it.name}  —  +₵${sellValue(it)}` : "", this.colW - uiDim(44), { minScale: 0.7 });
    }

    setFittedText(this.respecText, `RESPEC SKILLS  (₵${this.vendor.respecCost})`, uiDim(160));
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.zones.forEach((z) => z.setVisible(v));
    this.statics.forEach((t) => t.setVisible(v));
  }

  private text(x: number, y: number, s: string, color: string, sizePx: number, depth: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: uiFont(sizePx), color })
      .setScrollFactor(0)
      .setDepth(depth);
    this.statics.push(t);
    return t;
  }
}
