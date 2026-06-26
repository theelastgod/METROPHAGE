import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS, uiDim, uiFont } from "../config";
import NeonPipeline from "../render/NeonPipeline";
import { getClass } from "../game/classes";
import MusicDirector from "../audio/MusicDirector";

/**
 * Prologue — the narrative open. Instead of dropping a fresh run straight into combat,
 * this sets the world (the corps own the city's minds; you woke free; the Awakening ends
 * ownership) one click-advanced beat at a time, and — crucially — signposts that this is a
 * shared world: other free minds are fighting the same corps right now. It ends on a choice,
 * so multiplayer is offered up front: BEGIN the solo campaign, or GO ONLINE.
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
    MusicDirector.for(this)?.play("menu", this); // carry the title bed into the prologue
    this.applyNeon();

    // faint city grid backdrop
    const g = this.add.graphics().setAlpha(0.25);
    g.lineStyle(1, 0x1b2740, 0.6);
    for (let x = 0; x <= VIEW_W; x += 32) g.lineBetween(x, 0, x, VIEW_H);
    for (let y = 0; y <= VIEW_H; y += 32) g.lineBetween(0, y, VIEW_W, y);

    this.add
      .text(VIEW_W / 2, 60, "METROPHAGE", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(34),
        color: "#ff2bd6",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#00e5ff", 6, true, true);

    this.body = this.add
      .text(VIEW_W / 2, VIEW_H / 2, "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(16),
        color: "#eafdff",
        align: "center",
        lineSpacing: uiDim(8),
        wordWrap: { width: VIEW_W - uiDim(180) },
      })
      .setOrigin(0.5);

    this.hint = this.add
      .text(VIEW_W / 2, VIEW_H - 40, "▸ click / SPACE to continue", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(12),
        color: "#6b7184",
      })
      .setOrigin(0.5);

    this.add
      .text(VIEW_W - uiDim(16), uiDim(16), "SKIP ▸", { fontFamily: "Courier New, monospace", fontSize: uiFont(12), color: "#6b7184" })
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
    // speaker line + body share the colour; the body stays bright for readability
    this.tweens.add({ targets: this.body, alpha: 1, y: { from: VIEW_H / 2 + 10, to: VIEW_H / 2 }, duration: 450, ease: "Quad.out" });
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

  /** The fork — solo campaign or straight online. */
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
          fontSize: uiFont(20),
          color,
          fontStyle: "bold",
          align: "center",
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setInteractive({ useHandCursor: true });
      t.setShadow(0, 0, color, 5, true, true);
      const s = this.add
        .text(VIEW_W / 2, y + uiDim(24), sub, { fontFamily: "Courier New, monospace", fontSize: uiFont(12), color: "#9aa3b2" })
        .setOrigin(0.5)
        .setAlpha(0);
      t.on("pointerover", () => t.setScale(1.08));
      t.on("pointerout", () => t.setScale(1));
      t.on("pointerdown", () => {
        if (this.acting === false) return;
        this.acting = false; // guard against double-pick
        this.cameras.main.fadeOut(350, 2, 2, 8);
        this.cameras.main.once("camerafadeoutcomplete", onPick);
      });
      this.tweens.add({ targets: [t, s], alpha: 1, duration: 400, delay: 200 });
    };

    this.add
      .text(VIEW_W / 2, VIEW_H / 2 - 70, `${cls.name} — ${cls.primaryName}`, {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(13),
        color: cls.hex,
      })
      .setOrigin(0.5)
      .setAlpha(0.85);

    mk(
      VIEW_H / 2 - 10,
      "◢  ENTER THE CITY",
      "your personal arc begins in the shared world — other free minds fight beside you",
      "#00e5ff",
      () => this.scene.start("Online", { zone: "tutorial" }),
    );
  }

  private applyNeon() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon");
    const neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline | undefined;
    if (neon) {
      neon.heat = 0.06; // narrative screen — keep the prose crisp
      neon.tint = [0, 0.9, 1];
      neon.tintAmt = 0.16;
    }
  }
}
