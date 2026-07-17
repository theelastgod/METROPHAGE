import { describe, expect, it } from "vitest";
import { DISTRICT_REGIONAL_ANCHORS, districtFieldMedic, districtRegionalAnchor, FIELD_MEDICS, hubResident, INTERIOR_PLAN, keeperFor, marekReprintGreeting, npcDef, themedHubOccupants } from "./cityNpcs";

describe("MAREK's reprint memory", () => {
  it("stays quiet for fresh runners and escalates at 3 / 10 / 25 deaths", () => {
    expect(marekReprintGreeting(0)).toBeNull();
    expect(marekReprintGreeting(2)).toBeNull();
    const tiers = [marekReprintGreeting(3), marekReprintGreeting(10), marekReprintGreeting(25)];
    for (const t of tiers) expect(t).toBeTruthy();
    expect(new Set(tiers).size).toBe(3);
  });
});

describe("themed hub venue occupants", () => {
  const EXPANSION_KINDS = ["noodle", "ripperdoc", "pawn", "arcade", "garage", "radio"];

  it("every expansion venue resolves an authored occupant with real lines", () => {
    for (const kind of EXPANSION_KINDS) {
      const occupants = themedHubOccupants(kind);
      expect(occupants.length, kind).toBeGreaterThanOrEqual(1);
      for (const o of occupants) {
        expect(o.lines.length, `${kind} occupant ${o.id}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("no occupant shares a name with the venue's keeper (one character standing twice)", () => {
    for (const kind of EXPANSION_KINDS) {
      const keeper = keeperFor(kind);
      for (const o of themedHubOccupants(kind)) {
        expect(o.name, kind).not.toBe(keeper.name);
      }
    }
  });

  it("every INTERIOR_PLAN id resolves to a defined NPC", () => {
    for (const [kind, groups] of Object.entries(INTERIOR_PLAN)) {
      for (const id of groups.flat()) {
        expect(npcDef(id), `${kind} → ${id}`).toBeTruthy();
      }
    }
  });

  it("quest-NPC kinds stay out of the hub-duplicate path", () => {
    for (const kind of ["bar", "shop", "clinic", "den", "guild", "home"]) {
      expect(themedHubOccupants(kind), kind).toEqual([]);
    }
  });
});

describe("district field medics", () => {
  it("rotates authored medics across every campaign district", () => {
    expect(new Set(Array.from({ length: 8 }, (_, i) => districtFieldMedic(i).id)).size).toBe(FIELD_MEDICS.length);
    for (let district = 0; district < 8; district++) {
      const medic = districtFieldMedic(district);
      expect(npcDef(medic.id)).toEqual(medic);
      expect(medic.lines.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("district regional anchors", () => {
  it("places one distinct, authored, service-capable contact in every district", () => {
    expect(DISTRICT_REGIONAL_ANCHORS).toHaveLength(8);
    expect(new Set(DISTRICT_REGIONAL_ANCHORS).size).toBe(8);
    for (let district = 0; district < 8; district++) {
      const npc = districtRegionalAnchor(district);
      expect(npc.id).toBe(DISTRICT_REGIONAL_ANCHORS[district]);
      expect(npc.lines.length, npc.id).toBeGreaterThanOrEqual(2);
      expect(npcDef(npc.id), npc.id).toEqual(npc);
    }
  });

  it("does not clone the Kernel's stable courier into a hub residence", () => {
    const hub = Array.from({ length: 30 }, (_, index) => hubResident(index));
    expect(new Set(hub.map((npc) => npc.id)).size).toBe(30);
    expect(hub.some((npc) => npc.id === "res_borne")).toBe(false);
  });
});
