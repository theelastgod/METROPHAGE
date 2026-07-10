import Phaser from "phaser";
import { drawHudPanel } from "./panelChrome";
import { bodyFont, displayFont } from "./typography";
import { onlineHudStack, uiDim, uiGap } from "./uiLayout";
import { prefersMobileUx } from "../systems/Mobile";

export interface ActionBarSlot {
  key: string;
  label: string;
  sub?: string;
  color: number;
  onClick: () => void;
}

/** Bottom RS-style interface bar — quick access to inventory, skills, map, etc. */
export default class RsActionBar {
  private scene: Phaser.Scene;
  private g: Phaser.GameObjects.Graphics;
  private zones: Phaser.GameObjects.Zone[] = [];
  private texts: Phaser.GameObjects.Text[] = [];
  private readonly slots: ActionBarSlot[];
  private readonly x: number;
  private readonly y: number;
  private readonly w: number;
  private readonly h: number;
  private readonly slotW: number;
  private activeKey: string | null = null;

  constructor(scene: Phaser.Scene, slots: ActionBarSlot[]) {
    this.scene = scene;
    this.slots = slots;
    // Slightly taller/wider slots when many (mobile adds Chat).
    this.slotW = uiDim(slots.length >= 4 ? 50 : 54);
    this.h = uiDim(slots.length >= 4 ? 44 : 40);
    const gap = uiGap("sm");
    this.w = slots.length * this.slotW + (slots.length - 1) * gap + uiGap("lg");
    const stack = onlineHudStack(scene.scale.height);
    if (prefersMobileUx()) {
      // Centered under the top chrome — free of stick (BL) and actions (BR).
      this.x = Math.max(uiDim(8), (scene.scale.width - this.w) / 2);
      this.y = uiDim(92);
    } else {
      // right-anchored so the left-anchored equip hotbar never collides with it
      this.x = scene.scale.width - this.w - uiDim(12);
      this.y = stack.actionY + (stack.actionH - this.h) / 2;
    }
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1050);
    this.redraw();
  }

  setActive(key: string | null) {
    if (this.activeKey === key) return;
    this.activeKey = key;
    this.redraw();
  }

  private redraw() {
    const g = this.g;
    g.clear();
    for (const t of this.texts) t.destroy();
    this.texts = [];
    for (const z of this.zones) z.destroy();
    this.zones = [];

    drawHudPanel(g, this.x, this.y, this.w, this.h);
    const slotW = this.slotW;
    const gap = uiDim(6);
    let sx = this.x + uiDim(8);
    for (const slot of this.slots) {
      const active = this.activeKey === slot.key;
      g.fillStyle(active ? 0x1a1830 : 0x0e0c1c, active ? 0.98 : 0.92).fillRoundedRect(sx, this.y + uiGap("xs"), slotW, this.h - uiGap("sm"), 3);
      g.lineStyle(active ? 2 : 1, slot.color, active ? 1 : 0.65).strokeRoundedRect(sx, this.y + uiGap("xs"), slotW, this.h - uiGap("sm"), 3);
      if (active) g.fillStyle(slot.color, 0.12).fillRoundedRect(sx + 1, this.y + uiGap("xs") + 1, slotW - 2, this.h - uiGap("sm") - 2, 2);

      const label = this.scene.add
        .text(sx + slotW / 2, this.y + uiDim(7), slot.label, displayFont(10, { color: active ? "#ffffff" : "#eafdff", fontStyle: "bold" }))
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(1051);
      this.texts.push(label);
      if (slot.sub) {
        const sub = this.scene.add
          .text(sx + slotW / 2, this.y + uiDim(23), slot.sub, bodyFont(7, { color: active ? "#cfe8ff" : "#6b7184" }))
          .setOrigin(0.5, 0)
          .setScrollFactor(0)
          .setDepth(1051);
        this.texts.push(sub);
      }

      const z = this.scene.add
        .zone(sx, this.y + uiDim(4), slotW, this.h - uiDim(8))
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .setDepth(1052);
      z.on("pointerover", () => this.redrawHover(sx, slot, true));
      z.on("pointerout", () => this.redraw());
      z.on("pointerdown", slot.onClick);
      this.zones.push(z);
      sx += slotW + gap;
    }
  }

  private redrawHover(sx: number, slot: ActionBarSlot, hover: boolean) {
    if (hover) {
      this.g.lineStyle(2, slot.color, 1).strokeRoundedRect(sx, this.y + uiDim(4), this.slotW, this.h - uiDim(8), 3);
    }
  }

  destroy() {
    this.g.destroy();
    for (const z of this.zones) z.destroy();
    for (const t of this.texts) t.destroy();
  }
}