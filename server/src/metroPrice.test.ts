import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchMarketUsd,
  priceMultiplier,
  ingestQuote,
  emptyOracleState,
  evaluateCircuitBreaker,
  METRO_PRICE_MULT_MIN,
  METRO_PRICE_MULT_MAX,
  USDC_MINT,
  THAW_STABLE_QUOTES,
  SPOT_JUMP_FRAC,
  TWAP_DIVERGE_FRAC,
} from "./metroPrice";

const SPL_MINT = "So11111111111111111111111111111111111111112";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => { ok?: boolean; body?: unknown } | null) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(String(url));
      const r = handler(String(url));
      if (!r || r.ok === false) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => r.body ?? {} };
    }),
  );
  return urls;
}

describe("priceMultiplier", () => {
  it("does not treat a null/zero quote as $1", () => {
    expect(priceMultiplier(0)).toBeNull();
    expect(priceMultiplier(NaN)).toBeNull();
    expect(priceMultiplier(-1)).toBeNull();
  });

  it("clamps TWAP/reference into 0.05–20", () => {
    expect(priceMultiplier(0.0001, 1)).toBe(METRO_PRICE_MULT_MIN);
    expect(priceMultiplier(999_999, 1)).toBe(METRO_PRICE_MULT_MAX);
    expect(priceMultiplier(2, 1)).toBe(2);
  });
});

describe("fetchMarketUsd — Solana, no lowercase mint", () => {
  it("lets an ops override win over the network", async () => {
    stubFetch(() => ({ ok: true, body: { data: { [SPL_MINT]: { price: "9" } } } }));
    const q = await fetchMarketUsd(SPL_MINT, 101, "0.75");
    expect(q).toEqual({ usd: 0.75, source: "env:METRO_USD_PRICE" });
  });

  it("hits Jupiter Price API v2 vs USDC first and preserves mint case", async () => {
    const urls = stubFetch((url) => {
      if (url.includes("jup.ag/price/v2")) {
        return { body: { data: { [SPL_MINT]: { price: "0.42" } } } };
      }
      return { ok: false };
    });
    const q = await fetchMarketUsd(SPL_MINT);
    expect(q?.usd).toBe(0.42);
    expect(q?.source).toBe("jupiter");
    expect(urls[0]).toContain("vsToken=" + USDC_MINT);
    expect(urls[0]).toContain(SPL_MINT);
    expect(urls.some((u) => u.includes(SPL_MINT.toLowerCase()) && !u.includes(SPL_MINT))).toBe(false);
  });

  it("falls through to DexScreener Solana highest-liq pair", async () => {
    const urls = stubFetch((url) => {
      if (url.includes("dexscreener")) {
        return {
          body: {
            pairs: [
              { priceUsd: "1.00", liquidity: { usd: 50 }, chainId: "ethereum" },
              { priceUsd: "0.11", liquidity: { usd: 500 }, chainId: "solana" },
              { priceUsd: "0.05", liquidity: { usd: 9 }, chainId: "solana" },
            ],
          },
        };
      }
      return { ok: false };
    });
    const q = await fetchMarketUsd(SPL_MINT);
    expect(q?.usd).toBe(0.11);
    expect(q?.source).toBe("dexscreener");
    expect(urls.some((u) => u.includes("/tokens/" + SPL_MINT))).toBe(true);
  });

  it("does not lowercase an SPL mint on the Gecko solana fallback", async () => {
    const urls = stubFetch((url) => {
      if (url.includes("geckoterminal") && url.includes("/networks/solana/") && url.includes(SPL_MINT)) {
        return { body: { data: { attributes: { price_usd: "0.08" } } } };
      }
      return { ok: false };
    });
    const q = await fetchMarketUsd(SPL_MINT);
    expect(q?.usd).toBe(0.08);
    expect(q?.source).toBe("geckoterminal");
    expect(urls.some((u) => u.includes("/networks/solana/") && u.includes(SPL_MINT))).toBe(true);
    expect(urls.some((u) => u.includes(SPL_MINT.toLowerCase()) && !u.includes(SPL_MINT))).toBe(false);
  });

  it("uses pump.fun curve while pre-graduation", async () => {
    stubFetch((url) => {
      if (url.includes("pump.fun/coins/")) {
        return { body: { complete: false, usd_market_cap: 80_000, total_supply: 1_000_000_000 } };
      }
      return { ok: false };
    });
    const q = await fetchMarketUsd(SPL_MINT);
    expect(q?.source).toBe("pump.fun");
    expect(q?.usd).toBeCloseTo(0.00008, 8);
  });

  it("skips a graduated pump.fun coin (no curve quote)", async () => {
    stubFetch((url) => {
      if (url.includes("pump.fun")) {
        return { body: { complete: true, usd_market_cap: 1e9, total_supply: 1e9 } };
      }
      return { ok: false };
    });
    const q = await fetchMarketUsd(SPL_MINT);
    expect(q).toBeNull();
  });
});

describe("circuit breaker freeze / thaw", () => {
  const t0 = 1_700_000_000_000;

  it("freezes on a null quote and never writes $1", () => {
    const s = ingestQuote(emptyOracleState(), null, t0);
    expect(s.bridgeFrozen).toBe(true);
    expect(s.quoteMissing).toBe(true);
    expect(s.spot).toBe(0);
    expect(s.twap15m).toBe(0);
    expect(s.freezeReason).toBe("no-quote");
  });

  it("freezes on a >40% spot jump", () => {
    let s = emptyOracleState();
    s = ingestQuote(s, { usd: 1, source: "jupiter" }, t0);
    s = ingestQuote(s, { usd: 1.01, source: "jupiter" }, t0 + 60_000);
    s = ingestQuote(s, { usd: 1.0, source: "jupiter" }, t0 + 120_000);
    expect(s.bridgeFrozen).toBe(false);
    s = ingestQuote(s, { usd: 1.5, source: "jupiter" }, t0 + 180_000);
    expect(s.bridgeFrozen).toBe(true);
    expect(s.freezeReason).toBe("spot-jump");
    expect(SPOT_JUMP_FRAC).toBe(0.4);
  });

  it("freezes when spot diverges >60% from 15m TWAP without a 40% single-tick jump", () => {
    let s = emptyOracleState();
    for (let i = 0; i < 16; i++) {
      s = ingestQuote(s, { usd: 1, source: "jupiter" }, t0 + i * 60_000);
    }
    expect(s.bridgeFrozen).toBe(false);
    s = ingestQuote(s, { usd: 1.35, source: "jupiter" }, t0 + 16 * 60_000);
    expect(s.bridgeFrozen).toBe(false);
    s = ingestQuote(s, { usd: 1.86, source: "jupiter" }, t0 + 17 * 60_000);
    expect(s.bridgeFrozen).toBe(true);
    expect(s.freezeReason).toBe("twap-diverge");
    expect(TWAP_DIVERGE_FRAC).toBe(0.6);
  });

  it("thaws after 3 consecutive stable quotes", () => {
    let s = emptyOracleState();
    s = ingestQuote(s, { usd: 1, source: "jupiter" }, t0);
    s = ingestQuote(s, { usd: 1.5, source: "jupiter" }, t0 + 60_000);
    expect(s.bridgeFrozen).toBe(true);
    s = ingestQuote(s, { usd: 1.52, source: "jupiter" }, t0 + 120_000);
    s = ingestQuote(s, { usd: 1.51, source: "jupiter" }, t0 + 180_000);
    expect(s.bridgeFrozen).toBe(true);
    expect(s.stableQuotes).toBeLessThan(THAW_STABLE_QUOTES);
    s = ingestQuote(s, { usd: 1.5, source: "jupiter" }, t0 + 240_000);
    expect(s.bridgeFrozen).toBe(false);
    expect(s.freezeReason).toBeNull();
  });

  it("does not count a reused cache tick toward thaw", () => {
    let s = emptyOracleState();
    s = ingestQuote(s, { usd: 1, source: "jupiter" }, t0);
    s = ingestQuote(s, { usd: 1.5, source: "jupiter" }, t0 + 60_000);
    const frozen = s.stableQuotes;
    s = ingestQuote(s, { usd: 1.5, source: "jupiter" }, t0 + 90_000, { reuseCache: true });
    expect(s.bridgeFrozen).toBe(true);
    expect(s.stableQuotes).toBe(frozen);
  });

  it("freezes when no fresh quote lands for 3 minutes", () => {
    let s = emptyOracleState();
    s = ingestQuote(s, { usd: 1, source: "jupiter" }, t0);
    s = ingestQuote(s, { usd: 1, source: "jupiter" }, t0 + 60_000);
    s = ingestQuote(s, { usd: 1, source: "jupiter" }, t0 + 120_000);
    expect(s.bridgeFrozen).toBe(false);
    s = ingestQuote(s, null, t0 + 120_000 + 3 * 60_000 + 1);
    expect(s.bridgeFrozen).toBe(true);
    expect(s.freezeReason).toBe("stale");
    expect(s.twap15m).toBeGreaterThan(0);
    expect(s.stale).toBe(true);
  });
});

describe("evaluateCircuitBreaker", () => {
  it("flags ATA vs D1 pool divergence", () => {
    const r = evaluateCircuitBreaker({
      spot: 1,
      prevSpot: 1,
      twap15m: 1,
      fetchedAt: Date.now(),
      now: Date.now(),
      quoteMissing: false,
      treasuryAta: 100,
      poolMetro: 200,
    });
    expect(r).toBe("ata-pool");
  });
});
