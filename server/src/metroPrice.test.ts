import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchMarketUsd,
  priceMultiplier,
  METRO_USD_REFERENCE,
  METRO_PRICE_MULT_MIN,
  METRO_PRICE_MULT_MAX,
} from "./metroPrice";

const SPL_MINT = "So11111111111111111111111111111111111111112";
const EVM_MINT = "0x1234567890abcdef1234567890abcdef12345678";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Capture the URLs the oracle actually hits, and answer with a fixed price. */
function stubFetch(priceUsd: string | null) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(String(url));
      if (priceUsd == null) return { ok: false, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          pairs: [{ priceUsd, liquidity: { usd: 1000 }, chainId: "solana" }],
        }),
      };
    }),
  );
  return urls;
}

describe("priceMultiplier", () => {
  it("is 1 at the design reference", () => {
    expect(priceMultiplier(METRO_USD_REFERENCE)).toBe(1);
  });

  it("clamps so a bad quote cannot nuke or explode the economy", () => {
    expect(priceMultiplier(0.0001)).toBe(METRO_PRICE_MULT_MIN);
    expect(priceMultiplier(999_999)).toBe(METRO_PRICE_MULT_MAX);
    expect(priceMultiplier(0)).toBe(1);
    expect(priceMultiplier(NaN)).toBe(1);
  });
});

describe("fetchMarketUsd — mint family gating", () => {
  // The regression this guards: the oracle used to require /^0x…{40}$/, so a
  // base58 SPL mint silently returned null and every bridge rate stayed pinned
  // to the $1 reference no matter what $METRO actually traded at.
  it("prices a base58 SPL mint", async () => {
    stubFetch("2.50");
    const q = await fetchMarketUsd(SPL_MINT, null);
    expect(q).not.toBeNull();
    expect(q!.usd).toBe(2.5);
  });

  it("still prices a 0x mint on the dormant EVM path", async () => {
    stubFetch("2.50");
    const q = await fetchMarketUsd(EVM_MINT, 4663);
    expect(q!.usd).toBe(2.5);
  });

  it("refuses a mint that is neither family", async () => {
    stubFetch("2.50");
    expect(await fetchMarketUsd("not-a-mint", null)).toBeNull();
    expect(await fetchMarketUsd("", null)).toBeNull();
  });

  it("never lowercases a base58 mint — base58 is case-sensitive", async () => {
    const urls = stubFetch(null); // force fallthrough to GeckoTerminal
    await fetchMarketUsd(SPL_MINT, null);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      if (u.includes(SPL_MINT.toLowerCase()) && !u.includes(SPL_MINT)) {
        throw new Error(`mint was case-folded in ${u}`);
      }
    }
    // and it should look up the solana network, not a Robinhood slug
    expect(urls.some((u) => u.includes("/networks/solana/"))).toBe(true);
    expect(urls.some((u) => u.includes("robinhood"))).toBe(false);
  });

  it("lets an ops override win over the network for either family", async () => {
    stubFetch("2.50");
    const q = await fetchMarketUsd(SPL_MINT, null, "0.75");
    expect(q).toEqual({ usd: 0.75, source: "env:METRO_USD_PRICE" });
  });
});
