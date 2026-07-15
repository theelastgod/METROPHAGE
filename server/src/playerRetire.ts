// Explicit guest-runner retirement (NEW RUNNER without a wallet).
// Wallet runners are retired via playerLink.retireWalletPlayer (signed).
// Guests persist forever until this path runs with the matching device secret.

import type { D1Database } from "@cloudflare/workers-types";

export type RetireResult = { ok: true; retired: boolean; id: string } | { ok: false; reason: string };

function guestIdFromCallsign(callsign: string): string {
  return (callsign || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "";
}

/**
 * Permanently remove a guest multiplayer save.
 * Requires the device secret bound on first login — same key as WS guest auth.
 */
export async function retireGuestPlayer(
  db: D1Database,
  callsign: string,
  secret: string,
): Promise<RetireResult> {
  const id = guestIdFromCallsign(callsign);
  const sec = (secret || "").trim().slice(0, 64);
  if (!id || id.startsWith("__")) return { ok: false, reason: "invalid callsign" };
  if (id.startsWith("w:")) {
    return { ok: false, reason: "wallet runners require a Solana signature to retire — use NEW RUNNER while signed in" };
  }
  if (!sec || sec.length < 8) return { ok: false, reason: "device key required" };

  let row: { secret: string | null } | null = null;
  try {
    row = await db.prepare("SELECT secret FROM players WHERE id = ?").bind(id).first<{ secret: string | null }>();
  } catch {
    return { ok: false, reason: "player store unavailable" };
  }
  if (!row) {
    // Already gone — treat as success so client can clear local cleanly.
    return { ok: true, retired: false, id };
  }
  if (!row.secret || row.secret !== sec) {
    return { ok: false, reason: "device key does not match this runner" };
  }

  // Best-effort cascade — tables may be missing on older DBs.
  const run = async (sql: string, ...binds: unknown[]) => {
    try {
      await db.prepare(sql).bind(...binds).run();
    } catch {
      /* table missing or already clean */
    }
  };

  await run("DELETE FROM player_stats WHERE player = ?", id);
  await run("DELETE FROM player_achv WHERE player = ?", id);
  await run("DELETE FROM player_dailies WHERE player = ?", id);
  await run("DELETE FROM player_cosmetics WHERE player = ?", id);
  await run("DELETE FROM player_bounties WHERE player = ?", id);
  await run("DELETE FROM player_discovered WHERE player = ?", id);
  await run("DELETE FROM guild_members WHERE player = ?", id);
  await run("DELETE FROM guild_invites WHERE player = ?", id);
  await run("DELETE FROM mailbox WHERE player = ?", id);
  await run("DELETE FROM pvp_escrow WHERE player = ?", id);
  // Free any owned estate so homes don't stay locked forever.
  await run("UPDATE estates SET owner = NULL, owner_name = NULL, for_sale = 1 WHERE owner = ?", id);
  // Keep metro deposit/withdraw history for ledger integrity — only clear player row.
  await run("DELETE FROM players WHERE id = ? AND secret = ?", id, sec);

  // Confirm gone.
  try {
    const still = await db.prepare("SELECT 1 AS o FROM players WHERE id = ?").bind(id).first();
    if (still) return { ok: false, reason: "retire failed — runner still on server" };
  } catch {
    /* ok */
  }
  return { ok: true, retired: true, id };
}
