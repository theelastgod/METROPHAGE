// SPL settlement for the $METRO bridge (pump.fun mint, Worker-broadcast cash-outs).
//
// Treasury keypair is a wrangler secret (base64 64-byte). Never in the client.
// Lazy-imported from index.ts so web3.js stays off the 20Hz DO path.
//
// Cash-outs: Worker is fee-payer. Empty treasury SOL or empty ATA → "Check back later."
// No player-fee-payer partial-sign fallback (broadcast then withhold-confirm double-pay).
// Deposits credit only at `finalized`. Mint is compared as given (base58, never folded).

import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getMint,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import { POOL_EMPTY_USER_MSG, type Settlement, type SettleResult } from "./metro";

export interface SolanaConfig {
  rpc: string;
  mint: string;
  treasurySecretB64: string;
}

/** Decode base64 → bytes without Node's Buffer (atob works in workerd and Node). */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** ~tx fee + priority when ATA already exists. */
const FEE_ONLY_LAMPORTS = 100_000;
/** Fee + rent for creating a player ATA (~0.00204 SOL rent + headroom). */
const FEE_PLUS_ATA_LAMPORTS = 2_500_000;
/** Priority fee on congested pump.fun traffic. */
const CU_LIMIT = 200_000;
const CU_PRICE_MICRO_LAMPORTS = 100_000;
const SEND_ATTEMPTS = 4;

function isBlockhashGone(err: unknown): boolean {
  const m = String((err as Error)?.message ?? err);
  return /BlockhashNotFound|blockhash not found/i.test(m);
}

export function isSolanaTreasurySecret(secret: string | undefined): boolean {
  const s = (secret || "").trim();
  if (!s || /^0x[0-9a-fA-F]{64}$/.test(s) || /^[0-9a-fA-F]{64}$/.test(s)) return false;
  try {
    return b64ToBytes(s).length === 64;
  } catch {
    return false;
  }
}

type Prepared = {
  raw: Uint8Array;
  blockhash: string;
  lastValidBlockHeight: number;
  wallet: string;
  metro: number;
};

export function makeSolanaSettlement(cfg: SolanaConfig): Settlement {
  const conn = new Connection(cfg.rpc, "confirmed");
  const mint = new PublicKey(cfg.mint);
  const treasury = Keypair.fromSecretKey(b64ToBytes(cfg.treasurySecretB64));
  let decimalsP: Promise<number> | null = null;
  const decimals = () => (decimalsP ??= getMint(conn, mint).then((m) => m.decimals));
  const preparedByHash = new Map<string, Prepared>();

  async function playerAtaExists(ata: PublicKey): Promise<boolean> {
    try {
      await getAccount(conn, ata, "confirmed");
      return true;
    } catch {
      return false;
    }
  }

  async function assemblePayout(wallet: string, metro: number): Promise<SettleResult & { prepared?: Prepared }> {
    const owner = new PublicKey(wallet);
    const d = await decimals();
    const amount = BigInt(Math.round(metro * 10 ** d));
    if (amount <= 0n) return { ok: false, reason: "amount rounds to zero on-chain" };
    const from = await getAssociatedTokenAddress(mint, treasury.publicKey);
    const to = await getAssociatedTokenAddress(mint, owner);

    try {
      const bal = await conn.getTokenAccountBalance(from, "confirmed");
      const have = BigInt(bal.value.amount);
      if (have < amount) return { ok: false, reason: POOL_EMPTY_USER_MSG };
    } catch {
      return { ok: false, reason: POOL_EMPTY_USER_MSG };
    }

    const ataReady = await playerAtaExists(to);
    const needLamports = ataReady ? FEE_ONLY_LAMPORTS : FEE_PLUS_ATA_LAMPORTS;
    let solBal = 0;
    try {
      solBal = await conn.getBalance(treasury.publicKey, "confirmed");
    } catch {
      solBal = 0;
    }
    if (solBal < needLamports) return { ok: false, reason: POOL_EMPTY_USER_MSG };

    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: treasury.publicKey, recentBlockhash: blockhash });
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: CU_LIMIT }));
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE_MICRO_LAMPORTS }));
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(treasury.publicKey, to, owner, mint),
    );
    tx.add(createTransferCheckedInstruction(from, mint, to, treasury.publicKey, amount, d));
    tx.sign(treasury);
    if (!tx.signature) return { ok: false, reason: POOL_EMPTY_USER_MSG };
    const sig = bs58.encode(tx.signature);
    const raw = tx.serialize({ requireAllSignatures: true, verifySignatures: false });
    const prepared: Prepared = { raw, blockhash, lastValidBlockHeight, wallet, metro };
    return { ok: true, claimTxHash: sig, prepared };
  }

  return {
    async buildClaim(wallet, metro) {
      try {
        const built = await assemblePayout(wallet, metro);
        if (!built.ok || !built.claimTxHash || !built.prepared) {
          return { ok: false, reason: built.reason ?? POOL_EMPTY_USER_MSG };
        }
        preparedByHash.set(built.claimTxHash, built.prepared);
        // Signature is known before broadcast. metro.ts must persist claim_tx_hash,
        // then call sendPreparedClaim. Never return a client-held signed tx.
        return { ok: true, claimTx: `solana-pending:${built.claimTxHash}`, claimTxHash: built.claimTxHash };
      } catch (e) {
        return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    },

    async sendPreparedClaim(claimTxHash) {
      const prep = preparedByHash.get(claimTxHash);
      if (!prep) return { ok: false, reason: POOL_EMPTY_USER_MSG };
      for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
        try {
          const sig = await conn.sendRawTransaction(prep.raw, {
            skipPreflight: false,
            preflightCommitment: "confirmed",
            maxRetries: 3,
          });
          try {
            await conn.confirmTransaction(
              { signature: sig, blockhash: prep.blockhash, lastValidBlockHeight: prep.lastValidBlockHeight },
              "confirmed",
            );
          } catch {
            /* confirm may lag; verifyClaim re-checks by sig */
          }
          preparedByHash.delete(claimTxHash);
          return { ok: true, ref: sig, claimTx: `solana-sent:${sig}`, claimTxHash: sig };
        } catch (e) {
          if (isBlockhashGone(e)) {
            try {
              const st = await conn.getSignatureStatuses([claimTxHash], { searchTransactionHistory: true });
              const val = st?.value?.[0];
              if (val && !val.err) {
                preparedByHash.delete(claimTxHash);
                return { ok: true, ref: claimTxHash, claimTx: `solana-sent:${claimTxHash}`, claimTxHash };
              }
            } catch {
              /* status RPC failed — do not resign until we know the old sig is dead */
              return { ok: false, rpcError: true, reason: "rpc unreachable — claim still pending" };
            }
            preparedByHash.delete(claimTxHash);
            const rebuilt = await assemblePayout(prep.wallet, prep.metro);
            if (!rebuilt.ok || !rebuilt.claimTxHash || !rebuilt.prepared) {
              return { ok: false, reason: rebuilt.reason ?? POOL_EMPTY_USER_MSG };
            }
            preparedByHash.set(rebuilt.claimTxHash, rebuilt.prepared);
            return {
              ok: false,
              claimTxHash: rebuilt.claimTxHash,
              reason: "blockhash_retry",
            };
          }
          if (attempt === SEND_ATTEMPTS - 1) {
            return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
          }
        }
      }
      return { ok: false, reason: POOL_EMPTY_USER_MSG };
    },

    async verifyClaim(txSig, wallet, metro) {
      try {
        const sig = txSig.startsWith("solana-sent:") ? txSig.slice("solana-sent:".length) : txSig;
        const tx = await conn.getParsedTransaction(sig, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
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
        return {
          ok: false,
          rpcError: true,
          reason: String((e as Error)?.message ?? e).slice(0, 160),
        };
      }
    },

    async treasuryTokenUi() {
      try {
        const from = await getAssociatedTokenAddress(mint, treasury.publicKey);
        const bal = await conn.getTokenAccountBalance(from, "confirmed");
        const n = Number(bal.value.uiAmount);
        return Number.isFinite(n) ? n : 0;
      } catch {
        return null;
      }
    },

    async verifyDeposit(txSig, wallet, _claimedMetro) {
      try {
        const statuses = await conn.getSignatureStatuses([txSig], { searchTransactionHistory: true });
        const st = statuses.value[0];
        if (!st || st.err) return { ok: false, reason: "tx not found or failed" };
        if (st.confirmationStatus !== "finalized") {
          return { ok: false, reason: "tx not finalized yet — try again shortly" };
        }
        const tx = await conn.getParsedTransaction(txSig, {
          commitment: "finalized",
          maxSupportedTransactionVersion: 0,
        });
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
        return { ok: true, metro: delta / 10 ** d };
      } catch (e) {
        return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    },
  };
}

export function treasuryPubkey(secretB64: string): string {
  return Keypair.fromSecretKey(b64ToBytes(secretB64)).publicKey.toBase58();
}

export async function treasuryHealth(args: {
  rpc: string;
  mint?: string;
  treasurySecretB64: string;
}): Promise<{ sol: number; metro: string | null; ok: boolean; warn?: string }> {
  const conn = new Connection(args.rpc, "confirmed");
  const kp = Keypair.fromSecretKey(b64ToBytes(args.treasurySecretB64));
  const sol = (await conn.getBalance(kp.publicKey, "confirmed")) / LAMPORTS_PER_SOL;
  let metro: string | null = null;
  if (args.mint) {
    try {
      const mint = new PublicKey(args.mint);
      const ata = await getAssociatedTokenAddress(mint, kp.publicKey);
      const bal = await conn.getTokenAccountBalance(ata, "confirmed");
      metro = bal.value.uiAmountString ?? bal.value.amount;
    } catch {
      metro = "0";
    }
  }
  const warn =
    sol < FEE_PLUS_ATA_LAMPORTS / LAMPORTS_PER_SOL
      ? "treasury SOL too low for cash-outs / ATA rent"
      : metro === "0"
        ? "treasury $METRO ATA empty"
        : undefined;
  return { sol, metro, ok: !warn, warn };
}
