import Phaser from "phaser";
import { effectiveGraphicsQuality, getSettings, updateSettings, type GraphicsQuality, type SettingsData } from "../systems/Settings";
import { drawPanelFrame } from "./panelChrome";
import { dimBackdrop, modalRect, panelPad, uiDim, uiFont, uiGap } from "./uiLayout";

interface Row {
  key: keyof SettingsData;
  toggle: boolean;
  cycle?: GraphicsQuality[];
  y: number;
  trackX: number;
  trackW: number;
  valueText: Phaser.GameObjects.Text;
}

/**
 * Options / accessibility menu — reduce-flashing (⚠ photosensitivity safety),
 * screen-shake intensity, and master/music/SFX volume. Writes through to the
 * global Settings (persisted); the juice helpers, neon pipeline, and synth read
 * those live. Camera-fixed; reusable from the title screen and in-game. onChange
 * lets the host apply audio immediately.
 */
export default class OptionsPanel {
  private scene: Phaser.Scene;
  private onChange?: () => void;

  private g: Phaser.GameObjects.Graphics;
  private backdrop: Phaser.GameObjects.Container;
  private statics: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private rows: Row[] = [];
  private open = false;

  private readonly frame = modalRect(440, 520);
  private readonly x = this.frame.x;
  private readonly y = this.frame.y;
  private readonly w = this.frame.w;
  private readonly h = this.frame.h;
  private readonly trackX: number;
  private readonly trackW: number;
  private readonly rowH = uiDim(36);
  private readonly zoneH = uiDim(24);

  constructor(scene: Phaser.Scene, onChange?: () => void) {
    this.scene = scene;
    this.onChange = onChange;
    this.trackX = this.x + uiDim(180);
    this.trackW = this.w - uiDim(200);
    this.backdrop = dimBackdrop(scene, 1799);
    // full-screen hit area — a Container needs an explicit shape to swallow clicks
    this.backdrop.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, scene.scale.width, scene.scale.height),
      Phaser.Geom.Rectangle.Contains,
    );
    this.backdrop.on("pointerdown", () => {});
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1800);
    const D = 1801;

    this.text(this.x + panelPad(), this.y + uiGap("lg"), "OPTIONS", "#eafdff", 15, D);

    let ry = this.y + uiDim(58);
    this.addRow("rsControls", "RS CONTROLS (opt-in)", true, ry, D, "#f7ff3c");
    ry += this.rowH;
    this.addCycleRow("uiDensity", "HUD DENSITY", ["new", "full"] as unknown as GraphicsQuality[], ry, D, "#39ff88");
    ry += this.rowH;
    this.addRow("firstSessionCoach", "FIRST-SESSION COACH", true, ry, D, "#b06bff");
    ry += this.rowH;
    this.addRow("reduceFlashing", "REDUCE FLASHING", true, ry, D, "#ff3b6b");
    ry += this.rowH;
    this.addRow("lowFx", "LOW-FX MODE", true, ry, D, "#29e7ff");
    ry += this.rowH;
    this.addCycleRow("graphicsQuality", "GRAPHICS QUALITY", ["auto", "low", "medium", "high"], ry, D, "#b06bff");
    ry += this.rowH;
    this.addRow("highContrast", "HIGH CONTRAST HUD", true, ry, D, "#f7ff3c");
    ry += this.rowH;
    this.addRow("uiScale", "UI TEXT SIZE", false, ry, D);
    ry += this.rowH;
    this.addRow("gamepadEnabled", "GAMEPAD ENABLED", true, ry, D, "#39ff88");
    ry += this.rowH + uiGap("xs");
    this.addRow("shake", "SCREEN SHAKE", false, ry, D);
    ry += this.rowH;
    this.addRow("master", "MASTER VOLUME", false, ry, D);
    ry += this.rowH;
    this.addRow("music", "MUSIC VOLUME", false, ry, D);
    ry += this.rowH;
    this.addRow("sfx", "SFX VOLUME", false, ry, D);

    this.text(
      this.x + uiDim(20),
      this.y + this.h - uiDim(30),
      "Reduce Flashing = photosensitivity-safe. Graphics auto-detects your device tier.",
      "#9aa3b2",
      10,
      D,
    );
    this.text(this.x + this.w - uiDim(100), this.y + this.h - uiDim(30), "O / ESC close", "#9aa3b2", 10, D);
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
    this.text(this.x + uiDim(20), y, label, labelColor, 12, depth);
    const valueText = this.text(this.x + this.w - uiDim(68), y, "", "#f7ff3c", 12, depth);
    const row: Row = { key, toggle, y, trackX: this.trackX, trackW: this.trackW, valueText };
    this.rows.push(row);

    const z = this.scene.add
      .zone(this.trackX, y - uiDim(4), toggle ? uiDim(86) : this.trackW + uiDim(64), this.zoneH)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });
    z.on("pointerdown", (_p: Phaser.Input.Pointer, localX: number) => this.onRowClick(row, localX));
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
      updateSettings({ [row.key]: !getSettings()[row.key] } as Partial<SettingsData>);
    } else if (row.key === "uiScale") {
      const v = Phaser.Math.Clamp(localX / row.trackW, 0, 1);
      const scaled = 0.85 + v * 0.5;
      updateSettings({ uiScale: Math.round(scaled * 100) / 100 });
    } else {
      const v = Phaser.Math.Clamp(localX / row.trackW, 0, 1);
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
    this.text(this.x + uiDim(20), y, label, labelColor, 12, depth);
    const valueText = this.text(this.x + this.w - uiDim(108), y, "", "#f7ff3c", 12, depth);
    const row: Row = { key, toggle: false, cycle, y, trackX: this.trackX, trackW: this.trackW, valueText };
    this.rows.push(row);
    const z = this.scene.add
      .zone(this.trackX, y - uiDim(4), uiDim(120), this.zoneH)
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
  }

  refresh() {
    const g = this.g;
    g.clear();
    drawPanelFrame(g, this.x, this.y, this.w, this.h);
    const s = getSettings();
    const trackH = uiDim(8);
    for (const row of this.rows) {
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
        row.valueText.setText(eff).setColor("#f7ff3c");
      } else if (row.toggle) {
        const on = !!s[row.key];
        row.valueText.setText(on ? "[ ON ]" : "[ OFF ]").setColor(on ? "#39ff88" : "#5a6172");
      } else if (row.key === "uiScale") {
        const v = (s.uiScale - 0.85) / 0.5;
        g.fillStyle(0x140a1e, 0.95).fillRect(row.trackX, row.y + uiDim(2), row.trackW, trackH);
        g.fillStyle(0x29e7ff, 1).fillRect(row.trackX + uiDim(1), row.y + uiDim(3), (row.trackW - uiDim(2)) * v, trackH - uiDim(2));
        g.lineStyle(uiDim(1), 0x3a4a66, 0.8).strokeRect(row.trackX, row.y + uiDim(2), row.trackW, trackH);
        row.valueText.setText(`${Math.round(s.uiScale * 100)}%`).setColor("#eafdff");
      } else {
        const v = s[row.key] as number;
        g.fillStyle(0x140a1e, 0.95).fillRect(row.trackX, row.y + uiDim(2), row.trackW, trackH);
        g.fillStyle(0x29e7ff, 1).fillRect(row.trackX + uiDim(1), row.y + uiDim(3), (row.trackW - uiDim(2)) * v, trackH - uiDim(2));
        g.lineStyle(uiDim(1), 0x3a4a66, 0.8).strokeRect(row.trackX, row.y + uiDim(2), row.trackW, trackH);
        row.valueText.setText(`${Math.round(v * 100)}%`).setColor("#eafdff");
      }
    }
  }

  private setVisible(v: boolean) {
    this.backdrop.setVisible(v);
    if (this.backdrop.input) this.backdrop.input.enabled = v;
    this.g.setVisible(v);
    this.statics.forEach((t) => t.setVisible(v));
    this.zones.forEach((z) => {
      z.setVisible(v);
      if (z.input) z.input.enabled = v;
    });
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