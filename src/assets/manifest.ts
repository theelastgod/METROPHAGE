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
export const NODE_KEY = "node";
export const NPC_KEY = "npc";
export const AGENT_KEY = "agent";

export const PORTRAIT_PLAYER_KEY = "portrait_player";
export const PORTRAIT_NPC_KEY = "portrait_npc";
export const UI_FRAME_KEY = "ui_frame";
export const UI_GUN_KEY = "ui_gun";
export const VO_MELTDOWN_KEY = "vo_meltdown";

export const ASSETS: Record<string, AssetEntry[]> = {
  tilesets: [{ key: TILESET_KEY, file: null }],
  sprites: [
    { key: PLAYER_KEY, file: null },
    { key: BULLET_KEY, file: null },
    { key: COP_KEY, file: null },
    { key: NODE_KEY, file: null },
    { key: NPC_KEY, file: null },
    { key: AGENT_KEY, file: null },
  ],
  portraits: [
    { key: PORTRAIT_PLAYER_KEY, file: null },
    // Real (side-on) art used for a portrait, per the art-direction decision.
    {
      key: PORTRAIT_NPC_KEY,
      file: "assets/portraits/striker_idle.png",
      frameWidth: 96,
      frameHeight: 96,
    },
  ],
  ui: [
    { key: UI_FRAME_KEY, file: "assets/ui/skill_frame.png" },
    { key: UI_GUN_KEY, file: "assets/ui/gun_01.png" },
  ],
  // Build-time generated VO (ElevenLabs). Optional flavour; the procedural
  // meltdown sting plays regardless. See tools/gen-vo.sh + ART_NOTES.md.
  audio: [{ key: VO_MELTDOWN_KEY, file: "assets/audio/meltdown_vo.mp3" }],
};

/** Flat list of every declared asset. */
export function allAssets(): AssetEntry[] {
  return Object.values(ASSETS).flat();
}
