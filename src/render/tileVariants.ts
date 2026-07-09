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
      // walkable surfaces are pulled DOWN into a dark-street band so the busy pink floor
      // panels recede and the neon accents (player, enemies, loot, doors) pop against
      // them; ~1/8 pushed darker still for grimy unevenness
      const dark = (h & 7) === 0;
      f = dark ? 0.42 + ((h >>> 3) % 12) / 100 : 0.56 + ((h >>> 3) % 20) / 100;
    }
    const v = Math.max(0, Math.min(255, Math.round(f * 255)));
    tile.tint = (v << 16) | (v << 8) | v;
    tile.tintFill = false;
  });
}
