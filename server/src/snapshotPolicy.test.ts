import { describe, expect, it } from "vitest";
import { shouldBroadcastSnapshot, snapshotStride } from "./snapshotPolicy";

describe("crowded-zone snapshot policy", () => {
  it("keeps social hubs at the 20 Hz simulation cadence (Paid headroom)", () => {
    expect(snapshotStride(1)).toBe(1);
    expect(snapshotStride(64)).toBe(1);
    expect(snapshotStride(100)).toBe(1);
    expect(shouldBroadcastSnapshot(7, 100)).toBe(true);
  });

  it("steps down network cadence as crowds grow", () => {
    expect(snapshotStride(101)).toBe(2);
    expect(snapshotStride(180)).toBe(2);
    expect(snapshotStride(181)).toBe(3);
    expect(snapshotStride(301)).toBe(4);
    expect(shouldBroadcastSnapshot(10, 150)).toBe(true);
    expect(shouldBroadcastSnapshot(11, 150)).toBe(false);
  });
});
