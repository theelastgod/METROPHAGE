import { describe, expect, it } from "vitest";
import { DECOR_KEYS, ENV_GROUND_KEYS, ENV_PROP_KEYS, firstKey } from "./hubOpeningData";

describe("hub opening dressing", () => {
  it("has a ground plate list for every hub ring", () => {
    const rings = Object.keys(ENV_GROUND_KEYS);
    expect(rings).toEqual(expect.arrayContaining(["downtown", "market", "slum", "industrial", "residential"]));
    for (const env of rings) expect(ENV_GROUND_KEYS[env as keyof typeof ENV_GROUND_KEYS].length).toBeGreaterThan(0);
  });

  it("picks the first texture that actually exists", () => {
    const exists = (k: string) => k === "hf_ground_downtown";
    expect(firstKey(exists, ["missing", "hf_ground_downtown", "hf_ground_core"])).toBe("hf_ground_downtown");
    expect(firstKey(() => false, ["a", "b"])).toBeNull();
  });

  it("maps plaza dressing kinds to fallbacks", () => {
    expect(DECOR_KEYS.planter[0]).toBe("hf_hub_planter");
    expect(DECOR_KEYS.bench[0]).toBe("hf_hub_bench");
    expect(ENV_PROP_KEYS.downtown.some((k) => k.includes("neon"))).toBe(true);
    expect(ENV_PROP_KEYS.slum.some((k) => k.includes("slum") || k.includes("dumpster"))).toBe(true);
  });
});
