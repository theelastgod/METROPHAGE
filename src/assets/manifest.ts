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
export const NPC_KEY = "npc";
export const AGENT_KEY = "agent";

export const NODE_KEY = "node";
export const NODE_INFECTED_KEY = "node_infected";
export const CRATE_KEY = "crate";
export const STREETLIGHT_KEY = "streetlight";
export const GLOW_KEY = "glow";
export const SPARK_KEY = "spark";

export const PORTRAIT_PLAYER_KEY = "portrait_player";
export const PORTRAIT_NPC_KEY = "portrait_npc";
export const UI_FRAME_KEY = "ui_frame";
export const UI_GUN_KEY = "ui_gun";
export const VO_MELTDOWN_KEY = "vo_meltdown";

// Top-down character sheet frame order (drop-in pack): 0=down 1=left 2=right 3=up.
const CHAR: Pick<AssetEntry, "frameWidth" | "frameHeight"> = {
  frameWidth: 32,
  frameHeight: 32,
};

export const ASSETS: Record<string, AssetEntry[]> = {
  // 256×64 image, sliced into sixteen 32×32 cells by addTilesetImage.
  tilesets: [{ key: TILESET_KEY, file: null }], // code-authored tileset (textures.ts)
  sprites: [
    { key: PLAYER_KEY, file: null, ...CHAR }, // code-authored pixel art (charart.ts)
    { key: COP_KEY, file: null, ...CHAR }, // code-authored pixel art (charart.ts)
    { key: NPC_KEY, file: null, ...CHAR }, // code-authored pixel art (charart.ts)
    { key: BULLET_KEY, file: null }, // procedural (no bullet art in pack)
    { key: AGENT_KEY, file: null }, // procedural light figure (tinted crowd)
  ],
  objects: [
    { key: NODE_KEY, file: null }, // code-authored (textures.ts)
    { key: NODE_INFECTED_KEY, file: null },
    { key: CRATE_KEY, file: null },
    { key: STREETLIGHT_KEY, file: null },
  ],
  fx: [
    { key: GLOW_KEY, file: null }, // code-authored radial glow
    { key: SPARK_KEY, file: null }, // code-authored hit star
  ],
  portraits: [
    { key: PORTRAIT_PLAYER_KEY, file: null }, // code-authored cyberian bust
    { key: PORTRAIT_NPC_KEY, file: null }, // code-authored FIXER bust (frame 0 registered)
  ],
  ui: [
    { key: UI_FRAME_KEY, file: null }, // code-authored neon terminal/screen frame
    { key: UI_GUN_KEY, file: null }, // code-authored weapon icon
  ],
  // Build-time generated VO (ElevenLabs). Optional flavour; the procedural
  // meltdown sting plays regardless. See tools/gen-vo.sh + ART_NOTES.md.
  audio: [{ key: VO_MELTDOWN_KEY, file: "assets/audio/meltdown_vo.mp3" }],
};

/** Face-by-direction frame for the top-down sheets: 0=down 1=left 2=right 3=up. */
export function faceFrame(vx: number, vy: number): number {
  if (Math.abs(vx) > Math.abs(vy)) return vx < 0 ? 1 : 2;
  return vy < 0 ? 3 : 0;
}

/** Flat list of every declared asset. */
export function allAssets(): AssetEntry[] {
  return Object.values(ASSETS).flat();
}
