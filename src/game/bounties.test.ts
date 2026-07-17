import { describe, expect, it } from "vitest";
import { BOSS_BOUNTY_COOLDOWN_MS, BOUNTIES, CASEFILE_BOUNTIES, LATE_BOUNTIES, POST_AWAKENING_BOUNTIES, bossBountyCooldownRemaining, bountyById, bountyForNpc, bountyIsEligible } from "./bounties";
import { servicesForNpc } from "./npcServices";
import { DISTRICT_REGIONAL_ANCHORS } from "./cityNpcs";

describe("bounty ↔ service-menu coherence", () => {
  it("every NPC whose menu shows Job actually has a job to give", () => {
    for (const npc of Object.keys(BOUNTIES)) {
      expect(servicesForNpc(npc, true), npc).toContain("bounty");
    }
  });

  it("every stable regional anchor exposes an authored job when its civic route is open", () => {
    for (const npc of DISTRICT_REGIONAL_ANCHORS) {
      const bounty = bountyForNpc(npc, "pre", [], [], Array(8).fill(1));
      expect(bounty, npc).toBeTruthy();
      expect(servicesForNpc(npc, true), npc).toContain("bounty");
    }
  });

  it("bounty ids are unique across base and late-act tables", () => {
    const ids = [...Object.values(BOUNTIES), ...Object.values(LATE_BOUNTIES), ...Object.values(CASEFILE_BOUNTIES), ...Object.values(POST_AWAKENING_BOUNTIES)].map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps casefile follow-ups hidden until their testimony is corroborated", () => {
    for (const [npc, b] of Object.entries(CASEFILE_BOUNTIES)) {
      expect(b.requiredConfirmation, npc).toBeTruthy();
      expect(bountyForNpc(npc, "pre", []), npc).toBeUndefined();
      expect(bountyForNpc(npc, "pre", [b.requiredConfirmation!]), npc).toEqual(b);
      expect(bountyById(b.id), npc).toEqual(b);
      expect(servicesForNpc(npc, true), npc).toContain("bounty");
      expect(servicesForNpc(npc, false), npc).not.toContain("bounty");
    }
  });

  it("replaces source-resident work with reconstruction only after THE AWAKENING", () => {
    for (const [npc, b] of Object.entries(POST_AWAKENING_BOUNTIES)) {
      expect(b.requiredCampaign).toBe("continue_q");
      expect(bountyForNpc(npc, "pre", [], []), npc).not.toEqual(b);
      expect(bountyForNpc(npc, "pre", [], ["continue_q"]), npc).toEqual(b);
      expect(bountyById(b.id), npc).toEqual(b);
      expect(servicesForNpc(npc, true), npc).toContain("bounty");
    }
  });

  it("uses the same authority predicate for direct accepts and persisted hydration", () => {
    expect(bountyIsEligible(LATE_BOUNTIES.rin, "pre")).toBe(false);
    expect(bountyIsEligible(LATE_BOUNTIES.rin, "late")).toBe(true);
    expect(bountyIsEligible(CASEFILE_BOUNTIES.res_solenne, "pre", [])).toBe(false);
    expect(bountyIsEligible(CASEFILE_BOUNTIES.res_solenne, "pre", ["forecast_children"])).toBe(true);
    expect(bountyIsEligible(POST_AWAKENING_BOUNTIES.res_nix, "pre", [], [])).toBe(false);
    expect(bountyIsEligible(POST_AWAKENING_BOUNTIES.res_nix, "pre", [], ["continue_q"])).toBe(true);
  });

  it("opens authored courier routes only after this week's public work", () => {
    const couriers = Object.values(BOUNTIES).filter((b) => b.objective === "travel");
    expect(couriers).toHaveLength(4);
    for (const b of couriers) {
      expect(b.requiredCivicWork, b.id).toBe(true);
      expect(b.requiredCivicDistrict, b.id).toBeGreaterThanOrEqual(0);
      expect(b.requiredCivicDistrict, b.id).toBeLessThan(8);
      expect(b.targetZone, b.id).toBeTruthy();
      expect(b.rewardCredits, b.id).toBeLessThanOrEqual(360);
      expect(bountyForNpc(b.npc, "pre", [], [], []), b.id).toBeUndefined();
      const opened = Array(8).fill(0);
      opened[b.requiredCivicDistrict!] = 1;
      const wrongDistrict = Array(8).fill(0);
      wrongDistrict[(b.requiredCivicDistrict! + 1) % 8] = 1;
      expect(bountyForNpc(b.npc, "pre", [], [], opened), b.id).toEqual(b);
      expect(bountyForNpc(b.npc, "pre", [], [], wrongDistrict), b.id).toBeUndefined();
      expect(bountyIsEligible(b, "pre", [], [], []), b.id).toBe(false);
      expect(bountyIsEligible(b, "pre", [], [], opened), b.id).toBe(true);
      expect(bountyById(b.id), b.id).toEqual(b);
    }
  });

  it("story allies escalate in the late act, and completion can find both variants", () => {
    for (const ally of ["rin", "doc", "vex", "marek"]) {
      const base = bountyForNpc(ally, "pre");
      const late = bountyForNpc(ally, "late");
      expect(base, ally).toBeTruthy();
      expect(late, ally).toBeTruthy();
      expect(late!.id, ally).not.toBe(base!.id);
      expect(late!.requiredPhase, ally).toBe("late");
      expect(late!.rewardCredits, ally).toBeGreaterThan(base!.rewardCredits);
      expect(bountyById(late!.id), ally).toEqual(late);
      expect(bountyById(base!.id), ally).toEqual(base);
    }
    // Non-allies never change jobs with the act.
    expect(bountyForNpc("keep_noodle", "late")).toEqual(bountyForNpc("keep_noodle", "pre"));
  });
});

describe("durable bounty cooldown", () => {
  it("blocks the same boss or courier job for 24 hours", () => {
    const now = 1_800_000_000_000;
    expect(bossBountyCooldownRemaining(now, now)).toBe(BOSS_BOUNTY_COOLDOWN_MS);
    expect(bossBountyCooldownRemaining(now - BOSS_BOUNTY_COOLDOWN_MS + 1, now)).toBe(1);
    expect(bossBountyCooldownRemaining(now - BOSS_BOUNTY_COOLDOWN_MS, now)).toBe(0);
  });

  it("treats missing or invalid history as available", () => {
    expect(bossBountyCooldownRemaining(0)).toBe(0);
    expect(bossBountyCooldownRemaining(Number.NaN)).toBe(0);
  });
});
