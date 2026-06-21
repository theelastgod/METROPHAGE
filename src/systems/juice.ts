import Phaser from "phaser";
import { getSettings } from "./Settings";

// METROPHAGE — central game-feel helpers. ALL screen shake + camera flash routes
// through here so the accessibility settings (shake intensity, reduce-flashing)
// apply everywhere, with no per-call-site logic. Use juiceShake / juiceFlash
// instead of cameras.main.shake / .flash.

export function juiceShake(scene: Phaser.Scene, duration: number, intensity: number) {
  const shake = getSettings().shake;
  if (shake <= 0.001) return; // motion comfort: shake disabled
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
    // Soften to a brief, dim pulse — never a strobe.
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
