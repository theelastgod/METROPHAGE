import Phaser from "phaser";
import { VIEW_W, VIEW_H } from "../config";
import Inventory from "../systems/Inventory";
import { Item, Slot, SLOTS, SLOT_NAMES, RARITIES, itemStatLines } from "../game/items";
import { getWeapon } from "../game/weapons";
import { iconKey } from "../assets/itemIcons";
import { ModBag } from "../game/stats";
import { drawPanelFrame } from "./panelChrome";

const COLS = 6;
const ROWS = 4;
const SLOT_ICON: Record<string, string> = { weapon: "WEAPON-MOD", implant: "IMPLANT", armor: "ARMOR", chip: "CHIP" };

/** Icon texture + tint for an inventory item (weapon → its type icon, else the slot icon). */
function itemIcon(it: Item): { key: string; tint: number } {
  const w = getWeapon(it.weaponId);
  if (w) return { key: iconKey(w.klass), tint: w.tint };
  return { key: iconKey(SLOT_ICON[it.slot] ?? "CHIP"), tint: RARITIES[it.rarity].color };
}

/**
 * Inventory overlay (toggle I): 4 equip slots + a bag grid. Click a bag item to
 * equip it (to its slot); click a slot to unequip. Equipping calls onChange to
 * recompute stats + save. Camera-fixed; scene freezes the sim while open.
 */
export default class InventoryPanel {
  private scene: Phaser.Scene;
  private inv: Inventory;
  private onChange: () => void;
  private g: Phaser.GameObjects.Graphics;
  private cellTexts: Phaser.GameObjects.Text[] = [];
  private cellIcons: Phaser.GameObjects.Image[] = [];
  private slotTexts: Phaser.GameObjects.Text[] = [];
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private header!: Phaser.GameObjects.Text;
  private summary!: Phaser.GameObjects.Text;
  private detail!: Phaser.GameObjects.Text;
  private statics: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private open = false;

  private readonly x = 70;
  private readonly y = 40;
  private readonly w = VIEW_W - 140;
  private readonly h = VIEW_H - 70;
  private readonly cellW = 62;
  private readonly cellH = 44;

  constructor(scene: Phaser.Scene, inv: Inventory, onChange: () => void) {
    this.scene = scene;
    this.inv = inv;
    this.onChange = onChange;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.header = this.text(this.x + 16, this.y + 12, "", "#eafdff", "13px", D);
    this.summary = this.text(this.x + 16, this.y + 32, "", "#39ff88", "10px", D);

    // Equip slots (left column).
    SLOTS.forEach((slot, i) => {
      const by = this.slotY(i);
      this.text(this.x + 22, by + 5, SLOT_NAMES[slot], "#9aa3b2", "9px", D);
      this.slotTexts.push(this.text(this.x + 44, by + 22, "—", "#5a6172", "10px", D + 1));
      this.slotIcons.push(
        scene.add.image(this.x + 30, by + 25, iconKey(SLOT_ICON[slot])).setDisplaySize(26, 26).setScrollFactor(0).setDepth(D + 1).setVisible(false),
      );
      const z = scene.add
        .zone(this.x + 16, by, 156, 46)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      z.on("pointerover", () => this.showDetail(this.inv.equipped[slot]));
      z.on("pointerdown", () => this.doUnequip(slot));
      this.zones.push(z);
    });

    // Bag grid (right).
    for (let i = 0; i < COLS * ROWS; i++) {
      const { cx, cy } = this.cellPos(i);
      this.cellIcons.push(
        scene.add.image(cx + this.cellW / 2, cy + this.cellH / 2, iconKey("PISTOL")).setDisplaySize(32, 32).setScrollFactor(0).setDepth(D + 1).setVisible(false),
      );
      this.cellTexts.push(
        this.text(cx + this.cellW - 6, cy + this.cellH - 4, "", "#eafdff", "8px", D + 2).setOrigin(1, 1),
      );
      const z = scene.add
        .zone(cx, cy, this.cellW, this.cellH)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      z.on("pointerover", () => this.showDetail(this.inv.items[i] ?? null));
      z.on("pointerdown", () => this.doEquip(i));
      this.zones.push(z);
    }

    this.detail = this.text(this.x + 16, this.y + this.h - 40, "", "#eafdff", "10px", D + 1);
    this.text(this.x + this.w - 132, this.y + 12, "I / ESC to close", "#9aa3b2", "10px", D);

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

  private slotY(i: number) {
    return this.y + 56 + i * 54;
  }
  private cellPos(i: number) {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    return { cx: this.x + 188 + c * (this.cellW + 2), cy: this.y + 56 + r * (this.cellH + 8) };
  }

  private doEquip(i: number) {
    if (!this.open) return;
    const it = this.inv.items[i];
    if (it && this.inv.equip(it)) {
      this.onChange();
      this.refresh();
      this.showDetail(this.inv.equipped[it.slot]);
    }
  }
  private doUnequip(slot: Slot) {
    if (!this.open) return;
    if (this.inv.unequip(slot)) {
      this.onChange();
      this.refresh();
    }
  }

  private showDetail(item: Item | null) {
    if (!this.open) return;
    if (!item) {
      this.detail.setText("");
      return;
    }
    this.detail
      .setText(`${item.name}\n${itemStatLines(item).join("   ")}`)
      .setColor(RARITIES[item.rarity].hex);
  }

  private refresh() {
    const g = this.g;
    g.clear();
    drawPanelFrame(g, this.x, this.y, this.w, this.h);

    this.header.setText(`INVENTORY   (${this.inv.items.length}/${this.inv.cap})`);
    this.summary.setText(this.modSummary(this.inv.mods()));

    // equip slots
    SLOTS.forEach((slot, i) => {
      const by = this.slotY(i);
      const it = this.inv.equipped[slot];
      const col = it ? RARITIES[it.rarity].color : 0x3a3350;
      g.fillStyle(0x0c0a18, 0.92).fillRect(this.x + 16, by, 156, 46);
      g.lineStyle(2, col, it ? 1 : 0.6).strokeRect(this.x + 16, by, 156, 46);
      const sIcon = this.slotIcons[i];
      if (it) {
        const ic = itemIcon(it);
        sIcon.setVisible(true).setTexture(ic.key).setTint(ic.tint);
      } else sIcon.setVisible(false);
      this.slotTexts[i]
        .setText(it ? it.name : "—")
        .setColor(it ? RARITIES[it.rarity].hex : "#5a6172");
    });

    // bag cells
    for (let i = 0; i < COLS * ROWS; i++) {
      const { cx, cy } = this.cellPos(i);
      const it = this.inv.items[i];
      const col = it ? RARITIES[it.rarity].color : 0x241d3a;
      g.fillStyle(it ? 0x14102a : 0x0c0a18, 0.92).fillRect(cx, cy, this.cellW, this.cellH);
      g.lineStyle(1, col, it ? 1 : 0.5).strokeRect(cx, cy, this.cellW, this.cellH);
      const icon = this.cellIcons[i];
      if (it) {
        const ic = itemIcon(it);
        icon.setVisible(true).setTexture(ic.key).setTint(ic.tint);
        this.cellTexts[i].setText(SLOT_NAMES[it.slot][0]).setColor(RARITIES[it.rarity].hex);
      } else {
        icon.setVisible(false);
        this.cellTexts[i].setText("");
      }
    }
  }

  private modSummary(m: ModBag): string {
    const parts: string[] = [];
    if (m.dmgPct) parts.push(`DMG +${Math.round(m.dmgPct * 100)}%`);
    if (m.hpAdd) parts.push(`HP +${Math.round(m.hpAdd)}`);
    if (m.shieldAdd) parts.push(`SHLD +${Math.round(m.shieldAdd)}`);
    if (m.movePct) parts.push(`MOVE +${Math.round(m.movePct * 100)}%`);
    if (m.cdReducePct) parts.push(`CD -${Math.round(m.cdReducePct * 100)}%`);
    if (m.infectPct) parts.push(`INFECT +${Math.round(m.infectPct * 100)}%`);
    if (m.heatGainPct) parts.push(`HEAT +${Math.round(m.heatGainPct * 100)}%`);
    if (m.heatDecayPct) parts.push(`DECAY -${Math.round(m.heatDecayPct * 100)}%`);
    return parts.length ? "EQUIPPED: " + parts.join("  ") : "EQUIPPED: (none)";
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.zones.forEach((z) => z.setVisible(v));
    this.cellTexts.forEach((t) => t.setVisible(v));
    this.slotTexts.forEach((t) => t.setVisible(v));
    this.statics.forEach((t) => t.setVisible(v));
    this.header.setVisible(v);
    this.summary.setVisible(v);
    this.detail.setVisible(v);
    if (!v) {
      this.cellIcons.forEach((i) => i.setVisible(false));
      this.slotIcons.forEach((i) => i.setVisible(false));
    }
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
