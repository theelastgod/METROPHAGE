import { COSMETICS } from "../game/cosmetics";
import { MUSIC_TRACKS } from "../audio/musicTracks";
import type { EnemyBody } from "./enemyart";

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
/**
 * Non-humanoid enemy sheets, baked from enemyart.ts. Indexed by the server's enemy
 * `kind` — an index into ENEMY_ARCHES (server/src/world.ts):
 *
 *   0 PATROL · 2 LANCER · 4 ENFORCER · 5 SNIPER  → humanoid HSS troopers (COP_KEY)
 *   1 WASP    → drone    (24hp fast harrier)
 *   3 HOUND   → beast    (speed-200 rusher)
 *   6 WRAITH  → spectre  (speed-220 elite skirmisher)
 *
 * null = keep the cop sheet. Every arch used to render as the same tinted cop, so a
 * 24hp WASP and a 170hp ENFORCER were the same silhouette and threat read as hue only.
 */
export const ENEMY_BODY_BY_ARCH: ReadonlyArray<EnemyBody | null> = [
  null, "drone", null, "beast", null, null, "spectre",
];
export const enemyBodyKey = (body: EnemyBody) => "enemy_body_" + body;
/** Distinct bodies to bake (deduped, order-independent). */
export const ENEMY_BODIES: readonly EnemyBody[] = ["drone", "beast", "spectre"];

export const GUARDIAN_WRAITH_KEY = "guardian_wraith";
/** Wraith sheet is 16×(32×32): 0-7 float loop, 8-14 attack pose, 15 empty. Idle cycles
 *  the float loop only — `frameTotal` can't be used (Phaser counts its __BASE frame, and
 *  cycling to the end would blink on the empty frame and swing the attack pose). */
export const WRAITH_FLOAT_FRAMES = 8;

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
// Painted 4×3 portrait sheets (Higgsfield, tools/higgsfield-art-build.mjs) — 256px
// frames, row-major. Frame maps + NPC id resolution live in src/game/portraits.ts.
export const PORTRAIT_CAST_KEY = "portraits_cast";
export const PORTRAIT_KEEPERS_KEY = "portraits_keepers";
export const PORTRAIT_RESIDENTS_KEY = "portraits_residents";
/** Boss splash sheet (3×3) — tools/higgsfield-expand-build.mjs. */
export const PORTRAIT_BOSSES_KEY = "portraits_bosses";
/** Interact-NPC sheet (4×3) for npcServices cast. */
export const PORTRAIT_INTERACT_KEY = "portraits_interact";
export const UI_FRAME_KEY = "ui_frame";
export const UI_GUN_KEY = "ui_gun";
/** Higgsfield neon glass HUD panel (NineSlice-friendly). */
export const UI_PANEL_KEY = "ui_panel";
/** Circular neon ring for mobile action buttons. */
export const UI_BTN_RING_KEY = "ui_btn_ring";
/** Alt ring (Higgsfield chrome sheet) for secondary / ability pads. */
export const UI_BTN_RING_ALT_KEY = "ui_btn_ring_alt";
/** Title identity-gate chrome (Higgsfield gpt_image_2 pack). */
export const IDENTITY_PANEL_KEY = "identity_panel";
export const IDENTITY_BTN_PRIMARY_KEY = "identity_btn_primary";
export const IDENTITY_BTN_SECONDARY_KEY = "identity_btn_secondary";
export const IDENTITY_MARK_KEY = "identity_mark";
/** Ability icons (Higgsfield) — dash / shield / pulse / virus / rail / overdrive / blade / radar. */
export const ABILITY_ICON_KEYS = [
  "ability_dash",
  "ability_shield",
  "ability_pulse",
  "ability_virus",
  "ability_rail",
  "ability_overdrive",
  "ability_blade",
  "ability_radar",
] as const;
export type AbilityIconKey = (typeof ABILITY_ICON_KEYS)[number];
/**
 * Higgsfield expand-sheet ability pack (ability_hf_*). Manifest still serves the
 * ability_* keys (copies / aliases); this list is for tooling + class icon maps.
 */
export const ABILITY_HF_ICON_KEYS = [
  "ability_hf_dash",
  "ability_hf_cone",
  "ability_hf_drones",
  "ability_hf_ult",
  "ability_hf_shield",
  "ability_hf_pulse",
  "ability_hf_rail",
  "ability_hf_radar",
] as const;
/** Weapon silhouettes gun_hf_01..06 (tools/higgsfield-hud-build.mjs). */
export const HF_GUN_KEYS = Array.from({ length: 6 }, (_, i) => "gun_hf_" + String(i + 1).padStart(2, "0"));
/** Map weapon klass → gun_hf cell (0-based). */
export function hfGunKeyForKlass(klass: string): string {
  const k = klass.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const idx =
    /PISTOL|REVOLVER/.test(k) ? 0
    : /SMG|MACHINEPISTOL/.test(k) ? 1
    : /SHOTGUN/.test(k) ? 2
    : /BURSTRIFLE|MARKSMAN|LMG|RIFLE/.test(k) ? 3
    : /RAIL|ARC|FLAK|LAUNCHER|FLAME/.test(k) ? 4
    : /BLADE|KATANA/.test(k) ? 5
    : 0;
  return HF_GUN_KEYS[idx];
}
/** Loot / faction crest / token icons (expand sheet). */
export const LOOT_ICON_KEYS = ["loot_credit", "loot_core", "loot_crate", "loot_medpatch"] as const;
export const CREST_ICON_KEYS = [
  "crest_metrophage",
  "crest_kguerilla",
  "crest_wintermute",
  "crest_swarm",
] as const;
export const METRO_TOKEN_KEY = "metro_token";
/** World-boss splash singles (prefer over sheet frames when loaded). */
export const HF_BOSS_PORTRAIT_SLUGS = [
  "gutter_king",
  "anduril_sentinel",
  "palantir_oracle",
  "tidal_leviathan",
  "the_maw",
  "skylink_beacon",
  "scrap_sovereign",
  "helios_warden",
  "void_herald",
] as const;
/** Interact NPC portrait singles. */
export const HF_INTERACT_PORTRAIT_SLUGS = [
  "porter",
  "tunnel_rat",
  "scrap_boss",
  "hawker",
  "preacher",
  "street_kid",
  "amb_tech",
  "amb_vendor",
  "subway_warden",
  "amb_courier",
  "keep_den",
  "keep_citycenter",
  "keep_hotel", "keep_ripperdoc", "keep_pawn", "keep_garage", "keep_arcade", "keep_radio",
] as const;
export const HF_SERVICE_ICON_KEYS = [
  "sleep", "heal", "pawn", "repair", "leaderboard", "radio_contract", "quest_pickup", "bounty",
  "neural_implant", "armor", "weapon_upgrade", "credits", "heat", "subway_ticket", "district_marker", "boss_alert",
] as const;
export const HF_LOADING_KEYS = ["hf_loading_early_city", "hf_loading_subway", "hf_loading_hotel"] as const;
/**
 * Resident portrait singles. The residents sheet holds 12 painted faces but there are 32
 * residents, and the sheet fallback matches on `sex` ALONE — skin, hair, build and beard
 * are ignored — so a bust could contradict the paper-doll sprite you're talking to. These
 * are authored per NPC from their own look() params. Files: portraits/interact/<slug>.jpg.
 */
export const HF_RESIDENT_PORTRAIT_SLUGS = [
  "res_ash", "res_borne", "res_brick", "res_coil", "res_dash",
  "res_ferro", "res_glass", "res_grist", "res_hollow", "res_juniper",
  "res_lace", "res_lumen", "res_mercy", "res_odd", "res_pip",
  "res_plume", "res_rook", "res_salt", "res_sparrow", "res_tin",
] as const;
/** Every NPC bust that ships as its own image (not a sheet cell). */
export const HF_NPC_PORTRAIT_SLUGS = [
  ...HF_INTERACT_PORTRAIT_SLUGS,
  ...HF_RESIDENT_PORTRAIT_SLUGS,
] as const;
export const portraitBossKey = (slug: string) => "portrait_boss_" + slug;
export const portraitInteractKey = (slug: string) => "portrait_npc_" + slug;
// Painted menu backdrop + per-class select-card art (same Higgsfield build).
export const MENU_BG_KEY = "menu_bg";
export const classArtKey = (classId: string) => "classart_" + classId;
export const VO_MELTDOWN_KEY = "vo_meltdown";
/** Seed Audio 1.0 one-shots (public/assets/sfx). */
export const SFX_KEYS = [
  "sfx_hit",
  "sfx_cast",
  "sfx_heat",
  "sfx_pickup",
  "sfx_ui_blip",
  "sfx_core",
  "sfx_dash",
  "sfx_ult",
] as const;
export const STINGER_BOSS_KEY = "stinger_boss";
/** Higgsfield top-down prop pack (12 cells, tools/higgsfield-hud-build.mjs). */
export const HF_PROP_KEYS = Array.from({ length: 12 }, (_, i) => "hf_prop_" + String(i + 1).padStart(2, "0"));
/** Higgsfield top-down landmark building props (tools/higgsfield-building-build.mjs). */
export const HF_BUILDING_SLUGS = [
  "bar", "noodle", "clinic", "subway", "shop",
  "guild", "hotel", "stadium", "citycenter", "home", "den",
  "ripperdoc", "pawn", "arcade", "garage", "radio",
] as const;
/** District exterior kits (NEON CORE / SPRAWL / UNDERCITY / … + wishlist unique kits). */
export const HF_DIST_BUILDING_SLUGS = [
  "dist_core", "dist_sprawl", "dist_undercity", "dist_docks", "dist_helios", "dist_stacks",
  "dist_spire", "dist_wastes", "dist_relay",
] as const;
/** Contagion-damaged building variants. */
export const HF_INF_BUILDING_SLUGS = [
  "inf_bar", "inf_clinic", "inf_shop", "inf_den", "inf_guild", "inf_home",
  "inf_hotel", "inf_subway", "inf_stadium", "inf_citycenter",
] as const;
export const hfBuildingKey = (slug: string) => "hf_building_" + slug;
export const HF_BUILDING_KEYS = HF_BUILDING_SLUGS.map(hfBuildingKey);
export const HF_DIST_BUILDING_KEYS = HF_DIST_BUILDING_SLUGS.map(hfBuildingKey);
export const HF_INF_BUILDING_KEYS = HF_INF_BUILDING_SLUGS.map(hfBuildingKey);

/** Wishlist pack — subway props (tools/higgsfield-wishlist-gen.mjs). Includes multivariants. */
export const HF_SUBWAY_PROP_KEYS = [
  "hf_subway_platform_hub", "hf_subway_platform_hub_b",
  "hf_subway_platform_mid", "hf_subway_platform_mid_b",
  "hf_subway_platform_deep", "hf_subway_platform_deep_b",
  "hf_subway_tunnel_straight",
  "hf_subway_tunnel_junction",
  "hf_subway_tunnel_cross",
  "hf_subway_train_dead", "hf_subway_train_dead_b", "hf_subway_train_dead_c",
  "hf_subway_signal",
  "hf_subway_gore",
  "hf_subway_exit", "hf_subway_exit_b",
  "hf_subway_booth", "hf_subway_booth_b",
  "hf_subway_ghost_train",
  "hf_subway_ticket_hall", "hf_subway_ticket_hall_b",
  "hf_subway_escalator_mouth", "hf_subway_escalator_mouth_b",
  "hf_subway_apron", "hf_subway_apron_b",
  "hf_subway_track_bay",
  "hf_enemy_rail_wraith",
  "hf_enemy_ticket_specter",
  "hf_enemy_tunnel_centipede",
  "hf_enemy_platform_husk",
] as const;
const numberedKeys = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => `${prefix}_${String(i + 1).padStart(2, "0")}`);
/** Large second-pass UNDERLINE pack: fixtures plus full-frame structure skins. */
export const HF_SUBWAY_EXPANSION_PROP_KEYS = [
  ...numberedKeys("hf_subway_fixture", 20), ...numberedKeys("hf_subway_debris", 16),
  ...numberedKeys("hf_subway_signalset", 12), ...numberedKeys("hf_subway_maintenance", 12),
  ...numberedKeys("hf_subway_platformprop", 16), ...numberedKeys("hf_subway_horror", 12),
] as const;
export const HF_SUBWAY_IDENTITY_PROP_KEYS = [
  "hf_subway_identity_ticket_shrine", "hf_subway_identity_flood_pump", "hf_subway_identity_quarantine_gate",
  "hf_subway_identity_signal_altar", "hf_subway_identity_scavenger_camp", "hf_subway_identity_escalator_collapse",
  "hf_subway_identity_memorial_marker", "hf_subway_identity_train_nose", "hf_subway_identity_route_frame",
  "hf_subway_identity_warning_cluster", "hf_subway_identity_cable_bundle", "hf_subway_identity_vent_fan",
  "hf_subway_identity_pipe_manifold", "hf_subway_identity_emergency_cabinet", "hf_subway_identity_signal_repeater",
  "hf_subway_identity_service_hatch",
] as const;
export const HF_BUSINESS_PROP_KEYS = [
  "hf_business_surgical_chair", "hf_business_scanner_arm", "hf_business_implant_cabinet", "hf_business_organ_cooler",
  "hf_business_appraisal_scanner", "hf_business_display_case", "hf_business_arcade_cabinet", "hf_business_vr_chair",
  "hf_business_vehicle_lift", "hf_business_engine_block", "hf_business_welding_station", "hf_business_drone_cradle",
  "hf_business_mixing_console", "hf_business_transmitter_rack", "hf_business_sleep_pod", "hf_business_reception_terminal",
] as const;
export const HF_SUBWAY_TILE_KEYS = [
  ...numberedKeys("hf_subway_tile_straight", 25), ...numberedKeys("hf_subway_tile_junction", 18),
  ...numberedKeys("hf_subway_tile_cross", 12), ...numberedKeys("hf_subway_tile_station", 24),
  ...numberedKeys("hf_subway_tile_curve", 40), ...numberedKeys("hf_subway_tile_service", 39),
  ...numberedKeys("hf_subway_tile_stationdeep", 40), ...numberedKeys("hf_subway_tile_track", 25),
] as const;
/** Per-district street clutter (signature props + expanse extras). */
export const HF_DIST_PROP_KEYS = [
  "hf_distprop_plaza_drone", "hf_distprop_plaza_tape", "hf_distprop_plaza_booth",
  "hf_distprop_stacks_barrel", "hf_distprop_stacks_slag", "hf_distprop_stacks_conveyor",
  "hf_distprop_spire_drone", "hf_distprop_spire_barrier", "hf_distprop_spire_valet",
  "hf_distprop_docks_crate", "hf_distprop_docks_buoy", "hf_distprop_docks_crane",
  "hf_distprop_under_grow", "hf_distprop_under_grate", "hf_distprop_under_shrine",
  "hf_distprop_relay_spool", "hf_distprop_relay_board", "hf_distprop_relay_dish",
  "hf_distprop_wastes_tire", "hf_distprop_wastes_idol", "hf_distprop_wastes_barrels",
  "hf_distprop_kernel_core", "hf_distprop_kernel_mannequin", "hf_distprop_kernel_pillar",
] as const;
/** Interior furniture wishlist pack + multivariants. */
export const HF_FURN_KEYS = [
  "hf_furn_sofa", "hf_furn_sofa_b",
  "hf_furn_terminal", "hf_furn_terminal_b",
  "hf_furn_locker", "hf_furn_locker_b",
  "hf_furn_plant", "hf_furn_plant_b",
  "hf_furn_neon_lamp", "hf_furn_neon_lamp_b",
  "hf_furn_bar_counter", "hf_furn_bar_counter_b",
  "hf_furn_clinic_bed", "hf_furn_clinic_bed_b",
  "hf_furn_war_table", "hf_furn_war_table_b",
  "hf_furn_shelf", "hf_furn_shelf_b",
  "hf_furn_bed", "hf_furn_bed_b",
  "hf_furn_crate_stack",
] as const;
/** Venue floor plates keyed by LAYOUT (VENUE_LAYOUTS tag), generated at each plan's
 *  aspect. The room's shape is hash-picked per zone independent of venue kind, so the
 *  floor follows the layout and the kind is carried by furniture. */
export const HF_LAYOUT_PLATE_TAGS = ["studio", "loft", "hall", "backroom", "atrium"] as const;
export const layoutPlateKey = (tag: string) => "hf_int_layout_" + tag;
export const HF_LAYOUT_PLATE_KEYS = HF_LAYOUT_PLATE_TAGS.map(layoutPlateKey);

/** Interior room floor plates (structure matched to venue kind). Every key here is
 *  fetched on EVERY venue entry — only rooms a ROOM_PLAN actually draws belong.
 *  Reserve art that exists on disk but has no traced plan yet (hf_int_subway_room,
 *  hf_int_estate_room, hf_int_home_room_b) stays out until it's wired. */
export const HF_INT_ROOM_KEYS = [
  "hf_int_bar_room", "hf_int_noodle_room", "hf_int_clinic_room", "hf_int_shop_room", "hf_int_guild_room",
  "hf_int_den_room", "hf_int_home_room",
  "hf_int_stadium_room", "hf_int_citycenter_room",
  "hf_int_ripperdoc_room", "hf_int_pawn_room", "hf_int_arcade_room",
  "hf_int_garage_room", "hf_int_radio_room", "hf_int_hotel_room",
] as const;
/** Contagion-damaged district kits — scenery art for an outbreak district. */
export const HF_DIST_INF_KEYS = [
  "hf_building_dist_core_inf", "hf_building_dist_sprawl_inf", "hf_building_dist_undercity_inf",
  "hf_building_dist_docks_inf", "hf_building_dist_stacks_inf", "hf_building_dist_spire_inf",
  "hf_building_dist_wastes_inf", "hf_building_dist_relay_inf", "hf_building_dist_kernel_inf",
] as const;
/** Env-identity building kits (zones that previously borrowed another district's kit). */
export const HF_ENV_KIT_KEYS = [
  "hf_building_dist_market", "hf_building_dist_park", "hf_building_dist_corporate",
  "hf_building_dist_arcology", "hf_building_dist_kernel",
] as const;
/** THE ESTATES street facades. */
export const HF_ESTATE_KEYS = [
  "hf_building_estate_a", "hf_building_estate_b", "hf_building_estate_c",
] as const;
/** Per-biome wilderness ground plates (bridge zones w0–w6). */
export const HF_WILD_BIOME_KEYS = [
  "hf_wild_biome_ruined_urban", "hf_wild_biome_industrial_cut", "hf_wild_biome_floodplain",
  "hf_wild_biome_undercity", "hf_wild_biome_debris_field", "hf_wild_biome_ash_wastes",
  "hf_wild_biome_meltdown",
] as const;
/** General world street props wishlist. */
export const HF_WORLD_PROP_KEYS = [
  "hf_prop_taxi_over", "hf_prop_dumpster_fire", "hf_prop_vending_broke", "hf_prop_slates",
  "hf_prop_cart_barricade", "hf_prop_holo_pole", "hf_prop_manhole_glow", "hf_prop_wanted_pole",
  "hf_prop_credit_pile", "hf_prop_puddle_neon", "hf_prop_subway_kiosk",
] as const;
/** First-three-hours city density pack: market, neon, residential, industrial and story props. */
export const HF_EARLY_WORLD_PROP_KEYS = [
  ...numberedKeys("hf_city_market", 12), ...numberedKeys("hf_city_neon", 12),
  ...numberedKeys("hf_city_residential", 10), ...numberedKeys("hf_city_industrial", 10),
  ...numberedKeys("hf_city_slum", 10), ...numberedKeys("hf_city_corporate", 8),
  ...numberedKeys("hf_city_landmark", 8), "hf_city_oddity_01",
  ...numberedKeys("hf_early_landmark", 8), ...numberedKeys("hf_early_furniture", 8),
  ...numberedKeys("hf_early_vendor", 8), ...numberedKeys("hf_early_storyprop", 8),
] as const;
/** Curated web-unlimited hero props generated as a single sharp contact sheet. */
export const HF_WEB_CITY_PROP_KEYS = [
  "hf_web_city_transit_kiosk", "hf_web_city_civic_clock", "hf_web_city_district_marker",
  "hf_web_city_checkpoint_arch", "hf_web_city_memorial_wall", "hf_web_city_public_terminal",
  "hf_web_city_fountain", "hf_web_city_antenna", "hf_web_city_noodle_cart",
  "hf_web_city_battery_stall", "hf_web_city_salvage_table", "hf_web_city_water_recycler",
  "hf_web_city_courier_locker", "hf_web_city_community_heater", "hf_web_city_transformer",
  "hf_web_city_generator",
] as const;
/** Full-frame district ground plates plus atlas-derived repeating floor materials. */
export const HF_GROUND_PLATE_KEYS = [
  "hf_ground_city_spawn", "hf_ground_downtown", "hf_ground_stacks", "hf_ground_spire",
  "hf_ground_docks", "hf_ground_undercity", "hf_ground_relay", "hf_ground_wastes", "hf_ground_core",
] as const;
export const HF_GROUND_TILE_KEYS = [
  ...numberedKeys("hf_ground_spawn_tile", 16),
  ...numberedKeys("hf_ground_city_tile", 16),
  ...numberedKeys("hf_ground_progress_tile", 16),
  ...numberedKeys("hf_ground_interior_tile", 16),
  ...numberedKeys("hf_ground_subway_tile", 16),
  ...numberedKeys("hf_ground_wilderness_tile", 16),
] as const;
/** Hub plaza landmarks + furniture. */
export const HF_LANDMARK_KEYS = [
  "hf_landmark_fountain", "hf_landmark_fountain_b", "hf_landmark_crucible",
  "hf_hub_bench", "hf_hub_bench_b", "hf_hub_planter",
] as const;
/** Wilderness corridor props. */
export const HF_WILD_PROP_KEYS = [
  "hf_wild_bridge_span", "hf_wild_bridge_span_b",
  "hf_wild_guardrail", "hf_wild_ash_pile", "hf_wild_salt_crust",
  "hf_wild_rust_car", "hf_wild_sign_post", "hf_wild_relay_pylon",
] as const;
/** ICE vault / dungeon props. */
export const HF_DUNGEON_PROP_KEYS = [
  "hf_dungeon_core_pedestal", "hf_dungeon_core_pedestal_b",
  "hf_dungeon_ice_crystal", "hf_dungeon_server_rack",
  "hf_dungeon_guardian_nest", "hf_dungeon_cable_curtain", "hf_dungeon_floor_hex",
] as const;
/** Landmark building multivariants (_b / _c). Base keys already in HF_BUILDING_KEYS. */
export const HF_BUILDING_VARIANT_KEYS = [
  "hf_building_bar_b", "hf_building_bar_c",
  "hf_building_clinic_b", "hf_building_clinic_c",
  "hf_building_shop_b", "hf_building_shop_c",
  "hf_building_guild_b", "hf_building_guild_c",
  "hf_building_home_b", "hf_building_home_c",
  "hf_building_den_b", "hf_building_den_c",
  "hf_building_subway_b", "hf_building_hotel_b",
  "hf_building_noodle_b", "hf_building_noodle_c", "hf_building_subway_c",
  "hf_building_hotel_c", "hf_building_stadium_b", "hf_building_stadium_c",
  "hf_building_citycenter_b", "hf_building_citycenter_c",
  ...["ripperdoc", "pawn", "arcade", "garage", "radio"].flatMap((s) => [`hf_building_${s}_b`, `hf_building_${s}_c`]),
] as const;
/** District kit multivariants. */
export const HF_DIST_BUILDING_VARIANT_KEYS = [
  "hf_building_dist_core_b", "hf_building_dist_sprawl_b", "hf_building_dist_undercity_b",
  "hf_building_dist_docks_b", "hf_building_dist_stacks_b", "hf_building_dist_spire_b",
  "hf_building_dist_wastes_b", "hf_building_dist_relay_b", "hf_building_dist_helios_b",
  ...["core", "sprawl", "undercity", "docks", "stacks", "spire", "wastes", "relay", "helios"].map((s) => `hf_building_dist_${s}_c`),
  ...["market", "park", "corporate", "arcology", "kernel"].flatMap((s) => [`hf_building_dist_${s}_b`, `hf_building_dist_${s}_c`]),
] as const;

/** Pick base or _b/_c variant by stable salt when textures exist. */
export function pickHfVariant(
  exists: (key: string) => boolean,
  base: string,
  salt: number,
  max = 3,
): string {
  const candidates: string[] = [base];
  if (max >= 2) candidates.push(base + "_b");
  if (max >= 3) candidates.push(base + "_c");
  const ok = candidates.filter((k) => exists(k));
  if (ok.length === 0) return base;
  return ok[Math.abs(salt) % ok.length];
}

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
    // 256×64 sheet = 8×2 grid of 32×32 (16 frames: 0-7 float, 8-14 attack, 15 empty).
    // Framed at 64 this sliced into 4 frames that each showed a 2×2 block of four wraiths;
    // OnlineScene's `frameTotal - 1` cycle only makes sense against the 16-frame read.
    { key: GUARDIAN_WRAITH_KEY, file: "assets/sprites/guardian_wraith.png", ...CHAR },
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
    // Premium dialogue portraits — painted Higgsfield busts (fixer + runner singles).
    { key: PORTRAIT_PLAYER_KEY, file: "assets/portraits/painted_player.jpg" },
    { key: PORTRAIT_NPC_KEY, file: "assets/portraits/painted_fixer.jpg" },
    // Boss + interact singles and cast sheets load in OnlineScene (first use).
  ],
  ui: [
    // Real art (PixelWhale pack + Higgsfield HUD kit via tools/higgsfield-hud-build.mjs).
    // Procedural bake in textures.ts only fills keys still missing after load.
    { key: UI_FRAME_KEY, file: "assets/ui/skill_frame_hf.png" },
    { key: UI_GUN_KEY, file: "assets/ui/gun_hf_01.png" },
    { key: UI_PANEL_KEY, file: "assets/ui/hud_panel.png" },
    { key: UI_BTN_RING_KEY, file: "assets/ui/btn_ring.png" },
    { key: UI_BTN_RING_ALT_KEY, file: "assets/ui/btn_ring_alt.png" },
    { key: IDENTITY_PANEL_KEY, file: "assets/ui/identity_panel.png" },
    { key: IDENTITY_BTN_PRIMARY_KEY, file: "assets/ui/identity_btn_primary.png" },
    { key: IDENTITY_BTN_SECONDARY_KEY, file: "assets/ui/identity_btn_secondary.png" },
    { key: IDENTITY_MARK_KEY, file: "assets/ui/identity_mark.png" },
    // Prefer expand-pack ability_hf_* files where they are the painted source.
    { key: "ability_dash", file: "assets/ui/ability_hf_dash.png" },
    { key: "ability_shield", file: "assets/ui/ability_hf_shield.png" },
    { key: "ability_pulse", file: "assets/ui/ability_hf_pulse.png" },
    { key: "ability_virus", file: "assets/ui/ability_hf_cone.png" },
    { key: "ability_rail", file: "assets/ui/ability_hf_rail.png" },
    { key: "ability_overdrive", file: "assets/ui/ability_hf_ult.png" },
    { key: "ability_blade", file: "assets/ui/ability_hf_drones.png" },
    { key: "ability_radar", file: "assets/ui/ability_hf_radar.png" },
    // Also register ability_hf_* keys so MobileControls / class kits can opt in by name.
    ...ABILITY_HF_ICON_KEYS.map((k) => ({ key: k, file: `assets/ui/${k}.png` })),
    ...HF_GUN_KEYS.map((k) => ({ key: k, file: `assets/ui/${k}.png` })),
    ...LOOT_ICON_KEYS.map((k) => ({ key: k, file: `assets/ui/${k}.png` })),
    ...CREST_ICON_KEYS.map((k) => ({ key: k, file: `assets/ui/${k}.png` })),
    { key: METRO_TOKEN_KEY, file: "assets/ui/metro_token.png" },
    { key: MENU_BG_KEY, file: "assets/ui/menu_bg.jpg" }, // painted menu key art
    // Class cards are loaded by SelectScene, where they are first used. First-time
    // players no longer download ~0.5 MB of menu art before the cold open.
  ],
  // Build-time generated VO + the per-environment music beds (ElevenLabs). The
  // beds are OPTIONAL: only those whose mp3 actually exists in src/assets/music/
  // get a `url` (resolved by import.meta.glob in musicTracks.ts) and are listed
  // here — so nothing 404s / mis-decodes, and any missing environment falls back
  // to the procedural Synth. See tools/gen-vo.sh, tools/gen-music.mjs + ART_NOTES.md.
  audio: [
    { key: VO_MELTDOWN_KEY, file: "assets/audio/meltdown_vo.mp3" },
    // Seed Audio SFX + boss stinger (lazy-friendly; small WAVs).
    ...SFX_KEYS.map((k) => ({ key: k, file: `assets/sfx/${k}.wav` })),
    { key: STINGER_BOSS_KEY, file: "assets/music/stinger_boss.m4a" },
    // Only the MENU bed ships in the boot payload; the other nine (~4.9MB) stream
    // in lazily on first entry to their environment (MusicDirector.lazyLoad — the
    // procedural Synth covers the gap). Cuts time-to-first-play sharply on phones
    // and keeps boot from gating on a big batch of audio decodes.
    ...MUSIC_TRACKS.filter((t) => t.url && t.env === "menu").map((t) => ({ key: t.key, file: t.url! })),
  ],
  // Real item icons — load before the procedural bake so they win (see ICON_NAMES above).
  icons: [
    ...ICON_NAMES.map((n) => ({ key: "icon_" + n, file: "assets/icons/" + n + ".png" })),
    ...HF_SERVICE_ICON_KEYS.map((n) => ({ key: "hf_service_" + n, file: "assets/icons/hf_service_" + n + ".png" })),
  ],
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
    // Higgsfield top-down landmark buildings (tools/higgsfield-building-build.mjs).
    ...HF_BUILDING_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_BUILDING_VARIANT_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    // District kits + contagion-damaged variants (tools/higgsfield-expand-build.mjs).
    ...HF_DIST_BUILDING_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_DIST_BUILDING_VARIANT_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_INF_BUILDING_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_DIST_INF_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    // Wishlist + expanse packs — missing files skip silently at load (BootScene loaderror).
    ...HF_SUBWAY_PROP_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_SUBWAY_EXPANSION_PROP_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_SUBWAY_IDENTITY_PROP_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_BUSINESS_PROP_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    // Full-bleed plates ship as WebP (~8× smaller, alpha preserved; see tools/plates-to-webp.mjs).
    ...HF_SUBWAY_TILE_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".webp" })),
    ...HF_DIST_PROP_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_WORLD_PROP_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_EARLY_WORLD_PROP_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_WEB_CITY_PROP_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_GROUND_PLATE_KEYS.map((k) => ({ key: k, file: "assets/tilesets/" + k + ".png" })),
    ...HF_GROUND_TILE_KEYS.map((k) => ({ key: k, file: "assets/tilesets/" + k + ".png" })),
    ...HF_LOADING_KEYS.map((key) => ({ key, file: `assets/ui/${key}.png` })),
    ...HF_LANDMARK_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_WILD_PROP_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_DUNGEON_PROP_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_INT_ROOM_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".webp" })),
    ...HF_LAYOUT_PLATE_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".webp" })),
    // Holistic tier — env-identity kits, estates, per-biome wilderness plates.
    ...HF_ENV_KIT_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_ESTATE_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_WILD_BIOME_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
  ],
  // Real isometric cyberpunk crates/containers — non-colliding cargo decals (asset-drop).
  decals: [
    ...DECO_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    // Higgsfield top-down props (tools/higgsfield-hud-build.mjs) — street scatter pool.
    ...HF_PROP_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
  ],
  // Real isometric tech machines — building-interior set-dressing (asset-drop).
  // + wishlist HF furniture (sofa/terminal/locker/…) when present.
  interior: [
    ...OBJ_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
    ...HF_FURN_KEYS.map((k) => ({ key: k, file: "assets/objects/" + k + ".png" })),
  ],
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

/** Large world-only packs do not block the title/cold-open boot. */
export const DEFERRED_WORLD_CATEGORIES = new Set(["props", "decals", "interior"]);

const assetSet = (...groups: ReadonlyArray<ReadonlyArray<string>>): Set<string> =>
  new Set(groups.flatMap((g) => [...g]));

// One authored exterior per kind is enough to establish identity at zone entry.
// Variant siblings remain available for future background streaming, but decoding
// every sibling before first play recreated the original boot wall.
const GENERAL_BUILDINGS = assetSet(HF_BUILDING_KEYS);
const GENERIC_WORLD = assetSet(HF_PROP_KEYS);

// Campaign order is NOT HF_DIST_BUILDING_KEYS order. Keep this explicit: index-based
// routing loaded Sprawl art for Anduril Yards, then the renderer requested Stacks and
// found nothing, leaving scenery footprints as bare roof tiles.
const DISTRICT_ART_KITS: ReadonlyArray<ReadonlyArray<string>> = [
  ["hf_building_dist_core"],
  ["hf_building_dist_stacks"],
  ["hf_building_dist_spire"],
  ["hf_building_dist_docks"],
  ["hf_building_dist_undercity"],
  ["hf_building_dist_relay"],
  ["hf_building_dist_wastes"],
  ["hf_building_dist_kernel", "hf_building_dist_core"],
];

/** Deterministic daily gallery: every generated asset enters rotation without forcing
 * phones to decode the entire expansion pack on one zone transition. */
function dailyArtSelection(keys: ReadonlyArray<string>, max: number): string[] {
  if (keys.length <= max) return [...keys];
  const day = Math.floor(Date.now() / 86_400_000);
  const start = Math.abs(day * 37) % keys.length;
  const step = 31; // coprime with the current pack sizes; distributes themes, not runs
  const picked: string[] = [];
  const seen = new Set<number>();
  for (let i = 0; picked.length < max && i < keys.length * 2; i++) {
    const at = (start + i * step) % keys.length;
    if (!seen.has(at)) { seen.add(at); picked.push(keys[at]); }
  }
  return picked;
}

/**
 * World art required by one logical zone. Missing packs still use procedural
 * fallbacks, but unrelated subway/wilderness/interior art is no longer decoded.
 */
export function deferredWorldAssetsForZone(zone: string): AssetEntry[] {
  const wanted = new Set<string>();
  // Small authored vehicles/decals/machines are shared and cheap enough to keep.
  for (const a of [...ASSETS.props, ...ASSETS.decals, ...ASSETS.interior]) {
    if (!a.key.startsWith("hf_")) wanted.add(a.key);
  }
  for (const key of GENERIC_WORLD) wanted.add(key);

  const add = (keys: ReadonlyArray<string>) => keys.forEach((k) => wanted.add(k));
  const logical = zone || "tutorial";
  const district = /^d(\d+)$/.exec(logical);
  const venue = /^d\d+i\d+$/.test(logical) || /^h\d+$/.test(logical) || /^(bar|clinic|shop|den)$/.test(logical);

  if (logical === "safe") {
    add([...GENERAL_BUILDINGS]);
    add(dailyArtSelection(HF_BUILDING_VARIANT_KEYS, 22));
    add(dailyArtSelection(HF_DIST_BUILDING_VARIANT_KEYS, 12));
    add(HF_ENV_KIT_KEYS);
    add(HF_WORLD_PROP_KEYS);
    add(dailyArtSelection(HF_EARLY_WORLD_PROP_KEYS, 48));
    add(HF_WEB_CITY_PROP_KEYS);
    add(["hf_ground_city_spawn"]);
    add(numberedKeys("hf_ground_city_tile", 16));
    add(numberedKeys("hf_ground_progress_tile", 16));
    add(["hf_loading_early_city"]);
  } else if (district) {
    add([...GENERAL_BUILDINGS]);
    add(dailyArtSelection(HF_BUILDING_VARIANT_KEYS, 18));
    const i = Math.max(0, Math.min(DISTRICT_ART_KITS.length - 1, Number(district[1]) || 0));
    const districtKits = DISTRICT_ART_KITS[i] ?? DISTRICT_ART_KITS[0];
    add(districtKits);
    for (const kit of districtKits) {
      add(HF_DIST_BUILDING_VARIANT_KEYS.filter((k) => k.startsWith(kit + "_")));
      const infectedKit = `${kit}_inf`;
      if ((HF_DIST_INF_KEYS as readonly string[]).includes(infectedKit)) add([infectedKit]);
    }
    add(HF_INF_BUILDING_KEYS);
    add(HF_DIST_PROP_KEYS);
    add(HF_WORLD_PROP_KEYS);
    add(dailyArtSelection(HF_EARLY_WORLD_PROP_KEYS, 40));
    add(HF_WEB_CITY_PROP_KEYS);
    const groundDistrictIds = ["downtown", "stacks", "spire", "docks", "undercity", "relay", "wastes", "core"];
    const groundDistrictId = groundDistrictIds[Math.max(0, Number(district[1]) || 0)];
    if (groundDistrictId) add([`hf_ground_${groundDistrictId}`]);
    add(numberedKeys("hf_ground_city_tile", 16));
    add(numberedKeys("hf_ground_progress_tile", 16));
    add(HF_LANDMARK_KEYS);
  } else if (logical === "subway") {
    add(HF_SUBWAY_PROP_KEYS);
    // Mobile Safari/Phantom can kill the WebGL context when the zone handoff tries
    // to decode the entire 160MB generated subway library in one preload. Keep the
    // authored structural essentials, then rotate a compact gallery per day. The
    // render pass already skips unloaded variants and falls back to the base modules.
    add(dailyArtSelection(HF_SUBWAY_EXPANSION_PROP_KEYS, 10));
    add(dailyArtSelection(HF_SUBWAY_IDENTITY_PROP_KEYS, 6));
    add(dailyArtSelection(HF_SUBWAY_TILE_KEYS, 14));
    add(dailyArtSelection(numberedKeys("hf_ground_subway_tile", 16), 4));
    add(dailyArtSelection(numberedKeys("hf_ground_progress_tile", 16), 2));
    add(["hf_loading_subway"]);
    add(HF_DUNGEON_PROP_KEYS);
  } else if (logical === "estates" || /^est\d+$/.test(logical)) {
    add(HF_ESTATE_KEYS);
    add(HF_FURN_KEYS);
  } else if (venue) {
    add(HF_INT_ROOM_KEYS);
    add(HF_BUSINESS_PROP_KEYS);
    add(numberedKeys("hf_ground_interior_tile", 16));
    add(["hf_loading_hotel"]);
    add(HF_FURN_KEYS);
  } else if (/^(w\d+|b\d+)$/.test(logical)) {
    add(HF_WILD_BIOME_KEYS);
    add(HF_WILD_PROP_KEYS);
    add(numberedKeys("hf_ground_wilderness_tile", 16));
  } else if (/^(v\d+|dive)/.test(logical)) {
    add(HF_DUNGEON_PROP_KEYS);
  }

  return [...ASSETS.props, ...ASSETS.decals, ...ASSETS.interior].filter((a) => wanted.has(a.key));
}
