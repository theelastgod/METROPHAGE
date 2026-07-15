// Link a Solana (or EVM) wallet to an existing guest runner.
// After success, the wallet id (w:<addr>) owns all progress and is locked to that
// character until the player explicitly chooses NEW RUNNER (wallet retire).

import type { D1Database } from "@cloudflare/workers-types";
import { verifyWalletLogin, walletPlayerId } from "./auth";

export type LinkResult =
  | { ok: true; playerId: string; name: string; alreadyLinked?: boolean }
  | { ok: false; reason: string };

function guestIdFromCallsign(callsign: string): string {
  return (callsign || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "";
}

const run = async (db: D1Database, sql: string, ...binds: unknown[]) => {
  try {
    await db.prepare(sql).bind(...binds).run();
  } catch {
    /* table/column may be missing */
  }
};

/** True if a wallet shell already has a real character (not a blank new row). */
function walletHasRunner(row: {
  look?: string | null;
  credits?: number;
  xp?: number;
  name?: string;
} | null): boolean {
  if (!row) return false;
  if (row.look) return true;
  if ((row.xp ?? 0) > 0) return true;
  if ((row.credits ?? 0) >= 100) return true;
  return false;
}

/**
 * Bind wallet → guest runner permanently.
 * Migrates the guest D1 row + related tables onto `w:<wallet>`.
 */
export async function linkGuestToWallet(
  db: D1Database,
  args: {
    callsign: string;
    secret: string;
    wallet: string;
    sig: string;
    ts: number;
  },
): Promise<LinkResult> {
  const guestId = guestIdFromCallsign(args.callsign);
  const secret = (args.secret || "").trim().slice(0, 64);
  if (!guestId || guestId.startsWith("__") || guestId.startsWith("w:")) {
    return { ok: false, reason: "invalid guest callsign" };
  }
  if (!secret || secret.length < 8) {
    return { ok: false, reason: "device key required" };
  }

  const walletId = verifyWalletLogin({
    wallet: args.wallet,
    sig: args.sig,
    ts: args.ts,
  });
  if (!walletId) {
    return { ok: false, reason: "wallet sign-in failed — bad or stale signature" };
  }
  // Canonical id must match walletPlayerId shape.
  const expected = walletPlayerId(args.wallet);
  if (!expected || expected !== walletId) {
    return { ok: false, reason: "wallet identity mismatch" };
  }

  let guest: Record<string, unknown> | null = null;
  try {
    guest = await db.prepare("SELECT * FROM players WHERE id = ?").bind(guestId).first<Record<string, unknown>>();
  } catch {
    return { ok: false, reason: "player store unavailable" };
  }
  if (!guest) {
    return { ok: false, reason: "guest runner not found on server — CONTINUE once online first" };
  }
  if (String(guest.secret ?? "") !== secret) {
    return { ok: false, reason: "device key does not match this runner" };
  }

  let walletRow: Record<string, unknown> | null = null;
  try {
    walletRow = await db.prepare("SELECT * FROM players WHERE id = ?").bind(walletId).first<Record<string, unknown>>();
  } catch {
    walletRow = null;
  }

  // Already the same character under wallet id (re-link).
  if (walletRow && String(walletRow.name ?? "").toLowerCase() === String(guest.name ?? "").toLowerCase() && walletRow.look) {
    // Ensure session secret is wallet-bound for zone travel.
    await run(db, "UPDATE players SET secret = ?, updated_at = ? WHERE id = ?", secret, Date.now(), walletId);
    // Drop leftover guest row if any.
    if (guestId !== walletId) {
      await purgePlayerId(db, guestId);
    }
    return {
      ok: true,
      playerId: walletId,
      name: String(walletRow.name ?? guest.name ?? args.callsign),
      alreadyLinked: true,
    };
  }

  if (walletHasRunner(walletRow as { look?: string | null; credits?: number; xp?: number })) {
    return {
      ok: false,
      reason:
        "this Solana wallet already has a locked runner — CONTINUE with that wallet, or NEW RUNNER on the wallet to start over",
    };
  }

  // Remove empty wallet shell so we can take over the id.
  if (walletRow) {
    await purgePlayerId(db, walletId);
  }

  // Insert wallet row as a full copy of the guest (all known columns).
  try {
    await db
      .prepare(
        `INSERT INTO players (
          id, name, x, y, zone, updated_at,
          credits, xp, cores, quest_step, inventory, look, equipped,
          campaign, tutorial_done, tutorial_step, tutorial_mode,
          metro, fragments, stash, secret, session_zone, session_at, class_id
        )
        SELECT
          ?, name, x, y, zone, ?,
          credits, xp, cores, quest_step, inventory, look, equipped,
          campaign, tutorial_done, tutorial_step, tutorial_mode,
          metro, fragments, stash, ?, session_zone, session_at, class_id
        FROM players WHERE id = ?`,
      )
      .bind(walletId, Date.now(), secret, guestId)
      .run();
  } catch {
    // Fallback: minimal insert if some columns missing on older DBs.
    try {
      await db
        .prepare(
          `INSERT INTO players (id, name, x, y, zone, updated_at, credits, xp, cores, look, secret)
           SELECT ?, name, x, y, zone, ?, credits, xp, cores, look, ? FROM players WHERE id = ?`,
        )
        .bind(walletId, Date.now(), secret, guestId)
        .run();
    } catch (e) {
      return { ok: false, reason: "could not bind wallet to runner — " + String((e as Error)?.message ?? e).slice(0, 80) };
    }
  }

  // Re-point side tables from guest → wallet.
  await rekeyPlayerRefs(db, guestId, walletId);
  // Estates ownership.
  await run(db, "UPDATE estates SET owner = ?, owner_name = ? WHERE owner = ?", walletId, String(guest.name ?? args.callsign), guestId);
  // Remove guest primary row (side tables already rekeyed or deleted).
  await run(db, "DELETE FROM players WHERE id = ?", guestId);

  return {
    ok: true,
    playerId: walletId,
    name: String(guest.name ?? args.callsign),
  };
}

async function rekeyPlayerRefs(db: D1Database, fromId: string, toId: string) {
  // Prefer UPDATE; if conflict, delete source rows.
  const tables = [
    "player_stats",
    "player_achv",
    "player_dailies",
    "player_cosmetics",
    "player_bounties",
    "player_discovered",
    "guild_members",
    "guild_invites",
    "mailbox",
    "pvp_escrow",
  ];
  for (const t of tables) {
    try {
      await db.prepare(`UPDATE ${t} SET player = ? WHERE player = ?`).bind(toId, fromId).run();
    } catch {
      try {
        await db.prepare(`DELETE FROM ${t} WHERE player = ?`).bind(fromId).run();
      } catch {
        /* ignore */
      }
    }
  }
}

async function purgePlayerId(db: D1Database, id: string) {
  await run(db, "DELETE FROM player_stats WHERE player = ?", id);
  await run(db, "DELETE FROM player_achv WHERE player = ?", id);
  await run(db, "DELETE FROM player_dailies WHERE player = ?", id);
  await run(db, "DELETE FROM player_cosmetics WHERE player = ?", id);
  await run(db, "DELETE FROM player_bounties WHERE player = ?", id);
  await run(db, "DELETE FROM player_discovered WHERE player = ?", id);
  await run(db, "DELETE FROM guild_members WHERE player = ?", id);
  await run(db, "DELETE FROM guild_invites WHERE player = ?", id);
  await run(db, "DELETE FROM mailbox WHERE player = ?", id);
  await run(db, "DELETE FROM pvp_escrow WHERE player = ?", id);
  await run(db, "UPDATE estates SET owner = NULL, owner_name = NULL, for_sale = 1 WHERE owner = ?", id);
  await run(db, "DELETE FROM players WHERE id = ?", id);
}

/**
 * NEW RUNNER for a wallet-bound character — requires a fresh wallet signature.
 * After this, the wallet is free to create a new runner.
 */
export async function retireWalletPlayer(
  db: D1Database,
  args: { wallet: string; sig: string; ts: number },
): Promise<LinkResult | { ok: true; retired: true; playerId: string }> {
  const walletId = verifyWalletLogin({
    wallet: args.wallet,
    sig: args.sig,
    ts: args.ts,
  });
  if (!walletId || !walletId.startsWith("w:")) {
    return { ok: false, reason: "wallet sign-in failed — bad or stale signature" };
  }
  await purgePlayerId(db, walletId);
  return { ok: true, retired: true, playerId: walletId };
}
