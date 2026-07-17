import { describe, expect, it } from "vitest";
import { ONLINE_CITY } from "../world/city";
import { themedHubOccupants } from "./cityNpcs";
import { npcPresentInZone } from "./npcPresence";

describe("authoritative NPC zone presence", () => {
  it("keeps hub contacts in Metro City and rejects remote impersonation", () => {
    expect(npcPresentInZone("marek", "safe")).toBe(true);
    expect(npcPresentInZone("marek", "d7")).toBe(false);
    expect(npcPresentInZone("doc", "clinic")).toBe(true);
    expect(npcPresentInZone("doc", "shop")).toBe(false);
    expect(npcPresentInZone("kessler", "guild")).toBe(true);
    expect(npcPresentInZone("marek", "home")).toBe(true);
  });

  it("matches deterministic hub-building occupants", () => {
    const index = ONLINE_CITY.buildings.findIndex((b) => themedHubOccupants(b.kind).length > 0);
    expect(index).toBeGreaterThanOrEqual(0);
    const occupant = themedHubOccupants(ONLINE_CITY.buildings[index].kind)[0];
    expect(npcPresentInZone(occupant.id, `h${index}`)).toBe(true);
    expect(npcPresentInZone(occupant.id, "safe")).toBe(false);
  });

  it("places stable regional anchors only in their authored district", () => {
    expect(npcPresentInZone("street_kid", "d0")).toBe(true);
    expect(npcPresentInZone("street_kid", "d1")).toBe(false);
    expect(npcPresentInZone("res_borne", "d7")).toBe(true);
  });
});
