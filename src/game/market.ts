// METROPHAGE — auction house: pure-data pricing helpers, Phaser-FREE, shared by server
// (authoritative fee) and client (suggested price + fee preview). The market is a credits
// sink via a non-refundable listing fee; a $METRO-denominated market is structurally present
// but GATED (devnet/counsel) like the rest of the $METRO bridge.

import type { Item } from "./items";
import { itemValue } from "./items";

export type Currency = "credits" | "metro";

/** Non-refundable listing fee (the sink): 5% of the ask, min ₵10. */
export function listingFee(price: number): number {
  return Math.max(10, Math.round(price * 0.05));
}

/** A sensible default ask the client pre-fills for quick-listing (2× base value). */
export function suggestedPrice(item: Item): number {
  return Math.max(20, Math.round(itemValue(item) * 2));
}

/** Price sanity bounds the server enforces (stops ₵0 / absurd listings). */
export const MIN_PRICE = 5;
export const MAX_PRICE = 100_000_000;
