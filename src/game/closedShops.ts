// METROPHAGE — the shuttered storefront. Every district has ONE scenery building
// whose door never opens: a day-seeded defunct business with a hand-lettered sign
// and a reason it's closed. Pure flavour (a RuneScape-style "come back tomorrow"
// beat), zero systems — deterministic per (district, day) so every client agrees
// without any server round-trip.

import { dayIndex } from "./districtMods";

interface ClosedShop {
  name: string;
  reason: string;
}

/** Authored defunct storefronts. One is chosen per district per day. */
const CLOSED_SHOPS: ClosedShop[] = [
  { name: "TESSELLATE PAWN", reason: "SEIZED — corp audit in progress" },
  { name: "THE LAST ANALOG", reason: "CLOSED — proprietor uploaded" },
  { name: "NUMB & SONS RIPWORK", reason: "SHUTTERED — license revoked" },
  { name: "GRAYSCALE NOODLE", reason: "CLOSED — broth starter died" },
  { name: "FIVE-FINGER FORGE", reason: "GONE — owner skipped town" },
  { name: "HALFLIGHT ARCADE", reason: "DARK — power writ unpaid" },
  { name: "THE QUIET RADIO", reason: "OFF AIR — signal seized" },
  { name: "MERCY & CO. CHROME", reason: "CLOSED — under investigation" },
  { name: "SALT & TIN GENERAL", reason: "BOARDED — flood damage" },
  { name: "DEADLETTER COURIER", reason: "FOLDED — routes went dark" },
  { name: "THE FIRST TENANT", reason: "EVICTED — see the notice" },
  { name: "OVERDRAWN VENDING", reason: "REPOSSESSED — pending sale" },
];

/** Today's shuttered storefront for a district (deterministic client + client). */
export function closedShopFor(district: number, day = dayIndex()): ClosedShop {
  const d = Math.max(0, Math.floor(district) || 0);
  const i = (((d * 7 + day) % CLOSED_SHOPS.length) + CLOSED_SHOPS.length) % CLOSED_SHOPS.length;
  return CLOSED_SHOPS[i];
}

/** Bump line shown when a runner tries the locked door. Second variant on repeat. */
export function closedShopBump(shop: ClosedShop, attempt = 0): string {
  return attempt > 0
    ? `${shop.name} — still locked. ${shop.reason}.`
    : `${shop.name} · ${shop.reason}. The door doesn't budge.`;
}
