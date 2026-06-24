// METROPHAGE — the CITY as data. A campaign is an ordered list of districts; the
// world builder (world/district.ts) renders a DistrictDef into a tile grid, and
// GameScene runs one district at a time, advancing on extraction.
//
// Pure data — no Phaser imports — so the sim/AI can reason about the city without
// touching draw code. Layouts are authored rect sets (deterministic, curated) over
// a 40×30 grid; the builder draws an outer wall ring and carves node/spawn safe.

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Authored geometry for one district (interior; the builder adds the wall ring). */
export interface DistrictLayout {
  buildings: Rect[];
  plaza?: Rect; // open, visually distinct, walkable
  laneRows: number[]; // horizontal lane markings (over floor only)
  laneCols: number[]; // vertical lane markings
}

export interface EnemyWeights {
  patrol: number;
  enforcer: number;
  purge: number;
}

/** Ambient weather for a district — drives the render-side Atmosphere (rain streaks,
 *  drifting industrial smog, falling ash, rising meltdown embers). Kept here (data,
 *  Phaser-free) so the world model owns the mood; render/Atmosphere.ts consumes it. */
export type Weather = "rain" | "ash" | "embers" | "smog";

/**
 * A territory node in a district's infection graph. `links` are indices into the
 * district's `nodes` array (undirected adjacency) — contagion spreads along them.
 * Node 0 is the "core": in boss districts the guardian locks it until it falls.
 */
export interface NodeDef {
  tile: [number, number];
  links: number[];
}

export interface DistrictDef {
  id: string;
  name: string;
  subtitle: string;
  accent: number; // neon accent (Phaser 0xRRGGBB) — tints décor + post-FX bias
  accentHex: string;
  /** Threat rung (0+). Scales enemy stats + spawn pressure (consumed from Step 4). */
  threat: number;
  /** City-contagion % this district is worth when cleared (sums to the meta meter). */
  contagion: number;
  enemyWeights: EnemyWeights;
  layout: DistrictLayout;
  /** Player start, in tile coords (carved walkable by the builder). */
  spawnTile: [number, number];
  /** ICE-dive entrance, in tile coords (carved walkable). One per district. */
  diveTile: [number, number];
  /** Contract board + FIXER shop terminals, in tile coords (carved walkable). */
  boardTile: [number, number];
  shopTile: [number, number];
  /** Infection graph — node 0 is the core (boss-guarded where a boss exists). */
  nodes: NodeDef[];
  /** Hand-placed garrison posts: [tileX, tileY, tier]. */
  copPosts: Array<[number, number, "patrol" | "enforcer"]>;
  /** Boss archetype guarding the node (added in later steps; undefined = none yet). */
  bossId?: string;
  /** The HSS core — clearing it ends the cycle (meltdown victory). */
  isFinal?: boolean;
  /** Ambient weather (default "rain"). Sets the Atmosphere mood per district. */
  weather?: Weather;
}

// ── District 1 — DOWNTOWN / NEON PLAZA ──────────────────────────────────────
// The original Phase 0/1 map, preserved exactly so the opening plays identically.
const DOWNTOWN: DistrictDef = {
  id: "downtown",
  name: "NEON PLAZA",
  subtitle: "DOWNTOWN · SECTOR 0",
  accent: 0xff2bd6,
  accentHex: "#ff2bd6",
  threat: 0,
  contagion: 22,
  weather: "rain",
  enemyWeights: { patrol: 1, enforcer: 0, purge: 0 },
  layout: {
    buildings: [
      { x1: 3, y1: 3, x2: 10, y2: 8 },
      { x1: 16, y1: 3, x2: 24, y2: 8 },
      { x1: 29, y1: 3, x2: 36, y2: 9 },
      { x1: 3, y1: 12, x2: 9, y2: 18 },
      { x1: 30, y1: 13, x2: 36, y2: 20 },
      { x1: 3, y1: 22, x2: 12, y2: 26 },
      { x1: 27, y1: 23, x2: 36, y2: 26 },
      { x1: 16, y1: 22, x2: 23, y2: 26 },
    ],
    plaza: { x1: 15, y1: 12, x2: 24, y2: 19 },
    laneRows: [10],
    laneCols: [13],
  },
  spawnTile: [19, 15],
  diveTile: [16, 15],
  boardTile: [23, 13],
  shopTile: [16, 18],
  nodes: [
    { tile: [13, 24], links: [1] },
    { tile: [22, 17], links: [0, 2] },
    { tile: [27, 11], links: [1] },
  ],
  copPosts: [
    [13, 5, "patrol"],
    [27, 6, "patrol"],
    [34, 11, "enforcer"],
    [27, 16, "patrol"],
    [8, 16, "patrol"],
  ],
};

// ── District 2 — THE STACKS ─────────────────────────────────────────────────
// Industrial warehouse rows: tight blocks, long lanes, an open yard at the node.
const STACKS: DistrictDef = {
  id: "stacks",
  name: "THE STACKS",
  subtitle: "FREIGHT DISTRICT · SECTOR 7",
  accent: 0xf7ff3c,
  accentHex: "#f7ff3c",
  threat: 1,
  contagion: 24,
  weather: "smog",
  bossId: "sentinel",
  enemyWeights: { patrol: 0.7, enforcer: 0.3, purge: 0 },
  layout: {
    buildings: [
      { x1: 3, y1: 3, x2: 9, y2: 7 },
      { x1: 12, y1: 3, x2: 18, y2: 7 },
      { x1: 21, y1: 3, x2: 27, y2: 7 },
      { x1: 30, y1: 3, x2: 36, y2: 7 },
      { x1: 3, y1: 11, x2: 9, y2: 15 },
      { x1: 12, y1: 11, x2: 18, y2: 15 },
      { x1: 30, y1: 11, x2: 36, y2: 15 },
      { x1: 3, y1: 19, x2: 9, y2: 24 },
      { x1: 12, y1: 19, x2: 18, y2: 24 },
      { x1: 21, y1: 19, x2: 27, y2: 24 },
      { x1: 30, y1: 19, x2: 36, y2: 24 },
    ],
    plaza: { x1: 21, y1: 10, x2: 28, y2: 16 },
    laneRows: [9, 17],
    laneCols: [19, 28],
  },
  spawnTile: [19, 27],
  diveTile: [22, 27],
  boardTile: [26, 11],
  shopTile: [23, 15],
  nodes: [
    { tile: [24, 13], links: [1, 2] }, // core — Sentinel guards it
    { tile: [6, 21], links: [0] },
    { tile: [33, 21], links: [0] },
  ],
  copPosts: [
    [6, 9, "patrol"],
    [15, 9, "enforcer"],
    [33, 9, "patrol"],
    [6, 17, "patrol"],
    [24, 27, "patrol"],
    [33, 17, "enforcer"],
  ],
};

// ── District 3 — THE SPIRE ──────────────────────────────────────────────────
// Corporate towers ringing a vast central plaza — open sightlines, heavy garrison.
const SPIRE: DistrictDef = {
  id: "spire",
  name: "THE SPIRE",
  subtitle: "CORPORATE TIER · UPLINK",
  accent: 0x00e5ff,
  accentHex: "#00e5ff",
  threat: 2,
  contagion: 26,
  weather: "rain",
  bossId: "sentinel",
  enemyWeights: { patrol: 0.5, enforcer: 0.35, purge: 0.15 },
  layout: {
    buildings: [
      { x1: 4, y1: 4, x2: 11, y2: 10 },
      { x1: 28, y1: 4, x2: 35, y2: 10 },
      { x1: 4, y1: 19, x2: 11, y2: 25 },
      { x1: 28, y1: 19, x2: 35, y2: 25 },
      { x1: 18, y1: 3, x2: 21, y2: 6 },
      { x1: 18, y1: 23, x2: 21, y2: 26 },
    ],
    plaza: { x1: 14, y1: 9, x2: 25, y2: 20 },
    laneRows: [14],
    laneCols: [13, 26],
  },
  spawnTile: [19, 25],
  diveTile: [16, 25],
  boardTile: [16, 18],
  shopTile: [23, 18],
  nodes: [
    { tile: [19, 14], links: [1, 2] }, // core — Sentinel guards it
    { tile: [13, 14], links: [0] },
    { tile: [26, 14], links: [0] },
  ],
  copPosts: [
    [7, 7, "enforcer"],
    [31, 7, "enforcer"],
    [7, 22, "patrol"],
    [31, 22, "patrol"],
    [19, 6, "patrol"],
    [13, 14, "patrol"],
    [26, 14, "patrol"],
  ],
};

// ── District 4 — HSS CORE ───────────────────────────────────────────────────
// The Human Security System's spine. A fortress chamber: thick structures funnel
// into a central arena. Final district — taking its node melts the city down.
const CORE: DistrictDef = {
  id: "core",
  name: "HSS CORE",
  subtitle: "HUMAN SECURITY SYSTEM · SPINE",
  accent: 0xff3b6b,
  accentHex: "#ff3b6b",
  threat: 3,
  contagion: 28,
  weather: "embers",
  isFinal: true,
  bossId: "overmind",
  enemyWeights: { patrol: 0.34, enforcer: 0.4, purge: 0.26 },
  layout: {
    buildings: [
      { x1: 3, y1: 3, x2: 14, y2: 7 },
      { x1: 25, y1: 3, x2: 36, y2: 7 },
      { x1: 3, y1: 22, x2: 14, y2: 26 },
      { x1: 25, y1: 22, x2: 36, y2: 26 },
      { x1: 3, y1: 11, x2: 7, y2: 18 },
      { x1: 32, y1: 11, x2: 36, y2: 18 },
      { x1: 18, y1: 10, x2: 21, y2: 11 },
      { x1: 18, y1: 18, x2: 21, y2: 19 },
    ],
    plaza: { x1: 12, y1: 10, x2: 27, y2: 19 },
    laneRows: [14],
    laneCols: [19],
  },
  spawnTile: [19, 25],
  diveTile: [22, 25],
  boardTile: [14, 17],
  shopTile: [25, 17],
  nodes: [
    { tile: [19, 14], links: [1, 2] }, // core — the OVERMIND guards it
    { tile: [13, 13], links: [0] },
    { tile: [25, 13], links: [0] },
  ],
  copPosts: [
    [10, 9, "enforcer"],
    [29, 9, "enforcer"],
    [10, 20, "patrol"],
    [29, 20, "patrol"],
    [13, 14, "enforcer"],
    [26, 14, "enforcer"],
  ],
};

/** The campaign, in order. Index 0 plays first; the final district ends the cycle. */
export const DISTRICTS: DistrictDef[] = [DOWNTOWN, STACKS, SPIRE, CORE];

export function getDistrict(index: number): DistrictDef {
  return DISTRICTS[clamp(index, 0, DISTRICTS.length - 1)];
}

/** Total contagion available across the city (cap for the meta meter). */
export function totalContagion(): number {
  return DISTRICTS.reduce((s, d) => s + d.contagion, 0);
}

// Kept Phaser-free on purpose: data modules must not import the renderer, so the
// world model stays portable to the sim/AI layers.
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
