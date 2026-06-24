import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
import { Item, Slot, RARITIES, SLOT_NAMES, itemStatLines } from "../game/items";
import { getWeapon } from "../game/weapons";
import { iconKey, ensureItemIcons } from "../assets/itemIcons";

// METROPHAGE online inventory — the player's server-authoritative held gear, shown as an
// always-visible bottom hotbar and an openable full bag (key I). Read-only display for
// now (loot lands here from kills; equipping/using is a later chunk). All screen-space
// (scrollFactor 0) so it rides the UI camera, untouched by the world zoom + post-FX.

const SLOT_ICON: Record<Slot, string> = {
  weapon: "WEAPON-MOD",
  implant: "IMPLANT",
  armor: "ARMOR",
  chip: "CHIP",
};

function itemIcon(it: Item): { key: string; tint: number } {
  const w = it.weaponId ? getWeapon(it.weaponId) : undefined;
  if (w) return { key: iconKey(w.klass), tint: w.tint };
  return { key: iconKey(SLOT_ICON[it.slot]), tint: RARITIES[it.rarity].color };
}

const HOTBAR_SLOTS = 8;
const CAP = 24;
const HB_CELL = 42;
const HB_GAP = 6;

export default class OnlineInventory {
  open = false;
  private scene: Phaser.Scene;
  private items: Item[] = [];

  // hotbar (persistent slots, updated in place)
  private barG: Phaser.GameObjects.Graphics;
  private barIcons: Phaser.GameObjects.Image[] = [];
  private barHint: Phaser.GameObjects.Text;
  private readonly barX = 16;
  private readonly barY = VIEW_H - HB_CELL - 16;

  // full bag (rebuilt on open / refresh)
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
          .setDisplaySize(30, 30)
          .setScrollFactor(0)
          .setDepth(1501)
          .setVisible(false),
      );
    }
    this.barHint = scene.add
      .text(this.barX, this.barY - 14, "I ▸ BAG", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#6b7184",
      })
      .setScrollFactor(0)
      .setDepth(1501);
    this.drawHotbar();
  }

  setItems(items: Item[]) {
    this.items = items ?? [];
    this.drawHotbar();
    if (this.open) this.buildPanel(); // live-refresh while the bag is open
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
      g.lineStyle(2, col, it ? 1 : 0.5).strokeRect(x, this.barY, HB_CELL, HB_CELL);
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
    const w = VIEW_W - 320;
    const h = VIEW_H - 150;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;

    // dim backdrop + framed panel
    add(scene.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x02020a, 0.62).setScrollFactor(0).setDepth(D));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.96).fillRect(x, y, w, h);
    g.lineStyle(2, COLORS.neonCyan, 0.85).strokeRect(x, y, w, h);
    g.lineStyle(2, COLORS.neonMagenta, 0.9);
    g.beginPath();
    g.moveTo(x, y + 16);
    g.lineTo(x, y);
    g.lineTo(x + 16, y);
    g.strokePath();

    add(
      scene.add
        .text(x + 18, y + 12, `◧ INVENTORY`, {
          fontFamily: "Courier New, monospace",
          fontSize: "16px",
          color: "#00e5ff",
          fontStyle: "bold",
        })
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
    add(
      scene.add
        .text(x + w - 18, y + 14, `${this.items.length} / ${CAP}    I · ESC to close`, {
          fontFamily: "Courier New, monospace",
          fontSize: "11px",
          color: "#9aa3b2",
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(D + 2),
    );

    if (this.items.length === 0) {
      add(
        scene.add
          .text(VIEW_W / 2, VIEW_H / 2, "— empty —\nkill the Human Security System to drop gear", {
            fontFamily: "Courier New, monospace",
            fontSize: "13px",
            color: "#5a6172",
            align: "center",
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      return;
    }

    // 4-column grid of item cards
    const cols = 4;
    const pad = 18;
    const gridX = x + pad;
    const gridY = y + 44;
    const cardW = (w - pad * 2 - (cols - 1) * 10) / cols;
    const cardH = 96;
    this.items.slice(0, CAP).forEach((it, i) => {
      const cx = gridX + (i % cols) * (cardW + 10);
      const cy = gridY + Math.floor(i / cols) * (cardH + 10);
      const r = RARITIES[it.rarity];
      g.fillStyle(0x12102a, 0.92).fillRect(cx, cy, cardW, cardH);
      g.lineStyle(1.5, r.color, 1).strokeRect(cx, cy, cardW, cardH);
      const ic = itemIcon(it);
      add(
        scene.add
          .image(cx + 30, cy + 30, ic.key)
          .setDisplaySize(40, 40)
          .setTint(ic.tint)
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      add(
        scene.add
          .text(cx + 56, cy + 12, it.name, {
            fontFamily: "Courier New, monospace",
            fontSize: "12px",
            color: r.hex,
            fontStyle: "bold",
          })
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      add(
        scene.add
          .text(cx + 56, cy + 28, `${r.name} · ${SLOT_NAMES[it.slot]}`, {
            fontFamily: "Courier New, monospace",
            fontSize: "10px",
            color: "#9aa3b2",
          })
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      add(
        scene.add
          .text(cx + 10, cy + 52, itemStatLines(it).join("\n") || "—", {
            fontFamily: "Courier New, monospace",
            fontSize: "10px",
            color: "#cfe8ff",
            lineSpacing: 2,
            wordWrap: { width: cardW - 20 },
          })
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
    });
  }

  destroy() {
    this.clearPanel();
    this.barG.destroy();
    this.barIcons.forEach((i) => i.destroy());
    this.barHint.destroy();
  }
}
