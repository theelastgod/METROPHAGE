import { describe, expect, it } from "vitest";
import { selectBuildingSprite } from "./buildingSprites";

/** `exists` is the only world state selectBuildingSprite reads. */
const withKeys =
  (...keys: string[]) =>
  (k: string) =>
    keys.includes(k);

const CLEAN = [
  "hf_building_dist_undercity",
  "hf_building_dist_core",
  "hf_building_home",
  "hf_building_bar",
];

describe("selectBuildingSprite — infected precedence", () => {
  it("uses the district's infected KIT for scenery blocks", () => {
    const exists = withKeys(...CLEAN, "hf_building_dist_undercity_inf", "hf_building_inf_home");
    // paintDistrictBuildingFacades passes kind="home" for scenery.
    expect(
      selectBuildingSprite(exists, "home", {
        districtId: "undercity",
        infected: true,
        preferDistrictKit: true,
      }),
    ).toBe("hf_building_dist_undercity_inf");
  });

  it("never stamps kind art across infected scenery when no infected kit exists", () => {
    // Regression: scenery is passed kind="home", so falling back to BUILDING_INFECTED
    // put a house façade on every scenery block in an outbreak district.
    const exists = withKeys(...CLEAN, "hf_building_inf_home");
    const got = selectBuildingSprite(exists, "home", {
      districtId: "undercity",
      infected: true,
      preferDistrictKit: true,
    });
    expect(got).not.toBe("hf_building_inf_home");
    expect(got).toBe("hf_building_dist_undercity"); // clean kit — right subject
  });

  it("uses kind-specific infected art for enterable venues", () => {
    const exists = withKeys(...CLEAN, "hf_building_inf_bar", "hf_building_dist_undercity_inf");
    expect(
      selectBuildingSprite(exists, "bar", {
        districtId: "undercity",
        infected: true,
        preferDistrictKit: false,
      }),
    ).toBe("hf_building_inf_bar");
  });

  it("falls back to the infected kit for a venue kind with no infected art", () => {
    const exists = withKeys(...CLEAN, "hf_building_dist_undercity_inf");
    expect(
      selectBuildingSprite(exists, "stadium", {
        districtId: "undercity",
        infected: true,
        preferDistrictKit: false,
      }),
    ).toBe("hf_building_dist_undercity_inf");
  });

  it("covers every landmark kind that can go infected", () => {
    // hotel/subway/stadium/citycenter had no infected art and stayed clean mid-outbreak.
    for (const kind of ["hotel", "subway", "stadium", "citycenter"] as const) {
      const key = `hf_building_inf_${kind}`;
      expect(
        selectBuildingSprite(withKeys(key), kind, { infected: true, preferDistrictKit: false }),
      ).toBe(key);
    }
  });

  it("ignores infected art entirely when not infected", () => {
    const exists = withKeys(...CLEAN, "hf_building_dist_undercity_inf", "hf_building_inf_bar");
    expect(selectBuildingSprite(exists, "bar", { districtId: "undercity", infected: false })).toBe(
      "hf_building_bar",
    );
  });
});

describe("selectBuildingSprite — kit fallback chain", () => {
  it("selects the dedicated noodle-counter exterior", () => {
    expect(selectBuildingSprite(withKeys("hf_building_noodle"), "noodle")).toBe("hf_building_noodle");
  });

  it("prefers a zone's own kit when it exists", () => {
    expect(
      selectBuildingSprite(withKeys("hf_building_dist_market", "hf_building_dist_docks"), "home", {
        districtId: "market",
        preferDistrictKit: true,
      }),
    ).toBe("hf_building_dist_market");
  });

  it("falls back to the historically borrowed kit rather than a procedural façade", () => {
    // market's dedicated kit missing at runtime → still show district art.
    expect(
      selectBuildingSprite(withKeys("hf_building_dist_docks"), "home", {
        districtId: "market",
        preferDistrictKit: true,
      }),
    ).toBe("hf_building_dist_docks");
  });

  it("uses Palantir Plaza's own downtown kit instead of Neon Core", () => {
    expect(
      selectBuildingSprite(withKeys("hf_building_dist_downtown", "hf_building_dist_core"), "home", {
        districtId: "downtown",
        preferDistrictKit: true,
      }),
    ).toBe("hf_building_dist_downtown");
  });

  it("uses unique industrial / slum / residential kits when present", () => {
    expect(
      selectBuildingSprite(withKeys("hf_building_dist_industrial", "hf_building_dist_stacks"), "home", {
        districtId: "industrial",
        preferDistrictKit: true,
      }),
    ).toBe("hf_building_dist_industrial");
    expect(
      selectBuildingSprite(withKeys("hf_building_dist_slum", "hf_building_dist_sprawl"), "home", {
        districtId: "slum",
        preferDistrictKit: true,
      }),
    ).toBe("hf_building_dist_slum");
    expect(
      selectBuildingSprite(withKeys("hf_building_dist_residential", "hf_building_dist_sprawl"), "home", {
        districtId: "residential",
        preferDistrictKit: true,
      }),
    ).toBe("hf_building_dist_residential");
  });

  it("gives THE KERNEL its own kit rather than downtown's", () => {
    expect(
      selectBuildingSprite(withKeys("hf_building_dist_kernel", "hf_building_dist_core"), "home", {
        districtId: "kernel",
        preferDistrictKit: true,
      }),
    ).toBe("hf_building_dist_kernel");
  });

  it("returns undefined (procedural façade) when nothing exists", () => {
    expect(selectBuildingSprite(() => false, "bar", { districtId: "undercity" })).toBeUndefined();
  });

  it("refuses to smear a district identity kit onto a hub footprint", () => {
    expect(
      selectBuildingSprite(withKeys("hf_building_dist_downtown", "hf_building_bar"), "bar", {
        districtId: "downtown",
        noDistrictKit: true,
      }),
    ).toBe("hf_building_bar");
    expect(
      selectBuildingSprite(withKeys("hf_building_dist_downtown"), "bar", {
        districtId: "downtown",
        noDistrictKit: true,
      }),
    ).toBeUndefined();
  });
});
