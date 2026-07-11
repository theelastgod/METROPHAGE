// METROPHAGE — painted dialogue portraits (Higgsfield sheets, 12 frames each).
//
// Three 4×3 spritesheets ship in assets/portraits/ (256px frames, row-major):
// the named story cast, the venue keepers, and the street residents. Every city
// NPC resolves to a stable {key, frame} here — named characters map directly,
// everyone else hashes onto a body-type-matched cell of the residents sheet, so
// a given NPC always shows the same face without shipping 60 unique portraits.

import { PORTRAIT_CAST_KEY, PORTRAIT_KEEPERS_KEY, PORTRAIT_RESIDENTS_KEY } from "../assets/manifest";

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
  if (KEEPERS[id] !== undefined) return { key: PORTRAIT_KEEPERS_KEY, frame: KEEPERS[id] };
  if (RESIDENTS[id] !== undefined) return { key: PORTRAIT_RESIDENTS_KEY, frame: RESIDENTS[id] };
  if (id.startsWith("keep_")) {
    return { key: PORTRAIT_KEEPERS_KEY, frame: hash(id) % 11 };
  }
  const pool = sex === "f" ? RES_F : sex === "m" ? RES_M : undefined;
  if (pool) return { key: PORTRAIT_RESIDENTS_KEY, frame: pool[hash(id) % pool.length] };
  return { key: PORTRAIT_RESIDENTS_KEY, frame: hash(id) % 12 };
}
