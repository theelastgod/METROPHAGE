// METROPHAGE server — $METRO custodial bridge (Phase 5, step 2a: accounting).
//
// The off-chain `credits` balance (server-authoritative, Phase 4) is the live in-game
// currency. This bridge converts it to/from on-chain $METRO via a CUSTODIAL treasury:
//   withdraw  credits -> $METRO  (debit credits, hand the player a CLAIM tx they pay
//                                 the fee on; confirm finalizes once it lands on-chain)
//   deposit   $METRO  -> credits (verify an on-chain transfer into the treasury, grant credits)
//
// AUTHORITY: the server owns every balance and authorizes every settlement. The client
// never mints, never reports a balance, and cannot double-spend — withdrawals debit
// atomically (a conditional UPDATE) and deposits are claim-once (tx_sig is a PRIMARY
// KEY). Settlement is a pluggable seam: EVM ERC-20 (preferred for ETH $METRO),
// Solana SPL (legacy), or devnet-sim for headless smoke tests.
//
// Wallet proof required for live settlement (personal_sign / SIWS).

import type { D1Database } from "@cloudflare/workers-types";

export const BRIDGE = {
  // ── Robinhood Chain launch economics (ERC-20 on RH L2) ──────────────────
  // Fixed-supply $METRO; developer does NOT seed the cash-out pool. Deposits fill
  // it, withdrawals drain it, empty pool = reject + refund credits.
  //
  // Retail-friendly integers (RH app audience):
  //   deposit  1 $METRO → 100 ₵
  //   withdraw 125 ₵ → 1 $METRO
  // Round-trip keeps 20% of the credit value in the pool (wider than the old 12%
  // Solana/pump.fun spread) so early cash-outs from a cold pool are safer.
  //
  // L2 gas is cheap → lower min cash-out (2 $METRO). Daily cap is tighter at launch
  // so one account can't empty a thin pool. On-chain ERC-20 decimals are still read
  // live; metroDecimals is ledger rounding only.
  //
  // Gas: deposits paid by player; withdrawals are treasury-signed ERC-20 transfers
  // (treasury needs a small ETH float on Robinhood Chain).
  depositCreditsPerMetro: 100, // 1 $METRO deposited → 100 credits
  withdrawCreditsPerMetro: 125, // 125 credits → 1 $METRO cashed out
  minWithdrawCredits: 250, // 2 $METRO floor (L2-friendly)
  withdrawCooldownMs: 30_000, // 30s between withdraws (snappier on L2)
  dailyCapCredits: 50_000, // 400 $METRO/day max per player at launch
  metroDecimals: 6, // off-chain rounding; contract decimals used for chain amounts
  claimTtlMs: 10 * 60_000, // abandoned claims refund after 10 min
} as const;

const DAY_MS = 86_400_000;
const roundMetro = (n: number) => {
  const p = 10 ** BRIDGE.metroDecimals;
  return Math.round(n * p) / p;
};
/** Withdraw direction: credits burned -> $METRO owed. */
export const creditsToMetro = (credits: number) => roundMetro(credits / BRIDGE.withdrawCreditsPerMetro);
/** Deposit direction: $METRO received -> credits granted. */
export const metroToCredits = (metro: number) => Math.floor(metro * BRIDGE.depositCreditsPerMetro);

/** The player-funded cash-out pool: every verified deposit adds to it, every non-failed
 *  withdrawal reserves from it. Starts at ZERO on a pump.fun launch (no dev seeding) and
 *  is the hard ceiling on what the bridge will ever promise to pay. */
export async function poolMetro(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      "SELECT (SELECT COALESCE(SUM(metro),0) FROM metro_deposits) - (SELECT COALESCE(SUM(metro),0) FROM metro_withdrawals WHERE status != 'failed') AS pool",
    )
    .first<{ pool: number }>();
  return Math.max(0, roundMetro(row?.pool ?? 0));
}

/** Public pool status — the client renders launch-phase copy from this. */
export async function poolInfo(db: D1Database): Promise<BridgeResponse> {
  const pool = await poolMetro(db);
  const minMetro = creditsToMetro(BRIDGE.minWithdrawCredits);
  return {
    ok: true,
    poolMetro: pool,
    // bootstrap = the pool cannot yet cover even a minimum withdrawal. Purely
    // informational: withdrawals are gated on the actual pool balance either way.
    phase: pool >= minMetro ? "open" : "bootstrap",
    depositCreditsPerMetro: BRIDGE.depositCreditsPerMetro,
    withdrawCreditsPerMetro: BRIDGE.withdrawCreditsPerMetro,
    minWithdrawCredits: BRIDGE.minWithdrawCredits,
  };
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** EVM address (preferred for ETH $METRO) or legacy Solana base58 pubkey. */
export function isValidWallet(s: string): boolean {
  const a = (s || "").trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(a)) return true;
  if (!a || a.length < 32 || a.length > 44) return false;
  const bytes: number[] = [0];
  for (const ch of a) {
    const v = BASE58.indexOf(ch);
    if (v < 0) return false;
    let carry = v;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < a.length && a[i] === "1"; i++) bytes.push(0);
  return bytes.length === 32;
}

export interface SettleResult {
  ok: boolean;
  ref?: string; // on-chain reference (tx signature) when a real settlement happens
  reason?: string;
  metro?: number; // verified on-chain amount (deposit)
  /** Partially-signed payout tx (base64) — the PLAYER signs as fee payer and submits. */
  claimTx?: string;
  /** EVM treasury nonce used for a pre-signed claim (burned on TTL reclaim). */
  nonce?: number;
}

export interface Settlement {
  /** Build a payout claim the client can broadcast.
   *  - EVM: fully signed raw ERC-20 transfer (treasury → wallet); client eth_sendRawTransaction
   *  - Solana: partially signed transfer (player fee-payer); client wallet signs+sends */
  buildClaim(wallet: string, metro: number): Promise<SettleResult>;
  /** Verify a submitted claim landed on-chain: treasury paid exactly `metro` to `wallet`. */
  verifyClaim(txSig: string, wallet: string, metro: number): Promise<SettleResult>;
  /** Verify an on-chain deposit tx that paid `metro` into the treasury from `wallet`. */
  verifyDeposit(txSig: string, wallet: string, claimedMetro: number): Promise<SettleResult>;
  /**
   * Invalidate a pre-signed EVM claim by consuming its treasury nonce (0-value self-tx).
   * Optional — sim/Solana leave this undefined (Solana claims expire via blockhash).
   */
  invalidateNonce?(nonce: number): Promise<void>;
}

/** Devnet-sim settlement: simulates the chain so the off-chain accounting is fully
 *  testable headlessly. Real settlement (evm.ts / solana.ts) swaps in when configured. */
export const simSettlement: Settlement = {
  async buildClaim() {
    return { ok: true, claimTx: "devnet-sim-claim:" + crypto.randomUUID() };
  },
  async verifyClaim(txSig) {
    if (!txSig) return { ok: false, reason: "missing tx signature" };
    return { ok: true, ref: txSig };
  },
  async verifyDeposit(_txSig, _wallet, claimedMetro) {
    return { ok: true, metro: claimedMetro }; // trust the amount in sim; solana.ts reads it from chain
  },
};

export interface BridgeResponse {
  ok: boolean;
  reason?: string;
  [k: string]: unknown;
}

// Sanitize but PRESERVE case and the "w:" prefix — real player ids are
// "w:<base58 wallet>" (case-sensitive); lowercasing them broke every bridge
// lookup for wallet players ("unknown player").
const normId = (player: string): string => (player || "").replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 64) || "blank";

export async function getAccount(db: D1Database, player: string, settlement?: Settlement): Promise<BridgeResponse> {
  await reclaimExpired(db, settlement); // lazily return credits from abandoned claims
  const id = normId(player);
  const row = await db.prepare("SELECT credits, metro FROM players WHERE id = ?").bind(id).first<{ credits: number; metro: number }>();
  if (!row) return { ok: false, reason: "unknown player" };
  const agg = await db
    .prepare(
      "SELECT COALESCE(SUM(credits),0) AS used, COALESCE(MAX(created_at),0) AS last FROM metro_withdrawals WHERE player = ? AND status != 'failed' AND created_at >= ?",
    )
    .bind(id, Date.now() - DAY_MS)
    .first<{ used: number; last: number }>();
  const used = agg?.used ?? 0;
  const last = agg?.last ?? 0;
  const pool = await poolMetro(db);
  return {
    ok: true,
    player: id,
    credits: row.credits,
    metro: row.metro ?? 0,
    depositCreditsPerMetro: BRIDGE.depositCreditsPerMetro,
    withdrawCreditsPerMetro: BRIDGE.withdrawCreditsPerMetro,
    metroValue: creditsToMetro(row.credits),
    poolMetro: pool,
    phase: pool >= creditsToMetro(BRIDGE.minWithdrawCredits) ? "open" : "bootstrap",
    minWithdrawCredits: BRIDGE.minWithdrawCredits,
    dailyCapCredits: BRIDGE.dailyCapCredits,
    dailyUsedCredits: used,
    cooldownMsLeft: Math.max(0, BRIDGE.withdrawCooldownMs - (Date.now() - last)),
  };
}

export function quote(credits: number): BridgeResponse {
  const c = Math.floor(credits);
  if (!Number.isFinite(c) || c <= 0) return { ok: false, reason: "bad amount" };
  return {
    ok: true,
    credits: c,
    metro: creditsToMetro(c),
    withdrawCreditsPerMetro: BRIDGE.withdrawCreditsPerMetro,
    depositCreditsPerMetro: BRIDGE.depositCreditsPerMetro,
  };
}

export async function withdraw(
  db: D1Database,
  settlement: Settlement,
  args: { player: string; wallet: string; credits: number },
): Promise<BridgeResponse> {
  const id = normId(args.player);
  const wallet = (args.wallet || "").trim();
  const credits = Math.floor(args.credits);
  if (!isValidWallet(wallet)) return { ok: false, reason: "invalid wallet address" };
  if (!Number.isFinite(credits) || credits < BRIDGE.minWithdrawCredits)
    return { ok: false, reason: `minimum withdraw is ${BRIDGE.minWithdrawCredits} credits` };
  await reclaimExpired(db, settlement); // abandoned claims release their pool reservation first

  // server-authoritative anti-abuse: cooldown + rolling daily cap
  const agg = await db
    .prepare(
      "SELECT COALESCE(SUM(credits),0) AS used, COALESCE(MAX(created_at),0) AS last FROM metro_withdrawals WHERE player = ? AND status != 'failed' AND created_at >= ?",
    )
    .bind(id, Date.now() - DAY_MS)
    .first<{ used: number; last: number }>();
  if (Date.now() - (agg?.last ?? 0) < BRIDGE.withdrawCooldownMs)
    return { ok: false, reason: "withdraw cooldown — try again shortly" };
  if ((agg?.used ?? 0) + credits > BRIDGE.dailyCapCredits) return { ok: false, reason: "daily withdraw cap reached" };

  // ATOMIC debit — succeeds only if the LIVE balance covers it (no double-spend).
  const debit = await db
    .prepare("UPDATE players SET credits = credits - ? WHERE id = ? AND credits >= ?")
    .bind(credits, id, credits)
    .run();
  if (debit.meta.changes === 0) return { ok: false, reason: "insufficient credits" };

  // ATOMIC pool reservation — the row only inserts if the player-funded pool still
  // covers this payout at insert time (single statement, so concurrent withdrawals
  // cannot both pass a stale check). No dev seeding exists: the pool is deposits
  // minus prior payouts, and the bridge never promises more than it holds.
  const metro = creditsToMetro(credits);
  const ins = await db
    .prepare(
      `INSERT INTO metro_withdrawals (player, wallet, credits, metro, status, created_at)
       SELECT ?,?,?,?,'pending',?
       WHERE (SELECT COALESCE(SUM(metro),0) FROM metro_deposits)
           - (SELECT COALESCE(SUM(metro),0) FROM metro_withdrawals WHERE status != 'failed') >= ?`,
    )
    .bind(id, wallet, credits, metro, Date.now(), metro)
    .run();
  if (ins.meta.changes === 0) {
    await db.prepare("UPDATE players SET credits = credits + ? WHERE id = ?").bind(credits, id).run();
    const pool = await poolMetro(db);
    return {
      ok: false,
      reason:
        pool <= 0
          ? "insufficient $METRO in the treasury — come back and try again later (it refills as runners deposit)"
          : `insufficient $METRO in the treasury for that amount (${pool} $METRO available) — try a smaller amount or come back later`,
      poolMetro: pool,
    };
  }
  const wid = ins.meta.last_row_id;

  // Build the CLAIM: a payout tx the PLAYER pays the fee on and submits. The treasury
  // only signs — it never spends SOL ($0-launch invariant). On build failure, refund.
  const settle = await settlement.buildClaim(wallet, metro);
  if (!settle.ok || !settle.claimTx) {
    await db.prepare("UPDATE players SET credits = credits + ? WHERE id = ?").bind(credits, id).run();
    await db.prepare("UPDATE metro_withdrawals SET status = 'failed' WHERE id = ?").bind(wid).run();
    return { ok: false, reason: settle.reason ?? "claim build failed (credits refunded)" };
  }
  // Persist EVM nonce so TTL reclaim can burn the pre-signed claim (otherwise an
  // abandoned signed transfer remains valid forever until the nonce advances).
  if (typeof settle.nonce === "number" && Number.isFinite(settle.nonce)) {
    try {
      await db.prepare("UPDATE metro_withdrawals SET claim_nonce = ? WHERE id = ?").bind(settle.nonce, wid).run();
    } catch {
      /* pre-migration — reclaim cannot burn nonce until 0031 is applied */
    }
  }
  // The row stays 'pending' (reserving the pool) until /metro/withdraw/confirm proves
  // the claim landed — or the TTL reclaims it. The tx itself is not stored: it is only
  // valid signed-as-is, and the confirm step re-verifies everything on-chain anyway.
  return {
    ok: true,
    status: "claim",
    player: id,
    wallet,
    credits,
    metro,
    withdrawId: wid,
    claimTx: settle.claimTx,
    expiresAt: Date.now() + BRIDGE.claimTtlMs,
    note: "sign + submit this tx with your wallet (you pay the network fee), then confirm",
  };
}

/** Confirm a submitted claim: verify on-chain, then finalize the pending row exactly
 *  once. The tx signature is also required to be globally unused, so one on-chain
 *  transfer can never confirm two same-amount withdrawals. */
export async function confirmWithdraw(
  db: D1Database,
  settlement: Settlement,
  args: { player: string; withdrawId: number; txSig: string },
): Promise<BridgeResponse> {
  const id = normId(args.player);
  const wid = Math.floor(args.withdrawId);
  const txSig = (args.txSig || "").trim();
  if (!Number.isFinite(wid) || wid <= 0) return { ok: false, reason: "bad withdrawal id" };
  if (!txSig) return { ok: false, reason: "missing tx signature" };

  const row = await db
    .prepare("SELECT wallet, credits, metro, status, created_at FROM metro_withdrawals WHERE id = ? AND player = ?")
    .bind(wid, id)
    .first<{ wallet: string; credits: number; metro: number; status: string; created_at: number }>();
  if (!row) return { ok: false, reason: "unknown withdrawal" };
  if (row.status === "done") return { ok: false, reason: "already confirmed" };
  if (row.status !== "pending") return { ok: false, reason: "claim expired or failed" };
  if (Date.now() - row.created_at > BRIDGE.claimTtlMs) {
    await reclaimExpired(db, settlement);
    return { ok: false, reason: "claim expired — credits refunded" };
  }

  const v = await settlement.verifyClaim(txSig, row.wallet, row.metro);
  if (!v.ok) return { ok: false, reason: v.reason ?? "claim not found on-chain yet — try again shortly" };

  // finalize exactly once; the NOT EXISTS guard makes the tx signature single-use
  const fin = await db
    .prepare(
      `UPDATE metro_withdrawals SET status = 'done', tx_sig = ?
       WHERE id = ? AND status = 'pending'
         AND NOT EXISTS (SELECT 1 FROM metro_withdrawals WHERE tx_sig = ?)`,
    )
    .bind(txSig, wid, txSig)
    .run();
  if (fin.meta.changes === 0) return { ok: false, reason: "already confirmed (or tx signature already used)" };
  return { ok: true, player: id, withdrawId: wid, metro: row.metro, credits: row.credits, txSig };
}

/** Refund pending claims older than the TTL.
 *  Solana claims die with blockhash; EVM pre-signed raw txs do NOT — pass settlement
 *  so we can burn the treasury nonce and invalidate the abandoned claimTx. */
export async function reclaimExpired(db: D1Database, settlement?: Settlement): Promise<number> {
  const cutoff = Date.now() - BRIDGE.claimTtlMs;
  let results: Array<{ id: number; player: string; credits: number; claim_nonce: number | null }>;
  try {
    const q = await db
      .prepare("SELECT id, player, credits, claim_nonce FROM metro_withdrawals WHERE status = 'pending' AND created_at < ?")
      .bind(cutoff)
      .all<{ id: number; player: string; credits: number; claim_nonce: number | null }>();
    results = q.results ?? [];
  } catch {
    const q = await db
      .prepare("SELECT id, player, credits FROM metro_withdrawals WHERE status = 'pending' AND created_at < ?")
      .bind(cutoff)
      .all<{ id: number; player: string; credits: number }>();
    results = (q.results ?? []).map((r) => ({ ...r, claim_nonce: null }));
  }
  let reclaimed = 0;
  for (const r of results) {
    // conditional flip first so a concurrent confirm cannot race the refund
    const flip = await db
      .prepare("UPDATE metro_withdrawals SET status = 'failed' WHERE id = ? AND status = 'pending'")
      .bind(r.id)
      .run();
    if (flip.meta.changes === 0) continue;
    // Burn EVM nonce BEFORE refunding credits — otherwise a player can broadcast the
    // abandoned signed transfer and keep the refund.
    if (r.claim_nonce != null && settlement?.invalidateNonce) {
      try {
        await settlement.invalidateNonce(r.claim_nonce);
      } catch {
        /* best-effort; nonce may already be used */
      }
    }
    await db.prepare("UPDATE players SET credits = credits + ? WHERE id = ?").bind(r.credits, r.player).run();
    reclaimed++;
  }
  return reclaimed;
}

export async function deposit(
  db: D1Database,
  settlement: Settlement,
  args: { player: string; wallet: string; txSig: string; metro: number },
): Promise<BridgeResponse> {
  const id = normId(args.player);
  const wallet = (args.wallet || "").trim();
  const txSig = (args.txSig || "").trim();
  if (!txSig) return { ok: false, reason: "missing tx signature" };
  if (!isValidWallet(wallet)) return { ok: false, reason: "invalid wallet address" };
  const exists = await db.prepare("SELECT 1 FROM players WHERE id = ?").bind(id).first();
  if (!exists) return { ok: false, reason: "unknown player" };

  // verify the on-chain transfer (2a: sim trusts the amount; 2b reads it from chain).
  const v = await settlement.verifyDeposit(txSig, wallet, args.metro);
  if (!v.ok) return { ok: false, reason: v.reason ?? "deposit not verified on-chain" };
  const metro = roundMetro(v.metro ?? args.metro);
  if (!(metro > 0)) return { ok: false, reason: "bad deposit amount" };
  const credits = metroToCredits(metro);

  // CLAIM-ONCE: tx_sig is the PRIMARY KEY, so a transfer can only ever credit once.
  const claim = await db
    .prepare("INSERT OR IGNORE INTO metro_deposits (tx_sig, player, wallet, metro, credits, created_at) VALUES (?,?,?,?,?,?)")
    .bind(txSig, id, wallet, metro, credits, Date.now())
    .run();
  if (claim.meta.changes === 0) return { ok: false, reason: "deposit already claimed" };

  const metroUnits = Math.max(1, Math.round(metro));
  await db
    .prepare("UPDATE players SET credits = credits + ?, metro = metro + ? WHERE id = ?")
    .bind(credits, metroUnits, id)
    .run();
  return { ok: true, player: id, txSig, metro, metroGranted: metroUnits, credits };
}
