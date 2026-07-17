import { describe, expect, it } from "vitest";
import { NPC_SERVICES, serviceIconKey, servicesForNpc, type NpcServiceId } from "./npcServices";

describe("NPC service art", () => {
  it("maps every service to a generated icon key", () => {
    for (const id of Object.keys(NPC_SERVICES) as NpcServiceId[]) {
      expect(serviceIconKey(id)).toMatch(/^hf_service_[a-z_]+$/);
    }
  });

  it("uses the authored sleep and medical identities", () => {
    expect(serviceIconKey("rest")).toBe("hf_service_sleep");
    expect(serviceIconKey("heal_paid")).toBe("hf_service_heal");
    expect(serviceIconKey("open_forge")).toBe("hf_service_repair");
  });

  it("offers the docks pier fishing tap as a free, cooldowned flavour service", () => {
    const fish = NPC_SERVICES.fish;
    expect(fish).toBeTruthy();
    expect(fish.cost).toBe(0); // mints no currency — cooldown is in-memory
    expect(fish.cooldownSec).toBeGreaterThan(0);
    expect(servicesForNpc("porter")).toContain("fish"); // porter = docks regional anchor
    expect(serviceIconKey("fish")).toMatch(/^hf_service_[a-z_]+$/);
  });

  it("prices hotel rest as authored: ₵35, 120s cooldown, server-authoritative", () => {
    const rest = NPC_SERVICES.rest;
    expect(rest).toBeTruthy();
    expect(rest.cost).toBe(35);
    expect(rest.cooldownSec).toBe(120);
    expect(servicesForNpc("keep_hotel")).toContain("rest");
  });

  it("gives field medics cooldown-limited charity healing, not a paid clinic menu", () => {
    for (const id of ["field_medic_patch", "field_medic_suture", "field_medic_gauze", "field_medic_needle"]) {
      expect(servicesForNpc(id, false)).toEqual(["chat", "heal_charity"]);
    }
  });
});
