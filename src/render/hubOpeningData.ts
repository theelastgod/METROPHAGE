// Pure data for hub opening dress — no Phaser (unit-testable).

import type { Env, PropKind } from "../world/city";

export const ENV_GROUND_KEYS: Record<Env, readonly string[]> = {
  downtown: ["hf_ground_downtown", "hf_ground_city_tile_02", "hf_ground_core"],
  corporate: ["hf_ground_core", "hf_ground_city_tile_05", "hf_ground_spire"],
  market: ["hf_ground_docks", "hf_ground_city_tile_11"],
  residential: ["hf_ground_city_tile_01", "hf_ground_sprawl"],
  industrial: ["hf_ground_stacks", "hf_ground_city_tile_05"],
  slum: ["hf_ground_wastes", "hf_ground_city_tile_14"],
  park: ["hf_ground_city_tile_01", "hf_ground_downtown"],
  docks: ["hf_ground_docks", "hf_ground_city_tile_11"],
  undercity: ["hf_ground_undercity", "hf_ground_city_tile_11"],
  arcology: ["hf_ground_spire", "hf_ground_core"],
};

export const ENV_PROP_KEYS: Record<Env, readonly string[]> = {
  downtown: ["hf_city_neon_01", "hf_city_neon_02", "hf_prop_holo_pole", "hf_prop_puddle_neon", "hf_web_city_district_marker"],
  corporate: ["hf_city_corporate_01", "hf_city_corporate_02", "hf_hub_planter", "prop_planter", "hf_web_city_public_terminal"],
  market: ["hf_city_market_01", "hf_city_market_02", "hf_early_vendor_01", "hf_web_city_noodle_cart", "hf_web_city_battery_stall"],
  residential: ["hf_city_residential_01", "hf_city_residential_02", "hf_hub_bench", "hf_hub_planter", "hf_city_residential_03"],
  industrial: ["hf_city_industrial_01", "hf_city_industrial_02", "hf_distprop_stacks_barrel", "hf_web_city_transformer", "prop_barrier"],
  slum: ["hf_city_slum_01", "hf_city_slum_02", "hf_prop_dumpster_fire", "prop_dumpster", "hf_city_slum_03"],
  park: ["hf_hub_planter", "hf_hub_bench", "hf_city_residential_04", "prop_planter"],
  docks: ["hf_distprop_docks_crate", "hf_distprop_docks_buoy", "hf_web_city_water_recycler", "hf_city_industrial_03"],
  undercity: ["hf_distprop_under_grate", "hf_distprop_under_grow", "hf_city_slum_04", "prop_bin"],
  arcology: ["hf_city_corporate_03", "hf_city_neon_04", "hf_hub_planter", "hf_web_city_antenna"],
};

export const DECOR_KEYS: Record<PropKind, readonly string[]> = {
  planter: ["hf_hub_planter", "prop_planter", "hf_city_residential_01"],
  bench: ["hf_hub_bench", "hf_hub_bench_b"],
  lantern: ["hf_prop_holo_pole", "prop_streetlight", "hf_city_neon_01"],
  tree: ["hf_hub_planter", "hf_city_residential_02", "prop_planter"],
  stall: ["hf_web_city_noodle_cart", "hf_early_vendor_01", "hf_city_market_01"],
  billboard: ["hf_web_city_district_marker", "hf_city_neon_03", "hf_city_landmark_01"],
  pipe: ["hf_city_industrial_01", "prop_ac", "hf_web_city_transformer"],
  barrel: ["hf_distprop_stacks_barrel", "hf_city_industrial_03"],
  fire: ["hf_prop_dumpster_fire", "hf_city_slum_01"],
  trash: ["prop_dumpster", "hf_city_slum_02", "prop_bin"],
};

export function firstKey(exists: (k: string) => boolean, keys: readonly string[], salt = 0): string | null {
  if (!keys.length) return null;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[(Math.abs(salt) + i) % keys.length];
    if (exists(k)) return k;
  }
  return null;
}
