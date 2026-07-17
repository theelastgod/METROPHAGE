import { describe, expect, it } from "vitest";
import { closedShopBump, closedShopFor } from "./closedShops";

describe("closed storefronts", () => {
  it("is deterministic per (district, day) and authored", () => {
    for (let d = 0; d < 8; d++) {
      const a = closedShopFor(d, 100);
      const b = closedShopFor(d, 100);
      expect(a).toEqual(b);
      expect(a.name.length).toBeGreaterThan(2);
      expect(a.reason.length).toBeGreaterThan(2);
    }
  });

  it("rotates across days and clamps bad district input", () => {
    const names = new Set(Array.from({ length: 12 }, (_, day) => closedShopFor(0, day).name));
    expect(names.size).toBeGreaterThan(3); // cycles through the roster over time
    expect(() => closedShopFor(-5, 3)).not.toThrow();
    expect(closedShopFor(999, 3).name).toBeTruthy();
  });

  it("varies the bump line on repeat attempts", () => {
    const shop = closedShopFor(2, 5);
    expect(closedShopBump(shop, 0)).not.toBe(closedShopBump(shop, 1));
    expect(closedShopBump(shop, 0)).toContain(shop.name);
  });
});
