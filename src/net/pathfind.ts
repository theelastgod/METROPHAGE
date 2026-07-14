import { TILE } from "../config";
import { isWall, type TileGrid } from "../world/district";

const DIRS: Array<[number, number, number]> = [
  [0, 1, 1],
  [1, 0, 1],
  [0, -1, 1],
  [-1, 0, 1],
  [1, 1, 1.414],
  [1, -1, 1.414],
  [-1, 1, 1.414],
  [-1, -1, 1.414],
];

export function worldToTile(x: number, y: number) {
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
}

export function tileCenter(tx: number, ty: number) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

export function isWalkable(grid: TileGrid, tx: number, ty: number): boolean {
  if (ty < 0 || tx < 0 || ty >= grid.length) return false;
  const row = grid[ty];
  if (!row || tx >= row.length) return false;
  return !isWall(row[tx]);
}

function heuristic(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * A* pathfind on the tile grid — returns world-space waypoints (tile centres).
 * RuneScape-style click-to-walk uses this on both client prediction and UI.
 * Default budget scales with grid size so 120×90 districts are pathable (400 was too low).
 */
export function findPath(
  grid: TileGrid,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  maxNodes?: number,
): Array<{ x: number; y: number }> | null {
  const gw = grid[0]?.length ?? 0;
  const gh = grid.length;
  // ~half the open tiles is enough for cross-district walks without hanging a frame.
  const budget = maxNodes ?? Math.max(4000, Math.min(14_000, Math.floor((gw * gh) / 3) || 4000));
  const start = worldToTile(startX, startY);
  const goal = worldToTile(endX, endY);
  if (!isWalkable(grid, goal.tx, goal.ty)) {
    // snap to nearest walkable tile around the click
    let found: { tx: number; ty: number } | null = null;
    for (let r = 1; r <= 4 && !found; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = goal.tx + dx;
          const ty = goal.ty + dy;
          if (isWalkable(grid, tx, ty)) {
            found = { tx, ty };
            break;
          }
        }
        if (found) break;
      }
    }
    if (!found) return null;
    goal.tx = found.tx;
    goal.ty = found.ty;
  }

  const key = (tx: number, ty: number) => `${tx},${ty}`;
  const open: Array<{ tx: number; ty: number; g: number; f: number }> = [];
  const came = new Map<string, { tx: number; ty: number }>();
  const gScore = new Map<string, number>();
  const startK = key(start.tx, start.ty);
  gScore.set(startK, 0);
  open.push({ tx: start.tx, ty: start.ty, g: 0, f: heuristic(start.tx, start.ty, goal.tx, goal.ty) });

  let expanded = 0;
  while (open.length > 0 && expanded < budget) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    expanded++;
    if (cur.tx === goal.tx && cur.ty === goal.ty) {
      const tiles: Array<{ tx: number; ty: number }> = [];
      let k = key(cur.tx, cur.ty);
      let node: { tx: number; ty: number } | undefined = { tx: cur.tx, ty: cur.ty };
      while (node) {
        tiles.unshift(node);
        const p = came.get(k);
        if (!p) break;
        k = key(p.tx, p.ty);
        node = p;
      }
      return tiles.map((t) => tileCenter(t.tx, t.ty));
    }
    for (const [dx, dy, cost] of DIRS) {
      const nx = cur.tx + dx;
      const ny = cur.ty + dy;
      if (!isWalkable(grid, nx, ny)) continue;
      // block corner-cutting through walls
      if (dx !== 0 && dy !== 0) {
        const rowA = grid[cur.ty];
        const rowB = grid[ny];
        if ((rowA && isWall(rowA[nx]!)) || (rowB && isWall(rowB[cur.tx]!))) continue;
      }
      const nk = key(nx, ny);
      const tg = cur.g + cost;
      const prev = gScore.get(nk);
      if (prev !== undefined && tg >= prev) continue;
      came.set(nk, { tx: cur.tx, ty: cur.ty });
      gScore.set(nk, tg);
      open.push({ tx: nx, ty: ny, g: tg, f: tg + heuristic(nx, ny, goal.tx, goal.ty) });
    }
  }
  return null;
}