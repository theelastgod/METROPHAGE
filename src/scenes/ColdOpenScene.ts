// METROPHAGE — cold open trailer on every site load:
// Full-screen intro video (SKIP / ESC / click to skip), then fade into the title / wallet gate.
// No text cards after the video.
//
// Entirely client-side (no server). Always plays unless automation opts out
// (`?skipIntro=1` or localStorage metrophage_skip_coldopen=1).

import Phaser from "phaser";
import { COLORS } from "../config";
import { playIntroVideo, type IntroVideoHandle } from "../ui/IntroVideo";

/** Legacy key (no longer gates playback — trailer plays every reload). */
export const COLD_OPEN_SEEN_KEY = "metrophage_coldopen_v2";
/** Explicit automation bypass for trailer-rig / smoke harness. */
export const COLD_OPEN_SKIP_KEY = "metrophage_skip_coldopen";

/**
 * Whether Boot should start ColdOpen.
 * Default: **always** play on every site load. Only explicit opt-outs skip it.
 */
export function shouldPlayColdOpen(): boolean {
  try {
    const q = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
    if (q.get("skipIntro") === "1" || q.get("nocoldopen") === "1") return false;
    if (localStorage.getItem(COLD_OPEN_SKIP_KEY) === "1") return false;
  } catch {
    /* play anyway */
  }
  return true;
}

/** @deprecated use shouldPlayColdOpen — kept so older callers compile. */
export function coldOpenSeen(): boolean {
  return !shouldPlayColdOpen();
}

export default class ColdOpenScene extends Phaser.Scene {
  private done = false;
  private intro?: IntroVideoHandle;

  constructor() {
    super("ColdOpen");
  }

  create() {
    this.done = false;
    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    this.cameras.main.setAlpha(0);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      void this.intro?.dismiss();
    });

    this.intro = playIntroVideo({
      onComplete: () => {
        if (!this.sys.isActive()) return;
        this.finish();
      },
      fadeMs: 700,
    });
  }

  private finish() {
    if (this.done) return;
    this.done = true;
    void this.intro?.dismiss();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeOut(420, 2, 2, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("Select");
    });
  }
}
