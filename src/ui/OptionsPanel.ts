import Phaser from "phaser";
import { VIEW_W, VIEW_H } from "../config";
import { getSettings, updateSettings, SettingsData } from "../systems/Settings";
import { drawPanelFrame } from "./panelChrome";

interface Row {
  key: keyof SettingsData;
  toggle: boolean;
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
  private backdrop: Phaser.GameObjects.Rectangle;
  private statics: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private rows: Row[] = [];
  private open = false;

  private readonly w = 384;
  private readonly h = 276;
  private readonly x = (VIEW_W - 384) / 2;
  private readonly y = (VIEW_H - 276) / 2;
  private readonly trackX: number;
  private readonly trackW: number;

  constructor(scene: Phaser.Scene, onChange?: () => void) {
    this.scene = scene;
    this.onChange = onChange;
    this.trackX = this.x + 170;
    this.trackW = this.w - 190;
    // Full-screen dim backdrop that swallows clicks to whatever's underneath.
    this.backdrop = scene.add
      .rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x02020a, 0.62)
      .setScrollFactor(0)
      .setDepth(1799)
      .setInteractive();
    this.backdrop.on("pointerdown", () => {}); // swallow
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1800);
    const D = 1801;

    this.text(this.x + 18, this.y + 14, "OPTIONS", "#eafdff", "14px", D);

    let ry = this.y + 50;
    this.addRow("reduceFlashing", "REDUCE FLASHING", true, ry, D, "#ff3b6b"); // ⚠ safety
    ry += 31;
    this.addRow("lowFx", "LOW-FX MODE", true, ry, D, "#29e7ff");
    ry += 33;
    this.addRow("shake", "SCREEN SHAKE", false, ry, D);
    ry += 31;
    this.addRow("master", "MASTER VOLUME", false, ry, D);
    ry += 31;
    this.addRow("music", "MUSIC VOLUME", false, ry, D);
    ry += 31;
    this.addRow("sfx", "SFX VOLUME", false, ry, D);

    this.text(
      this.x + 18,
      this.y + this.h - 22,
      "Reduce Flashing = photosensitivity-safe.  Low-FX = lighter for low-end devices.",
      "#9aa3b2",
      "9px",
      D,
    );
    this.text(this.x + this.w - 92, this.y + this.h - 22, "O / ESC close", "#9aa3b2", "9px", D);
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
    this.text(this.x + 18, y, label, labelColor, "11px", depth);
    const valueText = this.text(this.x + this.w - 64, y, "", "#f7ff3c", "11px", depth);
    const row: Row = { key, toggle, y, trackX: this.trackX, trackW: this.trackW, valueText };
    this.rows.push(row);

    const z = this.scene.add
      .zone(this.trackX, y - 4, toggle ? 80 : this.trackW + 60, 20)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });
    z.on("pointerdown", (_p: Phaser.Input.Pointer, localX: number) => this.onRowClick(row, localX));
    this.zones.push(z);
  }

  private onRowClick(row: Row, localX: number) {
    if (!this.open) return;
    if (row.toggle) {
      updateSettings({ [row.key]: !getSettings()[row.key] } as Partial<SettingsData>);
    } else {
      const v = Phaser.Math.Clamp(localX / row.trackW, 0, 1);
      updateSettings({ [row.key]: Math.round(v * 100) / 100 } as Partial<SettingsData>);
    }
    this.onChange?.();
    this.refresh();
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
    for (const row of this.rows) {
      if (row.toggle) {
        const on = !!s[row.key];
        row.valueText.setText(on ? "[ ON ]" : "[ OFF ]").setColor(on ? "#39ff88" : "#5a6172");
      } else {
        const v = s[row.key] as number;
        g.fillStyle(0x140a1e, 0.95).fillRect(row.trackX, row.y + 2, row.trackW, 8);
        g.fillStyle(0x29e7ff, 1).fillRect(row.trackX + 1, row.y + 3, (row.trackW - 2) * v, 6);
        g.lineStyle(1, 0x3a4a66, 0.8).strokeRect(row.trackX, row.y + 2, row.trackW, 8);
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

  private text(x: number, y: number, s: string, color: string, size: string, depth: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: size, color })
      .setScrollFactor(0)
      .setDepth(depth);
    this.statics.push(t);
    return t;
  }
}
