import Phaser from "phaser";
import { getSettings } from "./Settings";
import type NeonPipeline from "../render/NeonPipeline";

// METROPHAGE — central game-feel helpers. ALL screen shake + camera flash routes
// through here so accessibility settings apply everywhere.

export function juiceShake(scene: Phaser.Scene, duration: number, intensity: number) {
  const shake = getSettings().shake;
  if (shake <= 0.001) return;
  scene.cameras.main.shake(duration, intensity * shake);
}

export function juiceFlash(
  scene: Phaser.Scene,
  duration: number,
  r: number,
  g: number,
  b: number,
) {
  if (getSettings().reduceFlashing) {
    scene.cameras.main.flash(
      Math.min(duration, 140),
      Math.round(r * 0.35),
      Math.round(g * 0.35),
      Math.round(b * 0.35),
    );
    return;
  }
  scene.cameras.main.flash(duration, r, g, b);
}

/** Brief time dilation on impactful hits — premium combat punch. */
export function juiceHitStop(scene: Phaser.Scene, ms = 56): void {
  if (getSettings().reduceFlashing) return;
  const prev = scene.time.timeScale;
  scene.time.timeScale = 0.06;
  scene.time.delayedCall(ms, () => {
    scene.time.timeScale = prev;
  });
}

/** Micro zoom punch toward the action. */
export function juiceZoomPunch(scene: Phaser.Scene, amount = 0.055, duration = 140): void {
  const cam = scene.cameras.main;
  const base = cam.zoom;
  scene.tweens.add({
    targets: cam,
    zoom: base * (1 + amount),
    duration: duration * 0.4,
    yoyo: true,
    ease: "Quad.out",
    onComplete: () => cam.setZoom(base),
  });
}

/** Kill fanfare: hit-stop + zoom + neon pulse in one call. */
export function juiceKill(scene: Phaser.Scene): void {
  juiceHitStop(scene, 70);
  juiceZoomPunch(scene, 0.07, 160);
  juiceNeonPulse(scene, 0.32, 220);
  juiceShake(scene, 120, 0.006);
}

/** Pulse the neon pipeline — heat spike without changing gameplay heat. */
export function juiceNeonPulse(scene: Phaser.Scene, amount = 0.22, duration = 180): void {
  if (scene.renderer.type !== Phaser.WEBGL) return;
  const p = scene.cameras.main.getPostPipeline("Neon");
  const neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline | undefined;
  if (!neon) return;
  const base = neon.heat;
  scene.tweens.add({
    targets: neon,
    heat: Math.min(1, base + amount),
    duration: duration * 0.35,
    yoyo: true,
    ease: "Sine.out",
    onComplete: () => {
      neon.heat = base;
    },
  });
}