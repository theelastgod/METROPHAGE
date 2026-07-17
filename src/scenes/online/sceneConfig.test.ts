import { describe, expect, it } from "vitest";
import { INTERIOR_NAMES, ONLINE_CITY } from "../../world/city";
import {
  DISTRICT_VENUE_TITLE,
  HUB_DOOR_COLOR,
  HUB_INTERIOR_TITLE,
  CITY_HUB_NPCS,
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
  it("keeps the three hand-synced kind tables covering every building kind", () => {
    // INTERIOR_NAMES is a full Record<BuildingKind, string>, so the compiler keeps it
    // exhaustive — use its keys as the kind universe for the two loose Records.
    for (const kind of Object.keys(INTERIOR_NAMES)) {
      expect(HUB_INTERIOR_TITLE[kind], `HUB_INTERIOR_TITLE missing ${kind}`).toBeTruthy();
      expect(HUB_DOOR_COLOR[kind], `HUB_DOOR_COLOR missing ${kind}`).toBeTypeOf("number");
      expect(venueStaffFor(kind).length, `venueStaffFor empty for ${kind}`).toBeGreaterThan(0);
    }
  });

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

  it("keeps the Fixer away from the central arrival footprint", () => {
    const fixer = CITY_HUB_NPCS.find((npc) => npc.svc === "contracts");
    expect(fixer).toBeTruthy();
    expect(Math.hypot(fixer!.tile[0] - HUB_CX, fixer!.tile[1] - HUB_CY)).toBeGreaterThan(15);
    expect(ONLINE_CITY.grid[fixer!.tile[1]]?.[fixer!.tile[0]]).toBeDefined();
  });

  it("derives district gates from actual grid dimensions", () => {
    const grid = Array.from({ length: 17 }, () => Array(31).fill(0));
    expect(districtEdgeTiles(grid)).toEqual({ east: [23, 8], west: [8, 8] });
  });

  it("keeps building titles and appearance defaults deterministic", () => {
    // The first five doors are identical in EVERY district (the prefix is
    // load-bearing — editing it would shuffle every runner's known doors);
    // slots 5-6 are the district's specialties.
    for (let district = 0; district < 8; district++) {
      expect([0, 1, 2, 3, 4].map((i) => districtBuildingKind(i, district)), `d${district}`).toEqual([
        "shop", "home", "guild", "den", "bar",
      ]);
      expect(districtBuildingKind(9, district)).toBeNull();
    }
    // Specialty spot-checks: scrap district fences, spire chrome, the relay's signal.
    expect([5, 6].map((i) => districtBuildingKind(i, 1))).toEqual(["pawn", "garage"]);
    expect([5, 6].map((i) => districtBuildingKind(i, 2))).toEqual(["ripperdoc", "radio"]);
    expect(districtBuildingKind(5, 5)).toBe("radio");
    expect(districtBuildingKind(6, 6)).toBeNull(); // wastes: six buildings, six doors
    expect(DISTRICT_VENUE_TITLE[districtBuildingKind(3, 0)!]).toBe("THE DEN");
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
