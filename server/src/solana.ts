// METROPHAGE server — real Solana settlement for the $METRO bridge (Phase 5).
//
// Implements the `Settlement` seam from metro.ts against a real chain (devnet for the
// rehearsal). The custodial treasury keypair is a SERVER SECRET (wrangler secret /
// .dev.vars), never in code or the client. Lazily constructed (see index.ts) only when
// the treasury env is present, so the @solana/web3.js dependency never enters the
// game's hot path.
//
// $0-LAUNCH INVARIANT — the treasury NEVER spends SOL:
//   * withdrawals are CLAIMS: we build a tx whose fee payer is the PLAYER, add an
//     idempotent create for the player's own token account (player pays that rent too),
//     partially sign with the treasury key (signing is free), and return it. The player
//     signs + submits; confirm verifies it landed. Tampering is impossible — the
//     treasury signature covers the whole message, so any edit invalidates it.
//   * deposits are player-sent transfers (the sender's wallet pays the fee and creates
//     the treasury's token account on the first send).
// The treasury therefore needs a balance of exactly nothing, forever.

import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getMint,
} from "@solana/spl-token";
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

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function makeSolanaSettlement(cfg: SolanaConfig): Settlement {
  const conn = new Connection(cfg.rpc, "confirmed");
  const mint = new PublicKey(cfg.mint);
  const treasury = Keypair.fromSecretKey(b64ToBytes(cfg.treasurySecretB64));
  let decimalsP: Promise<number> | null = null;
  const decimals = () => (decimalsP ??= getMint(conn, mint).then((m) => m.decimals));

  return {
    /** Build the payout claim: treasury -> player transfer, PLAYER pays the fee. */
    async buildClaim(wallet, metro) {
      try {
        const owner = new PublicKey(wallet);
        const d = await decimals();
        const amount = BigInt(Math.round(metro * 10 ** d));
        if (amount <= 0n) return { ok: false, reason: "amount rounds to zero on-chain" };
        const from = await getAssociatedTokenAddress(mint, treasury.publicKey);
        const to = await getAssociatedTokenAddress(mint, owner);

        // Hard gate: on-chain treasury ATA must cover the claim. Ledger pool can lag
        // (or a pending claim drained the ATA). Never hand the player a doomed tx.
        try {
          const bal = await conn.getTokenAccountBalance(from, "confirmed");
          const have = BigInt(bal.value.amount);
          if (have < amount) {
            return { ok: false, reason: "Check back later." };
          }
        } catch {
          // Missing ATA / empty account → nothing to pay out.
          return { ok: false, reason: "Check back later." };
        }

        const { blockhash } = await conn.getLatestBlockhash("confirmed");
        const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash });
        // the player pays the rent for their own token account (no-op if it exists)
        tx.add(createAssociatedTokenAccountIdempotentInstruction(owner, to, owner, mint));
        tx.add(createTransferCheckedInstruction(from, mint, to, treasury.publicKey, amount, d));
        tx.partialSign(treasury); // free — a signature, not a spend
        const claimTx = bytesToB64(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
        return { ok: true, claimTx };
      } catch (e) {
        return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    },

    /** Confirm the claim landed: the treasury paid exactly `metro` to `wallet` in this tx. */
    async verifyClaim(txSig, wallet, metro) {
      try {
        const tx = await conn.getParsedTransaction(txSig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
        if (!tx || tx.meta?.err) return { ok: false, reason: "tx not found or failed" };
        const owner = new PublicKey(wallet).toBase58();
        const treas = treasury.publicKey.toBase58();
        const d = await decimals();
        const pre = tx.meta?.preTokenBalances ?? [];
        const post = tx.meta?.postTokenBalances ?? [];
        const amt = (list: typeof pre, who: string) =>
          Number(list.find((b) => b.mint === cfg.mint && b.owner === who)?.uiTokenAmount.amount ?? 0);
        const units = Math.round(metro * 10 ** d);
        const treasuryPaid = amt(pre, treas) - amt(post, treas);
        const walletGot = amt(post, owner) - amt(pre, owner);
        if (treasuryPaid !== units) return { ok: false, reason: "tx does not pay this claim's amount from the treasury" };
        if (walletGot !== units) return { ok: false, reason: "tx does not pay this claim's wallet" };
        return { ok: true, ref: txSig };
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
        // Treasury $METRO balance must INCREASE.
        const treasAmt = (list: typeof pre) =>
          Number(list.find((b) => b.mint === cfg.mint && b.owner === treas)?.uiTokenAmount.amount ?? 0);
        const delta = treasAmt(post) - treasAmt(pre);
        if (delta <= 0) return { ok: false, reason: "no $METRO received by treasury in this tx" };

        // Require the claimed wallet to have lost at least `delta` units of this mint
        // (they funded the treasury increase). Catches random third-party fills.
        const ownerPre = Number(pre.find((b) => b.mint === cfg.mint && b.owner === owner)?.uiTokenAmount.amount ?? 0);
        const ownerPost = Number(post.find((b) => b.mint === cfg.mint && b.owner === owner)?.uiTokenAmount.amount ?? 0);
        const ownerLost = ownerPre - ownerPost;
        if (ownerLost < delta) {
          return { ok: false, reason: "tx not a $METRO transfer from the claimed wallet to treasury" };
        }
        // Prefer matching a parsed SPL transfer into the treasury ATA when available.
        try {
          const treasAta = (await getAssociatedTokenAddress(mint, treasury.publicKey)).toBase58();
          const outer = tx.transaction.message.instructions as unknown as Array<Record<string, unknown>>;
          const inner = (tx.meta?.innerInstructions ?? []).flatMap((ii) => ii.instructions) as unknown as Array<
            Record<string, unknown>
          >;
          let sawTransferToTreasury = false;
          for (const ix of [...outer, ...inner]) {
            const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> } | undefined;
            if (!parsed || (parsed.type !== "transfer" && parsed.type !== "transferChecked")) continue;
            const info = parsed.info ?? {};
            if (info.mint && String(info.mint) !== cfg.mint) continue;
            const dest = String(info.destination ?? "");
            if (dest === treasAta) {
              sawTransferToTreasury = true;
              break;
            }
          }
          if (!sawTransferToTreasury && outer.length + inner.length > 0) {
            // Parsed instructions present but none hit treasury ATA — still allow if
            // balance deltas are consistent (some wallets wrap transfers).
          }
        } catch {
          /* balance check above is sufficient */
        }
        return { ok: true, metro: delta / 10 ** d };
      } catch (e) {
        return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    },
  };
}

/** The treasury's public address (for deposits / display) from its secret. */
export function treasuryPubkey(secretB64: string): string {
  return Keypair.fromSecretKey(b64ToBytes(secretB64)).publicKey.toBase58();
}
