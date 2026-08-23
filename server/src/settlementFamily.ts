// Server-side $METRO family resolution (mirrors client chainProfile).
// AUTHORITATIVE: Solana SPL. evm.ts is unused — this build does not compile an EVM live path.

import bs58 from "bs58";

export type SettlementFamily = "solana" | "off";

export function isEvmMint(mint: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test((mint || "").trim());
}

/** 32-byte payload as base58. Never fold case — pump.fun mints are case-sensitive. */
export function isSolanaMint(mint: string): boolean {
  const a = (mint || "").trim();
  if (a.length < 32 || a.length > 44 || a.startsWith("0x") || a.startsWith("0X")) return false;
  try {
    return bs58.decode(a).length === 32;
  } catch {
    return false;
  }
}

/**
 * METRO_SETTLEMENT:
 *   solana|sol|spl (default) — live path
 *   auto                     — detect from mint shape (base58 → solana, else off)
 *   off|robinhood|rh|evm     — credits-only (EVM adapter is not compiled as live)
 */
export function settlementForce(env: { METRO_SETTLEMENT?: string }): "solana" | "auto" | "off" {
  const f = (env.METRO_SETTLEMENT || "solana").toLowerCase().trim();
  if (f === "auto") return "auto";
  if (f === "off" || f === "robinhood" || f === "rh" || f === "evm") return "off";
  return "solana";
}

export function resolveSettlementFamily(
  mint: string | undefined,
  env: { METRO_SETTLEMENT?: string } = {},
): SettlementFamily {
  const m = (mint || "").trim();
  const force = settlementForce(env);
  if (force === "off" || !m) return "off";
  if (force === "auto") {
    if (isSolanaMint(m)) return "solana";
    return "off";
  }
  if (isSolanaMint(m)) return "solana";
  return "off";
}

export function settlementFamilyLabel(family: SettlementFamily): string {
  switch (family) {
    case "solana":
      return "Solana SPL";
    default:
      return "off (credits only · Solana primary)";
  }
}
