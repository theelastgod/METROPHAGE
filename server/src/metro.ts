// METROPHAGE server — $METRO custodial bridge (Phase 5, step 2a: accounting).
//
// The off-chain `credits` balance (server-authoritative, Phase 4) is the live in-game
// currency. This bridge converts it to/from on-chain $METRO via a CUSTODIAL treasury:
//   withdraw  credits -> $METRO  (debit credits; Worker broadcasts an SPL payout;
//                                 confirm finalizes on-chain)
//   deposit   $METRO  -> credits (verify a finalized transfer into the treasury, grant credits)
//
// AUTHORITY: the server owns every balance and authorizes every settlement. The client
// never mints, never reports a balance, and cannot double-spend — withdrawals debit
// atomically (a conditional UPDATE) and deposits are claim-once (tx_sig is a PRIMARY
// KEY). Settlement is a pluggable seam: Solana SPL (solana.ts) or devnet-sim for
// headless smoke tests. evm.ts is unused.
// Credits↔$METRO rates track Solana 15m TWAP (metroPrice). A null quote freezes
// the bridge rather than impersonating $1. Wallet proof is ed25519 login.

import type { D1Database } from "@cloudflare/workers-types";
import { isSolanaMint } from "./settlementFamily";
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
  // Solana recent-blockhash dies in ~60–90s. Never hand a stale signed tx to the client.
  claimTtlMs: 2 * 60_000,
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
  /** 15m TWAP USD per 1 $METRO; 0 when the oracle has no quote (never silent $1). */
  metroUsd: number;
  spotUsd: number;
  twap5m: number;
  twap15m: number;
  priceMult: number;
  priceSource: string;
  priceStale: boolean;
  quoteMissing: boolean;
  bridgeFrozen: boolean;
  freezeReason: string;
  referenceUsd: number;
  vol5m: number;
};

/** Optional env for market-price-aware rates (Worker secrets / vars). */
export type BridgePriceEnv = {
  METRO_MINT?: string;
  METRO_DEVNET_MINT?: string;
  METRO_CHAIN_ID?: string;
  METRO_RPC?: string;
  METRO_USD_PRICE?: string;
  METRO_USD_REFERENCE?: string;
  METRO_MAINNET_ARMED?: string;
  METRO_CLUSTER?: string;
  treasuryAta?: number | null;
  poolMetroHint?: number | null;
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

  // Solana oracle — 60s cache, 15m TWAP for rates. Null quote freezes; never $1.
  let metroUsd = 0;
  let spotUsd = 0;
  let twap5m = 0;
  let twap15m = 0;
  let priceSource = "none";
  let priceStale = true;
  let quoteMissing = true;
  let bridgeFrozen = true;
  let freezeReason = "no-quote";
  let referenceUsd = 0;
  let vol5m = 0;
  try {
    const { getMetroUsdPrice } = await import("./metroPrice");
    const q = await getMetroUsdPrice({
      DB: db,
      METRO_MINT: priceEnv?.METRO_MINT,
      METRO_DEVNET_MINT: priceEnv?.METRO_DEVNET_MINT,
      METRO_CHAIN_ID: priceEnv?.METRO_CHAIN_ID,
      METRO_RPC: priceEnv?.METRO_RPC,
      METRO_CLUSTER: priceEnv?.METRO_CLUSTER,
      METRO_USD_PRICE: priceEnv?.METRO_USD_PRICE,
      METRO_USD_REFERENCE: priceEnv?.METRO_USD_REFERENCE,
      METRO_MAINNET_ARMED: priceEnv?.METRO_MAINNET_ARMED,
      treasuryAta: priceEnv?.treasuryAta,
      poolMetro: priceEnv?.poolMetroHint ?? pool,
    });
    metroUsd = q.usd;
    spotUsd = q.spot;
    twap5m = q.twap5m;
    twap15m = q.twap15m;
    priceSource = q.source;
    priceStale = q.stale;
    quoteMissing = q.quoteMissing;
    bridgeFrozen = q.bridgeFrozen;
    freezeReason = q.freezeReason ?? (q.quoteMissing ? "no-quote" : "");
    referenceUsd = q.referenceUsd;
    vol5m = q.vol5m;
  } catch {
    /* freeze — do not impersonate $1 */
  }

  const policy = resolveEconomyPolicy({
    poolMetro: pool,
    circulatingCredits: circ,
    activePlayers: players > 0 ? players : TARGET_PLAYERS,
    seedMetro: seed > 0 ? seed : METRO_DEV_SEED_METRO,
    withdrawnTodayMetro: wdToday,
    metroUsd: quoteMissing ? undefined : metroUsd,
    metroUsdReference: referenceUsd > 0 ? referenceUsd : undefined,
    spotUsd,
    twap5m,
    twap15m,
    priceSource,
    priceStale,
    quoteMissing,
    bridgeFrozen,
    freezeReason,
    vol5m,
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
    spotUsd: policy.spotUsd,
    twap5m: policy.twap5m,
    twap15m: policy.twap15m,
    priceMult: policy.priceMult,
    priceSource: policy.priceSource,
    priceStale: policy.priceStale,
    quoteMissing: policy.quoteMissing,
    bridgeFrozen: policy.bridgeFrozen,
    freezeReason: policy.freezeReason,
    referenceUsd,
    vol5m: policy.vol5m,
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
    spotUsd: live.spotUsd,
    twap5m: live.twap5m,
    twap15m: live.twap15m,
    priceMult: live.priceMult,
    priceSource: live.priceSource,
    priceStale: live.priceStale,
    quoteMissing: live.quoteMissing,
    bridgeFrozen: live.bridgeFrozen,
    freezeReason: live.freezeReason,
    metroUsdReference: live.referenceUsd,
    vol5m: live.vol5m,
    venue: "pump.fun / PumpSwap",
  };
}

/** Solana wallet (base58 32-byte). Never fold case. */
export function isValidWallet(s: string): boolean {
  return isSolanaMint((s || "").trim());
}

export interface SettleResult {
  ok: boolean;
  ref?: string; // on-chain reference (tx signature) when a real settlement happens
  reason?: string;
  metro?: number; // verified on-chain amount (deposit)
  /**
   * Payout payload for the client:
   *  - Solana live: `solana-sent:<sig>` after Worker broadcast
   *  - sim: `devnet-sim-claim:…`
   */
  claimTx?: string;
  /** Unused on Solana (EVM leftover on the Settlement seam). */
  nonce?: number;
  /**
   * Signature known before broadcast (treasury is fee-payer). Persist this
   * before sendPreparedClaim so TTL reclaim can tell landed from abandoned.
   */
  claimTxHash?: string;
  /** True when the chain RPC failed — do not treat as "tx absent". */
  rpcError?: boolean;
}

/**
 * Canonicalize a submitted claim signature. `solana-sent:<sig>` was the SPL build's
 * "Worker already broadcast" marker; it is still stripped here so a stale client (or a
 * legacy row) can never store the same payout under two spellings of the single-use
 * `tx_sig` guard.
 */
export function stripClaimPrefix(raw: string | null | undefined): string {
  const s = (typeof raw === "string" ? raw : "").trim();
  return s.startsWith("solana-sent:") ? s.slice("solana-sent:".length).trim() : s;
}

export interface Settlement {
  /** Prepare a payout. Solana signs locally and returns claimTxHash without sending. */
  buildClaim(wallet: string, metro: number): Promise<SettleResult>;
  /**
   * Broadcast a payout whose claim_tx_hash is already in D1.
   * Solana only — Worker is the sole broadcaster. Sim leaves this undefined.
   */
  sendPreparedClaim?(claimTxHash: string): Promise<SettleResult>;
  /** Verify a submitted claim landed on-chain: treasury paid exactly `metro` to `wallet`. */
  verifyClaim(txSig: string, wallet: string, metro: number): Promise<SettleResult>;
  /** Verify an on-chain deposit tx that paid `metro` into the treasury from `wallet`. */
  verifyDeposit(txSig: string, wallet: string, claimedMetro: number): Promise<SettleResult>;
  /** Unused on Solana (EVM nonce burn). */
  invalidateNonce?(nonce: number): Promise<void>;
  /** On-chain treasury ATA balance in $METRO (human units), or null if unread. */
  treasuryTokenUi?(): Promise<number | null>;
}

/** Devnet-sim settlement: simulates the chain so the off-chain accounting is fully
 *  testable headlessly. Real settlement (evm.ts) swaps in when configured. */
export const simSettlement: Settlement = {
  async buildClaim() {
    return { ok: true, claimTx: "devnet-sim-claim:" + crypto.randomUUID() };
  },
  async verifyClaim(txSig) {
    if (!txSig) return { ok: false, reason: "missing tx signature" };
    return { ok: true, ref: txSig };
  },
  async verifyDeposit(_txSig, _wallet, claimedMetro) {
    return { ok: true, metro: claimedMetro }; // trust the amount in sim; evm.ts reads it from chain
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
    spotUsd: live.spotUsd,
    twap5m: live.twap5m,
    twap15m: live.twap15m,
    priceMult: live.priceMult,
    priceSource: live.priceSource,
    priceStale: live.priceStale,
    quoteMissing: live.quoteMissing,
    bridgeFrozen: live.bridgeFrozen,
    freezeReason: live.freezeReason,
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
  if (live.bridgeFrozen || live.quoteMissing) return { ok: false, reason: POOL_EMPTY_USER_MSG };
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

  if (settlement.treasuryTokenUi) {
    const ata = await settlement.treasuryTokenUi();
    const pool = await poolMetro(db);
    if (ata != null && ata + 1e-6 < pool) return { ok: false, reason: POOL_EMPTY_USER_MSG };
  }

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

  const persistClaimHash = async (hash: string): Promise<boolean> => {
    try {
      const w = await db
        .prepare("UPDATE metro_withdrawals SET claim_tx_hash = ? WHERE id = ?")
        .bind(hash, wid)
        .run();
      return (w.meta.changes ?? 0) > 0;
    } catch {
      return false;
    }
  };

  const refundUnsent = async (reason: string): Promise<BridgeResponse> => {
    await db.prepare("UPDATE players SET credits = credits + ? WHERE id = ?").bind(credits, id).run();
    await db.prepare("UPDATE metro_withdrawals SET status = 'failed' WHERE id = ?").bind(wid).run();
    return { ok: false, reason };
  };

  // Persist the known signature BEFORE considering the payout sent. Without this
  // the TTL sweep refunds credits for tokens the treasury already moved.
  if (settle.claimTxHash) {
    const recorded = await persistClaimHash(settle.claimTxHash);
    if (!recorded) {
      return refundUnsent("cash-out ledger unavailable — credits refunded, please retry");
    }
  }

  let claimTx = settle.claimTx;
  if (settlement.sendPreparedClaim && settle.claimTxHash) {
    let hash = settle.claimTxHash;
    let sent: SettleResult = { ok: false, reason: POOL_EMPTY_USER_MSG };
    for (let i = 0; i < 4; i++) {
      sent = await settlement.sendPreparedClaim(hash);
      if (sent.ok && sent.ref) break;
      if (sent.reason === "blockhash_retry" && sent.claimTxHash) {
        const moved = await persistClaimHash(sent.claimTxHash);
        if (!moved) {
          return { ok: false, reason: "cash-out ledger unavailable — try confirm shortly" };
        }
        hash = sent.claimTxHash;
        continue;
      }
      break;
    }
    if (!sent.ok || !sent.ref) {
      if (sent.rpcError) {
        claimTx = `solana-sent:${hash}`;
      } else {
        const raw = sent.reason ?? POOL_EMPTY_USER_MSG;
        const poolish =
          raw === POOL_EMPTY_USER_MSG ||
          raw === "blockhash_retry" ||
          /treasury.*low|balance too low|Check back later|insufficient \$METRO|no \$METRO|BlockhashNotFound/i.test(
            raw,
          );
        return { ok: false, reason: poolish ? POOL_EMPTY_USER_MSG : raw };
      }
    } else {
      claimTx = `solana-sent:${sent.ref}`;
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
    claimTx,
    expiresAt: Date.now() + live.claimTtlMs,
    withdrawCreditsPerMetro: live.withdrawCreditsPerMetro,
    note: "treasury already broadcast this cash-out (you pay no SOL) — confirm shortly",
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
  // Normalize the helper prefix away before it is matched or stored. verifyClaim strips
  // it for the chain lookup, so `sig` and `solana-sent:sig` both verify — but they are
  // different strings to the single-use `tx_sig` guard below, which would let one on-chain
  // payout be recorded twice under two spellings.
  const txSig = stripClaimPrefix(args.txSig);
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

/** Refund pending claims older than the TTL when the chain proves the payout did not land. */
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
        if (!v.ok && (v.rpcError || /fetch|429|timeout|ECONN|unreachable|ENOTFOUND/i.test(v.reason ?? ""))) {
          continue;
        }
      } catch {
        continue;
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
    // Legacy nonce burn (unused on Solana). If it throws, leave the row pending.
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
  if (live.bridgeFrozen || live.quoteMissing) return { ok: false, reason: POOL_EMPTY_USER_MSG };
  const credits = metroToCreditsAt(metro, live.depositCreditsPerMetro);
  // Reject dust that would grant 0 credits (don't inflate metro ledger with Math.max(1,…)).
  if (credits < 1) return { ok: false, reason: "deposit too small — need more $METRO for 1 credit at current rate" };

  // Exactly one side is funded — see `want` above. ◈ tracks whole units so a
  // sub-1 deposit can't invent one.
  const grantedCredits = want === "credits" ? credits : 0;
  // floor, not round: rounding up handed out a ◈ that was never deposited (100.5 → 101).
  const grantedMetro = want === "metro" ? Math.max(0, Math.floor(metro)) : 0;

  // CLAIM-ONCE: tx_sig is the PRIMARY KEY, so a transfer can only ever credit once.
  // Record what was actually GRANTED, not what it would have been worth as credits —
  // player_treasury bootstraps lifetime totals from this row.
  // One transaction: D1 batches are transactional and sequential, so changes() gates the
  // payout on the claim insert (same idiom as lockPvpEscrow). As two auto-committed
  // statements, an isolate death between them burned the tx_sig while crediting nothing —
  // the player's real on-chain deposit was lost, and every retry answered "already
  // claimed". changes()=0 on a replayed tx_sig keeps the credit from being granted twice.
  const [claim] = await db.batch([
    db
      .prepare("INSERT OR IGNORE INTO metro_deposits (tx_sig, player, wallet, metro, credits, created_at) VALUES (?,?,?,?,?,?)")
      .bind(txSig, id, wallet, metro, grantedCredits, Date.now()),
    db
      .prepare("UPDATE players SET credits = credits + ?, metro = metro + ? WHERE id = ? AND changes()=1")
      .bind(grantedCredits, grantedMetro, id),
  ]);
  if (claim.meta.changes === 0) return { ok: false, reason: "deposit already claimed" };
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
