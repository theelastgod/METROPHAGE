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
  // Octile distance — matches 8-dir costs better than pure Euclidean.
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/** Binary min-heap on f-score (no O(n log n) re-sort each expand). */
class OpenHeap {
  private a: Array<{ tx: number; ty: number; g: number; f: number }> = [];
  get length() {
    return this.a.length;
  }
  push(n: { tx: number; ty: number; g: number; f: number }) {
    this.a.push(n);
    this.up(this.a.length - 1);
  }
  pop() {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      this.down(0);
    }
    return top;
  }
  private up(i: number) {
    const a = this.a;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  private down(i: number) {
    const a = this.a;
    for (;;) {
      let best = i;
      const l = i * 2 + 1;
      const r = l + 1;
      if (l < a.length && a[l].f < a[best].f) best = l;
      if (r < a.length && a[r].f < a[best].f) best = r;
      if (best === i) break;
      [a[best], a[i]] = [a[i], a[best]];
      i = best;
    }
  }
}

/**
 * A* pathfind on the tile grid — returns world-space waypoints (tile centres).
 * RuneScape-style click-to-walk. Heap + larger budget for 120×90 combat districts.
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
  // Paid clients can afford a larger expand budget; still capped per frame.
  const budget = maxNodes ?? Math.max(6000, Math.min(22_000, Math.floor((gw * gh) / 2.2) || 6000));
  const start = worldToTile(startX, startY);
  let goalTx = Math.floor(endX / TILE);
  let goalTy = Math.floor(endY / TILE);
  if (!isWalkable(grid, goalTx, goalTy)) {
    // Wider snap ring so clicks near walls still path.
    let foundTx = -1;
    let foundTy = -1;
    let bestD = Infinity;
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = goalTx + dx;
          const ty = goalTy + dy;
          if (!isWalkable(grid, tx, ty)) continue;
          const d = Math.hypot(dx, dy);
          if (d < bestD) {
            bestD = d;
            foundTx = tx;
            foundTy = ty;
          }
        }
      }
      if (foundTx >= 0) break;
    }
    if (foundTx < 0) return null;
    goalTx = foundTx;
    goalTy = foundTy;
  }
  const goal = { tx: goalTx, ty: goalTy };

  // Trivial: same tile or adjacent walkable — no full search.
  if (start.tx === goal.tx && start.ty === goal.ty) {
    return [tileCenter(goal.tx, goal.ty)];
  }

  const key = (tx: number, ty: number) => `${tx},${ty}`;
  const open = new OpenHeap();
  const came = new Map<string, { tx: number; ty: number }>();
  const gScore = new Map<string, number>();
  const startK = key(start.tx, start.ty);
  gScore.set(startK, 0);
  open.push({
    tx: start.tx,
    ty: start.ty,
    g: 0,
    f: heuristic(start.tx, start.ty, goal.tx, goal.ty),
  });

  let expanded = 0;
  while (open.length > 0 && expanded < budget) {
    const cur = open.pop()!;
    expanded++;
    const ck = key(cur.tx, cur.ty);
    if (cur.tx === goal.tx && cur.ty === goal.ty) {
      const tiles: Array<{ tx: number; ty: number }> = [];
      let k = ck;
      let node: { tx: number; ty: number } | undefined = { tx: cur.tx, ty: cur.ty };
      while (node) {
        tiles.unshift(node);
        const p = came.get(k);
        if (!p) break;
        k = key(p.tx, p.ty);
        node = p;
      }
      return simplifyPath(
        grid,
        tiles.map((t) => tileCenter(t.tx, t.ty)),
      );
    }
    // Stale heap entry
    const known = gScore.get(ck);
    if (known !== undefined && cur.g > known + 1e-6) continue;

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

/** Drop collinear / LOS-clear intermediate waypoints for smoother click-to-walk. */
function simplifyPath(grid: TileGrid, pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (pts.length <= 2) return pts;
  const out: Array<{ x: number; y: number }> = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let best = i + 1;
    for (let j = pts.length - 1; j > i + 1; j--) {
      if (lineClear(grid, pts[i].x, pts[i].y, pts[j].x, pts[j].y)) {
        best = j;
        break;
      }
    }
    out.push(pts[best]);
    i = best;
  }
  return out;
}

function lineClear(grid: TileGrid, x0: number, y0: number, x1: number, y1: number): boolean {
  const a = worldToTile(x0, y0);
  const b = worldToTile(x1, y1);
  let x = a.tx;
  let y = a.ty;
  const dx = Math.abs(b.tx - a.tx);
  const dy = Math.abs(b.ty - a.ty);
  const sx = a.tx < b.tx ? 1 : -1;
  const sy = a.ty < b.ty ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    if (!isWalkable(grid, x, y)) return false;
    if (x === b.tx && y === b.ty) return true;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}
