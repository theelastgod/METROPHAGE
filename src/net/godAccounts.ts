// Operator wallet — shared client + server. Keep this list deliberately singular.
// Solana wallet player ids are stored as `w:<base58 public key>`.

export const GOD_WALLETS = [
  "9Z9uZJXdnyTE7gkFfrepJ3BWDTNA3ZeteDkpgT6cxkve",
] as const;

const GOD_SET = new Set<string>(GOD_WALLETS);

/** Normalize a raw Solana address or `w:<address>` player id. */
export function normalizeWalletAddress(idOrAddr: string | null | undefined): string | null {
  if (!idOrAddr || typeof idOrAddr !== "string") return null;
  let address = idOrAddr.trim();
  if (address.toLowerCase().startsWith("w:")) address = address.slice(2).trim();
  // Base58 excludes 0, O, I and l. Solana public keys normally encode to 32–44 chars.
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return null;
  return address;
}

/** True only for the single authorized Solana operator wallet. */
export function isGodAccount(idOrAddr: string | null | undefined): boolean {
  const address = normalizeWalletAddress(idOrAddr);
  return !!address && GOD_SET.has(address);
}
