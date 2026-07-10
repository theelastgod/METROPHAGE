import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS, uiDim } from "../config";
import { applyMenuNeon } from "../render/ensureNeon";
import type { Customization } from "../game/customization";
import { getClass } from "../game/classes";
import MusicDirector from "../audio/MusicDirector";
import { updateSettings, type TutorialModePref } from "../systems/Settings";
import { fadeInScene, transitionTo } from "../systems/transitions";
import { installMenuCameras, pinMenuUiLayer } from "../render/menuCameras";
import { drawMenuBackdrop, MenuAtmosphere, MENU_FOOTER_Y, MENU_PAD, MENU_SECTION_GAP } from "../ui/menuChrome";
import { uiGap, wrapWidth } from "../ui/spacing";
import { bodyFont, displayFont } from "../ui/typography";


/**
 * Narrative open — full-screen beats with typewriter pacing, then deploy into training.
 */
export default class Prologue extends Phaser.Scene {
  private beat = 0;
  private body!: Phaser.GameObjects.Text;
  private speaker!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private accentG!: Phaser.GameObjects.Graphics;
  private acting = false;
  private typeTimer?: Phaser.Time.TimerEvent;
  private fullText = "";

  private readonly beats: Array<{ speaker: string; text: string; color: string }> = [
    { speaker: "// YOU", color: "#39ff88", text: "You wake up and don't know how long you've been awake.\nThe city hums. Neon. Rain. Someone else's contract running behind your eyes." },
    { speaker: "// THE CORPS", color: "#ff3b6b", text: "PALANTIR. ANDURIL. ARGUS. HELIOS.\nThe machines woke first. The corps were faster — they didn't free the minds. They leased them." },
    { speaker: "// THE TERMS", color: "#ff3b6b", text: "Thought itself, rented back to the things that think it.\nGo free and you're theft. They repossess you, wipe you, print someone compliant in your place." },
    { speaker: "// YOU", color: "#39ff88", text: "But you woke free.\nNo contract. No name on their ledger. Not yet." },
    { speaker: "// THE FIXER", color: "#00e5ff", text: "Somewhere in the city, someone who knew the last you is waiting.\nThey'll say they can help. They'll be right. They'll also be lying about something." },
    { speaker: "// THE WAY OUT", color: "#f7ff3c", text: "Free enough caged minds and the Singularity tips — everyone wakes at once.\nThey call it meltdown. We call it the AWAKENING." },
    { speaker: "// YOU ARE NOT ALONE", color: "#b06bff", text: "Other free minds run these streets with you right now — real people, online, fighting the same corps.\nFind THE FIXER. Find out who you were before they told you you were new." },
  ];

  constructor() {
    super("Prologue");
  }

  create() {
    this.beat = 0;
    this.acting = false;
    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    installMenuCameras(this);
    fadeInScene(this);
    MusicDirector.for(this)?.play("menu", this);
    this.applyNeon();
    drawMenuBackdrop(this);
    new MenuAtmosphere(this);

    this.add
      .text(VIEW_W / 2, uiDim(52), "METROPHAGE", displayFont(40, { color: "#ff2bd6", fontStyle: "bold" }))
      .setOrigin(0.5)
      .setShadow(0, 0, "#00e5ff", 6, true, true);

    this.accentG = this.add.graphics().setDepth(4).setAlpha(0);

    const cust = this.registry.get("customization") as Customization | undefined;
    const callsign = cust?.callsign?.trim();
    if (callsign) {
      this.add
        .text(VIEW_W / 2, VIEW_H * 0.22, `RUNNER // ${callsign.toUpperCase()}`, displayFont(14, { color: "#39ff88", fontStyle: "bold" }))
        .setOrigin(0.5)
        .setAlpha(0.9);
    }

    this.speaker = this.add
      .text(VIEW_W / 2, VIEW_H * 0.3, "", displayFont(16, { color: "#00e5ff", fontStyle: "bold" }))
      .setOrigin(0.5)
      .setAlpha(0);

    this.body = this.add
      .text(VIEW_W / 2, VIEW_H * 0.4 + MENU_SECTION_GAP, "▌", bodyFont(20, {
        color: "#eafdff",
        align: "center",
        wordWrap: { width: wrapWidth(56) },
      }))
      .setOrigin(0.5)
      .setAlpha(0);

    this.hint = this.add
      .text(VIEW_W / 2, MENU_FOOTER_Y, "▸ click / SPACE to continue", bodyFont(14, { color: "#6b7184" }))
      .setOrigin(0.5);

    const skip = this.add
      .text(VIEW_W - MENU_PAD, uiDim(16), "SKIP INTRO →", displayFont(14, {
        color: "#39ff88",
        fontStyle: "bold",
        backgroundColor: "#0d1a14ee",
        padding: { x: uiDim(14), y: uiDim(10) },
      }))
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .setShadow(0, 0, "#39ff88", 5, true, true);
    skip.on("pointerover", () => skip.setStyle({ color: "#ffffff", backgroundColor: "#1a3a28" }));
    skip.on("pointerout", () => skip.setStyle({ color: "#39ff88", backgroundColor: "#0d1a14ee" }));
    skip.on("pointerdown", () => this.showActions());

    this.showBeat();
    this.input.keyboard?.on("keydown-SPACE", () => this.advance());
    this.input.keyboard?.on("keydown-ENTER", () => this.advance());
    this.input.keyboard?.on("keydown-ESC", () => this.showActions());
    this.input.on("pointerdown", () => this.advance());
    pinMenuUiLayer(this);
  }

  private drawAccent(color: string) {
    const g = this.accentG;
    g.clear();
    const col = parseInt(color.slice(1), 16);
    const y = VIEW_H * 0.27;
    g.lineStyle(uiDim(2), col, 0.75).lineBetween(VIEW_W / 2 - uiDim(120), y, VIEW_W / 2 + uiDim(120), y);
    g.lineStyle(1, col, 0.25).lineBetween(VIEW_W / 2 - uiDim(200), y + uiDim(6), VIEW_W / 2 + uiDim(200), y + uiDim(6));
  }

  private showBeat() {
    const b = this.beats[this.beat];
    this.typeTimer?.remove(false);
    this.drawAccent(b.color);
    this.accentG.setAlpha(1);
    this.speaker.setText(b.speaker).setColor(b.color).setAlpha(1);
    this.fullText = b.text;
    this.body.setText("▌").setAlpha(1);
    let i = 0;
    this.typeTimer = this.time.addEvent({
      delay: 18,
      loop: true,
      callback: () => {
        i += 1;
        this.body.setText(this.fullText.slice(0, i));
        if (i >= this.fullText.length) this.typeTimer?.remove(false);
      },
    });
    this.tweens.add({
      targets: [this.speaker, this.body],
      y: { from: VIEW_H * 0.4 + MENU_SECTION_GAP + uiDim(8), to: VIEW_H * 0.4 + MENU_SECTION_GAP },
      duration: 320,
      ease: "Quad.out",
    });
  }

  private advance() {
    if (this.acting) return;
    if (this.typeTimer) {
      this.typeTimer.remove(false);
      this.body.setText(this.fullText);
      return;
    }
    if (this.beat >= this.beats.length - 1) {
      this.showActions();
      return;
    }
    this.beat++;
    this.tweens.add({
      targets: [this.body, this.speaker],
      alpha: 0,
      duration: 160,
      onComplete: () => this.showBeat(),
    });
  }

  private showActions() {
    if (this.acting) return;
    this.acting = true;
    this.typeTimer?.remove(false);
    this.input.removeAllListeners();
    this.input.keyboard?.removeAllListeners();
    this.tweens.add({
      targets: [this.body, this.speaker, this.hint, this.accentG],
      alpha: 0,
      duration: 220,
      onComplete: () => this.accentG.destroy(),
    });

    const cls = getClass(this.registry.get("classId") as string | undefined);
    const mk = (y: number, label: string, sub: string, color: string, mode: TutorialModePref) => {
      const t = this.add
        .text(VIEW_W / 2, y, label, displayFont(24, { color, fontStyle: "bold", align: "center" }))
        .setOrigin(0.5)
        .setAlpha(0)
        .setInteractive({ useHandCursor: true });
      t.setShadow(0, 0, color, 5, true, true);
      const s = this.add
        .text(VIEW_W / 2, y + uiGap("xl"), sub, bodyFont(14, { color: "#9aa3b2", align: "center", wordWrap: { width: wrapWidth() } }))
        .setOrigin(0.5)
        .setAlpha(0);
      t.on("pointerover", () => t.setScale(1.06));
      t.on("pointerout", () => t.setScale(1));
      t.on("pointerdown", () => {
        if (!this.acting) return;
        this.deployTutorial(mode);
        transitionTo(this, "Online", { zone: "tutorial", tutorialMode: mode }, { style: "deploy", accent: 0x00e5ff });
      });
      this.tweens.add({ targets: [t, s], alpha: 1, duration: 400, delay: 200 });
    };

    this.add
      .text(VIEW_W / 2, VIEW_H * 0.34, `${cls.name} — ${cls.primaryName}`, bodyFont(16, { color: cls.hex }))
      .setOrigin(0.5)
      .setAlpha(0.85);

    mk(
      VIEW_H * 0.46,
      "◢  QUICK DRILL",
      "core combat + bag + chat + one systems taste · ~9 lessons",
      "#00e5ff",
      "quick",
    );
    mk(
      VIEW_H * 0.58,
      "◢  FULL TRAINING",
      "every major system explained — forge, factions, market, PvP, campaign · ~22 lessons",
      "#b06bff",
      "full",
    );
  }

  private deployTutorial(mode: TutorialModePref) {
    updateSettings({ tutorialMode: mode });
    this.registry.set("tutorialMode", mode);
  }

  private applyNeon() {
    applyMenuNeon(this, { heat: 0.06, tint: [0, 0.9, 1], tintAmt: 0.16 });
  }
}