import Phaser from "phaser";
import City from "../systems/City";
import { DISTRICTS } from "../game/districts";
import { drawPanelFrame } from "./panelChrome";
import { overlayRect, uiDim, uiFont } from "./uiLayout";

/**
 * City map overlay (M) — the fast-travel hub. The districts are stations on a
 * contagion route, colored by state (secured / current / unlocked / locked), plus
 * the save-wide Singularity %. Click an unlocked district to travel there; the
 * frontier unlocks as you secure the one before it. Camera-fixed; the scene
 * freezes the sim while it's open.
 */
export default class CityMapPanel {
  private scene: Phaser.Scene;
  private city: City;
  private onTravel: (index: number) => void;

  private g: Phaser.GameObjects.Graphics;
  private statics: Phaser.GameObjects.Text[] = [];
  private threatTexts: Phaser.GameObjects.Text[] = [];
  private nameTexts: Phaser.GameObjects.Text[] = [];
  private stateTexts: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private contagionText!: Phaser.GameObjects.Text;
  private cycleText!: Phaser.GameObjects.Text;
  private open = false;

  private readonly frame = overlayRect(18);
  private readonly x = this.frame.x;
  private readonly y = this.frame.y;
  private readonly w = this.frame.w;
  private readonly h = this.frame.h;
  private readonly routeY: number;
  private readonly stationX: number[] = [];

  constructor(scene: Phaser.Scene, city: City, onTravel: (index: number) => void) {
    this.scene = scene;
    this.city = city;
    this.onTravel = onTravel;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.routeY = this.y + this.h * 0.5;
    const n = DISTRICTS.length;
    const startX = this.x + uiDim(74);
    const endX = this.x + this.w - uiDim(74);
    const step = n > 1 ? (endX - startX) / (n - 1) : 0;
    for (let i = 0; i < n; i++) this.stationX.push(startX + i * step);

    this.text(this.x + uiDim(18), this.y + uiDim(14), "CITY MAP", "#eafdff", 15, D);
    this.contagionText = this.text(this.x + uiDim(18), this.y + uiDim(36), "", "#39ff88", 12, D);
    this.cycleText = this.scene.add
      .text(this.x + this.w - uiDim(18), this.y + uiDim(14), "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(12),
        color: "#ff2bd6",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(D);
    this.statics.push(this.cycleText);

    DISTRICTS.forEach((d, i) => {
      const sx = this.stationX[i];
      this.threatTexts.push(this.centered(sx, this.routeY - uiDim(62), "", d.accentHex, 11, D));
      this.nameTexts.push(this.centered(sx, this.routeY + uiDim(32), d.name, "#eafdff", 12, D));
      this.stateTexts.push(this.centered(sx, this.routeY + uiDim(52), "", "#9aa3b2", 10, D));
      this.centered(sx, this.routeY + uiDim(68), d.subtitle, "#5a6172", 9, D);

      const z = scene.add
        .zone(sx - uiDim(64), this.routeY - uiDim(74), uiDim(128), uiDim(158))
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(D)
        .setInteractive({ useHandCursor: true });
      z.on("pointerdown", () => this.tryTravel(i));
      this.zones.push(z);
    });

    this.text(this.x + uiDim(18), this.y + this.h - uiDim(24), "CLICK an unlocked district to fast-travel", "#f7ff3c", 11, D);
    this.text(this.x + this.w - uiDim(124), this.y + this.h - uiDim(24), "M / ESC to close", "#9aa3b2", 11, D);
    this.setVisible(false);
  }

  private tryTravel(i: number) {
    if (!this.open) return;
    if (i === this.city.index) return;
    if (!this.city.isUnlocked(i)) return;
    this.onTravel(i);
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

    const cleared = this.city.cleared.length;
    this.contagionText.setText(
      `CONTAGION ${Math.round(this.city.contagion)}%   ·   DISTRICTS ${cleared}/${DISTRICTS.length}`,
    );
    this.cycleText.setText(this.city.cycle > 0 ? `CYCLE ${this.city.cycle + 1}` : "");

    const barX = this.x + uiDim(18);
    const barY = this.y + uiDim(54);
    const barW = this.w - uiDim(36);
    const barH = uiDim(8);
    g.fillStyle(0x140a1e, 0.9).fillRect(barX, barY, barW, barH);
    g.fillStyle(0x39ff88, 1).fillRect(barX + uiDim(1), barY + uiDim(1), (barW - uiDim(2)) * this.city.normalized, barH - uiDim(2));

    g.lineStyle(uiDim(3), 0x2a2740, 1).lineBetween(
      this.stationX[0],
      this.routeY,
      this.stationX[this.stationX.length - 1],
      this.routeY,
    );
    const reach = this.stationX[Math.min(this.city.index, this.stationX.length - 1)];
    g.lineStyle(uiDim(3), 0x39ff88, 0.85).lineBetween(this.stationX[0], this.routeY, reach, this.routeY);

    DISTRICTS.forEach((d, i) => {
      const sx = this.stationX[i];
      const isCleared = this.city.isCleared(d.id);
      const isCurrent = i === this.city.index;
      const unlocked = this.city.isUnlocked(i);
      const r = isCurrent ? uiDim(20) : uiDim(16);

      if (isCurrent) {
        g.fillStyle(d.accent, 0.85).fillCircle(sx, this.routeY, r);
        g.lineStyle(uiDim(2), 0xffffff, 0.95).strokeCircle(sx, this.routeY, r + uiDim(4));
      } else if (isCleared) {
        g.fillStyle(0x39ff88, 0.9).fillCircle(sx, this.routeY, r);
        g.lineStyle(uiDim(2), 0x39ff88, 1).strokeCircle(sx, this.routeY, r + uiDim(3));
      } else {
        g.fillStyle(0x0c0a18, 0.95).fillCircle(sx, this.routeY, r);
        g.lineStyle(uiDim(2), d.accent, unlocked ? 0.9 : 0.35).strokeCircle(sx, this.routeY, r);
      }

      this.threatTexts[i].setText(d.isFinal ? "◆ CORE" : "THREAT " + "▮".repeat(d.threat + 1));
      this.nameTexts[i]
        .setText(d.name)
        .setColor(unlocked || isCurrent ? "#eafdff" : "#6b7184");

      let label: string;
      let color: string;
      if (isCurrent) {
        label = "▶ ACTIVE";
        color = d.accentHex;
      } else if (isCleared) {
        label = "SECURED · TRAVEL";
        color = "#39ff88";
      } else if (unlocked) {
        label = "▶ TRAVEL";
        color = d.accentHex;
      } else {
        label = "LOCKED";
        color = "#5a6172";
      }
      this.stateTexts[i].setText(label).setColor(color);
    });
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.statics.forEach((t) => t.setVisible(v));
    this.threatTexts.forEach((t) => t.setVisible(v));
    this.nameTexts.forEach((t) => t.setVisible(v));
    this.stateTexts.forEach((t) => t.setVisible(v));
    this.zones.forEach((z) => {
      z.setVisible(v);
      if (z.input) z.input.enabled = v;
    });
  }

  private centered(x: number, y: number, s: string, color: string, sizePx: number, depth: number) {
    const t = this.scene.add
      .text(x, y, s, {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(sizePx),
        color,
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(depth);
    this.statics.push(t);
    return t;
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