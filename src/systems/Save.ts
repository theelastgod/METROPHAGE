import type { ProgressData } from "./Progression";

// METROPHAGE — local save (localStorage). Single slot. Inventory/equipped are
// placeholders here; Phase 1 Step 5 fills them.

const KEY = "metrophage_save_v1";

export interface SaveState {
  v: number;
  progress: ProgressData;
  singularity: number;
  inventory: unknown[];
  equipped: Record<string, unknown>;
}

export function loadSave(): SaveState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SaveState;
    if (!s || s.v !== 1 || !s.progress) return null;
    return s;
  } catch {
    return null;
  }
}

export function writeSave(state: SaveState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable / quota — ignore */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function hasSave(): boolean {
  return loadSave() !== null;
}
