// Operator wallet — shared client + server. Keep this list deliberately singular.
// Wallet player ids are stored as `w:<address>` — 0x EVM (Robinhood Chain).
// EVM entries are lowercase. (The Solana operator lives on `settlement/solana`.)

export const GOD_WALLETS = [
  // Robinhood Chain (EVM) operator — authoritative launch path.
  "0x7bf8195c181fbb74d10aed7035c26eca18ea726d",
] as const;

const GOD_SET = new Set<string>(GOD_WALLETS);

/** Normalize a raw wallet address or `w:<address>` player id. */
export function normalizeWalletAddress(idOrAddr: string | null | undefined): string | null {
  if (!idOrAddr || typeof idOrAddr !== "string") return null;
  let address = idOrAddr.trim();
  if (address.toLowerCase().startsWith("w:")) address = address.slice(2).trim();
  // EVM: 20-byte hex — canonical form is lowercase.
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return address.toLowerCase();
  return null;
}

/** True only for the single authorized operator wallet. */
export function isGodAccount(idOrAddr: string | null | undefined): boolean {
  const address = normalizeWalletAddress(idOrAddr);
  return !!address && GOD_SET.has(address);
}
