#!/usr/bin/env node
/**
 * METROPHAGE — generate wishlist assets via Higgsfield GPT Image 2, key black,
 * trim, downscale into public/assets/objects|portraits|ui.
 *
 * Usage:
 *   node tools/higgsfield-wishlist-gen.mjs              # generate + process
 *   node tools/higgsfield-wishlist-gen.mjs --process     # re-process only
 *   node tools/higgsfield-wishlist-gen.mjs --only subway # subset by tag
 *   node tools/higgsfield-wishlist-gen.mjs --dry         # list jobs only
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(root, "art-source/higgsfield/gen-raw");
const OUT_OBJ = path.join(root, "public/assets/objects");
const OUT_PORT = path.join(root, "public/assets/portraits");
const OUT_UI = path.join(root, "public/assets/ui");

const STYLE =
  "Top-down orthographic 90-degree game sprite for a neon-noir cyberpunk 2D RPG. Pure solid black background (#000000). Single centered object, no text labels, no UI chrome, no watermark. Readable silhouette, crisp edges, cyan/magenta/amber neon accents, dark metal and wet concrete materials. Not isometric, not 3/4 view, not perspective street photo. Game asset, clean alpha-friendly on black.";

const STYLE_BUST =
  "Painted cyberpunk character bust portrait, shoulders-up, neon-noir lighting, dark background, high contrast, METROPHAGE style, no text, no watermark, cinematic still.";

/** @type {Array<{id:string,tag:string,out:string,kind:'prop'|'plate'|'building'|'portrait'|'ui',maxSide:number,prompt:string,quality?:string,resolution?:string}>} */
const JOBS = [
  // ── Subway / THE UNDERLINE ──────────────────────────────────────────────
  {
    id: "hf_subway_platform_hub",
    tag: "subway",
    out: "objects/hf_subway_platform_hub.png",
    kind: "prop",
    maxSide: 160,
    prompt: `${STYLE} Subway station platform TOP-DOWN: safe hub station, green emergency lights, clean platform tiles, ticket gates, cyan neon "HUB" strip, empty benches, no people.`,
  },
  {
    id: "hf_subway_platform_mid",
    tag: "subway",
    out: "objects/hf_subway_platform_mid.png",
    kind: "prop",
    maxSide: 160,
    prompt: `${STYLE} Mid-line subway station platform TOP-DOWN: amber warning lights, cracked tiles, graffiti, flickering fluorescent strips, trash bags, medium threat vibe.`,
  },
  {
    id: "hf_subway_platform_deep",
    tag: "subway",
    out: "objects/hf_subway_platform_deep.png",
    kind: "prop",
    maxSide: 160,
    prompt: `${STYLE} Deep abandoned subway station platform TOP-DOWN: red emergency strobes, rusted rails edge, dark puddles, broken signs, nest of cables, horror cyberpunk.`,
  },
  {
    id: "hf_subway_tunnel_straight",
    tag: "subway",
    out: "objects/hf_subway_tunnel_straight.png",
    kind: "prop",
    maxSide: 128,
    prompt: `${STYLE} Straight metro tunnel segment TOP-DOWN: twin rails, gravel bed, wall pipes, sparse cyan work lights, walkable center strip.`,
  },
  {
    id: "hf_subway_tunnel_junction",
    tag: "subway",
    out: "objects/hf_subway_tunnel_junction.png",
    kind: "prop",
    maxSide: 140,
    prompt: `${STYLE} T-junction metro tunnel TOP-DOWN: three-way rails merge, switch box, warning chevrons, cyan and magenta signal lamps.`,
  },
  {
    id: "hf_subway_tunnel_cross",
    tag: "subway",
    out: "objects/hf_subway_tunnel_cross.png",
    kind: "prop",
    maxSide: 140,
    prompt: `${STYLE} Four-way cross metro tunnel TOP-DOWN: rails in + shape, central switching diamond, emergency arrows painted on floor.`,
  },
  {
    id: "hf_subway_train_dead",
    tag: "subway",
    out: "objects/hf_subway_train_dead.png",
    kind: "prop",
    maxSide: 180,
    prompt: `${STYLE} Abandoned subway train car TOP-DOWN wreck: long rectangle car on rails, smashed windows glow faint cyan inside, rust, graffiti, no people.`,
  },
  {
    id: "hf_subway_train_dead_b",
    tag: "subway",
    out: "objects/hf_subway_train_dead_b.png",
    kind: "prop",
    maxSide: 160,
    prompt: `${STYLE} Short dead metro carriage TOP-DOWN: derailed slightly, doors open black voids, emergency lights red, scrap metal.`,
  },
  {
    id: "hf_subway_signal",
    tag: "subway",
    out: "objects/hf_subway_signal.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Small subway signal light box TOP-DOWN: pole base with red/amber/cyan lamps, switch lever, compact prop.`,
  },
  {
    id: "hf_subway_gore",
    tag: "subway",
    out: "objects/hf_subway_gore.png",
    kind: "prop",
    maxSide: 80,
    prompt: `${STYLE} Monster nest on metro tracks TOP-DOWN: cable cocoon, bone-like scrap, glowing violet slime puddle, horror cyberpunk clutter pile, no human body graphic gore.`,
  },
  {
    id: "hf_subway_exit",
    tag: "subway",
    out: "objects/hf_subway_exit.png",
    kind: "prop",
    maxSide: 96,
    prompt: `${STYLE} Subway surface exit escalator shaft TOP-DOWN: rectangular stairwell hole with cyan handrails, "EXIT" chevrons, steam vents.`,
  },
  {
    id: "hf_subway_booth",
    tag: "subway",
    out: "objects/hf_subway_booth.png",
    kind: "prop",
    maxSide: 96,
    prompt: `${STYLE} Transit warden ticket booth TOP-DOWN: glass cube kiosk, cyan neon edges, ticket machine, small roof, no person inside.`,
  },
  {
    id: "hf_subway_ghost_train",
    tag: "subway",
    out: "objects/hf_subway_ghost_train.png",
    kind: "prop",
    maxSide: 200,
    prompt: `${STYLE} Semi-transparent ghost express train TOP-DOWN silhouette: long glowing cyan wireframe metro car, motion blur streaks, ethereal, black background.`,
  },
  {
    id: "hf_enemy_rail_wraith",
    tag: "subway",
    out: "objects/hf_enemy_rail_wraith.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Top-down enemy creature: elongated rail wraith, thin body hanging over tracks, pale cyan limbs, no face detail, horror cyberpunk monster token, single unit.`,
  },
  {
    id: "hf_enemy_ticket_specter",
    tag: "subway",
    out: "objects/hf_enemy_ticket_specter.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Top-down enemy: ruined metro uniform humanoid specter, stamp-hand raised, magenta accents, undead conductor, single game unit token.`,
  },
  {
    id: "hf_enemy_tunnel_centipede",
    tag: "subway",
    out: "objects/hf_enemy_tunnel_centipede.png",
    kind: "prop",
    maxSide: 72,
    prompt: `${STYLE} Top-down chrome insect centipede enemy: multi-segment metal body, yellow hazard stripes, many legs, cyberpunk bug monster token.`,
  },
  {
    id: "hf_enemy_platform_husk",
    tag: "subway",
    out: "objects/hf_enemy_platform_husk.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Top-down frozen commuter husk enemy: humanoid mid-stride stuck in ICE frost, cyan crackle, cyberpunk zombie token, single unit.`,
  },
  {
    id: "portrait_boss_underline_warden",
    tag: "subway",
    out: "portraits/bosses/underline_warden.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} THE UNDERLINE WARDEN subway boss: lantern-headed figure in long tattered conductor coat stuffed with glowing tickets, red emergency light, terrifying metro spirit.`,
  },

  // ── District street clutter (2 signature props each) ────────────────────
  {
    id: "hf_distprop_plaza_drone",
    tag: "district",
    out: "objects/hf_distprop_plaza_drone.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Confiscated police surveillance drone on pavement TOP-DOWN, magenta LEDs, RFID clamp, Palantir Plaza vibe.`,
  },
  {
    id: "hf_distprop_plaza_tape",
    tag: "district",
    out: "objects/hf_distprop_plaza_tape.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Police tape spool and ticket stubs pile TOP-DOWN, magenta and cyan tape, cyberpunk plaza clutter.`,
  },
  {
    id: "hf_distprop_stacks_barrel",
    tag: "district",
    out: "objects/hf_distprop_stacks_barrel.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Industrial oil drums cluster TOP-DOWN, toxic green hazard markings, The Stacks factory district.`,
  },
  {
    id: "hf_distprop_stacks_slag",
    tag: "district",
    out: "objects/hf_distprop_stacks_slag.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Slag pile and hard-hat rack TOP-DOWN, industrial scrap, green neon hazard, factory clutter.`,
  },
  {
    id: "hf_distprop_spire_drone",
    tag: "district",
    out: "objects/hf_distprop_spire_drone.png",
    kind: "prop",
    maxSide: 48,
    prompt: `${STYLE} Luxury champagne delivery drone TOP-DOWN, cool blue LEDs, elite Spire district, polished chrome.`,
  },
  {
    id: "hf_distprop_spire_barrier",
    tag: "district",
    out: "objects/hf_distprop_spire_barrier.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Velvet rope VIP barrier and keycard pedestal TOP-DOWN, blue neon, luxury tower district.`,
  },
  {
    id: "hf_distprop_docks_crate",
    tag: "district",
    out: "objects/hf_distprop_docks_crate.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Shipping crate and fishing nets pile TOP-DOWN, wet salt stains, cyan dockyard neon, tidal docks.`,
  },
  {
    id: "hf_distprop_docks_buoy",
    tag: "district",
    out: "objects/hf_distprop_docks_buoy.png",
    kind: "prop",
    maxSide: 48,
    prompt: `${STYLE} Mooring post with buoy and oil sheen ring TOP-DOWN, cyan accents, wet docks prop.`,
  },
  {
    id: "hf_distprop_under_grow",
    tag: "district",
    out: "objects/hf_distprop_under_grow.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Underground mushroom grow-box TOP-DOWN, violet biotech glow, cable nests, Undercity cult district.`,
  },
  {
    id: "hf_distprop_under_grate",
    tag: "district",
    out: "objects/hf_distprop_under_grate.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Flooded manhole grate with violet cult chalk marks TOP-DOWN, Undercity, glowing from below.`,
  },
  {
    id: "hf_distprop_relay_spool",
    tag: "district",
    out: "objects/hf_distprop_relay_spool.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Fiber optic cable spool TOP-DOWN, amber LED tags, Relay Grid data district, tech clutter.`,
  },
  {
    id: "hf_distprop_relay_board",
    tag: "district",
    out: "objects/hf_distprop_relay_board.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Burnt server board and heat sink pile TOP-DOWN, amber sparking LEDs, uplink industrial scrap.`,
  },
  {
    id: "hf_distprop_wastes_tire",
    tag: "district",
    out: "objects/hf_distprop_wastes_tire.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Tire pile and stripped car husk TOP-DOWN, rust orange, radiation tags, Wastes scrapyard.`,
  },
  {
    id: "hf_distprop_wastes_idol",
    tag: "district",
    out: "objects/hf_distprop_wastes_idol.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Scrap metal idol shrine TOP-DOWN, rust and dead neon tubes, wasteland cult prop.`,
  },
  {
    id: "hf_distprop_kernel_core",
    tag: "district",
    out: "objects/hf_distprop_kernel_core.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Hexagonal memory core pedestal TOP-DOWN, red emergency light, black ICE glass, Kernel fortress prop.`,
  },
  {
    id: "hf_distprop_kernel_mannequin",
    tag: "district",
    out: "objects/hf_distprop_kernel_mannequin.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Frozen mannequin mid-pose TOP-DOWN, white sterile light, cable throne base, Kernel horror prop.`,
  },

  // ── Distinct district building kits (missing unique exteriors) ──────────
  {
    id: "hf_building_dist_spire",
    tag: "building",
    out: "objects/hf_building_dist_spire.png",
    kind: "building",
    maxSide: 224,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE} Luxury arcology tower block TOP-DOWN: glass spire roof, private lift core, cool blue neon, skybridge stubs, elite Spire district building footprint.`,
  },
  {
    id: "hf_building_dist_wastes",
    tag: "building",
    out: "objects/hf_building_dist_wastes.png",
    kind: "building",
    maxSide: 224,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE} Scrap fortress building TOP-DOWN: hull-plate roof, lean-to walls, rust orange dead neon, Wastes district structure footprint.`,
  },
  {
    id: "hf_building_dist_relay",
    tag: "building",
    out: "objects/hf_building_dist_relay.png",
    kind: "building",
    maxSide: 224,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE} Antenna farm server vault building TOP-DOWN: dish rings on roof, Faraday cage mesh, amber PACKET/TOLL LEDs, Relay Grid structure.`,
  },

  // ── Hub interiors / furniture ───────────────────────────────────────────
  {
    id: "hf_furn_sofa",
    tag: "interior",
    out: "objects/hf_furn_sofa.png",
    kind: "prop",
    maxSide: 72,
    prompt: `${STYLE} Cyberpunk apartment sofa TOP-DOWN, dark fabric, neon pink piping, estate furniture.`,
  },
  {
    id: "hf_furn_terminal",
    tag: "interior",
    out: "objects/hf_furn_terminal.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Hacking terminal desk TOP-DOWN, cyan screen glow, keyboard, cables, interior prop.`,
  },
  {
    id: "hf_furn_locker",
    tag: "interior",
    out: "objects/hf_furn_locker.png",
    kind: "prop",
    maxSide: 48,
    prompt: `${STYLE} Metal gear locker TOP-DOWN, closed doors, yellow hazard stripe, interior prop.`,
  },
  {
    id: "hf_furn_plant",
    tag: "interior",
    out: "objects/hf_furn_plant.png",
    kind: "prop",
    maxSide: 40,
    prompt: `${STYLE} Neon grow-lamp planter TOP-DOWN, green plant under magenta light, apartment prop.`,
  },
  {
    id: "hf_furn_neon_lamp",
    tag: "interior",
    out: "objects/hf_furn_neon_lamp.png",
    kind: "prop",
    maxSide: 40,
    prompt: `${STYLE} Floor neon lamp TOP-DOWN, cyan glow ring, cyberpunk apartment light prop.`,
  },
  {
    id: "hf_furn_bar_counter",
    tag: "interior",
    out: "objects/hf_furn_bar_counter.png",
    kind: "prop",
    maxSide: 96,
    prompt: `${STYLE} Bar counter with bottles TOP-DOWN, L-shape, magenta neon underglow, Feral Cat bar interior.`,
  },
  {
    id: "hf_furn_clinic_bed",
    tag: "interior",
    out: "objects/hf_furn_clinic_bed.png",
    kind: "prop",
    maxSide: 72,
    prompt: `${STYLE} Clinic medical bed TOP-DOWN, green cross accent, IV stand, clean white and cyan.`,
  },
  {
    id: "hf_furn_war_table",
    tag: "interior",
    out: "objects/hf_furn_war_table.png",
    kind: "prop",
    maxSide: 80,
    prompt: `${STYLE} Guild war table TOP-DOWN, holographic city map on table, cyan projection, HQ interior.`,
  },

  // ── World street props ──────────────────────────────────────────────────
  {
    id: "hf_prop_taxi_over",
    tag: "world",
    out: "objects/hf_prop_taxi_over.png",
    kind: "prop",
    maxSide: 80,
    prompt: `${STYLE} Overturned taxi cab TOP-DOWN, yellow body, broken windows cyan glow, street wreck prop.`,
  },
  {
    id: "hf_prop_dumpster_fire",
    tag: "world",
    out: "objects/hf_prop_dumpster_fire.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Dumpster with ember fire TOP-DOWN, orange flame tips, street clutter cyberpunk.`,
  },
  {
    id: "hf_prop_vending_broke",
    tag: "world",
    out: "objects/hf_prop_vending_broke.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Broken vending machine TOP-DOWN, shattered glass, magenta sodas spilled, street prop.`,
  },
  {
    id: "hf_prop_slates",
    tag: "world",
    out: "objects/hf_prop_slates.png",
    kind: "prop",
    maxSide: 48,
    prompt: `${STYLE} Stack of data-slates TOP-DOWN, glowing screens cyan, street tech clutter.`,
  },
  {
    id: "hf_prop_cart_barricade",
    tag: "world",
    out: "objects/hf_prop_cart_barricade.png",
    kind: "prop",
    maxSide: 72,
    prompt: `${STYLE} Shopping cart barricade TOP-DOWN, chained carts, street blockade prop.`,
  },
  {
    id: "hf_prop_holo_pole",
    tag: "world",
    out: "objects/hf_prop_holo_pole.png",
    kind: "prop",
    maxSide: 48,
    prompt: `${STYLE} Holo-ad projector pole TOP-DOWN, glowing ad plate cyan/magenta, street furniture.`,
  },
  {
    id: "hf_prop_manhole_glow",
    tag: "world",
    out: "objects/hf_prop_manhole_glow.png",
    kind: "prop",
    maxSide: 48,
    prompt: `${STYLE} Manhole cover with violet glow leaking TOP-DOWN, subway teaser street prop.`,
  },
  {
    id: "hf_prop_wanted_pole",
    tag: "world",
    out: "objects/hf_prop_wanted_pole.png",
    kind: "prop",
    maxSide: 48,
    prompt: `${STYLE} Wanted poster pole TOP-DOWN, layered paper posters, red stamps, street prop.`,
  },
  {
    id: "hf_prop_credit_pile",
    tag: "world",
    out: "objects/hf_prop_credit_pile.png",
    kind: "prop",
    maxSide: 40,
    prompt: `${STYLE} Small pile of credit chips TOP-DOWN, gold and cyan, loot-adjacent street prop non-interactive look.`,
  },
  {
    id: "hf_prop_puddle_neon",
    tag: "world",
    out: "objects/hf_prop_puddle_neon.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Rain puddle decal TOP-DOWN with neon magenta cyan reflection, flat wet street decal, soft edges.`,
  },

  // ── Plaza / hub landmarks ───────────────────────────────────────────────
  {
    id: "hf_landmark_fountain",
    tag: "hub",
    out: "objects/hf_landmark_fountain.png",
    kind: "prop",
    maxSide: 120,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE} Civic Spire plaza holo-fountain TOP-DOWN: circular fountain with cyan holographic water tree rising, city center landmark.`,
  },
  {
    id: "hf_landmark_crucible",
    tag: "hub",
    out: "objects/hf_landmark_crucible.png",
    kind: "prop",
    maxSide: 140,
    prompt: `${STYLE} Arena floor decal TOP-DOWN: circular Crucible combat ring, red hazard chevrons, neon boundary, stadium landmark plate.`,
  },
  {
    id: "hf_prop_subway_kiosk",
    tag: "hub",
    out: "objects/hf_prop_subway_kiosk.png",
    kind: "prop",
    maxSide: 72,
    prompt: `${STYLE} Street-level subway entrance kiosk TOP-DOWN: small glass canopy over stairs down, cyan "METRO" glow, freestanding prop.`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPANSE P0 — multivariants + structure + interiors + wilderness + dungeon
  // tag: "expanse"  →  node tools/higgsfield-wishlist-gen.mjs --only expanse
  // Prefer low quality for props; medium for structural buildings.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Subway structure wrap (stations sized around these) ───────────────────
  {
    id: "hf_subway_ticket_hall",
    tag: "expanse",
    out: "objects/hf_subway_ticket_hall.png",
    kind: "prop",
    maxSide: 140,
    quality: "medium",
    prompt: `${STYLE} Subway ticket hall TOP-DOWN: rectangular hall north of platform, ticket gates row, cyan floor arrows, benches along walls, no people.`,
  },
  {
    id: "hf_subway_ticket_hall_b",
    tag: "expanse",
    out: "objects/hf_subway_ticket_hall_b.png",
    kind: "prop",
    maxSide: 140,
    prompt: `${STYLE} Subway ticket hall TOP-DOWN variant B: dirtier mid-line station, amber lights, cracked tiles, graffiti, same layout language.`,
  },
  {
    id: "hf_subway_escalator_mouth",
    tag: "expanse",
    out: "objects/hf_subway_escalator_mouth.png",
    kind: "prop",
    maxSide: 100,
    quality: "medium",
    prompt: `${STYLE} Subway escalator mouth TOP-DOWN: large rectangular stairwell opening with cyan handrails, steam vents, EXIT chevrons, freestanding structure.`,
  },
  {
    id: "hf_subway_escalator_mouth_b",
    tag: "expanse",
    out: "objects/hf_subway_escalator_mouth_b.png",
    kind: "prop",
    maxSide: 100,
    prompt: `${STYLE} Subway escalator mouth TOP-DOWN variant B: rusted deep-station shaft, red emergency light, broken rail, dark void stairs.`,
  },
  {
    id: "hf_subway_apron",
    tag: "expanse",
    out: "objects/hf_subway_apron.png",
    kind: "prop",
    maxSide: 160,
    prompt: `${STYLE} Subway platform floor apron TOP-DOWN: large rectangular tiled floor plate with safety yellow strip along track edge, cyan guide lines, no people.`,
  },
  {
    id: "hf_subway_apron_b",
    tag: "expanse",
    out: "objects/hf_subway_apron_b.png",
    kind: "prop",
    maxSide: 160,
    prompt: `${STYLE} Subway platform floor apron TOP-DOWN variant B: cracked deep tiles, red hazard strip, oil stains, abandoned feel.`,
  },
  {
    id: "hf_subway_track_bay",
    tag: "expanse",
    out: "objects/hf_subway_track_bay.png",
    kind: "prop",
    maxSide: 140,
    prompt: `${STYLE} Subway track bay TOP-DOWN: twin rails + gravel bed rectangle for parking a dead train, platform edge on one side, work lights.`,
  },
  {
    id: "hf_subway_platform_hub_b",
    tag: "expanse",
    out: "objects/hf_subway_platform_hub_b.png",
    kind: "prop",
    maxSide: 160,
    prompt: `${STYLE} Safe hub subway platform TOP-DOWN variant B: slightly different green emergency layout, cleaner benches left-side, cyan HUB strip alternate font style.`,
  },
  {
    id: "hf_subway_platform_mid_b",
    tag: "expanse",
    out: "objects/hf_subway_platform_mid_b.png",
    kind: "prop",
    maxSide: 160,
    prompt: `${STYLE} Mid subway platform TOP-DOWN variant B: more graffiti, trash bags opposite side, amber flicker strips different pattern.`,
  },
  {
    id: "hf_subway_platform_deep_b",
    tag: "expanse",
    out: "objects/hf_subway_platform_deep_b.png",
    kind: "prop",
    maxSide: 160,
    prompt: `${STYLE} Deep subway platform TOP-DOWN variant B: heavier rust, violet slime edge, broken pillar stubs, horror cyberpunk.`,
  },
  {
    id: "hf_subway_booth_b",
    tag: "expanse",
    out: "objects/hf_subway_booth_b.png",
    kind: "prop",
    maxSide: 96,
    prompt: `${STYLE} Transit ticket booth TOP-DOWN variant B: taller glass cube, magenta neon edges, slightly damaged, no person.`,
  },
  {
    id: "hf_subway_exit_b",
    tag: "expanse",
    out: "objects/hf_subway_exit_b.png",
    kind: "prop",
    maxSide: 96,
    prompt: `${STYLE} Subway exit escalator TOP-DOWN variant B: wider stair hole, amber rails, different chevron paint.`,
  },
  {
    id: "hf_subway_train_dead_c",
    tag: "expanse",
    out: "objects/hf_subway_train_dead_c.png",
    kind: "prop",
    maxSide: 180,
    prompt: `${STYLE} Abandoned subway car TOP-DOWN variant C: longer wreck, doors half open, violet interior glow, heavy graffiti.`,
  },

  // ── Landmark building multivariants ─────────────────────────────────────
  ...["bar", "clinic", "shop", "guild", "home", "den", "subway", "hotel"].map((slug) => ({
    id: `hf_building_${slug}_b`,
    tag: "expanse",
    out: `objects/hf_building_${slug}_b.png`,
    kind: "building",
    maxSide: 224,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE} Top-down cyberpunk building footprint VARIANT B of a ${slug}: same function, different roof geometry, neon color shift, slightly damaged edges, single structure, no people.`,
  })),
  ...["bar", "clinic", "shop", "guild", "home"].map((slug) => ({
    id: `hf_building_${slug}_c`,
    tag: "expanse",
    out: `objects/hf_building_${slug}_c.png`,
    kind: "building",
    maxSide: 224,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE} Top-down cyberpunk building footprint VARIANT C of a ${slug}: alternate materials (chrome/brick/mesh), different sign placement, unique silhouette vs variants A/B, no people.`,
  })),

  // ── District kit multivariants ──────────────────────────────────────────
  ...["core", "sprawl", "undercity", "docks", "stacks", "spire", "wastes", "relay", "helios"].map((slug) => ({
    id: `hf_building_dist_${slug}_b`,
    tag: "expanse",
    out: `objects/hf_building_dist_${slug}_b.png`,
    kind: "building",
    maxSide: 224,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE} District building kit VARIANT B for ${slug.toUpperCase()} district TOP-DOWN: same district material language, different massing/roof, slightly worn, single footprint, no people.`,
  })),

  // ── Interior structural anchors ─────────────────────────────────────────
  {
    id: "hf_int_bar_room",
    tag: "expanse",
    out: "objects/hf_int_bar_room.png",
    kind: "plate",
    maxSide: 180,
    quality: "medium",
    prompt: `${STYLE} Bar interior floor set TOP-DOWN: L-counter, stage corner, booth tables, magenta neon underglow, room plate for Feral Cat style venue, no people.`,
  },
  {
    id: "hf_int_clinic_room",
    tag: "expanse",
    out: "objects/hf_int_clinic_room.png",
    kind: "plate",
    maxSide: 180,
    quality: "medium",
    prompt: `${STYLE} Clinic interior floor set TOP-DOWN: reception counter, two med beds, green cross floor decal, cyan sterile lights, no people.`,
  },
  {
    id: "hf_int_shop_room",
    tag: "expanse",
    out: "objects/hf_int_shop_room.png",
    kind: "plate",
    maxSide: 180,
    quality: "medium",
    prompt: `${STYLE} Shop interior floor set TOP-DOWN: aisle shelves, register island, amber shop neon, crate stack, no people.`,
  },
  {
    id: "hf_int_guild_room",
    tag: "expanse",
    out: "objects/hf_int_guild_room.png",
    kind: "plate",
    maxSide: 180,
    quality: "medium",
    prompt: `${STYLE} Guild HQ interior floor set TOP-DOWN: central war table holo map, weapon racks, cyan accent, no people.`,
  },
  {
    id: "hf_int_den_room",
    tag: "expanse",
    out: "objects/hf_int_den_room.png",
    kind: "plate",
    maxSide: 160,
    quality: "medium",
    prompt: `${STYLE} Back-room den interior TOP-DOWN: crate stacks, hack terminals, violet low light, messy cyberpunk hideout, no people.`,
  },
  {
    id: "hf_int_home_room",
    tag: "expanse",
    out: "objects/hf_int_home_room.png",
    kind: "plate",
    maxSide: 160,
    quality: "medium",
    prompt: `${STYLE} Apartment living room TOP-DOWN: sofa, low table, neon plant, rug, warm magenta lamp, estate home interior plate, no people.`,
  },
  {
    id: "hf_int_home_room_b",
    tag: "expanse",
    out: "objects/hf_int_home_room_b.png",
    kind: "plate",
    maxSide: 160,
    prompt: `${STYLE} Apartment living room TOP-DOWN variant B: different furniture arrangement, cooler cyan lighting, different rug shape.`,
  },
  {
    id: "hf_int_subway_room",
    tag: "expanse",
    out: "objects/hf_int_subway_room.png",
    kind: "plate",
    maxSide: 180,
    quality: "medium",
    prompt: `${STYLE} Surface subway station interior TOP-DOWN: turnstile row, benches, track strip along south, cyan METRO signage, room plate, no people.`,
  },
  {
    id: "hf_int_stadium_room",
    tag: "expanse",
    out: "objects/hf_int_stadium_room.png",
    kind: "plate",
    maxSide: 180,
    quality: "medium",
    prompt: `${STYLE} Stadium lobby interior TOP-DOWN: barrier ring, red chevron floor, scoreboard north, Crucible arena entry vibe, no people.`,
  },

  // ── Furniture multivariants ─────────────────────────────────────────────
  {
    id: "hf_furn_sofa_b",
    tag: "expanse",
    out: "objects/hf_furn_sofa_b.png",
    kind: "prop",
    maxSide: 72,
    prompt: `${STYLE} Cyberpunk sofa TOP-DOWN variant B: longer sectional, cyan piping, darker fabric.`,
  },
  {
    id: "hf_furn_terminal_b",
    tag: "expanse",
    out: "objects/hf_furn_terminal_b.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Hacking terminal TOP-DOWN variant B: dual screens, magenta glow, more cables.`,
  },
  {
    id: "hf_furn_locker_b",
    tag: "expanse",
    out: "objects/hf_furn_locker_b.png",
    kind: "prop",
    maxSide: 48,
    prompt: `${STYLE} Gear locker TOP-DOWN variant B: double-wide lockers, cyan stripe.`,
  },
  {
    id: "hf_furn_bar_counter_b",
    tag: "expanse",
    out: "objects/hf_furn_bar_counter_b.png",
    kind: "prop",
    maxSide: 96,
    prompt: `${STYLE} Bar counter TOP-DOWN variant B: straight long bar not L-shape, amber bottle glow.`,
  },
  {
    id: "hf_furn_clinic_bed_b",
    tag: "expanse",
    out: "objects/hf_furn_clinic_bed_b.png",
    kind: "prop",
    maxSide: 72,
    prompt: `${STYLE} Clinic bed TOP-DOWN variant B: with privacy curtain rail, green accents.`,
  },
  {
    id: "hf_furn_war_table_b",
    tag: "expanse",
    out: "objects/hf_furn_war_table_b.png",
    kind: "prop",
    maxSide: 80,
    prompt: `${STYLE} Guild war table TOP-DOWN variant B: round table, magenta holo city projection.`,
  },
  {
    id: "hf_furn_plant_b",
    tag: "expanse",
    out: "objects/hf_furn_plant_b.png",
    kind: "prop",
    maxSide: 40,
    prompt: `${STYLE} Planter TOP-DOWN variant B: taller cactus under cyan grow lamp.`,
  },
  {
    id: "hf_furn_neon_lamp_b",
    tag: "expanse",
    out: "objects/hf_furn_neon_lamp_b.png",
    kind: "prop",
    maxSide: 40,
    prompt: `${STYLE} Floor lamp TOP-DOWN variant B: magenta glow ring, thinner base.`,
  },
  {
    id: "hf_furn_shelf",
    tag: "expanse",
    out: "objects/hf_furn_shelf.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Shop shelf unit TOP-DOWN packed with boxes and bottles, amber edge light.`,
  },
  {
    id: "hf_furn_shelf_b",
    tag: "expanse",
    out: "objects/hf_furn_shelf_b.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Shop shelf TOP-DOWN variant B: emptier shelves, cyan price tags.`,
  },
  {
    id: "hf_furn_bed",
    tag: "expanse",
    out: "objects/hf_furn_bed.png",
    kind: "prop",
    maxSide: 72,
    prompt: `${STYLE} Apartment bed TOP-DOWN, dark sheets, neon pillow strip magenta.`,
  },
  {
    id: "hf_furn_bed_b",
    tag: "expanse",
    out: "objects/hf_furn_bed_b.png",
    kind: "prop",
    maxSide: 72,
    prompt: `${STYLE} Apartment bed TOP-DOWN variant B: futon style, cyan blanket fold.`,
  },
  {
    id: "hf_furn_crate_stack",
    tag: "expanse",
    out: "objects/hf_furn_crate_stack.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Stack of three cargo crates TOP-DOWN, hazard stickers, den clutter.`,
  },

  // ── District signature extras (3rd prop each) ───────────────────────────
  {
    id: "hf_distprop_plaza_booth",
    tag: "expanse",
    out: "objects/hf_distprop_plaza_booth.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Confiscation booth kiosk TOP-DOWN, magenta LEDs, Palantir Plaza police prop.`,
  },
  {
    id: "hf_distprop_stacks_conveyor",
    tag: "expanse",
    out: "objects/hf_distprop_stacks_conveyor.png",
    kind: "prop",
    maxSide: 72,
    prompt: `${STYLE} Short conveyor belt segment TOP-DOWN, green hazard, industrial Stacks prop.`,
  },
  {
    id: "hf_distprop_spire_valet",
    tag: "expanse",
    out: "objects/hf_distprop_spire_valet.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Luxury valet pad TOP-DOWN, blue neon chevrons, Spire elite district.`,
  },
  {
    id: "hf_distprop_docks_crane",
    tag: "expanse",
    out: "objects/hf_distprop_docks_crane.png",
    kind: "prop",
    maxSide: 72,
    prompt: `${STYLE} Dock crane base TOP-DOWN, cyan wet metal, tidal docks prop.`,
  },
  {
    id: "hf_distprop_under_shrine",
    tag: "expanse",
    out: "objects/hf_distprop_under_shrine.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Cult candle shrine ring TOP-DOWN, violet glow, Undercity prop.`,
  },
  {
    id: "hf_distprop_relay_dish",
    tag: "expanse",
    out: "objects/hf_distprop_relay_dish.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Small uplink dish on pad TOP-DOWN, amber LEDs, Relay Grid prop.`,
  },
  {
    id: "hf_distprop_wastes_barrels",
    tag: "expanse",
    out: "objects/hf_distprop_wastes_barrels.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Radiation barrel stack TOP-DOWN, rust orange, Wastes prop.`,
  },
  {
    id: "hf_distprop_kernel_pillar",
    tag: "expanse",
    out: "objects/hf_distprop_kernel_pillar.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Black ICE glass pillar TOP-DOWN, red emergency core, Kernel fortress prop.`,
  },

  // ── Wilderness ──────────────────────────────────────────────────────────
  {
    id: "hf_wild_bridge_span",
    tag: "expanse",
    out: "objects/hf_wild_bridge_span.png",
    kind: "prop",
    maxSide: 160,
    quality: "medium",
    prompt: `${STYLE} Cyberpunk wilderness bridge span TOP-DOWN: road deck with guardrails, rust, cyan edge lights, freestanding structure.`,
  },
  {
    id: "hf_wild_bridge_span_b",
    tag: "expanse",
    out: "objects/hf_wild_bridge_span_b.png",
    kind: "prop",
    maxSide: 160,
    prompt: `${STYLE} Wilderness bridge TOP-DOWN variant B: broken railing, ash dust, amber hazard lights.`,
  },
  {
    id: "hf_wild_guardrail",
    tag: "expanse",
    out: "objects/hf_wild_guardrail.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Metal guardrail segment TOP-DOWN, rust, sparse cyan reflectors.`,
  },
  {
    id: "hf_wild_ash_pile",
    tag: "expanse",
    out: "objects/hf_wild_ash_pile.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Ash and slag pile TOP-DOWN, grey-orange, wilderness clutter.`,
  },
  {
    id: "hf_wild_salt_crust",
    tag: "expanse",
    out: "objects/hf_wild_salt_crust.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Salt crust patch TOP-DOWN flat decal, pale crystals, coastal wilderness.`,
  },
  {
    id: "hf_wild_rust_car",
    tag: "expanse",
    out: "objects/hf_wild_rust_car.png",
    kind: "prop",
    maxSide: 80,
    prompt: `${STYLE} Rusted abandoned car TOP-DOWN, wilderness wreck, no glow windows.`,
  },
  {
    id: "hf_wild_sign_post",
    tag: "expanse",
    out: "objects/hf_wild_sign_post.png",
    kind: "prop",
    maxSide: 48,
    prompt: `${STYLE} Weathered trail sign post TOP-DOWN, faded district arrows, cyan edge.`,
  },
  {
    id: "hf_wild_relay_pylon",
    tag: "expanse",
    out: "objects/hf_wild_relay_pylon.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Data relay pylon TOP-DOWN, amber LEDs, wilderness corridor prop.`,
  },

  // ── ICE vault / dungeon ─────────────────────────────────────────────────
  {
    id: "hf_dungeon_core_pedestal",
    tag: "expanse",
    out: "objects/hf_dungeon_core_pedestal.png",
    kind: "prop",
    maxSide: 96,
    quality: "medium",
    prompt: `${STYLE} ICE vault core pedestal TOP-DOWN: hexagonal dais with floating cyan memory core, cyber dungeon objective prop.`,
  },
  {
    id: "hf_dungeon_core_pedestal_b",
    tag: "expanse",
    out: "objects/hf_dungeon_core_pedestal_b.png",
    kind: "prop",
    maxSide: 96,
    prompt: `${STYLE} ICE vault core pedestal TOP-DOWN variant B: cracked dais, magenta core, unstable sparks.`,
  },
  {
    id: "hf_dungeon_ice_crystal",
    tag: "expanse",
    out: "objects/hf_dungeon_ice_crystal.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Black ICE crystal cluster TOP-DOWN, cyan frost glow, dungeon hazard décor.`,
  },
  {
    id: "hf_dungeon_server_rack",
    tag: "expanse",
    out: "objects/hf_dungeon_server_rack.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Server rack bank TOP-DOWN, blinking amber LEDs, vault side-room prop.`,
  },
  {
    id: "hf_dungeon_guardian_nest",
    tag: "expanse",
    out: "objects/hf_dungeon_guardian_nest.png",
    kind: "prop",
    maxSide: 72,
    prompt: `${STYLE} Guardian wraith nest TOP-DOWN: cable cocoon and cyan frost ring, dungeon spawn flavor, no full creature.`,
  },
  {
    id: "hf_dungeon_cable_curtain",
    tag: "expanse",
    out: "objects/hf_dungeon_cable_curtain.png",
    kind: "prop",
    maxSide: 64,
    prompt: `${STYLE} Hanging cable curtain TOP-DOWN rectangle, dark wires with cyan spark tips, corridor dress.`,
  },
  {
    id: "hf_dungeon_floor_hex",
    tag: "expanse",
    out: "objects/hf_dungeon_floor_hex.png",
    kind: "prop",
    maxSide: 96,
    prompt: `${STYLE} Hex tile floor decal TOP-DOWN, dark metal with cyan circuit lines, ICE vault floor plate.`,
  },

  // ── Hub plaza extras ────────────────────────────────────────────────────
  {
    id: "hf_hub_bench",
    tag: "expanse",
    out: "objects/hf_hub_bench.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Plaza bench TOP-DOWN, metal slats, cyan edge light, civic hub furniture.`,
  },
  {
    id: "hf_hub_bench_b",
    tag: "expanse",
    out: "objects/hf_hub_bench_b.png",
    kind: "prop",
    maxSide: 56,
    prompt: `${STYLE} Plaza bench TOP-DOWN variant B: curved, magenta underglow.`,
  },
  {
    id: "hf_hub_planter",
    tag: "expanse",
    out: "objects/hf_hub_planter.png",
    kind: "prop",
    maxSide: 48,
    prompt: `${STYLE} Civic planter TOP-DOWN, geometric concrete, neon moss, hub plaza.`,
  },
  {
    id: "hf_landmark_fountain_b",
    tag: "expanse",
    out: "objects/hf_landmark_fountain_b.png",
    kind: "prop",
    maxSide: 120,
    prompt: `${STYLE} Holo-fountain TOP-DOWN variant B: square basin, magenta holographic spray, civic landmark.`,
  },

  // ── Holistic tier: identity gaps (env zones aliasing other kits, zones with
  // no hf_ namespace at all). Accents track ENV_IDENTITY / DISTRICTS.
  // ── Env-identity kits — these 5 env zones currently borrow core/sprawl/docks art.
  {
    id: "hf_building_dist_market",
    tag: "holistic",
    out: "objects/hf_building_dist_market.png",
    kind: "building",
    maxSide: 224,
    quality: "medium",
    prompt: `${STYLE} THE BAZAAR market block TOP-DOWN: low market hall roofed with patched fabric awnings, stall rows spilling off the footprint, hanging amber bulb strings, crate stacks, produce crates, warm amber #ffb13c neon signage, cluttered lived-in trade district building.`,
  },
  {
    id: "hf_building_dist_park",
    tag: "holistic",
    out: "objects/hf_building_dist_park.png",
    kind: "building",
    maxSide: 224,
    quality: "medium",
    prompt: `${STYLE} GREENWAY park pavilion TOP-DOWN: low civic structure half-swallowed by engineered overgrowth, green #39ff88 bio-luminescent moss veins across the roof, trellis canopy, planter beds, cracked path edges, nature reclaiming concrete, calm green district building.`,
  },
  {
    id: "hf_building_dist_corporate",
    tag: "holistic",
    out: "objects/hf_building_dist_corporate.png",
    kind: "building",
    maxSide: 224,
    quality: "medium",
    prompt: `${STYLE} CORP ROW office block TOP-DOWN: severe rectilinear glass-and-steel roof, mirrored curtain wall, rooftop HVAC grid, helipad circle, clean cyan #29e7ff edge lighting, corporate signage plinth, sterile and expensive, no clutter.`,
  },
  {
    id: "hf_building_dist_arcology",
    tag: "holistic",
    out: "objects/hf_building_dist_arcology.png",
    kind: "building",
    maxSide: 224,
    quality: "medium",
    prompt: `${STYLE} ARC ROW arcology megastructure TOP-DOWN: massive terraced self-contained habitat block, stacked residential tiers, internal atrium void at center, skybridge stubs, cold blue #6b9bff strip lighting, brutalist megascale housing.`,
  },
  {
    id: "hf_building_dist_kernel",
    tag: "holistic",
    out: "objects/hf_building_dist_kernel.png",
    kind: "building",
    maxSide: 224,
    quality: "medium",
    prompt: `${STYLE} THE KERNEL master-grid block TOP-DOWN: Helios control architecture, black monolithic slab roof, exposed coolant piping, red #ff3b6b hazard glow bleeding from seams, server spines, containment rings, final-boss datacenter fortress, oppressive and hostile.`,
  },
  // ── Interior plate for citycenter (FURN_BY_KIND has citycenter; INT_ROOM did not).
  {
    id: "hf_int_citycenter_room",
    tag: "holistic",
    out: "objects/hf_int_citycenter_room.png",
    kind: "plate",
    maxSide: 180,
    quality: "medium",
    prompt: `${STYLE} CIVIC SPIRE lobby interior floor set TOP-DOWN: polished dark stone lobby plate, central fountain pad, directory plinth, bench ring, reception counter along the north wall, cyan #29e7ff civic uplighting, rectangular room plate, no people.`,
  },
  // ── THE ESTATES — street facades + home interior plate (zone had no hf_ namespace).
  {
    id: "hf_building_estate_a",
    tag: "holistic",
    out: "objects/hf_building_estate_a.png",
    kind: "building",
    maxSide: 200,
    quality: "medium",
    prompt: `${STYLE} Estate residence TOP-DOWN variant A: modest two-storey cyberpunk townhouse roof, small walled yard, solar tiles, satellite dish, warm amber window glow, tidy suburban runner housing.`,
  },
  {
    id: "hf_building_estate_b",
    tag: "holistic",
    out: "objects/hf_building_estate_b.png",
    kind: "building",
    maxSide: 200,
    quality: "medium",
    prompt: `${STYLE} Estate residence TOP-DOWN variant B: wider low bungalow roof, carport slab, rooftop garden planters, magenta porch neon, slightly worn, suburban runner housing.`,
  },
  {
    id: "hf_building_estate_c",
    tag: "holistic",
    out: "objects/hf_building_estate_c.png",
    kind: "building",
    maxSide: 200,
    quality: "medium",
    prompt: `${STYLE} Estate residence TOP-DOWN variant C: upgraded smart-home block, clean geometric roof, private drone pad, cyan security strip lighting, affluent, suburban runner housing.`,
  },
  {
    id: "hf_int_estate_room",
    tag: "holistic",
    out: "objects/hf_int_estate_room.png",
    kind: "plate",
    maxSide: 180,
    quality: "medium",
    prompt: `${STYLE} Player estate home interior floor set TOP-DOWN: open-plan apartment plate, living zone rug, kitchen counter run, bed alcove, warm amber and magenta domestic lighting, clean habitable floor, rectangular room plate, no people.`,
  },
  // ── Wilderness biome ground plates — 7 biomes currently share one bridge span.
  {
    id: "hf_wild_biome_ruined_urban",
    tag: "holistic",
    out: "objects/hf_wild_biome_ruined_urban.png",
    kind: "plate",
    maxSide: 200,
    quality: "medium",
    prompt: `${STYLE} Ruined urban wilderness ground plate TOP-DOWN: collapsed street slab, toppled facade rubble, cracked asphalt, dead traffic signal, weeds through concrete, faint cyan emergency glow, wide terrain plate.`,
  },
  {
    id: "hf_wild_biome_industrial_cut",
    tag: "holistic",
    out: "objects/hf_wild_biome_industrial_cut.png",
    kind: "plate",
    maxSide: 200,
    quality: "medium",
    prompt: `${STYLE} Industrial cut wilderness ground plate TOP-DOWN: severed pipeline corridor, exposed conduit trench, oil-slick puddles, hazard chevrons, corrugated scrap walls, amber work lamps, wide terrain plate.`,
  },
  {
    id: "hf_wild_biome_floodplain",
    tag: "holistic",
    out: "objects/hf_wild_biome_floodplain.png",
    kind: "plate",
    maxSide: 200,
    quality: "medium",
    prompt: `${STYLE} Floodplain wilderness ground plate TOP-DOWN: shallow standing water over drowned roadway, silt banks, reed clumps, half-sunk barrier, cyan reflections on black water, wide terrain plate.`,
  },
  {
    id: "hf_wild_biome_undercity",
    tag: "holistic",
    out: "objects/hf_wild_biome_undercity.png",
    kind: "plate",
    maxSide: 200,
    quality: "medium",
    prompt: `${STYLE} Undercity wilderness ground plate TOP-DOWN: buried service corridor floor, drain grates, dripping seepage stains, cable bundles along the edges, violet #b06bff fungal bloom, wide terrain plate.`,
  },
  {
    id: "hf_wild_biome_debris_field",
    tag: "holistic",
    out: "objects/hf_wild_biome_debris_field.png",
    kind: "plate",
    maxSide: 200,
    quality: "medium",
    prompt: `${STYLE} Debris field wilderness ground plate TOP-DOWN: scattered shredded metal panels, torn fuselage scrap, twisted rebar, impact scoring across dirt, sparse ember glints, wide terrain plate.`,
  },
  {
    id: "hf_wild_biome_ash_wastes",
    tag: "holistic",
    out: "objects/hf_wild_biome_ash_wastes.png",
    kind: "plate",
    maxSide: 200,
    quality: "medium",
    prompt: `${STYLE} Ash wastes wilderness ground plate TOP-DOWN: deep grey ash drifts over buried wreckage, wind-scoured ripples, bleached debris, amber #ffb13c haze light, desolate, wide terrain plate.`,
  },
  {
    id: "hf_wild_biome_meltdown",
    tag: "holistic",
    out: "objects/hf_wild_biome_meltdown.png",
    kind: "plate",
    maxSide: 200,
    quality: "medium",
    prompt: `${STYLE} Meltdown wilderness ground plate TOP-DOWN: slagged vitrified ground, cooling fracture lines glowing ember red, molten runoff channels, warped metal stubs, radiation scarring, wide terrain plate.`,
  },

  // ── Contagion set ───────────────────────────────────────────────────────
  // Infected art swaps in for the CLEAN sprite on the same footprint (see
  // BUILDING_INFECTED / infectedKit), so it must share the clean art's TOP-DOWN
  // projection and its subject. The original inf_* set was sliced from one generic
  // isometric 6-cell sheet, so a top-down home became an isometric factory at
  // contagion >= 14. These regenerate it per-kind, top-down.
  ...[
    ["bar", "dive bar: L-counter and stage footprint, dead magenta signage"],
    ["clinic", "med-clinic: ward wing and reception block, dead cyan cross signage"],
    ["shop", "general store: aisle roof and loading stub, dead amber signage"],
    ["den", "back-room den: tight windowless block, crate stubs, dead violet signage"],
    ["guild", "runners' guild: war-hall block and rack wing, dead cyan crest"],
    ["home", "residence: modest townhouse roof and small yard, dead amber window glow"],
    ["hotel", "hotel: long room-block roof, lobby stub, dead magenta vertical sign"],
    ["subway", "metro station head-house: escalator hood and entrance canopy, dead cyan transit strip"],
    ["stadium", "arena: oval bowl roof and barrier ring, dead red floodlight rigs"],
    ["citycenter", "civic spire: stepped tower base and plaza pad, dead cyan civic uplighting"],
  ].map(([slug, desc]) => ({
    id: `hf_building_inf_${slug}`,
    tag: "contagion",
    out: `objects/hf_building_inf_${slug}.png`,
    kind: "building",
    maxSide: 224,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE} CONTAGION-INFECTED ${desc}. Same top-down footprint as a healthy building of this kind, but overrun: acid-green #7dff4a bio-slime veins creeping across the roof, glowing green fissures splitting the concrete, green ooze pooling at the edges, cracked and buckled panels, neon signage dead or flickering out. Diseased and abandoned, no people. TOP-DOWN 90-degree orthographic, not isometric.`,
  })),
  ...[
    ["core", "NEON CORE dense downtown block"],
    ["sprawl", "THE SPRAWL stacked shanty housing block"],
    ["undercity", "THE UNDERCITY buried vault block"],
    ["docks", "TIDAL YARDS freight warehouse block"],
    ["stacks", "ANDURIL YARDS foundry block"],
    ["spire", "ARGUS SPIRE glass tower block"],
    ["wastes", "THE WASTELAND salvage shack block"],
    ["relay", "ORBITAL RELAY uplink array block"],
    ["kernel", "THE KERNEL master-grid datacenter block"],
  ].map(([slug, desc]) => ({
    id: `hf_building_dist_${slug}_inf`,
    tag: "contagion",
    out: `objects/hf_building_dist_${slug}_inf.png`,
    kind: "building",
    maxSide: 224,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE} CONTAGION-INFECTED ${desc} TOP-DOWN: the district's own architecture overrun by the plague — acid-green #7dff4a bio-slime veins spreading across the roof, glowing green fissures cracking the structure, green ooze bleeding from seams, collapsed and buckled sections, the district's neon accents dead or guttering. Diseased scenery block, no people. TOP-DOWN 90-degree orthographic, not isometric.`,
  })),
  // ── Resident portrait singles ─────────────────────────────────────────
  // 32 residents shared 12 painted faces, and the sheet fallback matched on `sex`
  // ALONE — skin, hair and beard were ignored, so a bust could contradict the
  // paper-doll sprite. Each prompt below is authored from that NPC's own look()
  // params + their dialogue, so the face matches the body you're talking to.
  {
    id: "portrait_res_ash",
    tag: "residents",
    out: "portraits/interact/res_ash.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} ASH, a resident of the METROPHAGE undercity: a woman in her 40s, fair pale skin, long silver-grey hair falling from a raised grey hood, hollow tired eyes, no makeup, quiet grief held in the jaw, muted steel-grey palette, a single dim cyan edge light. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_borne",
    tag: "residents",
    out: "portraits/interact/res_borne.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} BORNE, a resident of the METROPHAGE undercity: a heavy-set man, very dark deep-umber skin, short black hair, neat goatee, wary sidelong glance, freight-hauler's collar, warm amber rim light, smuggler's guarded calm. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_brick",
    tag: "residents",
    out: "portraits/interact/res_brick.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} BRICK, a resident of the METROPHAGE undercity: a massive broad-shouldered man, very dark deep-umber skin, buzzed black hair, thick full beard, hands wrapped in worn cloth, heavy shoulder pads, proud and immovable, warm amber key light, construction dust on the skin. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_coil",
    tag: "residents",
    out: "portraits/interact/res_coil.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} COIL, a resident of the METROPHAGE undercity: a wiry man, warm brown skin, buzzed hair under a flat work cap, a long scar across one cheek, cloth-wrapped hands, live-wire grin, acid-green #9dff3c neon glow from below, electrician's improvised rig. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_dash",
    tag: "residents",
    out: "portraits/interact/res_dash.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} DASH, a resident of the METROPHAGE undercity: a lean young courier, warm brown skin, short black hair under a flat cap, a diagonal courier strap across the chest, caught mid-breath as if just stopped running, yellow #f7ff3c neon streaks, restless eyes. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_ferro",
    tag: "residents",
    out: "portraits/interact/res_ferro.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} FERRO, a resident of the METROPHAGE undercity: a powerfully built woman, very dark deep-umber skin, black undercut hair, cloth-wrapped forge hands, magenta #ff2bd6 key light with a cyan #00e5ff rim, forge sparks, unimpressed steady stare. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_glass",
    tag: "residents",
    out: "portraits/interact/res_glass.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} GLASS, a resident of the METROPHAGE undercity: a slim figure, light tan skin, undercut hair dyed cornflower blue, a thin scanning visor band across the eyes, cloth-wrapped hands, reflective and evasive, cold blue #6b9bff glass reflections. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_grist",
    tag: "residents",
    out: "portraits/interact/res_grist.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} GRIST, a resident of the METROPHAGE undercity: an older heavy-set man, very dark deep-umber skin, short silver-grey hair, full silver beard, flour dust on the forearms, warm ochre #f7a23c lamp light, a miller's patient weathered face. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_hollow",
    tag: "residents",
    out: "portraits/interact/res_hollow.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} HOLLOW, a resident of the METROPHAGE undercity: a gaunt figure, warm brown skin, short silver-grey hair under a deep hood, a dark tattoo tracing one temple, thousand-yard stare, violet #b06bff glow, unsettling calm, prophet of the Blank. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_juniper",
    tag: "residents",
    out: "portraits/interact/res_juniper.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} JUNIPER, a resident of the METROPHAGE undercity: a woman, light tan skin, long very dark brown hair, bare-headed, a rough green cape, real leaves caught in the hair, green #8bff6a grow-light glow, warm and unhurried, rooftop gardener. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_lace",
    tag: "residents",
    out: "portraits/interact/res_lace.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} LACE, a resident of the METROPHAGE undercity: a striking woman, medium tan skin, hot-pink #ff5fb0 braids, an ornate crown-like headpiece, a draped couture cape, pink #ff79c6 key with cyan #00e5ff rim, imperious plaza couturier. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_lumen",
    tag: "residents",
    out: "portraits/interact/res_lumen.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} LUMEN, a resident of the METROPHAGE undercity: a woman, warm brown skin, cyan #29e7ff glowing braids, slim antennae, bare-headed, magenta #ff2bd6 accents, paint-flecked hands, luminous rapt expression, neon muralist. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_mercy",
    tag: "residents",
    out: "portraits/interact/res_mercy.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} MERCY, a resident of the METROPHAGE undercity: a woman, fair pale skin, silver-grey hair in a bun under a hood, a glowing green cross emblem at the collar, tired compassionate eyes, green #39ff88 clinic glow, back-alley medic. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_odd",
    tag: "residents",
    out: "portraits/interact/res_odd.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} ODD, a resident of the METROPHAGE undercity: an androgynous figure, deep brown skin, violet #b06bff undercut hair, slim antennae, a scanning visor over the eyes, head tilted as if listening to something absent, violet glow, distracted savant. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_pip",
    tag: "residents",
    out: "portraits/interact/res_pip.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} PIP, a resident of the METROPHAGE undercity: a young wiry gossip, warm brown skin, short black hair under a flat cap, a small dark tattoo under one eye, conspiratorial half-smile, yellow #f7ff3c neon, leaning in to tell you something. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_plume",
    tag: "residents",
    out: "portraits/interact/res_plume.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} PLUME, a resident of the METROPHAGE undercity: a woman, medium tan skin, long hot-pink #ff5fb0 hair, an ornate crown headpiece, a small skull emblem at the collar, glass atomisers at the throat, pink #ff79c6 haze, decadent knowing smile. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_rook",
    tag: "residents",
    out: "portraits/interact/res_rook.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} ROOK, a resident of the METROPHAGE undercity: a man, fair pale skin, short dark brown hair under a beret, stubble, a high-collared coat, calculating half-lidded eyes, cool blue #6b9bff light, a strategist mid-thought. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_salt",
    tag: "residents",
    out: "portraits/interact/res_salt.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} SALT, a resident of the METROPHAGE undercity: a broad powerfully built woman, light tan skin, black hair in a tight ponytail, a heavy dock strap across the chest, forearms like cable, blue #6b9bff dock light, blunt challenging stare. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_sparrow",
    tag: "residents",
    out: "portraits/interact/res_sparrow.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} SPARROW, a resident of the METROPHAGE undercity: a slight young woman, light tan skin, short black hair under a hood, a thief's strap across the chest, quick amused eyes, pink #ff5ad0 neon, caught grinning mid-alibi. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
  {
    id: "portrait_res_tin",
    tag: "residents",
    out: "portraits/interact/res_tin.jpg",
    kind: "portrait",
    maxSide: 256,
    quality: "medium",
    resolution: "1k",
    prompt: `${STYLE_BUST} TIN, a resident of the METROPHAGE undercity: an older man, warm brown skin, buzzed hair under a flat cap, a scar along the jaw, cloth-wrapped hands, cobbler's apron, muted steel-grey #9aa3b2 palette, kind and unhurried. Single character, shoulders-up, facing camera, plain dark background, no text.`,
  },
];

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const processOnly = args.includes("--process");
const onlyIdx = args.indexOf("--only");
const onlyTag = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const idsIdx = args.indexOf("--ids");
// --ids runs an explicit comma-separated list in the order given, so a batch can be
// ordered by play value (interiors before decor) instead of JOBS declaration order.
const onlyIds = idsIdx >= 0 ? (args[idsIdx + 1] || "").split(",").filter(Boolean) : null;
const jobs = onlyIds
  ? onlyIds.map((id) => JOBS.find((j) => j.id === id)).filter(Boolean)
  : onlyTag
    ? JOBS.filter((j) => j.tag === onlyTag)
    : JOBS;
if (onlyIds) {
  const missing = onlyIds.filter((id) => !JOBS.some((j) => j.id === id));
  if (missing.length) console.warn("unknown ids ignored:", missing.join(", "));
}

fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT_OBJ, { recursive: true });
fs.mkdirSync(path.join(OUT_PORT, "bosses"), { recursive: true });
fs.mkdirSync(OUT_UI, { recursive: true });

function hf(cmd, argv) {
  const r = spawnSync("higgsfield", [cmd, ...argv], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
  if (r.error) throw r.error;
  return { code: r.status ?? 1, out: (r.stdout || "") + (r.stderr || "") };
}

async function keyBlack(buf, tol = 22) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  // Sample corners for near-black key
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= tol && g <= tol && b <= tol) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Key only the black REGION CONNECTED TO THE BORDER, via flood fill.
 * Room plates are near-solid rectangles whose floor is legitimately near-black; a global
 * keyBlack punches holes straight through the floor. Interior darkness is kept opaque.
 */
async function keyBorderBlack(buf, tol = 22) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const isBlack = (p) => data[p] <= tol && data[p + 1] <= tol && data[p + 2] <= tol;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (seen[idx]) return;
    seen[idx] = 1;
    if (isBlack(idx * c)) stack.push(idx);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const idx = stack.pop();
    data[idx * c + 3] = 0;
    const x = idx % w;
    const y = (idx / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return sharp(data, { raw: { width: w, height: h, channels: c } }).png().toBuffer();
}

async function processJob(job, rawPath) {
  const dest = path.join(root, "public/assets", job.out);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let buf = fs.readFileSync(rawPath);
  if (job.kind === "portrait") {
    await sharp(buf)
      .resize(256, 256, { fit: "cover" })
      .jpeg({ quality: 88 })
      .toFile(dest);
    console.log("portrait →", dest);
    return;
  }
  buf =
    job.kind === "plate"
      ? await keyBorderBlack(buf, 24)
      : await keyBlack(buf, job.kind === "building" ? 18 : 24);
  const trimmed = await sharp(buf).trim({ threshold: 12 }).toBuffer();
  const m = await sharp(trimmed).metadata();
  const maxSide = job.maxSide || 96;
  const scale = Math.min(1, maxSide / Math.max(m.width || 1, m.height || 1));
  await sharp(trimmed)
    .resize(Math.max(16, Math.round((m.width || 64) * scale)), Math.max(16, Math.round((m.height || 64) * scale)), {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(dest);
  console.log("prop →", dest);
}

async function generate(job) {
  const rawPath = path.join(RAW, job.id + ".png");
  if (fs.existsSync(rawPath) && fs.statSync(rawPath).size > 1000) {
    console.log("skip gen (raw exists)", job.id);
    return rawPath;
  }
  // Budget: explicit job.quality wins; expanse props default low; structure jobs set medium.
  const quality =
    job.quality ||
    (job.tag === "district" ||
    job.tag === "world" ||
    job.tag === "interior" ||
    job.tag === "expanse"
      ? "low"
      : "medium");
  const resolution = job.resolution || "1k";
  console.log("generate", job.id, quality, resolution, "…");
  const r = hf("generate", [
    "create",
    "gpt_image_2",
    "--prompt",
    job.prompt,
    "--aspect_ratio",
    "1:1",
    "--resolution",
    resolution,
    "--quality",
    quality,
    "--wait",
    "--wait-timeout",
    "15m",
    "--json",
  ]);
  if (r.code !== 0) {
    console.error("FAIL", job.id, r.out.slice(0, 400));
    return null;
  }
  let url;
  try {
    const j = JSON.parse(r.out.trim().split("\n").filter(Boolean).pop() || "[]");
    const jobObj = Array.isArray(j) ? j[0] : j;
    url = jobObj?.result_url || jobObj?.resultUrl;
  } catch (e) {
    // non-json wait output — try to scrape URL
    const m = r.out.match(/https:\/\/[^\s"']+\.png/);
    url = m?.[0];
  }
  if (!url) {
    console.error("no url for", job.id, r.out.slice(0, 300));
    return null;
  }
  const dl = spawnSync("curl", ["-fsSL", url, "-o", rawPath], { encoding: "utf8" });
  if (dl.status !== 0 || !fs.existsSync(rawPath)) {
    console.error("download fail", job.id, dl.stderr);
    return null;
  }
  console.log("saved raw", rawPath);
  return rawPath;
}

async function main() {
  console.log(`Jobs: ${jobs.length}${onlyTag ? ` (tag=${onlyTag})` : ""}`);
  if (dry) {
    for (const j of jobs) console.log(j.tag, j.id, "→", j.out);
    return;
  }
  let ok = 0;
  let fail = 0;
  for (const job of jobs) {
    try {
      let raw = path.join(RAW, job.id + ".png");
      if (!processOnly) {
        const g = await generate(job);
        if (!g) {
          fail++;
          continue;
        }
        raw = g;
      }
      if (!fs.existsSync(raw)) {
        console.error("missing raw", job.id);
        fail++;
        continue;
      }
      await processJob(job, raw);
      ok++;
    } catch (e) {
      console.error("error", job.id, e);
      fail++;
    }
  }
  console.log(`Done ok=${ok} fail=${fail}`);
  const st = hf("account", ["status"]);
  console.log(st.out.trim());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
