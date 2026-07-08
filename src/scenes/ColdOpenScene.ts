// METROPHAGE — the cold open. First boot only: a pure TEXT cinematic — there is no
// gameplay before the wallet gate. You wake mid-reprint in words alone, THE FIXER's
// voice gives you the hook, and the title screen appears already meaning something.
//
// Entirely client-side (no server, no persistence beyond the seen-flag). CLICK or
// SPACE advances a beat, ESC or the SKIP chip jumps straight to the menu, and it is
// never shown again once finished or skipped.

import Phaser from "phaser";
import { COLORS, VIEW_W, VIEW_H, uiDim } from "../config";
import { GLOW_KEY } from "../assets/manifest";
import { displayFont, bodyFont } from "../ui/typography";
import Synth from "../audio/Synth";

export const COLD_OPEN_SEEN_KEY = "metrophage_coldopen_v1";

export function coldOpenSeen(): boolean {
  try {
    return localStorage.getItem(COLD_OPEN_SEEN_KEY) === "1";
  } catch {
    return true; // no storage — never trap the player in an unskippable intro loop
  }
}

function markSeen() {
  try {
    localStorage.setItem(COLD_OPEN_SEEN_KEY, "1");
  } catch {
    /* fine */
  }
}

/** One text beat of the cinematic: what it says, how it dresses, how long it holds. */
interface Beat {
  text: string;
  font: "display" | "body";
  size: number;
  color: string;
  /** neon glow shadow in this colour (title cards) */
  glow?: boolean;
  holdMs: number;
  stinger?: "shatter" | "infect";
}

const BEATS: Beat[] = [
  { text: "SIGNAL LOST", font: "display", size: 34, color: "#ff3b6b", glow: true, holdMs: 1300 },
  { text: "REPRINT 47 — COMPLETE", font: "display", size: 24, color: "#9aa3b2", holdMs: 1500, stinger: "shatter" },
  { text: "They printed you a new body.\nSame debt. Same name on the warrant.", font: "body", size: 16, color: "#eafdff", holdMs: 2800 },
  { text: "The collection units are already outside.\nThey know exactly where you wake up. They always do.", font: "body", size: 16, color: "#eafdff", holdMs: 2800 },
  { text: "— There you are. Same eyes. Different body.", font: "body", size: 15, color: "#f7ff3c", holdMs: 2200, stinger: "infect" },
  { text: "— They bill the reprint to YOUR account, you know.", font: "body", size: 15, color: "#f7ff3c", holdMs: 2200 },
  { text: "— I'm at the safehouse. Come angry.\nWe're getting it back.", font: "body", size: 15, color: "#f7ff3c", holdMs: 2400 },
];

export default class ColdOpenScene extends Phaser.Scene {
  private synth?: Synth;
  private caption!: Phaser.GameObjects.Text;
  private backGlow!: Phaser.GameObjects.Image;
  private beatIndex = -1;
  private holdTimer?: Phaser.Time.TimerEvent;
  private done = false;

  constructor() {
    super("ColdOpen");
  }

  create() {
    markSeen(); // even a mid-intro refresh must not loop the intro
    this.done = false;
    this.beatIndex = -1;
    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    this.synth = this.registry.get("synth") as Synth | undefined; // shared — do not dispose

    // a single dim breathing glow keeps the void from reading as a dead screen
    this.backGlow = this.add
      .image(VIEW_W / 2, VIEW_H * 0.46, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xff3b6b)
      .setScale(4.2, 2.6)
      .setAlpha(0.08)
      .setDepth(1);
    this.tweens.add({ targets: this.backGlow, alpha: 0.16, duration: 1600, yoyo: true, repeat: -1, ease: "sine.inout" });

    this.caption = this.add
      .text(VIEW_W / 2, VIEW_H * 0.46, "", bodyFont(16, { color: "#eafdff", align: "center", fontStyle: "bold" }))
      .setOrigin(0.5)
      .setDepth(10)
      .setAlpha(0)
      .setShadow(0, 2, "#05060f", 6, true, true);

    // affordances — advance vs skip
    this.add
      .text(VIEW_W / 2, VIEW_H - uiDim(26), "CLICK — next    ·    ESC — skip", bodyFont(11, { color: "#4a5162" }))
      .setOrigin(0.5)
      .setDepth(10);
    const skip = this.add
      .text(VIEW_W - uiDim(18), uiDim(14), "SKIP ▸", displayFont(11, { color: "#6b7184" }))
      .setOrigin(1, 0)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    skip.on("pointerdown", () => this.finish());
    this.input.keyboard!.on("keydown-ESC", () => this.finish());
    this.input.keyboard!.on("keydown-SPACE", () => this.advance());
    this.input.on("pointerdown", (_ptr: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (!over.includes(skip)) this.advance();
    });

    this.time.delayedCall(500, () => this.advance()); // a breath of black, then the first card
  }

  /** Show the next text beat (or finish after the last one). Manual + timed advance share this. */
  private advance() {
    if (this.done) return;
    this.holdTimer?.remove();
    this.beatIndex++;
    if (this.beatIndex >= BEATS.length) {
      this.finish();
      return;
    }
    const beat = BEATS[this.beatIndex];
    if (beat.stinger === "shatter") this.synth?.iceShatter();
    if (beat.stinger === "infect") this.synth?.infect();

    const style =
      beat.font === "display"
        ? displayFont(beat.size, { color: beat.color, fontStyle: "bold" })
        : bodyFont(beat.size, { color: beat.color, align: "center", fontStyle: "bold" });
    this.caption.setStyle(style).setText(beat.text).setAlpha(0);
    if (beat.glow) this.caption.setShadow(0, 0, beat.color, 18, true, true);
    else this.caption.setShadow(0, 2, "#05060f", 6, true, true);
    this.backGlow.setTint(Phaser.Display.Color.HexStringToColor(beat.color).color);

    this.tweens.killTweensOf(this.caption);
    this.tweens.add({ targets: this.caption, alpha: 1, duration: 320 });
    this.holdTimer = this.time.delayedCall(beat.holdMs, () => {
      this.tweens.add({ targets: this.caption, alpha: 0, duration: 240, onComplete: () => this.advance() });
    });
  }

  private finish() {
    if (this.done) return;
    this.done = true;
    this.holdTimer?.remove();
    markSeen();
    this.cameras.main.fadeOut(420, 2, 2, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("Select");
    });
  }
}
