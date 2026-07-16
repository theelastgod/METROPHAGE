// METROPHAGE server — $METRO custodial bridge (Phase 5, step 2a: accounting).
//
// The off-chain `credits` balance (server-authoritative, Phase 4) is the live in-game
// currency. This bridge converts it to/from on-chain $METRO via a CUSTODIAL treasury:
//   withdraw  credits -> $METRO  (debit credits; Solana treasury preferably pays SOL
//                                 and broadcasts the payout; confirm finalizes on-chain)
//   deposit   $METRO  -> credits (verify an on-chain transfer into the treasury, grant credits)
//
// AUTHORITY: the server owns every balance and authorizes every settlement. The client
// never mints, never reports a balance, and cannot double-spend — withdrawals debit
// atomically (a conditional UPDATE) and deposits are claim-once (tx_sig is a PRIMARY
// KEY). Settlement is a pluggable seam: Solana SPL (primary), Robinhood ERC-20 (alt),
// or devnet-sim for headless smoke tests.
// Credits↔$METRO rates track market USD (refreshed ~every 30m via metroPrice).
//
// Wallet proof required for live settlement (personal_sign / SIWS).

import type { D1Database } from "@cloudflare/workers-types";
import {
  BASE_DEPOSIT_CREDITS,
  BASE_WITHDRAW_CREDITS,
  BASE_MIN_WITHDRAW_CREDITS,
  BASE_WITHDRAW_COOLDOWN_MS,
  METRO_DEV_SEED_METRO,
  TARGET_PLAYERS,
  resolveEconomyPolicy,
  type EconomyPolicy,
  type PopTierId,
} from "../../src/game/economyPolicy";

/** User-facing copy when the player-funded pool (or on-chain treasury ATA) can't cover a cash-out. */
export const POOL_EMPTY_USER_MSG = "Check back later.";

/**
 * Static defaults (healthy). Live rates come from `resolveBridge()` / economy policy
 * so the 1% seed + deposits stay solvent under ~500 players.
 */
export const BRIDGE = {
  depositCreditsPerMetro: BASE_DEPOSIT_CREDITS,
  withdrawCreditsPerMetro: BASE_WITHDRAW_CREDITS,
  minWithdrawCredits: BASE_MIN_WITHDRAW_CREDITS,
  withdrawCooldownMs: BASE_WITHDRAW_COOLDOWN_MS,
  dailyCapCredits: 0, // unlimited
  metroDecimals: 6,
  claimTtlMs: 10 * 60_000,
  devSeedMetro: METRO_DEV_SEED_METRO,
  targetPlayers: TARGET_PLAYERS,
} as const;

export type LiveBridge = {
  depositCreditsPerMetro: number;
  withdrawCreditsPerMetro: number;
  minWithdrawCredits: number;
  withdrawCooldownMs: number;
  dailyCapCredits: number;
  claimTtlMs: number;
  policy: EconomyPolicy;
  /** Market USD per 1 $METRO (EVM); reference 1.0 when unlisted. */
  metroUsd: number;
  priceMult: number;
  priceSource: string;
  priceStale: boolean;
};

/** Optional env for market-price-aware rates (Worker secrets / vars). */
export type BridgePriceEnv = {
  METRO_MINT?: string;
  METRO_DEVNET_MINT?: string;
  METRO_CHAIN_ID?: string;
  METRO_RPC?: string;
  METRO_USD_PRICE?: string;
  METRO_MAINNET_ARMED?: string;
};

const DAY_MS = 86_400_000;
const roundMetro = (n: number) => {
  const p = 10 ** BRIDGE.metroDecimals;
  return Math.round(n * p) / p;
};

/** Withdraw direction at a specific rate. */
export const creditsToMetroAt = (credits: number, withdrawRate: number) =>
  roundMetro(credits / Math.max(1, withdrawRate));
/** Deposit direction at a specific rate. */
export const metroToCreditsAt = (metro: number, depositRate: number) =>
  Math.floor(metro * Math.max(1, depositRate));

/** Defaults (healthy) — prefer live policy via resolveBridge for mutations. */
export const creditsToMetro = (credits: number) => creditsToMetroAt(credits, BRIDGE.withdrawCreditsPerMetro);
export const metroToCredits = (metro: number) => metroToCreditsAt(metro, BRIDGE.depositCreditsPerMetro);

/** Developer seed recorded in metro_seed (migration 0034). Falls back to 0 if table missing. */
export async function seedMetro(db: D1Database): Promise<number> {
  try {
    const row = await db.prepare("SELECT COALESCE(SUM(metro),0) AS s FROM metro_seed").first<{ s: number }>();
    return Math.max(0, roundMetro(row?.s ?? 0));
  } catch {
    return 0;
  }
}

/**
 * Cash-out pool = developer seed + player deposits − non-failed withdrawals.
 * Hard ceiling on what the bridge will ever promise to pay.
 */
export async function poolMetro(db: D1Database): Promise<number> {
  const seed = await seedMetro(db);
  try {
    const row = await db
      .prepare(
        `SELECT
           (SELECT COALESCE(SUM(metro),0) FROM metro_deposits)
         - (SELECT COALESCE(SUM(metro),0) FROM metro_withdrawals WHERE status != 'failed') AS flow`,
      )
      .first<{ flow: number }>();
    return Math.max(0, roundMetro(seed + (row?.flow ?? 0)));
  } catch {
    return Math.max(0, seed);
  }
}

/** SQL fragment: available pool (seed + deposits − withdrawals). Used in atomic INSERT. */
const POOL_SQL = `(
  (SELECT COALESCE((SELECT SUM(metro) FROM metro_seed), 0))
  + (SELECT COALESCE(SUM(metro),0) FROM metro_deposits)
  - (SELECT COALESCE(SUM(metro),0) FROM metro_withdrawals WHERE status != 'failed')
)`;

/** Fallback when metro_seed table is absent (pre-0034). */
const POOL_SQL_LEGACY = `(
  (SELECT COALESCE(SUM(metro),0) FROM metro_deposits)
  - (SELECT COALESCE(SUM(metro),0) FROM metro_withdrawals WHERE status != 'failed')
)`;

async function withdrawnTodayMetro(db: D1Database, dayStart: number): Promise<number> {
  try {
    const row = await db
      .prepare(
        "SELECT COALESCE(SUM(metro),0) AS m FROM metro_withdrawals WHERE status != 'failed' AND created_at >= ?",
      )
      .bind(dayStart)
      .first<{ m: number }>();
    return Math.max(0, roundMetro(row?.m ?? 0));
  } catch {
    return 0;
  }
}

async function circulatingCredits(db: D1Database): Promise<number> {
  try {
    const row = await db.prepare("SELECT COALESCE(SUM(credits),0) AS c FROM players").first<{ c: number }>();
    return Math.max(0, Math.round(row?.c ?? 0));
  } catch {
    return 0;
  }
}

/** Registered player count — drives population economy tiers (500/1000/1500/2500). */
export async function registeredPlayerCount(db: D1Database): Promise<number> {
  try {
    const row = await db.prepare("SELECT COUNT(*) AS n FROM players").first<{ n: number }>();
    return Math.max(0, Math.floor(row?.n ?? 0));
  } catch {
    return TARGET_PLAYERS;
  }
}

/** Live rates + caps from pool health + population tier + market USD price. */
export async function resolveBridge(db: D1Database, priceEnv?: BridgePriceEnv): Promise<LiveBridge> {
  const pool = await poolMetro(db);
  const seed = await seedMetro(db);
  const circ = await circulatingCredits(db);
  const players = await registeredPlayerCount(db);
  const dayStart = Date.now() - DAY_MS;
  const wdToday = await withdrawnTodayMetro(db, dayStart);

  // Market USD (EVM) — 30m cache; reference $1 when unlisted / no mint.
  let metroUsd = 1;
  let priceSource = "reference";
  let priceStale = false;
  if (priceEnv) {
    try {
      const { getMetroUsdPrice } = await import("./metroPrice");
      const q = await getMetroUsdPrice({ DB: db, ...priceEnv });
      metroUsd = q.usd;
      priceSource = q.source;
      priceStale = q.stale;
    } catch {
      /* keep reference */
    }
  }

  const policy = resolveEconomyPolicy({
    poolMetro: pool,
    circulatingCredits: circ,
    activePlayers: players > 0 ? players : TARGET_PLAYERS,
    seedMetro: seed > 0 ? seed : METRO_DEV_SEED_METRO,
    withdrawnTodayMetro: wdToday,
    metroUsd,
    priceSource,
    priceStale,
  });
  return {
    depositCreditsPerMetro: policy.depositCreditsPerMetro,
    withdrawCreditsPerMetro: policy.withdrawCreditsPerMetro,
    minWithdrawCredits: policy.minWithdrawCredits,
    withdrawCooldownMs: policy.withdrawCooldownMs,
    dailyCapCredits: policy.dailyWithdrawCapCredits,
    claimTtlMs: BRIDGE.claimTtlMs,
    policy,
    metroUsd: policy.metroUsd,
    priceMult: policy.priceMult,
    priceSource: policy.priceSource,
    priceStale: policy.priceStale,
  };
}

/** Public pool status — the client renders launch-phase copy from this. */
export async function poolInfo(db: D1Database, priceEnv?: BridgePriceEnv): Promise<BridgeResponse> {
  const live = await resolveBridge(db, priceEnv);
  const pool = live.policy.poolMetro;
  const minMetro = creditsToMetroAt(live.minWithdrawCredits, live.withdrawCreditsPerMetro);
  return {
    ok: true,
    poolMetro: pool,
    seedMetro: live.policy.devSeedMetro,
    phase: live.policy.phase === "bootstrap" || pool < minMetro ? "bootstrap" : live.policy.phase,
    economyPhase: live.policy.phase,
    depositCreditsPerMetro: live.depositCreditsPerMetro,
    withdrawCreditsPerMetro: live.withdrawCreditsPerMetro,
    minWithdrawCredits: live.minWithdrawCredits,
    dailyCapCredits: 0, // unlimited daily withdraw
    dailyEmitCap: 0, // unlimited earn
    dailyWithdrawUnlimited: true,
    dailyEmitUnlimited: true,
    globalDailyWithdrawMetro: null, // no global daily drain cap
    coverageRatio: live.policy.coverageRatio,
    targetPlayers: TARGET_PLAYERS,
    activePlayers: live.policy.activePlayers,
    popTier: live.policy.popTier as PopTierId,
    popTierLabel: live.policy.popTierLabel,
    nextPopThreshold: live.policy.nextPopThreshold,
    note: live.policy.note,
    // Market price transparency for UI / HUD
    metroUsd: live.metroUsd,
    priceMult: live.priceMult,
    priceSource: live.priceSource,
    priceStale: live.priceStale,
    metroUsdReference: 1,
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
  /**
   * Payout payload for the client:
   *  - Solana preferred: `solana-sent:<sig>` (Worker already broadcast; treasury paid SOL)
   *  - Solana fallback: base64 fully- or partially-signed tx
   *  - EVM: fully signed raw ERC-20 transfer hex
   *  - sim: `devnet-sim-claim:…`
   */
  claimTx?: string;
  /** EVM treasury nonce used for a pre-signed claim (burned on TTL reclaim). */
  nonce?: number;
  /**
   * Hash the pre-signed claim WILL have once broadcast (deterministic from the
   * signed tx). Lets the TTL sweep ask the chain whether the player actually
   * broadcast it, instead of assuming abandonment and refunding blind.
   */
  claimTxHash?: string;
}

export interface Settlement {
  /** Build a payout claim the client can broadcast (or that the server already sent).
   *  - Solana: treasury-paid when SOL available; else player fee-payer partial sign
   *  - EVM: fully signed raw ERC-20 transfer (treasury → wallet) */
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

export async function getAccount(
  db: D1Database,
  player: string,
  settlement?: Settlement,
  priceEnv?: BridgePriceEnv,
): Promise<BridgeResponse> {
  await reclaimExpired(db, settlement); // lazily return credits from abandoned claims
  const id = normId(player);
  const row = await db.prepare("SELECT credits, metro FROM players WHERE id = ?").bind(id).first<{ credits: number; metro: number }>();
  if (!row) return { ok: false, reason: "unknown player" };
  const live = await resolveBridge(db, priceEnv);
  const agg = await db
    .prepare(
      "SELECT COALESCE(SUM(credits),0) AS used, COALESCE(MAX(created_at),0) AS last FROM metro_withdrawals WHERE player = ? AND status != 'failed' AND created_at >= ?",
    )
    .bind(id, Date.now() - DAY_MS)
    .first<{ used: number; last: number }>();
  const used = agg?.used ?? 0;
  const last = agg?.last ?? 0;
  const pool = live.policy.poolMetro;

  // Exact treasury memory for this player (credits + $METRO + lifetime bridge).
  let treasury: Record<string, unknown> | null = null;
  try {
    const { getPlayerTreasury } = await import("./playerTreasury");
    const t = await getPlayerTreasury(db, id, live.withdrawCreditsPerMetro);
    if (t) {
      treasury = {
        credits: t.credits,
        metro: t.metro,
        metroUnits: t.metroUnits,
        depositedMetro: t.depositedMetro,
        withdrawnMetro: t.withdrawnMetro,
        depositedCredits: t.depositedCredits,
        withdrawnCredits: t.withdrawnCredits,
        pendingCredits: t.pendingCredits,
        pendingMetro: t.pendingMetro,
        netMetroInPool: t.netMetroInPool,
        creditsAsMetro: t.creditsAsMetro,
        updatedAt: t.updatedAt,
      };
    }
  } catch {
    /* pre-migration */
  }

  const credits = Math.max(0, Math.round(Number(row.credits) || 0));
  const metro = Math.max(0, Math.round(Number(row.metro) || 0));
  return {
    ok: true,
    player: id,
    credits,
    metro,
    // Exact live balances (same as credits/metro; explicit for clients).
    balances: { credits, metro },
    treasury,
    depositCreditsPerMetro: live.depositCreditsPerMetro,
    withdrawCreditsPerMetro: live.withdrawCreditsPerMetro,
    metroValue: creditsToMetroAt(credits, live.withdrawCreditsPerMetro),
    poolMetro: pool,
    seedMetro: await seedMetro(db),
    phase: live.policy.phase === "bootstrap" || pool < creditsToMetroAt(live.minWithdrawCredits, live.withdrawCreditsPerMetro) ? "bootstrap" : "open",
    economyPhase: live.policy.phase,
    minWithdrawCredits: live.minWithdrawCredits,
    dailyCapCredits: 0, // unlimited
    dailyEmitCap: 0, // unlimited earn
    dailyUsedCredits: used, // telemetry only
    dailyWithdrawUnlimited: true,
    dailyEmitUnlimited: true,
    cooldownMsLeft: Math.max(0, live.withdrawCooldownMs - (Date.now() - last)),
    coverageRatio: live.policy.coverageRatio,
    globalDailyWithdrawMetro: live.policy.globalDailyWithdrawMetro,
    activePlayers: live.policy.activePlayers,
    popTier: live.policy.popTier,
    popTierLabel: live.policy.popTierLabel,
    nextPopThreshold: live.policy.nextPopThreshold,
    note: live.policy.note,
    metroUsd: live.metroUsd,
    priceMult: live.priceMult,
    priceSource: live.priceSource,
    priceStale: live.priceStale,
  };
}

export function quote(
  credits: number,
  withdrawRate: number = BRIDGE.withdrawCreditsPerMetro,
  depositRate: number = BRIDGE.depositCreditsPerMetro,
): BridgeResponse {
  const c = Math.floor(credits);
  if (!Number.isFinite(c) || c <= 0) return { ok: false, reason: "bad amount" };
  return {
    ok: true,
    credits: c,
    metro: creditsToMetroAt(c, withdrawRate),
    withdrawCreditsPerMetro: withdrawRate,
    depositCreditsPerMetro: depositRate,
  };
}

export async function withdraw(
  db: D1Database,
  settlement: Settlement,
  args: { player: string; wallet: string; credits: number },
  priceEnv?: BridgePriceEnv,
): Promise<BridgeResponse> {
  const id = normId(args.player);
  const wallet = (args.wallet || "").trim();
  const credits = Math.floor(Number(args.credits) || 0);
  if (!isValidWallet(wallet)) return { ok: false, reason: "invalid wallet address" };
  await reclaimExpired(db, settlement);

  const live = await resolveBridge(db, priceEnv);
  if (!Number.isFinite(credits) || credits < live.minWithdrawCredits)
    return { ok: false, reason: `minimum withdraw is ${live.minWithdrawCredits} credits` };

  // Pre-check: short anti-spam cooldown only (no daily withdraw cap).
  const now = Date.now();
  const cooldownCutoff = now - live.withdrawCooldownMs;
  const lastWd = await db
    .prepare(
      "SELECT COALESCE(MAX(created_at),0) AS last FROM metro_withdrawals WHERE player = ? AND status != 'failed'",
    )
    .bind(id)
    .first<{ last: number }>();
  if (now - (lastWd?.last ?? 0) < live.withdrawCooldownMs)
    return { ok: false, reason: "withdraw cooldown — try again shortly" };

  const metro = creditsToMetroAt(credits, live.withdrawCreditsPerMetro);

  // ATOMIC debit — succeeds only if the LIVE balance covers it (no double-spend).
  const debit = await db
    .prepare("UPDATE players SET credits = credits - ? WHERE id = ? AND credits >= ?")
    .bind(credits, id, credits)
    .run();
  if (debit.meta.changes === 0) return { ok: false, reason: "insufficient credits" };

  // ATOMIC pool + cooldown reservation — no daily personal or global WD caps.
  const bindCommon = [id, wallet, credits, metro, now, metro, id, cooldownCutoff] as const;

  let ins;
  try {
    ins = await db
      .prepare(
        `INSERT INTO metro_withdrawals (player, wallet, credits, metro, status, created_at)
         SELECT ?,?,?,?,'pending',?
         WHERE ${POOL_SQL} >= ?
           AND (SELECT COALESCE(MAX(created_at),0) FROM metro_withdrawals
                WHERE player = ? AND status != 'failed') <= ?`,
      )
      .bind(...bindCommon)
      .run();
  } catch {
    // Pre-0034: no metro_seed table — fall back to deposits-only pool SQL.
    ins = await db
      .prepare(
        `INSERT INTO metro_withdrawals (player, wallet, credits, metro, status, created_at)
         SELECT ?,?,?,?,'pending',?
         WHERE ${POOL_SQL_LEGACY} >= ?
           AND (SELECT COALESCE(MAX(created_at),0) FROM metro_withdrawals
                WHERE player = ? AND status != 'failed') <= ?`,
      )
      .bind(...bindCommon)
      .run();
  }
  if (ins.meta.changes === 0) {
    await db.prepare("UPDATE players SET credits = credits + ? WHERE id = ?").bind(credits, id).run();
    const pool = await poolMetro(db);
    const again = await db
      .prepare(
        "SELECT COALESCE(MAX(created_at),0) AS last FROM metro_withdrawals WHERE player = ? AND status != 'failed'",
      )
      .bind(id)
      .first<{ last: number }>();
    if (now - (again?.last ?? 0) < live.withdrawCooldownMs)
      return { ok: false, reason: "withdraw cooldown — try again shortly" };
    return {
      ok: false,
      reason: POOL_EMPTY_USER_MSG,
      poolMetro: pool,
    };
  }
  const wid = ins.meta.last_row_id;

  const settle = await settlement.buildClaim(wallet, metro);
  if (!settle.ok || !settle.claimTx) {
    await db.prepare("UPDATE players SET credits = credits + ? WHERE id = ?").bind(credits, id).run();
    await db.prepare("UPDATE metro_withdrawals SET status = 'failed' WHERE id = ?").bind(wid).run();
    const raw = settle.reason ?? "claim build failed (credits refunded)";
    const poolish =
      raw === POOL_EMPTY_USER_MSG ||
      /treasury.*low|balance too low|Check back later|insufficient \$METRO|no \$METRO/i.test(raw);
    return { ok: false, reason: poolish ? POOL_EMPTY_USER_MSG : raw };
  }
  if (typeof settle.nonce === "number" && Number.isFinite(settle.nonce)) {
    // This write is NOT optional. reclaimExpired burns the nonce only when
    // claim_nonce is set; if it's NULL the TTL path refunds the credits while the
    // player still holds a valid, broadcastable pre-signed transfer — they keep
    // the credits AND take the tokens, repeatably. (The old `catch {}` here was
    // for pre-0031 DBs; 0031 is long applied.)
    let recorded = false;
    try {
      // nonce + hash in one write: the sweep needs the hash to tell "landed" from
      // "abandoned", and the nonce to burn it. Splitting them risks having one.
      const w = await db
        .prepare("UPDATE metro_withdrawals SET claim_nonce = ?, claim_tx_hash = ? WHERE id = ?")
        .bind(settle.nonce, settle.claimTxHash ?? null, wid)
        .run();
      recorded = (w.meta.changes ?? 0) > 0;
    } catch {
      recorded = false;
    }
    if (!recorded) {
      // Never hand out a claim we can't reclaim. Refund, fail the row, and burn
      // the nonce so the tx we just signed can never land.
      await db.prepare("UPDATE players SET credits = credits + ? WHERE id = ?").bind(credits, id).run();
      await db.prepare("UPDATE metro_withdrawals SET status = 'failed' WHERE id = ?").bind(wid).run();
      try {
        await settlement.invalidateNonce?.(settle.nonce);
      } catch {
        /* burn failed — the claimTx was never returned, so it can't be broadcast */
      }
      return { ok: false, reason: "cash-out ledger unavailable — credits refunded, please retry" };
    }
  }
  try {
    const { recordTreasuryEvent } = await import("./playerTreasury");
    await recordTreasuryEvent(db, {
      player: id,
      kind: "withdraw_pending",
      credits,
      metro,
      rate: live.withdrawCreditsPerMetro,
      ref: `wd:${wid}`,
    });
  } catch {
    /* pre-migration */
  }
  return {
    ok: true,
    status: "claim",
    player: id,
    wallet,
    credits,
    metro,
    withdrawId: wid,
    claimTx: settle.claimTx,
    expiresAt: Date.now() + live.claimTtlMs,
    withdrawCreditsPerMetro: live.withdrawCreditsPerMetro,
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
  // (rates frozen at claim time via stored metro amount)

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
  try {
    const { recordTreasuryEvent } = await import("./playerTreasury");
    await recordTreasuryEvent(db, {
      player: id,
      kind: "withdraw_done",
      credits: row.credits,
      metro: row.metro,
      ref: txSig,
    });
  } catch {
    /* pre-migration */
  }
  return { ok: true, player: id, withdrawId: wid, metro: row.metro, credits: row.credits, txSig };
}

/** Refund pending claims older than the TTL.
 *  Solana claims die with blockhash; EVM pre-signed raw txs do NOT — pass settlement
 *  so we can burn the treasury nonce and invalidate the abandoned claimTx. */
export async function reclaimExpired(db: D1Database, settlement?: Settlement): Promise<number> {
  const cutoff = Date.now() - BRIDGE.claimTtlMs;
  type Row = {
    id: number;
    player: string;
    credits: number;
    claim_nonce: number | null;
    claim_tx_hash: string | null;
    wallet: string | null;
    metro: number | null;
  };
  let results: Row[];
  try {
    const q = await db
      .prepare(
        "SELECT id, player, credits, claim_nonce, claim_tx_hash, wallet, metro FROM metro_withdrawals WHERE status = 'pending' AND created_at < ?",
      )
      .bind(cutoff)
      .all<Row>();
    results = q.results ?? [];
  } catch {
    const q = await db
      .prepare("SELECT id, player, credits FROM metro_withdrawals WHERE status = 'pending' AND created_at < ?")
      .bind(cutoff)
      .all<{ id: number; player: string; credits: number }>();
    results = (q.results ?? []).map((r) => ({
      ...r,
      claim_nonce: null,
      claim_tx_hash: null,
      wallet: null,
      metro: null,
    }));
  }
  let reclaimed = 0;
  for (const r of results) {
    // Did the player actually broadcast it? Ask the chain BEFORE trying to burn
    // the nonce — a landed claim has already consumed that nonce, so the burn
    // would throw and `continue` below would strand the row as 'pending' forever
    // (credits debited, tokens delivered, pool permanently shrunk).
    if (r.claim_tx_hash && r.wallet && r.metro != null && settlement?.verifyClaim) {
      let landed = false;
      try {
        const v = await settlement.verifyClaim(r.claim_tx_hash, r.wallet, r.metro);
        landed = !!v.ok;
      } catch {
        landed = false; // can't reach the chain — fall through and retry next sweep
      }
      if (landed) {
        // It paid out. Finalize like confirmWithdraw would have, exactly once.
        const fin = await db
          .prepare(
            `UPDATE metro_withdrawals SET status = 'done', tx_sig = ?
             WHERE id = ? AND status = 'pending'
               AND NOT EXISTS (SELECT 1 FROM metro_withdrawals WHERE tx_sig = ?)`,
          )
          .bind(r.claim_tx_hash, r.id, r.claim_tx_hash)
          .run();
        if ((fin.meta.changes ?? 0) > 0) {
          try {
            const { recordTreasuryEvent } = await import("./playerTreasury");
            await recordTreasuryEvent(db, {
              player: r.player,
              kind: "withdraw_done",
              credits: r.credits,
              metro: r.metro,
              ref: r.claim_tx_hash,
            });
          } catch {
            /* pre-migration */
          }
        }
        continue; // never refund a claim that paid
      }
    }
    // EVM: burn treasury nonce BEFORE flipping status / refunding. If burn fails, leave
    // the row pending so we retry — never refund while a pre-signed claimTx may still land.
    if (r.claim_nonce != null && settlement?.invalidateNonce) {
      try {
        await settlement.invalidateNonce(r.claim_nonce);
      } catch {
        continue; // still pending; next reclaimExpired will retry
      }
    }
    // Conditional flip so a concurrent confirm cannot race the refund.
    const flip = await db
      .prepare("UPDATE metro_withdrawals SET status = 'failed' WHERE id = ? AND status = 'pending'")
      .bind(r.id)
      .run();
    if (flip.meta.changes === 0) continue;
    await db.prepare("UPDATE players SET credits = credits + ? WHERE id = ?").bind(r.credits, r.player).run();
    try {
      // Look up metro amount for the failed claim when present.
      const meta = await db
        .prepare("SELECT metro FROM metro_withdrawals WHERE id = ?")
        .bind(r.id)
        .first<{ metro: number }>();
      const { recordTreasuryEvent } = await import("./playerTreasury");
      await recordTreasuryEvent(db, {
        player: r.player,
        kind: "withdraw_failed",
        credits: r.credits,
        metro: Number(meta?.metro ?? 0),
        ref: `wd:${r.id}`,
      });
    } catch {
      /* pre-migration */
    }
    reclaimed++;
  }
  return reclaimed;
}

export async function deposit(
  db: D1Database,
  settlement: Settlement,
  args: { player: string; wallet: string; txSig: string; metro: number; as?: "credits" | "metro" },
  priceEnv?: BridgePriceEnv,
): Promise<BridgeResponse> {
  const id = normId(args.player);
  const wallet = (args.wallet || "").trim();
  const txSig = (args.txSig || "").trim();
  // One token, one claim. Deposits used to grant credits AND spendable ◈ for the
  // same tokens, so 100 $METRO became 10,000₵ *and* 100◈ — the pool backed both.
  // The runner now picks which side of the house their deposit lands in.
  // Defaults to credits: that's what the deposit UI and the bridge have always
  // promised, and what an un-updated client expects.
  const want: "credits" | "metro" = args.as === "metro" ? "metro" : "credits";
  if (!txSig) return { ok: false, reason: "missing tx signature" };
  if (!isValidWallet(wallet)) return { ok: false, reason: "invalid wallet address" };
  const exists = await db.prepare("SELECT 1 FROM players WHERE id = ?").bind(id).first();
  if (!exists) return { ok: false, reason: "unknown player" };

  // verify the on-chain transfer (2a: sim trusts the amount; 2b reads it from chain).
  const v = await settlement.verifyDeposit(txSig, wallet, args.metro);
  if (!v.ok) return { ok: false, reason: v.reason ?? "deposit not verified on-chain" };
  const metro = roundMetro(v.metro ?? args.metro);
  if (!(metro > 0) || !Number.isFinite(metro)) return { ok: false, reason: "bad deposit amount" };
  const live = await resolveBridge(db, priceEnv);
  const credits = metroToCreditsAt(metro, live.depositCreditsPerMetro);
  // Reject dust that would grant 0 credits (don't inflate metro ledger with Math.max(1,…)).
  if (credits < 1) return { ok: false, reason: "deposit too small — need more $METRO for 1 credit at current rate" };

  // Exactly one side is funded — see `want` above. ◈ tracks whole units so a
  // sub-1 deposit can't invent one.
  const grantedCredits = want === "credits" ? credits : 0;
  const grantedMetro = want === "metro" ? Math.max(0, Math.round(metro)) : 0;

  // CLAIM-ONCE: tx_sig is the PRIMARY KEY, so a transfer can only ever credit once.
  // Record what was actually GRANTED, not what it would have been worth as credits —
  // player_treasury bootstraps lifetime totals from this row.
  const claim = await db
    .prepare("INSERT OR IGNORE INTO metro_deposits (tx_sig, player, wallet, metro, credits, created_at) VALUES (?,?,?,?,?,?)")
    .bind(txSig, id, wallet, metro, grantedCredits, Date.now())
    .run();
  if (claim.meta.changes === 0) return { ok: false, reason: "deposit already claimed" };

  await db
    .prepare("UPDATE players SET credits = credits + ?, metro = metro + ? WHERE id = ?")
    .bind(grantedCredits, grantedMetro, id)
    .run();
  try {
    const { recordTreasuryEvent } = await import("./playerTreasury");
    await recordTreasuryEvent(db, {
      player: id,
      kind: "deposit",
      credits: grantedCredits,
      metro,
      rate: live.depositCreditsPerMetro,
      ref: txSig,
    });
  } catch {
    /* pre-migration */
  }
  return { ok: true, player: id, txSig, metro, metroGranted: grantedMetro, credits: grantedCredits, granted: want };
}
