// Atomic callsign claim. INSERT + UNIQUE name_norm is the race-safe lock.
// Login never creates a player row and never derives id from the name.

import type { D1Database } from "@cloudflare/workers-types";
import { cleanCallsign, isReservedCallsign } from "../../src/game/callsign";
import { isGuestPlayerId } from "../../src/game/playerId";
import { DEFAULT_CAMPAIGN, serializeCampaign } from "../../src/net/campaign";
import { verifyWalletLogin, walletPlayerId } from "./auth";
import { nameTaken, suggestCallsign } from "./callsignAvailability";

/** Harness-only device secret. Not a reclaim-by-name hatch. */
export const SMOKE_DEVICE_SECRET = "smk-harness-secret-v1";

export type ClaimResult =
  | { ok: true; playerId: string; callsign: string; already?: boolean }
  | { ok: false; reason: string; suggestion?: string };

function errText(e: unknown): string {
  return String((e as Error)?.message ?? e);
}

function uniqueNameConflict(e: unknown): boolean {
  const m = errText(e);
  return /UNIQUE/i.test(m) && /name_norm/i.test(m);
}

function uniqueIdConflict(e: unknown): boolean {
  const m = errText(e);
  return /UNIQUE/i.test(m) && (/\bplayers\.id\b/i.test(m) || /failed: id\b/i.test(m));
}

function noSuchColumn(e: unknown, col: string): boolean {
  const m = errText(e);
  return /no such column/i.test(m) && new RegExp(col, "i").test(m);
}

function isBotClaim(playerId: string, secret: string | undefined): number {
  if (secret === SMOKE_DEVICE_SECRET) return 1;
  // Smoke fixtures use g:<32 hex>; real guests use dashed UUIDs.
  if (isGuestPlayerId(playerId) && !playerId.includes("-")) return 1;
  return 0;
}

async function takenResponse(db: D1Database, callsign: string): Promise<ClaimResult> {
  const suggestion = await suggestCallsign(db, callsign);
  return { ok: false, reason: "that callsign is taken", suggestion };
}

function d1Changes(res: { meta?: { changes?: number } } | undefined): number {
  return Math.max(0, Number(res?.meta?.changes) || 0);
}

async function insertPlayer(
  db: D1Database,
  args: {
    id: string;
    callsign: string;
    secret: string;
    look: string | null;
    classId: string;
    isBot: number;
  },
): Promise<void> {
  const now = Date.now();
  const campaign = serializeCampaign({ ...DEFAULT_CAMPAIGN, completed: [], flags: [] });
  await db
    .prepare(
      `INSERT INTO players (
        id, name, name_norm, x, y, zone, credits, xp, cores, metro,
        campaign, tutorial_done, tutorial_step, tutorial_mode,
        inventory, stash, look, equipped, updated_at, secret, class_id, is_bot
      ) VALUES (?, ?, ?, 0, 0, 'safe', 0, 0, 0, 0, ?, 1, 0, 'quick', '[]', '[]', ?, '{}', ?, ?, ?, ?)`,
    )
    .bind(args.id, args.callsign, args.callsign, campaign, args.look, now, args.secret, args.classId, args.isBot)
    .run();
}

async function existingRow(
  db: D1Database,
  id: string,
): Promise<{ name: string; secret: string | null; name_norm: string | null } | null> {
  try {
    return await db
      .prepare("SELECT name, secret, name_norm FROM players WHERE id = ?")
      .bind(id)
      .first<{ name: string; secret: string | null; name_norm: string | null }>();
  } catch {
    try {
      return await db
        .prepare("SELECT name, secret FROM players WHERE id = ?")
        .bind(id)
        .first<{ name: string; secret: string | null; name_norm: string | null }>();
    } catch {
      return null;
    }
  }
}

function lookJson(look: unknown): string | null {
  if (!look || typeof look !== "object") return null;
  try {
    return JSON.stringify(look);
  } catch {
    return null;
  }
}

async function existingClaim(
  db: D1Database,
  id: string,
  secret: string,
  callsign: string,
): Promise<ClaimResult | null> {
  const row = await existingRow(db, id);
  if (!row) return null;
  if (!id.startsWith("w:") && (row.secret || "") !== secret) {
    return { ok: false, reason: "device key does not match this runner" };
  }
  return { ok: true, playerId: id, callsign: row.name || callsign, already: true };
}

/** Stamp leftover NULL name_norm rows so UNIQUE covers them; treat as taken if any match. */
async function occupyLegacyName(db: D1Database, callsign: string): Promise<boolean> {
  try {
    const res = await db
      .prepare("UPDATE players SET name_norm = ? WHERE name_norm IS NULL AND UPPER(name) = ?")
      .bind(callsign, callsign)
      .run();
    return d1Changes(res) > 0;
  } catch (e) {
    if (uniqueNameConflict(e) || uniqueIdConflict(e) || /UNIQUE/i.test(errText(e))) return true;
    return false;
  }
}

async function stampNameNorm(db: D1Database, id: string, callsign: string): Promise<ClaimResult | null> {
  try {
    await db.prepare("UPDATE players SET name_norm = ? WHERE id = ?").bind(callsign, id).run();
    return null;
  } catch (e) {
    if (uniqueNameConflict(e) || /UNIQUE/i.test(errText(e))) {
      try {
        await db.prepare("DELETE FROM players WHERE id = ?").bind(id).run();
      } catch {
        /* best-effort rollback of the fallback insert */
      }
      return takenResponse(db, callsign);
    }
    return null;
  }
}

export async function claimPlayer(
  db: D1Database,
  body: {
    guestId?: string;
    secret?: string;
    callsign?: string;
    look?: unknown;
    classId?: string;
    wallet?: string;
    sig?: string;
    ts?: number;
  },
): Promise<ClaimResult> {
  const callsign = cleanCallsign(body.callsign || "");
  if (!callsign) return { ok: false, reason: "callsign required" };
  if (isReservedCallsign(callsign)) return { ok: false, reason: "that callsign is reserved" };

  const classId = (body.classId || "metrophage").replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "metrophage";
  const look = lookJson(body.look);

  let id: string;
  let secret: string;

  if (body.wallet || body.sig) {
    const walletId = verifyWalletLogin({
      wallet: body.wallet ?? "",
      sig: body.sig ?? "",
      ts: Number(body.ts),
    });
    if (!walletId) return { ok: false, reason: "wallet sign-in failed — bad or stale signature" };
    const expected = walletPlayerId(body.wallet ?? "");
    if (!expected || expected !== walletId) return { ok: false, reason: "wallet identity mismatch" };
    id = walletId;
    secret = (body.secret || "").trim().slice(0, 64);
  } else {
    const guestId = (body.guestId || "").trim();
    if (!isGuestPlayerId(guestId)) {
      return { ok: false, reason: "guest id required (g:<uuid>)" };
    }
    secret = (body.secret || "").trim().slice(0, 64);
    if (!secret || secret.length < 8) return { ok: false, reason: "device key required" };
    id = guestId;
  }

  const already = await existingClaim(db, id, secret, callsign);
  if (already) return already;

  if (await occupyLegacyName(db, callsign)) return takenResponse(db, callsign);
  if (await nameTaken(db, callsign)) return takenResponse(db, callsign);

  const args = {
    id,
    callsign,
    secret: secret || "",
    look,
    classId,
    isBot: isBotClaim(id, secret),
  };

  try {
    await insertPlayer(db, args);
  } catch (e) {
    const raced = await existingClaim(db, id, secret, callsign);
    if (raced) return raced;
    if (uniqueNameConflict(e)) return takenResponse(db, callsign);
    if (uniqueIdConflict(e)) {
      return (await existingClaim(db, id, secret, callsign)) ?? {
        ok: false,
        reason: "device key does not match this runner",
      };
    }
    if (
      !noSuchColumn(e, "name_norm") &&
      !noSuchColumn(e, "is_bot") &&
      !noSuchColumn(e, "class_id")
    ) {
      return { ok: false, reason: "could not claim callsign — " + errText(e).slice(0, 80) };
    }
    // Older schema: retry without columns the live D1 doesn't have yet.
    try {
      await db
        .prepare(
          `INSERT INTO players (id, name, x, y, zone, credits, xp, cores, look, secret, updated_at)
           VALUES (?, ?, 0, 0, 'safe', 0, 0, 0, ?, ?, ?)`,
        )
        .bind(id, callsign, look, secret || "", Date.now())
        .run();
    } catch (e2) {
      const raced2 = await existingClaim(db, id, secret, callsign);
      if (raced2) return raced2;
      if (uniqueNameConflict(e2)) return takenResponse(db, callsign);
      if (uniqueIdConflict(e2)) {
        return (await existingClaim(db, id, secret, callsign)) ?? {
          ok: false,
          reason: "device key does not match this runner",
        };
      }
      return { ok: false, reason: "could not claim callsign — " + errText(e2).slice(0, 80) };
    }
    // Fallback omitted name_norm — stamp it when 0041 is applied so UNIQUE still holds.
    const stamped = await stampNameNorm(db, id, callsign);
    if (stamped) return stamped;
  }

  return { ok: true, playerId: id, callsign };
}
