// $METRO market USD oracle for Robinhood / EVM.
//
// Every bridge rate (credits per $METRO) is scaled by marketUsd / REFERENCE_USD
// so deposits and cash-outs track the real token value once a CA is listed.
// Quotes are cached in D1 and refreshed at most every 30 minutes (cron + on-demand).

import type { D1Database } from "@cloudflare/workers-types";

/** Design reference: rates in economyPolicy assume ~$1 per $METRO at launch. */
export const METRO_USD_REFERENCE = 1.0;

/** How long a cached quote stays "fresh" before a network refresh is attempted. */
export const METRO_PRICE_TTL_MS = 30 * 60_000;

/** Floor / ceiling on the price mult so a bad quote can't nuke or explode the economy. */
export const METRO_PRICE_MULT_MIN = 0.25;
export const METRO_PRICE_MULT_MAX = 8;

export type MetroPriceQuote = {
  usd: number;
  source: string;
  mint: string | null;
  chainId: number | null;
  fetchedAt: number;
  /** True when we used a quote older than TTL (network failed). */
  stale: boolean;
  /** True when this is the design reference, not a market print. */
  isReference: boolean;
};

export type MetroPriceEnv = {
  DB: D1Database;
  METRO_MINT?: string;
  METRO_DEVNET_MINT?: string;
  METRO_CHAIN_ID?: string;
  METRO_RPC?: string;
  /** Manual override (ops / pre-listing). Takes priority over network. */
  METRO_USD_PRICE?: string;
  METRO_MAINNET_ARMED?: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function mintOf(env: MetroPriceEnv): string {
  return (env.METRO_MINT || env.METRO_DEVNET_MINT || "").trim();
}

function chainIdOf(env: MetroPriceEnv): number {
  if (env.METRO_CHAIN_ID) {
    const n = parseInt(env.METRO_CHAIN_ID, 10);
    if (Number.isFinite(n)) return n;
  }
  if (/testnet\.chain\.robinhood/i.test(env.METRO_RPC || "")) return 46630;
  // Robinhood mainnet is the default settlement network.
  return 4663;
}

/** Multiplier applied to base deposit/withdraw credit rates. */
export function priceMultiplier(usd: number, ref = METRO_USD_REFERENCE): number {
  if (!Number.isFinite(usd) || usd <= 0) return 1;
  const r = ref > 0 ? ref : 1;
  return clamp(usd / r, METRO_PRICE_MULT_MIN, METRO_PRICE_MULT_MAX);
}

const REFERENCE_QUOTE = (now = Date.now()): MetroPriceQuote => ({
  usd: METRO_USD_REFERENCE,
  source: "reference",
  mint: null,
  chainId: null,
  fetchedAt: now,
  stale: false,
  isReference: true,
});

async function readCache(db: D1Database): Promise<MetroPriceQuote | null> {
  try {
    const row = await db
      .prepare("SELECT usd, source, mint, chain_id, fetched_at FROM metro_price WHERE id = 1")
      .first<{ usd: number; source: string; mint: string | null; chain_id: number | null; fetched_at: number }>();
    if (!row || !(row.usd > 0) || !row.fetched_at) return null;
    const age = Date.now() - row.fetched_at;
    return {
      usd: row.usd,
      source: row.source || "cache",
      mint: row.mint,
      chainId: row.chain_id,
      fetchedAt: row.fetched_at,
      stale: age > METRO_PRICE_TTL_MS,
      isReference: row.source === "bootstrap" || row.source === "reference",
    };
  } catch {
    return null;
  }
}

async function writeCache(
  db: D1Database,
  q: { usd: number; source: string; mint: string | null; chainId: number | null; raw?: string },
): Promise<void> {
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
      .bind(q.usd, q.source, q.mint, q.chainId, Date.now(), q.raw ?? null)
      .run();
  } catch {
    /* migration not applied yet — rates still compute in-memory */
  }
}

function parseUsd(n: unknown): number | null {
  const v = typeof n === "string" ? parseFloat(n) : typeof n === "number" ? n : NaN;
  if (!Number.isFinite(v) || v <= 0 || v > 1_000_000) return null;
  return v;
}

/** DexScreener — best effort multi-chain token price. */
async function fetchDexScreener(mint: string): Promise<{ usd: number; raw: string } | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      headers: { accept: "application/json" },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      pairs?: Array<{ priceUsd?: string; liquidity?: { usd?: number }; chainId?: string }>;
    };
    const pairs = (j.pairs ?? []).filter((p) => parseUsd(p.priceUsd));
    if (!pairs.length) return null;
    // Prefer highest liquidity pair
    pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const usd = parseUsd(pairs[0].priceUsd);
    if (usd == null) return null;
    return { usd, raw: JSON.stringify({ source: "dexscreener", pair: pairs[0] }).slice(0, 2000) };
  } catch {
    return null;
  }
}

/** GeckoTerminal token endpoint (network slug guess for Robinhood / generic). */
async function fetchGeckoTerminal(mint: string, chainId: number): Promise<{ usd: number; raw: string } | null> {
  // Known / likely network slugs — GT uses kebab names.
  const nets =
    chainId === 4663
      ? ["robinhood-chain", "robinhood", "rh"]
      : chainId === 46630
        ? ["robinhood-chain-testnet", "robinhood-testnet"]
        : ["eth", "arbitrum", "base"];
  for (const net of nets) {
    try {
      const r = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${mint.toLowerCase()}`,
        { headers: { accept: "application/json" } },
      );
      if (!r.ok) continue;
      const j = (await r.json()) as {
        data?: { attributes?: { price_usd?: string } };
      };
      const usd = parseUsd(j.data?.attributes?.price_usd);
      if (usd == null) continue;
      return { usd, raw: JSON.stringify({ source: "geckoterminal", net }).slice(0, 2000) };
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Pull a live USD print. Order: env override → DexScreener → GeckoTerminal.
 * Returns null if nothing usable (caller keeps cache / reference).
 */
export async function fetchMarketUsd(
  mint: string,
  chainId: number,
  envPrice?: string,
): Promise<{ usd: number; source: string; raw?: string } | null> {
  const forced = parseUsd(envPrice);
  if (forced != null) return { usd: forced, source: "env:METRO_USD_PRICE" };

  if (!/^0x[a-fA-F0-9]{40}$/i.test(mint)) return null;

  const dex = await fetchDexScreener(mint);
  if (dex) return { usd: dex.usd, source: "dexscreener", raw: dex.raw };

  const gt = await fetchGeckoTerminal(mint, chainId);
  if (gt) return { usd: gt.usd, source: "geckoterminal", raw: gt.raw };

  return null;
}

/**
 * Resolve the USD price used for bridge rates.
 * - Fresh cache (<30m) → use it
 * - Stale / missing → network fetch; on failure keep stale or reference
 * - No mint → reference $1
 */
export async function getMetroUsdPrice(env: MetroPriceEnv, opts?: { forceRefresh?: boolean }): Promise<MetroPriceQuote> {
  const mint = mintOf(env);
  const chainId = chainIdOf(env);
  const now = Date.now();

  // Ops override always wins (and is cached for observability).
  const forced = parseUsd(env.METRO_USD_PRICE);
  if (forced != null) {
    const q: MetroPriceQuote = {
      usd: forced,
      source: "env:METRO_USD_PRICE",
      mint: mint || null,
      chainId,
      fetchedAt: now,
      stale: false,
      isReference: false,
    };
    await writeCache(env.DB, { usd: q.usd, source: q.source, mint: q.mint, chainId: q.chainId });
    return q;
  }

  if (!mint || !/^0x[a-fA-F0-9]{40}$/i.test(mint)) {
    return REFERENCE_QUOTE(now);
  }

  const cached = await readCache(env.DB);
  if (cached && !cached.stale && !opts?.forceRefresh && cached.mint?.toLowerCase() === mint.toLowerCase()) {
    return cached;
  }

  const market = await fetchMarketUsd(mint, chainId, env.METRO_USD_PRICE);
  if (market) {
    await writeCache(env.DB, {
      usd: market.usd,
      source: market.source,
      mint,
      chainId,
      raw: market.raw,
    });
    return {
      usd: market.usd,
      source: market.source,
      mint,
      chainId,
      fetchedAt: now,
      stale: false,
      isReference: false,
    };
  }

  // Network miss — keep last good quote if we have one for this mint.
  if (cached && cached.mint?.toLowerCase() === mint.toLowerCase() && cached.usd > 0 && !cached.isReference) {
    return { ...cached, stale: true };
  }

  return {
    ...REFERENCE_QUOTE(now),
    mint,
    chainId,
    source: "reference-awaiting-listing",
  };
}

/**
 * Cron / hot path: refresh if cache is older than TTL. Cheap no-op when fresh.
 */
export async function maybeRefreshMetroPrice(env: MetroPriceEnv): Promise<MetroPriceQuote> {
  const cached = await readCache(env.DB);
  if (cached && !cached.stale && Date.now() - cached.fetchedAt < METRO_PRICE_TTL_MS) {
    return cached;
  }
  return getMetroUsdPrice(env, { forceRefresh: true });
}
