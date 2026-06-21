// METROPHAGE — global settings (accessibility + audio). Stored in its OWN
// localStorage key, separate from the save slot, so it applies across every run.
// Pure module singleton — read with getSettings() anywhere (juice helpers, the
// neon pipeline, the synth) and write with updateSettings() from the options menu.

const KEY = "metrophage_settings_v1";

export interface SettingsData {
  /** ⚠ Photosensitivity safety: caps flashing/glitch, softens the meltdown. */
  reduceFlashing: boolean;
  shake: number; // 0..1 screen-shake intensity (0 = off)
  master: number; // 0..1
  music: number; // 0..1
  sfx: number; // 0..1
}

const DEFAULTS: SettingsData = {
  reduceFlashing: false,
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

export function updateSettings(patch: Partial<SettingsData>): SettingsData {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable — keep in-memory */
  }
  return current;
}

export const SETTINGS_DEFAULTS = DEFAULTS;
