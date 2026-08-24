// Explicit guest-runner retirement (NEW RUNNER without a wallet).
// Wallet runners are retired via playerLink.retireWalletPlayer (signed).
// Guests persist until this path runs with the matching g:<uuid> + device secret.

import type { D1Database } from "@cloudflare/workers-types";
import { isGuestPlayerId } from "../../src/game/playerId";

export type RetireResult = { ok: true; retired: boolean; id: string } | { ok: false; reason: string };

/**
 * Permanently remove a guest multiplayer save.
 * Requires the device secret bound at claim — same key as WS guest auth.
 */
export async function retireGuestPlayer(
  db: D1Database,
  guestId: string,
  secret: string,
): Promise<RetireResult> {
  const id = (guestId || "").trim();
  const sec = (secret || "").trim().slice(0, 64);
  if (!isGuestPlayerId(id)) return { ok: false, reason: "guest id required" };
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
  await run("DELETE FROM pvp_escrows WHERE player = ?", id);
  await run("UPDATE estates SET owner = NULL, owner_name = NULL, for_sale = 1 WHERE owner = ?", id);
  await run("DELETE FROM players WHERE id = ? AND secret = ?", id, sec);

  try {
    const still = await db.prepare("SELECT 1 AS o FROM players WHERE id = ?").bind(id).first();
    if (still) return { ok: false, reason: "retire failed — runner still on server" };
  } catch {
    /* ok */
  }
  return { ok: true, retired: true, id };
}
