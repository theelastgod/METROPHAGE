// METROPHAGE — painted dialogue portraits (Higgsfield sheets, 12 frames each).
//
// Sheets ship in assets/portraits/ (256px frames, row-major):
//   cast / keepers / residents / interact NPCs / world-boss splash.
// Named characters map directly; everyone else hashes onto a body-type-matched
// cell of the residents sheet so a given NPC always shows the same face.

import {
  PORTRAIT_CAST_KEY,
  PORTRAIT_KEEPERS_KEY,
  PORTRAIT_RESIDENTS_KEY,
  PORTRAIT_INTERACT_KEY,
  PORTRAIT_BOSSES_KEY,
} from "../assets/manifest";

export interface PortraitRef {
  key: string;
  frame: number;
}

/** Named story cast — cast_sheet.jpg frame order. */
const CAST: Record<string, number> = {
  fixer: 0,
  player: 1,
  rin: 2,
  doc: 3,
  vex: 4,
  marek: 5,
  juno: 6,
  sable: 7,
  kessler: 8,
  mira: 9,
  ghost: 10,
  stranger: 11,
};

/** Venue keepers — keepers_sheet.jpg frame order (keeperFor kinds + the dock captain). */
const KEEPERS: Record<string, number> = {
  keep_bar: 0,
  keep_shop: 1,
  keep_clinic: 2,
  keep_guild: 3,
  keep_den: 4,
  keep_home: 5,
  keep_hospital: 6,
  keep_hotel: 7,
  keep_subway: 8,
  keep_stadium: 9,
  keep_citycenter: 10,
  porter: 11,
};

/**
 * Interact / npcServices cast — interact_sheet.jpg (4×3) frame order.
 * tools/higgsfield-expand-build.mjs NPC_INTERACT list.
 */
const INTERACT: Record<string, number> = {
  porter: 0,
  tunnel_rat: 1,
  scrap_boss: 2,
  hawker: 3,
  preacher: 4,
  street_kid: 5,
  amb_tech: 6,
  amb_vendor: 7,
  subway_warden: 8,
  amb_courier: 9,
  keep_den: 10,
  keep_citycenter: 11,
  // aliases used in service overrides / hub names
  arc_tech: 6,
  amb_drifter: 5,
  amb_dockhand: 0,
  amb_arc_clerk: 6,
};

/**
 * World-boss splash — bosses_sheet.jpg (3×3). Keys are slug + display-name tokens.
 * Frame order matches BOSS_ROSTER on the server (void_herald is extra art).
 */
const BOSSES: Record<string, number> = {
  gutter_king: 0,
  "the gutter king": 0,
  anduril_sentinel: 1,
  "anduril sentinel": 1,
  palantir_oracle: 2,
  "palantir oracle": 2,
  tidal_leviathan: 3,
  "tidal leviathan": 3,
  the_maw: 4,
  "the maw": 4,
  skylink_beacon: 5,
  "skylink beacon": 5,
  scrap_sovereign: 6,
  "scrap sovereign": 6,
  helios_warden: 7,
  "helios warden": 7,
  void_herald: 8,
  "void herald": 8,
};

/**
 * Hub service operatives (and common display names) → painted face.
 * Keys are lowercased name tokens from OnlineScene CITY_HUB_NPCS / venue services.
 */
const SERVICE_FACES: Record<string, PortraitRef> = {
  fixer: { key: PORTRAIT_CAST_KEY, frame: 0 },
  "the fixer": { key: PORTRAIT_CAST_KEY, frame: 0 },
  armorer: { key: PORTRAIT_KEEPERS_KEY, frame: 3 },
  archivist: { key: PORTRAIT_KEEPERS_KEY, frame: 1 },
  quartermaster: { key: PORTRAIT_KEEPERS_KEY, frame: 1 },
  "the tailor": { key: PORTRAIT_KEEPERS_KEY, frame: 7 },
  tailor: { key: PORTRAIT_KEEPERS_KEY, frame: 7 },
  "the broker": { key: PORTRAIT_KEEPERS_KEY, frame: 4 },
  broker: { key: PORTRAIT_KEEPERS_KEY, frame: 4 },
  organizer: { key: PORTRAIT_KEEPERS_KEY, frame: 3 },
  clerk: { key: PORTRAIT_KEEPERS_KEY, frame: 1 },
  custodian: { key: PORTRAIT_KEEPERS_KEY, frame: 5 },
  registrar: { key: PORTRAIT_KEEPERS_KEY, frame: 3 },
  fence: { key: PORTRAIT_KEEPERS_KEY, frame: 4 },
};

/** Street residents drawn 1:1 — residents_sheet.jpg frame order. */
const RESIDENTS: Record<string, number> = {
  res_nix: 0,
  res_solenne: 1,
  res_raze: 2,
  res_moth: 3,
  res_cinder: 4,
  res_echo: 5,
  res_tallow: 6,
  res_wren: 7,
  res_pike: 8,
  res_velvet: 9,
  res_static: 10,
  res_quill: 11,
};

// residents-sheet cells by depicted body type, for the hash fallback
const RES_F = [1, 3, 5, 7, 9];
const RES_M = [0, 2, 4, 6, 8, 10, 11];

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Stable painted portrait for any city NPC id. `sex` (from the NPC's look)
 * steers the fallback pool so the bust matches the paper-doll sprite.
 */
export function portraitFor(id: string, sex?: string): PortraitRef {
  if (CAST[id] !== undefined) return { key: PORTRAIT_CAST_KEY, frame: CAST[id] };
  // Interact sheet beats keepers for shared ids (porter / keep_den / keep_citycenter)
  // so the new npcServices faces show in dialogue.
  if (INTERACT[id] !== undefined) return { key: PORTRAIT_INTERACT_KEY, frame: INTERACT[id] };
  if (KEEPERS[id] !== undefined) return { key: PORTRAIT_KEEPERS_KEY, frame: KEEPERS[id] };
  if (RESIDENTS[id] !== undefined) return { key: PORTRAIT_RESIDENTS_KEY, frame: RESIDENTS[id] };
  if (id.startsWith("keep_")) {
    return { key: PORTRAIT_KEEPERS_KEY, frame: hash(id) % 11 };
  }
  if (id.startsWith("amb_") || id.startsWith("res_")) {
    // Prefer interact when we have a named amb face; else hash residents.
    if (INTERACT[id] !== undefined) return { key: PORTRAIT_INTERACT_KEY, frame: INTERACT[id] };
  }
  const svc = SERVICE_FACES[id.toLowerCase()];
  if (svc) return svc;
  const pool = sex === "f" ? RES_F : sex === "m" ? RES_M : undefined;
  if (pool) return { key: PORTRAIT_RESIDENTS_KEY, frame: pool[hash(id) % pool.length] };
  return { key: PORTRAIT_RESIDENTS_KEY, frame: hash(id) % 12 };
}

/** Resolve a painted face from a freeform NPC display name (hub services, instructors). */
export function portraitForName(name: string): PortraitRef | undefined {
  const raw = name.trim().toLowerCase();
  if (!raw) return undefined;
  // "ARMORER · FORGE" → try full then first token
  const head = raw.split("·")[0]?.trim() ?? raw;
  if (SERVICE_FACES[raw]) return SERVICE_FACES[raw];
  if (SERVICE_FACES[head]) return SERVICE_FACES[head];
  // Match cast by first word ("rin", "doc halo" → doc)
  const first = head.split(/\s+/)[0] ?? head;
  if (CAST[first] !== undefined) return { key: PORTRAIT_CAST_KEY, frame: CAST[first] };
  if (SERVICE_FACES[first]) return SERVICE_FACES[first];
  if (INTERACT[first] !== undefined) return { key: PORTRAIT_INTERACT_KEY, frame: INTERACT[first] };
  // Boss display names ("THE GUTTER KING", "ANDURIL SENTINEL")
  const boss = portraitForBoss(name);
  if (boss) return boss;
  return undefined;
}

/** World-boss / elite splash portrait from display name or slug. */
export function portraitForBoss(name: string): PortraitRef | undefined {
  const raw = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!raw) return undefined;
  if (BOSSES[raw] !== undefined) return { key: PORTRAIT_BOSSES_KEY, frame: BOSSES[raw] };
  const slug = raw.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (BOSSES[slug] !== undefined) return { key: PORTRAIT_BOSSES_KEY, frame: BOSSES[slug] };
  // Partial match: "GUTTER KING" without THE, etc.
  for (const [k, frame] of Object.entries(BOSSES)) {
    if (raw.includes(k) || k.includes(raw)) return { key: PORTRAIT_BOSSES_KEY, frame };
  }
  return undefined;
}
