import Phaser from "phaser";
import { drawHudPanel } from "./panelChrome";
import { bodyFont, displayFont } from "./typography";
import { onlineHudStack, uiDim, uiGap } from "./uiLayout";

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
  private readonly h = uiDim(56);
  private activeKey: string | null = null;

  constructor(scene: Phaser.Scene, slots: ActionBarSlot[]) {
    this.scene = scene;
    this.slots = slots;
    const slotW = uiDim(72);
    const gap = uiGap("sm");
    this.w = slots.length * slotW + (slots.length - 1) * gap + uiGap("lg");
    const stack = onlineHudStack(scene.scale.height);
    // right-anchored so the left-anchored equip hotbar never collides with it
    this.x = scene.scale.width - this.w - uiDim(12);
    this.y = stack.actionY;
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
    const slotW = uiDim(72);
    const gap = uiDim(6);
    let sx = this.x + uiDim(8);
    for (const slot of this.slots) {
      const active = this.activeKey === slot.key;
      g.fillStyle(active ? 0x1a1830 : 0x0e0c1c, active ? 0.98 : 0.92).fillRoundedRect(sx, this.y + uiGap("sm"), slotW, this.h - uiGap("md"), 3);
      g.lineStyle(active ? 2 : 1, slot.color, active ? 1 : 0.65).strokeRoundedRect(sx, this.y + uiGap("sm"), slotW, this.h - uiGap("md"), 3);
      if (active) g.fillStyle(slot.color, 0.12).fillRoundedRect(sx + 1, this.y + uiGap("sm") + 1, slotW - 2, this.h - uiGap("md") - 2, 2);

      const label = this.scene.add
        .text(sx + slotW / 2, this.y + uiGap("md"), slot.label, displayFont(11, { color: active ? "#ffffff" : "#eafdff", fontStyle: "bold" }))
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(1051);
      this.texts.push(label);
      if (slot.sub) {
        const sub = this.scene.add
          .text(sx + slotW / 2, this.y + uiDim(34), slot.sub, bodyFont(8, { color: active ? "#cfe8ff" : "#6b7184" }))
          .setOrigin(0.5, 0)
          .setScrollFactor(0)
          .setDepth(1051);
        this.texts.push(sub);
      }

      const z = this.scene.add
        .zone(sx, this.y + uiDim(6), slotW, this.h - uiDim(12))
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
      const slotW = uiDim(72);
      this.g.lineStyle(2, slot.color, 1).strokeRoundedRect(sx, this.y + uiDim(6), slotW, this.h - uiDim(12), 3);
    }
  }

  destroy() {
    this.g.destroy();
    for (const z of this.zones) z.destroy();
    for (const t of this.texts) t.destroy();
  }
}