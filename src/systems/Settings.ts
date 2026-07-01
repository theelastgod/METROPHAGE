// METROPHAGE — global settings (accessibility + audio). Stored in its OWN
// localStorage key, separate from the save slot, so it applies across every run.
// Pure module singleton — read with getSettings() anywhere (juice helpers, the
// neon pipeline, the synth) and write with updateSettings() from the options menu.

const KEY = "metrophage_settings_v1";

export type TutorialModePref = "quick" | "full";
export type GraphicsQuality = "auto" | "low" | "medium" | "high";

export interface SettingsData {
  /** RuneScape-style controls: click-to-walk, right-click menu, click-to-attack. */
  rsControls: boolean;
  /** Drill yard depth — quick core loop or full system tour. */
  tutorialMode: TutorialModePref;
  /** ⚠ Photosensitivity safety: caps flashing/glitch, softens the meltdown. */
  reduceFlashing: boolean;
  /** Low-FX / device tier: thins particles + skips the costly bloom (low-end/mobile). */
  lowFx: boolean;
  /** Auto-detect or force render tier (bloom/particle budget). */
  graphicsQuality: GraphicsQuality;
  /** HUD / panel text scale multiplier. */
  uiScale: number;
  /** High-contrast HUD text + stronger panel chrome. */
  highContrast: boolean;
  /** Enable gamepad / controller input. */
  gamepadEnabled: boolean;
  shake: number; // 0..1 screen-shake intensity (0 = off)
  master: number; // 0..1
  music: number; // 0..1
  sfx: number; // 0..1
}

const DEFAULTS: SettingsData = {
  rsControls: true,
  tutorialMode: "quick",
  reduceFlashing: false,
  lowFx: false,
  graphicsQuality: "auto",
  uiScale: 1,
  highContrast: false,
  gamepadEnabled: true,
  shake: 1,
  master: 0.9,
  music: 0.8,
  sfx: 1,
};

function load(): SettingsData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SettingsData>) };
  } catch {
    return { ...DEFAULTS };
  }
}

let current: SettingsData = load();

export function getSettings(): SettingsData {
  return current;
}

export function hasSavedSettings(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function updateSettings(patch: Partial<SettingsData>): SettingsData {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable — keep in-memory */
  }
  return current;
}

/** Heuristic device tier for auto graphics quality. */
export function detectDeviceTier(): Exclude<GraphicsQuality, "auto"> {
  if (typeof navigator === "undefined") return "medium";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile || cores <= 4 || mem <= 4) return "low";
  if (cores <= 8 || mem <= 8) return "medium";
  return "high";
}

export function effectiveGraphicsQuality(): Exclude<GraphicsQuality, "auto"> {
  const q = current.graphicsQuality;
  if (q !== "auto") return q;
  return detectDeviceTier();
}

/** True when bloom should be skipped entirely. */
export function effectiveLowFx(): boolean {
  return current.lowFx || effectiveGraphicsQuality() === "low";
}

/** 0..1 bloom intensity scaler (medium = lighter bloom, high = full). */
export function bloomIntensity(): number {
  if (effectiveLowFx()) return 0;
  const tier = effectiveGraphicsQuality();
  if (tier === "medium") return 0.55;
  return 1;
}

export function uiScaleFactor(): number {
  return Math.min(1.35, Math.max(0.85, current.uiScale));
}

export const SETTINGS_DEFAULTS = DEFAULTS;