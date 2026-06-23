// METROPHAGE server — real Solana settlement for the $METRO bridge (Phase 5 · 2b).
//
// Implements the `Settlement` seam from metro.ts against a real chain (devnet for the
// rehearsal). The custodial treasury keypair is a SERVER SECRET (wrangler secret /
// .dev.vars), never in code or the client. Lazily constructed (see index.ts) only when
// the treasury env is present, so the @solana/web3.js dependency never enters the
// game's hot path.
//
// Status: wired + typechecked; the live devnet round-trip is gated on funding the
// treasury (the public devnet faucet rate-limits airdrops). Hardening notes inline.

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, transfer, getMint } from "@solana/spl-token";
import type { Settlement } from "./metro";

export interface SolanaConfig {
  rpc: string;
  mint: string; // the $METRO mint (devnet test mint for the rehearsal)
  treasurySecretB64: string; // base64 of the 64-byte treasury secret key
}

/** Decode base64 → bytes without Node's Buffer (atob works in workerd and Node). */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function makeSolanaSettlement(cfg: SolanaConfig): Settlement {
  const conn = new Connection(cfg.rpc, "confirmed");
  const mint = new PublicKey(cfg.mint);
  const treasury = Keypair.fromSecretKey(b64ToBytes(cfg.treasurySecretB64));
  let decimalsP: Promise<number> | null = null;
  const decimals = () => (decimalsP ??= getMint(conn, mint).then((m) => m.decimals));

  return {
    /** Withdraw: transfer `metro` $METRO from the treasury ATA to the player's ATA. */
    async sendMetro(wallet, metro) {
      try {
        const owner = new PublicKey(wallet);
        const d = await decimals();
        const amount = BigInt(Math.round(metro * 10 ** d));
        const from = await getOrCreateAssociatedTokenAccount(conn, treasury, mint, treasury.publicKey);
        // treasury pays the rent to create the player's ATA if they don't have one yet
        const to = await getOrCreateAssociatedTokenAccount(conn, treasury, mint, owner);
        const sig = await transfer(conn, treasury, from.address, to.address, treasury, amount);
        return { ok: true, ref: sig };
      } catch (e) {
        return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    },

    /** Deposit: confirm an on-chain tx that paid $METRO INTO the treasury, read the amount. */
    async verifyDeposit(txSig, wallet, _claimedMetro) {
      try {
        const tx = await conn.getParsedTransaction(txSig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
        if (!tx || tx.meta?.err) return { ok: false, reason: "tx not found or failed" };
        const owner = new PublicKey(wallet).toBase58();
        const treas = treasury.publicKey.toBase58();
        const d = await decimals();
        const pre = tx.meta?.preTokenBalances ?? [];
        const post = tx.meta?.postTokenBalances ?? [];
        // The treasury's $METRO balance must have INCREASED across this tx.
        const treasAmt = (list: typeof pre) =>
          Number(list.find((b) => b.mint === cfg.mint && b.owner === treas)?.uiTokenAmount.amount ?? 0);
        const delta = treasAmt(post) - treasAmt(pre);
        if (delta <= 0) return { ok: false, reason: "no $METRO received by treasury in this tx" };
        // …and the claimed wallet must appear as a source of that $METRO. (Heuristic for
        // the rehearsal; production should match the specific transfer instruction's
        // source ATA owner rather than any token-balance entry.)
        const fromClaimed = pre.some((b) => b.mint === cfg.mint && b.owner === owner);
        if (!fromClaimed) return { ok: false, reason: "tx not from the claimed wallet" };
        return { ok: true, metro: delta / 10 ** d };
      } catch (e) {
        return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    },
  };
}

/** The treasury's public address (for funding / display) from its secret. */
export function treasuryPubkey(secretB64: string): string {
  return Keypair.fromSecretKey(b64ToBytes(secretB64)).publicKey.toBase58();
}
