import { describe, expect, it } from "vitest";
import { stepMove, collides, pvpZonesFor, NET_TICK_MS, PLAYER_RADIUS, type MoveState } from "./sim";
import { buildGrid, isWall } from "../world/district";
import { DISTRICTS } from "../game/districts";
import { TILE } from "../config";

function openTile(grid: ReturnType<typeof buildGrid>): { x: number; y: number } {
  for (let ty = 2; ty < grid.length - 2; ty++) {
    for (let tx = 2; tx < (grid[0]?.length ?? 0) - 2; tx++) {
      if (!isWall(grid[ty][tx])) {
        return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
      }
    }
  }
  return { x: TILE * 4, y: TILE * 4 };
}

describe("net/sim stepMove", () => {
  const grid = buildGrid(DISTRICTS[0]);
  const start = openTile(grid);

  it("moves right when mx=1", () => {
    const s: MoveState = { ...start };
    stepMove(s, { mx: 1, my: 0 }, grid, NET_TICK_MS);
    expect(s.x).toBeGreaterThan(start.x);
    expect(s.y).toBe(start.y);
  });

  it("does not move with zero intent", () => {
    const s: MoveState = { ...start };
    stepMove(s, { mx: 0, my: 0 }, grid, NET_TICK_MS);
    expect(s.x).toBe(start.x);
    expect(s.y).toBe(start.y);
  });

  it("is deterministic for identical inputs", () => {
    const a: MoveState = { ...start };
    const b: MoveState = { ...start };
    for (let i = 0; i < 20; i++) {
      stepMove(a, { mx: 1, my: -1 }, grid, NET_TICK_MS);
      stepMove(b, { mx: 1, my: -1 }, grid, NET_TICK_MS);
    }
    expect(a.x).toBeCloseTo(b.x, 5);
    expect(a.y).toBeCloseTo(b.y, 5);
  });

  it("collides with world edge", () => {
    const { worldW, worldH } = { worldW: grid[0].length * 32, worldH: grid.length * 32 };
    expect(collides(-PLAYER_RADIUS, worldH / 2, grid)).toBe(true);
    expect(collides(worldW + PLAYER_RADIUS, worldH / 2, grid)).toBe(true);
  });
});

describe("net/sim PvP zones", () => {
  it("only enables outdoor district arenas", () => {
    expect(pvpZonesFor(3840, 2880, "d0")).toHaveLength(1);
    expect(pvpZonesFor(480, 352, "h0")).toHaveLength(0);
    expect(pvpZonesFor(480, 352, "d0i0")).toHaveLength(0);
    expect(pvpZonesFor(480, 352, "est0")).toHaveLength(0);
  });
});
