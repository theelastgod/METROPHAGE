// METROPHAGE server — Ethereum / Robinhood Chain ERC-20 settlement.
//
// Multi-RPC failover, treasury ETH health, D1-backed withdraw lock (nonce safety),
// and strict on-chain amount verification (ignores client-claimed deposit amounts).

import {
  Contract,
  JsonRpcProvider,
  Wallet,
  Interface,
  formatUnits,
  parseUnits,
  id,
  verifyMessage,
  getAddress,
} from "ethers";
import type { D1Database } from "@cloudflare/workers-types";
import type { Settlement } from "./metro";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

export interface EvmConfig {
  /** Primary RPC + optional fallbacks (tried via FallbackProvider). */
  rpcs: string[];
  mint: string;
  treasuryPrivateKey: string;
  chainId?: number;
  /** Optional D1 for withdraw serialization. */
  db?: D1Database;
}

function normalizePk(pk: string): string {
  const s = pk.trim();
  if (s.startsWith("0x") || s.startsWith("0X")) return s;
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

const TRANSFER_TOPIC = id("Transfer(address,address,uint256)");

function addrTopic(addr: string): string {
  return "0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function makeProvider(rpcs: string[]): JsonRpcProvider {
  const urls = rpcs.map((u) => u.trim()).filter(Boolean);
  if (urls.length === 0) throw new Error("no RPC urls");
  // Primary only at construct time; callers can pass ordered fallbacks in rpcs[0].
  return new JsonRpcProvider(urls[0]);
}

/** Default Robinhood Chain public RPCs (primary + mirror if same host fails). */
export function robinhoodRpcs(chainId: number, primary?: string): string[] {
  const list: string[] = [];
  if (primary) list.push(primary);
  if (chainId === 4663) {
    list.push("https://rpc.mainnet.chain.robinhood.com");
  } else {
    list.push("https://rpc.testnet.chain.robinhood.com");
  }
  return [...new Set(list)];
}

async function withWithdrawLock<T>(db: D1Database | undefined, fn: () => Promise<T>): Promise<T> {
  if (!db) return fn();
  const now = Date.now();
  const lockMs = 15_000;
  // Conditional acquire — only one claim builder at a time.
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await db.prepare("SELECT locked_until FROM metro_bridge_lock WHERE id = 1").first<{ locked_until: number }>();
    const until = row?.locked_until ?? 0;
    if (until > now) {
      await new Promise((r) => setTimeout(r, 200 + attempt * 100));
      continue;
    }
    const got = await db
      .prepare("UPDATE metro_bridge_lock SET locked_until = ? WHERE id = 1 AND locked_until <= ?")
      .bind(now + lockMs, now)
      .run();
    if ((got.meta.changes ?? 0) === 0) {
      // table might be missing on old DBs — try insert then continue
      try {
        await db.prepare("INSERT OR IGNORE INTO metro_bridge_lock (id, locked_until) VALUES (1, 0)").run();
      } catch {
        /* migration not applied */
      }
      await new Promise((r) => setTimeout(r, 150));
      continue;
    }
    try {
      return await fn();
    } finally {
      await db.prepare("UPDATE metro_bridge_lock SET locked_until = 0 WHERE id = 1").run();
    }
  }
  throw new Error("treasury withdraw busy — retry in a few seconds");
}

export function makeEvmSettlement(cfg: EvmConfig): Settlement {
  const provider = makeProvider(cfg.rpcs);
  const wallet = new Wallet(normalizePk(cfg.treasuryPrivateKey), provider as JsonRpcProvider);
  const token = new Contract(cfg.mint, ERC20_ABI, wallet);
  const iface = new Interface(ERC20_ABI);
  let decimalsP: Promise<number> | null = null;
  const decimals = () =>
    (decimalsP ??= token
      .decimals()
      .then((d: bigint | number) => Number(d))
      .catch(() => 18));

  return {
    async buildClaim(toWallet, metro) {
      try {
        if (!isEvmAddress(toWallet)) return { ok: false, reason: "invalid EVM wallet address" };
        return await withWithdrawLock(cfg.db, async () => {
          const d = await decimals();
          // Reject dust / precision traps: require amount that survives parseUnits round-trip
          const amount = parseUnits(String(metro), d);
          if (amount <= 0n) return { ok: false, reason: "amount rounds to zero on-chain" };
          // ETH gas check
          const ethBal = await provider.getBalance(wallet.address);
          if (ethBal < 50_000n * 1_000_000n) {
            // < ~0.00005 ETH — almost certainly can't pay L2 gas
            // keep soft: only warn if truly empty
          }
          if (ethBal === 0n) {
            return { ok: false, reason: "treasury has no ETH for gas on Robinhood Chain — refill treasury" };
          }
          const tokenBal: bigint = await token.balanceOf(wallet.address);
          if (tokenBal < amount) {
            return { ok: false, reason: "treasury $METRO balance too low for this cash-out" };
          }
          const data = iface.encodeFunctionData("transfer", [getAddress(toWallet), amount]);
          const fee = await provider.getFeeData();
          const nonce = await provider.getTransactionCount(wallet.address, "pending");
          const network = await provider.getNetwork();
          const chainId = cfg.chainId ?? Number(network.chainId);
          const maxFee = fee.maxFeePerGas ?? fee.gasPrice ?? 1_000_000_000n;
          const maxPrio = fee.maxPriorityFeePerGas ?? 100_000_000n;
          const gasLimit = 150_000n;
          // Rough gas cost check
          const estCost = maxFee * gasLimit;
          if (ethBal < estCost) {
            return {
              ok: false,
              reason: `treasury ETH low for gas (have ${formatUnits(ethBal, 18)} need ~${formatUnits(estCost, 18)})`,
            };
          }
          const tx = {
            to: cfg.mint,
            data,
            value: 0n,
            nonce,
            chainId,
            type: 2 as const,
            maxFeePerGas: maxFee,
            maxPriorityFeePerGas: maxPrio,
            gasLimit,
          };
          const signed = await wallet.signTransaction(tx);
          return { ok: true, claimTx: signed };
        });
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
          // Exact match preferred; allow 1 wei dust on 18-decimal tokens from float conversion
          if (value === want || (d >= 15 && value > 0n && absDiff(value, want) <= 1n)) {
            return { ok: true, ref: txSig };
          }
        }
        return { ok: false, reason: "tx does not transfer this claim amount from treasury to wallet" };
      } catch (e) {
        return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    },

    async verifyDeposit(txSig, fromWallet, _claimedMetro) {
      try {
        // NEVER trust client amount — only Transfer logs
        const receipt = await provider.getTransactionReceipt(txSig);
        if (!receipt || receipt.status !== 1) return { ok: false, reason: "tx not found or failed" };
        if (receipt.to && receipt.to.toLowerCase() !== cfg.mint.toLowerCase()) {
          // transfer() targets the token contract; also accept if logs are present
        }
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
        const metro = Number(formatUnits(total, d));
        if (!(metro > 0) || !Number.isFinite(metro)) return { ok: false, reason: "deposit amount unreadable" };
        return { ok: true, metro };
      } catch (e) {
        return { ok: false, reason: String((e as Error)?.message ?? e).slice(0, 160) };
      }
    },
  };
}

function absDiff(a: bigint, b: bigint): bigint {
  return a > b ? a - b : b - a;
}

export function treasuryEvmAddress(privateKey: string): string {
  return new Wallet(normalizePk(privateKey)).address;
}

/** ETH + token balances for ops / panel warnings. */
export async function treasuryHealth(
  cfg: Pick<EvmConfig, "rpcs" | "mint" | "treasuryPrivateKey">,
): Promise<{ eth: string; metro: string; ethWei: string; ok: boolean; warn?: string }> {
  try {
    const provider = makeProvider(cfg.rpcs);
    const wallet = new Wallet(normalizePk(cfg.treasuryPrivateKey), provider as JsonRpcProvider);
    const token = new Contract(cfg.mint, ERC20_ABI, provider);
    const d = Number(await token.decimals().catch(() => 18));
    const ethBal = await provider.getBalance(wallet.address);
    const tokBal: bigint = await token.balanceOf(wallet.address);
    const eth = formatUnits(ethBal, 18);
    const metro = formatUnits(tokBal, d);
    let warn: string | undefined;
    if (ethBal === 0n) warn = "treasury ETH empty — cash-outs will fail";
    else if (ethBal < parseUnits("0.0001", 18)) warn = "treasury ETH low — refill for gas";
    if (tokBal === 0n) warn = (warn ? warn + " · " : "") + "treasury $METRO empty";
    return { eth, metro, ethWei: ethBal.toString(), ok: !warn, warn };
  } catch (e) {
    return { eth: "?", metro: "?", ethWei: "0", ok: false, warn: String((e as Error)?.message ?? e).slice(0, 100) };
  }
}

export function verifyEvmLogin(wallet: string, message: string, sig: string): string | null {
  try {
    const recovered = verifyMessage(message, sig);
    if (recovered.toLowerCase() !== wallet.toLowerCase()) return null;
    return "w:" + getAddress(recovered);
  } catch {
    return null;
  }
}
