import { describe, expect, it } from "vitest";
import { Campaign, parseCampaign, serializeCampaign } from "./campaign";

describe("campaign judgment", () => {
  it("requires the FIXER'S DEBT judgment stage and resolves only once", () => {
    const c = new Campaign({ activeId: "fixers_debt", stage: 2, progress: 0, completed: ["the_wake", "homestead", "dead_reckoning"], flags: ["debt_ready"] });
    expect(c.fixerJudgmentPending).toBe(true);
    expect(c.resolveFixerJudgment("expose")).toBe(true);
    expect(c.hasFlag("fixer_exposed")).toBe(true);
    expect(c.hasFlag("fixer_spared")).toBe(false);
    expect(c.resolveFixerJudgment("spare")).toBe(false);
  });

  it("persists the decision through campaign serialization", () => {
    const c = new Campaign({ activeId: "fixers_debt", stage: 2, progress: 0, completed: [], flags: [] });
    c.resolveFixerJudgment("spare");
    const restored = new Campaign(parseCampaign(serializeCampaign(c.toData())));
    expect(restored.hasFlag("fixer_spared")).toBe(true);
    expect(restored.stage).toBe(3);
  });
});
