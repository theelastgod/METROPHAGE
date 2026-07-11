import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalRunner, hasLocalRunner, loadLocalRunner, touchLocalRunnerZone, writeLocalRunner } from "./LocalRunner";
import { defaultCustomization } from "../game/customization";

/** In-memory localStorage shim — vitest node env has none. */
function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

describe("LocalRunner guest profile (CONTINUE flow)", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("round-trips callsign/class/zone through write → load", () => {
    const cust = defaultCustomization("metrophage");
    cust.callsign = "NEOREAVER";
    writeLocalRunner({ callsign: "NEOREAVER", classId: "metrophage", customization: cust, lastZone: "d2" });
    const p = loadLocalRunner();
    expect(p?.callsign).toBe("NEOREAVER");
    expect(p?.classId).toBe("metrophage");
    expect(p?.lastZone).toBe("d2");
    expect(hasLocalRunner()).toBe(true);
  });

  it("touchLocalRunnerZone updates lastZone without dropping the character", () => {
    const cust = defaultCustomization("swarm");
    cust.callsign = "GHOST-9";
    writeLocalRunner({ callsign: "GHOST-9", classId: "swarm", customization: cust, lastZone: "safe" });
    touchLocalRunnerZone("est3");
    const p = loadLocalRunner();
    expect(p?.lastZone).toBe("est3");
    expect(p?.callsign).toBe("GHOST-9");
    expect(p?.classId).toBe("swarm");
  });

  it("writeLocalRunner without lastZone keeps the previous resume hint", () => {
    const cust = defaultCustomization("wintermute");
    cust.callsign = "ICEWALL";
    writeLocalRunner({ callsign: "ICEWALL", classId: "wintermute", customization: cust, lastZone: "d1" });
    writeLocalRunner({ callsign: "ICEWALL", classId: "wintermute", customization: cust });
    expect(loadLocalRunner()?.lastZone).toBe("d1");
  });

  it("rejects corrupt / legacy blobs instead of throwing", () => {
    localStorage.setItem("metrophage_local_runner_v1", "{not json");
    expect(loadLocalRunner()).toBeNull();
    localStorage.setItem("metrophage_local_runner_v1", JSON.stringify({ v: 2, callsign: "X" }));
    expect(loadLocalRunner()).toBeNull();
    localStorage.setItem("metrophage_local_runner_v1", JSON.stringify({ v: 1, callsign: "", classId: "swarm", customization: {} }));
    expect(loadLocalRunner()).toBeNull();
    expect(hasLocalRunner()).toBe(false);
  });

  it("clearLocalRunner wipes the slot (NEW RUNNER path)", () => {
    const cust = defaultCustomization("k-guerilla");
    cust.callsign = "REDLINE";
    writeLocalRunner({ callsign: "REDLINE", classId: "k-guerilla", customization: cust });
    clearLocalRunner();
    expect(hasLocalRunner()).toBe(false);
  });
});
