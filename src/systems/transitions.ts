import Phaser from "phaser";
import type NeonPipeline from "../render/NeonPipeline";

export type TransitionStyle = "fade" | "glitch" | "deploy" | "dissolve";

export interface TransitionOpts {
  style?: TransitionStyle;
  duration?: number;
  accent?: number;
  onMid?: () => void;
}

/** Fade colour: near-black kissed with the accent. Fading through the FULL accent
 *  looked like poster paint — zone create() bakes + the server connect can hold the
 *  fade colour on screen for seconds, and a solid green/orange frame reads broken.
 *  Near-black reads as a moody loading dip while still whispering the district hue. */
function accentRgb(accent: number) {
  return {
    r: Math.round(((accent >> 16) & 0xff) * 0.14),
    g: Math.round(((accent >> 8) & 0xff) * 0.14),
    b: Math.round((accent & 0xff) * 0.14),
  };
}

function neonOf(scene: Phaser.Scene): NeonPipeline | undefined {
  if (scene.renderer.type !== Phaser.WEBGL) return undefined;
  const p = scene.cameras.main.getPostPipeline("Neon");
  return (Array.isArray(p) ? p[0] : p) as NeonPipeline | undefined;
}

/**
 * Premium scene handoff — coordinated fade + optional glitch pulse instead of raw fadeOut everywhere.
 */
export function transitionTo(
  scene: Phaser.Scene,
  target: string,
  data?: object,
  opts: TransitionOpts = {},
): void {
  const style = opts.style ?? "fade";
  const duration = opts.duration ?? (style === "deploy" ? 420 : 280);
  const accent = opts.accent ?? 0x29e7ff;
  const { r, g, b } = accentRgb(accent);
  const cam = scene.cameras.main;
  const neon = neonOf(scene);

  if (style === "glitch" || style === "deploy") {
    if (neon) {
      scene.tweens.add({ targets: neon, glitch: style === "deploy" ? 0.55 : 0.35, duration: 90, yoyo: true });
    }
  }

  cam.fadeOut(duration, r, g, b);
  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    opts.onMid?.();
    scene.scene.start(target, data);
  });
}

/** Soft entrance used in scene create(). */
export function fadeInScene(scene: Phaser.Scene, accent = 0x04020a, duration = 360): void {
  const { r, g, b } = accentRgb(accent);
  scene.cameras.main.fadeIn(duration, r, g, b);
}