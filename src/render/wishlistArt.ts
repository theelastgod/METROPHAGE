// METROPHAGE — place wishlist / expanse Higgsfield art so world structure matches sprites.
// Missing textures are skipped so the client boots mid-gen.

import Phaser from "phaser";
import { TILE } from "../config";
import {
  HF_LANDMARK_KEYS,
  HF_FURN_KEYS,
  HF_INT_ROOM_KEYS,
  HF_WILD_PROP_KEYS,
  HF_DUNGEON_PROP_KEYS,
  GLOW_KEY,
  pickHfVariant,
} from "../assets/manifest";
import type { SubwayStation } from "../world/subway";
import { subwayStationTier } from "../world/subway";
import type { BuildingKind } from "../world/city";

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
) {
  if (!scene.textures.exists(key)) return null;
  const img = scene.add
    .image(x, y, key)
    .setDepth(depth)
    .setOrigin(0.5, originY)
    .setScale(scale)
    .setAlpha(alpha)
    .setTint(tint);
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

  const majors = stations.filter((s) => s.major);
  for (let i = 0; i < majors.length - 1; i++) {
    const a = majors[i];
    const b = majors[i + 1];
    const mx = ((a.tx + b.tx) / 2) * TILE + TILE / 2;
    const my = ((a.ty + b.ty) / 2) * TILE + TILE / 2;
    const key =
      i % 3 === 0
        ? "hf_subway_tunnel_junction"
        : i % 3 === 1
          ? "hf_subway_tunnel_cross"
          : "hf_subway_tunnel_straight";
    place(scene, key, mx, my, depth - 0.1, 0.7, 0.55, false, 0xffffff, 0.5);
  }
}

/** Kind → interior room plate + furniture set. */
const INT_ROOM: Partial<Record<string, string>> = {
  bar: "hf_int_bar_room",
  clinic: "hf_int_clinic_room",
  hospital: "hf_int_clinic_room",
  shop: "hf_int_shop_room",
  guild: "hf_int_guild_room",
  den: "hf_int_den_room",
  home: "hf_int_home_room",
  hotel: "hf_int_home_room",
  subway: "hf_int_subway_room",
  stadium: "hf_int_stadium_room",
  citycenter: "hf_int_citycenter_room",
  estate: "hf_int_estate_room",
};

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
export function dressRoomPlate(
  scene: Phaser.Scene,
  kind: string,
  roomW: number,
  roomH: number,
  salt = 0,
  depth = 4.8,
) {
  const roomKey = INT_ROOM[kind];
  if (!roomKey) return;
  const plate = kind === "home" || kind === "hotel" ? variant(scene, "hf_int_home_room", salt, 2) : roomKey;
  place(
    scene,
    plate,
    (roomW * TILE) / 2,
    (roomH * TILE) / 2,
    depth - 0.2,
    Math.min(roomW, roomH) * 0.085,
    0.55,
    false,
    0xffffff,
    0.5,
  );
}

export function dressInteriorWishlistArt(
  scene: Phaser.Scene,
  kind: string,
  roomW: number,
  roomH: number,
  seats: Array<[number, number]>,
  salt = 0,
  depth = 4.8,
) {
  dressRoomPlate(scene, kind, roomW, roomH, salt, depth);

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
  void HF_INT_ROOM_KEYS;
}

/** Map BuildingKind-like strings for room dressers. */
export function interiorKindKey(kind: string | BuildingKind): string {
  return String(kind || "home");
}
