// METROPHAGE — adaptive quality governor.
//
// Boot-time device heuristics (cores/memory/mobile) misjudge real machines constantly:
// an old 8-core desktop reports "high" and chugs; an efficient 4-core laptop reports
// "low" and wastes headroom. This governor watches the ACTUAL frame rate and adjusts
// the "auto" tier's measured ceiling (Settings.autoTierCap):
//
//   * median FPS < 42 over the window → step the cap DOWN one tier
//   * median FPS > 57 with headroom we previously took → step it back UP
//
// Effects are two-stage: the neon post-pipeline reads bloomIntensity()/effectiveLowFx()
// EVERY frame, so bloom/chromatic-aberration relief lands instantly; the backing
// resolution + particle budgets follow on the next boot (the cap persists). Manual
// graphicsQuality choices are never touched.

import Phaser from "phaser";
import { getSettings, updateSettings, effectiveGraphicsQuality, type GraphicsQuality } from "./Settings";

const TIERS: Exclude<GraphicsQuality, "auto">[] = ["low", "medium", "high"];
const SAMPLE_MS = 1000;
const WINDOW = 8; // rolling seconds of FPS samples
const GRACE_MS = 15_000; // ignore boot/zone-load turbulence
const SHIFT_COOLDOWN_MS = 30_000; // at most one step per 30s (hysteresis)
const DOWN_FPS = 42;
const UP_FPS = 57;

function toast(text: string): void {
  try {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText =
      "position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:9999;" +
      "font:11px 'IBM Plex Mono',monospace;letter-spacing:.08em;color:#9aa3b2;" +
      "background:rgba(7,6,26,.92);border:1px solid #2a2440;border-radius:4px;" +
      "padding:7px 14px;pointer-events:none;transition:opacity .6s;opacity:1";
    document.body.appendChild(el);
    setTimeout(() => (el.style.opacity = "0"), 3200);
    setTimeout(() => el.remove(), 4000);
  } catch {
    /* headless / no DOM — measurement still applies */
  }
}

export function installQualityGovernor(game: Phaser.Game): void {
  let samples: number[] = [];
  let nextShiftAt = performance.now() + GRACE_MS;
  let stepsTakenDown = 0; // only give back headroom we took this session

  setInterval(() => {
    // hidden/unfocused windows throttle rAF — those frames say nothing about the
    // hardware, and acting on them would wrongly strip quality from a good machine
    if (typeof document !== "undefined" && (document.hidden || !document.hasFocus())) {
      samples = [];
      return;
    }
    const fps = game.loop.actualFps;
    if (!fps || !Number.isFinite(fps)) return;
    samples.push(fps);
    if (samples.length > WINDOW) samples.shift();
    if (samples.length < WINDOW || performance.now() < nextShiftAt) return;
    if (getSettings().graphicsQuality !== "auto") return;

    const median = [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    const cur = effectiveGraphicsQuality();
    const cap = getSettings().autoTierCap ?? "high";

    if (median < DOWN_FPS && cur !== "low") {
      const next = TIERS[TIERS.indexOf(cur) - 1];
      updateSettings({ autoTierCap: next });
      stepsTakenDown++;
      nextShiftAt = performance.now() + SHIFT_COOLDOWN_MS;
      samples = [];
      toast("⚙ graphics auto-tuned for smoothness");
    } else if (median > UP_FPS && stepsTakenDown > 0 && cap !== "high") {
      updateSettings({ autoTierCap: TIERS[TIERS.indexOf(cap) + 1] });
      stepsTakenDown--;
      nextShiftAt = performance.now() + SHIFT_COOLDOWN_MS;
      samples = [];
    }
  }, SAMPLE_MS);
}
