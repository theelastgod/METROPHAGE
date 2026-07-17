import { describe, expect, it } from "vitest";
import { shouldBroadcastSnapshot, shouldIncludeRoster, snapshotStride } from "./snapshotPolicy";

describe("crowded-zone snapshot policy", () => {
  it("keeps small rooms at full 20 Hz network cadence", () => {
    expect(snapshotStride(1)).toBe(1);
    expect(snapshotStride(40)).toBe(1);
    expect(shouldBroadcastSnapshot(7, 40)).toBe(true);
  });

  it("steps down network cadence as crowds grow (reliability-first)", () => {
    expect(snapshotStride(41)).toBe(2);
    expect(snapshotStride(64)).toBe(2);
    expect(snapshotStride(65)).toBe(3);
    expect(snapshotStride(100)).toBe(3);
    expect(snapshotStride(101)).toBe(4);
    expect(snapshotStride(161)).toBe(5);
    expect(shouldBroadcastSnapshot(10, 50)).toBe(true);
    expect(shouldBroadcastSnapshot(11, 50)).toBe(false);
  });

  it("embeds roster about once per second at 20 Hz", () => {
    expect(shouldIncludeRoster(0)).toBe(true);
    expect(shouldIncludeRoster(20)).toBe(true);
    expect(shouldIncludeRoster(7)).toBe(false);
  });
});
