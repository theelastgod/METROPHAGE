import { describe, expect, it } from "vitest";
import { remotePlayerView } from "./playerSnapshot";

describe("remote player snapshots", () => {
  it("contains presentation state without leaking self-only economy/progression", () => {
    const source = {
      id: "runner",
      x: 10.126,
      y: 20.999,
      hp: 42.6,
      dead: false,
      dashUntilTick: 8,
      droneUntilTick: 4,
      credits: 999_999,
      metro: 50_000,
      campaignQuest: "classified",
      ack: 123,
    };
    const view = remotePlayerView(source, 5, undefined);
    expect(view).toEqual({ id: "runner", x: 10.13, y: 21, hp: 43, dead: false, look: undefined, dash: 1 });
    expect(view).not.toHaveProperty("credits");
    expect(view).not.toHaveProperty("metro");
    expect(view).not.toHaveProperty("campaignQuest");
    expect(view).not.toHaveProperty("ack");
  });
});
