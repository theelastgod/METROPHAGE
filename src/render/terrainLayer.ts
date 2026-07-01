import Phaser from "phaser";
import { TILE, TILESET_PX } from "../config";

const REAL_ART_TILES = TILESET_PX > TILE;
import { TILESET_KEY } from "../assets/manifest";
import { applyTileVariants } from "./tileVariants";
import { paintFloorDetail } from "./floorDetail";
import { shadeWalls } from "./wallShade";
import { paintWetStreets } from "./wetStreets";
import { paintAmbientFloors } from "./ambientFloors";
import { paintDistrictBuildingFacades } from "./buildingFacades";
import type { TileGrid } from "../world/district";
import type { Rect } from "../game/districts";

/** Where the terrain is shown — picks sensible default polish passes. */
export type TerrainProfile = "district" | "city" | "tutorial" | "interior" | "subway" | "dungeon" | "wilderness";

export interface TerrainLayerOpts {
  profile?: TerrainProfile;
  accent?: number;
  accentAt?: (tx: number, ty: number) => number;
  floorDetail?: boolean;
  wallShade?: boolean;
  wetStreets?: boolean;
  ambientFloors?: boolean;
  /** District/combat building rects — paints distinct façades when provided. */
  buildings?: Rect[];
  /** Large city hub: thinner wet-street pass (skips per-tile puddles). */
  lightweight?: boolean;
}

const DEFAULTS: Record<TerrainProfile, Pick<TerrainLayerOpts, "wetStreets" | "ambientFloors" | "wallShade">> = {
  district: { wetStreets: true, ambientFloors: false, wallShade: true },
  city: { wetStreets: true, ambientFloors: false, wallShade: true },
  tutorial: { wetStreets: true, ambientFloors: false, wallShade: true },
  interior: { wetStreets: false, ambientFloors: true, wallShade: true },
  subway: { wetStreets: false, ambientFloors: true, wallShade: true },
  dungeon: { wetStreets: true, ambientFloors: false, wallShade: true },
  wilderness: { wetStreets: false, ambientFloors: true, wallShade: true },
};

/**
 * Build a tilemap layer and run the full terrain polish stack used across METROPHAGE:
 * variant scatter → floor detail → wall shade → outdoor wet streets OR indoor ambient pools.
 */
export function createTerrainLayer(
  scene: Phaser.Scene,
  grid: TileGrid,
  opts: TerrainLayerOpts = {},
): Phaser.Tilemaps.TilemapLayer {
  const profile = opts.profile ?? "district";
  const d = DEFAULTS[profile];
  const accent = opts.accent ?? 0x29e7ff;
  const accentAt = opts.accentAt ?? (() => accent);

  const map = scene.make.tilemap({ data: grid, tileWidth: TILE, tileHeight: TILE });
  const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILESET_PX, TILESET_PX)!;
  const layer = map.createLayer(0, tileset, 0, 0)!;

  applyTileVariants(layer);
  if (opts.floorDetail !== false) paintFloorDetail(scene, grid, 1.8, { realArt: REAL_ART_TILES });
  if (opts.wallShade ?? d.wallShade) shadeWalls(scene, grid, accent, 2.5, REAL_ART_TILES);
  if (opts.wetStreets ?? d.wetStreets) paintWetStreets(scene, grid, accentAt, 2, { lightweight: opts.lightweight });
  if (opts.ambientFloors ?? d.ambientFloors) paintAmbientFloors(scene, grid, accent);
  if (opts.buildings?.length) paintDistrictBuildingFacades(scene, opts.buildings, accent);

  return layer;
}