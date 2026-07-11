import Phaser from "phaser";
import { variantOf, COLLIDING_TILES } from "../world/district";

/** Wall/building/roof cells (incl. scattered variants) — darkened harder so blocked
 *  masses recede and the walkable street reads bright, top-down-legible. */
const SOLID = new Set<number>(COLLIDING_TILES);

/**
 * Scatter the real-art tile variants across a freshly-created tilemap layer to break the
 * "same square repeated" grid. Render-only: each tile's index is rewritten to a deterministic
 * variant of the *same surface* (see TILE_VARIANTS in district.ts), so the logical grid,
 * collision semantics and prop/wall logic (which all key off the canonical base index) are
 * untouched. Roof variants are colliding cells, so call this AFTER createLayer and BEFORE
 * setCollision(COLLIDING_TILES) — the variant indices are included in that list.
 */
export function applyTileVariants(layer: Phaser.Tilemaps.TilemapLayer): void {
  layer.forEachTile((tile) => {
    const v = variantOf(tile.index, tile.x, tile.y);
    if (v !== tile.index) tile.index = v;
  });
}

/**
 * Per-tile brightness jitter to kill the "same square repeated forever" look. Sets each
 * tile's GPU tint to a deterministic grayscale multiplier (rides the tilemap batch — zero
 * new objects, zero per-frame cost). Tint can only darken, so this reads as varied
 * wear/shadow/grime across the surface — the cheapest possible fix for tileset monotony.
 * A fraction of cells are pushed darker to break long identical runs; call AFTER
 * applyTileVariants.
 */
export function jitterTileTint(layer: Phaser.Tilemaps.TilemapLayer): void {
  layer.forEachTile((tile) => {
    if (tile.index < 0) return;
    const h = ((tile.x * 374761393) ^ (tile.y * 668265263) ^ (tile.index * 2246822519)) >>> 0;
    let f: number;
    if (SOLID.has(tile.index)) {
      // building/wall masses recede — a darker band (0.42–0.60) so blocked space reads
      // clearly distinct from the walkable street (huge top-down navigation + combat win)
      f = 0.42 + ((h >>> 3) % 19) / 100;
    } else {
      // walkable surfaces: wider brightness bands so long runs of the same tile don't
      // read as a flat magenta maze; ~1/6 darker grime patches for unevenness
      const band = h % 6;
      if (band === 0) f = 0.40 + ((h >>> 3) % 10) / 100;
      else if (band === 1) f = 0.50 + ((h >>> 4) % 12) / 100;
      else if (band === 2) f = 0.58 + ((h >>> 5) % 14) / 100;
      else if (band === 3) f = 0.64 + ((h >>> 3) % 10) / 100;
      else if (band === 4) f = 0.52 + ((h >>> 6) % 16) / 100;
      else f = 0.60 + ((h >>> 2) % 12) / 100;
    }
    const v = Math.max(0, Math.min(255, Math.round(f * 255)));
    tile.tint = (v << 16) | (v << 8) | v;
    tile.tintFill = false;
  });
}
