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

  it("gives field medics cooldown-limited charity healing, not a paid clinic menu", () => {
    for (const id of ["field_medic_patch", "field_medic_suture", "field_medic_gauze", "field_medic_needle"]) {
      expect(servicesForNpc(id, false)).toEqual(["chat", "heal_charity"]);
    }
  });
});
