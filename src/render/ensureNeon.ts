import Phaser from "phaser";
import NeonPipeline from "./NeonPipeline";

/** Register the Neon post-pipeline if missing (safe to call from any scene). */
export function ensureNeonPipeline(scene: Phaser.Scene): boolean {
  if (scene.renderer.type !== Phaser.WEBGL) return false;
  const renderer = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!renderer.pipelines.getPostPipeline("Neon")) {
    renderer.pipelines.addPostPipeline("Neon", NeonPipeline);
  }
  return true;
}

/** Attach Neon to the main camera and apply menu defaults. */
export function applyMenuNeon(
  scene: Phaser.Scene,
  opts?: { heat?: number; tint?: [number, number, number]; tintAmt?: number },
): NeonPipeline | undefined {
  if (!ensureNeonPipeline(scene)) return undefined;
  const cam = scene.cameras.main;
  cam.setPostPipeline("Neon");
  const p = cam.getPostPipeline("Neon");
  const neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline | undefined;
  if (neon) {
    if (opts?.heat !== undefined) neon.heat = opts.heat;
    if (opts?.tint) neon.tint = opts.tint;
    if (opts?.tintAmt !== undefined) neon.tintAmt = opts.tintAmt;
  }
  return neon;
}