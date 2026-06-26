import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
import { Item, Slot, SLOTS, RARITIES, SLOT_NAMES, itemStatLines } from "../game/items";
import { getWeapon } from "../game/weapons";
import { iconKey, ensureItemIcons } from "../assets/itemIcons";
import { dimBackdrop, overlayRect, uiDim, uiFont } from "./uiLayout";

const SLOT_ICON: Record<Slot, string> = {
  weapon: "WEAPON-MOD",
  implant: "IMPLANT",
  armor: "ARMOR",
  chip: "CHIP",
};

function itemIcon(it: Item): { key: string; tint: number } {
  const w = it.weaponId ? getWeapon(it.weaponId) : undefined;
  if (w) return { key: iconKey(w.klass), tint: 0xffffff };
  return { key: iconKey(SLOT_ICON[it.slot]), tint: RARITIES[it.rarity].color };
}

const HOTBAR_SLOTS = 8;
const CAP = 24;
const HB_CELL = uiDim(48);
const HB_GAP = uiDim(6);

export default class OnlineInventory {
  open = false;
  onEquip?: (itemId: string) => void;
  onUnequip?: (slot: string) => void;
  private scene: Phaser.Scene;
  private items: Item[] = [];
  private equipped: Item[] = [];

  private barG: Phaser.GameObjects.Graphics;
  private barIcons: Phaser.GameObjects.Image[] = [];
  private barHint: Phaser.GameObjects.Text;
  private readonly barX = uiDim(16);
  private readonly barY = VIEW_H - HB_CELL - uiDim(16);

  private panelObjs: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    ensureItemIcons(scene);
    this.barG = scene.add.graphics().setScrollFactor(0).setDepth(1500);
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const cx = this.barX + i * (HB_CELL + HB_GAP) + HB_CELL / 2;
      this.barIcons.push(
        scene.add
          .image(cx, this.barY + HB_CELL / 2, iconKey("CHIP"))
          .setDisplaySize(uiDim(34), uiDim(34))
          .setScrollFactor(0)
          .setDepth(1501)
          .setVisible(false),
      );
    }
    this.barHint = scene.add
      .text(this.barX, this.barY - uiDim(16), "I ▸ BAG", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(12),
        color: "#6b7184",
      })
      .setScrollFactor(0)
      .setDepth(1501);
    this.drawHotbar();
  }

  setItems(items: Item[]) {
    this.items = items ?? [];
    this.drawHotbar();
    if (this.open) this.buildPanel();
  }

  setEquipped(items: Item[]) {
    this.equipped = items ?? [];
    if (this.open) this.buildPanel();
  }

  toggle() {
    this.open = !this.open;
    if (this.open) this.buildPanel();
    else this.clearPanel();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.clearPanel();
  }

  private drawHotbar() {
    const g = this.barG;
    g.clear();
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const x = this.barX + i * (HB_CELL + HB_GAP);
      const it = this.items[i];
      const col = it ? RARITIES[it.rarity].color : 0x2a2440;
      g.fillStyle(0x07061a, 0.78).fillRect(x, this.barY, HB_CELL, HB_CELL);
      g.lineStyle(uiDim(2), col, it ? 1 : 0.5).strokeRect(x, this.barY, HB_CELL, HB_CELL);
      const icon = this.barIcons[i];
      if (it) {
        const ic = itemIcon(it);
        icon.setVisible(true).setTexture(ic.key).setTint(ic.tint);
      } else {
        icon.setVisible(false);
      }
    }
    const overflow = Math.max(0, this.items.length - HOTBAR_SLOTS);
    this.barHint.setText(overflow > 0 ? `I ▸ BAG  +${overflow}` : "I ▸ BAG");
  }

  private clearPanel() {
    for (const o of this.panelObjs) o.destroy();
    this.panelObjs = [];
  }

  private buildPanel() {
    this.clearPanel();
    const scene = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.panelObjs.push(o);
      return o;
    };
    const D = 1700;
    const { x, y, w, h } = overlayRect(16);

    add(dimBackdrop(scene, D));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.96).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), COLORS.neonCyan, 0.85).strokeRect(x, y, w, h);
    g.lineStyle(uiDim(2), COLORS.neonMagenta, 0.9);
    const corner = uiDim(16);
    g.beginPath();
    g.moveTo(x, y + corner);
    g.lineTo(x, y);
    g.lineTo(x + corner, y);
    g.strokePath();

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
          .setDepth(D + 2),
      );
    const icon = (it: Item, ix: number, iy: number, size: number) => {
      const ic = itemIcon(it);
      add(scene.add.image(ix, iy, ic.key).setDisplaySize(size, size).setTint(ic.tint).setScrollFactor(0).setDepth(D + 2));
    };
    const hit = (hx: number, hy: number, hw: number, hh: number, fn: () => void) => {
      const z = add(
        scene.add.zone(hx, hy, hw, hh).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 3),
      );
      z.on("pointerdown", fn);
    };

    tx("◧ LOADOUT + BAG", x + uiDim(20), y + uiDim(14), 20, "#00e5ff", true);
    tx(`bag ${this.items.length}/${CAP}  ·  click to equip · I/ESC close`, x + w - uiDim(20), y + uiDim(16), 13, "#9aa3b2", false, 1);

    tx("LOADOUT", x + uiDim(20), y + uiDim(48), 13, "#6b7184");
    const eqBy: Partial<Record<Slot, Item>> = {};
    for (const it of this.equipped) eqBy[it.slot] = it;
    const slotW = (w - uiDim(40) - uiDim(30)) / 4;
    const slotY = y + uiDim(68);
    const slotH = uiDim(68);
    SLOTS.forEach((slot, i) => {
      const sx = x + uiDim(20) + i * (slotW + uiDim(10));
      const it = eqBy[slot];
      const col = it ? RARITIES[it.rarity].color : 0x3a3350;
      g.fillStyle(0x0c0a18, 0.92).fillRect(sx, slotY, slotW, slotH);
      g.lineStyle(uiDim(1.5), col, it ? 1 : 0.5).strokeRect(sx, slotY, slotW, slotH);
      tx(SLOT_NAMES[slot], sx + uiDim(10), slotY + uiDim(6), 11, "#6b7184");
      if (it) {
        icon(it, sx + uiDim(28), slotY + uiDim(40), uiDim(36));
        tx(it.name, sx + uiDim(52), slotY + uiDim(28), 13, RARITIES[it.rarity].hex, true);
        hit(sx, slotY, slotW, slotH, () => this.onUnequip?.(slot));
      } else {
        tx("— empty —", sx + slotW / 2, slotY + uiDim(34), 11, "#5a6172", false, 0.5);
      }
    });

    const cols = 4;
    const pad = uiDim(20);
    const gridX = x + pad;
    const gridY = y + uiDim(156);
    const cardGap = uiDim(12);
    const cardW = (w - pad * 2 - (cols - 1) * cardGap) / cols;
    const cardH = uiDim(108);
    const rows = Math.max(1, Math.floor((y + h - gridY - pad) / (cardH + cardGap)));
    if (this.items.length === 0) {
      tx("bag empty — kill the Human Security System to drop gear", VIEW_W / 2, gridY + uiDim(80), 14, "#5a6172", false, 0.5);
    }
    this.items.slice(0, cols * rows).forEach((it, i) => {
      const cx = gridX + (i % cols) * (cardW + cardGap);
      const cy = gridY + Math.floor(i / cols) * (cardH + cardGap);
      const r = RARITIES[it.rarity];
      g.fillStyle(0x12102a, 0.92).fillRect(cx, cy, cardW, cardH);
      g.lineStyle(uiDim(1.5), r.color, 1).strokeRect(cx, cy, cardW, cardH);
      icon(it, cx + uiDim(32), cy + uiDim(36), uiDim(44));
      tx(it.name, cx + uiDim(60), cy + uiDim(12), 14, r.hex, true);
      tx(`${r.name} · ${SLOT_NAMES[it.slot]}`, cx + uiDim(60), cy + uiDim(32), 12, "#9aa3b2");
      add(
        scene.add
          .text(cx + uiDim(12), cy + uiDim(58), itemStatLines(it).join("  ") || "—", {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(11),
            color: "#cfe8ff",
            lineSpacing: uiDim(3),
            wordWrap: { width: cardW - uiDim(24) },
          })
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      hit(cx, cy, cardW, cardH, () => this.onEquip?.(it.id));
    });
  }

  destroy() {
    this.clearPanel();
    this.barG.destroy();
    this.barIcons.forEach((i) => i.destroy());
    this.barHint.destroy();
  }
}