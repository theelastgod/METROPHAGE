import type { ProgressData } from "./Progression";
import type { InventoryData } from "./Inventory";

// METROPHAGE — local save (localStorage). Single slot.

const KEY = "metrophage_save_v1";

export interface SaveState {
  v: number;
  progress: ProgressData;
  singularity: number;
  inventory: InventoryData;
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
