import Phaser from "phaser";
import { VIEW_W, VIEW_H } from "../config";
import City from "../systems/City";
import { DISTRICTS } from "../game/districts";
import { drawPanelFrame } from "./panelChrome";

/**
 * City map overlay (M). A read-only view of the campaign: the four districts as
 * stations on a contagion route, colored by state (cleared / current / locked),
 * plus the global contagion % toward meltdown. Camera-fixed; the scene freezes
 * the sim while it's open. Travel happens via extraction, not from here.
 */
export default class CityMapPanel {
  private scene: Phaser.Scene;
  private city: City;

  private g: Phaser.GameObjects.Graphics;
  private statics: Phaser.GameObjects.Text[] = [];
  private threatTexts: Phaser.GameObjects.Text[] = [];
  private nameTexts: Phaser.GameObjects.Text[] = [];
  private stateTexts: Phaser.GameObjects.Text[] = [];
  private contagionText!: Phaser.GameObjects.Text;
  private cycleText!: Phaser.GameObjects.Text;
  private open = false;

  private readonly x = 60;
  private readonly y = 44;
  private readonly w = VIEW_W - 120;
  private readonly h = VIEW_H - 92;
  private readonly routeY: number;
  private readonly stationX: number[] = [];

  constructor(scene: Phaser.Scene, city: City) {
    this.scene = scene;
    this.city = city;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.routeY = this.y + this.h * 0.5;
    const n = DISTRICTS.length;
    const startX = this.x + 70;
    const endX = this.x + this.w - 70;
    const step = n > 1 ? (endX - startX) / (n - 1) : 0;
    for (let i = 0; i < n; i++) this.stationX.push(startX + i * step);

    this.text(this.x + 16, this.y + 12, "CITY MAP", "#eafdff", "13px", D);
    this.contagionText = this.text(this.x + 16, this.y + 32, "", "#39ff88", "11px", D);
    this.cycleText = this.scene.add
      .text(this.x + this.w - 16, this.y + 12, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#ff2bd6",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(D);
    this.statics.push(this.cycleText);

    DISTRICTS.forEach((d, i) => {
      const sx = this.stationX[i];
      this.threatTexts.push(
        this.centered(sx, this.routeY - 58, "", d.accentHex, "10px", D),
      );
      this.nameTexts.push(this.centered(sx, this.routeY + 30, d.name, "#eafdff", "11px", D));
      this.stateTexts.push(this.centered(sx, this.routeY + 48, "", "#9aa3b2", "9px", D));
      this.centered(sx, this.routeY + 64, d.subtitle, "#5a6172", "8px", D);
    });

    this.text(this.x + this.w - 116, this.y + this.h - 20, "M / ESC to close", "#9aa3b2", "10px", D);
    this.setVisible(false);
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

    // Contagion bar under the title.
    const barX = this.x + 16;
    const barY = this.y + 50;
    const barW = this.w - 32;
    g.fillStyle(0x140a1e, 0.9).fillRect(barX, barY, barW, 7);
    g.fillStyle(0x39ff88, 1).fillRect(barX + 1, barY + 1, (barW - 2) * this.city.normalized, 5);

    // Route line: dim full length, bright up to the current district.
    g.lineStyle(3, 0x2a2740, 1).lineBetween(
      this.stationX[0],
      this.routeY,
      this.stationX[this.stationX.length - 1],
      this.routeY,
    );
    const reach = this.stationX[Math.min(this.city.index, this.stationX.length - 1)];
    g.lineStyle(3, 0x39ff88, 0.85).lineBetween(this.stationX[0], this.routeY, reach, this.routeY);

    DISTRICTS.forEach((d, i) => {
      const sx = this.stationX[i];
      const isCleared = this.city.isCleared(d.id);
      const isCurrent = i === this.city.index;
      const r = isCurrent ? 18 : 14;

      if (isCleared) {
        g.fillStyle(0x39ff88, 0.9).fillCircle(sx, this.routeY, r);
        g.lineStyle(2, 0x39ff88, 1).strokeCircle(sx, this.routeY, r + 3);
      } else if (isCurrent) {
        g.fillStyle(d.accent, 0.85).fillCircle(sx, this.routeY, r);
        g.lineStyle(2, 0xffffff, 0.95).strokeCircle(sx, this.routeY, r + 4);
      } else {
        g.fillStyle(0x0c0a18, 0.95).fillCircle(sx, this.routeY, r);
        g.lineStyle(2, d.accent, 0.4).strokeCircle(sx, this.routeY, r);
      }

      this.threatTexts[i].setText(
        d.isFinal ? "◆ CORE" : "THREAT " + "▮".repeat(d.threat + 1),
      );
      this.nameTexts[i]
        .setText(d.name)
        .setColor(isCleared || isCurrent ? "#eafdff" : "#6b7184");
      this.stateTexts[i]
        .setText(isCleared ? "INFECTED" : isCurrent ? "▶ ACTIVE" : "LOCKED")
        .setColor(isCleared ? "#39ff88" : isCurrent ? d.accentHex : "#5a6172");
    });
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.statics.forEach((t) => t.setVisible(v));
    this.threatTexts.forEach((t) => t.setVisible(v));
    this.nameTexts.forEach((t) => t.setVisible(v));
    this.stateTexts.forEach((t) => t.setVisible(v));
  }

  private centered(x: number, y: number, s: string, color: string, size: string, depth: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: size, color, align: "center" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(depth);
    this.statics.push(t);
    return t;
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
