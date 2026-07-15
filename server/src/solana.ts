// METROPHAGE server — real Solana settlement for the $METRO bridge (Phase 5).
//
// Implements the `Settlement` seam from metro.ts against a real chain. The custodial
// treasury keypair is a SERVER SECRET (wrangler secret / .dev.vars), never in code
// or the client. Lazily constructed (see index.ts) only when the treasury env is
// present, so the @solana/web3.js dependency never enters the game's hot path.
//
// WITHDRAWALS (cash-out):
//   Preferred: treasury is fee-payer — signs + broadcasts the SPL transfer so the
//   player does not need SOL. Creates the player's ATA if missing (treasury pays rent).
//   Fallback: if treasury SOL is too low, return a player-fee-payer partial-signed
//   claim (legacy path) so cash-outs still work once the player tops up SOL.
//
// DEPOSITS:
//   Player-sent transfers (player pays the fee and may create the treasury ATA).

import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getMint,
  getAccount,
} from "@solana/spl-token";
import type { Settlement } from "./metro";

export interface SolanaConfig {
  rpc: string;
  mint: string; // the $METRO mint
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

/** ~tx fee when ATA already exists. */
const FEE_ONLY_LAMPORTS = 20_000;
/** Fee + rent for creating a player ATA (~0.00204 SOL rent + headroom). */
const FEE_PLUS_ATA_LAMPORTS = 2_500_000;

export function makeSolanaSettlement(cfg: SolanaConfig): Settlement {
  const conn = new Connection(cfg.rpc, "confirmed");
  const mint = new PublicKey(cfg.mint);
  const treasury = Keypair.fromSecretKey(b64ToBytes(cfg.treasurySecretB64));
  let decimalsP: Promise<number> | null = null;
  const decimals = () => (decimalsP ??= getMint(conn, mint).then((m) => m.decimals));

  async function playerAtaExists(ata: PublicKey): Promise<boolean> {
    try {
      await getAccount(conn, ata, "confirmed");
      return true;
    } catch {
      return false;
    }
  }

  return {
    /**
     * Build + preferably broadcast a treasury-paid payout (treasury spends SOL).
     * Returns either:
     *   - `solana-sent:<sig>` when the Worker already landed the tx (best path)
     *   - base64 fully-signed treasury-paid tx (client just broadcasts)
     *   - base64 partial-signed player-paid tx if treasury has no SOL (fallback)
     */
    async buildClaim(wallet, metro) {
      try {
        const owner = new PublicKey(wallet);
        const d = await decimals();
        const amount = BigInt(Math.round(metro * 10 ** d));
        if (amount <= 0n) return { ok: false, reason: "amount rounds to zero on-chain" };
        const from = await getAssociatedTokenAddress(mint, treasury.publicKey);
        const to = await getAssociatedTokenAddress(mint, owner);

        // Hard gate: on-chain treasury ATA must cover the claim.
        try {
          const bal = await conn.getTokenAccountBalance(from, "confirmed");
          const have = BigInt(bal.value.amount);
          if (have < amount) {
            return { ok: false, reason: "Check back later." };
          }
        } catch {
          return { ok: false, reason: "Check back later." };
        }

        const ataReady = await playerAtaExists(to);
        const needLamports = ataReady ? FEE_ONLY_LAMPORTS : FEE_PLUS_ATA_LAMPORTS;
        let solBal = 0;
        try {
          solBal = await conn.getBalance(treasury.publicKey, "confirmed");
        } catch {
          solBal = 0;
        }
        const treasuryCanPay = solBal >= needLamports;

        const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");

        if (treasuryCanPay) {
          // ── Preferred: treasury pays SOL fee (+ ATA rent if needed) ──────
          const tx = new Transaction({ feePayer: treasury.publicKey, recentBlockhash: blockhash });
          tx.add(
            createAssociatedTokenAccountIdempotentInstruction(
              treasury.publicKey, // payer (SOL)
              to,
              owner,
              mint,
            ),
          );
          tx.add(createTransferCheckedInstruction(from, mint, to, treasury.publicKey, amount, d));
          tx.sign(treasury); // fully signed — only treasury signature required

          // Broadcast from the Worker so cash-out completes without the player holding SOL.
          try {
            const raw = tx.serialize();
            const sig = await conn.sendRawTransaction(raw, {
              skipPreflight: false,
              preflightCommitment: "confirmed",
              maxRetries: 3,
            });
            try {
              await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
            } catch {
              /* confirm may lag; confirmClaim will re-check by sig */
            }
            return { ok: true, claimTx: `solana-sent:${sig}`, ref: sig };
          } catch (sendErr) {
            // RPC send failed — hand the fully-signed tx to the client to broadcast.
            const claimTx = bytesToB64(tx.serialize({ requireAllSignatures: true, verifySignatures: false }));
            return {
              ok: true,
              claimTx,
              reason: `treasury-paid tx ready (server broadcast failed: ${String((sendErr as Error)?.message ?? sendErr).slice(0, 80)})`,
            };
          }
        }

        // ── Fallback: player pays SOL (treasury only signs the transfer) ──
        const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash });
        tx.add(createAssociatedTokenAccountIdempotentInstruction(owner, to, owner, mint));
        tx.add(createTransferCheckedInstruction(from, mint, to, treasury.publicKey, amount, d));
        tx.partialSign(treasury);
        const claimTx = bytesToB64(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
        return {
          ok: true,
          claimTx,
          reason: `treasury SOL low (${(solBal / LAMPORTS_PER_SOL).toFixed(4)} SOL) — player pays fee`,
        };
      } catch (e) {
        return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    },

    /** Confirm the claim landed: the treasury paid exactly `metro` to `wallet` in this tx. */
    async verifyClaim(txSig, wallet, metro) {
      try {
        // Strip helper prefix if a client re-submitted the marker as a "sig".
        const sig = txSig.startsWith("solana-sent:") ? txSig.slice("solana-sent:".length) : txSig;
        const tx = await conn.getParsedTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
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
        const treasAmt = (list: typeof pre) =>
          Number(list.find((b) => b.mint === cfg.mint && b.owner === treas)?.uiTokenAmount.amount ?? 0);
        const delta = treasAmt(post) - treasAmt(pre);
        if (delta <= 0) return { ok: false, reason: "no $METRO received by treasury in this tx" };

        const ownerPre = Number(pre.find((b) => b.mint === cfg.mint && b.owner === owner)?.uiTokenAmount.amount ?? 0);
        const ownerPost = Number(post.find((b) => b.mint === cfg.mint && b.owner === owner)?.uiTokenAmount.amount ?? 0);
        const ownerLost = ownerPre - ownerPost;
        if (ownerLost < delta) {
          return { ok: false, reason: "tx not a $METRO transfer from the claimed wallet to treasury" };
        }
        try {
          const treasAta = (await getAssociatedTokenAddress(mint, treasury.publicKey)).toBase58();
          const outer = tx.transaction.message.instructions as unknown as Array<Record<string, unknown>>;
          const inner = (tx.meta?.innerInstructions ?? []).flatMap((ii) => ii.instructions) as unknown as Array<
            Record<string, unknown>
          >;
          for (const ix of [...outer, ...inner]) {
            const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> } | undefined;
            if (!parsed || (parsed.type !== "transfer" && parsed.type !== "transferChecked")) continue;
            const info = parsed.info ?? {};
            if (info.mint && String(info.mint) !== cfg.mint) continue;
            const dest = String(info.destination ?? "");
            if (dest === treasAta) break;
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

/** Optional ops helper — SOL + mint awareness for /metro/pool health (unused by default). */
export async function treasurySolBalance(rpc: string, secretB64: string): Promise<number> {
  const conn = new Connection(rpc, "confirmed");
  const kp = Keypair.fromSecretKey(b64ToBytes(secretB64));
  return (await conn.getBalance(kp.publicKey, "confirmed")) / LAMPORTS_PER_SOL;
}

