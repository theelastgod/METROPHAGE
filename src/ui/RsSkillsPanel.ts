import Phaser from "phaser";
import { drawPanelFrame } from "./panelChrome";
import Modal from "./Modal";
import { dimBackdrop, modalRect, uiDim } from "./uiLayout";
import { bodyFont, displayFont } from "./typography";
import { RS_SKILLS, xpProgress, type RsSkillXp } from "../game/rsSkills";
import { levelPowerLabel, LEVEL_SOFT_CAP } from "../game/levelCurve";
import { animatePanelIn } from "./studioChrome";

/** RuneScape-style skill list — levels, XP bars, grind visibility. */
export default class RsSkillsPanel extends Modal {
  private skills: RsSkillXp;

  constructor(scene: Phaser.Scene, skills: RsSkillXp) {
    super(scene);
    this.skills = skills;
  }

  /**
   * Server-authoritative character level (net.level) — distinct from the skill
   * levels below, which are local flavour. This is the one that grants power.
   */
  characterLevel = 1;

  setSkills(sk: RsSkillXp) {
    this.skills = sk;
    if (this.open) this.build();
  }

  toggle() {
    this.toggleOpen();
  }

  protected build() {
    this.clear();
    const scene = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => {
      this.objs.push(o);
      return o;
    };
    const D = 1750;
    const { x, y, w, h } = modalRect(420, 380);
    add(dimBackdrop(scene, D, 0.65, () => this.close(), { x, y, w, h }));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    drawPanelFrame(g, x, y, w, h);
    add(
      scene.add
        .text(x + uiDim(20), y + uiDim(14), "◆ SKILLS", displayFont(16, { color: "#f7ff3c", fontStyle: "bold" }))
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
    add(
      scene.add
        .text(x + w - uiDim(20), y + uiDim(16), "L close", bodyFont(10, { color: "#6b7184" }))
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(D + 2),
    );

    // What the character level is actually worth — the skills below are flavour,
    // this line is the real power curve (levelCurve), so lead with it.
    const capped = this.characterLevel >= LEVEL_SOFT_CAP;
    add(
      scene.add
        .text(
          x + uiDim(20),
          y + uiDim(34),
          `CHARACTER LV ${this.characterLevel}  ${levelPowerLabel(this.characterLevel)}${capped ? "  · MAX" : ""}`,
          bodyFont(10, { color: capped ? "#39ff88" : "#9aa3b2" }),
        )
        .setScrollFactor(0)
        .setDepth(D + 2),
    );

    const rowH = uiDim(58);
    let ry = y + uiDim(56);
    for (const sk of RS_SKILLS) {
      const prog = xpProgress(this.skills[sk.id]);
      g.fillStyle(0x12102a, 0.9).fillRoundedRect(x + uiDim(16), ry, w - uiDim(32), rowH - uiDim(6), 4);
      g.lineStyle(1, parseInt(sk.color.slice(1), 16), 0.5).strokeRoundedRect(x + uiDim(16), ry, w - uiDim(32), rowH - uiDim(6), 4);
      add(
        scene.add
          .text(x + uiDim(28), ry + uiDim(8), `${sk.icon} ${sk.name}`, displayFont(13, { color: sk.color, fontStyle: "bold" }))
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      add(
        scene.add
          .text(x + w - uiDim(28), ry + uiDim(10), `Lv ${prog.level}`, bodyFont(12, { color: "#eafdff", fontStyle: "bold" }))
          .setOrigin(1, 0)
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      const barX = x + uiDim(28);
      const barW = w - uiDim(56);
      const barY = ry + uiDim(32);
      g.fillStyle(0x0a0818, 1).fillRect(barX, barY, barW, uiDim(8));
      g.fillStyle(parseInt(sk.color.slice(1), 16), 0.9).fillRect(barX, barY, barW * prog.norm, uiDim(8));
      add(
        scene.add
          .text(barX, barY + uiDim(10), `${prog.into} / ${prog.need} xp`, bodyFont(9, { color: "#6b7184" }))
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      ry += rowH;
    }
    animatePanelIn(scene, this.objs);
  }
}