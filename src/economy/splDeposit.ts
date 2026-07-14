// One-click SPL $METRO deposit via Phantom (or any injected Solana wallet).
// Transfers mint tokens from the player's ATA to the treasury ATA (creates player ATA if needed).

import { getSolanaProvider, connectedWallet, connectedChain } from "./wallet";
import { METRO_MINT, metroIsSolana, metroRpc } from "./metro";

export interface DepositSendResult {
  ok: boolean;
  txHash?: string;
  reason?: string;
}

/**
 * Phantom / Solana wallet: transfer `amount` human $METRO units to treasury owner.
 * Returns tx signature for `/metro/deposit` claim.
 */
export async function sendSplDeposit(args: {
  treasury: string;
  amount: number;
  mint?: string;
  rpc?: string;
}): Promise<DepositSendResult> {
  if (!metroIsSolana && !args.mint) return { ok: false, reason: "not a Solana SPL mint" };
  const mintStr = (args.mint || METRO_MINT || "").trim();
  if (!mintStr) return { ok: false, reason: "mint not configured" };
  const treasuryStr = (args.treasury || "").trim();
  if (!treasuryStr) return { ok: false, reason: "treasury missing" };
  if (!(args.amount > 0) || !Number.isFinite(args.amount)) return { ok: false, reason: "enter a $METRO amount" };

  const from = connectedWallet();
  if (!from || connectedChain() === "evm") return { ok: false, reason: "connect Phantom (or a Solana wallet) first" };
  const provider = getSolanaProvider();
  if (!provider) return { ok: false, reason: "no Solana wallet detected — install Phantom" };

  try {
    const { Connection, PublicKey, Transaction } = await import("@solana/web3.js");
    const {
      getAssociatedTokenAddress,
      createAssociatedTokenAccountIdempotentInstruction,
      createTransferCheckedInstruction,
      getMint,
    } = await import("@solana/spl-token");

    const rpc = (args.rpc || metroRpc()).trim();
    const conn = new Connection(rpc, "confirmed");
    const mint = new PublicKey(mintStr);
    const owner = new PublicKey(from);
    const treasury = new PublicKey(treasuryStr);

    const mintInfo = await getMint(conn, mint);
    const decimals = mintInfo.decimals;
    // Integer base units (avoid float blowups for typical 6/9-decimal mints).
    const s = String(args.amount);
    const [whole, frac = ""] = s.split(".");
    const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
    const digits = (whole.replace(/^0+/, "") || "0") + fracPadded;
    const amount = BigInt(digits);
    if (amount <= 0n) return { ok: false, reason: "amount rounds to zero on-chain" };

    const fromAta = await getAssociatedTokenAddress(mint, owner);
    const toAta = await getAssociatedTokenAddress(mint, treasury);
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash });
    // Player pays rent if either ATA is missing (idempotent).
    tx.add(createAssociatedTokenAccountIdempotentInstruction(owner, fromAta, owner, mint));
    tx.add(createAssociatedTokenAccountIdempotentInstruction(owner, toAta, treasury, mint));
    tx.add(createTransferCheckedInstruction(fromAta, mint, toAta, owner, amount, decimals));

    if (provider.signAndSendTransaction) {
      const { signature } = await provider.signAndSendTransaction(tx);
      if (!signature) return { ok: false, reason: "no tx signature" };
      return { ok: true, txHash: signature };
    }
    if (provider.signTransaction) {
      const signed = await provider.signTransaction(tx);
      const sig = await conn.sendRawTransaction(signed.serialize());
      return { ok: true, txHash: sig };
    }
    return { ok: false, reason: "wallet cannot sign transactions" };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
  }
}
