import type { D1Database } from "@cloudflare/workers-types";

/** Inputs for atomically purchasing an arena pot. */
export interface LockPvpEscrowInput {
  player: string;
  amount: number;
  zone: string;
  updatedAt: number;
}

/** Inputs for atomically moving a defeated player's pot to the winner. */
export interface TransferPvpEscrowInput {
  victim: string;
  winner: string;
  updatedAt: number;
}

const durableAmount = (value: unknown): number => Math.max(0, Math.floor(Number(value) || 0));
const durableTime = (value: unknown): number => Math.max(0, Math.floor(Number(value) || 0));

async function settleRefund(db: D1Database, player: string, updatedAt: number): Promise<number> {
  const [, consumed] = await db.batch<{ amount: number }>([
    db
      .prepare(
        "UPDATE players SET metro=metro+(SELECT amount FROM pvp_escrows WHERE player=? AND state='active'), " +
          "updated_at=? WHERE id=? AND EXISTS " +
          "(SELECT 1 FROM pvp_escrows WHERE player=? AND state='active')",
      )
      .bind(player, durableTime(updatedAt), player, player),
    db
      .prepare("DELETE FROM pvp_escrows WHERE player=? AND state='active' AND changes()=1 RETURNING amount")
      .bind(player),
  ]);
  const row = consumed?.results?.[0];
  return durableAmount(row?.amount);
}

/**
 * Recover an active pot left behind by an interrupted contest. Both statements
 * commit or roll back together, so a crash cannot credit without consuming it.
 */
export function recoverPvpEscrow(db: D1Database, player: string, updatedAt: number): Promise<number> {
  return settleRefund(db, player, updatedAt);
}

/**
 * Buy into an arena. D1 batches are transactional and sequential: changes() gates
 * the insert on the debit, while a duplicate escrow makes the whole batch roll back.
 */
export async function lockPvpEscrow(db: D1Database, input: LockPvpEscrowInput): Promise<number> {
  const amount = durableAmount(input.amount);
  if (amount <= 0) return 0;
  const updatedAt = durableTime(input.updatedAt);
  const [, inserted] = await db.batch<{ amount: number }>([
    db
      .prepare("UPDATE players SET metro=metro-?, updated_at=? WHERE id=? AND metro>=?")
      .bind(amount, updatedAt, input.player, amount),
    db
      .prepare(
        "INSERT INTO pvp_escrows (player, amount, zone, state, transfer_to, created_at, updated_at) " +
          "SELECT ?, ?, ?, 'active', NULL, ?, ? WHERE changes()=1 RETURNING amount",
      )
      .bind(input.player, amount, input.zone, updatedAt, updatedAt),
  ]);
  const row = inserted?.results?.[0];
  return durableAmount(row?.amount);
}

/** Refund an active arena pot on safe exit, disconnect, or settlement fallback. */
export function refundPvpEscrow(db: D1Database, player: string, updatedAt: number): Promise<number> {
  return settleRefund(db, player, updatedAt);
}

/** Atomically merge a victim's active pot into the winner's active pot. */
export async function transferPvpEscrow(db: D1Database, input: TransferPvpEscrowInput): Promise<number> {
  if (input.victim === input.winner) return 0;
  const [, consumed] = await db.batch<{ amount: number }>([
    db
      .prepare(
        "UPDATE pvp_escrows SET amount=amount+(SELECT amount FROM pvp_escrows " +
          "WHERE player=? AND state='active'), updated_at=? " +
          "WHERE player=? AND state='active' " +
          "AND EXISTS (SELECT 1 FROM pvp_escrows WHERE player=? AND state='active')",
      )
      .bind(input.victim, durableTime(input.updatedAt), input.winner, input.victim),
    db
      .prepare("DELETE FROM pvp_escrows WHERE player=? AND state='active' AND changes()=1 RETURNING amount")
      .bind(input.victim),
  ]);
  const row = consumed?.results?.[0];
  return durableAmount(row?.amount);
}

/** Read the committed withdrawable balance after another isolate settled a pot. */
export async function readPlayerMetroBalance(db: D1Database, player: string): Promise<number | null> {
  const row = await db.prepare("SELECT metro FROM players WHERE id=?").bind(player).first<{ metro: number }>();
  return row ? durableAmount(row.metro) : null;
}
