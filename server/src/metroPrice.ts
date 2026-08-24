// $METRO Solana oracle (Jupiter → DexScreener → Gecko → pump.fun curve).
//
// Rates use 15m TWAP. HUD may show spot. A null quote never becomes $1 —
// the bridge freezes instead. Base58 mints are never lowercased.

import type { D1Database } from "@cloudflare/workers-types";
import {
  METRO_PRICE_MULT_MAX,
  METRO_PRICE_MULT_MIN,
  REFERENCE_USD_FLOOR,
  metroPriceMultiplier,
} from "../../src/game/economyPolicy";

export { METRO_PRICE_MULT_MAX, METRO_PRICE_MULT_MIN };

/** USDC mint on Solana mainnet — Jupiter vsToken. Never fold case. */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const PUMPFUN_VENUE = "pump.fun / PumpSwap";

/** Refresh cadence. Cloudflare cron minimum is 60s (`* * * * *`). */
export const METRO_PRICE_TTL_MS = 60_000;
export const TWAP_5M_MS = 5 * 60_000;
export const TWAP_15M_MS = 15 * 60_000;
export const STALE_QUOTE_MS = 3 * 60_000;
export const SPOT_JUMP_FRAC = 0.4;
export const TWAP_DIVERGE_FRAC = 0.6;
export const ATA_POOL_DIVERGE_FRAC = 0.2;
export const THAW_STABLE_QUOTES = 3;
export const REFERENCE_STABLE_MS = 15 * 60_000;
export const SAMPLE_KEEP = 20;

/** @deprecated Launch reference is frozen from TWAP, not a forever $1 print. */
export const METRO_USD_REFERENCE = 1.0;

export type PriceSample = { t: number; usd: number };

export type MetroPriceQuote = {
  usd: number;
  spot: number;
  twap5m: number;
  twap15m: number;
  source: string;
  mint: string | null;
  chainId: number | null;
  fetchedAt: number;
  prevSpot: number;
  stale: boolean;
  isReference: boolean;
  quoteMissing: boolean;
  bridgeFrozen: boolean;
  freezeReason: string | null;
  stableQuotes: number;
  referenceUsd: number;
  vol5m: number;
};

export type OracleState = {
  spot: number;
  prevSpot: number;
  twap5m: number;
  twap15m: number;
  fetchedAt: number;
  source: string;
  mint: string | null;
  samples: PriceSample[];
  referenceUsd: number;
  referenceFrozenAt: number;
  bridgeFrozen: boolean;
  freezeReason: string | null;
  stableQuotes: number;
  stale: boolean;
  quoteMissing: boolean;
  vol5m: number;
};

export type MetroPriceEnv = {
  DB: D1Database;
  METRO_MINT?: string;
  METRO_DEVNET_MINT?: string;
  METRO_CHAIN_ID?: string;
  METRO_RPC?: string;
  METRO_CLUSTER?: string;
  /** Manual override (ops / pre-listing). Takes priority over network. */
  METRO_USD_PRICE?: string;
  /** Ops-set launch reference. Frozen immediately when > 0. */
  METRO_USD_REFERENCE?: string;
  METRO_MAINNET_ARMED?: string;
  /** Optional ATA vs D1 pool circuit-breaker inputs. */
  treasuryAta?: number | null;
  poolMetro?: number | null;
  now?: number;
};

function mintOf(env: MetroPriceEnv): string {
  return (env.METRO_MINT || env.METRO_DEVNET_MINT || "").trim();
}

function isEvmMint(mint: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(mint);
}

/** True for Solana-shaped base58. Never lowercase these. */
export function isBase58Mint(mint: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) && !isEvmMint(mint);
}

function mintEq(a: string | null | undefined, mint: string): boolean {
  if (!a || !mint) return false;
  if (isEvmMint(mint) && isEvmMint(a)) return a.toLowerCase() === mint.toLowerCase();
  return a === mint;
}

export function priceMultiplier(usd: number, ref = METRO_USD_REFERENCE): number | null {
  return metroPriceMultiplier(usd, ref);
}

export function parseUsd(n: unknown): number | null {
  const v = typeof n === "string" ? parseFloat(n) : typeof n === "number" ? n : NaN;
  if (!Number.isFinite(v) || v <= 0 || v > 1_000_000) return null;
  return v;
}

export function emptyOracleState(): OracleState {
  return {
    spot: 0,
    prevSpot: 0,
    twap5m: 0,
    twap15m: 0,
    fetchedAt: 0,
    source: "none",
    mint: null,
    samples: [],
    referenceUsd: 0,
    referenceFrozenAt: 0,
    bridgeFrozen: true,
    freezeReason: "no-quote",
    stableQuotes: 0,
    stale: true,
    quoteMissing: true,
    vol5m: 0,
  };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function twapOf(samples: PriceSample[], windowMs: number, now: number): number {
  const win = samples.filter((s) => s.usd > 0 && now - s.t <= windowMs && s.t <= now);
  if (!win.length) return 0;
  return mean(win.map((s) => s.usd));
}

export function realizedVol(samples: PriceSample[], windowMs: number, now: number): number {
  const win = samples
    .filter((s) => s.usd > 0 && now - s.t <= windowMs && s.t <= now)
    .sort((a, b) => a.t - b.t);
  if (win.length < 3) return 0;
  const rets: number[] = [];
  for (let i = 1; i < win.length; i++) {
    const prev = win[i - 1].usd;
    if (prev > 0) rets.push((win[i].usd - prev) / prev);
  }
  if (rets.length < 2) return 0;
  const m = mean(rets);
  const v = mean(rets.map((r) => (r - m) ** 2));
  return Math.sqrt(v);
}

function relMove(a: number, b: number): number {
  if (!(a > 0) || !(b > 0)) return 0;
  return Math.abs(a - b) / b;
}

export type ShockReason = "stale" | "spot-jump" | "twap-diverge" | "ata-pool" | "no-quote" | null;

export function evaluateCircuitBreaker(args: {
  spot: number;
  prevSpot: number;
  twap15m: number;
  fetchedAt: number;
  now: number;
  quoteMissing: boolean;
  treasuryAta?: number | null;
  poolMetro?: number | null;
  holdAtaPool?: boolean;
}): ShockReason {
  if (args.quoteMissing || !(args.spot > 0)) return "no-quote";
  if (!(args.fetchedAt > 0) || args.now - args.fetchedAt > STALE_QUOTE_MS) return "stale";
  if (args.prevSpot > 0 && relMove(args.spot, args.prevSpot) > SPOT_JUMP_FRAC) return "spot-jump";
  if (args.twap15m > 0 && relMove(args.spot, args.twap15m) > TWAP_DIVERGE_FRAC) return "twap-diverge";
  const ata = args.treasuryAta;
  const pool = args.poolMetro;
  if (args.holdAtaPool && (ata == null || !Number.isFinite(ata))) return "ata-pool";
  if (ata != null && pool != null && pool > 0 && Number.isFinite(ata) && ata + 1e-9 < pool * (1 - ATA_POOL_DIVERGE_FRAC)) {
    return "ata-pool";
  }
  return null;
}

export function ingestQuote(
  prev: OracleState,
  quote: { usd: number; source: string } | null,
  now: number,
  opts?: {
    treasuryAta?: number | null;
    poolMetro?: number | null;
    opsReference?: number | null;
    /** Re-evaluate freeze without treating this as a new 60s sample. */
    reuseCache?: boolean;
  },
): OracleState {
  const next: OracleState = {
    ...prev,
    samples: prev.samples.slice(),
  };

  if (quote && quote.usd > 0) {
    if (!opts?.reuseCache) {
      next.prevSpot = prev.spot > 0 ? prev.spot : quote.usd;
      next.spot = quote.usd;
      next.source = quote.source;
      next.fetchedAt = now;
      next.samples.push({ t: now, usd: quote.usd });
    }
    next.quoteMissing = false;
    next.stale = now - next.fetchedAt > METRO_PRICE_TTL_MS;
  } else {
    next.quoteMissing = !(prev.spot > 0 || prev.twap15m > 0);
    next.stale = true;
    if (!next.quoteMissing) next.source = prev.source ? `${prev.source}+stale` : "stale";
    else next.source = "none";
  }

  next.samples = next.samples.filter((s) => now - s.t <= TWAP_15M_MS + METRO_PRICE_TTL_MS).slice(-SAMPLE_KEEP);
  next.twap5m = twapOf(next.samples, TWAP_5M_MS, now);
  next.twap15m = twapOf(next.samples, TWAP_15M_MS, now);
  if (!(next.twap15m > 0) && next.spot > 0) next.twap15m = next.spot;
  if (!(next.twap5m > 0) && next.spot > 0) next.twap5m = next.spot;
  next.vol5m = realizedVol(next.samples, TWAP_5M_MS, now);

  const shock = evaluateCircuitBreaker({
    spot: next.spot,
    prevSpot: next.prevSpot,
    twap15m: next.twap15m,
    fetchedAt: next.fetchedAt,
    now,
    quoteMissing: next.quoteMissing || !(next.spot > 0),
    treasuryAta: opts?.treasuryAta,
    poolMetro: opts?.poolMetro,
    holdAtaPool: prev.freezeReason === "ata-pool",
  });

  if (shock) {
    next.bridgeFrozen = true;
    next.freezeReason = shock;
    next.stableQuotes = 0;
  } else if (prev.bridgeFrozen) {
    if (opts?.reuseCache) {
      next.bridgeFrozen = true;
      next.freezeReason = prev.freezeReason;
      next.stableQuotes = prev.stableQuotes || 0;
    } else {
      next.stableQuotes = (prev.stableQuotes || 0) + 1;
      next.freezeReason = prev.freezeReason;
      if (next.stableQuotes >= THAW_STABLE_QUOTES) {
        next.bridgeFrozen = false;
        next.freezeReason = null;
        next.stableQuotes = 0;
      } else {
        next.bridgeFrozen = true;
      }
    }
  } else {
    next.bridgeFrozen = false;
    next.freezeReason = null;
    next.stableQuotes = 0;
  }

  const opsRef = opts?.opsReference;
  if (opsRef != null && opsRef > 0) {
    next.referenceUsd = Math.max(REFERENCE_USD_FLOOR, opsRef);
    next.referenceFrozenAt = next.referenceFrozenAt || now;
  } else if (!next.referenceFrozenAt && !next.bridgeFrozen && next.twap15m > 0) {
    const started = prev.referenceFrozenAt < 0 ? -prev.referenceFrozenAt : 0;
    // Use negative referenceFrozenAt as "stable-since" sentinel while collecting.
    const stableSince = started > 0 ? started : now;
    if (now - stableSince >= REFERENCE_STABLE_MS) {
      next.referenceUsd = Math.max(REFERENCE_USD_FLOOR, next.twap15m);
      next.referenceFrozenAt = now;
    } else {
      next.referenceFrozenAt = -stableSince;
      next.referenceUsd = 0;
    }
  } else if (next.bridgeFrozen && next.referenceFrozenAt < 0) {
    // Freeze interrupted the 15m window — restart after thaw.
    next.referenceFrozenAt = 0;
    next.referenceUsd = 0;
  }

  return next;
}

/** Effective reference for priceMult: frozen launch ref, else current TWAP (neutral). */
export function effectiveReference(state: OracleState): number {
  if (state.referenceUsd > 0 && state.referenceFrozenAt > 0) return state.referenceUsd;
  if (state.twap15m > 0) return state.twap15m;
  return 0;
}

/** Rate USD: 15m TWAP, else spot. 0 if missing — never $1. */
export function rateUsd(state: OracleState): number {
  if (state.twap15m > 0) return state.twap15m;
  if (state.spot > 0) return state.spot;
  return 0;
}

function quoteFromState(state: OracleState, mint: string | null, chainId: number | null): MetroPriceQuote {
  const usd = rateUsd(state);
  return {
    usd,
    spot: state.spot,
    twap5m: state.twap5m,
    twap15m: state.twap15m,
    source: state.source,
    mint,
    chainId,
    fetchedAt: state.fetchedAt,
    prevSpot: state.prevSpot,
    stale: state.stale,
    isReference: false,
    quoteMissing: state.quoteMissing || !(usd > 0),
    bridgeFrozen: state.bridgeFrozen || state.quoteMissing || !(usd > 0),
    freezeReason: state.freezeReason,
    stableQuotes: state.stableQuotes,
    referenceUsd: effectiveReference(state),
    vol5m: state.vol5m,
  };
}

async function readCache(db: D1Database): Promise<OracleState | null> {
  try {
    const row = await db
      .prepare(
        `SELECT usd, source, mint, chain_id, fetched_at, spot, twap_5m, twap_15m, prev_spot,
                reference_usd, reference_frozen_at, bridge_frozen, freeze_reason, stable_quotes, samples
         FROM metro_price WHERE id = 1`,
      )
      .first<{
        usd: number;
        source: string;
        mint: string | null;
        chain_id: number | null;
        fetched_at: number;
        spot: number | null;
        twap_5m: number | null;
        twap_15m: number | null;
        prev_spot: number | null;
        reference_usd: number | null;
        reference_frozen_at: number | null;
        bridge_frozen: number | null;
        freeze_reason: string | null;
        stable_quotes: number | null;
        samples: string | null;
      }>();
    if (!row) return null;
    if (!row.fetched_at || row.source === "bootstrap" || row.source === "reference") return null;
    let samples: PriceSample[] = [];
    try {
      const parsed = row.samples ? JSON.parse(row.samples) : [];
      if (Array.isArray(parsed)) {
        samples = parsed
          .map((s: { t?: number; usd?: number; u?: number }) => ({
            t: Number(s.t) || 0,
            usd: Number(s.usd ?? s.u) || 0,
          }))
          .filter((s: PriceSample) => s.t > 0 && s.usd > 0);
      }
    } catch {
      samples = [];
    }
    const spot = row.spot && row.spot > 0 ? row.spot : row.usd > 0 ? row.usd : 0;
    return {
      spot,
      prevSpot: row.prev_spot && row.prev_spot > 0 ? row.prev_spot : spot,
      twap5m: row.twap_5m && row.twap_5m > 0 ? row.twap_5m : spot,
      twap15m: row.twap_15m && row.twap_15m > 0 ? row.twap_15m : row.usd > 0 ? row.usd : spot,
      fetchedAt: row.fetched_at,
      source: row.source || "cache",
      mint: row.mint,
      samples,
      referenceUsd: row.reference_usd && row.reference_usd > 0 ? row.reference_usd : 0,
      referenceFrozenAt: row.reference_frozen_at ?? 0,
      bridgeFrozen: !!row.bridge_frozen,
      freezeReason: row.freeze_reason,
      stableQuotes: row.stable_quotes ?? 0,
      stale: Date.now() - row.fetched_at > METRO_PRICE_TTL_MS,
      quoteMissing: !(spot > 0),
      vol5m: realizedVol(samples, TWAP_5M_MS, Date.now()),
    };
  } catch {
    try {
      const row = await db
        .prepare("SELECT usd, source, mint, chain_id, fetched_at FROM metro_price WHERE id = 1")
        .first<{ usd: number; source: string; mint: string | null; chain_id: number | null; fetched_at: number }>();
      if (!row || !row.fetched_at || !(row.usd > 0)) return null;
      if (row.source === "bootstrap" || row.source === "reference") return null;
      return {
        spot: row.usd,
        prevSpot: row.usd,
        twap5m: row.usd,
        twap15m: row.usd,
        fetchedAt: row.fetched_at,
        source: row.source || "cache",
        mint: row.mint,
        samples: [{ t: row.fetched_at, usd: row.usd }],
        referenceUsd: 0,
        referenceFrozenAt: 0,
        bridgeFrozen: true,
        freezeReason: "no-quote",
        stableQuotes: 0,
        stale: Date.now() - row.fetched_at > METRO_PRICE_TTL_MS,
        quoteMissing: false,
        vol5m: 0,
      };
    } catch {
      return null;
    }
  }
}

async function writeCache(db: D1Database, state: OracleState, mint: string | null, chainId: number | null, raw?: string): Promise<void> {
  const usd = rateUsd(state);
  const samples = JSON.stringify(state.samples.map((s) => ({ t: s.t, usd: s.usd }))).slice(0, 8000);
  try {
    await db
      .prepare(
        `INSERT INTO metro_price (
           id, usd, source, mint, chain_id, fetched_at, raw,
           spot, twap_5m, twap_15m, prev_spot, reference_usd, reference_frozen_at,
           bridge_frozen, freeze_reason, stable_quotes, samples
         ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           usd = excluded.usd,
           source = excluded.source,
           mint = excluded.mint,
           chain_id = excluded.chain_id,
           fetched_at = excluded.fetched_at,
           raw = excluded.raw,
           spot = excluded.spot,
           twap_5m = excluded.twap_5m,
           twap_15m = excluded.twap_15m,
           prev_spot = excluded.prev_spot,
           reference_usd = excluded.reference_usd,
           reference_frozen_at = excluded.reference_frozen_at,
           bridge_frozen = excluded.bridge_frozen,
           freeze_reason = excluded.freeze_reason,
           stable_quotes = excluded.stable_quotes,
           samples = excluded.samples`,
      )
      .bind(
        usd,
        state.source,
        mint,
        chainId,
        state.fetchedAt || Date.now(),
        raw ?? null,
        state.spot,
        state.twap5m,
        state.twap15m,
        state.prevSpot,
        state.referenceUsd,
        state.referenceFrozenAt,
        state.bridgeFrozen ? 1 : 0,
        state.freezeReason,
        state.stableQuotes,
        samples,
      )
      .run();
  } catch {
    try {
      await db
        .prepare(
          `INSERT INTO metro_price (id, usd, source, mint, chain_id, fetched_at, raw)
           VALUES (1, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             usd = excluded.usd,
             source = excluded.source,
             mint = excluded.mint,
             chain_id = excluded.chain_id,
             fetched_at = excluded.fetched_at,
             raw = excluded.raw`,
        )
        .bind(usd, state.source, mint, chainId, state.fetchedAt || Date.now(), raw ?? null)
        .run();
    } catch {
      /* migration not applied — rates still compute in-memory */
    }
  }
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const ac = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(8_000) : undefined;
    const r = await fetch(url, { headers: { accept: "application/json" }, signal: ac });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Jupiter Price API v2 vs USDC. Mint case preserved. */
export async function fetchJupiterUsd(mint: string): Promise<{ usd: number; raw: string } | null> {
  if (!mint) return null;
  const urls = [
    `https://lite-api.jup.ag/price/v2?ids=${mint}&vsToken=${USDC_MINT}`,
    `https://api.jup.ag/price/v2?ids=${mint}&vsToken=${USDC_MINT}`,
  ];
  for (const url of urls) {
    const j = (await fetchJson(url)) as {
      data?: Record<string, { price?: string | number; usdPrice?: string | number } | null>;
    } | null;
    if (!j?.data) continue;
    const row = j.data[mint];
    const usd = parseUsd(row?.price ?? row?.usdPrice);
    if (usd == null) continue;
    return { usd, raw: JSON.stringify({ source: "jupiter", vsToken: "USDC" }).slice(0, 2000) };
  }
  return null;
}

/** DexScreener — Solana pair with highest USD liquidity. */
export async function fetchDexScreener(mint: string): Promise<{ usd: number; raw: string } | null> {
  if (!mint) return null;
  const j = (await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)) as {
    pairs?: Array<{ priceUsd?: string; liquidity?: { usd?: number }; chainId?: string }>;
  } | null;
  if (!j) return null;
  const pairs = (j.pairs ?? []).filter(
    (p) => (p.chainId || "").toLowerCase() === "solana" && parseUsd(p.priceUsd),
  );
  if (!pairs.length) return null;
  pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const usd = parseUsd(pairs[0].priceUsd);
  if (usd == null) return null;
  return { usd, raw: JSON.stringify({ source: "dexscreener", pair: pairs[0] }).slice(0, 2000) };
}

/** GeckoTerminal `networks/solana` — never lowercase a base58 mint. */
export async function fetchGeckoTerminal(mint: string): Promise<{ usd: number; raw: string } | null> {
  if (!mint) return null;
  const token = isEvmMint(mint) ? mint.toLowerCase() : mint;
  const j = (await fetchJson(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${token}`)) as {
    data?: { attributes?: { price_usd?: string } };
  } | null;
  const usd = parseUsd(j?.data?.attributes?.price_usd);
  if (usd == null) return null;
  return { usd, raw: JSON.stringify({ source: "geckoterminal", net: "solana" }).slice(0, 2000) };
}

/** pump.fun bonding-curve quote while pre-graduation. */
export async function fetchPumpFunCurve(mint: string): Promise<{ usd: number; raw: string } | null> {
  if (!mint) return null;
  const urls = [`https://frontend-api-v3.pump.fun/coins/${mint}`, `https://frontend-api.pump.fun/coins/${mint}`];
  for (const url of urls) {
    const j = (await fetchJson(url)) as {
      complete?: boolean;
      raydium_pool?: string | null;
      usd_market_cap?: number | string;
      market_cap?: number | string;
      total_supply?: number | string;
      price_usd?: number | string;
      usd_price?: number | string;
    } | null;
    if (!j) continue;
    if (j.complete === true || (typeof j.raydium_pool === "string" && j.raydium_pool.length > 0)) continue;
    const direct = parseUsd(j.price_usd ?? j.usd_price);
    if (direct != null) {
      return { usd: direct, raw: JSON.stringify({ source: "pump.fun" }).slice(0, 2000) };
    }
    const mcap = parseUsd(j.usd_market_cap);
    let supplyRaw = typeof j.total_supply === "string" ? parseFloat(j.total_supply) : Number(j.total_supply);
    if (!(supplyRaw > 0)) supplyRaw = 1_000_000_000;
    // pump.fun reports raw token atoms (1B × 1e6 = 1e15). Human supply is 1e9.
    const supply = supplyRaw > 1e12 ? supplyRaw / 1e6 : supplyRaw;
    if (mcap != null && supply > 0) {
      const usd = parseUsd(mcap / supply);
      if (usd != null) return { usd, raw: JSON.stringify({ source: "pump.fun", mcap, supply }).slice(0, 2000) };
    }
  }
  return null;
}

/**
 * Pull a live USD print. Order: env override → Jupiter vs USDC → DexScreener (solana)
 * → Gecko solana → pump.fun curve. Returns null if nothing usable.
 */
export async function fetchMarketUsd(
  mint: string,
  _chainId?: number,
  envPrice?: string,
): Promise<{ usd: number; source: string; raw?: string } | null> {
  const forced = parseUsd(envPrice);
  if (forced != null) return { usd: forced, source: "env:METRO_USD_PRICE" };
  if (!mint) return null;

  const jup = await fetchJupiterUsd(mint);
  if (jup) return { usd: jup.usd, source: "jupiter", raw: jup.raw };

  const dex = await fetchDexScreener(mint);
  if (dex) return { usd: dex.usd, source: "dexscreener", raw: dex.raw };

  const gt = await fetchGeckoTerminal(mint);
  if (gt) return { usd: gt.usd, source: "geckoterminal", raw: gt.raw };

  const pump = await fetchPumpFunCurve(mint);
  if (pump) return { usd: pump.usd, source: "pump.fun", raw: pump.raw };

  return null;
}

function chainIdOf(env: MetroPriceEnv): number | null {
  if (env.METRO_CHAIN_ID) {
    const n = parseInt(env.METRO_CHAIN_ID, 10);
    if (Number.isFinite(n)) return n;
  }
  const cluster = (env.METRO_CLUSTER || "").toLowerCase();
  if (cluster === "devnet") return 103;
  if (cluster.includes("mainnet") || !cluster) return 101;
  return null;
}

/**
 * Resolve the USD quote used for bridge rates (15m TWAP).
 * Missing quotes freeze the bridge. Bootstrap $1 rows are ignored.
 */
export async function getMetroUsdPrice(env: MetroPriceEnv, opts?: { forceRefresh?: boolean }): Promise<MetroPriceQuote> {
  const mint = mintOf(env);
  const chainId = chainIdOf(env);
  const now = env.now ?? Date.now();
  const cached = await readCache(env.DB);
  const prev =
    cached && (!mint || !cached.mint || mintEq(cached.mint, mint)) ? cached : emptyOracleState();

  const forced = parseUsd(env.METRO_USD_PRICE);
  const opsRef = parseUsd(env.METRO_USD_REFERENCE);
  const cacheAge = prev.fetchedAt > 0 ? now - prev.fetchedAt : Number.POSITIVE_INFINITY;
  const needFetch = !!opts?.forceRefresh || cacheAge >= METRO_PRICE_TTL_MS || forced != null;

  let market: { usd: number; source: string; raw?: string } | null = null;
  if (forced != null) {
    market = { usd: forced, source: "env:METRO_USD_PRICE" };
  } else if (needFetch && mint) {
    market = await fetchMarketUsd(mint, chainId ?? 101, env.METRO_USD_PRICE);
  } else if (!needFetch && prev.spot > 0) {
    market = { usd: prev.spot, source: prev.source.replace(/\+stale$/, "") };
  }

  const reused = !forced && !needFetch && !!market;
  const next = ingestQuote(prev, market, now, {
    treasuryAta: env.treasuryAta,
    poolMetro: env.poolMetro,
    opsReference: opsRef,
    reuseCache: reused,
  });
  next.mint = mint || prev.mint;

  await writeCache(env.DB, next, mint || null, chainId, market?.raw);
  return quoteFromState(next, mint || null, chainId);
}

/** Cron / hot path: refresh if cache is older than 60s. */
export async function maybeRefreshMetroPrice(env: MetroPriceEnv): Promise<MetroPriceQuote> {
  const cached = await readCache(env.DB);
  const now = env.now ?? Date.now();
  if (cached && cached.fetchedAt > 0 && now - cached.fetchedAt < METRO_PRICE_TTL_MS && !cached.quoteMissing) {
    const q = await getMetroUsdPrice({ ...env, now }, { forceRefresh: false });
    return q;
  }
  return getMetroUsdPrice(env, { forceRefresh: true });
}

