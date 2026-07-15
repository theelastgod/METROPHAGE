import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";
import { fmtMetro } from "../economy/metro";
import { PVP_BUY_IN_METRO, PVP_CREDIT_DROP_NOTICE } from "../game/pvp";
import { drawStudioChip, STUDIO, animatePanelIn } from "./studioChrome";
import { uiDim } from "./uiLayout";
import { bodyFont, displayFont } from "./typography";

export interface PvpHudState {
  inZone: boolean;
  inArena: boolean;
  escrow: number;
}

/**
 * Premium PvP arena chrome — enter/exit banner + persistent contest tag.
 * Replaces raw center text with framed studio HUD.
 */
export default class PvpCrucibleHud {
  private scene: Phaser.Scene;
  private warnG: Phaser.GameObjects.Graphics;
  private warnTitle: Phaser.GameObjects.Text;
  private warnSub: Phaser.GameObjects.Text;
  private warnGlow: Phaser.GameObjects.Image;
  private tagG: Phaser.GameObjects.Graphics;
  private tagTitle: Phaser.GameObjects.Text;
  private tagSub: Phaser.GameObjects.Text;
  private wasInZone = false;

  private readonly warnW = uiDim(520);
  private readonly warnH = uiDim(72);
  private readonly tagW = uiDim(248);
  private readonly tagH = uiDim(44);

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const cx = scene.scale.width / 2;
    const warnY = scene.scale.height / 2 - uiDim(110);
    const D = 1004;

    this.warnGlow = scene.add
      .image(cx, warnY + this.warnH / 2, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xff3b6b)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(D - 1);
    this.warnG = scene.add.graphics().setScrollFactor(0).setDepth(D).setAlpha(0);
    this.warnTitle = scene.add
      .text(cx, warnY + uiDim(16), "", displayFont(16, { color: STUDIO.danger, fontStyle: "bold", align: "center" }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(D + 1)
      .setAlpha(0);
    this.warnSub = scene.add
      .text(cx, warnY + uiDim(40), "", bodyFont(11, { color: STUDIO.muted, align: "center", wordWrap: { width: this.warnW - uiDim(32) } }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(D + 1)
      .setAlpha(0);

    const tagX = uiDim(12);
    const tagY = scene.scale.height - uiDim(84);
    this.tagG = scene.add.graphics().setScrollFactor(0).setDepth(1001).setVisible(false);
    this.tagTitle = scene.add
      .text(tagX + uiDim(14), tagY + uiDim(8), "⚔ THE CRUCIBLE", displayFont(11, { color: STUDIO.danger, fontStyle: "bold" }))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
    this.tagSub = scene.add
      .text(tagX + uiDim(14), tagY + uiDim(24), "", bodyFont(10, { color: STUDIO.metro }))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
  }

  update(state: PvpHudState) {
    const buyIn = fmtMetro(PVP_BUY_IN_METRO);
    const cx = this.scene.scale.width / 2;
    const warnY = this.scene.scale.height / 2 - uiDim(110);
    const tagX = uiDim(12);
    const tagY = this.scene.scale.height - uiDim(84);

    if (state.inZone !== this.wasInZone) {
      this.wasInZone = state.inZone;
      const entering = state.inZone;
      const title = entering ? "◢ THE CRUCIBLE — PVP ZONE" : "✓ LEFT THE CRUCIBLE";
      const accent = entering ? 0xff3b6b : 0x39ff88;
      const sub = entering
        ? state.inArena
          ? `Contest live · pot ◈${fmtMetro(state.escrow)} · ${PVP_CREDIT_DROP_NOTICE}`
          : `◈${buyIn} $METRO buy-in on entry · ${PVP_CREDIT_DROP_NOTICE}`
        : "Escrow released if you left safely — credits only drop when another player kills you in PvP";

      this.warnGlow.setTint(accent).setAlpha(entering ? 0.16 : 0.1);
      this.warnG.clear().setAlpha(1);
      // Taller chip so the credit-drop warning fully fits.
      const h = entering ? this.warnH + uiDim(18) : this.warnH;
      drawStudioChip(this.warnG, cx - this.warnW / 2, warnY, this.warnW, h, accent);
      this.warnTitle.setText(title).setColor(entering ? STUDIO.danger : STUDIO.ready);
      this.warnSub.setText(sub);

      this.scene.tweens.killTweensOf([this.warnG, this.warnTitle, this.warnSub, this.warnGlow]);
      animatePanelIn(this.scene, [this.warnG, this.warnTitle, this.warnSub, this.warnGlow]);
      this.scene.tweens.add({
        targets: [this.warnG, this.warnTitle, this.warnSub, this.warnGlow],
        alpha: 0,
        delay: entering ? 4200 : 1600,
        duration: 700,
        ease: "Quad.in",
      });
    }

    const showTag = state.inZone && state.inArena;
    this.tagG.setVisible(showTag);
    this.tagTitle.setVisible(showTag);
    this.tagSub.setVisible(showTag);
    if (showTag) {
      this.tagG.clear();
      drawStudioChip(this.tagG, tagX, tagY, this.tagW, this.tagH, 0xff3b6b);
      this.tagSub.setText(`POT ◈${fmtMetro(state.escrow)} · contest active`);
    }
  }
}