import { describe, expect, it } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import { claimPlayer } from "./playerClaim";
import { checkCallsign } from "./callsignAvailability";
import { mintGuestId } from "../../src/game/playerId";

type Row = { id: string; name: string; name_norm: string; secret: string };

function fakeDb(): D1Database {
  const byId = new Map<string, Row>();
  const byNorm = new Map<string, string>();
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (/WHERE id = \?/.test(sql)) {
                const row = byId.get(String(args[0]));
                return row ? { ...row } : null;
              }
              if (/name_norm = \?/.test(sql)) {
                return byNorm.has(String(args[0])) ? { taken: 1 } : null;
              }
              return null;
            },
            async run() {
              if (!/INSERT INTO players/.test(sql)) return { success: true };
              const id = String(args[0]);
              const name = String(args[1]);
              const nameNorm = String(args[2] ?? args[1]);
              const secret = String(args[6] ?? args[4] ?? "");
              if (byId.has(id)) throw new Error("UNIQUE constraint failed: players.id");
              if (byNorm.has(nameNorm)) throw new Error("UNIQUE constraint failed: players.name_norm");
              const row: Row = { id, name, name_norm: nameNorm, secret };
              byId.set(id, row);
              byNorm.set(nameNorm, id);
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("claimPlayer UNIQUE callsign", () => {
  it("lets the first guest win NEOREAVER and tells the second it is taken", async () => {
    const db = fakeDb();
    const a = await claimPlayer(db, {
      guestId: mintGuestId(),
      secret: "device-secret-aaaa",
      callsign: "NEOREAVER",
    });
    const b = await claimPlayer(db, {
      guestId: mintGuestId(),
      secret: "device-secret-bbbb",
      callsign: "NEOREAVER",
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.reason).toBe("that callsign is taken");
      expect(b.suggestion).toMatch(/NEOREAVER-2/);
      expect(JSON.stringify(b).toLowerCase()).not.toContain("another device");
      expect(JSON.stringify(b).toLowerCase()).not.toContain("locked on");
    }
  });

  it("is idempotent for the same g:uuid + secret", async () => {
    const db = fakeDb();
    const guestId = mintGuestId();
    const first = await claimPlayer(db, { guestId, secret: "device-secret-aaaa", callsign: "VECTOR" });
    const again = await claimPlayer(db, { guestId, secret: "device-secret-aaaa", callsign: "VECTOR" });
    expect(first.ok && again.ok).toBe(true);
    if (first.ok && again.ok) {
      expect(again.already).toBe(true);
      expect(again.playerId).toBe(first.playerId);
    }
  });

  it("does not let guest B steal by typing guest A's callsign as an id", async () => {
    const db = fakeDb();
    const owner = mintGuestId();
    await claimPlayer(db, { guestId: owner, secret: "device-secret-aaaa", callsign: "CIPHER" });
    const steal = await claimPlayer(db, {
      guestId: "CIPHER",
      secret: "device-secret-bbbb",
      callsign: "CIPHER",
    });
    expect(steal.ok).toBe(false);
    if (!steal.ok) expect(steal.reason).toMatch(/guest id required/);
  });
});

describe("checkCallsign copy", () => {
  it("never says locked on another device", async () => {
    const db = fakeDb();
    await claimPlayer(db, { guestId: mintGuestId(), secret: "device-secret-aaaa", callsign: "NEOREAVER" });
    const r = await checkCallsign(db, "NEOREAVER");
    expect(r.available).toBe(false);
    expect(r.reason).toBe("that callsign is taken");
    expect(JSON.stringify(r).toLowerCase()).not.toContain("another device");
    expect(JSON.stringify(r).toLowerCase()).not.toContain("locked");
  });
});
