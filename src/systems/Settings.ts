// METROPHAGE — global settings (accessibility + audio). Stored in its OWN
// localStorage key, separate from the save slot, so it applies across every run.
// Pure module singleton — read with getSettings() anywhere (juice helpers, the
// neon pipeline, the synth) and write with updateSettings() from the options menu.

const KEY = "metrophage_settings_v1";

export type TutorialModePref = "quick" | "full";
export type GraphicsQuality = "auto" | "low" | "medium" | "high";
/** HUD density: new = objective + vitals only; full = every panel. */
export type UiDensity = "new" | "full";

export interface SettingsData {
  /** RuneScape-style controls: click-to-walk, right-click menu, click-to-attack. */
  rsControls: boolean;
  /** Drill yard depth — quick core loop or full system tour. */
  tutorialMode: TutorialModePref;
  /** Progressive HUD — "new" hides market/roster chrome until you open them. */
  uiDensity: UiDensity;
  /** Show first-session coach strip (local). */
  firstSessionCoach: boolean;
  /** ⚠ Photosensitivity safety: caps flashing/glitch, softens the meltdown. */
  reduceFlashing: boolean;
  /** Low-FX / device tier: thins particles + skips the costly bloom (low-end/mobile). */
  lowFx: boolean;
  /** Auto-detect or force render tier (bloom/particle budget). */
  graphicsQuality: GraphicsQuality;
  /** Measured ceiling for the "auto" tier — the quality governor lowers this when the
   *  device can't hold frame rate (and raises it back). Ignored for manual tiers. */
  autoTierCap: Exclude<GraphicsQuality, "auto">;
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
  uiDensity: "new",
  firstSessionCoach: true,
  reduceFlashing: false,
  lowFx: false,
  graphicsQuality: "auto",
  autoTierCap: "high",
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

/** GPU-based tier ceiling. The frame is fullscreen-post-FX-bound (bloom + chromatic
 *  aberration at the backing resolution), so the GPU — not cores/RAM — sets the real
 *  ceiling. Integrated GPUs choke at 2560×1440: measured ~18 FPS in the hub on an Intel
 *  Iris until this capped them to medium (1920×1080 = 4× fewer fullscreen pixels).
 *  Cached so the throwaway WebGL context is created at most once. */
let gpuCapCache: Exclude<GraphicsQuality, "auto"> | null | undefined;
function detectGpuCap(): Exclude<GraphicsQuality, "auto"> | null {
  if (gpuCapCache !== undefined) return gpuCapCache;
  gpuCapCache = null;
  if (typeof document === "undefined") return null;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return (gpuCapCache = "low"); // no WebGL at all → software / very weak
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = (ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "").toLowerCase();
    // Apple-silicon integrated GPUs are strong — leave them uncapped.
    if (/apple\s*m\d/.test(r)) return (gpuCapCache = null);
    // Intel integrated (HD/UHD/Iris) + software renderers choke on fullscreen FX.
    if (/(intel|hd graphics|uhd|iris|swiftshader|llvmpipe|software|microsoft basic)/.test(r)) return (gpuCapCache = "medium");
    return (gpuCapCache = null); // discrete/unknown → trust the core/RAM heuristic
  } catch {
    return (gpuCapCache = null);
  }
}

/** Heuristic device tier for auto graphics quality. */
export function detectDeviceTier(): Exclude<GraphicsQuality, "auto"> {
  if (typeof navigator === "undefined") return "medium";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  let tier: Exclude<GraphicsQuality, "auto"> = mobile || cores <= 4 || mem <= 4 ? "low" : cores <= 8 || mem <= 8 ? "medium" : "high";
  // the GPU ceiling wins — a 16-core box with an Intel iGPU is still a medium machine
  const gpuCap = detectGpuCap();
  if (gpuCap && TIER_ORDER.indexOf(gpuCap) < TIER_ORDER.indexOf(tier)) tier = gpuCap;
  return tier;
}

const TIER_ORDER: Exclude<GraphicsQuality, "auto">[] = ["low", "medium", "high"];

export function effectiveGraphicsQuality(): Exclude<GraphicsQuality, "auto"> {
  const q = current.graphicsQuality;
  if (q !== "auto") return q; // a manual tier is sacred — the governor never touches it
  const detected = detectDeviceTier();
  const cap = current.autoTierCap ?? "high";
  // auto = boot heuristic, CAPPED by what the frame-rate governor actually measured
  return TIER_ORDER[Math.min(TIER_ORDER.indexOf(detected), TIER_ORDER.indexOf(cap))];
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