import { describe, expect, it } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  lockPvpEscrow,
  readPlayerMetroBalance,
  recoverPvpEscrow,
  refundPvpEscrow,
  transferPvpEscrow,
} from "./pvpEscrow";

interface Call {
  query: string;
  values: unknown[];
}

function result(results: unknown[]) {
  return {
    success: true as const,
    results,
    meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false, changes: 0 },
  };
}

function scriptedDb(batchRows: unknown[][][] = [], rows: unknown[] = []) {
  const calls: Call[] = [];
  const db = {
    prepare(query: string) {
      const call: Call = { query, values: [] };
      calls.push(call);
      return {
        bind(...values: unknown[]) {
          call.values = values;
          return this;
        },
        async first<T>() {
          return (rows.shift() ?? null) as T | null;
        },
      };
    },
    async batch() {
      return (batchRows.shift() ?? []).map(result);
    },
  } as unknown as D1Database;
  return { calls, db };
}

describe("PvP escrow persistence primitives", () => {
  it("locks one pot with a debit and gated insert in the same batch", async () => {
    const { calls, db } = scriptedDb([[[], [{ amount: 50_000 }]]]);
    await expect(lockPvpEscrow(db, { player: "runner", amount: 50_000, zone: "d3", updatedAt: 123 })).resolves.toBe(
      50_000,
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].query).toContain("UPDATE players SET metro=metro-?");
    expect(calls[0].values).toEqual([50_000, 123, "runner", 50_000]);
    expect(calls[1].query).toContain("WHERE changes()=1 RETURNING amount");
    expect(calls[1].values).toEqual(["runner", 50_000, "d3", 123, 123]);
  });

  it("uses an idempotent credit-and-consume batch for recovery and ordinary refunds", async () => {
    const { calls, db } = scriptedDb([
      [[], [{ amount: 50_000.9 }]],
      [[], []],
    ]);
    await expect(recoverPvpEscrow(db, "runner", 10)).resolves.toBe(50_000);
    await expect(refundPvpEscrow(db, "runner", 11)).resolves.toBe(0);
    expect(calls).toHaveLength(4);
    expect(calls[0].query).toContain("SET metro=metro+(SELECT amount");
    expect(calls[1].query).toContain("DELETE FROM pvp_escrows");
    expect(calls[1].query).toContain("changes()=1");
    expect(calls.map((call) => call.values)).toEqual([
      ["runner", 10, "runner", "runner"],
      ["runner"],
      ["runner", 11, "runner", "runner"],
      ["runner"],
    ]);
  });

  it("merges winner and victim pots before consuming the victim in one batch", async () => {
    const { calls, db } = scriptedDb([[[], [{ amount: 75_000 }]]]);
    await expect(transferPvpEscrow(db, { victim: "loser", winner: "winner", updatedAt: 77 })).resolves.toBe(75_000);
    expect(calls).toHaveLength(2);
    expect(calls[0].query).toContain("SET amount=amount+(SELECT amount");
    expect(calls[0].values).toEqual(["loser", 77, "winner", "loser"]);
    expect(calls[1].values).toEqual(["loser"]);
  });

  it("reads a normalized committed balance without inventing a missing player", async () => {
    const { calls, db } = scriptedDb([], [{ metro: 100_000.8 }, null]);
    await expect(readPlayerMetroBalance(db, "runner")).resolves.toBe(100_000);
    await expect(readPlayerMetroBalance(db, "missing")).resolves.toBeNull();
    expect(calls.map((call) => call.values)).toEqual([["runner"], ["missing"]]);
  });
});
