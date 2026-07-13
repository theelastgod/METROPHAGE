import { describe, expect, it } from "vitest";
import { shouldBroadcastSnapshot, snapshotStride } from "./snapshotPolicy";

describe("crowded-zone snapshot policy", () => {
  it("keeps small zones at the 20 Hz simulation cadence", () => {
    expect(snapshotStride(1)).toBe(1);
    expect(snapshotStride(64)).toBe(1);
    expect(shouldBroadcastSnapshot(7, 64)).toBe(true);
  });

  it("steps down network cadence as crowds grow", () => {
    expect(snapshotStride(65)).toBe(2);
    expect(snapshotStride(128)).toBe(2);
    expect(snapshotStride(129)).toBe(3);
    expect(snapshotStride(257)).toBe(4);
    expect(shouldBroadcastSnapshot(10, 100)).toBe(true);
    expect(shouldBroadcastSnapshot(11, 100)).toBe(false);
  });
});
