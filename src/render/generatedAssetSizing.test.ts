import { describe, expect, it } from "vitest";
import { generatedAssetScale, generatedReferencePx } from "./generatedAssetSizing";

describe("generated world asset sizing", () => {
  it("normalizes large generated cutouts to the same footprint as small ones", () => {
    expect(generatedAssetScale("hf_subway_identity_signal_altar", 384, 384, 0.6)).toBeCloseTo(0.15);
    expect(generatedAssetScale("hf_furn_sofa", 72, 37, 0.6)).toBe(0.6);
  });

  it("does not alter hand-authored pixel assets", () => {
    expect(generatedAssetScale("prop_bin", 384, 384, 0.7)).toBe(0.7);
  });

  it("allows structural modules a larger multi-tile reference", () => {
    expect(generatedReferencePx("hf_subway_platform_hub")).toBe(160);
    expect(generatedReferencePx("hf_subway_identity_warning_cluster")).toBe(96);
  });
});
