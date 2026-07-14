import Phaser from "phaser";
import { uiDim } from "../config";
import { UI_BTN_RING_KEY } from "../assets/manifest";
import { displayFont, bodyFont } from "./typography";
import { mobileStickSafeRegion } from "../systems/Mobile";

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

  /** Per-button readiness repainters, registered by build() — see setReadiness. */
  private readiness: Partial<Record<"dash" | "q" | "e" | "r", (n: number, armed: boolean) => void>> = {};
  private lastReadiness: Record<string, number> = {};

  /**
   * Cooldown/charge feedback on the arc buttons: 0..1 fill per ability (1 = ready),
   * `ultArmed` lights R. Cheap — a button repaints only when its value moves >3%.
   */
  setReadiness(v: { dash: number; q: number; e: number; r: number; ultArmed: boolean }) {
    if (!this.root.visible) return;
    const entries: Array<["dash" | "q" | "e" | "r", number, boolean]> = [
      ["dash", v.dash, v.dash >= 1],
      ["q", v.q, v.q >= 1],
      ["e", v.e, v.e >= 1],
      ["r", v.r, v.ultArmed],
    ];
    for (const [key, n, armed] of entries) {
      const stamp = Math.round(n * 33) + (armed ? 100 : 0);
      if (this.lastReadiness[key] === stamp) continue;
      this.lastReadiness[key] = stamp;
      this.readiness[key]?.(n, armed);
    }
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
    // Lower-left thumb lane captures movement without sitting under the centered
    // hotbar/action menu. Mid-screen taps stay tap-to-walk.
    this.region = mobileStickSafeRegion(W, H);

    // Skip the instructional caption on very short viewports so it doesn't collide with HUD.
    if (H >= uiDim(420)) {
      this.root.add(
        this.scene.add
          .text(this.homeCx, this.homeCy + this.stickR + uiDim(10), "MOVE · left thumb", bodyFont(9, { color: "#5a6172" }))
          .setOrigin(0.5, 0)
          .setScrollFactor(0)
          .setDepth(1301),
      );
    }
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
    const compact = W < uiDim(900);
    const atkR = uiDim(compact ? 32 : 36);
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
      opts: {
        holdFire?: boolean;
        fontPx?: number;
        track?: "dash" | "q" | "e" | "r";
        /** Optional Higgsfield ability icon texture key. */
        iconKey?: string;
      } = {},
    ) => {
      const hex = "#" + color.toString(16).padStart(6, "0");
      const g = this.scene.add.graphics().setScrollFactor(0).setDepth(1301);
      // Painted neon ring behind ability pads (Higgsfield) — falls back to drawn circle.
      let ring: Phaser.GameObjects.Image | null = null;
      if (this.scene.textures.exists(UI_BTN_RING_KEY) && !opts.holdFire) {
        ring = this.scene.add
          .image(x, y, UI_BTN_RING_KEY)
          .setDisplaySize(r * 2.15, r * 2.15)
          .setScrollFactor(0)
          .setDepth(1300)
          .setTint(color)
          .setAlpha(0.9);
      }
      let icon: Phaser.GameObjects.Image | null = null;
      if (opts.iconKey && this.scene.textures.exists(opts.iconKey)) {
        icon = this.scene.add
          .image(x, y - (label ? uiDim(2) : 0), opts.iconKey)
          .setDisplaySize(r * 1.15, r * 1.15)
          .setScrollFactor(0)
          .setDepth(1302)
          .setAlpha(0.95);
      }
      const t = this.scene.add
        .text(x, icon ? y + r * 0.55 : y, label, displayFont(opts.fontPx ?? (icon ? 10 : 15), { color: hex, fontStyle: "bold" }))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1303)
        .setShadow(0, 0, hex, 5, true, true);
      if (icon && !label) t.setVisible(false);
      let cdN = 1; // 0..1 readiness — cooling buttons dim + show a sweep arc
      let armed = !opts.track || opts.track !== "r"; // R arms via HEAT, others via cooldown
      const paint = (down: boolean) => {
        g.clear();
        const ready = cdN >= 1 && armed;
        // When a painted ring is present, keep the fill subtle so the art reads.
        if (ring) {
          ring.setAlpha(down ? 1 : ready ? 0.95 : 0.45);
          ring.setTint(down ? 0xffffff : color);
        } else {
          g.fillStyle(down ? color : 0x0b1220, down ? 0.92 : ready ? 0.78 : 0.5);
          g.fillCircle(x, y, r);
          g.lineStyle(uiDim(2), color, down ? 1 : ready ? 0.8 : 0.3);
          g.strokeCircle(x, y, r);
        }
        if (icon) icon.setAlpha(down ? 1 : ready ? 0.95 : 0.4);
        if (cdN < 1 || (opts.track === "r" && !armed)) {
          // readiness sweep — fills clockwise from 12 o'clock as the cooldown/HEAT refills
          g.lineStyle(uiDim(3), color, 0.85);
          g.beginPath();
          g.arc(x, y, r - uiDim(4), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, cdN), false);
          g.strokePath();
        }
        if (opts.track === "r" && armed && !down) {
          g.lineStyle(uiDim(2), 0xffffff, 0.65); // HEAT armed — the ult reads HOT
          g.strokeCircle(x, y, r - uiDim(4));
        }
        if (opts.holdFire && !down) {
          // idle ATK reads as the primary pad — soft inner glow ring
          g.lineStyle(uiDim(1), color, 0.35);
          g.strokeCircle(x, y, r * 0.66);
        }
        t.setColor(down ? "#041018" : ready ? hex : "#5a6172");
      };
      paint(false);
      if (opts.track) {
        this.readiness[opts.track] = (n, isArmed) => {
          cdN = n;
          armed = opts.track === "r" ? isArmed : n >= 1;
          paint(false);
        };
      }
      const hitR = r + uiDim(9);
      const z = this.scene.add
        .zone(x - hitR, y - hitR, hitR * 2, hitR * 2)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(1304)
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
      const parts: Phaser.GameObjects.GameObject[] = [g, t, z];
      if (ring) parts.unshift(ring);
      if (icon) parts.push(icon);
      this.root.add(parts);
      this.deadZones.push({ x, y, r: hitR + uiDim(4) });
    };

    // Primary pad — hold to fire (auto-aims nearest hostile).
    mkBtn(ax, ay, atkR, "ATK", 0xff3b6b, () => {}, { holdFire: true, fontPx: 17, iconKey: "ability_rail" });
    // Inner ring: mobility + interact — one thumb-roll away from ATK.
    const innerDist = atkR + uiDim(compact ? 30 : 38);
    const dash = at(180, innerDist);
    mkBtn(dash.x, dash.y, uiDim(compact ? 24 : 26), "⇢", 0x00e5ff, h.onDash, { fontPx: 14, track: "dash", iconKey: "ability_dash" });
    const use = at(90, innerDist);
    mkBtn(use.x, use.y, uiDim(compact ? 24 : 26), "◆", 0x39ff88, h.onInteract, { fontPx: 14, iconKey: "ability_radar" });
    // Outer arc: abilities — Q closest to the thumb, R (ult) a deliberate reach.
    const q = at(135, atkR + uiDim(compact ? 70 : 88));
    mkBtn(q.x, q.y, uiDim(compact ? 24 : 26), "Q", 0xff2bd6, h.onAbility, { track: "q", iconKey: "ability_virus", fontPx: 11 });
    const e = at(171, atkR + uiDim(compact ? 72 : 94));
    mkBtn(e.x, e.y, uiDim(compact ? 22 : 24), "E", 0xf7ff3c, h.onAbility2, { track: "e", iconKey: "ability_shield", fontPx: 11 });
    const r = at(99, atkR + uiDim(compact ? 72 : 94));
    mkBtn(r.x, r.y, uiDim(compact ? 22 : 24), "R", 0xff8a1f, h.onUlt, { track: "r", iconKey: "ability_overdrive", fontPx: 11 });
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
