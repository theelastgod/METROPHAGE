import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureGuestDeviceSecret, readGuestDeviceSecret } from "./NetClient";
import { mintGuestId } from "../game/playerId";

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
      map.set(k, String(v));
    },
  } as unknown as Storage;
}

function installStorage(blocked = false) {
  vi.stubGlobal("localStorage", makeStorage(blocked));
  vi.stubGlobal("sessionStorage", makeStorage(blocked));
}

const KEY = (id: string) => "mp_secret_" + id;

describe("readGuestDeviceSecret", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    installStorage();
  });

  it("returns undefined when this device holds no key — it must never mint", () => {
    expect(readGuestDeviceSecret(mintGuestId())).toBeUndefined();
  });

  it("does not write anything when there is no key", () => {
    const id = mintGuestId();
    readGuestDeviceSecret(id);
    expect(localStorage.getItem(KEY(id))).toBeNull();
  });

  it("returns the stored key when one exists", () => {
    const id = mintGuestId();
    localStorage.setItem(KEY(id), "abcdefgh12345678");
    expect(readGuestDeviceSecret(id)).toBe("abcdefgh12345678");
  });

  it("reads back exactly what ensureGuestDeviceSecret minted", () => {
    const id = mintGuestId();
    const minted = ensureGuestDeviceSecret(id);
    expect(minted).toBeTruthy();
    expect(readGuestDeviceSecret(id)).toBe(minted);
  });

  it("ignores a too-short stored value rather than proving ownership with it", () => {
    const id = mintGuestId();
    localStorage.setItem(KEY(id), "x");
    expect(readGuestDeviceSecret(id)).toBeUndefined();
  });

  it("recovers the key from the LocalRunner profile when the dedicated key is wiped", () => {
    const id = mintGuestId();
    localStorage.setItem(
      "metrophage_local_runner_v1",
      JSON.stringify({ guestId: id, callsign: "WRAITH", deviceSecret: "profilesecret123" }),
    );
    expect(readGuestDeviceSecret(id)).toBe("profilesecret123");
  });

  it("returns undefined for a callsign (ids are never names)", () => {
    expect(readGuestDeviceSecret("NEOREAVER")).toBeUndefined();
    expect(readGuestDeviceSecret("")).toBeUndefined();
  });

  it("survives blocked storage without throwing", () => {
    installStorage(true);
    const id = mintGuestId();
    expect(() => readGuestDeviceSecret(id)).not.toThrow();
    expect(readGuestDeviceSecret(id)).toBeUndefined();
  });
});

describe("ensureGuestDeviceSecret still mints for login", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    installStorage();
  });

  it("always returns a key — guest login rejects a missing one", () => {
    const s = ensureGuestDeviceSecret(mintGuestId());
    expect(s && s.length).toBeGreaterThanOrEqual(8);
  });

  it("is stable across calls for the same guest id", () => {
    const id = mintGuestId();
    expect(ensureGuestDeviceSecret(id)).toBe(ensureGuestDeviceSecret(id));
  });

  it("mints per guest id, not globally", () => {
    expect(ensureGuestDeviceSecret(mintGuestId())).not.toBe(ensureGuestDeviceSecret(mintGuestId()));
  });

  it("refuses to mint for a typed callsign", () => {
    expect(ensureGuestDeviceSecret("NEOREAVER")).toBeUndefined();
  });
});
