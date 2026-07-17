import { describe, expect, it } from "vitest";
import { FACTION_COLORS, FACTION_NAMES } from "../net/sim";
import { FACTIONS, factionCaptureLine, factionTerritoryLine } from "./factions";

describe("factions", () => {
  it("stays wire-compatible with the shared faction arrays", () => {
    expect(FACTIONS.map((f) => f.name)).toEqual(FACTION_NAMES);
    expect(FACTIONS.map((f) => f.color)).toEqual(FACTION_COLORS);
  });

  it("makes control readable as a political outcome", () => {
    expect(factionTerritoryLine(0, -1, "THE STACKS")).toMatch(/unsettled|no unique relay majority/);
    expect(factionTerritoryLine(1, 1, "THE STACKS")).toMatch(/holds THE STACKS/);
    expect(factionCaptureLine(2, "THE STACKS")).toMatch(/QUIET PROTOCOL/);
  });
});
