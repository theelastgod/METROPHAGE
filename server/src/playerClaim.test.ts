import { describe, expect, it } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import { claimPlayer } from "./playerClaim";
import { checkCallsign } from "./callsignAvailability";
import { mintGuestId } from "../../src/game/playerId";

type Row = { id: string; name: string; name_norm: string | null; secret: string };

function fakeDb(seed: Row[] = []): D1Database {
  const byId = new Map<string, Row>();
  const byNorm = new Map<string, string>();
  for (const r of seed) {
    byId.set(r.id, { ...r });
    if (r.name_norm) byNorm.set(r.name_norm, r.id);
  }
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
              if (/name_norm/.test(sql)) {
                const n = String(args[0]);
                if (byNorm.has(n)) return { taken: 1 };
                for (const r of byId.values()) {
                  if (!r.name_norm && r.name.toUpperCase() === n) return { taken: 1 };
                }
                return null;
              }
              return null;
            },
            async run() {
              if (/UPDATE players SET name_norm = \? WHERE name_norm IS NULL/.test(sql)) {
                const n = String(args[0]);
                const hits: Row[] = [];
                for (const r of byId.values()) {
                  if (!r.name_norm && r.name.toUpperCase() === n) hits.push(r);
                }
                if (hits.length === 0) return { success: true, meta: { changes: 0 } };
                if (byNorm.has(n) || hits.length > 1) {
                  throw new Error("UNIQUE constraint failed: players.name_norm");
                }
                hits[0].name_norm = n;
                byNorm.set(n, hits[0].id);
                return { success: true, meta: { changes: 1 } };
              }
              if (/UPDATE players SET name_norm = \? WHERE id = \?/.test(sql)) {
                const n = String(args[0]);
                const id = String(args[1]);
                if (byNorm.has(n) && byNorm.get(n) !== id) {
                  throw new Error("UNIQUE constraint failed: players.name_norm");
                }
                const row = byId.get(id);
                if (row) {
                  row.name_norm = n;
                  byNorm.set(n, id);
                }
                return { success: true, meta: { changes: row ? 1 : 0 } };
              }
              if (/DELETE FROM players WHERE id = \?/.test(sql)) {
                const id = String(args[0]);
                const row = byId.get(id);
                if (row?.name_norm) byNorm.delete(row.name_norm);
                byId.delete(id);
                return { success: true, meta: { changes: row ? 1 : 0 } };
              }
              if (!/INSERT INTO players/.test(sql)) return { success: true, meta: { changes: 0 } };
              const id = String(args[0]);
              const name = String(args[1]);
              const nameNorm = /name_norm/.test(sql) ? String(args[2]) : name;
              const secret = String(args[6] ?? args[4] ?? "");
              if (byId.has(id)) throw new Error("UNIQUE constraint failed: players.id");
              if (byNorm.has(nameNorm)) throw new Error("UNIQUE constraint failed: players.name_norm");
              const row: Row = { id, name, name_norm: nameNorm, secret };
              byId.set(id, row);
              byNorm.set(nameNorm, id);
              return { success: true, meta: { changes: 1 } };
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

  it("rejects a second secret on the same guest id as a key mismatch, not taken", async () => {
    const db = fakeDb();
    const guestId = mintGuestId();
    await claimPlayer(db, { guestId, secret: "device-secret-aaaa", callsign: "WRAITH" });
    const r = await claimPlayer(db, { guestId, secret: "device-secret-bbbb", callsign: "WRAITH" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("device key does not match this runner");
      expect(r.reason.toLowerCase()).not.toContain("taken");
    }
  });

  it("treats a legacy NULL name_norm display name as taken", async () => {
    const db = fakeDb([
      { id: "legacy-row", name: "NEOREAVER", name_norm: null, secret: "old-secret" },
    ]);
    const r = await claimPlayer(db, {
      guestId: mintGuestId(),
      secret: "device-secret-aaaa",
      callsign: "NEOREAVER",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("that callsign is taken");
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

  it("treats UPPER(name) as taken when name_norm is still null", async () => {
    const db = fakeDb([{ id: "legacy-row", name: "hexware", name_norm: null, secret: "x" }]);
    const r = await checkCallsign(db, "HEXWARE");
    expect(r.available).toBe(false);
    expect(r.reason).toBe("that callsign is taken");
  });
});
