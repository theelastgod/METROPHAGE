import Phaser from "phaser";
import { COLORS } from "../config";
import { UI_FRAME_KEY, UI_GUN_KEY } from "../assets/manifest";

export interface HudState {
  hp: number;
  hpMax: number;
  heat: number; // 0..100
  heatNorm: number; // 0..1
  overclock: boolean;
  contagion: number; // 0..100 (city takeover toward meltdown)
  contagionNorm: number; // 0..1
  classColor: number;
  abilityName: string;
  abilityReady: boolean;
  ultName: string;
  ultReady: boolean;
  overdriveReady: boolean;
  overdriveActive: boolean;
  level: number;
  xpNorm: number; // 0..1
  credits: number;
  skillPoints: number;
  shield: number;
  shieldMax: number;
  contract: string;
  quest: string;
  consumables: string;
}

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");

/**
 * Top-left HUD: framed panel with HP / Heat / Singularity bars + a weapon slot
 * (skill_frame + gun art), plus ability / ultimate / overdrive status lines.
 */
export default class Hud {
  private g: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text;
  private heatText: Phaser.GameObjects.Text;
  private singText: Phaser.GameObjects.Text;
  private abilityText: Phaser.GameObjects.Text;
  private ultText: Phaser.GameObjects.Text;
  private overdriveText: Phaser.GameObjects.Text;
  private metaText: Phaser.GameObjects.Text;
  private skillText: Phaser.GameObjects.Text;
  private contractText: Phaser.GameObjects.Text;
  private questText: Phaser.GameObjects.Text;
  private consumeText: Phaser.GameObjects.Text;

  private readonly px = 14;
  private readonly py = 14;
  private readonly pw = 250;
  private readonly ph = 84;
  private readonly barX = 92;
  private readonly barW = 150;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1000);

    const label = (y: number, color: string, size = "12px") =>
      scene.add
        .text(this.px + 8, y, "", {
          fontFamily: "Courier New, monospace",
          fontSize: size,
          color,
        })
        .setScrollFactor(0)
        .setDepth(1001);

    this.hpText = label(this.py + 12, "#39ff88");
    this.heatText = label(this.py + 34, "#ff2bd6");
    this.singText = label(this.py + 56, "#00e5ff");
    this.abilityText = label(this.py + this.ph + 6, "#9aa3b2", "11px");
    this.ultText = label(this.py + this.ph + 22, "#9aa3b2", "11px");
    this.overdriveText = label(this.py + this.ph + 38, "#f7ff3c", "12px");
    this.skillText = label(this.py + this.ph + 54, "#9aa3b2", "11px");
    this.consumeText = label(this.py + this.ph + 70, "#9aa3b2", "10px");
    this.metaText = scene.add
      .text(this.px + this.pw - 10, this.py + 8, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#00e5ff",
        align: "right",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1001);
    // Contract tracker, top-center.
    this.contractText = scene.add
      .text(scene.scale.width / 2, 12, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#f7ff3c",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1001);
    // Active quest tracker, just under the contract line.
    this.questText = scene.add
      .text(scene.scale.width / 2, 28, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#8a5cff",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1001);

    // Weapon slot (real UI art), just right of the panel.
    const sx = this.px + this.pw + 26;
    const sy = this.py + 34;
    scene.add
      .image(sx, sy, UI_FRAME_KEY)
      .setScrollFactor(0)
      .setDepth(1000)
      .setDisplaySize(48, 48);
    scene.add.image(sx, sy, UI_GUN_KEY).setScrollFactor(0).setDepth(1001).setScale(1.2);
  }

  update(s: HudState) {
    const g = this.g;
    g.clear();

    g.fillStyle(0x07061a, 0.72).fillRect(this.px, this.py, this.pw, this.ph);
    g.lineStyle(2, COLORS.neonCyan, 0.85).strokeRect(this.px, this.py, this.pw, this.ph);
    g.lineStyle(2, COLORS.neonMagenta, 0.9);
    g.beginPath();
    g.moveTo(this.px, this.py + 12);
    g.lineTo(this.px, this.py);
    g.lineTo(this.px + 12, this.py);
    g.strokePath();

    const hpNorm = s.hpMax > 0 ? Math.max(0, s.hp / s.hpMax) : 0;
    this.bar(this.py + 14, hpNorm, hpNorm > 0.3 ? COLORS.hp : COLORS.hpLow);
    // shield overlay on the HP bar (cyan), only when the player has shields
    if (s.shieldMax > 0) {
      const w = this.barW - 2;
      this.g.fillStyle(COLORS.neonCyan, 0.9).fillRect(
        this.barX + 1,
        this.py + 14 + 1,
        w * Phaser.Math.Clamp(s.shield / s.shieldMax, 0, 1),
        3,
      );
    }
    this.bar(
      this.py + 36,
      s.heatNorm,
      s.overclock ? COLORS.neonYellow : COLORS.neonMagenta,
      true,
    );
    this.bar(this.py + 58, s.contagionNorm, COLORS.singularity);

    this.hpText.setText(`HP ${Math.ceil(s.hp)}`);
    this.heatText
      .setText(`HEAT ${Math.round(s.heat)}${s.overclock ? " ⚡" : ""}`)
      .setColor(s.overclock ? "#f7ff3c" : "#ff2bd6");
    this.singText.setText(
      s.contagionNorm >= 1
        ? "CITY 100% ▲MELTDOWN"
        : `CITY ${Math.round(s.contagion)}%`,
    );

    this.abilityText
      .setText(`Q ${s.abilityName}  ${s.abilityReady ? "●" : "···"}`)
      .setColor(s.abilityReady ? hex(s.classColor) : "#5a6172");
    this.ultText
      .setText(`F ${s.ultName}  ${s.ultReady ? "●" : "locked"}`)
      .setColor(s.ultReady ? "#f7ff3c" : "#5a6172");
    this.overdriveText.setText(
      s.overdriveActive
        ? "★ OVERDRIVE"
        : s.overdriveReady
          ? "R → OVERDRIVE READY"
          : "",
    );

    this.metaText.setText(`LV ${s.level}   ₵ ${s.credits}`);
    this.contractText.setText(s.contract ? `◢ ${s.contract}` : "");
    this.questText.setText(s.quest ? `◆ ${s.quest}` : "");
    this.consumeText.setText(s.consumables);
    this.skillText
      .setText(s.skillPoints > 0 ? `K SKILLS (${s.skillPoints} pts!)` : "K SKILLS")
      .setColor(s.skillPoints > 0 ? "#39ff88" : "#5a6172");

    // thin XP bar along the panel's bottom edge
    g.fillStyle(0x0a1420, 0.9).fillRect(this.px + 2, this.py + this.ph - 3, this.pw - 4, 2);
    g.fillStyle(0x00e5ff, 1).fillRect(
      this.px + 2,
      this.py + this.ph - 3,
      (this.pw - 4) * Phaser.Math.Clamp(s.xpNorm, 0, 1),
      2,
    );
  }

  private bar(y: number, norm: number, color: number, tickAt50 = false) {
    const g = this.g;
    const x = this.barX;
    const w = this.barW;
    g.fillStyle(0x140a1e, 0.9).fillRect(x, y, w, 9);
    g.fillStyle(color, 1).fillRect(
      x + 1,
      y + 1,
      Math.max(0, (w - 2) * Phaser.Math.Clamp(norm, 0, 1)),
      7,
    );
    if (tickAt50) g.fillStyle(COLORS.neonCyan, 0.8).fillRect(x + w * 0.5, y - 1, 1, 11);
  }
}
