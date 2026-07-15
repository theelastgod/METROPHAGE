// Server-side $METRO family resolution (mirrors client chainProfile).
// AUTHORITATIVE: Robinhood Chain ERC-20. Solana SPL remains a dormant alternate.

export type SettlementFamily = "robinhood" | "solana" | "off";

export function isEvmMint(mint: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test((mint || "").trim());
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function isSolanaMint(mint: string): boolean {
  const a = (mint || "").trim();
  if (a.length < 32 || a.length > 44 || a.startsWith("0x")) return false;
  const bytes: number[] = [0];
  for (const ch of a) {
    const v = BASE58.indexOf(ch);
    if (v < 0) return false;
    let carry = v;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < a.length && a[i] === "1"; i++) bytes.push(0);
  return bytes.length === 32;
}

/**
 * METRO_SETTLEMENT:
 *   robinhood|evm (default) — authoritative live path
 *   solana|sol|spl          — dormant alternate only
 *   auto                    — detect from mint shape (0x → robinhood, base58 → solana)
 */
export function settlementForce(env: { METRO_SETTLEMENT?: string }): "robinhood" | "solana" | "auto" {
  const f = (env.METRO_SETTLEMENT || "robinhood").toLowerCase().trim();
  if (f === "solana" || f === "sol" || f === "spl") return "solana";
  if (f === "auto") return "auto";
  // robinhood | rh | evm | empty | anything else → robinhood (authoritative)
  return "robinhood";
}

export function resolveSettlementFamily(
  mint: string | undefined,
  env: { METRO_SETTLEMENT?: string } = {},
): SettlementFamily {
  const m = (mint || "").trim();
  const force = settlementForce(env);

  // Explicit Solana alternate — only when operator forces solana.
  if (force === "solana") {
    if (!m) return "off";
    return "solana";
  }

  // auto: shape detection.
  if (force === "auto") {
    if (!m) return "off";
    if (isEvmMint(m)) return "robinhood";
    if (isSolanaMint(m)) return "solana";
    return "off";
  }

  // Default / robinhood force: Robinhood is authoritative.
  // No mint yet → off (credits-only). Solana mint shapes are ignored unless force=solana|auto.
  if (!m) return "off";
  if (isEvmMint(m)) return "robinhood";
  // base58 mint while forced robinhood → stay off (do not silently take Solana path)
  return "off";
}

export function settlementFamilyLabel(family: SettlementFamily): string {
  switch (family) {
    case "robinhood":
      return "Robinhood Chain ERC-20";
    case "solana":
      return "Solana SPL (alternate)";
    default:
      return "off (credits only · Robinhood primary)";
  }
}
