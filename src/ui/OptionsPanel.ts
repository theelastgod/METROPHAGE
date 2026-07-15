import Phaser from "phaser";
import { effectiveGraphicsQuality, getSettings, updateSettings, type GraphicsQuality, type SettingsData } from "../systems/Settings";
import { prefersMobileUx } from "../systems/Mobile";
import { drawPanelFrame } from "./panelChrome";
import { closeHint, dimBackdrop, modalRect, panelPad, uiDim, uiFont, uiGap } from "./uiLayout";
import { COLORS, VIEW_W, VIEW_H } from "../config";
import { fitTextToWidth, setFittedText } from "./typography";
import { buildStamp } from "../buildInfo";

interface Row {
  key: keyof SettingsData;
  toggle: boolean;
  cycle?: GraphicsQuality[];
  y: number;
  trackX: number;
  trackW: number;
  valueW: number;
  hitX: number;
  hitW: number;
  valueText: Phaser.GameObjects.Text;
}

/**
 * Options / accessibility menu.
 * Desktop: compact centered card.
 * Mobile: full-bleed sheet with large finger rows (~52px+).
 */
export default class OptionsPanel {
  private scene: Phaser.Scene;
  private onChange?: () => void;
  private readonly mobile = prefersMobileUx();

  private g: Phaser.GameObjects.Graphics;
  private panelArt: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image | null = null;
  private backdrop: Phaser.GameObjects.Container;
  private statics: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private rows: Row[] = [];
  private open = false;

  private readonly frame: { x: number; y: number; w: number; h: number };
  private readonly x: number;
  private readonly y: number;
  private readonly w: number;
  private readonly h: number;
  private readonly trackX: number;
  private readonly trackW: number;
  private readonly rowH: number;
  private readonly zoneH: number;
  private readonly pad: number;

  constructor(scene: Phaser.Scene, onChange?: () => void) {
    this.scene = scene;
    this.onChange = onChange;
    // Full-sheet on phones; clamped card on desktop (modalRect viewport-clamps).
    this.frame = this.mobile
      ? { x: uiDim(4), y: uiDim(4), w: VIEW_W - uiDim(8), h: VIEW_H - uiDim(8) }
      : modalRect(440, 480);
    this.x = this.frame.x;
    this.y = this.frame.y;
    this.w = this.frame.w;
    this.h = this.frame.h;
    this.pad = this.mobile ? uiDim(14) : panelPad();
    this.rowH = uiDim(this.mobile ? 50 : 36);
    this.zoneH = uiDim(this.mobile ? 46 : 24);
    // Value column on the right; track fills remaining mid area.
    this.trackX = this.mobile ? this.x + this.w * 0.48 : this.x + uiDim(180);
    this.trackW = this.x + this.w - this.pad - this.trackX - uiDim(this.mobile ? 72 : 56);

    this.backdrop = dimBackdrop(scene, 1799, 0.62, () => this.close(), this.frame);
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1800);
    const D = 1801;

    this.text(this.x + this.pad, this.y + uiGap("lg"), "OPTIONS", "#eafdff", this.mobile ? 18 : 15, D);
    this.text(
      this.x + this.w - this.pad,
      this.y + uiGap("lg") + uiDim(2),
      `build ${buildStamp()}`,
      "#5a6478",
      this.mobile ? 10 : 9,
      D,
    ).setOrigin(1, 0);

    // Large close hit target on phones.
    if (this.mobile) {
      const closeW = uiDim(56);
      const closeH = uiDim(44);
      const cx = this.x + this.w - this.pad - closeW;
      const cy = this.y + uiDim(8);
      this.text(cx + closeW / 2, cy + uiDim(10), "✕", "#ff8a9a", 16, D).setOrigin(0.5, 0);
      const z = scene.add
        .zone(cx, cy, closeW, closeH)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(D + 2)
        .setInteractive({ useHandCursor: true });
      z.on("pointerdown", () => this.close());
      this.zones.push(z);
    }

    let ry = this.y + uiDim(this.mobile ? 56 : 58);
    const add = (
      key: keyof SettingsData,
      label: string,
      toggle: boolean,
      color?: string,
      cycle?: GraphicsQuality[],
    ) => {
      if (cycle) this.addCycleRow(key, label, cycle, ry, D, color ?? "#eafdff");
      else this.addRow(key, label, toggle, ry, D, color ?? "#eafdff");
      ry += this.rowH;
    };

    add("rsControls", this.mobile ? "TAP-TO-WALK" : "TAP-TO-WALK (opt-in)", true, "#f7ff3c");
    add("uiDensity", "HUD DENSITY", false, "#39ff88", ["new", "full"] as unknown as GraphicsQuality[]);
    add("firstSessionCoach", "FIRST-SESSION COACH", true, "#b06bff");
    add("shareCards", "SHARE CARDS ON BOSS KILL", true, "#f7ff3c");
    add("reduceFlashing", "REDUCE FLASHING", true, "#ff3b6b");
    add("lowFx", "LOW-FX MODE", true, "#29e7ff");
    add("graphicsQuality", "GRAPHICS QUALITY", false, "#b06bff", ["auto", "low", "medium", "high"]);
    add("highContrast", "HIGH CONTRAST HUD", true, "#f7ff3c");
    add("uiScale", "UI TEXT SIZE", false);
    add("gamepadEnabled", "GAMEPAD ENABLED", true, "#39ff88");
    ry += uiGap("xs");
    add("shake", "SCREEN SHAKE", false);
    add("master", "MASTER VOLUME", false);
    add("music", "MUSIC VOLUME", false);
    add("sfx", "SFX VOLUME", false);

    this.text(
      this.x + this.pad,
      this.y + this.h - uiDim(this.mobile ? 36 : 30),
      this.mobile
        ? "Tap a row to toggle · drag sliders · Reduce Flashing = photosensitivity-safe"
        : "Reduce Flashing = photosensitivity-safe. Graphics auto-detects your device tier.",
      "#9aa3b2",
      this.mobile ? 11 : 10,
      D,
      this.w - this.pad * 2 - (this.mobile ? 0 : uiDim(100)),
    );
    if (!this.mobile) {
      this.text(
        this.x + this.w - uiDim(100),
        this.y + this.h - uiDim(30),
        closeHint("O / ESC close"),
        "#9aa3b2",
        10,
        D,
        uiDim(90),
      );
    }
    this.setVisible(false);
  }

  private addRow(
    key: keyof SettingsData,
    label: string,
    toggle: boolean,
    y: number,
    depth: number,
    labelColor = "#eafdff",
  ) {
    const labelMax = this.trackX - this.x - this.pad - uiDim(8);
    this.text(this.x + this.pad, y + (this.mobile ? uiDim(12) : 0), label, labelColor, this.mobile ? 13 : 12, depth, labelMax);
    const valueW = uiDim(this.mobile ? 56 : 48);
    const valueText = this.text(
      this.x + this.w - this.pad - valueW,
      y + (this.mobile ? uiDim(12) : 0),
      "",
      "#f7ff3c",
      this.mobile ? 13 : 12,
      depth,
      valueW,
    );
    const hitX = this.x + this.pad;
    const hitW = this.w - this.pad * 2;
    const row: Row = {
      key,
      toggle,
      y,
      trackX: this.trackX,
      trackW: this.trackW,
      valueW,
      hitX,
      hitW,
      valueText,
    };
    this.rows.push(row);

    // Full-width row hit target on phones (easier than tiny toggle zone).
    const z = this.scene.add
      .zone(hitX, y - uiDim(2), hitW, this.zoneH)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });
    z.on("pointerdown", (_p: Phaser.Input.Pointer, localX: number) => {
      // For sliders, map from full-row local X into the track segment.
      if (!row.toggle && !row.cycle) {
        const trackLocal = localX - (row.trackX - hitX);
        this.onRowClick(row, trackLocal);
      } else {
        this.onRowClick(row, localX);
      }
    });
    this.zones.push(z);
  }

  private onRowClick(row: Row, localX: number) {
    if (!this.open) return;
    if (row.cycle) {
      const cur = String(getSettings()[row.key]);
      const i = row.cycle.indexOf(cur as GraphicsQuality);
      const next = row.cycle[(i + 1 + row.cycle.length) % row.cycle.length];
      updateSettings({ [row.key]: next } as Partial<SettingsData>);
    } else if (row.toggle) {
      if (row.key === "rsControls" && prefersMobileUx() && getSettings().rsControls) return;
      updateSettings({ [row.key]: !getSettings()[row.key] } as Partial<SettingsData>);
    } else if (row.key === "uiScale") {
      const v = Phaser.Math.Clamp(localX / Math.max(1, row.trackW), 0, 1);
      const scaled = 0.85 + v * 0.5;
      updateSettings({ uiScale: Math.round(scaled * 100) / 100 });
    } else {
      const v = Phaser.Math.Clamp(localX / Math.max(1, row.trackW), 0, 1);
      updateSettings({ [row.key]: Math.round(v * 100) / 100 } as Partial<SettingsData>);
    }
    this.onChange?.();
    this.refresh();
  }

  private addCycleRow(
    key: keyof SettingsData,
    label: string,
    cycle: GraphicsQuality[],
    y: number,
    depth: number,
    labelColor = "#eafdff",
  ) {
    const labelMax = this.trackX - this.x - this.pad - uiDim(8);
    this.text(this.x + this.pad, y + (this.mobile ? uiDim(12) : 0), label, labelColor, this.mobile ? 13 : 12, depth, labelMax);
    const valueW = uiDim(this.mobile ? 100 : 88);
    const valueText = this.text(
      this.x + this.w - this.pad - valueW,
      y + (this.mobile ? uiDim(12) : 0),
      "",
      "#f7ff3c",
      this.mobile ? 13 : 12,
      depth,
      valueW,
    );
    const hitX = this.x + this.pad;
    const hitW = this.w - this.pad * 2;
    const row: Row = {
      key,
      toggle: false,
      cycle,
      y,
      trackX: this.trackX,
      trackW: this.trackW,
      valueW,
      hitX,
      hitW,
      valueText,
    };
    this.rows.push(row);
    const z = this.scene.add
      .zone(hitX, y - uiDim(2), hitW, this.zoneH)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });
    z.on("pointerdown", () => this.onRowClick(row, 0));
    this.zones.push(z);
  }

  setOnChange(fn: () => void) {
    this.onChange = fn;
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
    if (this.panelArt) this.panelArt.setVisible(false);
  }

  refresh() {
    const g = this.g;
    g.clear();
    this.panelArt = drawPanelFrame(g, this.x, this.y, this.w, this.h, COLORS.neonCyan, this.scene, this.panelArt);
    if (this.panelArt) this.panelArt.setVisible(this.open).setDepth(1799);
    const s = getSettings();
    const trackH = uiDim(this.mobile ? 14 : 8);
    for (const row of this.rows) {
      // Subtle full-row background on mobile for affordance.
      if (this.mobile) {
        g.fillStyle(0x0e0c1c, 0.55).fillRect(row.hitX, row.y - uiDim(2), row.hitW, this.zoneH);
        g.lineStyle(uiDim(1), 0x2a3450, 0.55).strokeRect(row.hitX, row.y - uiDim(2), row.hitW, this.zoneH);
      }
      if (row.cycle) {
        const cur = String(s[row.key]);
        const eff =
          row.key === "graphicsQuality" && cur === "auto"
            ? `AUTO (${effectiveGraphicsQuality()})`
            : row.key === "uiDensity"
              ? cur === "new"
                ? "SIMPLE"
                : "FULL"
              : cur.toUpperCase();
        row.valueText.setColor("#f7ff3c");
        setFittedText(row.valueText, eff, row.valueW, { minScale: 0.72 });
      } else if (row.toggle) {
        const on = !!s[row.key];
        row.valueText.setColor(on ? "#39ff88" : "#5a6172");
        setFittedText(row.valueText, on ? "[ ON ]" : "[ OFF ]", row.valueW);
      } else if (row.key === "uiScale") {
        const v = (s.uiScale - 0.85) / 0.5;
        const ty = row.y + uiDim(this.mobile ? 16 : 2);
        g.fillStyle(0x140a1e, 0.95).fillRect(row.trackX, ty, row.trackW, trackH);
        g.fillStyle(0x29e7ff, 1).fillRect(row.trackX + uiDim(1), ty + uiDim(1), (row.trackW - uiDim(2)) * v, trackH - uiDim(2));
        g.lineStyle(uiDim(1), 0x3a4a66, 0.8).strokeRect(row.trackX, ty, row.trackW, trackH);
        row.valueText.setColor("#eafdff");
        setFittedText(row.valueText, `${Math.round(s.uiScale * 100)}%`, row.valueW);
      } else {
        const v = s[row.key] as number;
        const ty = row.y + uiDim(this.mobile ? 16 : 2);
        g.fillStyle(0x140a1e, 0.95).fillRect(row.trackX, ty, row.trackW, trackH);
        g.fillStyle(0x29e7ff, 1).fillRect(row.trackX + uiDim(1), ty + uiDim(1), (row.trackW - uiDim(2)) * v, trackH - uiDim(2));
        g.lineStyle(uiDim(1), 0x3a4a66, 0.8).strokeRect(row.trackX, ty, row.trackW, trackH);
        row.valueText.setColor("#eafdff");
        setFittedText(row.valueText, `${Math.round(v * 100)}%`, row.valueW);
      }
    }
  }

  private setVisible(v: boolean) {
    this.backdrop.setVisible(v);
    for (const child of this.backdrop.list) {
      const z = child as Phaser.GameObjects.Zone;
      if (z.type === "Zone" && z.input) z.input.enabled = v;
    }
    this.g.setVisible(v);
    this.statics.forEach((t) => t.setVisible(v));
    this.zones.forEach((z) => {
      z.setVisible(v);
      if (z.input) z.input.enabled = v;
    });
  }

  private text(x: number, y: number, s: string, color: string, sizePx: number, depth: number, maxWidth?: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: uiFont(sizePx), color })
      .setScrollFactor(0)
      .setDepth(depth);
    this.statics.push(t);
    if (maxWidth !== undefined) fitTextToWidth(t, maxWidth);
    return t;
  }
}
