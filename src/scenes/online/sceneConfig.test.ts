import { describe, expect, it } from "vitest";
import { ONLINE_CITY } from "../../world/city";
import {
  DISTRICT_VENUE_TITLE,
  HUB_CX,
  HUB_CY,
  districtBuildingKind,
  districtEdgeTiles,
  hexColor,
  hubLook,
  hubT,
  parseBuildingInterior,
  parseHubInterior,
  venueStaffFor,
} from "./sceneConfig";

describe("online scene configuration", () => {
  it("parses district interiors without accepting partial zone ids", () => {
    // Only unique venue indices 0–4 (one of each kind) are enterable.
    expect(parseBuildingInterior("d3i2")).toEqual({ district: 3, index: 2 });
    expect(parseBuildingInterior("d3i12")).toBeNull();
    expect(parseBuildingInterior("d3i12-extra")).toBeNull();
    expect(parseBuildingInterior("w3")).toBeNull();
  });

  it("only accepts hub interiors that have a corresponding city building", () => {
    expect(parseHubInterior("h0")).toBe(0);
    expect(parseHubInterior(`h${ONLINE_CITY.buildings.length - 1}`)).toBe(ONLINE_CITY.buildings.length - 1);
    expect(parseHubInterior(`h${ONLINE_CITY.buildings.length}`)).toBeNull();
    expect(parseHubInterior("h-1")).toBeNull();
  });

  it("anchors hub offsets to the authored city spawn", () => {
    expect([HUB_CX, HUB_CY]).toEqual(ONLINE_CITY.spawn);
    expect(hubT(-3, 5)).toEqual([ONLINE_CITY.spawn[0] - 3, ONLINE_CITY.spawn[1] + 5]);
  });

  it("derives district gates from actual grid dimensions", () => {
    const grid = Array.from({ length: 17 }, () => Array(31).fill(0));
    expect(districtEdgeTiles(grid)).toEqual({ east: [23, 8], west: [8, 8] });
  });

  it("keeps building titles and appearance defaults deterministic", () => {
    // Exactly one of each kind — no wrap / no second shop.
    expect([0, 1, 2, 3, 4, 5].map(districtBuildingKind)).toEqual(["shop", "home", "guild", "den", "bar", null]);
    expect(DISTRICT_VENUE_TITLE[districtBuildingKind(3)!]).toBe("THE DEN");
    expect(hubLook({ color: 0x123456, hair: "buzz" })).toMatchObject({
      color: 0x123456,
      hair: "buzz",
      build: "normal",
      accentColor: 0xff2bd6,
    });
    expect(hexColor(0x123456)).toBe("#123456");
    expect(hexColor(0xff123456)).toBe("#123456");
  });

  it("gives every building kind at least one functional staff service", () => {
    const kinds = [
      "shop",
      "home",
      "guild",
      "den",
      "bar",
      "clinic",
      "hospital",
      "hotel",
      "subway",
      "stadium",
      "citycenter",
    ];
    for (const k of kinds) {
      const staff = venueStaffFor(k);
      expect(staff.length, k).toBeGreaterThan(0);
      expect(staff[0].svc, k).toBeTruthy();
    }
    expect(venueStaffFor("subway")[0].svc).toBe("subway");
    expect(venueStaffFor("clinic")[0].svc).toBe("heal");
    expect(venueStaffFor("shop")[0].svc).toBe("vendor");
  });
});
