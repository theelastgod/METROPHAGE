import { describe, expect, it } from "vitest";
import { CAMPAIGN_ECHOES, campaignEchoLine, districtCampaignEcho, latestCampaignEcho } from "./campaignEchoes";
import { QUESTS } from "./quests";

describe("campaign echoes", () => {
  it("gives every main act four personal callbacks and one civic consequence", () => {
    expect(CAMPAIGN_ECHOES).toHaveLength(10);
    expect(new Set(CAMPAIGN_ECHOES.map((e) => e.quest))).toEqual(new Set(QUESTS.slice(0, 10).map((q) => q.id)));
    for (const e of CAMPAIGN_ECHOES) {
      for (const line of [e.fixer, e.ally, e.resident, e.fragment, e.civic]) expect(line.length).toBeGreaterThan(45);
    }
  });

  it("selects the latest completed act and preserves the FIXER judgment", () => {
    expect(latestCampaignEcho(["the_wake", "dead_reckoning"])?.quest).toBe("dead_reckoning");
    expect(campaignEchoLine("ally", ["fixers_debt"], ["fixer_spared"])).toMatch(/witness/);
    expect(districtCampaignEcho(2, ["fixers_debt"], ["fixer_exposed"])).toMatch(/published/);
  });

  it("keeps the judgment present after later acts replace the debt as latest echo", () => {
    const completed = ["fixers_debt", "spire_protocol", "dock_run"];
    expect(campaignEchoLine("ally", completed, ["fixer_spared"])).toMatch(/alive as a witness/);
    expect(districtCampaignEcho(3, completed, ["fixer_exposed"])).toMatch(/city knows/);
  });
});
