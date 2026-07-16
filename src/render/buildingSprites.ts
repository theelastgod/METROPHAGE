// METROPHAGE — which exterior sprite a footprint shows. Pure lookup tables + selection,
// deliberately free of Phaser so the precedence rules are unit-testable: they decide what
// every building in the world looks like, and they fail silently (a wrong pick just
// renders the wrong art). Phaser-side placement lives in buildingFacades.ts.

import { pickHfVariant } from "../assets/manifest";
import type { BuildingKind } from "../world/city";

/** Higgsfield baked top-down building art, keyed by building kind. Kinds absent here
 *  fall back to the procedural façade. hospital reuses the clinic art (green cross). */
export const BUILDING_SPRITE: Partial<Record<BuildingKind, string>> = {
  bar: "hf_building_bar",
  noodle: "hf_building_noodle",
  ripperdoc: "hf_building_ripperdoc",
  pawn: "hf_building_pawn",
  arcade: "hf_building_arcade",
  garage: "hf_building_garage",
  radio: "hf_building_radio",
  clinic: "hf_building_clinic",
  hospital: "hf_building_clinic",
  subway: "hf_building_subway",
  shop: "hf_building_shop",
  guild: "hf_building_guild",
  hotel: "hf_building_hotel",
  stadium: "hf_building_stadium",
  citycenter: "hf_building_citycenter",
  home: "hf_building_home",
  den: "hf_building_den",
};

/** Contagion-damaged variants, per kind. Must share the clean art's TOP-DOWN projection
 *  and subject — infected swaps in on the same footprint. */
export const BUILDING_INFECTED: Partial<Record<BuildingKind, string>> = {
  bar: "hf_building_inf_bar",
  noodle: "hf_building_inf_bar", // counter-bar subject — nearest projection/subject match
  ripperdoc: "hf_building_inf_clinic",
  pawn: "hf_building_inf_shop",
  arcade: "hf_building_inf_den",
  garage: "hf_building_inf_guild",
  radio: "hf_building_inf_citycenter",
  clinic: "hf_building_inf_clinic",
  hospital: "hf_building_inf_clinic",
  shop: "hf_building_inf_shop",
  den: "hf_building_inf_den",
  guild: "hf_building_inf_guild",
  home: "hf_building_inf_home",
  hotel: "hf_building_inf_hotel",
  subway: "hf_building_inf_subway",
  stadium: "hf_building_inf_stadium",
  citycenter: "hf_building_inf_citycenter",
};

/**
 * Env / district id → kit preference order. The first entry is the zone's own kit; any
 * later entry is the kit it historically borrowed, kept as a fallback so a zone whose
 * dedicated kit has not been generated yet still shows district art rather than dropping
 * to a procedural facade.
 */
export const DIST_KIT: Record<string, string | string[]> = {
  core: "hf_building_dist_core",
  // THE KERNEL (campaign final district id)
  kernel: ["hf_building_dist_kernel", "hf_building_dist_core"],
  downtown: "hf_building_dist_core",
  corporate: ["hf_building_dist_corporate", "hf_building_dist_core"],
  arcology: ["hf_building_dist_arcology", "hf_building_dist_core"],
  stacks: "hf_building_dist_stacks",
  industrial: "hf_building_dist_stacks",
  relay: "hf_building_dist_relay",
  sprawl: "hf_building_dist_sprawl",
  slum: "hf_building_dist_sprawl",
  residential: "hf_building_dist_sprawl",
  undercity: "hf_building_dist_undercity",
  docks: "hf_building_dist_docks",
  market: ["hf_building_dist_market", "hf_building_dist_docks"],
  helios: "hf_building_dist_helios",
  wastes: "hf_building_dist_wastes",
  spire: "hf_building_dist_spire",
  park: ["hf_building_dist_park", "hf_building_dist_sprawl"],
};

/** Kit preference order for an env / district id, normalized to an array. */
export function kitChain(districtId: string): string[] {
  const entry = DIST_KIT[districtId];
  if (!entry) return [];
  return typeof entry === "string" ? [entry] : entry;
}

/** Last-resort kit borrow, from before these zones had their own kits. */
const LEGACY_KIT_FALLBACK: Record<string, string> = {
  spire: "hf_building_dist_core",
  wastes: "hf_building_dist_helios",
  relay: "hf_building_dist_stacks",
};

export interface SpriteOpts {
  districtId?: string;
  infected?: boolean;
  /** Scenery block: render from the district kit, never from kind art. */
  preferDistrictKit?: boolean;
  /** Stable salt so neighboring buildings of the same kind aren't identical. */
  variantSalt?: number;
}

/**
 * Choose the exterior sprite key for a footprint, or undefined to use the procedural
 * façade. `exists` reports which textures actually loaded — every missing PNG must
 * degrade to a correct-looking fallback rather than a wrong subject.
 */
export function selectBuildingSprite(
  exists: (key: string) => boolean,
  kind: BuildingKind,
  opts?: SpriteOpts,
): string | undefined {
  const salt = opts?.variantSalt ?? 0;
  const pick = (base: string) => pickHfVariant(exists, base, salt, 3);
  const chain = () => kitChain(opts?.districtId ?? "");
  const kitFor = (suffix: string) => {
    for (const kit of chain()) if (exists(kit + suffix)) return kit + suffix;
    return undefined;
  };

  if (opts?.infected) {
    if (opts.preferDistrictKit) {
      // Scenery renders from the district kit, so an outbreak needs the kit's own
      // diseased variant. Never fall back to kind art here: scenery is passed
      // kind="home", which would stamp a house façade across every scenery block.
      // With no infected kit, fall through to the clean kit — right subject, wrong health.
      const k = kitFor("_inf");
      if (k) return k;
    } else {
      const inf = BUILDING_INFECTED[kind];
      if (inf && exists(inf)) return inf;
      const k = kitFor("_inf");
      if (k) return k;
    }
  }
  // Combat districts: show the district kit as the primary exterior language.
  if (opts?.preferDistrictKit && opts.districtId) {
    for (const kit of chain()) {
      const v = pick(kit);
      if (exists(v)) return v;
      if (exists(kit)) return kit;
    }
  }
  const base = BUILDING_SPRITE[kind];
  if (base) {
    const v = pick(base);
    if (exists(v)) return v;
    if (exists(base)) return base;
  }
  // Hub fallback: env-zone kit when a kind has no dedicated landmark art.
  if (opts?.districtId) {
    for (const kit of chain()) {
      const v = pick(kit);
      if (exists(v)) return v;
      if (exists(kit)) return kit;
    }
    const fb = LEGACY_KIT_FALLBACK[opts.districtId];
    if (fb && exists(fb)) return fb;
  }
  return undefined;
}
