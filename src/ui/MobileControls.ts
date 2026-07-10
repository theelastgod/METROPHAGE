import Phaser from "phaser";
import { uiDim } from "../config";
import { displayFont, bodyFont } from "./typography";
import { onlineHudStack } from "./spacing";

export interface MobileControlHandlers {
  onDash: () => void;
  onAbility: () => void;
  onAbility2: () => void;
  onUlt: () => void;
  onInteract: () => void;
}

/**
 * Landscape mobile HUD:
 *  - Left: virtual stick (drag) with directional arrows as guides
 *  - Right: action cluster (dash / abilities / use / hold-to-fire)
 *
 * Uses pointer-id tracking so multi-touch works (move + fire at once).
 */
export default class MobileControls {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private stickG: Phaser.GameObjects.Graphics;
  private stickKnob: Phaser.GameObjects.Graphics;
  private stickCx = 0;
  private stickCy = 0;
  private stickR = 0;
  private stickPtrId: number | null = null;
  private mx = 0;
  private my = 0;
  private fireHeld = false;
  private firePtrId: number | null = null;
  private destroyed = false;
  private deadZones: Array<{ x: number; y: number; r: number }> = [];

  constructor(scene: Phaser.Scene, handlers: MobileControlHandlers) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(1300);
    this.stickG = scene.add.graphics().setScrollFactor(0).setDepth(1299);
    this.stickKnob = scene.add.graphics().setScrollFactor(0).setDepth(1301);
    this.root.add([this.stickG, this.stickKnob]);
    this.build(handlers);
    this.wireGlobalPointers();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  intent(): { mx: number; my: number; active: boolean } {
    return { mx: this.mx, my: this.my, active: this.mx !== 0 || this.my !== 0 };
  }

  isFireHeld(): boolean {
    return this.fireHeld;
  }

  /** True if a screen point is over the stick or action buttons (block world taps). */
  containsScreen(x: number, y: number): boolean {
    for (const z of this.deadZones) {
      const dx = x - z.x;
      const dy = y - z.y;
      if (dx * dx + dy * dy <= z.r * z.r) return true;
    }
    return false;
  }

  setVisible(v: boolean) {
    this.root.setVisible(v);
    if (!v) {
      this.mx = 0;
      this.my = 0;
      this.fireHeld = false;
      this.stickPtrId = null;
      this.firePtrId = null;
      this.drawStick(0, 0);
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.input.off("pointerup", this.onGlobalUp, this);
    this.scene.input.off("pointerupoutside", this.onGlobalUp, this);
    this.scene.input.off("pointermove", this.onGlobalMove, this);
    this.root.destroy(true);
  }

  private build(h: MobileControlHandlers) {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const stack = onlineHudStack(H);
    // Leave the bottom HUD free; sit controls above Bag/Map/Chat.
    const floorY = stack.actionY - uiDim(8);
    const pad = uiDim(14);

    // ── Virtual stick (left) ──
    this.stickR = uiDim(72);
    this.stickCx = pad + this.stickR + uiDim(8);
    this.stickCy = floorY - this.stickR - uiDim(6);
    this.deadZones.push({ x: this.stickCx, y: this.stickCy, r: this.stickR + uiDim(18) });

    // Directional arrow guides around the stick
    const arrowR = this.stickR + uiDim(4);
    const arrows: Array<[number, number, string]> = [
      [this.stickCx, this.stickCy - arrowR, "▲"],
      [this.stickCx, this.stickCy + arrowR, "▼"],
      [this.stickCx - arrowR, this.stickCy, "◀"],
      [this.stickCx + arrowR, this.stickCy, "▶"],
    ];
    for (const [ax, ay, glyph] of arrows) {
      this.root.add(
        this.scene.add
          .text(ax, ay, glyph, displayFont(14, { color: "#00e5ff", fontStyle: "bold" }))
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(1302)
          .setAlpha(0.55),
      );
    }
    this.root.add(
      this.scene.add
        .text(this.stickCx, this.stickCy + this.stickR + uiDim(14), "MOVE", bodyFont(9, { color: "#5a6172" }))
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(1301),
    );
    this.drawStick(0, 0);

    const stickZone = this.scene.add
      .zone(this.stickCx, this.stickCy, this.stickR * 2.4, this.stickR * 2.4)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1303)
      .setInteractive();
    stickZone.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      ptr.event?.stopPropagation?.();
      this.stickPtrId = ptr.id;
      this.applyStick(ptr.x, ptr.y);
    });
    this.root.add(stickZone);

    // ── Action cluster (right) ──
    const ab = uiDim(50);
    const ag = uiDim(11);
    const col1 = W - pad - ab * 0.55;
    const col0 = col1 - ab - ag;
    const row2 = floorY - ab * 0.55;
    const row1 = row2 - ab - ag;
    const row0 = row1 - ab - ag;

    const plate = this.scene.add.graphics().setScrollFactor(0).setDepth(1298);
    const px = col0 - ab * 0.65;
    const py = row0 - ab * 0.55;
    const pw = ab * 2.4 + ag;
    const ph = ab * 3.15 + ag * 2;
    plate.fillStyle(0x04030c, 0.48).fillRoundedRect(px, py, pw, ph, uiDim(12));
    plate.lineStyle(uiDim(1), 0xff2bd6, 0.25).strokeRoundedRect(px, py, pw, ph, uiDim(12));
    this.root.add(plate);
    this.deadZones.push({ x: px + pw / 2, y: py + ph / 2, r: Math.hypot(pw, ph) * 0.55 });

    this.root.add(
      this.scene.add
        .text((col0 + col1) / 2, row0 - ab * 0.7, "ACTIONS", bodyFont(9, { color: "#5a6172" }))
        .setOrigin(0.5, 1)
        .setScrollFactor(0)
        .setDepth(1301),
    );

    const mkAct = (
      x: number,
      y: number,
      label: string,
      color: number,
      onTap: () => void,
      holdFire = false,
    ) => {
      const hex = "#" + color.toString(16).padStart(6, "0");
      const g = this.scene.add.graphics().setScrollFactor(0).setDepth(1301);
      const t = this.scene.add
        .text(x, y, label, displayFont(holdFire ? 12 : 15, { color: hex, fontStyle: "bold" }))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1302)
        .setShadow(0, 0, hex, 5, true, true);
      const paint = (down: boolean) => {
        g.clear();
        const r = ab * 0.48;
        g.fillStyle(down ? color : 0x0b1220, down ? 0.92 : 0.82);
        g.fillCircle(x, y, r);
        g.lineStyle(uiDim(2), color, down ? 1 : 0.8);
        g.strokeCircle(x, y, r);
        t.setColor(down ? "#041018" : hex);
      };
      paint(false);
      const z = this.scene.add
        .zone(x, y, ab + uiDim(12), ab + uiDim(12))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1303)
        .setInteractive();
      z.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
        ptr.event?.stopPropagation?.();
        paint(true);
        if (holdFire) {
          this.fireHeld = true;
          this.firePtrId = ptr.id;
        } else {
          onTap();
        }
      });
      const release = (ptr?: Phaser.Input.Pointer) => {
        if (holdFire && ptr && this.firePtrId !== null && ptr.id !== this.firePtrId) return;
        paint(false);
        if (holdFire) {
          this.fireHeld = false;
          this.firePtrId = null;
        }
      };
      z.on("pointerup", (ptr: Phaser.Input.Pointer) => {
        ptr.event?.stopPropagation?.();
        release(ptr);
      });
      z.on("pointerupoutside", (ptr: Phaser.Input.Pointer) => release(ptr));
      this.root.add([g, t, z]);
      this.deadZones.push({ x, y, r: ab * 0.65 });
    };

    mkAct(col0, row0, "⇢", 0x00e5ff, h.onDash);
    mkAct(col1, row0, "Q", 0xff2bd6, h.onAbility);
    mkAct(col0, row1, "E", 0xf7ff3c, h.onAbility2);
    mkAct(col1, row1, "R", 0xff8a1f, h.onUlt);
    mkAct(col0, row2, "◆", 0x39ff88, h.onInteract);
    mkAct(col1, row2, "ATK", 0xff3b6b, () => {}, true);
  }

  private wireGlobalPointers() {
    this.scene.input.on("pointermove", this.onGlobalMove, this);
    this.scene.input.on("pointerup", this.onGlobalUp, this);
    this.scene.input.on("pointerupoutside", this.onGlobalUp, this);
  }

  private onGlobalMove(ptr: Phaser.Input.Pointer) {
    if (this.stickPtrId === ptr.id && ptr.isDown) {
      this.applyStick(ptr.x, ptr.y);
    }
  }

  private onGlobalUp(ptr: Phaser.Input.Pointer) {
    if (this.stickPtrId === ptr.id) {
      this.stickPtrId = null;
      this.mx = 0;
      this.my = 0;
      this.drawStick(0, 0);
    }
    if (this.firePtrId === ptr.id) {
      this.firePtrId = null;
      this.fireHeld = false;
    }
  }

  private applyStick(px: number, py: number) {
    let dx = px - this.stickCx;
    let dy = py - this.stickCy;
    const len = Math.hypot(dx, dy);
    const max = this.stickR * 0.72;
    if (len > max && len > 1e-4) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    // Deadzone so resting thumb doesn't crawl
    const raw = Math.hypot(dx, dy) / max;
    if (raw < 0.18) {
      this.mx = 0;
      this.my = 0;
      this.drawStick(0, 0);
      return;
    }
    this.mx = dx / max;
    this.my = dy / max;
    this.drawStick(dx, dy);
  }

  private drawStick(knobX: number, knobY: number) {
    const g = this.stickG;
    g.clear();
    g.fillStyle(0x04030c, 0.55).fillCircle(this.stickCx, this.stickCy, this.stickR);
    g.lineStyle(uiDim(2), 0x00e5ff, 0.55).strokeCircle(this.stickCx, this.stickCy, this.stickR);
    g.lineStyle(uiDim(1), 0x00e5ff, 0.2).strokeCircle(this.stickCx, this.stickCy, this.stickR * 0.55);

    const k = this.stickKnob;
    k.clear();
    const active = knobX !== 0 || knobY !== 0;
    k.fillStyle(active ? 0x00e5ff : 0x1a2840, active ? 0.95 : 0.75);
    k.fillCircle(this.stickCx + knobX, this.stickCy + knobY, this.stickR * 0.38);
    k.lineStyle(uiDim(2), active ? 0xffffff : 0x39ff88, active ? 0.9 : 0.5);
    k.strokeCircle(this.stickCx + knobX, this.stickCy + knobY, this.stickR * 0.38);
  }
}
