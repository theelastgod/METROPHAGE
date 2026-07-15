import { DISTRICT_GRID_H, DISTRICT_GRID_W } from "../../config";
import type { PlayerLook } from "../../net/protocol";
import type { TutorialKind } from "../../net/tutorial";
import { ONLINE_CITY } from "../../world/city";
import type { TileGrid } from "../../world/district";

export type ZoneNpc =
  | { kind: "service"; svc: string; name: string; x: number; y: number }
  | { kind: "talk"; npcId?: string; name: string; lines?: string[]; lineIdx?: number; x: number; y: number }
  | { kind: "door"; dest: string; name: string; x: number; y: number }
  | { kind: "transit"; dest: string; name: string; label: string; color: number; x: number; y: number }
  | {
      kind: "instructor";
      lessonKind: TutorialKind;
      name: string;
      tag: string;
      lines: string[];
      lineIdx: number;
      x: number;
      y: number;
      color: number;
    };

/** Baked human look for a plaza operative (colour in the jacket, not a scene tint). */
export function hubLook(p: Partial<PlayerLook>): PlayerLook {
  return {
    color: 0x00e5ff,
    build: "normal",
    head: "cap",
    visor: "band",
    shoulders: "none",
    decal: "none",
    cloak: "none",
    skin: 0xc98a5e,
    sex: "m",
    hair: "short",
    hairColor: 0x4a2f1c,
    beard: "none",
    faceMark: "none",
    eyeColor: 0x1a1020,
    gloves: "none",
    legGear: "none",
    accentColor: 0xff2bd6,
    antennae: false,
    emblem: false,
    strap: false,
    ...p,
  };
}

/** Hub tile relative to the procedural city centre — survives CITY_SCALE changes. */
export const [HUB_CX, HUB_CY] = ONLINE_CITY.spawn;
export const hubT = (dx: number, dy: number): [number, number] => [HUB_CX + dx, HUB_CY + dy];

/** District / bridge edge gates scale with the combat grid. */
export function districtEdgeTiles(grid: TileGrid): { east: [number, number]; west: [number, number] } {
  const gw = grid[0]?.length ?? DISTRICT_GRID_W;
  const gh = grid.length ?? DISTRICT_GRID_H;
  const midY = Math.floor(gh / 2);
  return { east: [gw - 8, midY], west: [8, midY] };
}

/** Operatives on the shared city plaza — anchored to the central plaza. */
export const CITY_HUB_NPCS: {
  svc: string;
  name: string;
  tag: string;
  color: number;
  tile: [number, number];
  look: PlayerLook;
}[] = [
  {
    svc: "forge",
    name: "ARMORER",
    tag: "FORGE",
    color: 0xff2bd6,
    tile: hubT(-8, -2),
    look: hubLook({ color: 0xff2bd6, sex: "f", skin: 0xe6b58c, hair: "undercut", hairColor: 0x1b1820, gloves: "wraps", cloak: "coat", accentColor: 0x00e5ff }),
  },
  {
    svc: "board",
    name: "ARCHIVIST",
    tag: "DOSSIER",
    color: 0x00e5ff,
    tile: hubT(8, -2),
    look: hubLook({ color: 0x00e5ff, head: "beret", sex: "f", skin: 0xa9794a, hair: "bun", hairColor: 0x1b1820, cloak: "coat" }),
  },
  {
    svc: "vendor",
    name: "QUARTERMASTER",
    tag: "VENDOR",
    color: 0xf7ff3c,
    tile: hubT(8, 4),
    look: hubLook({ color: 0xf7ff3c, skin: 0xc98a5e, hair: "buzz", beard: "stubble", strap: true, cloak: "coat" }),
  },
  {
    svc: "contracts",
    name: "THE FIXER",
    tag: "THE WAKE", // campaign jobs — not the daily contracts board (J)
    color: 0x39ff88,
    tile: hubT(8, 10),
    look: hubLook({ color: 0x39ff88, head: "hood", skin: 0x4f3220, hair: "long", hairColor: 0xc7cdd8, cloak: "coat" }),
  },
  {
    svc: "cosmetics",
    name: "THE TAILOR",
    tag: "WARDROBE",
    color: 0xff79c6,
    tile: hubT(-8, 10),
    look: hubLook({ color: 0xff79c6, head: "beret", sex: "f", skin: 0xf3d2b8, hair: "bun", hairColor: 0xff5fb0, accentColor: 0x00e5ff }),
  },
  {
    svc: "market",
    name: "THE BROKER",
    tag: "WORLD MARKET",
    color: 0xff2bd6,
    tile: hubT(-8, 4),
    look: hubLook({ color: 0xff2bd6, head: "hood", skin: 0x7c4f30, hair: "braids", hairColor: 0x1b1820, cloak: "coat" }),
  },
  {
    svc: "guild",
    name: "ORGANIZER",
    tag: "CELL",
    color: 0x6b9bff,
    tile: hubT(0, 14),
    look: hubLook({ color: 0x6b9bff, skin: 0xf3d2b8, hair: "short", hairColor: 0x4a2f1c, cloak: "coat" }),
  },
];

/** Ambient regulars who linger in the city hub. */
export const CITY_HUB_CITIZENS: { id: string; tile: [number, number] }[] = [
  { id: "rin", tile: hubT(-5, 2) },
  { id: "doc", tile: hubT(5, 2) },
  { id: "vex", tile: hubT(-5, -3) },
  { id: "marek", tile: hubT(5, -3) },
  { id: "amb_tech", tile: hubT(9, 2) },
];

/** Titles shown atop each interior zone. */
export const INTERIOR_TITLES: Record<string, string> = {
  safe: "▣ METRO CITY",
  clinic: "✚ THE CLINIC",
  bar: "▦ THE FERAL CAT",
  den: "◈ THE DEN",
  shop: "▣ MARKET STALL",
  vault: "◆ THE PROVING — WEEKLY VAULT",
};

// One of each enterable kind per district — no cycling / no second shop.
export {
  DISTRICT_VENUE_KINDS as DISTRICT_BUILDING_KINDS,
  DISTRICT_VENUE_COUNT,
  DISTRICT_VENUE_TITLE,
  districtBuildingKind,
  isDistrictEnterable,
} from "../../game/districtVenues";

/** Per-building district interior — zone id `d{district}i{buildingIndex}`.
 *  Only enterable venue indices (one of each kind) are accepted. */
export const parseBuildingInterior = (zone: string): { district: number; index: number } | null => {
  const match = /^d(\d+)i(\d+)$/.exec(zone);
  if (!match) return null;
  const district = parseInt(match[1], 10);
  const index = parseInt(match[2], 10);
  // Lazy import avoided — count is fixed (5 unique venue kinds).
  if (index < 0 || index >= 5) return null;
  if (district < 0 || district >= 32) return null;
  return { district, index };
};

/** Hub building interior — zone id `h{buildingIndex}`. */
export const parseHubInterior = (zone: string): number | null => {
  const match = /^h(\d+)$/.exec(zone);
  if (!match) return null;
  const index = parseInt(match[1], 10);
  return index >= 0 && index < ONLINE_CITY.buildings.length ? index : null;
};

/** Readable interior label per hub building kind. */
export const HUB_INTERIOR_TITLE: Record<string, string> = {
  home: "RESIDENCE", shop: "SHOP", bar: "BAR", clinic: "CLINIC", den: "DEN",
  guild: "GUILD HALL", hotel: "HOTEL", hospital: "HOSPITAL", subway: "▼ UNDERLINE",
  stadium: "ARENA LOBBY", citycenter: "CITY HALL",
};

/**
 * Functional staff for each building KIND — what the place *does*.
 * Spawned as interactive service NPCs so every named building type opens a real system
 * (vendor / heal / stash / forge / market / underground subway / …), not just flavour talk.
 */
export type VenueStaff = {
  /** openService key, or specials: "heal" | "meal" | "subway". */
  svc: string;
  name: string;
  tag: string;
  color: number;
  look: PlayerLook;
  /** Optional id for server-side npc services (heal/meal). */
  npcId?: string;
};

export function venueStaffFor(kind: string): VenueStaff[] {
  switch (kind) {
    case "shop":
      return [
        {
          svc: "vendor",
          name: "CLERK",
          tag: "WARES",
          color: 0x00e5ff,
          look: hubLook({ color: 0x00e5ff, skin: 0xe6b58c, hair: "buzz", hairColor: 0x2a1d14 }),
          npcId: "keep_shop",
        },
      ];
    case "home":
      return [
        {
          svc: "stash",
          name: "CUSTODIAN",
          tag: "LOCKBOX",
          color: 0xffb13c,
          look: hubLook({ color: 0xffb13c, skin: 0xc98a5e, hair: "bun", hairColor: 0x1b1820 }),
          npcId: "keep_home",
        },
      ];
    case "guild":
      return [
        {
          svc: "guild",
          name: "REGISTRAR",
          tag: "CELL",
          color: 0x4d8cff,
          look: hubLook({
            color: 0x4d8cff,
            skin: 0xf3d2b8,
            hair: "short",
            hairColor: 0x4a2f1c,
            beard: "stubble",
            cloak: "coat",
          }),
          npcId: "keep_guild",
        },
        {
          svc: "forge",
          name: "ARMORER",
          tag: "FORGE",
          color: 0xff2bd6,
          look: hubLook({
            color: 0xff2bd6,
            sex: "f",
            skin: 0xe6b58c,
            hair: "undercut",
            hairColor: 0x1b1820,
            gloves: "wraps",
          }),
        },
      ];
    case "den":
      return [
        {
          svc: "market",
          name: "FENCE",
          tag: "BLACK MARKET",
          color: 0xff2bd6,
          look: hubLook({ color: 0xff2bd6, head: "hood", skin: 0xa9794a, hair: "short", hairColor: 0x1b1820, cloak: "coat" }),
          npcId: "keep_den",
        },
      ];
    case "bar":
      return [
        {
          svc: "contracts",
          name: "BARTENDER",
          tag: "THE WAKE",
          color: 0x9dff3c,
          look: hubLook({ color: 0x9dff3c, skin: 0x7c4f30, hair: "dreads", hairColor: 0x1b1820, cloak: "coat" }),
          npcId: "keep_bar",
        },
      ];
    case "clinic":
      return [
        {
          svc: "heal",
          name: "MEDIC",
          tag: "PATCH",
          color: 0x39ff88,
          look: hubLook({ color: 0x39ff88, skin: 0x7c4f30, hair: "ponytail", hairColor: 0x1b1820, decal: "cross" }),
          npcId: "keep_clinic",
        },
      ];
    case "hospital":
      return [
        {
          svc: "heal",
          name: "TRAUMA DOC",
          tag: "FULL PATCH",
          color: 0x8dfff0,
          look: hubLook({ color: 0x39ff88, skin: 0xe6b58c, hair: "buzz", hairColor: 0x4a2f1c, decal: "cross" }),
          npcId: "keep_hospital",
        },
      ];
    case "hotel":
      return [
        {
          svc: "meal",
          name: "CONCIERGE",
          tag: "REST",
          color: 0xff79c6,
          look: hubLook({ color: 0xffb13c, skin: 0xc98a5e, hair: "short", hairColor: 0x1b1820, cloak: "coat" }),
          npcId: "keep_hotel",
        },
      ];
    case "subway":
      return [
        {
          svc: "subway",
          name: "CONDUCTOR",
          tag: "▼ UNDERLINE",
          color: 0xff3b6b,
          look: hubLook({ color: 0x29e7ff, head: "cap", skin: 0x7c4f30, hair: "buzz", hairColor: 0x1b1820, cloak: "coat" }),
          npcId: "keep_subway",
        },
      ];
    case "stadium":
      return [
        {
          svc: "board",
          name: "ARENA HERALD",
          tag: "RECORDS",
          color: 0xf7ff3c,
          look: hubLook({ color: 0xff3b6b, head: "cap", skin: 0xf3d2b8, hair: "long", hairColor: 0x1b1820, beard: "goatee" }),
          npcId: "keep_stadium",
        },
      ];
    case "citycenter":
      return [
        {
          svc: "board",
          name: "CIVIC AIDE",
          tag: "DOSSIER",
          color: 0xb06bff,
          look: hubLook({ color: 0x4d8cff, skin: 0xa9794a, hair: "bun", hairColor: 0x1b1820 }),
          npcId: "keep_citycenter",
        },
      ];
    default:
      return [];
  }
}

/** 0xRRGGBB → "#rrggbb" CSS string. */
export const hexColor = (color: number) => `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;

/** Door accent per hub building kind. */
export const HUB_DOOR_COLOR: Record<string, number> = {
  home: 0xffb13c, shop: 0x00e5ff, bar: 0x9dff3c, clinic: 0x39ff88, den: 0xff2bd6,
  guild: 0x4d8cff, hotel: 0xff79c6, hospital: 0x8dfff0, subway: 0xff3b6b,
  stadium: 0xf7ff3c, citycenter: 0xb06bff,
};

/** Doors in the hub that open into building interiors. */
export const CITY_HUB_DOORS: { dest: string; label: string; tile: [number, number]; color: number }[] = [
  { dest: "clinic", label: "CLINIC", tile: hubT(-4, -6), color: 0x39ff88 },
  { dest: "shop", label: "MARKET", tile: hubT(4, -6), color: 0x00e5ff },
  { dest: "bar", label: "BAR", tile: hubT(-4, 6), color: 0xff79c6 },
  { dest: "den", label: "DEN", tile: hubT(4, 6), color: 0xff2bd6 },
  { dest: "subway", label: "▼ UNDERLINE", tile: hubT(-12, 0), color: 0xff3b6b },
  { dest: "vault", label: "◆ PROVING", tile: hubT(12, 0), color: 0xffb13c },
  { dest: "estates", label: "▶ HOMES", tile: hubT(-6, 4), color: 0xffb13c },
  { dest: "d0", label: "▶ DEPLOY", tile: [HUB_CX, HUB_CY + 7], color: 0x39ff88 },
];

/** East-edge trail guides — forward into the wilderness corridor before the next district. */
export const DISTRICT_TRANSIT_FWD: Array<{ district: number; dest: string; label: string; color: number; look: PlayerLook }> = [
  { district: 0, dest: "w0", label: "▶ GLASS CANYON", color: 0x6ab0ff, look: hubLook({ color: 0x6ab0ff, head: "hood", skin: 0xc98a5e, hair: "short", cloak: "coat", strap: true }) },
  { district: 1, dest: "w1", label: "▶ RELAY CUT", color: 0x9dff3c, look: hubLook({ color: 0x9dff3c, head: "cap", skin: 0x7c4f30, hair: "buzz", beard: "stubble", cloak: "coat" }) },
  { district: 2, dest: "w2", label: "▶ TIDAL SCRUB", color: 0x29e7ff, look: hubLook({ color: 0x29e7ff, head: "beret", sex: "f", skin: 0xe6b58c, hair: "ponytail", cloak: "coat" }) },
  { district: 3, dest: "w3", label: "▶ UNDERCITY VERGE", color: 0xb06bff, look: hubLook({ color: 0xb06bff, skin: 0x4f3220, hair: "dreads", cloak: "coat", legGear: "boots" }) },
  { district: 4, dest: "w4", label: "▶ ORBITAL BRUSH", color: 0xff7a18, look: hubLook({ color: 0xff7a18, head: "cap", sex: "f", skin: 0xa9794a, hair: "braids", cloak: "coat" }) },
  { district: 5, dest: "w5", label: "▶ ASH CORRIDOR", color: 0xf7a23c, look: hubLook({ color: 0xf7a23c, skin: 0xc98a5e, hair: "undercut", beard: "goatee", cloak: "coat", gloves: "wraps" }) },
  { district: 6, dest: "w6", label: "▶ KERNEL APPROACH", color: 0xff3b6b, look: hubLook({ color: 0xff3b6b, head: "beret", skin: 0xf3d2b8, hair: "long", cloak: "coat" }) },
];

/** West-edge trail guides — back into the wilderness corridor toward the previous district. */
export const DISTRICT_TRANSIT_BACK: Array<{ district: number; dest: string; label: string; color: number; look: PlayerLook }> = [
  { district: 1, dest: "w0", label: "◀ GLASS CANYON", color: 0x6ab0ff, look: hubLook({ color: 0x6ab0ff, head: "hood", skin: 0x7c4f30, cloak: "coat" }) },
  { district: 2, dest: "w1", label: "◀ RELAY CUT", color: 0x9dff3c, look: hubLook({ color: 0x9dff3c, head: "cap", skin: 0xc98a5e, cloak: "coat" }) },
  { district: 3, dest: "w2", label: "◀ TIDAL SCRUB", color: 0x29e7ff, look: hubLook({ color: 0x29e7ff, head: "beret", skin: 0x4f3220, cloak: "coat" }) },
  { district: 4, dest: "w3", label: "◀ UNDERCITY VERGE", color: 0xb06bff, look: hubLook({ color: 0xb06bff, skin: 0xe6b58c, hair: "long", cloak: "coat" }) },
  { district: 5, dest: "w4", label: "◀ ORBITAL BRUSH", color: 0xff7a18, look: hubLook({ color: 0xff7a18, head: "cap", skin: 0xa9794a, cloak: "coat" }) },
  { district: 6, dest: "w5", label: "◀ ASH CORRIDOR", color: 0xf7a23c, look: hubLook({ color: 0xf7a23c, skin: 0x7c4f30, beard: "stubble", cloak: "coat" }) },
  { district: 7, dest: "w6", label: "◀ KERNEL APPROACH", color: 0xff3b6b, look: hubLook({ color: 0xff3b6b, head: "beret", skin: 0xc98a5e, cloak: "coat" }) },
];

export const INTERIOR_NPC_TILES: [number, number][] = [[20, 12], [15, 15], [25, 15], [20, 18]];

/** HSS archetype tints (index = enemy kind). */
export const ENEMY_KIND_TINT = [0xff3b6b, 0x39ffd0, 0xffe06a, 0xff5ad0, 0xff8a3c, 0x4d8cff, 0xb06bff];

/** Emote wheel — first four float over your avatar; the rest drop a world ping marker. */
export const EMOTES: Array<{ text: string; ping: boolean }> = [
  { text: "GG", ping: false },
  { text: "NICE", ping: false },
  { text: "HELP!", ping: false },
  { text: "?!", ping: false },
  { text: "▶ RALLY", ping: true },
  { text: "ON ME", ping: true },
  { text: "FALL BACK", ping: true },
  { text: "ENEMY", ping: true },
];
