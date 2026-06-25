import Phaser from "phaser";
import { variantOf } from "../world/district";

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
