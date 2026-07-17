// Server-side $METRO family resolution (mirrors client chainProfile).
// AUTHORITATIVE: Solana SPL. Robinhood Chain ERC-20 remains a dormant alternate.

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
 *   solana|sol|spl (default) — authoritative live path
 *   robinhood|rh|evm         — dormant alternate only
 *   auto                     — detect from mint shape (base58 → solana, 0x → robinhood)
 */
export function settlementForce(env: { METRO_SETTLEMENT?: string }): "robinhood" | "solana" | "auto" {
  const f = (env.METRO_SETTLEMENT || "solana").toLowerCase().trim();
  if (f === "robinhood" || f === "rh" || f === "evm") return "robinhood";
  if (f === "auto") return "auto";
  // solana | sol | spl | empty | anything else → solana (authoritative)
  return "solana";
}

export function resolveSettlementFamily(
  mint: string | undefined,
  env: { METRO_SETTLEMENT?: string } = {},
): SettlementFamily {
  const m = (mint || "").trim();
  const force = settlementForce(env);

  // Explicit EVM alternate — only when operator forces robinhood.
  if (force === "robinhood") {
    if (!m) return "off";
    if (isEvmMint(m)) return "robinhood";
    // base58 mint while forced robinhood → stay off (do not silently take Solana path)
    return "off";
  }

  // auto: shape detection.
  if (force === "auto") {
    if (!m) return "off";
    if (isEvmMint(m)) return "robinhood";
    if (isSolanaMint(m)) return "solana";
    return "off";
  }

  // Default / solana force: Solana is authoritative.
  // No mint yet → off (credits-only). EVM mint shapes are ignored unless force=robinhood|auto.
  if (!m) return "off";
  if (isSolanaMint(m)) return "solana";
  // 0x mint while forced solana → stay off (do not silently take the EVM path)
  return "off";
}

export function settlementFamilyLabel(family: SettlementFamily): string {
  switch (family) {
    case "solana":
      return "Solana SPL";
    case "robinhood":
      return "Robinhood Chain ERC-20 (alternate)";
    default:
      return "off (credits only · Solana primary)";
  }
}
