import { describe, expect, it } from "vitest";
import { deferredWorldAssetsForZone } from "./manifest";

const keys = (zone: string) => new Set(deferredWorldAssetsForZone(zone).map((a) => a.key));

describe("deferred world asset routing", () => {
  it("loads hub art without decoding unrelated dungeon and wilderness packs", () => {
    const hub = keys("safe");
    expect(hub.has("hf_building_bar")).toBe(true);
    expect(hub.has("hf_subway_ghost_train")).toBe(false);
    expect([...hub].some((k) => k.startsWith("hf_wild_"))).toBe(false);
  });

  it("loads only the requested district building kit", () => {
    const d0 = keys("d0");
    expect(d0.has("hf_building_dist_core")).toBe(true);
    expect(d0.has("hf_building_dist_sprawl")).toBe(false);
  });

  it("routes every campaign district to its named exterior kit", () => {
    const expected = ["core", "stacks", "spire", "docks", "undercity", "relay", "wastes", "kernel"];
    expected.forEach((slug, i) => {
      expect(keys(`d${i}`).has(`hf_building_dist_${slug}`), `d${i} should load ${slug}`).toBe(true);
    });
  });

  it("loads subway and venue art on demand", () => {
    expect(keys("subway").has("hf_subway_tunnel_straight")).toBe(true);
    expect(keys("h3").has("hf_int_bar_room")).toBe(true);
  });

  it("keeps the subway handoff within a mobile-safe generated-art decode budget", () => {
    const subway = [...keys("subway")];
    const generatedSubway = subway.filter(
      (key) => key.startsWith("hf_subway_") || key.startsWith("hf_ground_subway_"),
    );
    expect(generatedSubway.length).toBeLessThanOrEqual(70);
    expect(generatedSubway.some((key) => key.startsWith("hf_subway_tile_"))).toBe(true);
    expect(generatedSubway.some((key) => key.startsWith("hf_subway_identity_"))).toBe(true);
  });
});
