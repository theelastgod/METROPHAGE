import Phaser from "phaser";
import { uiDim } from "../config";
import { displayFont, bodyFont } from "./typography";

export interface MobileControlHandlers {
  onDash: () => void;
  onAbility: () => void;
  onAbility2: () => void;
  onUlt: () => void;
  onInteract: () => void;
}

/** Tiny tactile click where hardware supports it (Android; iOS ignores silently). */
function buzz(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

/**
 * Landscape mobile controls, laid out for thumbs:
 *  - LEFT: floating stick — touch anywhere in the lower-left region and the stick
 *    centres under your thumb (a resting ghost marks the home spot). No more
 *    "missed the stick" while watching the fight.
 *  - RIGHT: shooter-style arc — an oversized hold-to-fire ATK pad in the corner,
 *    dash and interact on the inner ring, Q/E/R abilities arced above.
 *
 * Pointer-id tracking keeps move + fire + ability taps independent (multi-touch).
 */
export default class MobileControls {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private stickG: Phaser.GameObjects.Graphics;
  private stickKnob: Phaser.GameObjects.Graphics;
  /** Rest ghost position (bottom-left); the live stick centres on the touch. */
  private homeCx = 0;
  private homeCy = 0;
  private stickCx = 0;
  private stickCy = 0;
  private stickR = 0;
  private stickPtrId: number | null = null;
  /** Touch-capture region for the floating stick (lower-left of the screen). */
  private region = { x: 0, y: 0, w: 0, h: 0 };
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

  /** True if a screen point belongs to the controls — buttons, or the floating-stick
   *  region (the left thumb owns it; taps there must never path-find). Hidden
   *  controls own nothing, so panels underneath stay tappable. */
  containsScreen(x: number, y: number): boolean {
    if (!this.root.visible) return false;
    for (const z of this.deadZones) {
      const dx = x - z.x;
      const dy = y - z.y;
      if (dx * dx + dy * dy <= z.r * z.r) return true;
    }
    const r = this.region;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  setVisible(v: boolean) {
    this.root.setVisible(v);
    if (!v) {
      this.mx = 0;
      this.my = 0;
      this.fireHeld = false;
      this.stickPtrId = null;
      this.firePtrId = null;
      this.stickCx = this.homeCx;
      this.stickCy = this.homeCy;
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

    // ── Floating stick (left thumb) ──
    this.stickR = uiDim(78);
    this.homeCx = uiDim(26) + this.stickR;
    this.homeCy = H - uiDim(26) - this.stickR;
    this.stickCx = this.homeCx;
    this.stickCy = this.homeCy;
    // Lower-left quadrant captures the thumb; upper bound clears the status panel
    // and mid-screen taps (which stay tap-to-walk).
    this.region = { x: 0, y: H * 0.44, w: W * 0.4, h: H * 0.56 };

    this.root.add(
      this.scene.add
        .text(this.homeCx, this.homeCy + this.stickR + uiDim(10), "MOVE · touch anywhere left", bodyFont(9, { color: "#5a6172" }))
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(1301),
    );
    this.drawStick(0, 0);

    const regionZone = this.scene.add
      .zone(this.region.x, this.region.y, this.region.w, this.region.h)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1303)
      .setInteractive();
    regionZone.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      ptr.event?.stopPropagation?.();
      if (this.stickPtrId !== null) return; // one thumb drives
      this.stickPtrId = ptr.id;
      // Centre the stick under the thumb, clamped so the ring stays on-screen.
      this.stickCx = Phaser.Math.Clamp(ptr.x, this.stickR * 0.7, this.region.x + this.region.w);
      this.stickCy = Phaser.Math.Clamp(ptr.y, this.region.y + uiDim(10), H - this.stickR * 0.55);
      this.applyStick(ptr.x, ptr.y);
    });
    this.root.add(regionZone);

    // ── Action arc (right thumb) — big ATK pad in the corner, everything fans out ──
    const atkR = uiDim(36);
    const ax = W - uiDim(18) - atkR;
    const ay = H - uiDim(18) - atkR;
    /** Point at `deg`° (90 = straight up, 180 = straight left) `dist` from ATK. */
    const at = (deg: number, dist: number) => {
      const rad = (deg * Math.PI) / 180;
      return { x: ax + Math.cos(rad) * dist, y: ay - Math.sin(rad) * dist };
    };

    const mkBtn = (
      x: number,
      y: number,
      r: number,
      label: string,
      color: number,
      onTap: () => void,
      opts: { holdFire?: boolean; fontPx?: number } = {},
    ) => {
      const hex = "#" + color.toString(16).padStart(6, "0");
      const g = this.scene.add.graphics().setScrollFactor(0).setDepth(1301);
      const t = this.scene.add
        .text(x, y, label, displayFont(opts.fontPx ?? 15, { color: hex, fontStyle: "bold" }))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1302)
        .setShadow(0, 0, hex, 5, true, true);
      const paint = (down: boolean) => {
        g.clear();
        g.fillStyle(down ? color : 0x0b1220, down ? 0.92 : 0.78);
        g.fillCircle(x, y, r);
        g.lineStyle(uiDim(2), color, down ? 1 : 0.8);
        g.strokeCircle(x, y, r);
        if (opts.holdFire && !down) {
          // idle ATK reads as the primary pad — soft inner glow ring
          g.lineStyle(uiDim(1), color, 0.35);
          g.strokeCircle(x, y, r * 0.66);
        }
        t.setColor(down ? "#041018" : hex);
      };
      paint(false);
      const hitR = r + uiDim(9);
      const z = this.scene.add
        .zone(x - hitR, y - hitR, hitR * 2, hitR * 2)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(1303)
        .setInteractive(new Phaser.Geom.Circle(hitR, hitR, hitR), Phaser.Geom.Circle.Contains);
      z.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
        ptr.event?.stopPropagation?.();
        paint(true);
        buzz(opts.holdFire ? 8 : 12);
        if (opts.holdFire) {
          this.fireHeld = true;
          this.firePtrId = ptr.id;
        } else {
          onTap();
        }
      });
      const release = (ptr?: Phaser.Input.Pointer) => {
        if (opts.holdFire && ptr && this.firePtrId !== null && ptr.id !== this.firePtrId) return;
        paint(false);
        if (opts.holdFire) {
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
      this.deadZones.push({ x, y, r: hitR + uiDim(4) });
    };

    // Primary pad — hold to fire (auto-aims nearest hostile).
    mkBtn(ax, ay, atkR, "ATK", 0xff3b6b, () => {}, { holdFire: true, fontPx: 17 });
    // Inner ring: mobility + interact — one thumb-roll away from ATK.
    const dash = at(180, atkR + uiDim(38));
    mkBtn(dash.x, dash.y, uiDim(26), "⇢", 0x00e5ff, h.onDash, { fontPx: 18 });
    const use = at(90, atkR + uiDim(38));
    mkBtn(use.x, use.y, uiDim(26), "◆", 0x39ff88, h.onInteract, { fontPx: 16 });
    // Outer arc: abilities — Q closest to the thumb, R (ult) a deliberate reach.
    const q = at(135, atkR + uiDim(88));
    mkBtn(q.x, q.y, uiDim(26), "Q", 0xff2bd6, h.onAbility);
    const e = at(171, atkR + uiDim(94));
    mkBtn(e.x, e.y, uiDim(24), "E", 0xf7ff3c, h.onAbility2);
    const r = at(99, atkR + uiDim(94));
    mkBtn(r.x, r.y, uiDim(24), "R", 0xff8a1f, h.onUlt);
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
      // Stick floats back to its home ghost until the next touch.
      this.stickCx = this.homeCx;
      this.stickCy = this.homeCy;
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
    // Deadzone so a resting thumb doesn't crawl
    const raw = Math.hypot(dx, dy) / max;
    if (raw < 0.16) {
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
    const active = this.stickPtrId !== null;
    const g = this.stickG;
    g.clear();
    g.fillStyle(0x04030c, active ? 0.55 : 0.3).fillCircle(this.stickCx, this.stickCy, this.stickR);
    g.lineStyle(uiDim(2), 0x00e5ff, active ? 0.6 : 0.3).strokeCircle(this.stickCx, this.stickCy, this.stickR);
    g.lineStyle(uiDim(1), 0x00e5ff, active ? 0.22 : 0.12).strokeCircle(this.stickCx, this.stickCy, this.stickR * 0.55);
    if (!active) {
      // chevron guides on the rest ghost
      g.fillStyle(0x00e5ff, 0.3);
      const cR = this.stickR + uiDim(6);
      const ch = uiDim(5);
      g.fillTriangle(this.stickCx, this.stickCy - cR - ch, this.stickCx - ch, this.stickCy - cR + ch, this.stickCx + ch, this.stickCy - cR + ch);
      g.fillTriangle(this.stickCx, this.stickCy + cR + ch, this.stickCx - ch, this.stickCy + cR - ch, this.stickCx + ch, this.stickCy + cR - ch);
      g.fillTriangle(this.stickCx - cR - ch, this.stickCy, this.stickCx - cR + ch, this.stickCy - ch, this.stickCx - cR + ch, this.stickCy + ch);
      g.fillTriangle(this.stickCx + cR + ch, this.stickCy, this.stickCx + cR - ch, this.stickCy - ch, this.stickCx + cR - ch, this.stickCy + ch);
    }

    const k = this.stickKnob;
    k.clear();
    const live = knobX !== 0 || knobY !== 0;
    k.fillStyle(live ? 0x00e5ff : 0x1a2840, live ? 0.95 : active ? 0.85 : 0.5);
    k.fillCircle(this.stickCx + knobX, this.stickCy + knobY, this.stickR * 0.4);
    k.lineStyle(uiDim(2), live ? 0xffffff : 0x39ff88, live ? 0.9 : 0.45);
    k.strokeCircle(this.stickCx + knobX, this.stickCy + knobY, this.stickR * 0.4);
  }
}
