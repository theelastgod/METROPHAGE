import { describe, expect, it } from "vitest";
import { contactJudgmentReaction, districtJudgmentReaction, factionJudgmentReaction, fixerJudgment } from "./judgmentReactions";

describe("persistent FIXER judgment reactions", () => {
  it("derives one mutually exclusive judgment from durable flags", () => {
    expect(fixerJudgment([])).toBeNull();
    expect(fixerJudgment(["fixer_spared"])).toBe("spared");
    expect(fixerJudgment(["fixer_exposed"])).toBe("exposed");
  });

  it("authors distinct reactions for four allies, eight districts, and four Cells", () => {
    for (const npc of ["rin", "doc", "vex", "marek"]) {
      const spare = contactJudgmentReaction(npc, ["fixer_spared"], 1);
      const expose = contactJudgmentReaction(npc, ["fixer_exposed"], 1);
      expect(spare?.length, npc).toBeGreaterThan(100);
      expect(expose?.length, npc).toBeGreaterThan(100);
      expect(spare, npc).not.toBe(expose);
    }
    for (let district = 0; district < 8; district++) {
      expect(districtJudgmentReaction(district, ["fixer_spared"])?.length).toBeGreaterThan(95);
      expect(districtJudgmentReaction(district, ["fixer_exposed"])).not.toBe(districtJudgmentReaction(district, ["fixer_spared"]));
    }
    for (let faction = 0; faction < 4; faction++) {
      expect(factionJudgmentReaction(faction, ["fixer_exposed"])?.length).toBeGreaterThan(95);
    }
  });

  it("requires at least a known relationship for private ally reactions", () => {
    expect(contactJudgmentReaction("rin", ["fixer_spared"], 0)).toBeNull();
    expect(contactJudgmentReaction("unknown", ["fixer_spared"], 3)).toBeNull();
  });
});
