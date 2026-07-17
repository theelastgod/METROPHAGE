import { describe, expect, it } from "vitest";
import { CASEFILE_MILESTONES, DISTRICT_CAST, casefileMilestone, districtResidentScheduleLine, districtTestimonyStatus, linkedResidentLine, residentClueGrant, residentClueSnapshot, residentConfirmationGrant, residentConfirmationSnapshot, residentConvergenceLine, residentPlace, residentScheduleLine, residentZone, scheduledResidents } from "./residentLife";

describe("resident life", () => {
  it("authors a conflict pair for every district", () => {
    for (let d = 0; d < 8; d++) {
      const cast = DISTRICT_CAST.filter((r) => r.district === d);
      expect(cast).toHaveLength(2);
      expect(cast.some((r) => !!r.clueId)).toBe(true);
      expect(cast.some((r) => !!r.respondsTo)).toBe(true);
      for (const r of cast) expect(residentScheduleLine(r, 0).length).toBeGreaterThan(40);
    }
  });

  it("moves deterministically across street, work, refuge, and home", () => {
    const r = DISTRICT_CAST[0];
    const sixHours = 6 * 60 * 60 * 1000;
    expect([0, 1, 2, 3].map((n) => residentPlace(r, n * sixHours))).toEqual(["street", "work", "refuge", "home"]);
    expect(residentZone(r, sixHours)).toBe(`d${r.district}i${r.workVenue}`);
    expect(scheduledResidents("d0", 0).map((x) => x.npc.id)).toContain(r.id);
    expect(districtResidentScheduleLine(0, 0)).toMatch(/NIX: street/);
  });

  it("turns one resident's durable clue into their counterpart's testimony", () => {
    const source = DISTRICT_CAST.find((r) => r.clueId)!;
    const target = DISTRICT_CAST.find((r) => r.respondsTo === source.clueId)!;
    const clue = residentClueGrant(source.id)!;
    expect(linkedResidentLine(target.id, [])).toBeNull();
    expect(linkedResidentLine(target.id, [clue.clueId])).toBe(target.responseLine);
    expect(residentClueSnapshot({ [clue.key]: 1 })).toContain(clue.clueId);
    expect(residentConfirmationGrant(target.id, [])).toBeNull();
    const confirmation = residentConfirmationGrant(target.id, [clue.clueId])!;
    expect(confirmation.clueId).toBe(clue.clueId);
    expect(residentConfirmationSnapshot({ [confirmation.key]: 1 })).toContain(clue.clueId);
  });

  it("unlocks bounded cross-district follow-up fieldwork at 2 / 4 / 8 confirmations", () => {
    expect(CASEFILE_MILESTONES.map((m) => m.threshold)).toEqual([2, 4, 8]);
    const ids = DISTRICT_CAST.flatMap((r) => r.clueId ? [r.clueId] : []);
    expect(casefileMilestone(ids.slice(0, 1))).toBeNull();
    expect(casefileMilestone(ids.slice(0, 2))?.title).toBe("SHARED LESSON");
    expect(casefileMilestone(ids.slice(0, 4))?.title).toBe("THE HUMAN ROUTE");
    expect(casefileMilestone(ids)?.title).toBe("REPRINT ECONOMY");
    expect(residentConvergenceLine("res_nix", ids)).toMatch(/REPRINT ECONOMY/);
    expect(residentConvergenceLine("fixer", ids)).toBeNull();
    expect(districtTestimonyStatus(0, [], [])).toMatch(/UNOPENED/);
    expect(districtTestimonyStatus(0, [ids[0]], [])).toMatch(/LEAD RECORDED/);
    expect(districtTestimonyStatus(0, [ids[0]], [ids[0]])).toMatch(/CORROBORATED/);
  });
});
