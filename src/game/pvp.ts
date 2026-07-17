// METROPHAGE — PvP arena rules (THE CRUCIBLE).
// Entering locks a $METRO buy-in; kills claim the victim's pot.
// Player kills also drop 10% of the victim's credits on the floor (anyone can pick up).
// Leaving safely returns escrow. Non-PvP deaths never take credits.

/** $METRO buy-in to enter a PvP arena or contest. Locked in escrow until exit or death. */
export const PVP_BUY_IN_METRO = 50_000;

/** Fraction of pocket credits dropped on the floor when killed by another player in PvP. */
export const PVP_CREDIT_DROP_PCT = 0.1;

/** Short copy for enter-zone banners / death card. */
export const PVP_CREDIT_DROP_NOTICE =
  "PvP: if another player kills you, 10% of your credits drop on the floor — respawn outside the arena.";