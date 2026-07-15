// METROPHAGE — per-district environment identity.
//
// Pure data (no Phaser). The world builder + OnlineScene render layer both consume
// this so every combat district reads as a distinct place: ground palette, weather,
// wash, neon bias, street clutter, hologram copy, façade infection.
//
// Keep ids aligned with DistrictDef.id in districts.ts.

import type { Weather } from "./districts";

// Tile indices mirrored from world/district.ts (kept numeric here to avoid a
// circular import: district.ts → districtEnv → district.ts).
const TILE_FLOOR = 0;
const TILE_SIDEWALK = 1;
const TILE_LANE = 2;
const TILE_PLAZA = 3;
const TILE_WALL = 4;
const TILE_GRASS = 5;
const TILE_WALL_IND = 7;
const TILE_WALL_RES = 8;
const TILE_WALL_CORP = 9;
const TILE_MARKET = 10;
const TILE_GRATE = 11;
const TILE_NEON = 13;
const TILE_DIRT = 14;
const TILE_WALL_SLUM = 15;

/** Street fixture / scatter prop categories (mapped to real texture keys in propScatter). */
export type PropBias =
  | "streetlight"
  | "vending"
  | "ac"
  | "bin"
  | "hydrant"
  | "planter"
  | "barrier"
  | "dumpster"
  | "car"
  | "industrial"
  | "neon";

export interface DistrictGroundPalette {
  /** Default walkable surface fill. */
  floor: number;
  /** Plaza / open node surface. */
  plaza: number;
  /** Road / lane markings. */
  lane: number;
  /** Occasional sidewalk / edge scatter on floor tiles (0 = none). */
  sidewalkChance: number;
  sidewalk: number;
  /** Building roof tile cycle (kind-coded blocks). */
  roofs: number[];
}

export interface DistrictEnvTheme {
  id: string;
  /** Short HUD label. */
  label: string;
  /** One-line mood for debug / coach. */
  mood: string;
  weather: Weather;
  accent: number;
  /** Full-screen colour wash over the map. */
  wash: number;
  washAlpha: number;
  /** Neon post-FX accent RGB 0..1 + bias amount. */
  tint: [number, number, number];
  tintAmt: number;
  /** Ambient neon heat baseline (on top of player heat). */
  baseHeat: number;
  wetStreets: boolean;
  /** 0..1 multiplies fog bank count / alpha. */
  fogDensity: number;
  fogTint?: number;
  /** Optional rain/ash particle tint override. */
  particleTint?: number;
  holoGlyphs: string[];
  /** Prop scatter density (0..1 probability per candidate tile). */
  propDensity: number;
  /** Weighted prop categories for this district's streets. */
  propBias: PropBias[];
  /** Wall-adjacent fixture cycle (street furniture along buildings). */
  fixtureMix: PropBias[];
  ground: DistrictGroundPalette;
  /** Prefer contagion-damaged HF façades. */
  infectedFacades: boolean;
  /** How many holograms to seed on rooftops. */
  holoCount: number;
}

const rgb = (hex: number): [number, number, number] => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];

/** Theme table — one entry per campaign district. */
export const DISTRICT_ENV: Record<string, DistrictEnvTheme> = {
  // ── Palantir Plaza — neon nightlife, wet magenta rain ─────────────────────
  downtown: {
    id: "downtown",
    label: "NEON CORE",
    mood: "wet neon nightlife · predictive grid",
    weather: "rain",
    accent: 0xff2bd6,
    wash: 0xff2bd6,
    washAlpha: 0.07,
    tint: rgb(0xff2bd6),
    tintAmt: 0.16,
    baseHeat: 0.12,
    wetStreets: true,
    fogDensity: 0.55,
    particleTint: 0xb8e0ff,
    holoGlyphs: ["PALANTIR", "監視", "0xSEC", "PREDICT", "SEC//", "未来"],
    propDensity: 0.01,
    propBias: ["streetlight", "vending", "neon", "planter", "hydrant", "car", "bin"],
    fixtureMix: ["streetlight", "vending", "planter", "streetlight"],
    ground: {
      floor: TILE_FLOOR,
      plaza: TILE_NEON,
      lane: TILE_LANE,
      sidewalkChance: 0.18,
      sidewalk: TILE_SIDEWALK,
      roofs: [TILE_WALL, TILE_WALL_CORP, TILE_WALL_RES, TILE_WALL, TILE_WALL_SLUM],
    },
    infectedFacades: false,
    holoCount: 4,
  },

  // ── Anduril Yards — drone foundry, yellow smog, industrial grates ──────────
  stacks: {
    id: "stacks",
    label: "THE WORKS",
    mood: "foundry smog · autonomous drones",
    weather: "smog",
    accent: 0xf7ff3c,
    wash: 0x5a5a18,
    washAlpha: 0.12,
    tint: rgb(0xf7ff3c),
    tintAmt: 0.14,
    baseHeat: 0.08,
    wetStreets: false,
    fogDensity: 1.15,
    fogTint: 0xa0a060,
    particleTint: 0xc8c870,
    holoGlyphs: ["ANDURIL", "DRONE", "YARD-7", "⚠ LOAD", "FORGE", "AUTO//"],
    propDensity: 0.012,
    propBias: ["dumpster", "barrier", "ac", "bin", "industrial", "streetlight", "car"],
    fixtureMix: ["dumpster", "barrier", "ac", "bin"],
    ground: {
      floor: TILE_GRATE,
      plaza: TILE_MARKET,
      lane: TILE_LANE,
      sidewalkChance: 0.1,
      sidewalk: TILE_DIRT,
      roofs: [TILE_WALL_IND, TILE_WALL_IND, TILE_WALL, TILE_WALL_SLUM, TILE_WALL_IND],
    },
    infectedFacades: false,
    holoCount: 3,
  },

  // ── Argus Spire — sterile corporate, cyan glass, open plaza ────────────────
  spire: {
    id: "spire",
    label: "CORP ROW",
    mood: "total awareness · glass towers",
    weather: "rain",
    accent: 0x00e5ff,
    wash: 0x1a4a7a,
    washAlpha: 0.1,
    tint: rgb(0x00e5ff),
    tintAmt: 0.18,
    baseHeat: 0.1,
    wetStreets: true,
    fogDensity: 0.45,
    particleTint: 0x9fe8ff,
    holoGlyphs: ["ARGUS", "SEE-ALL", "株式", "UPLINK", "TIER-A", "CLEAR"],
    propDensity: 0.007,
    propBias: ["planter", "streetlight", "vending", "neon", "hydrant", "car"],
    fixtureMix: ["planter", "streetlight", "vending", "planter"],
    ground: {
      floor: TILE_SIDEWALK,
      plaza: TILE_PLAZA,
      lane: TILE_LANE,
      sidewalkChance: 0.05,
      sidewalk: TILE_FLOOR,
      roofs: [TILE_WALL_CORP, TILE_WALL_CORP, TILE_WALL, TILE_WALL_CORP, TILE_WALL_RES],
    },
    infectedFacades: false,
    holoCount: 5,
  },

  // ── Tidal Yards — wet freight, teal rain, container stacks ─────────────────
  docks: {
    id: "docks",
    label: "TIDAL YARDS",
    mood: "blackwater freight · wet piers",
    weather: "rain",
    accent: 0x29e7ff,
    wash: 0x0a3a4a,
    washAlpha: 0.14,
    tint: rgb(0x29e7ff),
    tintAmt: 0.15,
    baseHeat: 0.06,
    wetStreets: true,
    fogDensity: 0.85,
    fogTint: 0x4a8090,
    particleTint: 0x7ec8d8,
    holoGlyphs: ["BERTH", "CARGO", "FLOOD", "12-D", "BLACKWATER", "PIER//"],
    propDensity: 0.011,
    propBias: ["dumpster", "barrier", "bin", "industrial", "streetlight", "car", "hydrant"],
    fixtureMix: ["dumpster", "barrier", "bin", "streetlight"],
    ground: {
      floor: TILE_DIRT,
      plaza: TILE_MARKET,
      lane: TILE_LANE,
      sidewalkChance: 0.2,
      sidewalk: TILE_GRATE,
      roofs: [TILE_WALL_IND, TILE_WALL_SLUM, TILE_WALL_IND, TILE_WALL, TILE_WALL_IND],
    },
    infectedFacades: false,
    holoCount: 3,
  },

  // ── Undercity — buried vaults, purple ash, contagion scars ─────────────────
  undercity: {
    id: "undercity",
    label: "THE UNDERCITY",
    mood: "buried metro · contagion haze",
    weather: "ash",
    accent: 0xb06bff,
    wash: 0x2a1040,
    washAlpha: 0.16,
    tint: rgb(0xb06bff),
    tintAmt: 0.2,
    baseHeat: 0.14,
    wetStreets: false,
    fogDensity: 1.0,
    fogTint: 0x7040a0,
    particleTint: 0xc8b0e8,
    holoGlyphs: ["VAULT", "BURIED", "19-U", "感染", "DOWN", "METRO//"],
    propDensity: 0.01,
    propBias: ["dumpster", "bin", "barrier", "ac", "industrial", "neon", "streetlight"],
    fixtureMix: ["dumpster", "ac", "bin", "barrier"],
    ground: {
      floor: TILE_DIRT,
      plaza: TILE_NEON,
      lane: TILE_GRATE,
      sidewalkChance: 0.12,
      sidewalk: TILE_FLOOR,
      roofs: [TILE_WALL_SLUM, TILE_WALL_CORP, TILE_WALL_SLUM, TILE_WALL, TILE_WALL_IND],
    },
    infectedFacades: true,
    holoCount: 3,
  },

  // ── Orbital Relay — cold uplink spires, thin blue smog ─────────────────────
  relay: {
    id: "relay",
    label: "SKYLINK",
    mood: "orbital brush · open sky array",
    weather: "smog",
    accent: 0x6b9bff,
    wash: 0x1a2858,
    washAlpha: 0.13,
    tint: rgb(0x6b9bff),
    tintAmt: 0.17,
    baseHeat: 0.11,
    wetStreets: false,
    fogDensity: 0.9,
    fogTint: 0x7088c0,
    particleTint: 0xa8b8e0,
    holoGlyphs: ["RELAY", "SKY//", "UPLINK", "ORB-6", "BEACON", "ARRAY"],
    propDensity: 0.006,
    propBias: ["streetlight", "planter", "neon", "barrier", "ac", "vending"],
    fixtureMix: ["streetlight", "planter", "neon", "ac"],
    ground: {
      floor: TILE_FLOOR,
      plaza: TILE_PLAZA,
      lane: TILE_SIDEWALK,
      sidewalkChance: 0.08,
      sidewalk: TILE_GRATE,
      roofs: [TILE_WALL_CORP, TILE_WALL_IND, TILE_WALL_CORP, TILE_WALL, TILE_WALL_CORP],
    },
    infectedFacades: false,
    holoCount: 4,
  },

  // ── Wasteland — outer salvage, dry ash, scrap ──────────────────────────────
  wastes: {
    id: "wastes",
    label: "OUTER RING",
    mood: "salvage wastes · dry ash wind",
    weather: "ash",
    accent: 0xffb13c,
    wash: 0x4a2a10,
    washAlpha: 0.12,
    tint: rgb(0xffb13c),
    tintAmt: 0.14,
    baseHeat: 0.07,
    wetStreets: false,
    fogDensity: 0.7,
    fogTint: 0xb08050,
    particleTint: 0xd0b090,
    holoGlyphs: ["SCRAP", "31-W", "SALVAGE", "DEAD//", "RING", "⚠ HOT"],
    propDensity: 0.009,
    propBias: ["barrier", "dumpster", "car", "bin", "industrial", "ac", "streetlight"],
    fixtureMix: ["barrier", "dumpster", "car", "bin"],
    ground: {
      floor: TILE_DIRT,
      plaza: TILE_MARKET,
      lane: TILE_DIRT,
      sidewalkChance: 0.15,
      sidewalk: TILE_GRASS,
      roofs: [TILE_WALL_SLUM, TILE_WALL_IND, TILE_WALL_SLUM, TILE_WALL, TILE_WALL_SLUM],
    },
    infectedFacades: true,
    holoCount: 2,
  },

  // ── The Kernel — Helios spine, embers, crimson cage ────────────────────────
  core: {
    id: "core",
    label: "THE CAGE",
    mood: "helios master grid · meltdown heat",
    weather: "embers",
    accent: 0xff3b6b,
    wash: 0x4a1020,
    washAlpha: 0.15,
    tint: rgb(0xff3b6b),
    tintAmt: 0.22,
    baseHeat: 0.22,
    wetStreets: false,
    fogDensity: 0.95,
    fogTint: 0xff5a40,
    particleTint: 0xff7a3c,
    holoGlyphs: ["HELIOS", "KERNEL", "CAGE", "0xFF", "MASTER", "END//"],
    propDensity: 0.008,
    propBias: ["streetlight", "barrier", "neon", "vending", "dumpster", "industrial"],
    fixtureMix: ["streetlight", "barrier", "neon", "vending"],
    ground: {
      floor: TILE_NEON,
      plaza: TILE_PLAZA,
      lane: TILE_LANE,
      sidewalkChance: 0.1,
      sidewalk: TILE_FLOOR,
      roofs: [TILE_WALL, TILE_WALL_CORP, TILE_WALL, TILE_WALL_IND, TILE_WALL],
    },
    infectedFacades: true,
    holoCount: 5,
  },
};

/** Safe lookup — falls back to downtown neon if an unknown id slips through. */
export function envForDistrict(id: string | undefined | null): DistrictEnvTheme {
  if (id && DISTRICT_ENV[id]) return DISTRICT_ENV[id];
  return DISTRICT_ENV.downtown;
}

/** Hex accent → RGB 0..1 for neon pipeline (shared helper). */
export function accentToTint(accent: number): [number, number, number] {
  return rgb(accent);
}
