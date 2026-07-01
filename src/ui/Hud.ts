import Phaser from "phaser";
import { COLORS, UI_SCALE, uiDim } from "../config";
import { UI_FRAME_KEY, UI_GUN_KEY } from "../assets/manifest";
import { fmtMetro } from "../economy/metro";
import { drawHudPanel, drawPremiumBar } from "./panelChrome";
import { displayFont, hudFont } from "./typography";

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
  xpInto: number; // raw XP into the current level
  xpNext: number; // XP needed to reach the next level (0 = at cap)
  credits: number;
  metro: number; // $METRO premium balance
  skillPoints: number;
  shield: number;
  shieldMax: number;
  contract: string;
  quest: string;
  consumables: string;
  callsign: string;
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
  private callsignText: Phaser.GameObjects.Text;

  private readonly px = uiDim(14);
  private readonly py = uiDim(14);
  private readonly pw = uiDim(250);
  private readonly ph = uiDim(92);
  private readonly barX = uiDim(96);
  private readonly barW = uiDim(150);

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1000);

    const label = (y: number, color: string, sizePx = 12) =>
      scene.add
        .text(this.px + uiDim(8), y, "", hudFont(sizePx, { color }))
        .setScrollFactor(0)
        .setDepth(1001);

    this.hpText = label(this.py + uiDim(14), "#39ff88");
    this.heatText = label(this.py + uiDim(38), "#ff2bd6");
    this.singText = label(this.py + uiDim(62), "#00e5ff");
    this.abilityText = label(this.py + this.ph + uiDim(8), "#9aa3b2", 11);
    this.ultText = label(this.py + this.ph + uiDim(26), "#9aa3b2", 11);
    this.overdriveText = label(this.py + this.ph + uiDim(44), "#f7ff3c", 12);
    this.skillText = label(this.py + this.ph + uiDim(62), "#9aa3b2", 11);
    this.consumeText = label(this.py + this.ph + uiDim(80), "#9aa3b2", 10);
    this.metaText = scene.add
      .text(this.px + this.pw - uiDim(10), this.py + uiDim(8), "", hudFont(11, { color: "#00e5ff", align: "right" }))
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1001);
    this.callsignText = scene.add
      .text(scene.scale.width - uiDim(12), uiDim(10), "", displayFont(13, { color: "#eafdff", fontStyle: "bold", align: "right" }))
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1001)
      .setShadow(0, 0, "#00e5ff", 6, true, true);
    this.contractText = scene.add
      .text(scene.scale.width / 2, uiDim(14), "", hudFont(12, { color: "#f7ff3c", align: "center" }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1001);
    this.questText = scene.add
      .text(scene.scale.width / 2, uiDim(34), "", hudFont(11, { color: "#8a5cff", align: "center" }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1001);

    // Weapon slot (real UI art), just right of the panel.
    const sx = this.px + this.pw + uiDim(26);
    const sy = this.py + uiDim(34);
    const slot = uiDim(48);
    scene.add
      .image(sx, sy, UI_FRAME_KEY)
      .setScrollFactor(0)
      .setDepth(1000)
      .setDisplaySize(slot, slot);
    scene.add.image(sx, sy, UI_GUN_KEY).setScrollFactor(0).setDepth(1001).setScale(1.2 * UI_SCALE);
  }

  update(s: HudState) {
    const g = this.g;
    g.clear();

    drawHudPanel(g, this.px, this.py, this.pw, this.ph);

    const hpNorm = s.hpMax > 0 ? Math.max(0, s.hp / s.hpMax) : 0;
    drawPremiumBar(g, this.barX, this.py + uiDim(16), this.barW, uiDim(10), hpNorm, hpNorm > 0.3 ? COLORS.hp : COLORS.hpLow);
    // shield overlay on the HP bar (cyan), only when the player has shields
    if (s.shieldMax > 0) {
      const w = this.barW - 2;
      this.g.fillStyle(COLORS.neonCyan, 0.9).fillRect(
        this.barX + 1,
        this.py + uiDim(16) + 1,
        w * Phaser.Math.Clamp(s.shield / s.shieldMax, 0, 1),
        3,
      );
    }
    drawPremiumBar(
      g,
      this.barX,
      this.py + uiDim(40),
      this.barW,
      uiDim(10),
      s.heatNorm,
      s.overclock ? COLORS.neonYellow : COLORS.neonMagenta,
      true,
    );
    drawPremiumBar(g, this.barX, this.py + uiDim(64), this.barW, uiDim(10), s.contagionNorm, COLORS.singularity);

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

    this.callsignText.setText(s.callsign ? `▸ ${s.callsign}` : "").setColor(hex(s.classColor));
    this.metaText.setText(`LV ${s.level}   ₵ ${s.credits.toLocaleString()}   ◈ ${fmtMetro(s.metro)}`);
    this.contractText.setText(s.contract ? `◢ ${s.contract}` : "");
    this.questText.setText(s.quest ? `◆ ${s.quest}` : "");
    this.consumeText.setText(s.consumables);
    this.skillText
      .setText(s.skillPoints > 0 ? `K SKILLS (${s.skillPoints} pts!)` : "K SKILLS")
      .setColor(s.skillPoints > 0 ? "#39ff88" : "#5a6172");

    // thin XP bar along the panel's bottom edge
    const xpH = uiDim(2);
    g.fillStyle(0x0a1420, 0.9).fillRect(this.px + 2, this.py + this.ph - uiDim(3), this.pw - 4, xpH);
    g.fillStyle(0x00e5ff, 1).fillRect(
      this.px + 2,
      this.py + this.ph - uiDim(3),
      (this.pw - 4) * Phaser.Math.Clamp(s.xpNorm, 0, 1),
      xpH,
    );
  }

}
