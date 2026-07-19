// Operator wallet — shared client + server. Keep this list deliberately singular.
// Wallet player ids are stored as `w:<address>` — 0x EVM (Robinhood Chain,
// authoritative) or base58 Solana (dormant alternate). EVM entries are
// lowercase; base58 is case-sensitive and kept verbatim.

export const GOD_WALLETS = [
  // Robinhood Chain (EVM) operator — authoritative launch path.
  "0x7bf8195c181fbb74d10aed7035c26eca18ea726d",
  // Solana operator — dormant SPL alternate only.
  "9Z9uZJXdnyTE7gkFfrepJ3BWDTNA3ZeteDkpgT6cxkve",
] as const;

const GOD_SET = new Set<string>(GOD_WALLETS);

/** Normalize a raw wallet address or `w:<address>` player id. */
export function normalizeWalletAddress(idOrAddr: string | null | undefined): string | null {
  if (!idOrAddr || typeof idOrAddr !== "string") return null;
  let address = idOrAddr.trim();
  if (address.toLowerCase().startsWith("w:")) address = address.slice(2).trim();
  // EVM: 20-byte hex — canonical form is lowercase.
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return address.toLowerCase();
  // Base58 excludes 0, O, I and l. Solana public keys normally encode to 32–44 chars.
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return address;
  return null;
}

/** True only for the single authorized operator wallet. */
export function isGodAccount(idOrAddr: string | null | undefined): boolean {
  const address = normalizeWalletAddress(idOrAddr);
  return !!address && GOD_SET.has(address);
}
