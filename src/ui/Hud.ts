import Phaser from "phaser";
import { COLORS } from "../config";
import { UI_FRAME_KEY, UI_GUN_KEY } from "../assets/manifest";

export interface HudState {
  hp: number;
  hpMax: number;
  heat: number; // 0..100
  heatNorm: number; // 0..1
  overclock: boolean;
  sing: number; // 0..100
  singNorm: number; // 0..1
}

/**
 * Top-left HUD: framed panel with HP / Heat / Singularity bars plus a weapon slot
 * built from the supplied UI art (skill_frame + gun icon). Camera-fixed.
 */
export default class Hud {
  private g: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text;
  private heatText: Phaser.GameObjects.Text;
  private singText: Phaser.GameObjects.Text;

  private readonly px = 14;
  private readonly py = 14;
  private readonly pw = 250;
  private readonly ph = 84;
  private readonly barX = 92;
  private readonly barW = 150;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1000);

    const label = (y: number, color: string) =>
      scene.add
        .text(this.px + 8, y, "", {
          fontFamily: "Courier New, monospace",
          fontSize: "12px",
          color,
        })
        .setScrollFactor(0)
        .setDepth(1001);

    this.hpText = label(this.py + 12, "#39ff88");
    this.heatText = label(this.py + 34, "#ff2bd6");
    this.singText = label(this.py + 56, "#00e5ff");

    // Weapon slot (real UI art), just right of the panel.
    const sx = this.px + this.pw + 26;
    const sy = this.py + 34;
    scene.add
      .image(sx, sy, UI_FRAME_KEY)
      .setScrollFactor(0)
      .setDepth(1000)
      .setDisplaySize(48, 48);
    scene.add
      .image(sx, sy, UI_GUN_KEY)
      .setScrollFactor(0)
      .setDepth(1001)
      .setScale(1.2);
  }

  update(s: HudState) {
    const g = this.g;
    g.clear();

    // panel
    g.fillStyle(0x07061a, 0.72).fillRect(this.px, this.py, this.pw, this.ph);
    g.lineStyle(2, COLORS.neonCyan, 0.85).strokeRect(this.px, this.py, this.pw, this.ph);
    // corner accents
    g.lineStyle(2, COLORS.neonMagenta, 0.9);
    g.beginPath();
    g.moveTo(this.px, this.py + 12);
    g.lineTo(this.px, this.py);
    g.lineTo(this.px + 12, this.py);
    g.strokePath();

    const hpNorm = s.hpMax > 0 ? Math.max(0, s.hp / s.hpMax) : 0;
    const hpColor = hpNorm > 0.3 ? COLORS.hp : COLORS.hpLow;
    this.bar(this.py + 14, hpNorm, hpColor);
    this.bar(this.py + 36, s.heatNorm, s.overclock ? COLORS.neonYellow : COLORS.neonMagenta, true);
    this.bar(this.py + 58, s.singNorm, COLORS.singularity);

    this.hpText.setText(`HP ${Math.ceil(s.hp)}`);
    this.heatText
      .setText(`HEAT ${Math.round(s.heat)}${s.overclock ? " ⚡" : ""}`)
      .setColor(s.overclock ? "#f7ff3c" : "#ff2bd6");
    this.singText.setText(
      s.singNorm >= 1 ? "SING 100 ▲CRITICAL" : `SING ${Math.round(s.sing)}`,
    );
  }

  private bar(y: number, norm: number, color: number, tickAt50 = false) {
    const g = this.g;
    const x = this.barX;
    const w = this.barW;
    g.fillStyle(0x140a1e, 0.9).fillRect(x, y, w, 9);
    g.fillStyle(color, 1).fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Phaser.Math.Clamp(norm, 0, 1)), 7);
    if (tickAt50) g.fillStyle(COLORS.neonCyan, 0.8).fillRect(x + w * 0.5, y - 1, 1, 11);
  }
}
