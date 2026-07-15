// One-click ERC-20 deposit via MetaMask on Robinhood Chain.

import { getEvmProvider, ensureRobinhoodNetwork, connectedWallet } from "./wallet";
import { METRO_MINT, metroIsEvm } from "./metro";

interface EvmProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

const ERC20_TRANSFER = "a9059cbb"; // transfer(address,uint256)

function padAddr(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

/** Encode amount as uint256 hex. Uses whole-token units × 10^decimals. */
function encodeAmount(amount: number, decimals: number): string {
  if (!(amount > 0) || !Number.isFinite(amount)) throw new Error("bad amount");
  // Avoid float blowups: split integer + fractional part
  const s = String(amount);
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const digits = (whole.replace(/^0+/, "") || "0") + fracPadded;
  let hex = BigInt(digits).toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return hex.padStart(64, "0");
}

async function readDecimals(eth: EvmProvider, mint: string): Promise<number> {
  try {
    const data = "0x313ce567"; // decimals()
    const raw = (await eth.request({
      method: "eth_call",
      params: [{ to: mint, data }, "latest"],
    })) as string;
    return parseInt(raw, 16) || 18;
  } catch {
    return 18;
  }
}

export interface DepositSendResult {
  ok: boolean;
  txHash?: string;
  reason?: string;
}

/**
 * MetaMask: transfer `amount` $METRO (human units) to `treasury`.
 * Returns tx hash for /metro/deposit claim.
 */
export async function sendErc20Deposit(args: {
  treasury: string;
  amount: number;
  mint?: string;
}): Promise<DepositSendResult> {
  if (!metroIsEvm && !args.mint) return { ok: false, reason: "not an ERC-20 mint" };
  const mint = args.mint || METRO_MINT;
  const from = connectedWallet();
  if (!from) return { ok: false, reason: "connect a wallet first" };
  const eth = getEvmProvider() as EvmProvider | null;
  if (!eth?.request) return { ok: false, reason: "no EVM wallet — connect via WalletConnect or extension" };
  try {
    await ensureRobinhoodNetwork();
    const decimals = await readDecimals(eth, mint);
    const data =
      "0x" + ERC20_TRANSFER + padAddr(args.treasury) + encodeAmount(args.amount, decimals);
    const txHash = (await eth.request({
      method: "eth_sendTransaction",
      params: [
        {
          from,
          to: mint,
          data,
          value: "0x0",
        },
      ],
    })) as string;
    if (!txHash) return { ok: false, reason: "no tx hash" };
    return { ok: true, txHash };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
  }
}
