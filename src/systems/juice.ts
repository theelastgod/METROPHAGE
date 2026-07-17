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

/**
 * Brief time dilation on impactful hits — premium combat punch.
 *
 * Restore uses wall-clock time (not scene.time.delayedCall). Concurrent
 * hit-stops used to stack via `prev = timeScale` while already at 0.06, then
 * restore back to 0.06 forever — which freezes delayedCalls/tweens (boss
 * intro letterbox, death cards, etc. never fade).
 */
let hitStopUntil = 0;
let hitStopTimer: ReturnType<typeof setTimeout> | null = null;

export function juiceHitStop(scene: Phaser.Scene, ms = 56): void {
  if (getSettings().reduceFlashing) return;
  const now = performance.now();
  hitStopUntil = Math.max(hitStopUntil, now + ms);
  scene.time.timeScale = 0.06;
  if (hitStopTimer != null) clearTimeout(hitStopTimer);
  const tick = () => {
    hitStopTimer = null;
    const left = hitStopUntil - performance.now();
    if (left > 0) {
      hitStopTimer = setTimeout(tick, Math.min(left, 48));
      return;
    }
    try {
      if (scene.time) scene.time.timeScale = 1;
    } catch {
      /* scene torn down */
    }
  };
  hitStopTimer = setTimeout(tick, ms);
}

/** Micro zoom punch toward the action.
 *
 *  Combat fires these constantly (kills/streaks/pickups/hits) and they overlap.
 *  Reading cam.zoom as the restore point let punch B capture punch A's
 *  punched-IN zoom as its "base" — every overlap ratcheted the camera further
 *  in, permanently ("screen zooms in too hard and won't zoom back out").
 *  The resting zoom stamped by installUiCamera is the only truth: kill any
 *  in-flight punch and always settle back to it. */
export function juiceZoomPunch(scene: Phaser.Scene, amount = 0.055, duration = 140): void {
  const cam = scene.cameras.main as Phaser.Cameras.Scene2D.Camera & { __baseZoom?: number };
  const base = cam.__baseZoom ?? cam.zoom;
  scene.tweens.killTweensOf(cam); // an overlapping punch must not ratchet the baseline
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