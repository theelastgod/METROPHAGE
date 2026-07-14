// METROPHAGE — auction house: pure-data pricing helpers, Phaser-FREE, shared by server
// (authoritative fee) and client (suggested price + fee preview). The market is a credits
// sink via a non-refundable listing fee; a $METRO-denominated market is structurally present
// but GATED (devnet/counsel) like the rest of the $METRO bridge.

import type { Item } from "./items";
import { itemValue } from "./items";

export type Currency = "credits" | "metro";

/** Non-refundable listing fee (the sink): 8% of the ask, min ₵15. */
export function listingFee(price: number): number {
  return Math.max(15, Math.round(price * 0.08));
}

/** A sensible default ask the client pre-fills for quick-listing (2× base value). */
export function suggestedPrice(item: Item): number {
  return Math.max(20, Math.round(itemValue(item) * 2));
}

/** Price sanity bounds the server enforces (stops ₵0 / absurd listings). */
export const MIN_PRICE = 5;
export const MAX_PRICE = 100_000_000;

/** $METRO listing floor (whole units — matches offline Black-Market scale). */
export const MIN_METRO_PRICE = 1;

/** Non-refundable $METRO listing fee: 8% of ask, min ◈1. */
export function metroListingFee(price: number): number {
  return Math.max(1, Math.round(price * 0.08));
}

/** Default $METRO ask for quick-list (≈ item value ÷ 25 — scarce-token scale). */
export function suggestedMetroPrice(item: Item): number {
  return Math.max(MIN_METRO_PRICE, Math.round(itemValue(item) / 25));
}
