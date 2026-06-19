// METROPHAGE — logical asset registry.
//
// Real art drops into /public/assets/<category>/ and is referenced here by path.
// Any entry with `file: null` is generated procedurally at boot (see textures.ts),
// so swapping placeholder -> real art is a one-line change here with ZERO changes
// to gameplay/render code (everything keys off the logical `key`).
//
// See ART_NOTES.md for the full art pipeline + replacement instructions.

export interface AssetEntry {
  /** Stable logical key used everywhere in code. */
  key: string;
  /** Path under /public (e.g. "assets/tilesets/city.png"), or null = procedural. */
  file: string | null;
  /** For spritesheets / multi-tile images. */
  frameWidth?: number;
  frameHeight?: number;
}

export const TILESET_KEY = "tileset";
export const PLAYER_KEY = "player";
export const BULLET_KEY = "bullet";
export const COP_KEY = "cop";

export const ASSETS: Record<string, AssetEntry[]> = {
  tilesets: [{ key: TILESET_KEY, file: null }],
  sprites: [
    { key: PLAYER_KEY, file: null },
    { key: BULLET_KEY, file: null },
    { key: COP_KEY, file: null },
  ],
  portraits: [],
  ui: [],
};

/** Flat list of every declared asset. */
export function allAssets(): AssetEntry[] {
  return Object.values(ASSETS).flat();
}
