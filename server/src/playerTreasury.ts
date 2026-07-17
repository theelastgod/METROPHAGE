// Exact per-player treasury memory: live credits + $METRO and lifetime bridge totals.
// Micro-units avoid float drift (1_000_000 micro = 1 $METRO human unit).

import type { D1Database } from "@cloudflare/workers-types";

export const METRO_MICRO = 1_000_000;

export type TreasuryKind =
  | "deposit"
  | "withdraw_pending"
  | "withdraw_done"
  | "withdraw_failed"
  | "sync";

export interface PlayerTreasury {
  player: string;
  credits: number;
  metroUnits: number;
  /** Human $METRO units (from micro). */
  metro: number;
  depositedMetro: number;
  withdrawnMetro: number;
  depositedCredits: number;
  withdrawnCredits: number;
  pendingCredits: number;
  pendingMetro: number;
  /** Net $METRO this player has put into the pool (deposits − completed withdrawals). */
  netMetroInPool: number;
  /** Credits still convertible at current withdraw rate (informational). */
  creditsAsMetro: number | null;
  updatedAt: number;
}

export const metroToMicro = (metro: number): number => {
  if (!Number.isFinite(metro)) return 0;
  return Math.round(metro * METRO_MICRO);
};

export const microToMetro = (micro: number): number => {
  const m = Math.round(Number(micro) || 0) / METRO_MICRO;
  // Stable 6-decimal human form
  return Math.round(m * METRO_MICRO) / METRO_MICRO;
};

const run = async (db: D1Database, sql: string, ...binds: unknown[]) => {
  try {
    await db.prepare(sql).bind(...binds).run();
  } catch {
    /* pre-migration */
  }
};

/** Ensure a treasury row exists and mirrors live players.credits / metro. */
export async function syncPlayerTreasury(db: D1Database, player: string): Promise<void> {
  const id = (player || "").trim();
  if (!id) return;
  try {
    const row = await db
      .prepare("SELECT credits, metro FROM players WHERE id = ?")
      .bind(id)
      .first<{ credits: number; metro: number }>();
    if (!row) return;
    const credits = Math.max(0, Math.round(Number(row.credits) || 0));
    const metroUnits = Math.max(0, Math.round(Number(row.metro) || 0));
    const now = Date.now();

    // Bootstrap lifetime totals from bridge tables if row is new.
    const existing = await db
      .prepare("SELECT player FROM player_treasury WHERE player = ?")
      .bind(id)
      .first();

    if (!existing) {
      const dep = await db
        .prepare(
          "SELECT COALESCE(SUM(metro),0) AS m, COALESCE(SUM(credits),0) AS c FROM metro_deposits WHERE player = ?",
        )
        .bind(id)
        .first<{ m: number; c: number }>();
      const wd = await db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN status = 'done' THEN metro ELSE 0 END),0) AS m_done,
             COALESCE(SUM(CASE WHEN status = 'done' THEN credits ELSE 0 END),0) AS c_done,
             COALESCE(SUM(CASE WHEN status = 'pending' THEN metro ELSE 0 END),0) AS m_pend,
             COALESCE(SUM(CASE WHEN status = 'pending' THEN credits ELSE 0 END),0) AS c_pend
           FROM metro_withdrawals WHERE player = ?`,
        )
        .bind(id)
        .first<{ m_done: number; c_done: number; m_pend: number; c_pend: number }>();

      await run(
        db,
        `INSERT INTO player_treasury (
          player, credits, metro_units,
          deposited_metro_micro, withdrawn_metro_micro,
          deposited_credits, withdrawn_credits,
          pending_credits, pending_metro_micro, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        id,
        credits,
        metroUnits,
        metroToMicro(Number(dep?.m ?? 0)),
        metroToMicro(Number(wd?.m_done ?? 0)),
        Math.round(Number(dep?.c ?? 0)),
        Math.round(Number(wd?.c_done ?? 0)),
        Math.round(Number(wd?.c_pend ?? 0)),
        metroToMicro(Number(wd?.m_pend ?? 0)),
        now,
      );
    } else {
      await run(
        db,
        "UPDATE player_treasury SET credits = ?, metro_units = ?, updated_at = ? WHERE player = ?",
        credits,
        metroUnits,
        now,
        id,
      );
    }
  } catch {
    /* table missing until migrate */
  }
}

/** Record a bridge event and update lifetime counters. Call after players row is updated. */
export async function recordTreasuryEvent(
  db: D1Database,
  args: {
    player: string;
    kind: TreasuryKind;
    credits: number;
    metro: number;
    rate?: number;
    ref?: string;
  },
): Promise<void> {
  const id = (args.player || "").trim();
  if (!id) return;
  await syncPlayerTreasury(db, id);

  const credits = Math.round(Number(args.credits) || 0);
  const metroMicro = metroToMicro(Number(args.metro) || 0);
  const now = Date.now();

  try {
    // Apply lifetime deltas by kind.
    if (args.kind === "deposit") {
      await run(
        db,
        `UPDATE player_treasury SET
           deposited_metro_micro = deposited_metro_micro + ?,
           deposited_credits = deposited_credits + ?,
           updated_at = ?
         WHERE player = ?`,
        metroMicro,
        credits,
        now,
        id,
      );
    } else if (args.kind === "withdraw_pending") {
      await run(
        db,
        `UPDATE player_treasury SET
           pending_credits = pending_credits + ?,
           pending_metro_micro = pending_metro_micro + ?,
           updated_at = ?
         WHERE player = ?`,
        credits,
        metroMicro,
        now,
        id,
      );
    } else if (args.kind === "withdraw_done") {
      await run(
        db,
        `UPDATE player_treasury SET
           withdrawn_metro_micro = withdrawn_metro_micro + ?,
           withdrawn_credits = withdrawn_credits + ?,
           pending_credits = CASE WHEN pending_credits > ? THEN pending_credits - ? ELSE 0 END,
           pending_metro_micro = CASE WHEN pending_metro_micro > ? THEN pending_metro_micro - ? ELSE 0 END,
           updated_at = ?
         WHERE player = ?`,
        metroMicro,
        credits,
        credits,
        credits,
        metroMicro,
        metroMicro,
        now,
        id,
      );
    } else if (args.kind === "withdraw_failed") {
      await run(
        db,
        `UPDATE player_treasury SET
           pending_credits = CASE WHEN pending_credits > ? THEN pending_credits - ? ELSE 0 END,
           pending_metro_micro = CASE WHEN pending_metro_micro > ? THEN pending_metro_micro - ? ELSE 0 END,
           updated_at = ?
         WHERE player = ?`,
        credits,
        credits,
        metroMicro,
        metroMicro,
        now,
        id,
      );
    }

    // Mirror live balances from players after every event.
    await syncPlayerTreasury(db, id);

    const bal = await db
      .prepare("SELECT credits, metro_units FROM player_treasury WHERE player = ?")
      .bind(id)
      .first<{ credits: number; metro_units: number }>();

    await run(
      db,
      `INSERT INTO player_treasury_events
         (player, kind, credits, metro_micro, rate, ref, bal_credits, bal_metro_units, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      id,
      args.kind,
      credits,
      metroMicro,
      args.rate ?? null,
      args.ref ?? null,
      bal?.credits ?? null,
      bal?.metro_units ?? null,
      now,
    );
  } catch {
    /* pre-migration */
  }
}

/** Read exact treasury position for a player (syncs live balances first). */
export async function getPlayerTreasury(
  db: D1Database,
  player: string,
  withdrawRate?: number,
): Promise<PlayerTreasury | null> {
  const id = (player || "").trim();
  if (!id) return null;
  await syncPlayerTreasury(db, id);
  try {
    const row = await db
      .prepare(
        `SELECT player, credits, metro_units,
                deposited_metro_micro, withdrawn_metro_micro,
                deposited_credits, withdrawn_credits,
                pending_credits, pending_metro_micro, updated_at
         FROM player_treasury WHERE player = ?`,
      )
      .bind(id)
      .first<{
        player: string;
        credits: number;
        metro_units: number;
        deposited_metro_micro: number;
        withdrawn_metro_micro: number;
        deposited_credits: number;
        withdrawn_credits: number;
        pending_credits: number;
        pending_metro_micro: number;
        updated_at: number;
      }>();
    if (!row) return null;
    const depositedMetro = microToMetro(row.deposited_metro_micro);
    const withdrawnMetro = microToMetro(row.withdrawn_metro_micro);
    const rate = withdrawRate && withdrawRate > 0 ? withdrawRate : null;
    return {
      player: row.player,
      credits: Math.round(row.credits),
      metroUnits: Math.round(row.metro_units),
      metro: Math.round(row.metro_units), // in-game metro counter is whole units
      depositedMetro,
      withdrawnMetro,
      depositedCredits: Math.round(row.deposited_credits),
      withdrawnCredits: Math.round(row.withdrawn_credits),
      pendingCredits: Math.round(row.pending_credits),
      pendingMetro: microToMetro(row.pending_metro_micro),
      netMetroInPool: microToMetro(row.deposited_metro_micro - row.withdrawn_metro_micro),
      creditsAsMetro: rate ? Math.round((row.credits / rate) * METRO_MICRO) / METRO_MICRO : null,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}
