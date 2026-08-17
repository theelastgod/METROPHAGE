// Server-side $METRO family resolution (mirrors client chainProfile).
// AUTHORITATIVE: Robinhood Chain ERC-20. This build is EVM-only — the Solana SPL
// settlement lives on the `settlement/solana` branch.

export type SettlementFamily = "robinhood" | "off";

export function isEvmMint(mint: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test((mint || "").trim());
}

/**
 * METRO_SETTLEMENT:
 *   robinhood|evm (default) — authoritative live path
 *   auto                    — detect from mint shape (0x → robinhood, else off)
 *   solana|sol|spl|off      — accepted for env compatibility; resolves to OFF here
 *                             (no SPL adapter is compiled into this build)
 */
export function settlementForce(env: { METRO_SETTLEMENT?: string }): "robinhood" | "auto" | "off" {
  const f = (env.METRO_SETTLEMENT || "robinhood").toLowerCase().trim();
  if (f === "auto") return "auto";
  if (f === "solana" || f === "sol" || f === "spl" || f === "off") return "off";
  // robinhood | rh | evm | empty | anything else → robinhood (authoritative)
  return "robinhood";
}

export function resolveSettlementFamily(
  mint: string | undefined,
  env: { METRO_SETTLEMENT?: string } = {},
): SettlementFamily {
  const m = (mint || "").trim();
  const force = settlementForce(env);
  if (force === "off" || !m) return "off";
  if (isEvmMint(m)) return "robinhood";
  // Non-0x mint (e.g. base58) → stay off: never silently take a chain we can't settle.
  return "off";
}

export function settlementFamilyLabel(family: SettlementFamily): string {
  switch (family) {
    case "robinhood":
      return "Robinhood Chain ERC-20";
    default:
      return "off (credits only · Robinhood primary)";
  }
}
