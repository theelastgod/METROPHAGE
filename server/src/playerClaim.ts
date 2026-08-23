// Atomic callsign claim. INSERT + UNIQUE name_norm is the race-safe lock.
// Login never creates a player row and never derives id from the name.

import type { D1Database } from "@cloudflare/workers-types";
import { cleanCallsign, isReservedCallsign } from "../../src/game/callsign";
import { isGuestPlayerId } from "../../src/game/playerId";
import { DEFAULT_CAMPAIGN, serializeCampaign } from "../../src/net/campaign";
import { verifyWalletLogin, walletPlayerId } from "./auth";
import { suggestCallsign } from "./callsignAvailability";

/** Harness-only device secret. Not a reclaim-by-name hatch. */
export const SMOKE_DEVICE_SECRET = "smk-harness-secret-v1";

export type ClaimResult =
  | { ok: true; playerId: string; callsign: string; already?: boolean }
  | { ok: false; reason: string; suggestion?: string };

function uniqueNameConflict(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e);
  return /UNIQUE/i.test(m) && /name_norm/i.test(m);
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
      ) VALUES (?, ?, ?, 0, 0, 'safe', 0, 0, 0, 0, ?, 0, 0, 'quick', '[]', '[]', ?, '{}', ?, ?, ?, ?)`,
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
    return null;
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

  const row = await existingRow(db, id);
  if (row) {
    if (!id.startsWith("w:") && (row.secret || "") !== secret) {
      return { ok: false, reason: "device key does not match this runner" };
    }
    return { ok: true, playerId: id, callsign: row.name || callsign, already: true };
  }

  try {
    await insertPlayer(db, {
      id,
      callsign,
      secret: secret || "",
      look,
      classId,
      isBot: isBotClaim(id, secret),
    });
  } catch (e) {
    const again = await existingRow(db, id);
    if (again && (id.startsWith("w:") || (again.secret || "") === secret)) {
      return { ok: true, playerId: id, callsign: again.name || callsign, already: true };
    }
    if (uniqueNameConflict(e) || /UNIQUE/i.test(String((e as Error)?.message ?? e))) {
      return takenResponse(db, callsign);
    }
    // Pre-migration: retry without name_norm / is_bot.
    try {
      await db
        .prepare(
          `INSERT INTO players (id, name, x, y, zone, credits, xp, cores, look, secret, updated_at)
           VALUES (?, ?, 0, 0, 'safe', 0, 0, 0, ?, ?, ?)`,
        )
        .bind(id, callsign, look, secret || "", Date.now())
        .run();
    } catch (e2) {
      if (uniqueNameConflict(e2) || /UNIQUE/i.test(String((e2 as Error)?.message ?? e2))) {
        return takenResponse(db, callsign);
      }
      return { ok: false, reason: "could not claim callsign — " + String((e2 as Error)?.message ?? e2).slice(0, 80) };
    }
  }

  return { ok: true, playerId: id, callsign };
}
