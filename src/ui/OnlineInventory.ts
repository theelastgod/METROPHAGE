import Phaser from "phaser";
import { COLORS } from "../config";
import { Item, Slot, SLOTS, RARITIES, SLOT_NAMES, itemStatLines } from "../game/items";
import { getWeapon } from "../game/weapons";
import { iconKey, ensureItemIcons } from "../assets/itemIcons";
import { dimBackdrop, onlineHudStack, overlayRect, uiDim, uiFont } from "./uiLayout";
import ContextMenu from "./ContextMenu";
import { getSettings } from "../systems/Settings";
import { prefersMobileUx } from "../systems/Mobile";

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
const HB_CELL = uiDim(48);
const HB_GAP = uiDim(6);
const LOADOUT_SLOTS: Slot[] = ["weapon", "armor", "implant", "chip"];

export default class OnlineInventory {
  open = false;
  onEquip?: (itemId: string) => void;
  onUnequip?: (slot: string) => void;
  onMove?: (from: number, to: number) => void;
  onExamine?: (text: string) => void;
  private scene: Phaser.Scene;
  private contextMenu: ContextMenu;
  private items: Item[] = [];
  private equipped: Item[] = [];
  private selectedBag = -1;

  private barG: Phaser.GameObjects.Graphics;
  private barIcons: Phaser.GameObjects.Image[] = [];
  private barZones: Phaser.GameObjects.Zone[] = [];
  private barHint: Phaser.GameObjects.Text;
  private barSlotLabels: Phaser.GameObjects.Text[] = [];
  private readonly barX: number;
  private readonly barY: number;
  private readonly mobile: boolean;

  private panelObjs: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, contextMenu?: ContextMenu) {
    this.scene = scene;
    this.contextMenu = contextMenu ?? new ContextMenu(scene);
    ensureItemIcons(scene);
    this.mobile = prefersMobileUx();
    // Mobile: hotbar sits top-center so the virtual stick owns the bottom-left.
    if (this.mobile) {
      const slotsW = HOTBAR_SLOTS * (HB_CELL + HB_GAP);
      this.barX = Math.max(uiDim(8), (scene.scale.width - slotsW) / 2);
      this.barY = uiDim(38); // clean gap above the Bag/Map/Quests/Chat bar at 94
    } else {
      this.barX = uiDim(16);
      this.barY = onlineHudStack(scene.scale.height).hotbarY;
    }
    this.barG = scene.add.graphics().setScrollFactor(0).setDepth(1500);
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const cx = this.barX + i * (HB_CELL + HB_GAP) + HB_CELL / 2;
      this.barIcons.push(
        scene.add
          .image(cx, this.barY + HB_CELL / 2, iconKey("CHIP"))
          .setDisplaySize(uiDim(this.mobile ? 28 : 34), uiDim(this.mobile ? 28 : 34))
          .setScrollFactor(0)
          .setDepth(1501)
          .setVisible(false),
      );
    }
    // hint rides at the right end of the hotbar row so it never hides under the chat frame
    this.barHint = scene.add
      .text(
        this.barX + HOTBAR_SLOTS * (HB_CELL + HB_GAP) + HB_GAP,
        this.barY + HB_CELL / 2,
        this.mobile ? "BAG" : "I ▸ LOADOUT",
        {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(this.mobile ? 9 : 11),
          color: "#6b7184",
        },
      )
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(1501)
      .setVisible(!this.mobile);
    this.drawHotbar();
  }

  setItems(items: Item[]) {
    this.items = items ?? [];
    if (this.selectedBag >= this.items.length) this.selectedBag = -1;
    this.drawHotbar();
    if (this.open) this.buildPanel();
  }

  setEquipped(items: Item[]) {
    this.equipped = items ?? [];
    this.drawHotbar();
    if (this.open) this.buildPanel();
  }

  toggle() {
    this.open = !this.open;
    if (this.open) {
      this.selectedBag = -1;
      this.buildPanel();
    } else this.clearPanel();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.selectedBag = -1;
    this.clearPanel();
  }

  private eqBySlot(): Partial<Record<Slot, Item>> {
    const m: Partial<Record<Slot, Item>> = {};
    for (const it of this.equipped) m[it.slot] = it;
    return m;
  }

  private showItemContextMenu(pointer: Phaser.Input.Pointer, it: Item, bagIndex?: number) {
    if (!getSettings().rsControls) return;
    const stats = itemStatLines(it).join(" · ");
    const examine = `${it.name} — ${RARITIES[it.rarity].name} ${SLOT_NAMES[it.slot]}. ${stats || "standard issue gear."}`;
    this.contextMenu.show(pointer.x, pointer.y, it.name, [
      { label: "Examine", color: "#c8c8c8", onPick: () => this.onExamine?.(examine) },
      {
        label: it.slot === "weapon" ? "Wield" : "Wear",
        onPick: () => this.onEquip?.(it.id),
      },
      ...(bagIndex !== undefined
        ? [
            {
              label: "Swap slot",
              onPick: () => {
                this.open = true;
                this.selectedBag = bagIndex;
                this.buildPanel();
              },
            },
          ]
        : []),
      {
        label: "Drop",
        color: "#ff6b6b",
        onPick: () => this.onExamine?.("Operator gear is soulbound — cannot drop while linked to the live grid."),
      },
    ]);
  }

  private drawHotbar() {
    const g = this.barG;
    const eq = this.eqBySlot();
    g.clear();
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const x = this.barX + i * (HB_CELL + HB_GAP);
      const weaponSlot = i === 0;
      const it = weaponSlot ? eq.weapon : this.items[i - 1];
      const col = weaponSlot ? 0x29e7ff : it ? RARITIES[it.rarity].color : 0x2a2440;
      g.fillStyle(weaponSlot ? 0x0c1428 : 0x07061a, 0.78).fillRect(x, this.barY, HB_CELL, HB_CELL);
      g.lineStyle(uiDim(weaponSlot ? 2.5 : 2), col, it || weaponSlot ? 1 : 0.5).strokeRect(x, this.barY, HB_CELL, HB_CELL);
      const icon = this.barIcons[i];
      if (it) {
        const ic = itemIcon(it);
        icon.setVisible(true).setTexture(ic.key).setTint(ic.tint);
      } else if (weaponSlot) {
        icon.setVisible(true).setTexture(iconKey("BLADE")).setTint(0x3a3350);
      } else {
        icon.setVisible(false);
      }
    }
    for (const lbl of this.barSlotLabels) lbl.destroy();
    this.barSlotLabels = [];
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const weaponSlot = i === 0;
      const it = weaponSlot ? eq.weapon : this.items[i - 1];
      if (it) continue;
      const x = this.barX + i * (HB_CELL + HB_GAP);
      const lbl = this.scene.add
        .text(x + HB_CELL / 2, this.barY + HB_CELL / 2, weaponSlot ? "—" : `${i}`, {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(weaponSlot ? 16 : 10),
          color: "#3a3350",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1501)
        .setAlpha(weaponSlot ? 0.55 : 0.42);
      this.barSlotLabels.push(lbl);
    }
    for (const z of this.barZones) z.destroy();
    this.barZones = [];
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const x = this.barX + i * (HB_CELL + HB_GAP);
      const weaponSlot = i === 0;
      const it = weaponSlot ? eq.weapon : this.items[i - 1];
      const z = this.scene.add
        .zone(x, this.barY, HB_CELL, HB_CELL)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(1502)
        .setInteractive({ useHandCursor: !!it });
      z.on("pointerdown", (pointer: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        if (!it) return;
        if (pointer.rightButtonDown()) {
          ev.stopPropagation();
          this.showItemContextMenu(pointer, it, weaponSlot ? undefined : i - 1);
          return;
        }
        if (!this.open && !pointer.rightButtonDown()) this.onEquip?.(it.id);
      });
      this.barZones.push(z);
    }

    const overflow = Math.max(0, this.items.length - (HOTBAR_SLOTS - 1));
    const wpn = eq.weapon;
    const wpnLabel = wpn ? (wpn.weaponId ? getWeapon(wpn.weaponId)?.klass ?? "WEAPON" : "WEAPON") : "no weapon";
    this.barHint.setText(
      overflow > 0 ? `I ▸ ${wpnLabel}  +${overflow} bag · right-click slots` : `I ▸ ${wpnLabel} · right-click slots`,
    );
  }

  private clearPanel() {
    for (const o of this.panelObjs) o.destroy();
    this.panelObjs = [];
  }

  private bagClick(index: number) {
    if (this.selectedBag < 0) {
      this.selectedBag = index;
      this.buildPanel();
      return;
    }
    if (this.selectedBag === index) {
      this.selectedBag = -1;
      this.buildPanel();
      return;
    }
    this.onMove?.(this.selectedBag, index);
    this.selectedBag = -1;
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
    const icon = (it: Item | undefined, ix: number, iy: number, size: number, fallback = "CHIP", tint = 0x3a3350) => {
      if (it) {
        const ic = itemIcon(it);
        add(scene.add.image(ix, iy, ic.key).setDisplaySize(size, size).setTint(ic.tint).setScrollFactor(0).setDepth(D + 2));
      } else {
        add(scene.add.image(ix, iy, iconKey(fallback)).setDisplaySize(size, size).setTint(tint).setScrollFactor(0).setDepth(D + 2).setAlpha(0.45));
      }
    };
    const hit = (
      hx: number,
      hy: number,
      hw: number,
      hh: number,
      fn: () => void,
      rightFn?: (pointer: Phaser.Input.Pointer) => void,
    ) => {
      const z = add(
        scene.add.zone(hx, hy, hw, hh).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 3),
      );
      z.on("pointerdown", (pointer: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        if (pointer.rightButtonDown() && rightFn) {
          ev.stopPropagation();
          rightFn(pointer);
          return;
        }
        if (!pointer.rightButtonDown()) fn();
      });
    };

    const itemMenu = (pointer: Phaser.Input.Pointer, it: Item, bagIndex?: number) => {
      this.showItemContextMenu(pointer, it, bagIndex);
    };

    const eq = this.eqBySlot();
    const selHint = this.selectedBag >= 0 ? `moving slot ${this.selectedBag + 1} — click destination` : "click bag item to move · click gear to equip";
    tx("◧ OPERATOR LOADOUT", x + uiDim(20), y + uiDim(14), 20, "#00e5ff", true);
    tx(`bag ${this.items.length}/${CAP}  ·  ${selHint}`, x + w - uiDim(20), y + uiDim(16), 11, "#9aa3b2", false, 1);

    const charW = uiDim(220);
    const charX = x + uiDim(20);
    const charY = y + uiDim(48);
    const charH = h - uiDim(68);
    g.fillStyle(0x0c0a18, 0.92).fillRect(charX, charY, charW, charH);
    g.lineStyle(uiDim(1.5), COLORS.neonCyan, 0.55).strokeRect(charX, charY, charW, charH);
    tx("OPERATOR", charX + uiDim(12), charY + uiDim(10), 12, "#6b7184");

    const wpnW = charW - uiDim(24);
    const wpnH = uiDim(88);
    const wpnX = charX + uiDim(12);
    const wpnY = charY + uiDim(32);
    const weapon = eq.weapon;
    const wCol = weapon ? RARITIES[weapon.rarity].color : 0x29e7ff;
    g.fillStyle(0x081220, 0.95).fillRect(wpnX, wpnY, wpnW, wpnH);
    g.lineStyle(uiDim(2.5), wCol, weapon ? 1 : 0.65).strokeRect(wpnX, wpnY, wpnW, wpnH);
    tx("PRIMARY WEAPON", wpnX + uiDim(10), wpnY + uiDim(8), 10, "#29e7ff", true);
    icon(weapon, wpnX + uiDim(36), wpnY + uiDim(52), uiDim(44), "BLADE", 0x29e7ff);
    if (weapon) {
      const wdef = weapon.weaponId ? getWeapon(weapon.weaponId) : undefined;
      tx(weapon.name, wpnX + uiDim(68), wpnY + uiDim(34), 13, RARITIES[weapon.rarity].hex, true);
      tx(wdef ? `${wdef.klass} · ${wdef.primary.kind}` : SLOT_NAMES.weapon, wpnX + uiDim(68), wpnY + uiDim(54), 10, "#9aa3b2");
      hit(
        wpnX,
        wpnY,
        wpnW,
        wpnH,
        () => this.onUnequip?.("weapon"),
        (pointer) => itemMenu(pointer, weapon),
      );
    } else {
      tx("— equip a weapon-mod —", wpnX + wpnW / 2, wpnY + uiDim(48), 10, "#5a6172", false, 0.5);
    }

    const bodySlots = LOADOUT_SLOTS.filter((s) => s !== "weapon");
    const slotH = uiDim(58);
    const slotGap = uiDim(10);
    let sy = wpnY + wpnH + uiDim(16);
    bodySlots.forEach((slot) => {
      const it = eq[slot];
      const col = it ? RARITIES[it.rarity].color : 0x3a3350;
      g.fillStyle(0x0c0a18, 0.92).fillRect(wpnX, sy, wpnW, slotH);
      g.lineStyle(uiDim(1.5), col, it ? 1 : 0.5).strokeRect(wpnX, sy, wpnW, slotH);
      tx(SLOT_NAMES[slot], wpnX + uiDim(10), sy + uiDim(6), 10, "#6b7184");
      if (it) {
        icon(it, wpnX + uiDim(28), sy + uiDim(34), uiDim(30));
        tx(it.name, wpnX + uiDim(52), sy + uiDim(22), 12, RARITIES[it.rarity].hex, true);
        hit(
          wpnX,
          sy,
          wpnW,
          slotH,
          () => this.onUnequip?.(slot),
          (pointer) => itemMenu(pointer, it),
        );
      } else {
        tx("empty", wpnX + wpnW / 2, sy + uiDim(30), 10, "#5a6172", false, 0.5);
      }
      sy += slotH + slotGap;
    });

    const bagX = charX + charW + uiDim(20);
    const bagY = charY;
    const bagW = x + w - uiDim(20) - bagX;
    const bagH = charH;
    g.fillStyle(0x0c0a18, 0.88).fillRect(bagX, bagY, bagW, bagH);
    g.lineStyle(uiDim(1.5), 0x3a3350, 0.7).strokeRect(bagX, bagY, bagW, bagH);
    tx("BAG", bagX + uiDim(12), bagY + uiDim(10), 12, "#6b7184");

    const cols = 4;
    const pad = uiDim(12);
    const gridX = bagX + pad;
    const gridY = bagY + uiDim(36);
    const cardGap = uiDim(10);
    const cardW = (bagW - pad * 2 - (cols - 1) * cardGap) / cols;
    const cardH = uiDim(96);
    const rows = Math.max(1, Math.floor((bagY + bagH - gridY - pad) / (cardH + cardGap)));

    if (this.items.length === 0) {
      tx("bag empty — salvage from the HSS or buy caches", bagX + bagW / 2, gridY + uiDim(60), 13, "#5a6172", false, 0.5);
    }
    this.items.slice(0, cols * rows).forEach((it, i) => {
      const cx = gridX + (i % cols) * (cardW + cardGap);
      const cy = gridY + Math.floor(i / cols) * (cardH + cardGap);
      const r = RARITIES[it.rarity];
      const picked = this.selectedBag === i;
      g.fillStyle(picked ? 0x1a2440 : 0x12102a, 0.92).fillRect(cx, cy, cardW, cardH);
      g.lineStyle(uiDim(picked ? 2.5 : 1.5), picked ? COLORS.neonMagenta : r.color, 1).strokeRect(cx, cy, cardW, cardH);
      icon(it, cx + uiDim(28), cy + uiDim(34), uiDim(38));
      tx(`#${i + 1}`, cx + uiDim(8), cy + uiDim(6), 9, picked ? "#ff79c6" : "#6b7184");
      tx(it.name, cx + uiDim(52), cy + uiDim(10), 12, r.hex, true);
      tx(`${r.name} · ${SLOT_NAMES[it.slot]}`, cx + uiDim(52), cy + uiDim(28), 10, "#9aa3b2");
      add(
        scene.add
          .text(cx + uiDim(8), cy + cardH - uiDim(28), itemStatLines(it).slice(0, 2).join("  ") || "—", {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(9),
            color: "#cfe8ff",
            wordWrap: { width: cardW - uiDim(16) },
          })
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      hit(
        cx,
        cy,
        cardW,
        cardH,
        () => {
          if (this.selectedBag >= 0) this.bagClick(i);
          else if (it.slot === "weapon" || SLOTS.includes(it.slot)) this.onEquip?.(it.id);
        },
        (pointer) => itemMenu(pointer, it, i),
      );
      hit(cx + cardW - uiDim(34), cy + uiDim(4), uiDim(30), uiDim(22), () => this.bagClick(i));
    });

    add(
      scene.add
        .text(x + w / 2, y + h - uiDim(18), "left-click equip · right-click examine/wear/drop · I/ESC close", {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(11),
          color: "#6b7184",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
  }

  destroy() {
    this.clearPanel();
    this.barG.destroy();
    this.barIcons.forEach((i) => i.destroy());
    this.barSlotLabels.forEach((l) => l.destroy());
    this.barZones.forEach((z) => z.destroy());
    this.barHint.destroy();
  }
}