import Phaser from "phaser";
import { VIEW_W, VIEW_H } from "../config";
import Vendor from "../systems/Vendor";
import Progression from "../systems/Progression";
import Inventory from "../systems/Inventory";
import { itemValue, sellValue, RARITIES } from "../game/items";
import { CONSUMABLES } from "../game/consumables";

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

  private readonly x = 60;
  private readonly y = 36;
  private readonly w = VIEW_W - 120;
  private readonly h = VIEW_H - 60;
  private readonly colW = (VIEW_W - 120) / 2;

  constructor(scene: Phaser.Scene, vendor: Vendor, prog: Progression, inv: Inventory, onChange: () => void) {
    this.scene = scene;
    this.vendor = vendor;
    this.prog = prog;
    this.inv = inv;
    this.onChange = onChange;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.header = this.text(this.x + 14, this.y + 10, "", "#eafdff", "13px", D);
    this.text(this.x + 14, this.y + 34, "BUY", "#39ff88", "11px", D);
    this.text(this.x + this.colW + 14, this.y + 34, "SELL", "#f7ff3c", "11px", D);

    for (let i = 0; i < BUY_ROWS; i++) {
      const ry = this.rowY(i);
      this.buyTexts.push(this.text(this.x + 20, ry + 4, "", "#eafdff", "10px", D + 1));
      const z = scene.add.zone(this.x + 14, ry, this.colW - 28, 20).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true });
      z.on("pointerdown", () => this.buy(i));
      this.zones.push(z);
    }
    for (let i = 0; i < SELL_ROWS; i++) {
      const ry = this.rowY(i);
      this.sellTexts.push(this.text(this.x + this.colW + 20, ry + 4, "", "#eafdff", "10px", D + 1));
      const z = scene.add.zone(this.x + this.colW + 14, ry, this.colW - 28, 20).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true });
      z.on("pointerdown", () => this.sell(i));
      this.zones.push(z);
    }

    // RESPEC
    const by = this.y + this.h - 26;
    this.respecText = this.text(this.x + 20, by + 4, "", "#f7ff3c", "11px", D + 1);
    const rz = scene.add.zone(this.x + 14, by, 170, 20).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    rz.on("pointerdown", () => this.doRespec());
    this.zones.push(rz);
    this.text(this.x + this.w - 124, by + 4, "E / ESC to close", "#9aa3b2", "10px", D);

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
    return this.y + 52 + i * 22;
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
    g.fillStyle(0x07061a, 0.96).fillRect(this.x, this.y, this.w, this.h);
    g.lineStyle(2, 0x00e5ff, 0.9).strokeRect(this.x, this.y, this.w, this.h);
    g.lineStyle(1, 0x29e7ff, 0.3).lineBetween(this.x + this.colW, this.y + 30, this.x + this.colW, this.y + this.h - 32);

    this.header.setText(`FIXER          ₵ ${this.prog.currency}`);

    const gear = this.vendor.gearStock;
    for (let i = 0; i < BUY_ROWS; i++) {
      const txt = this.buyTexts[i];
      if (i < gear.length) {
        const it = gear[i];
        txt.setText(`${it.name}  —  ₵${itemValue(it)}`).setColor(RARITIES[it.rarity].hex);
      } else {
        const c = CONSUMABLES[i - gear.length];
        if (c) {
          const have = this.prog.consumables[c.id] ?? 0;
          txt.setText(`${c.name} (${c.desc})  —  ₵${c.price}   x${have}`).setColor(c.hex);
        } else txt.setText("");
      }
    }

    for (let i = 0; i < SELL_ROWS; i++) {
      const it = this.inv.items[i];
      this.sellTexts[i]
        .setText(it ? `${it.name}  —  +₵${sellValue(it)}` : "")
        .setColor(it ? RARITIES[it.rarity].hex : "#5a6172");
    }

    this.respecText.setText(`RESPEC SKILLS  (₵${this.vendor.respecCost})`);
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.zones.forEach((z) => z.setVisible(v));
    this.statics.forEach((t) => t.setVisible(v));
  }

  private text(x: number, y: number, s: string, color: string, size: string, depth: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: size, color })
      .setScrollFactor(0)
      .setDepth(depth);
    this.statics.push(t);
    return t;
  }
}
