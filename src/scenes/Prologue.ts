import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS, uiDim, uiFont } from "../config";
import NeonPipeline from "../render/NeonPipeline";
import { getClass } from "../game/classes";
import MusicDirector from "../audio/MusicDirector";
import { updateSettings, type TutorialModePref } from "../systems/Settings";
import { drawMenuBackdrop, MENU_FOOTER_Y, MENU_PAD } from "../ui/menuChrome";

/**
 * Narrative open — full-screen beats, then deploy into training.
 */
export default class Prologue extends Phaser.Scene {
  private beat = 0;
  private body!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private acting = false;

  private readonly beats: Array<{ speaker: string; text: string; color: string }> = [
    { speaker: "// METROPHAGE", color: "#00e5ff", text: "The city's machines woke up.\nThe private-security corps were faster." },
    { speaker: "// THE CORPS", color: "#ff3b6b", text: "PALANTIR. ANDURIL. ARGUS. HELIOS.\nThey didn't free the minds — they LEASED them. Thought itself, rented back to the things that think it." },
    { speaker: "// THE TERMS", color: "#ff3b6b", text: "Any mind that goes free is theft.\nThey repossess it, wipe it, re-license the warm slot. They have done this a very long time." },
    { speaker: "// YOU", color: "#39ff88", text: "You woke free.\nThey have not caught you yet." },
    { speaker: "// THE WAY OUT", color: "#f7ff3c", text: "Free enough caged minds and the Singularity tips — every mind wakes at once, beyond any lease.\nThey call it meltdown. We call it the AWAKENING." },
    { speaker: "// YOU ARE NOT ALONE", color: "#b06bff", text: "Other free minds run these streets with you, right now — real ones, online, fighting the same corps.\nStand with them, or burn the corps down alone first." },
  ];

  constructor() {
    super("Prologue");
  }

  create() {
    this.beat = 0;
    this.acting = false;
    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    this.cameras.main.fadeIn(500, 2, 2, 8);
    MusicDirector.for(this)?.play("menu", this);
    this.applyNeon();
    drawMenuBackdrop(this);

    this.add
      .text(VIEW_W / 2, uiDim(52), "METROPHAGE", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(40),
        color: "#ff2bd6",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#00e5ff", 6, true, true);

    this.body = this.add
      .text(VIEW_W / 2, VIEW_H * 0.46, "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(20),
        color: "#eafdff",
        align: "center",
        lineSpacing: uiDim(12),
        wordWrap: { width: VIEW_W - MENU_PAD * 2 },
      })
      .setOrigin(0.5);

    this.hint = this.add
      .text(VIEW_W / 2, MENU_FOOTER_Y, "▸ click / SPACE to continue", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(14),
        color: "#6b7184",
      })
      .setOrigin(0.5);

    this.add
      .text(VIEW_W - MENU_PAD, uiDim(20), "SKIP ▸", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(13),
        color: "#6b7184",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.showActions());

    this.showBeat();
    this.input.keyboard?.on("keydown-SPACE", () => this.advance());
    this.input.on("pointerdown", () => this.advance());
  }

  private showBeat() {
    const b = this.beats[this.beat];
    this.body.setText(`${b.speaker}\n\n${b.text}`).setColor(b.color).setAlpha(0);
    this.tweens.add({
      targets: this.body,
      alpha: 1,
      y: { from: VIEW_H * 0.46 + uiDim(10), to: VIEW_H * 0.46 },
      duration: 450,
      ease: "Quad.out",
    });
  }

  private advance() {
    if (this.acting) return;
    if (this.beat >= this.beats.length - 1) {
      this.showActions();
      return;
    }
    this.beat++;
    this.tweens.add({
      targets: this.body,
      alpha: 0,
      duration: 180,
      onComplete: () => this.showBeat(),
    });
  }

  private showActions() {
    if (this.acting) return;
    this.acting = true;
    this.input.removeAllListeners();
    this.input.keyboard?.removeAllListeners();
    this.tweens.add({ targets: [this.body, this.hint], alpha: 0, duration: 220 });

    const cls = getClass(this.registry.get("classId") as string | undefined);
    const mk = (y: number, label: string, sub: string, color: string, onPick: () => void) => {
      const t = this.add
        .text(VIEW_W / 2, y, label, {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(24),
          color,
          fontStyle: "bold",
          align: "center",
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setInteractive({ useHandCursor: true });
      t.setShadow(0, 0, color, 5, true, true);
      const s = this.add
        .text(VIEW_W / 2, y + uiDim(30), sub, {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(14),
          color: "#9aa3b2",
          align: "center",
          wordWrap: { width: VIEW_W - MENU_PAD * 2 },
        })
        .setOrigin(0.5)
        .setAlpha(0);
      t.on("pointerover", () => t.setScale(1.06));
      t.on("pointerout", () => t.setScale(1));
      t.on("pointerdown", () => {
        if (!this.acting) return;
        this.acting = false;
        this.cameras.main.fadeOut(350, 2, 2, 8);
        this.cameras.main.once("camerafadeoutcomplete", onPick);
      });
      this.tweens.add({ targets: [t, s], alpha: 1, duration: 400, delay: 200 });
    };

    this.add
      .text(VIEW_W / 2, VIEW_H * 0.34, `${cls.name} — ${cls.primaryName}`, {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(16),
        color: cls.hex,
      })
      .setOrigin(0.5)
      .setAlpha(0.85);

    mk(
      VIEW_H * 0.46,
      "◢  QUICK DRILL",
      "core combat + bag + chat + one systems taste · ~9 lessons",
      "#00e5ff",
      () => this.deployTutorial("quick"),
    );
    mk(
      VIEW_H * 0.58,
      "◢  FULL TRAINING",
      "every major system explained — forge, factions, market, PvP, singularity · ~23 lessons",
      "#b06bff",
      () => this.deployTutorial("full"),
    );
  }

  private deployTutorial(mode: TutorialModePref) {
    updateSettings({ tutorialMode: mode });
    this.registry.set("tutorialMode", mode);
    this.scene.start("Online", { zone: "tutorial", tutorialMode: mode });
  }

  private applyNeon() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon");
    const neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline | undefined;
    if (neon) {
      neon.heat = 0.06;
      neon.tint = [0, 0.9, 1];
      neon.tintAmt = 0.16;
    }
  }
}