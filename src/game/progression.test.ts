import { describe, expect, it } from "vitest";
import { DISTRICTS } from "./districts";
import {
  DISTRICT_PROGRESSION,
  campaignThreatForZone,
  progressionCoversAllDistricts,
  progressionForDistrict,
  subwayScaleFromThreat,
  subwayTierFromCampaignThreat,
  tunnelCampaignThreat,
} from "./progression";

describe("campaign progression", () => {
  it("covers every district with rising power", () => {
    expect(progressionCoversAllDistricts()).toBe(true);
    expect(DISTRICT_PROGRESSION.length).toBeGreaterThanOrEqual(DISTRICTS.length);
    let prevHp = 0;
    for (let i = 0; i < DISTRICTS.length; i++) {
      const p = progressionForDistrict(i);
      expect(p.enemyHpMult).toBeGreaterThan(prevHp * 0.95);
      prevHp = p.enemyHpMult;
      expect(p.recLevel[0]).toBeLessThanOrEqual(p.recLevel[1]);
      expect(p.kindPattern.length).toBeGreaterThan(3);
    }
    expect(progressionForDistrict(0).enemyHpMult).toBeLessThan(1);
    expect(progressionForDistrict(7).enemyHpMult).toBeGreaterThan(2);
  });

  it("maps subway zones to campaign threat", () => {
    expect(campaignThreatForZone("safe")).toBe(0);
    expect(campaignThreatForZone("d0")).toBe(0);
    expect(campaignThreatForZone("d3")).toBe(3);
    expect(campaignThreatForZone("d7")).toBe(7);
    expect(campaignThreatForZone("w2")).toBe(2.5);
  });

  it("tunnels lean toward the harder destination", () => {
    // Leaving hub toward kernel line — mid-tunnel already hotter than plaza
    const mid = tunnelCampaignThreat("safe", "d7", 0.5);
    expect(mid).toBeGreaterThan(3);
    const nearSoft = tunnelCampaignThreat("safe", "d0", 0.2);
    expect(nearSoft).toBeLessThan(1);
  });

  it("subway tiers step with campaign threat", () => {
    expect(subwayTierFromCampaignThreat(0)).toBe(0);
    expect(subwayTierFromCampaignThreat(2)).toBe(1);
    expect(subwayTierFromCampaignThreat(4)).toBe(2);
    expect(subwayTierFromCampaignThreat(7)).toBe(3);
    const soft = subwayScaleFromThreat(0);
    const hard = subwayScaleFromThreat(7);
    expect(hard.hpMult).toBeGreaterThan(soft.hpMult * 1.8);
    expect(soft.eliteChance).toBe(0);
    expect(hard.eliteChance).toBeGreaterThan(0.1);
  });
});
