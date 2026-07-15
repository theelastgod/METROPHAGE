import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureGuestDeviceSecret, readGuestDeviceSecret, guestIdFromCallsign } from "./NetClient";

/** Minimal Storage stand-in; `blocked` reproduces private-mode / ITP throwing. */
function makeStorage(blocked = false): Storage {
  const map = new Map<string, string>();
  const guard = () => {
    if (blocked) throw new Error("storage blocked");
  };
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => {
      guard();
      return map.get(k) ?? null;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => {
      guard();
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      guard();
      map.set(k, v);
    },
  } as unknown as Storage;
}

function installStorage(blocked = false) {
  vi.stubGlobal("localStorage", makeStorage(blocked));
  vi.stubGlobal("sessionStorage", makeStorage(blocked));
}

const KEY = (name: string) => "mp_secret_" + guestIdFromCallsign(name);

describe("readGuestDeviceSecret", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    installStorage();
  });

  it("returns undefined when this device holds no key — it must never mint", () => {
    // The retire bug: ensureGuestDeviceSecret() fabricates a UUID here, and the server
    // can only answer "device key does not match this runner".
    expect(readGuestDeviceSecret("NOSUCHRUNNER")).toBeUndefined();
  });

  it("does not write anything when there is no key", () => {
    readGuestDeviceSecret("GHOST");
    expect(localStorage.getItem(KEY("GHOST"))).toBeNull();
  });

  it("returns the stored key when one exists", () => {
    localStorage.setItem(KEY("VECTOR"), "abcdefgh12345678");
    expect(readGuestDeviceSecret("VECTOR")).toBe("abcdefgh12345678");
  });

  it("reads back exactly what ensureGuestDeviceSecret minted", () => {
    const minted = ensureGuestDeviceSecret("CIPHER");
    expect(minted).toBeTruthy();
    expect(readGuestDeviceSecret("CIPHER")).toBe(minted);
  });

  it("ignores a too-short stored value rather than proving ownership with it", () => {
    localStorage.setItem(KEY("STATIC"), "x");
    expect(readGuestDeviceSecret("STATIC")).toBeUndefined();
  });

  it("recovers the key from the LocalRunner profile when the dedicated key is wiped", () => {
    localStorage.setItem(
      "metrophage_local_runner_v1",
      JSON.stringify({ callsign: "WRAITH", deviceSecret: "profilesecret123" }),
    );
    expect(readGuestDeviceSecret("WRAITH")).toBe("profilesecret123");
  });

  it("returns undefined for an empty callsign", () => {
    expect(readGuestDeviceSecret("")).toBeUndefined();
  });

  it("survives blocked storage without throwing", () => {
    installStorage(true);
    expect(() => readGuestDeviceSecret("VANTA")).not.toThrow();
    expect(readGuestDeviceSecret("VANTA")).toBeUndefined();
  });
});

describe("ensureGuestDeviceSecret still mints for login", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    installStorage();
  });

  it("always returns a key — guest login rejects a missing one", () => {
    const s = ensureGuestDeviceSecret("NULLSEC");
    expect(s && s.length).toBeGreaterThanOrEqual(8);
  });

  it("is stable across calls for the same callsign", () => {
    expect(ensureGuestDeviceSecret("ECHO-9")).toBe(ensureGuestDeviceSecret("ECHO-9"));
  });

  it("mints per callsign, not globally", () => {
    expect(ensureGuestDeviceSecret("HEXWARE")).not.toBe(ensureGuestDeviceSecret("RELAY"));
  });
});
