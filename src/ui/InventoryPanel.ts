import Phaser from "phaser";
import Inventory from "../systems/Inventory";
import { Item, Slot, SLOTS, SLOT_NAMES, RARITIES, itemStatLines } from "../game/items";
import { getWeapon } from "../game/weapons";
import { iconKey } from "../assets/itemIcons";
import { ModBag } from "../game/stats";
import { drawPanelFrame } from "./panelChrome";
import { overlayRect, uiDim, uiFont } from "./uiLayout";

const COLS = 6;
const ROWS = 4;
const SLOT_ICON: Record<string, string> = { weapon: "WEAPON-MOD", implant: "IMPLANT", armor: "ARMOR", chip: "CHIP" };

/** Icon texture + tint for an inventory item (weapon → its type icon, else the slot icon). */
function itemIcon(it: Item): { key: string; tint: number } {
  const w = getWeapon(it.weaponId);
  if (w) return { key: iconKey(w.klass), tint: 0xffffff };
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

  private readonly frame = overlayRect(18);
  private readonly x = this.frame.x;
  private readonly y = this.frame.y;
  private readonly w = this.frame.w;
  private readonly h = this.frame.h;
  private readonly cellW = uiDim(72);
  private readonly cellH = uiDim(52);
  private readonly slotW = uiDim(200);
  private readonly slotH = uiDim(54);

  constructor(scene: Phaser.Scene, inv: Inventory, onChange: () => void) {
    this.scene = scene;
    this.inv = inv;
    this.onChange = onChange;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.header = this.text(this.x + uiDim(16), this.y + uiDim(12), "", "#eafdff", 15, D);
    this.summary = this.text(this.x + uiDim(16), this.y + uiDim(36), "", "#39ff88", 11, D);

    SLOTS.forEach((slot, i) => {
      const by = this.slotY(i);
      this.text(this.x + uiDim(22), by + uiDim(5), SLOT_NAMES[slot], "#9aa3b2", 10, D);
      this.slotTexts.push(this.text(this.x + uiDim(52), by + uiDim(24), "—", "#5a6172", 12, D + 1));
      this.slotIcons.push(
        scene.add
          .image(this.x + uiDim(34), by + uiDim(28), iconKey(SLOT_ICON[slot]))
          .setDisplaySize(uiDim(30), uiDim(30))
          .setScrollFactor(0)
          .setDepth(D + 1)
          .setVisible(false),
      );
      const z = scene.add
        .zone(this.x + uiDim(16), by, this.slotW, this.slotH)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      z.on("pointerover", () => this.showDetail(this.inv.equipped[slot]));
      z.on("pointerdown", () => this.doUnequip(slot));
      this.zones.push(z);
    });

    for (let i = 0; i < COLS * ROWS; i++) {
      const { cx, cy } = this.cellPos(i);
      this.cellIcons.push(
        scene.add
          .image(cx + this.cellW / 2, cy + this.cellH / 2, iconKey("PISTOL"))
          .setDisplaySize(uiDim(36), uiDim(36))
          .setScrollFactor(0)
          .setDepth(D + 1)
          .setVisible(false),
      );
      this.cellTexts.push(
        this.text(cx + this.cellW - uiDim(6), cy + this.cellH - uiDim(4), "", "#eafdff", 10, D + 2).setOrigin(1, 1),
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

    this.detail = this.text(this.x + uiDim(16), this.y + this.h - uiDim(48), "", "#eafdff", 12, D + 1);
    this.text(this.x + this.w - uiDim(16), this.y + uiDim(12), "I / ESC to close", "#9aa3b2", 11, D).setOrigin(1, 0);

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
    return this.y + uiDim(64) + i * (this.slotH + uiDim(8));
  }
  private cellPos(i: number) {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    return {
      cx: this.x + uiDim(240) + c * (this.cellW + uiDim(4)),
      cy: this.y + uiDim(64) + r * (this.cellH + uiDim(10)),
    };
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

    SLOTS.forEach((slot, i) => {
      const by = this.slotY(i);
      const it = this.inv.equipped[slot];
      const col = it ? RARITIES[it.rarity].color : 0x3a3350;
      g.fillStyle(0x0c0a18, 0.92).fillRect(this.x + uiDim(16), by, this.slotW, this.slotH);
      g.lineStyle(uiDim(2), col, it ? 1 : 0.6).strokeRect(this.x + uiDim(16), by, this.slotW, this.slotH);
      const sIcon = this.slotIcons[i];
      if (it) {
        const ic = itemIcon(it);
        sIcon.setVisible(true).setTexture(ic.key).setTint(ic.tint);
      } else sIcon.setVisible(false);
      this.slotTexts[i]
        .setText(it ? it.name : "—")
        .setColor(it ? RARITIES[it.rarity].hex : "#5a6172");
    });

    for (let i = 0; i < COLS * ROWS; i++) {
      const { cx, cy } = this.cellPos(i);
      const it = this.inv.items[i];
      const col = it ? RARITIES[it.rarity].color : 0x241d3a;
      g.fillStyle(it ? 0x14102a : 0x0c0a18, 0.92).fillRect(cx, cy, this.cellW, this.cellH);
      g.lineStyle(uiDim(1), col, it ? 1 : 0.5).strokeRect(cx, cy, this.cellW, this.cellH);
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

  private text(x: number, y: number, s: string, color: string, sizePx: number, depth: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: uiFont(sizePx), color })
      .setScrollFactor(0)
      .setDepth(depth);
    this.statics.push(t);
    return t;
  }
}