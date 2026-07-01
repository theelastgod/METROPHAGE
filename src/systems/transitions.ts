import Phaser from "phaser";
import type NeonPipeline from "../render/NeonPipeline";

export type TransitionStyle = "fade" | "glitch" | "deploy" | "dissolve";

export interface TransitionOpts {
  style?: TransitionStyle;
  duration?: number;
  accent?: number;
  onMid?: () => void;
}

function accentRgb(accent: number) {
  return {
    r: (accent >> 16) & 0xff,
    g: (accent >> 8) & 0xff,
    b: accent & 0xff,
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
export function fadeInScene(scene: Phaser.Scene, accent = 0x04020a, duration = 480): void {
  const { r, g, b } = accentRgb(accent);
  scene.cameras.main.fadeIn(duration, r, g, b);
}