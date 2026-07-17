import { describe, expect, it } from "vitest";
import {
  districtStandingKey,
  districtStandingSnapshot,
  districtStandingSummary,
  districtStandingTier,
  relationshipJobsKey,
  relationshipLine,
  relationshipSnapshot,
  relationshipTalkKey,
  relationshipTier,
} from "./relationships";

describe("relationships", () => {
  it("uses bounded, monotonic trust tiers", () => {
    expect(relationshipTier(0, 0)).toBe(0);
    expect(relationshipTier(1, 0)).toBe(1);
    expect(relationshipTier(1, 1)).toBe(2);
    expect(relationshipTier(1, 3)).toBe(3);
  });

  it("hydrates only contacts the runner has met", () => {
    const stats = { [relationshipTalkKey("doc")]: 1, [relationshipJobsKey("doc")]: 1, kills: 99 };
    expect(relationshipSnapshot(stats)).toEqual({ doc: 2 });
  });

  it("clamps district standing and names its social tier", () => {
    const standings = districtStandingSnapshot({ [districtStandingKey(0)]: 999, [districtStandingKey(2)]: 61 });
    expect(standings[0]).toBe(200);
    expect(districtStandingTier(standings[2]).name).toBe("ANCHOR");
    expect(districtStandingSummary(2, standings[2])).toMatch(/ANCHOR.*ARGUS SPIRE/);
  });

  it("reveals authored disclosures as trust rises", () => {
    expect(relationshipLine("doc", "DOC", 0)).toBeNull();
    expect(relationshipLine("doc", "DOC", 3)).toMatch(/REISSUE triage/);
    expect(relationshipLine("unknown_keeper", "KEEPER", 2)).toMatch(/done right/);
  });
});
