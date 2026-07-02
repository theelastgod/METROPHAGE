// METROPHAGE server — $METRO custodial bridge (Phase 5, step 2a: accounting).
//
// The off-chain `credits` balance (server-authoritative, Phase 4) is the live in-game
// currency. This bridge converts it to/from on-chain $METRO via a CUSTODIAL treasury:
//   withdraw  credits -> $METRO  (debit credits, send $METRO from the treasury)
//   deposit   $METRO  -> credits (verify an on-chain transfer into the treasury, grant credits)
//
// AUTHORITY: the server owns every balance and authorizes every settlement. The client
// never mints, never reports a balance, and cannot double-spend — withdrawals debit
// atomically (a conditional UPDATE) and deposits are claim-once (tx_sig is a PRIMARY
// KEY). The actual Solana settlement is the `Settlement` seam, stubbed as devnet-sim
// here so the whole ledger is headlessly testable; step 2b swaps in real devnet ops.
//
// NOT YET (mainnet blockers, by design): real wallet-ownership auth (Sign-In-With-
// Solana) bound to an AUTHENTICATED game identity — Phase 4 login is name-only, which
// is fine for devnet rehearsal but must be hardened before real value moves.

import type { D1Database } from "@cloudflare/workers-types";

export const BRIDGE = {
  // $METRO is a FIXED-supply pump.fun token (1,000,000,000, mint authority revoked) that the
  // developer CANNOT mint or seed into the game treasury at launch. The cash-out pool is
  // therefore 100% player-funded: deposits fill it, withdrawals drain it, and the bridge
  // never promises a payout the treasury does not actually hold (see poolMetro()).
  //
  // The rate SPREAD is what makes that economy self-sustaining: depositing is generous
  // (1 $METRO -> 110 credits) while cashing out costs more (125 credits -> 1 $METRO), so
  // every round trip leaves ~12% of the tokens in the pool. That float is the yield that
  // pays players who only ever earn credits in-game and never deposit.
  depositCreditsPerMetro: 110, // credits granted per 1 $METRO deposited
  withdrawCreditsPerMetro: 125, // credits burned per 1 $METRO withdrawn
  minWithdrawCredits: 500, // withdraw floor
  withdrawCooldownMs: 60_000, // min gap between a player's withdrawals
  dailyCapCredits: 100_000, // max credits withdrawn per player per rolling 24h
  metroDecimals: 6, // SPL token precision for rounding amounts
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
/** A Solana address (wallet or mint) is base58 that decodes to exactly 32 bytes. */
export function isValidWallet(s: string): boolean {
  if (!s || s.length < 32 || s.length > 44) return false;
  const bytes: number[] = [0];
  for (const ch of s) {
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
  for (let i = 0; i < s.length && s[i] === "1"; i++) bytes.push(0);
  return bytes.length === 32;
}

export interface SettleResult {
  ok: boolean;
  ref?: string; // on-chain reference (tx signature) when a real settlement happens
  reason?: string;
  metro?: number; // verified on-chain amount (deposit)
}

export interface Settlement {
  /** Send `metro` $METRO from the treasury to `wallet`. */
  sendMetro(wallet: string, metro: number): Promise<SettleResult>;
  /** Verify an on-chain deposit tx that paid `metro` into the treasury from `wallet`. */
  verifyDeposit(txSig: string, wallet: string, claimedMetro: number): Promise<SettleResult>;
}

/** Step 2a settlement: simulates the chain so the off-chain accounting is fully
 *  testable. Step 2b replaces this with real devnet transfers + tx verification. */
export const simSettlement: Settlement = {
  async sendMetro() {
    return { ok: true, ref: "devnet-sim:" + crypto.randomUUID() };
  },
  async verifyDeposit(_txSig, _wallet, claimedMetro) {
    return { ok: true, metro: claimedMetro }; // trust the amount in sim; 2b reads it from chain
  },
};

export interface BridgeResponse {
  ok: boolean;
  reason?: string;
  [k: string]: unknown;
}

const normId = (player: string): string => (player || "").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "blank";

export async function getAccount(db: D1Database, player: string): Promise<BridgeResponse> {
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
          ? "cash-out pool is empty — it is player-funded and fills as runners deposit $METRO"
          : `cash-out pool only holds ${pool} $METRO right now — try a smaller amount`,
      poolMetro: pool,
    };
  }
  const wid = ins.meta.last_row_id;

  // settle on-chain (2a: sim). On failure, REFUND the credits and mark the row failed.
  const settle = await settlement.sendMetro(wallet, metro);
  if (!settle.ok) {
    await db.prepare("UPDATE players SET credits = credits + ? WHERE id = ?").bind(credits, id).run();
    await db.prepare("UPDATE metro_withdrawals SET status = 'failed' WHERE id = ?").bind(wid).run();
    return { ok: false, reason: settle.reason ?? "settlement failed (credits refunded)" };
  }
  await db
    .prepare("UPDATE metro_withdrawals SET status = 'done', tx_sig = ? WHERE id = ?")
    .bind(settle.ref ?? null, wid)
    .run();
  return { ok: true, player: id, wallet, credits, metro, txSig: settle.ref };
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
