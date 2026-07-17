import { describe, expect, it } from "vitest";
import { consumeCapturedAchievements, consumeCapturedDeltas } from "./statQueue";

describe("stat persistence queues", () => {
  it("preserves increments that arrive while a captured batch is in flight", () => {
    const live = { rep: 17, rel_j_doc: 2, local_d0: 23 };
    consumeCapturedDeltas(live, [["rep", 12], ["rel_j_doc", 1], ["local_d0", 20]]);
    expect(live).toEqual({ rep: 5, rel_j_doc: 1, local_d0: 3 });
  });

  it("removes fully acknowledged deltas and achievements only", () => {
    const live = { kills: 4, bosses: 1 };
    consumeCapturedDeltas(live, [["kills", 4]]);
    expect(live).toEqual({ bosses: 1 });
    expect(consumeCapturedAchievements(["first_blood", "late_arrival"], ["first_blood"]))
      .toEqual(["late_arrival"]);
  });
});

