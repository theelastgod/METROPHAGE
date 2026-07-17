import { describe, expect, it } from "vitest";
import { WORLD_EVENTS } from "./worldEvents";

describe("world event resolution contracts", () => {
  it("makes survival, rescue, reward, and authored failure explicit for every event", () => {
    expect(WORLD_EVENTS.length).toBeGreaterThanOrEqual(7);
    for (const event of WORLD_EVENTS) {
      expect(event.condition, event.id).toMatch(/Remain alive/);
      expect(event.condition, event.id).toMatch(/party reboot/);
      expect(event.failure.length, event.id).toBeGreaterThan(75);
      expect(event.failure, event.id).toMatch(/No survival payout/);
      expect(event.reward.xp, event.id).toBeGreaterThan(0);
      expect(event.reward.currency, event.id).toBeGreaterThan(0);
    }
  });
});
