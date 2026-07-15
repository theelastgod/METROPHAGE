import { describe, expect, it } from "vitest";
import { isWall } from "./district";
import { PLAYER, TILE } from "../config";
import {
  buildSubway,
  SUBWAY_SPAWN,
  SUBWAY_STATIONS,
  SUBWAY_SPINE_TILES,
  SUBWAY_END_TO_END_SEC,
  subwaySpawnForEntry,
  subwayEnemyPosts,
  subwayBossTile,
  subwayThreatTier,
  resolveSubwayOpen,
} from "./subway";

describe("THE UNDERLINE subway network", () => {
  it("is a large multi-direction map (not a tiny room)", () => {
    const g = buildSubway();
    expect(g.length).toBeGreaterThan(60);
    expect(g[0].length).toBeGreaterThan(80);
  });

  it("longest-path budget is still ~90s of continuous walking", () => {
    const px = SUBWAY_SPINE_TILES * TILE;
    const sec = px / PLAYER.speed;
    expect(sec).toBeGreaterThan(85);
    expect(sec).toBeLessThan(95);
    expect(SUBWAY_END_TO_END_SEC).toBe(90);
  });

  it("places hub + all campaign districts (not a single east-west spine)", () => {
    expect(SUBWAY_STATIONS[0].zone).toBe("safe");
    expect(SUBWAY_STATIONS.some((s) => s.zone === "d0")).toBe(true);
    expect(SUBWAY_STATIONS.some((s) => s.zone === "d7")).toBe(true);
    // Stations occupy different axes (2D layout) — not all on one row
    const xs = new Set(SUBWAY_STATIONS.map((s) => s.tx));
    const ys = new Set(SUBWAY_STATIONS.map((s) => s.ty));
    expect(xs.size).toBeGreaterThan(3);
    expect(ys.size).toBeGreaterThan(2);
  });

  it("hub and deep stations are open floor", () => {
    const g = buildSubway();
    const hub = SUBWAY_STATIONS.find((s) => s.zone === "safe")!;
    const deep = SUBWAY_STATIONS.reduce((a, b) => (b.depth > a.depth ? b : a));
    expect(isWall(g[hub.ty][hub.tx])).toBe(false);
    expect(isWall(g[deep.ty][deep.tx])).toBe(false);
    const open = resolveSubwayOpen(g, SUBWAY_SPAWN.x, SUBWAY_SPAWN.y);
    expect(isWall(g[Math.floor(open.y / TILE)][Math.floor(open.x / TILE)])).toBe(false);
  });

  it("entry from a district lands at that station", () => {
    const d3 = subwaySpawnForEntry("d3");
    const st = SUBWAY_STATIONS.find((s) => s.zone === "d3")!;
    expect(Math.abs(d3.x - (st.tx * TILE + TILE / 2))).toBeLessThan(4);
    expect(Math.abs(d3.y - (st.ty * TILE + TILE / 2))).toBeLessThan(4);
  });

  it("threat ramps with campaign district rung (not just map geometry)", () => {
    expect(subwayThreatTier(0)).toBe(0);
    expect(subwayThreatTier(2)).toBe(1);
    expect(subwayThreatTier(7)).toBe(3);
    const plaza = SUBWAY_STATIONS.find((s) => s.zone === "d0");
    const kernel = SUBWAY_STATIONS.find((s) => s.zone === "d7");
    expect(plaza?.campaignThreat).toBe(0);
    expect(kernel?.campaignThreat).toBe(7);
    expect(subwayThreatTier(kernel!.campaignThreat)).toBeGreaterThan(subwayThreatTier(plaza!.campaignThreat));
  });

  it("places dense enemy posts and a boss near the deep end", () => {
    expect(subwayEnemyPosts().length).toBeGreaterThan(50);
    const boss = subwayBossTile();
    const deep = SUBWAY_STATIONS.reduce((a, b) => (b.depth > a.depth ? b : a));
    expect(Math.hypot(boss.tx - deep.tx, boss.ty - deep.ty)).toBeLessThan(20);
  });

  it("enemy posts and boss land on open floor (not solid rock)", () => {
    const g = buildSubway();
    const posts = subwayEnemyPosts();
    let open = 0;
    for (const p of posts) {
      if (!isWall(g[p.ty]?.[p.tx])) open++;
    }
    // Tunnel L-path sampling should put nearly all posts on floor.
    expect(open).toBeGreaterThan(posts.length * 0.85);
    const boss = subwayBossTile();
    expect(isWall(g[boss.ty]?.[boss.tx])).toBe(false);
  });
});

