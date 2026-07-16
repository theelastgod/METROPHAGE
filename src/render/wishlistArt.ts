// METROPHAGE — place wishlist / expanse Higgsfield art so world structure matches sprites.
// Missing textures are skipped so the client boots mid-gen.

import Phaser from "phaser";
import { TILE } from "../config";
import {
  HF_LANDMARK_KEYS,
  HF_FURN_KEYS,
  HF_WILD_PROP_KEYS,
  HF_DUNGEON_PROP_KEYS,
  HF_SUBWAY_EXPANSION_PROP_KEYS,
  HF_SUBWAY_IDENTITY_PROP_KEYS,
  HF_SUBWAY_TILE_KEYS,
  GLOW_KEY,
  pickHfVariant,
  layoutPlateKey,
} from "../assets/manifest";
import type { SubwayStation } from "../world/subway";
import { subwayStationTier, subwayTunnelArtModules } from "../world/subway";
import type { BuildingKind } from "../world/city";
import { layoutTagForRoom, type VenueLayoutTag } from "../world/district";
import { generatedAssetScale, generatedReferencePx } from "./generatedAssetSizing";

function place(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  depth: number,
  scale = 1,
  alpha = 1,
  glow = false,
  tint = 0xffffff,
  originY = 0.85,
  rotation = 0,
) {
  if (!scene.textures.exists(key)) return null;
  const img = scene.add
    .image(x, y, key)
    .setDepth(depth)
    .setOrigin(0.5, originY)
    .setAlpha(alpha)
    .setTint(tint)
    .setRotation(rotation);
  img.setScale(generatedAssetScale(key, img.width, img.height, scale, generatedReferencePx(key)));
  if (glow) {
    scene.add
      .image(x, y - 4, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint === 0xffffff ? 0x29e7ff : tint)
      .setDepth(depth - 0.05)
      .setScale(0.8)
      .setAlpha(0.18);
  }
  return img;
}

function liveKey(scene: Phaser.Scene, keys: ReadonlyArray<string>, salt: number): string | null {
  if (!keys.length) return null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[Math.abs(salt + i) % keys.length];
    if (scene.textures.exists(key)) return key;
  }
  return null;
}

function exists(scene: Phaser.Scene, key: string) {
  return scene.textures.exists(key);
}

function variant(scene: Phaser.Scene, base: string, salt: number, max = 3): string {
  return pickHfVariant((k) => exists(scene, k), base, salt, max);
}

/** Hub plaza: fountain + crucible + subway kiosk + benches/planters. */
export function dressHubWishlistArt(
  scene: Phaser.Scene,
  plazaCx: number,
  plazaCy: number,
  subwayDoor?: [number, number],
  stadiumDoor?: [number, number],
  depth = 4.5,
) {
  const fountain = variant(scene, HF_LANDMARK_KEYS[0], Math.floor(plazaCx + plazaCy), 2);
  place(scene, fountain, plazaCx, plazaCy, depth, 1.1, 1, true, 0x29e7ff);
  if (stadiumDoor) {
    place(
      scene,
      "hf_landmark_crucible",
      stadiumDoor[0] * TILE + TILE / 2,
      stadiumDoor[1] * TILE - TILE * 2,
      depth,
      1,
      0.95,
      true,
      0xff3b6b,
    );
  }
  if (subwayDoor) {
    place(
      scene,
      "hf_prop_subway_kiosk",
      subwayDoor[0] * TILE + TILE / 2,
      subwayDoor[1] * TILE - TILE,
      depth,
      0.9,
      1,
      true,
      0x00e5ff,
    );
  }
  // Plaza furniture ring around fountain
  const ring = [
    [plazaCx - TILE * 4, plazaCy + TILE * 2, "hf_hub_bench"],
    [plazaCx + TILE * 4, plazaCy + TILE * 2, "hf_hub_bench_b"],
    [plazaCx - TILE * 5, plazaCy - TILE, "hf_hub_planter"],
    [plazaCx + TILE * 5, plazaCy - TILE, "hf_hub_planter"],
  ] as const;
  for (const [x, y, key] of ring) {
    const k = exists(scene, key) ? key : key.replace(/_b$/, "");
    place(scene, k, x, y, depth - 0.1, 0.85, 0.95);
  }
}

/**
 * THE UNDERLINE: structure-first dressing.
 * Platform / apron / ticket hall / escalator mouth are placed on the carved station
 * geometry (see buildSubway) so enter zones read as authored rooms, not floating stickers.
 */
export function dressSubwayWishlistArt(scene: Phaser.Scene, stations: SubwayStation[], depth = 3.5) {
  const hub = stations.find((s) => s.zone === "safe") ?? stations[0];
  for (const st of stations) {
    const tier = subwayStationTier(st);
    const salt = st.tx * 31 + st.ty * 17 + Math.round(st.campaignThreat * 10);
    const platformBase =
      st.zone === "safe"
        ? "hf_subway_platform_hub"
        : tier >= 2
          ? "hf_subway_platform_deep"
          : "hf_subway_platform_mid";
    const platform = variant(scene, platformBase, salt, 2);
    const apron = variant(scene, "hf_subway_apron", salt + 3, 2);
    const px = st.tx * TILE + TILE / 2;
    const py = st.ty * TILE + TILE / 2;

    const stationTileFamily = tier >= 2 ? "hf_subway_tile_stationdeep_" : "hf_subway_tile_station_";
    const stationTile = liveKey(scene, HF_SUBWAY_TILE_KEYS.filter((k) => k.startsWith(stationTileFamily)), salt);
    if (stationTile) place(scene, stationTile, px, py, depth - 0.25, 0.9, 0.42, false, 0xffffff, 0.5);

    // Floor apron under platform (structure plate)
    place(scene, apron, px, py, depth - 0.15, 1.05, 0.75, false, 0xffffff, 0.5);
    place(scene, platform, px, py, depth, 0.95, 0.92, false, 0xffffff, 0.55);

    if (st.major) {
      // Ticket hall sits NORTH of platform — matches carve north spur chamber
      const hall = variant(scene, "hf_subway_ticket_hall", salt, 2);
      place(scene, hall, px, py - TILE * 9, depth + 0.05, 0.9, 0.9, false, st.accent, 0.55);

      const booth = variant(scene, "hf_subway_booth", salt + 1, 2);
      place(scene, booth, px + TILE * 2.5, py - TILE * 8.5, depth + 0.15, 0.75, 0.95, true, st.accent);

      // Escalator / exit mouth SOUTH — surface link
      const esc = variant(scene, "hf_subway_escalator_mouth", salt + 2, 2);
      place(scene, esc, px, py + TILE * 9, depth + 0.1, 0.85, 0.92, true, st.accent, 0.6);
      const exit = variant(scene, "hf_subway_exit", salt + 4, 2);
      place(scene, exit, px, py + TILE * 6.5, depth + 0.12, 0.75, 0.9, true, st.accent);

      place(scene, "hf_subway_signal", px - TILE * 5, py - TILE * 2, depth + 0.05, 0.7, 1, true, st.accent);
    }

    // Track bay + dead trains on the EAST spur (carved walkable)
    if (tier >= 1) {
      place(scene, "hf_subway_track_bay", px + TILE * 8, py, depth - 0.05, 0.9, 0.8, false, 0xffffff, 0.5);
      const train = variant(scene, "hf_subway_train_dead", salt + 5, 3);
      place(scene, train, px + TILE * 8, py, depth + 0.05, 0.85, 0.9, false, 0xffffff, 0.7);
    }
    if (tier >= 2) {
      place(scene, "hf_subway_gore", px - TILE * 3, py + TILE * 3, depth + 0.08, 0.7, 0.85, true, 0xb06bff);
      place(scene, "hf_enemy_platform_husk", px + TILE, py - TILE * 3, depth + 0.12, 0.85, 0.9, true, 0x29e7ff);
    }
    if (tier >= 3) {
      place(scene, "hf_enemy_rail_wraith", px - TILE * 6, py + TILE, depth + 0.12, 0.9, 0.9, true, 0x8dfff0);
      place(scene, "hf_enemy_tunnel_centipede", px + TILE * 5, py + TILE * 4, depth + 0.12, 0.85, 0.9, true, 0xf7ff3c);
      place(scene, "hf_enemy_ticket_specter", px, py - TILE * 5, depth + 0.12, 0.85, 0.9, true, 0xff2bd6);
      place(scene, "hf_subway_train_dead_b", px - TILE * 8, py - TILE, depth + 0.05, 0.8, 0.88);
    }

    // Second-pass station storytelling: distinct fixtures around the chamber edges.
    // These are non-colliding dressing and stay off the central traversal cross.
    const stationProps = [...HF_SUBWAY_EXPANSION_PROP_KEYS, ...HF_SUBWAY_IDENTITY_PROP_KEYS].filter((k) =>
      tier >= 2 ? true : !k.includes("horror"),
    );
    const spots = [
      [-5, -4], [5, -4], [-5, 4], [5, 4], [-3, -6], [3, 6],
    ] as const;
    spots.forEach(([dx, dy], i) => {
      const key = liveKey(scene, stationProps, salt + i * 19);
      if (key) place(scene, key, px + dx * TILE, py + dy * TILE, depth + 0.16, 0.52, 0.94, key.includes("signal") || key.includes("horror"), st.accent);
    });
  }

  if (hub) {
    const gx = hub.tx * TILE + TILE * 8;
    const gy = hub.ty * TILE + TILE / 2;
    const ghost = place(scene, "hf_subway_ghost_train", gx, gy, depth + 0.2, 1, 0.35, true, 0x8dfff0, 0.7);
    if (ghost) {
      scene.tweens.add({
        targets: ghost,
        x: gx + TILE * 40,
        alpha: { from: 0.4, to: 0.08 },
        duration: 14000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    }
  }

  // These continuous descriptors are the actual tunnel map modules. buildSubway()
  // carves the same footprints; this pass paints structure first, before scattered
  // fixtures, debris, enemies and lighting are layered above it.
  for (const m of subwayTunnelArtModules()) {
    const salt = m.tx * 31 + m.ty * 17;
    const families = m.key.includes("straight")
      ? ["hf_subway_tile_straight_", "hf_subway_tile_curve_", "hf_subway_tile_track_", "hf_subway_tile_service_"]
      : m.key.includes("cross")
        ? ["hf_subway_tile_cross_"]
        : ["hf_subway_tile_junction_"];
    const generated = liveKey(scene, HF_SUBWAY_TILE_KEYS.filter((k) => families.some((p) => k.startsWith(p))), salt);
    // New plates are authored with the rail running north/south; legacy plates run
    // west/east. Offset generated rotation by one quarter-turn to match the carved path.
    const turns = generated ? ((m.quarterTurns + 1) % 4) : m.quarterTurns;
    const plate = place(
      scene,
      generated ?? m.key,
      m.tx * TILE + TILE / 2,
      m.ty * TILE + TILE / 2,
      depth - 0.1,
      0.7,
      0.55,
      false,
      0xffffff,
      0.5,
      turns * (Math.PI / 2),
    );
    if (plate) {
      const turned = turns % 2 === 1;
      plate.setDisplaySize((turned ? m.h : m.w) * TILE, (turned ? m.w : m.h) * TILE);
    }
  }
}

const FURN_BY_KIND: Record<string, string[]> = {
  bar: ["hf_furn_bar_counter", "hf_furn_neon_lamp", "hf_furn_plant", "hf_furn_sofa"],
  clinic: ["hf_furn_clinic_bed", "hf_furn_locker", "hf_furn_plant", "hf_furn_terminal"],
  hospital: ["hf_furn_clinic_bed", "hf_furn_clinic_bed_b", "hf_furn_locker", "hf_furn_plant"],
  shop: ["hf_furn_shelf", "hf_furn_shelf_b", "hf_furn_terminal", "hf_furn_crate_stack"],
  guild: ["hf_furn_war_table", "hf_furn_locker", "hf_furn_terminal", "hf_furn_neon_lamp"],
  den: ["hf_furn_crate_stack", "hf_furn_terminal", "hf_furn_sofa", "hf_furn_locker"],
  home: ["hf_furn_sofa", "hf_furn_bed", "hf_furn_plant", "hf_furn_neon_lamp"],
  hotel: ["hf_furn_bed", "hf_furn_bed_b", "hf_furn_plant", "hf_furn_sofa"],
  subway: ["hf_furn_terminal", "hf_furn_locker", "hf_furn_neon_lamp"],
  stadium: ["hf_furn_war_table", "hf_furn_locker", "hf_furn_neon_lamp"],
  citycenter: ["hf_furn_plant", "hf_furn_neon_lamp", "hf_furn_terminal", "hf_hub_bench"],
  ripperdoc: ["hf_business_surgical_chair", "hf_business_scanner_arm", "hf_business_implant_cabinet", "hf_business_organ_cooler"],
  pawn: ["hf_business_appraisal_scanner", "hf_business_display_case", "hf_furn_shelf", "hf_furn_terminal"],
  arcade: ["hf_business_arcade_cabinet", "hf_business_vr_chair", "hf_furn_neon_lamp", "hf_furn_terminal"],
  garage: ["hf_business_vehicle_lift", "hf_business_engine_block", "hf_business_welding_station", "hf_business_drone_cradle"],
  radio: ["hf_business_mixing_console", "hf_business_transmitter_rack", "hf_furn_terminal", "hf_furn_neon_lamp"],
};

/**
 * Dress a venue / hub interior: room plate centered, then kind furniture on seats.
 * Call after dressVenueRoom procedural pass.
 */
/**
 * THE ESTATES street: a full-bleed facade over each plot's rect, variant picked by plot id
 * so neighbouring homes differ. Missing art leaves the procedural facade untouched.
 */
export function dressEstateFacades(
  scene: Phaser.Scene,
  plots: Array<{ id: number; rect: { x1: number; y1: number; x2: number; y2: number } }>,
  depth = 4.4,
) {
  const kits = ["hf_building_estate_a", "hf_building_estate_b", "hf_building_estate_c"];
  for (const plot of plots) {
    const key = kits[Math.abs(plot.id) % kits.length];
    if (!exists(scene, key)) continue;
    const X1 = plot.rect.x1 * TILE;
    const Y1 = plot.rect.y1 * TILE;
    const w = (plot.rect.x2 - plot.rect.x1 + 1) * TILE;
    const h = (plot.rect.y2 - plot.rect.y1 + 1) * TILE;
    scene.add
      .image(X1 + w / 2, Y1 + h / 2, key)
      .setDisplaySize(w * 0.96, h * 0.96)
      .setDepth(depth)
      .setAlpha(0.95);
  }
}

/**
 * Floor plate only, no furniture. Rooms whose contents are authored elsewhere — the
 * estates home (player-placed FURNITURE), safehouse, tutorial — want the plate without
 * this module dropping props on top of them.
 */
/**
 * The room's floor, keyed by LAYOUT — not by venue kind.
 *
 * venueLayoutFor() hash-picks one of 5 VENUE_LAYOUTS per zone (aspect 1.27..2.45)
 * independent of what kind of venue it is, so a per-kind plate could never match the
 * room it landed in: the old plates were square and covered ~30% of the floor's width.
 * The floor is the layout; the KIND is carried by FURN_BY_KIND furniture on the seats,
 * which is what VenueLayout.tag ("flavor tag for the client dresser") always implied.
 *
 * Sized to the room rect, so the art IS the floor rather than a decal floating in it.
 */
export function dressRoomPlate(
  scene: Phaser.Scene,
  layout: VenueLayoutTag,
  roomW: number,
  roomH: number,
  _salt = 0,
  depth = 4.8,
) {
  const key = layoutPlateKey(layout);
  if (!exists(scene, key)) return;
  scene.add
    .image((roomW * TILE) / 2, (roomH * TILE) / 2, key)
    .setDisplaySize(roomW * TILE, roomH * TILE)
    .setOrigin(0.5)
    .setDepth(depth - 0.2)
    .setAlpha(0.55);
}

/**
 * Draw an art-traced room: the baked `hf_int_*_room` texture IS the room.
 *
 * Full-bleed and opaque over the whole plan rect (wall ring included — the art paints its
 * own frame), so nothing procedural is layered on top: the fixtures in the picture are
 * already mirrored as collision `blocks` by the plan in world/rooms.ts. Contrast with
 * dressRoomPlate, which stretches a generic layout plate at 55% alpha and then scatters
 * furniture sprites that have no relationship to the floor beneath them.
 *
 * Returns false when the texture is missing so the caller can fall back to the
 * procedural dresser — art must never be a hard boot dependency.
 */
export function dressArtRoom(
  scene: Phaser.Scene,
  art: string,
  roomW: number,
  roomH: number,
  depth = 2.0,
  /** Optional district identity wash; a duplicate of the same art preserves geometry. */
  accent?: number,
): boolean {
  if (!exists(scene, art)) return false;
  scene.add
    .image((roomW * TILE) / 2, (roomH * TILE) / 2, art)
    .setDisplaySize(roomW * TILE, roomH * TILE)
    .setOrigin(0.5)
    .setDepth(depth)
    .setAlpha(1);
  if (accent !== undefined) {
    scene.add
      .image((roomW * TILE) / 2, (roomH * TILE) / 2, art)
      .setDisplaySize(roomW * TILE, roomH * TILE)
      .setOrigin(0.5)
      .setDepth(depth + 0.01)
      .setTint(accent)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.075);
  }
  // The room sources are enhanced to ~3x their original size and then drawn smaller.
  // LINEAR re-blurred those pixels during camera zoom; NEAREST preserves the authored
  // counters, walls, signage, and floor details in interiors and hub rooms.
  try {
    scene.textures.get(art).setFilter(Phaser.Textures.FilterMode.NEAREST);
  } catch {
    /* ignore */
  }
  return true;
}

export function dressInteriorWishlistArt(
  scene: Phaser.Scene,
  kind: string,
  roomW: number,
  roomH: number,
  seats: Array<[number, number]>,
  salt = 0,
  depth = 4.8,
  /** The room's floor plan. Omitted → inferred from the room's aspect. */
  layout?: VenueLayoutTag,
) {
  // Floor = layout, furniture = kind. The two are independent: venueLayoutFor() picks the
  // plan by zone hash, not by what kind of venue it is.
  dressRoomPlate(scene, layout ?? layoutTagForRoom(roomW, roomH), roomW, roomH, salt, depth);

  const pack = FURN_BY_KIND[kind] ?? [...HF_FURN_KEYS].slice(0, 6);
  const spots: Array<{ x: number; y: number }> = seats.map(([tx, ty]) => ({
    x: tx * TILE + TILE / 2,
    y: ty * TILE + TILE / 2,
  }));
  // Extra wall-edge spots so sparse seats still get furniture
  if (spots.length < 4) {
    spots.push(
      { x: TILE * 2.5, y: TILE * 3 },
      { x: (roomW - 2.5) * TILE, y: TILE * 3 },
      { x: TILE * 3, y: (roomH - 3) * TILE },
      { x: (roomW - 3) * TILE, y: (roomH - 3) * TILE },
    );
  }
  for (let i = 0; i < spots.length; i++) {
    const base = pack[i % pack.length];
    const key = variant(scene, base.replace(/_b$/, ""), salt + i, 2);
    place(scene, key, spots[i].x, spots[i].y, depth, 0.85, 0.95);
  }
}

/** @deprecated use dressInteriorWishlistArt */
export function dressInteriorWishlistFurniture(
  scene: Phaser.Scene,
  spots: Array<{ x: number; y: number }>,
  depth = 5,
) {
  const keys = HF_FURN_KEYS.filter((k) => scene.textures.exists(k));
  if (keys.length === 0) return;
  for (let i = 0; i < spots.length; i++) {
    const k = keys[i % keys.length];
    place(scene, k, spots[i].x, spots[i].y, depth, 0.85, 0.95);
  }
}

/** Wilderness corridor HF props (bridge span + biome clutter). */
export function dressWildernessWishlistArt(
  scene: Phaser.Scene,
  worldW: number,
  worldH: number,
  biomeSalt = 0,
  depth = 4.2,
  /** Bridge layout biome — selects the ground plate. Omitted → span + clutter only. */
  biome?: string,
) {
  const midX = worldW / 2;
  const midY = worldH / 2;
  // Biome ground plate sits under the span so each bridge zone reads as its own terrain.
  if (biome) {
    place(
      scene,
      `hf_wild_biome_${biome}`,
      midX,
      midY,
      depth - 0.3,
      Math.max(worldW, worldH) / (TILE * 9),
      0.5,
      false,
      0xffffff,
      0.5,
    );
  }
  const span = variant(scene, "hf_wild_bridge_span", biomeSalt, 2);
  place(scene, span, midX, midY, depth, 1.1, 0.88, false, 0xffffff, 0.55);

  const clutter = [
    "hf_wild_guardrail",
    "hf_wild_ash_pile",
    "hf_wild_salt_crust",
    "hf_wild_rust_car",
    "hf_wild_sign_post",
    "hf_wild_relay_pylon",
  ];
  const positions = [
    [midX - TILE * 6, midY - TILE * 2],
    [midX + TILE * 7, midY + TILE],
    [midX - TILE * 3, midY + TILE * 4],
    [midX + TILE * 4, midY - TILE * 5],
    [midX - TILE * 8, midY + TILE * 3],
    [midX + TILE * 9, midY - TILE * 2],
  ];
  for (let i = 0; i < clutter.length; i++) {
    const [x, y] = positions[i];
    if (x < TILE * 2 || y < TILE * 2 || x > worldW - TILE * 2 || y > worldH - TILE * 2) continue;
    place(scene, clutter[i], x, y, depth + 0.05, 0.8, 0.9);
  }
  void HF_WILD_PROP_KEYS;
}

/** ICE vault / dungeon dressing around core + side racks. */
export function dressDungeonWishlistArt(
  scene: Phaser.Scene,
  coreTx: number,
  coreTy: number,
  salt = 0,
  depth = 4.5,
) {
  const cx = coreTx * TILE + TILE / 2;
  const cy = coreTy * TILE + TILE / 2;
  place(scene, "hf_dungeon_floor_hex", cx, cy, depth - 0.2, 1.2, 0.7, false, 0xffffff, 0.5);
  const ped = variant(scene, "hf_dungeon_core_pedestal", salt, 2);
  place(scene, ped, cx, cy, depth, 1, 0.95, true, 0x29e7ff, 0.7);
  place(scene, "hf_dungeon_ice_crystal", cx - TILE * 4, cy - TILE * 2, depth + 0.05, 0.85, 0.9, true, 0x8dfff0);
  place(scene, "hf_dungeon_ice_crystal", cx + TILE * 4, cy + TILE, depth + 0.05, 0.8, 0.9, true, 0x8dfff0);
  place(scene, "hf_dungeon_server_rack", cx - TILE * 6, cy + TILE * 3, depth + 0.05, 0.85, 0.92);
  place(scene, "hf_dungeon_server_rack", cx + TILE * 6, cy - TILE * 3, depth + 0.05, 0.85, 0.92);
  place(scene, "hf_dungeon_guardian_nest", cx + TILE * 3, cy + TILE * 5, depth + 0.08, 0.9, 0.9, true, 0xb06bff);
  place(scene, "hf_dungeon_cable_curtain", cx, cy - TILE * 5, depth + 0.02, 0.9, 0.75);
  void HF_DUNGEON_PROP_KEYS;
}

/** Map BuildingKind-like strings for room dressers. */
export function interiorKindKey(kind: string | BuildingKind): string {
  return String(kind || "home");
}
