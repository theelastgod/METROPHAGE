// METROPHAGE — the cold open. First boot only:
// 1) Full-screen Cloudflare Stream intro (click / SKIP / ESC to skip → fades out)
// 2) Short text cinematic hook
// 3) Fade into the title / wallet gate
//
// Entirely client-side (no server). The seen-flag prevents looping once finished
// or skipped. If the Stream video fails to load, we still run the text beats.

import Phaser from "phaser";
import { COLORS, VIEW_W, VIEW_H, uiDim } from "../config";
import { GLOW_KEY } from "../assets/manifest";
import { displayFont, bodyFont } from "../ui/typography";
import { playIntroVideo, type IntroVideoHandle } from "../ui/IntroVideo";
import Synth from "../audio/Synth";

/** Bumped when the intro experience changes so returning players see it once. */
export const COLD_OPEN_SEEN_KEY = "metrophage_coldopen_v2";

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

// Tighter holds — video already carried the atmosphere.
const BEATS: Beat[] = [
  { text: "SIGNAL LOST", font: "display", size: 34, color: "#ff3b6b", glow: true, holdMs: 900 },
  { text: "REPRINT 47 — COMPLETE", font: "display", size: 24, color: "#9aa3b2", holdMs: 1000, stinger: "shatter" },
  { text: "They printed you a new body.\nSame debt. Same warrant.", font: "body", size: 16, color: "#eafdff", holdMs: 1600 },
  { text: "— Safehouse. Come angry. We're getting it back.", font: "body", size: 15, color: "#f7ff3c", holdMs: 1600, stinger: "infect" },
];

export default class ColdOpenScene extends Phaser.Scene {
  private synth?: Synth;
  private caption!: Phaser.GameObjects.Text;
  private backGlow!: Phaser.GameObjects.Image;
  private hintText?: Phaser.GameObjects.Text;
  private skipChip?: Phaser.GameObjects.Text;
  private beatIndex = -1;
  private holdTimer?: Phaser.Time.TimerEvent;
  private done = false;
  private phase: "video" | "text" = "video";
  private intro?: IntroVideoHandle;

  constructor() {
    super("ColdOpen");
  }

  create() {
    markSeen(); // even a mid-intro refresh must not loop the intro
    this.done = false;
    this.beatIndex = -1;
    this.phase = "video";
    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    this.synth = this.registry.get("synth") as Synth | undefined; // shared — do not dispose

    // Hide Phaser UI while the DOM Stream overlay owns the screen.
    this.cameras.main.setAlpha(0);

    this.backGlow = this.add
      .image(VIEW_W / 2, VIEW_H * 0.46, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xff3b6b)
      .setScale(4.2, 2.6)
      .setAlpha(0.08)
      .setDepth(1)
      .setVisible(false);
    this.tweens.add({ targets: this.backGlow, alpha: 0.16, duration: 1600, yoyo: true, repeat: -1, ease: "sine.inout" });

    this.caption = this.add
      .text(VIEW_W / 2, VIEW_H * 0.46, "", bodyFont(16, { color: "#eafdff", align: "center", fontStyle: "bold" }))
      .setOrigin(0.5)
      .setDepth(10)
      .setAlpha(0)
      .setVisible(false)
      .setShadow(0, 2, "#05060f", 6, true, true);

    this.hintText = this.add
      .text(VIEW_W / 2, VIEW_H - uiDim(26), "CLICK — next    ·    ESC — skip", bodyFont(11, { color: "#4a5162" }))
      .setOrigin(0.5)
      .setDepth(10)
      .setVisible(false);
    this.skipChip = this.add
      .text(VIEW_W - uiDim(18), uiDim(14), "SKIP ▸", displayFont(11, { color: "#6b7184" }))
      .setOrigin(1, 0)
      .setDepth(10)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.skipChip.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      ptr.event?.stopPropagation?.();
      if (this.phase === "text") this.finish();
    });

    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.phase === "text") this.finish();
    });
    this.input.keyboard?.on("keydown-SPACE", (e: KeyboardEvent) => {
      if (this.phase !== "text") return;
      e?.preventDefault?.();
      this.advance(true);
    });
    this.input.keyboard?.on("keydown-ENTER", (e: KeyboardEvent) => {
      if (this.phase !== "text") return;
      e?.preventDefault?.();
      this.advance(true);
    });
    this.input.on("pointerdown", (_ptr: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.phase !== "text") return;
      if (this.skipChip && over?.includes(this.skipChip)) return;
      this.advance(true);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      void this.intro?.dismiss();
    });

    // Stream intro first — on skip/end it fades, then text beats.
    this.intro = playIntroVideo({
      onComplete: () => {
        if (!this.sys.isActive()) return;
        this.beginTextPhase();
      },
      fadeMs: 700,
    });
  }

  private beginTextPhase() {
    if (this.done || this.phase === "text") return;
    this.phase = "text";
    this.cameras.main.setAlpha(1);
    this.backGlow.setVisible(true);
    this.caption.setVisible(true);
    this.hintText?.setVisible(true);
    this.skipChip?.setVisible(true);
    this.time.delayedCall(280, () => this.advance(false));
  }

  /** Show the next text beat (or finish after the last one). Manual + timed advance share this. */
  private advance(fromUser = false) {
    if (this.done || this.phase !== "text") return;
    this.holdTimer?.remove(false);
    this.holdTimer = undefined;
    this.tweens.killTweensOf(this.caption);
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
    this.caption.setStyle(style).setText(beat.text).setAlpha(fromUser ? 1 : 0);
    if (beat.glow) this.caption.setShadow(0, 0, beat.color, 18, true, true);
    else this.caption.setShadow(0, 2, "#05060f", 6, true, true);
    this.backGlow.setTint(Phaser.Display.Color.HexStringToColor(beat.color).color);

    if (!fromUser || this.caption.alpha < 1) {
      this.tweens.add({ targets: this.caption, alpha: 1, duration: fromUser ? 120 : 320 });
    }
    this.holdTimer = this.time.delayedCall(beat.holdMs, () => {
      this.tweens.add({
        targets: this.caption,
        alpha: 0,
        duration: 240,
        onComplete: () => this.advance(false),
      });
    });
  }

  private finish() {
    if (this.done) return;
    this.done = true;
    this.holdTimer?.remove();
    markSeen();
    void this.intro?.dismiss();
    this.cameras.main.fadeOut(420, 2, 2, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("Select");
    });
  }
}
