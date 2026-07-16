import { describe, expect, it } from "vitest";
import { BOSS_BOUNTY_COOLDOWN_MS, BOUNTIES, LATE_BOUNTIES, bossBountyCooldownRemaining, bountyById, bountyForNpc } from "./bounties";
import { servicesForNpc } from "./npcServices";

describe("bounty ↔ service-menu coherence", () => {
  it("every NPC whose menu shows Job actually has a job to give", () => {
    for (const npc of Object.keys(BOUNTIES)) {
      expect(servicesForNpc(npc, true), npc).toContain("bounty");
    }
  });

  it("bounty ids are unique across base and late-act tables", () => {
    const ids = [...Object.values(BOUNTIES), ...Object.values(LATE_BOUNTIES)].map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("story allies escalate in the late act, and completion can find both variants", () => {
    for (const ally of ["rin", "doc", "vex", "marek"]) {
      const base = bountyForNpc(ally, "pre");
      const late = bountyForNpc(ally, "late");
      expect(base, ally).toBeTruthy();
      expect(late, ally).toBeTruthy();
      expect(late!.id, ally).not.toBe(base!.id);
      expect(late!.rewardCredits, ally).toBeGreaterThan(base!.rewardCredits);
      expect(bountyById(late!.id), ally).toEqual(late);
      expect(bountyById(base!.id), ally).toEqual(base);
    }
    // Non-allies never change jobs with the act.
    expect(bountyForNpc("keep_noodle", "late")).toEqual(bountyForNpc("keep_noodle", "pre"));
  });
});

describe("boss bounty cooldown", () => {
  it("blocks the same boss job for 24 hours", () => {
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
