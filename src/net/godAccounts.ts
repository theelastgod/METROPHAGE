// Operator wallets — shared client + server. Keep short.
// Player ids are `w:<checksummed EIP-55 address>` after wallet auth.

/** Lowercase 0x… addresses with full god privileges. */
export const GOD_WALLET_HEX = [
  "0x7bf8195c181fbb74d10aed7035c26eca18ea726d",
] as const;

const GOD_SET = new Set<string>(GOD_WALLET_HEX);

/**
 * Normalize anything wallet-shaped to lowercase 0x + 40 hex, or null.
 * Accepts: raw address, `w:address`, checksummed / lower / upper.
 */
export function normalizeWalletHex(idOrAddr: string | null | undefined): string | null {
  if (!idOrAddr || typeof idOrAddr !== "string") return null;
  let s = idOrAddr.trim();
  if (s.toLowerCase().startsWith("w:")) s = s.slice(2).trim();
  if (!s.startsWith("0x") && !s.startsWith("0X")) {
    if (/^[a-fA-F0-9]{40}$/.test(s)) s = "0x" + s;
    else return null;
  }
  if (!/^0x[a-fA-F0-9]{40}$/i.test(s)) return null;
  return s.toLowerCase();
}

/** True for operator player id (`w:0x…`) or raw wallet address. */
export function isGodAccount(idOrAddr: string | null | undefined): boolean {
  const hex = normalizeWalletHex(idOrAddr);
  return !!hex && GOD_SET.has(hex);
}
