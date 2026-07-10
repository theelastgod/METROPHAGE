// METROPHAGE server — Ethereum / ERC-20 settlement for the $METRO bridge.
//
// Implements the `Settlement` seam from metro.ts against an EVM chain (Sepolia
// first, mainnet after counsel). Treasury private key is a SERVER SECRET
// (wrangler secret / .dev.vars). Lazy-imported from index.ts only when the mint
// looks like an ERC-20 address (0x…).
//
// GAS MODEL (differs from Solana $0-launch):
//   * Deposits: player sends ERC-20 transfer to treasury (player pays gas).
//   * Withdrawals: treasury signs a fully-formed ERC-20 transfer tx and the
//     CLIENT broadcasts it via eth_sendRawTransaction. The treasury still
//     pays gas (from is treasury), so the treasury needs a small ETH balance.
//     This is the standard EVM custodial pattern without a claim contract.
//
// Mint must be an ERC-20 with standard Transfer events + transfer(address,uint256).

import { Contract, JsonRpcProvider, Wallet, Interface, formatUnits, parseUnits, id, verifyMessage } from "ethers";
import type { Settlement } from "./metro";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

export interface EvmConfig {
  rpc: string;
  mint: string; // ERC-20 contract address
  /** Hex private key (0x… or raw 64 hex) for the treasury wallet. */
  treasuryPrivateKey: string;
  chainId?: number;
}

function normalizePk(pk: string): string {
  const s = pk.trim();
  if (s.startsWith("0x") || s.startsWith("0X")) return s;
  // base64 32-byte secret (legacy METRO_TREASURY_SECRET shape) → hex
  try {
    const bin = atob(s);
    if (bin.length === 32) {
      let hex = "0x";
      for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
      return hex;
    }
  } catch {
    /* not b64 */
  }
  if (/^[0-9a-fA-F]{64}$/.test(s)) return "0x" + s;
  return s;
}

export function isEvmAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test((s || "").trim());
}

export function isEvmMint(s: string): boolean {
  return isEvmAddress(s);
}

/** Transfer topic0 for ERC-20 Transfer(address,address,uint256). */
const TRANSFER_TOPIC = id("Transfer(address,address,uint256)");

function addrTopic(addr: string): string {
  return "0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export function makeEvmSettlement(cfg: EvmConfig): Settlement {
  const provider = new JsonRpcProvider(cfg.rpc);
  const wallet = new Wallet(normalizePk(cfg.treasuryPrivateKey), provider);
  const token = new Contract(cfg.mint, ERC20_ABI, wallet);
  const iface = new Interface(ERC20_ABI);
  let decimalsP: Promise<number> | null = null;
  const decimals = () =>
    (decimalsP ??= token.decimals().then((d: bigint | number) => Number(d)).catch(() => 18));

  return {
    async buildClaim(toWallet, metro) {
      try {
        if (!isEvmAddress(toWallet)) return { ok: false, reason: "invalid EVM wallet address" };
        const d = await decimals();
        const amount = parseUnits(String(metro), d);
        const data = iface.encodeFunctionData("transfer", [toWallet, amount]);
        const fee = await provider.getFeeData();
        const nonce = await provider.getTransactionCount(wallet.address, "pending");
        const network = await provider.getNetwork();
        const chainId = cfg.chainId ?? Number(network.chainId);
        const tx = {
          to: cfg.mint,
          data,
          value: 0n,
          nonce,
          chainId,
          type: 2 as const,
          maxFeePerGas: fee.maxFeePerGas ?? fee.gasPrice ?? 1_000_000_000n,
          maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 1_000_000_000n,
          gasLimit: 120_000n,
        };
        const signed = await wallet.signTransaction(tx);
        return { ok: true, claimTx: signed };
      } catch (e) {
        return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    },

    async verifyClaim(txSig, walletAddr, metro) {
      try {
        const receipt = await provider.getTransactionReceipt(txSig);
        if (!receipt || receipt.status !== 1) return { ok: false, reason: "tx not found or failed" };
        const d = await decimals();
        const want = parseUnits(String(metro), d);
        const fromTopic = addrTopic(wallet.address);
        const toTopic = addrTopic(walletAddr);
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== cfg.mint.toLowerCase()) continue;
          if (log.topics[0] !== TRANSFER_TOPIC) continue;
          if (log.topics[1]?.toLowerCase() !== fromTopic.toLowerCase()) continue;
          if (log.topics[2]?.toLowerCase() !== toTopic.toLowerCase()) continue;
          const value = BigInt(log.data);
          if (value === want) return { ok: true, ref: txSig };
        }
        return { ok: false, reason: "tx does not transfer this claim amount from treasury to wallet" };
      } catch (e) {
        return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    },

    async verifyDeposit(txSig, fromWallet, _claimedMetro) {
      try {
        const receipt = await provider.getTransactionReceipt(txSig);
        if (!receipt || receipt.status !== 1) return { ok: false, reason: "tx not found or failed" };
        const d = await decimals();
        const fromTopic = addrTopic(fromWallet);
        const toTopic = addrTopic(wallet.address);
        let total = 0n;
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== cfg.mint.toLowerCase()) continue;
          if (log.topics[0] !== TRANSFER_TOPIC) continue;
          if (log.topics[1]?.toLowerCase() !== fromTopic.toLowerCase()) continue;
          if (log.topics[2]?.toLowerCase() !== toTopic.toLowerCase()) continue;
          total += BigInt(log.data);
        }
        if (total <= 0n) return { ok: false, reason: "no $METRO ERC-20 received by treasury from this wallet" };
        return { ok: true, metro: Number(formatUnits(total, d)) };
      } catch (e) {
        return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    },
  };
}

export function treasuryEvmAddress(privateKey: string): string {
  return new Wallet(normalizePk(privateKey)).address;
}

/** Verify an EIP-191 personal_sign over the same login message used for Solana SIWS. */
export function verifyEvmLogin(wallet: string, message: string, sig: string): string | null {
  try {
    const recovered = verifyMessage(message, sig);
    if (recovered.toLowerCase() !== wallet.toLowerCase()) return null;
    return "w:" + recovered;
  } catch {
    return null;
  }
}
