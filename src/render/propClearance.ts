import { isWall, type TileGrid } from "../world/district";

/** True when a prop's visual footprint has enough open ground around it. Generated
 * cutouts extend beyond their anchor tile, so checking only the anchor lets them paint
 * over adjacent façades even though collision says they are outside. */
export function hasPropWallClearance(grid: TileGrid, tx: number, ty: number, radius = 2): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (isWall(grid[ty + dy]?.[tx + dx])) return false;
    }
  }
  return true;
}
