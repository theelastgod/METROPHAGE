// METROPHAGE — one enterable venue per kind per district; wilderness trail shacks.
// Pure data — shared by client OnlineScene + server WorldDO.

import { BRIDGES, type BridgeDef } from "./bridges";
import type { PlayerLook } from "../net/protocol";

/** Enterable venue kinds — at most ONE of each appears as a door in a district.
 *  Order matters: building index K gets kind K, so appending kinds is additive (old
 *  doors keep their venues); reordering would shuffle every district's rooms.
 *  Two of the nine district buildings stay scenery so the per-district exterior
 *  kits (hf_building_dist_*) keep carrying the street's identity. */
export const DISTRICT_VENUE_KINDS = ["shop", "home", "guild", "den", "bar", "noodle", "ripperdoc"] as const;
export type DistrictVenueKind = (typeof DISTRICT_VENUE_KINDS)[number];
export const DISTRICT_VENUE_COUNT = DISTRICT_VENUE_KINDS.length;

export const DISTRICT_VENUE_TITLE: Record<DistrictVenueKind, string> = {
  shop: "MARKET STALL",
  home: "TENEMENT",
  guild: "GUILD HALL",
  den: "THE DEN",
  bar: "DIVE BAR",
  noodle: "NOODLE COUNTER",
  ripperdoc: "RIPPERDOC",
};

/**
 * Kind for district building index, or null when the footprint is scenery only
 * (no enterable door — small blocks / district-kit roofs without a second shop).
 */
export function districtBuildingKind(index: number): DistrictVenueKind | null {
  if (index < 0 || index >= DISTRICT_VENUE_COUNT) return null;
  return DISTRICT_VENUE_KINDS[index];
}

export function isDistrictEnterable(index: number): boolean {
  return districtBuildingKind(index) !== null;
}

// ── Wilderness shacks ───────────────────────────────────────────────────────

export interface WildShackOccupant {
  name: string;
  lines: string[];
  /** Optional talk-npc id for ambient systems. */
  id?: string;
  look: PlayerLook;
}

export interface WildShackDef {
  /** Design-space tile (40×30) for the shack footprint NW corner (2×2 ruin box). */
  foot: [number, number];
  /** Doorstep just south of shack (walkable open tile preferred). */
  door: [number, number];
  label: string;
  occupant: WildShackOccupant;
}

function look(partial: Partial<PlayerLook> & { color: number }): PlayerLook {
  return {
    color: partial.color,
    build: partial.build ?? "normal",
    head: partial.head ?? "none",
    visor: partial.visor ?? "none",
    shoulders: partial.shoulders ?? "none",
    decal: partial.decal ?? "none",
    cloak: partial.cloak ?? "none",
    skin: partial.skin ?? 0xc98a5e,
    sex: partial.sex ?? "m",
    hair: partial.hair ?? "short",
    hairColor: partial.hairColor ?? 0x2a1d14,
    beard: partial.beard ?? "none",
    faceMark: partial.faceMark ?? "none",
    eyeColor: partial.eyeColor ?? 0x29e7ff,
    gloves: partial.gloves ?? "none",
    legGear: partial.legGear ?? "none",
    accentColor: partial.accentColor ?? 0xff2bd6,
    antennae: partial.antennae ?? false,
    emblem: partial.emblem ?? false,
    strap: partial.strap ?? false,
  };
}

/**
 * Authored trail shacks per wilderness corridor (design coords, ×DISTRICT_SCALE in world).
 * Small structures with one occupant inside — talk only, no combat services.
 */
const SHACKS_BY_BRIDGE: WildShackDef[][] = [
  // w0 Glass Canyon
  [
    {
      foot: [16, 20],
      door: [17, 22],
      label: "SCRAP SHACK",
      occupant: {
        name: "RUST KEEPER",
        id: "wild_rust",
        lines: [
          "This box is warmer than the canyon wind. Stay if you need a minute.",
          "HSS sweeps the glass. I stay low and sell what the drones drop.",
        ],
        look: look({ color: 0x6ab0ff, head: "hood", cloak: "coat", skin: 0x7c4f30 }),
      },
    },
    {
      foot: [28, 6],
      door: [29, 8],
      label: "RELAY HUT",
      occupant: {
        name: "LINA VOX",
        id: "wild_lina",
        lines: [
          "Picked this hut when the overpass still had lights. Now I listen for Stacks traffic.",
          "You heading east? Watch the midpoint pylons — two went dark last night.",
        ],
        look: look({
          color: 0x9dff3c,
          sex: "f",
          hair: "braids",
          hairColor: 0x1b1820,
          cloak: "coat",
          skin: 0xe6b58c,
        }),
      },
    },
  ],
  // w1 Relay Cut
  [
    {
      foot: [9, 6],
      door: [10, 8],
      label: "PIPE SHACK",
      occupant: {
        name: "GASKET",
        id: "wild_gasket",
        lines: [
          "Corp convoys died on this cut. I bolt what still turns.",
          "Spire's pretty until you smell the patrols. Sit. Breathe. Then run.",
        ],
        look: look({ color: 0x9dff3c, hair: "buzz", beard: "stubble", cloak: "coat" }),
      },
    },
    {
      foot: [24, 20],
      door: [25, 22],
      label: "TOLLS BOOTH",
      occupant: {
        name: "TOLL WITCH",
        id: "wild_toll",
        lines: [
          "Old booth, new tenant. No credits due — just stories.",
          "East gate glows like a knife. West smells like solder rain.",
        ],
        look: look({ color: 0xb06bff, sex: "f", hair: "undercut", head: "beret", skin: 0xf3d2b8 }),
      },
    },
  ],
  // w2 Tidal Scrub
  [
    {
      foot: [12, 8],
      door: [13, 10],
      label: "SALT SHACK",
      occupant: {
        name: "BRINE",
        id: "wild_brine",
        lines: [
          "Flood took the lot; this hut floats on spite and barrels.",
          "Docks pay for wet work. Don't drink the canal.",
        ],
        look: look({ color: 0x29e7ff, head: "cap", cloak: "coat", skin: 0xa9794a }),
      },
    },
  ],
  // w2 already above; remaining bridges use procedural fallback from ruins
];

/** Ensure every bridge has at least one shack (procedural fallback from ruins). */
function shacksForBridge(bi: number, def: BridgeDef): WildShackDef[] {
  const authored = SHACKS_BY_BRIDGE[bi];
  if (authored?.length) return authored;
  const ruin = def.layout.ruins[0] ?? { x1: 10, y1: 10, x2: 14, y2: 14 };
  const fx = Math.min(36, Math.max(3, ruin.x1 + 1));
  const fy = Math.min(24, Math.max(3, ruin.y2 + 1));
  return [
    {
      foot: [fx, fy],
      door: [fx + 1, fy + 2],
      label: "TRAIL SHACK",
      occupant: {
        name: "WAYSIDE",
        id: `wild_wayside_${bi}`,
        lines: [
          `${def.name} chews loners. This shack is a pause button.`,
          "I don't sell gear — just warnings. Listen and leave lighter.",
        ],
        look: look({ color: def.accent, head: "hood", cloak: "cape", skin: 0x8a6040 }),
      },
    },
  ];
}

export function wildernessShacks(bridgeIndex: number): WildShackDef[] {
  if (bridgeIndex < 0 || bridgeIndex >= BRIDGES.length) return [];
  return shacksForBridge(bridgeIndex, BRIDGES[bridgeIndex]);
}

/** Zone id `w{bridge}s{shackIndex}` — small talk-only interior off a wilderness corridor. */
export function parseWildernessShack(
  zone: string | null | undefined,
): { bridge: number; index: number } | null {
  if (!zone) return null;
  const m = /^w(\d+)s(\d+)$/.exec(zone);
  if (!m) return null;
  const bridge = parseInt(m[1], 10);
  const index = parseInt(m[2], 10);
  if (bridge < 0 || bridge >= BRIDGES.length) return null;
  const list = wildernessShacks(bridge);
  if (index < 0 || index >= list.length || index > 7) return null;
  return { bridge, index };
}

export function wildernessShackZone(bridge: number, index: number): string {
  return `w${bridge}s${index}`;
}

export function wildernessShackDef(
  bridge: number,
  index: number,
): WildShackDef | null {
  return wildernessShacks(bridge)[index] ?? null;
}
