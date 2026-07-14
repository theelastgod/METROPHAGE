// Server-side dual-path $METRO family resolution (mirrors client chainProfile).
// When METRO_MINT / METRO_DEVNET_MINT is set, pickSettlement() uses this shape check.

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

/** Optional force: METRO_SETTLEMENT=robinhood|solana|auto */
export function settlementForce(env: { METRO_SETTLEMENT?: string }): "robinhood" | "solana" | "auto" {
  const f = (env.METRO_SETTLEMENT || "").toLowerCase().trim();
  if (f === "robinhood" || f === "rh" || f === "evm") return "robinhood";
  if (f === "solana" || f === "sol" || f === "spl") return "solana";
  return "auto";
}

export function resolveSettlementFamily(
  mint: string | undefined,
  env: { METRO_SETTLEMENT?: string } = {},
): SettlementFamily {
  const m = (mint || "").trim();
  if (!m) return "off";
  const force = settlementForce(env);
  if (force === "robinhood") return "robinhood";
  if (force === "solana") return "solana";
  if (isEvmMint(m)) return "robinhood";
  if (isSolanaMint(m)) return "solana";
  return "off";
}

export function settlementFamilyLabel(family: SettlementFamily): string {
  switch (family) {
    case "robinhood":
      return "Robinhood Chain ERC-20";
    case "solana":
      return "Solana SPL";
    default:
      return "off (credits only)";
  }
}
