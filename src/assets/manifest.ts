import { COSMETICS } from "../game/cosmetics";
import { MUSIC_TRACKS } from "../audio/musicTracks";

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
/** Per-class player sprite key (distinct silhouette per class). */
export const playerKeyFor = (id: string) => "player_" + id;
export const BULLET_KEY = "bullet";
export const COP_KEY = "cop";
export const BOSS_KEY = "boss";
export const NPC_KEY = "npc";
export const AGENT_KEY = "agent";

export const NODE_KEY = "node";
export const NODE_INFECTED_KEY = "node_infected";
export const CRATE_KEY = "crate";
export const STREETLIGHT_KEY = "streetlight";
export const GLOW_KEY = "glow";
export const SPARK_KEY = "spark";
// Real combat FX sliced from the "Comprehensive" Special-effects atlas.
export const FX_MUZZLE_KEY = "fx_muzzle";
export const FX_IMPACT_KEY = "fx_impact";
// Real loot pickups + projectiles + ICE-dive guardian (Resources character-art pack).
export const PICKUP_COIN_KEY = "pickup_coin";
export const PICKUP_CORE_KEY = "pickup_core";
export const BULLET_PLAYER_KEY = "bullet_player";
export const BULLET_ENEMY_KEY = "bullet_enemy";
export const GUARDIAN_WRAITH_KEY = "guardian_wraith";

// Real top-down street props (sliced from the CyberPunk environment pack) — scattered as
// non-colliding decals in the online districts (see OnlineScene).
export const PROP_STREETLIGHT_KEY = "prop_streetlight";
export const PROP_VENDING_KEY = "prop_vending";
export const PROP_AC_KEY = "prop_ac";
// Real top-down props sliced from the "Comprehensive" cyberpunk pack (atlas auto-slicer,
// tools/atlas-slice.mjs). Curated + downscaled to game scale in /public/assets/objects/.
export const PROP_BIN_KEY = "prop_bin";
export const PROP_HYDRANT_KEY = "prop_hydrant";
export const PROP_PLANTER_KEY = "prop_planter";
export const PROP_BARRIER_KEY = "prop_barrier";
export const PROP_TAXI_KEY = "prop_taxi";
export const PROP_CAR_KEY = "prop_car";
export const PROP_DUMPSTER_KEY = "prop_dumpster";
export const PROP_CAR_BLUE_KEY = "prop_car_blue";
export const PROP_CAR_RED_KEY = "prop_car_red";
export const PROP_CAR_GREEN_KEY = "prop_car_green";
export const PROP_PICKUP_KEY = "prop_pickup";
export const PROP_VAN_KEY = "prop_van";
// Holographic projectors (Signs & holograms atlas) — standing emitter decals for plazas.
export const HOLO_KEYS = ["holo_spiral", "holo_cube", "holo_net", "holo_emit"];
// Real isometric cyberpunk crates/containers (sliced from the asset-drop DECORATIONS
// atlas via tools/atlas-key-slice.mjs, curated + downscaled to game scale). Scattered as
// non-colliding cargo decals in the city + used for interior crate set-dressing.
export const DECO_KEYS = Array.from({ length: 14 }, (_, i) => "deco_" + String(i + 1).padStart(2, "0"));
// Real isometric tech machines (sliced from the asset-drop INTERACTIVE OBJECTS atlas) —
// used as building-interior set-dressing (rack / locker / terminal) in spawnInteriorProp.
export const OBJ_KEYS = Array.from({ length: 12 }, (_, i) => "obj_" + String(i + 1).padStart(2, "0"));

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

// Real 32×32 item icons (CraftPix). Keyed to match iconKey(klass) = "icon_" + sanitized
// klass, so they load BEFORE the procedural bake (textures.ts) and win — the inventory /
// forge / market render these instead of the generated silhouettes. Drop a file here named
// <KLASS>.png to override that klass's icon.
const ICON_NAMES = [
  "PISTOL", "REVOLVER", "SMG", "MACHINEPISTOL", "SHOTGUN", "BURSTRIFLE", "MARKSMAN", "LMG",
  "RAILGUN", "FLAK", "LAUNCHER", "ARC", "FLAME", "BLADE", "KATANA", "WEAPONMOD",
  "IMPLANT", "ARMOR", "CHIP", "MEDKIT", "SHIELD", "STIM", "HEAT",
];

export const ASSETS: Record<string, AssetEntry[]> = {
  // 256×160 image = 8×5 grid of 32px cells, 1:1 with world tiles (config.TILESET_PX MUST
  // stay = TILE — pixelArt/NEAREST minification shimmers under scroll; see config.ts). The
  // 96px master lives at metrophage_tiles@96.png and is baked down per-cell offline.
  // Index→tile contract in district.ts (canonical 0–17, variants 18–39).
  tilesets: [{ key: TILESET_KEY, file: "assets/tilesets/metrophage_tiles.png" }],
  sprites: [
    { key: PLAYER_KEY, file: null, ...CHAR }, // code-authored pixel art (charart.ts)
    // code-authored (charart.ts): the on-disk cop.png/npc.png were 460-byte day-one
    // STUBS that loaded "successfully" and blocked the real bake — every HSS unit in
    // the game rendered as a tinted pill until this line changed. file: null = bake.
    { key: COP_KEY, file: null, ...CHAR },
    { key: BOSS_KEY, file: null, ...CHAR }, // code-authored hulking sentinel
    { key: NPC_KEY, file: null, ...CHAR }, // code-authored (see COP_KEY note)
    { key: BULLET_KEY, file: null }, // procedural (fallback; real art via BULLET_PLAYER/ENEMY_KEY)
    { key: AGENT_KEY, file: null }, // procedural light figure (tinted crowd)
    // Real floating ICE-dive guardian wraith (Resources pack) — 64px frames, frame-driven.
    { key: GUARDIAN_WRAITH_KEY, file: "assets/sprites/guardian_wraith.png", frameWidth: 64, frameHeight: 64 },
  ],
  objects: [
    // Authored neon-noir infection nodes + hazard crate + streetlight (AI/pixel packs).
    { key: NODE_KEY, file: "assets/objects/node_clean.png" },
    { key: NODE_INFECTED_KEY, file: "assets/objects/node_infected.png" },
    { key: CRATE_KEY, file: "assets/objects/crate.png" },
    { key: STREETLIGHT_KEY, file: "assets/objects/streetlight.png" },
    // Real animated loot pickups (Resources pack) — 16px frames, frame-driven in-scene.
    { key: PICKUP_COIN_KEY, file: "assets/objects/pickup_coin.png", frameWidth: 16, frameHeight: 16 },
    { key: PICKUP_CORE_KEY, file: "assets/objects/pickup_core.png", frameWidth: 16, frameHeight: 16 },
  ],
  fx: [
    { key: GLOW_KEY, file: null }, // code-authored radial glow
    { key: SPARK_KEY, file: null }, // code-authored hit star
    { key: FX_MUZZLE_KEY, file: "assets/fx/fx_muzzle.png" }, // real muzzle flash (pack)
    { key: FX_IMPACT_KEY, file: "assets/fx/fx_impact.png" }, // real kill explosion (pack)
    { key: BULLET_PLAYER_KEY, file: "assets/fx/bullet_player.png" }, // real player round (pack)
    { key: BULLET_ENEMY_KEY, file: "assets/fx/bullet_enemy.png" }, // real HSS energy bolt (pack)
  ],
  portraits: [
    // Premium dialogue portraits (neon-noir runner + FIXER contact).
    { key: PORTRAIT_PLAYER_KEY, file: "assets/portraits/portrait_player.png" },
    { key: PORTRAIT_NPC_KEY, file: "assets/portraits/portrait_npc.png" },
  ],
  ui: [
    { key: UI_FRAME_KEY, file: null }, // code-authored neon terminal/screen frame
    { key: UI_GUN_KEY, file: null }, // code-authored weapon icon
  ],
  // Build-time generated VO + the per-environment music beds (ElevenLabs). The
  // beds are OPTIONAL: only those whose mp3 actually exists in src/assets/music/
  // get a `url` (resolved by import.meta.glob in musicTracks.ts) and are listed
  // here — so nothing 404s / mis-decodes, and any missing environment falls back
  // to the procedural Synth. See tools/gen-vo.sh, tools/gen-music.mjs + ART_NOTES.md.
  audio: [
    { key: VO_MELTDOWN_KEY, file: "assets/audio/meltdown_vo.mp3" },
    // Only the MENU bed ships in the boot payload; the other nine (~4.9MB) stream
    // in lazily on first entry to their environment (MusicDirector.lazyLoad — the
    // procedural Synth covers the gap). Cuts time-to-first-play sharply on phones
    // and keeps boot from gating on a big batch of audio decodes.
    ...MUSIC_TRACKS.filter((t) => t.url && t.env === "menu").map((t) => ({ key: t.key, file: t.url! })),
  ],
  // Real item icons — load before the procedural bake so they win (see ICON_NAMES above).
  icons: ICON_NAMES.map((n) => ({ key: "icon_" + n, file: "assets/icons/" + n + ".png" })),
  // Real street props (CyberPunk pack + generated neon props + CC0 city vehicles).
  props: [
    { key: PROP_STREETLIGHT_KEY, file: "assets/objects/prop_streetlight.png" },
    { key: PROP_VENDING_KEY, file: "assets/objects/prop_vending.png" },
    { key: PROP_AC_KEY, file: "assets/objects/prop_ac.png" },
    { key: PROP_BIN_KEY, file: "assets/objects/prop_bin.png" },
    { key: PROP_HYDRANT_KEY, file: "assets/objects/prop_hydrant.png" },
    { key: PROP_PLANTER_KEY, file: "assets/objects/prop_planter.png" },
    { key: PROP_BARRIER_KEY, file: "assets/objects/prop_barrier.png" },
    { key: PROP_TAXI_KEY, file: "assets/objects/prop_taxi.png" },
    { key: PROP_CAR_KEY, file: "assets/objects/prop_car.png" },
    { key: PROP_DUMPSTER_KEY, file: "assets/objects/prop_dumpster.png" },
    { key: PROP_CAR_BLUE_KEY, file: "assets/objects/prop_car_blue.png" },
    { key: PROP_CAR_RED_KEY, file: "assets/objects/prop_car_red.png" },
    { key: PROP_CAR_GREEN_KEY, file: "assets/objects/prop_car_green.png" },
    { key: PROP_PICKUP_KEY, file: "assets/objects/prop_pickup.png" },
    { key: PROP_VAN_KEY, file: "assets/objects/prop_van.png" },
    ...HOLO_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
  ],
  // Real isometric cyberpunk crates/containers — non-colliding cargo decals (asset-drop).
  decals: DECO_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
  // Real isometric tech machines — building-interior set-dressing (asset-drop).
  interior: OBJ_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
  // Real garment icons (apparel pack) for the cosmetics wardrobe — keyed "cos_<id>".
  cosIcons: COSMETICS.map((c) => ({ key: "cos_" + c.id, file: "assets/icons/cos_" + c.id + ".png" })),
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
