import { describe, expect, it } from "vitest";
import { factionCampaignBrief, factionCampaignReaction, weeklyFactionCampaign } from "./factionCampaigns";

describe("weekly faction campaigns", () => {
  it("gives every Cell a distinct doctrine for the same mechanical week", () => {
    const now = 1_700_000_000_000;
    const names = [0, 1, 2, 3].map((f) => weeklyFactionCampaign(f, now).codename);
    expect(new Set(names).size).toBe(4);
    for (let f = 0; f < 4; f++) expect(factionCampaignBrief(f, now).length).toBeGreaterThan(80);
  });

  it("authors both holder self-critique and rival response", () => {
    expect(factionCampaignReaction(2, 2, "THE STACKS")).toMatch(/Warning:/);
    expect(factionCampaignReaction(0, 2, "THE STACKS")).toMatch(/answers:/);
  });
});
