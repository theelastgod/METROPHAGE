import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchMarketUsd,
  priceMultiplier,
  METRO_USD_REFERENCE,
  METRO_PRICE_MULT_MIN,
  METRO_PRICE_MULT_MAX,
} from "./metroPrice";

const EVM_MINT = "0x1234567890abcdef1234567890abcdef12345678";
const SPL_MINT = "So11111111111111111111111111111111111111112";

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
          pairs: [{ priceUsd, liquidity: { usd: 1000 }, chainId: "robinhood" }],
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

describe("fetchMarketUsd — Robinhood ERC-20 oracle", () => {
  it("prices a 0x mint on Robinhood Chain", async () => {
    stubFetch("2.50");
    const q = await fetchMarketUsd(EVM_MINT, 4663);
    expect(q).not.toBeNull();
    expect(q!.usd).toBe(2.5);
  });

  // Robinhood is authoritative: the oracle only understands 0x contracts.
  // Any other shape (including a base58 SPL mint) must return null so bridge
  // rates stay pinned to the reference instead of pricing the wrong asset.
  it("refuses a mint that is not a 0x contract", async () => {
    stubFetch("2.50");
    expect(await fetchMarketUsd(SPL_MINT, 4663)).toBeNull();
    expect(await fetchMarketUsd("not-a-mint", 4663)).toBeNull();
    expect(await fetchMarketUsd("", 4663)).toBeNull();
  });

  it("falls through to GeckoTerminal Robinhood slugs on a DexScreener miss", async () => {
    const urls = stubFetch(null);
    await fetchMarketUsd(EVM_MINT, 4663);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.some((u) => u.includes("robinhood"))).toBe(true);
    expect(urls.some((u) => u.includes("/networks/solana/"))).toBe(false);
  });

  it("lets an ops override win over the network", async () => {
    stubFetch("2.50");
    const q = await fetchMarketUsd(EVM_MINT, 4663, "0.75");
    expect(q).toEqual({ usd: 0.75, source: "env:METRO_USD_PRICE" });
  });
});
