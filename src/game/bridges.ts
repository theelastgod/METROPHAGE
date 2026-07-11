// METROPHAGE — wilderness corridors between campaign districts. Runners fight through
// these open combat zones to reach the next sector until fast travel unlocks the route.

import { DISTRICT_GRID_W, DISTRICT_SCALE } from "../config";
import type { Rect } from "./districts";
import type { Weather } from "./districts";

/** Visual + terrain identity for a wilderness corridor. */
export type WildernessBiome =
  | "ruined_urban"
  | "industrial_cut"
  | "floodplain"
  | "undercity"
  | "debris_field"
  | "ash_wastes"
  | "meltdown";

/** One horizontal trail slice in 40×30 coords (scaled ×DISTRICT_SCALE by the builder). */
export interface PathSegment {
  y: number;
  x1: number;
  x2: number;
}

export interface BridgeLayout {
  biome: WildernessBiome;
  /** Collapsed structures / wreckage along the trail. */
  ruins: Rect[];
  /** Open grass clearings off the main path. */
  groves: Rect[];
  /** Toxic canals / flooded cuts (blocking). */
  hazards: Rect[];
  /** Optional scenic clearings (market slabs, neon ash, etc.). */
  clearings?: Rect[];
  /** Winding / switchback trail — preferred over pathRows when set. */
  pathSegments?: PathSegment[];
  /** Fallback: full-width horizontal rows (40×30 coords). */
  pathRows: number[];
  /** Optional north/south detour connector (e.g. overpass spur). */
  spur?: PathSegment;
}

/** Y row of the west gate on this bridge (40×30 coords). */
export function pathWestY(def: BridgeDef): number {
  const seg = def.layout.pathSegments?.[0];
  return seg?.y ?? def.layout.pathRows[0] ?? 15;
}

/** Y row of the east gate on this bridge (40×30 coords). */
export function pathEastY(def: BridgeDef): number {
  const segs = def.layout.pathSegments;
  const seg = segs?.length ? segs[segs.length - 1] : undefined;
  return seg?.y ?? def.layout.pathRows[0] ?? 15;
}

export interface BridgeDef {
  id: string;
  name: string;
  subtitle: string;
  accent: number;
  threat: number;
  weather: Weather;
  /** District index on the west side of this corridor. */
  fromDistrict: number;
  /** District index on the east side. */
  toDistrict: number;
  layout: BridgeLayout;
  /** HSS patrol posts along the trail [tileX, tileY, tier] in 40×30 coords. */
  copPosts: Array<[number, number, "patrol" | "enforcer"]>;
  /** Ambient salvage caches seeded on zone load [tileX, tileY]. */
  lootPosts: Array<[number, number]>;
  /** Trail guide NPC mid-corridor (flavour + warning). */
  guideTile: [number, number];
  guideLines: string[];
}

function bridge(
  id: string,
  name: string,
  subtitle: string,
  accent: number,
  threat: number,
  weather: Weather,
  from: number,
  layout: BridgeLayout,
  posts: BridgeDef["copPosts"],
  loot: BridgeDef["lootPosts"],
  guide: [number, number],
  lines: string[],
): BridgeDef {
  return {
    id,
    name,
    subtitle,
    accent,
    threat,
    weather,
    fromDistrict: from,
    toDistrict: from + 1,
    layout,
    copPosts: posts,
    lootPosts: loot,
    guideTile: guide,
    guideLines: lines,
  };
}

/** Seven wilderness corridors — one between each adjacent district pair. Each has a
 *  distinct biome, winding trail geometry, and patrol placement on that trail. */
export const BRIDGES: BridgeDef[] = [
  bridge(
    "w0",
    "GLASS CANYON",
    "RUINED AVENUES · DOWNTOWN → STACKS",
    0x6ab0ff,
    0,
    "rain",
    0,
    {
      biome: "ruined_urban",
      pathRows: [14],
      pathSegments: [
        { y: 13, x1: 2, x2: 12 },
        { y: 14, x1: 10, x2: 24 },
        { y: 15, x1: 22, x2: 34 },
        { y: 14, x1: 30, x2: 38 },
      ],
      clearings: [{ x1: 18, y1: 8, x2: 24, y2: 11 }],
      groves: [
        { x1: 3, y1: 5, x2: 10, y2: 11 },
        { x1: 29, y1: 19, x2: 37, y2: 25 },
      ],
      ruins: [
        { x1: 5, y1: 19, x2: 11, y2: 24 },
        { x1: 21, y1: 4, x2: 27, y2: 9 },
        { x1: 31, y1: 11, x2: 36, y2: 16 },
        { x1: 14, y1: 21, x2: 18, y2: 24 },
      ],
      hazards: [{ x1: 24, y1: 18, x2: 27, y2: 21 }],
    },
    [
      [8, 13, "patrol"],
      [14, 14, "patrol"],
      [20, 15, "patrol"],
      [26, 14, "enforcer"],
      [32, 15, "patrol"],
    ],
    [
      [10, 14],
      [18, 14],
      [28, 14],
    ],
    [20, 10],
    ["The plaza ends here. HSS drones nest in the rubble.", "Stacks smell like solder and rain."],
  ),
  bridge(
    "w1",
    "RELAY CUT",
    "FALLEN OVERPASS · STACKS → SPIRE",
    0x9dff3c,
    1,
    "smog",
    1,
    {
      biome: "industrial_cut",
      pathRows: [15],
      pathSegments: [
        { y: 15, x1: 2, x2: 14 },
        { y: 15, x1: 26, x2: 38 },
      ],
      spur: { y: 10, x1: 14, x2: 26 },
      groves: [
        { x1: 4, y1: 17, x2: 11, y2: 22 },
        { x1: 27, y1: 6, x2: 35, y2: 12 },
      ],
      ruins: [
        { x1: 7, y1: 21, x2: 13, y2: 26 },
        { x1: 17, y1: 5, x2: 22, y2: 10 },
        { x1: 29, y1: 18, x2: 34, y2: 23 },
        { x1: 15, y1: 7, x2: 19, y2: 11 },
      ],
      hazards: [
        { x1: 20, y1: 14, x2: 24, y2: 17 },
        { x1: 12, y1: 19, x2: 15, y2: 22 },
      ],
    },
    [
      [8, 15, "patrol"],
      [12, 10, "patrol"],
      [18, 15, "enforcer"],
      [22, 10, "patrol"],
      [30, 15, "patrol"],
      [35, 15, "patrol"],
    ],
    [
      [10, 15],
      [16, 10],
      [24, 15],
      [32, 15],
    ],
    [18, 10],
    ["Corp convoys died on this cut. Salvage what you can.", "The spire glows east — if you survive the patrol."],
  ),
  bridge(
    "w2",
    "TIDAL SCRUB",
    "FLOODED LOTS · SPIRE → DOCKS",
    0x29e7ff,
    2,
    "rain",
    2,
    {
      biome: "floodplain",
      pathRows: [16],
      pathSegments: [
        { y: 17, x1: 2, x2: 14 },
        { y: 16, x1: 12, x2: 26 },
        { y: 17, x1: 24, x2: 38 },
      ],
      groves: [
        { x1: 3, y1: 9, x2: 11, y2: 15 },
        { x1: 28, y1: 8, x2: 37, y2: 14 },
        { x1: 16, y1: 20, x2: 24, y2: 25 },
      ],
      ruins: [
        { x1: 6, y1: 22, x2: 12, y2: 26 },
        { x1: 19, y1: 5, x2: 24, y2: 10 },
        { x1: 32, y1: 17, x2: 36, y2: 22 },
      ],
      hazards: [
        { x1: 8, y1: 7, x2: 12, y2: 11 },
        { x1: 18, y1: 19, x2: 22, y2: 23 },
        { x1: 28, y1: 5, x2: 32, y2: 9 },
        { x1: 34, y1: 20, x2: 37, y2: 23 },
      ],
    },
    [
      [8, 17, "patrol"],
      [14, 16, "patrol"],
      [20, 16, "enforcer"],
      [26, 17, "patrol"],
      [32, 17, "patrol"],
    ],
    [
      [10, 16],
      [18, 16],
      [28, 17],
    ],
    [20, 13],
    ["Brackish water hides tripwires. Move fast.", "Docks reek of rust — almost home if you keep east."],
  ),
  bridge(
    "w3",
    "UNDERCITY VERGE",
    "COLLAPSED VIADUCT · DOCKS → UNDERCITY",
    0xb06bff,
    3,
    "ash",
    3,
    {
      biome: "undercity",
      pathRows: [15],
      pathSegments: [
        { y: 12, x1: 2, x2: 10 },
        { y: 14, x1: 8, x2: 20 },
        { y: 16, x1: 18, x2: 30 },
        { y: 18, x1: 26, x2: 38 },
      ],
      clearings: [{ x1: 22, y1: 9, x2: 28, y2: 13 }],
      groves: [
        { x1: 5, y1: 5, x2: 12, y2: 10 },
        { x1: 28, y1: 21, x2: 36, y2: 26 },
      ],
      ruins: [
        { x1: 8, y1: 20, x2: 14, y2: 25 },
        { x1: 16, y1: 7, x2: 21, y2: 12 },
        { x1: 30, y1: 10, x2: 35, y2: 15 },
      ],
      hazards: [
        { x1: 12, y1: 22, x2: 15, y2: 25 },
        { x1: 24, y1: 6, x2: 27, y2: 9 },
      ],
    },
    [
      [6, 12, "patrol"],
      [12, 14, "patrol"],
      [18, 16, "enforcer"],
      [24, 16, "patrol"],
      [30, 18, "enforcer"],
      [34, 18, "patrol"],
    ],
    [
      [10, 14],
      [18, 16],
      [28, 18],
    ],
    [16, 11],
    ["The grid thins out here. Undercity breathes below.", "Watch for wraith-class scouts in the ash."],
  ),
  bridge(
    "w4",
    "ORBITAL BRUSH",
    "DEBRIS FIELD · UNDERCITY → RELAY",
    0xff7a18,
    4,
    "smog",
    4,
    {
      biome: "debris_field",
      pathRows: [14],
      pathSegments: [
        { y: 14, x1: 2, x2: 16 },
        { y: 12, x1: 14, x2: 28 },
        { y: 15, x1: 26, x2: 38 },
      ],
      clearings: [
        { x1: 6, y1: 16, x2: 13, y2: 20 },
        { x1: 30, y1: 6, x2: 36, y2: 10 },
      ],
      groves: [
        { x1: 4, y1: 7, x2: 10, y2: 11 },
        { x1: 29, y1: 17, x2: 35, y2: 22 },
      ],
      ruins: [
        { x1: 7, y1: 21, x2: 13, y2: 25 },
        { x1: 18, y1: 5, x2: 23, y2: 9 },
        { x1: 20, y1: 18, x2: 25, y2: 22 },
        { x1: 33, y1: 12, x2: 37, y2: 16 },
      ],
      hazards: [
        { x1: 16, y1: 8, x2: 19, y2: 11 },
        { x1: 22, y1: 21, x2: 25, y2: 24 },
      ],
    },
    [
      [8, 14, "patrol"],
      [14, 12, "patrol"],
      [20, 12, "enforcer"],
      [26, 15, "patrol"],
      [32, 15, "enforcer"],
      [35, 15, "patrol"],
    ],
    [
      [10, 14],
      [18, 12],
      [28, 15],
      [33, 15],
    ],
    [20, 9],
    ["Satellite scrap rains slow here. Don't stand still.", "Relay arrays hum east — the patrols get meaner."],
  ),
  bridge(
    "w5",
    "ASH CORRIDOR",
    "BURNED OUTSKIRTS · RELAY → WASTELAND",
    0xf7a23c,
    5,
    "ash",
    5,
    {
      biome: "ash_wastes",
      pathRows: [14],
      pathSegments: [{ y: 14, x1: 2, x2: 38 }],
      groves: [
        { x1: 3, y1: 6, x2: 9, y2: 10 },
        { x1: 31, y1: 20, x2: 37, y2: 25 },
      ],
      ruins: [
        { x1: 6, y1: 19, x2: 12, y2: 24 },
        { x1: 17, y1: 6, x2: 22, y2: 11 },
        { x1: 27, y1: 9, x2: 33, y2: 14 },
        { x1: 34, y1: 19, x2: 37, y2: 23 },
      ],
      hazards: [
        { x1: 13, y1: 8, x2: 16, y2: 11 },
        { x1: 22, y1: 20, x2: 25, y2: 23 },
        { x1: 30, y1: 16, x2: 33, y2: 19 },
      ],
    },
    [
      [8, 14, "patrol"],
      [14, 14, "enforcer"],
      [20, 14, "patrol"],
      [26, 14, "patrol"],
      [30, 14, "enforcer"],
      [34, 14, "patrol"],
    ],
    [
      [10, 14],
      [18, 14],
      [26, 14],
      [32, 14],
    ],
    [20, 10],
    ["The city ends. The wastes don't forgive.", "Thermals rise off the ash — HSS purge units love it here."],
  ),
  bridge(
    "w6",
    "KERNEL APPROACH",
    "MELTDOWN VERGE · WASTELAND → KERNEL",
    0xff3b6b,
    6,
    "embers",
    6,
    {
      biome: "meltdown",
      pathRows: [12],
      pathSegments: [
        { y: 11, x1: 2, x2: 12 },
        { y: 13, x1: 10, x2: 22 },
        { y: 11, x1: 20, x2: 30 },
        { y: 13, x1: 28, x2: 38 },
      ],
      clearings: [{ x1: 14, y1: 16, x2: 22, y2: 20 }],
      groves: [
        { x1: 5, y1: 7, x2: 11, y2: 12 },
        { x1: 28, y1: 6, x2: 35, y2: 11 },
      ],
      ruins: [
        { x1: 8, y1: 21, x2: 14, y2: 25 },
        { x1: 19, y1: 5, x2: 24, y2: 10 },
        { x1: 31, y1: 17, x2: 36, y2: 22 },
        { x1: 24, y1: 21, x2: 28, y2: 25 },
      ],
      hazards: [
        { x1: 14, y1: 7, x2: 17, y2: 10 },
        { x1: 25, y1: 19, x2: 28, y2: 22 },
      ],
    },
    [
      [8, 11, "patrol"],
      [14, 13, "enforcer"],
      [20, 11, "patrol"],
      [26, 13, "enforcer"],
      [32, 11, "patrol"],
      [35, 13, "enforcer"],
    ],
    [
      [10, 13],
      [18, 11],
      [28, 13],
    ],
    [20, 9],
    ["Last stretch before the cage. The OVERMIND waits east.", "If you die here, the wastes keep your gear warm."],
  ),
];

export const BRIDGE_ZONE_IDS = BRIDGES.map((b) => b.id);

/** Map a "wN" zone string to a bridge index, or -1 if not a bridge. */
export function parseBridgeZone(z: string | null | undefined): number {
  const m = z ? /^w(\d+)$/.exec(z) : null;
  const n = m ? parseInt(m[1], 10) : -1;
  return n >= 0 && n < BRIDGES.length ? n : -1;
}

export function isBridgeZone(z: string): boolean {
  return parseBridgeZone(z) >= 0;
}

export function getBridge(index: number): BridgeDef {
  return BRIDGES[clamp(index, 0, BRIDGES.length - 1)];
}

export function bridgeForZone(z: string): BridgeDef | undefined {
  const i = parseBridgeZone(z);
  return i >= 0 ? BRIDGES[i] : undefined;
}

/** Which bridge sits between two district indices (must be adjacent). */
export function bridgeBetween(fromDi: number, toDi: number): BridgeDef | undefined {
  if (toDi === fromDi + 1) return BRIDGES[fromDi];
  if (fromDi === toDi + 1) return BRIDGES[toDi];
  return undefined;
}

/** West gate tile on a bridge (entering from the lower district). */
export function bridgeWestTile(def: BridgeDef): [number, number] {
  return [6, pathWestY(def) * DISTRICT_SCALE];
}

/** East gate tile on a bridge (entering from the higher district). */
export function bridgeEastTile(def: BridgeDef): [number, number] {
  return [DISTRICT_GRID_W - 6, pathEastY(def) * DISTRICT_SCALE];
}

/** Where a runner appears in district `di` when walking in from bridge `bridgeId`. */
export function districtEntryTile(di: number, bridgeId: string): [number, number] | undefined {
  const b = bridgeForZone(bridgeId);
  if (!b) return undefined;
  const yWest = pathWestY(b) * DISTRICT_SCALE;
  const yEast = pathEastY(b) * DISTRICT_SCALE;
  if (di === b.fromDistrict) return [Math.round(DISTRICT_GRID_W * 0.85), yWest];
  if (di === b.toDistrict) return [Math.round(DISTRICT_GRID_W * 0.15), yEast];
  return undefined;
}

/** Pick spawn tile on a bridge or district entry from the zone you travelled from. */
export function travelSpawnTile(zone: string, fromZone?: string): [number, number] | undefined {
  const bridge = bridgeForZone(zone);
  if (bridge && fromZone) {
    const fromDi = parseDistrictZone(fromZone);
    if (fromDi === bridge.fromDistrict) return bridgeWestTile(bridge);
    if (fromDi === bridge.toDistrict) return bridgeEastTile(bridge);
    const fromBridge = bridgeForZone(fromZone);
    if (fromBridge) {
      if (fromBridge.toDistrict === bridge.fromDistrict) return bridgeWestTile(bridge);
      if (fromBridge.fromDistrict === bridge.toDistrict) return bridgeEastTile(bridge);
    }
    return bridgeWestTile(bridge);
  }
  if (/^d\d+$/.test(zone) && fromZone && isBridgeZone(fromZone)) {
    const di = parseDistrictZone(zone);
    if (di >= 0) return districtEntryTile(di, fromZone);
  }
  return undefined;
}

export function parseDistrictZone(z: string): number {
  const m = /^d(\d+)$/.exec(z);
  if (!m) return -1;
  const n = parseInt(m[1], 10);
  return n >= 0 ? n : -1;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}