// Genesis Key deeds: Metaplex 1/1 SPL NFTs. On-chain owner is the door.
// D1 keeps furniture, guestbook, and the ₵ listing price — never rewrite owner
// without a successful transfer (or a reconcile of a real on-chain move).
// Lazy-imported from the DO so web3.js stays off the 20Hz tick path.

import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
} from "@solana/spl-token";
import { isSolanaPubkey } from "../../src/economy/solanaChain";
import {
  classifyEstateDeed,
  GENESIS_KEY_COUNT,
  tokenFromEstateId,
  walletPubkeyFromPlayerId,
  type EstateDeedKind,
} from "../../src/world/genesisKeys";
import { POOL_EMPTY_USER_MSG } from "./metro";

const CU_LIMIT = 200_000;
const CU_PRICE_MICRO_LAMPORTS = 100_000;
const SEND_ATTEMPTS = 4;
const NFT_DECIMALS = 0;
const NFT_AMOUNT = 1n;
/** Lamports for fee + ATA rent on an NFT transfer. */
const NFT_SOL_NEED = 2_500_000;
const DEED_CACHE_MS = 3 * 60_000;

/** Known marketplace / escrow programs — NFT here is not a playable wallet. */
export const MARKETPLACE_OWNERS = new Set([
  "M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K", // Magic Eden v2
  "MEisE1HzehtrDpLSS1HagTywErpAMLcx18ke4AA4LU2",
  "hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwVZjZgTE",
  "TSWAPaqyCSx2KABk68Shruf4dPBgNjn4WjXdCk5Fc37", // Tensor
  "TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp",
  "1BWutmTvYPwDtmw9abTkS4Ssr8no61spGAvW1X6NDix",
  "CJsLwbP1iu5DuUikHEJnLfANgKy6rtBXgwl7DJvwXKA",
]);

export function isMarketplaceOwner(owner: string | null | undefined): boolean {
  const o = (owner || "").trim();
  return !!o && MARKETPLACE_OWNERS.has(o);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isBlockhashGone(err: unknown): boolean {
  const m = String((err as Error)?.message ?? err);
  return /BlockhashNotFound|blockhash not found/i.test(m);
}

export interface EstatesNftEnv {
  DB: D1Database;
  METRO_RPC?: string;
  METRO_TREASURY_SECRET?: string;
  METRO_CLUSTER?: string;
  METRO_ALLOW_SIM?: string;
}

export interface NftCfg {
  rpc: string;
  treasurySecretB64: string;
}

export type NftOpResult =
  | { ok: true; sig?: string; owner: string }
  | { ok: false; reason: string };

export function treasuryFromSecret(secretB64: string | undefined): { kp: Keypair; pubkey: string } | null {
  const s = (secretB64 || "").trim();
  if (!s || /^0x[0-9a-fA-F]{64}$/.test(s) || /^[0-9a-fA-F]{64}$/.test(s)) return null;
  try {
    const kp = Keypair.fromSecretKey(b64ToBytes(s));
    return { kp, pubkey: kp.publicKey.toBase58() };
  } catch {
    return null;
  }
}

export function defaultRpc(env: EstatesNftEnv): string {
  if ((env.METRO_RPC || "").trim()) return env.METRO_RPC!.trim();
  const c = (env.METRO_CLUSTER || "").toLowerCase();
  return c === "devnet" || c === "testnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com";
}

/** Guest / NPC / unsigned ids cannot hold a Genesis Key. */
export function canHoldGenesisKey(playerId: string): boolean {
  return !!walletPubkeyFromPlayerId(playerId);
}

export const GUEST_KEY_MSG = "Link Phantom to hold this False Address.";

export interface ChainDeed {
  owner: string | null;
  marketplace: boolean;
  kind: EstateDeedKind;
  source: "das" | "spl" | "none";
}

function kindFor(mint: string | null, chainOwner: string | null, treasury: string | null, ownerWallet: string | null, marketplace: boolean): EstateDeedKind {
  return classifyEstateDeed({ mint, chainOwner, treasury, ownerWallet, marketplace });
}

async function dasOwner(rpc: string, mint: string): Promise<string | null> {
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "gkey", method: "getAsset", params: { id: mint } }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: { ownership?: { owner?: string } } };
    const o = j?.result?.ownership?.owner;
    return typeof o === "string" && isSolanaPubkey(o) ? o : null;
  } catch {
    return null;
  }
}

async function splOwner(conn: Connection, mint: PublicKey): Promise<string | null> {
  try {
    const largest = await conn.getTokenLargestAccounts(mint, "confirmed");
    const held = largest.value.find((a) => Number(a.uiAmount) > 0 || (a.amount && a.amount !== "0"));
    if (!held) return null;
    const acc = await getAccount(conn, held.address, "confirmed");
    return acc.owner.toBase58();
  } catch {
    return null;
  }
}

export async function readNftOwner(rpc: string, mint: string): Promise<{ owner: string | null; source: "das" | "spl" | "none" }> {
  if (!isSolanaPubkey(mint)) return { owner: null, source: "none" };
  const das = await dasOwner(rpc, mint);
  if (das) return { owner: das, source: "das" };
  try {
    const conn = new Connection(rpc, "confirmed");
    const spl = await splOwner(conn, new PublicKey(mint));
    return { owner: spl, source: spl ? "spl" : "none" };
  } catch {
    return { owner: null, source: "none" };
  }
}

export async function resolveDeed(args: {
  rpc: string;
  mint: string | null;
  treasury: string | null;
  d1Owner: string | null;
}): Promise<ChainDeed> {
  const mint = (args.mint || "").trim() || null;
  const ownerWallet = walletPubkeyFromPlayerId(args.d1Owner);
  if (!mint) {
    return { owner: null, marketplace: false, kind: "unminted", source: "none" };
  }
  const { owner, source } = await readNftOwner(args.rpc, mint);
  const marketplace = isMarketplaceOwner(owner);
  return {
    owner,
    marketplace,
    kind: kindFor(mint, owner, args.treasury, ownerWallet, marketplace),
    source,
  };
}

export function deedSysLine(kind: EstateDeedKind): string | null {
  if (kind === "marketplace") return "OFF-WORLD HOLDING — furniture locked until the Key leaves marketplace escrow";
  if (kind === "off_world") return "deed moved off-world — plot locked until that wallet signs in";
  return null;
}

async function sendNftTx(
  conn: Connection,
  treasury: Keypair,
  mint: PublicKey,
  fromOwner: PublicKey,
  toOwner: PublicKey,
): Promise<NftOpResult> {
  // Treasury is the only signer we hold. Pull-from-player requires the NFT already in the vault.
  if (fromOwner.toBase58() !== treasury.publicKey.toBase58()) {
    return { ok: false, reason: "Genesis Key is not in the city vault" };
  }
  let solBal = 0;
  try {
    solBal = await conn.getBalance(treasury.publicKey, "confirmed");
  } catch {
    return { ok: false, reason: POOL_EMPTY_USER_MSG };
  }
  if (solBal < NFT_SOL_NEED) return { ok: false, reason: POOL_EMPTY_USER_MSG };

  const fromAta = await getAssociatedTokenAddress(mint, fromOwner);
  const toAta = await getAssociatedTokenAddress(mint, toOwner);
  try {
    const acc = await getAccount(conn, fromAta, "confirmed");
    if (acc.amount < NFT_AMOUNT) return { ok: false, reason: "Genesis Key is not in the city vault" };
  } catch {
    return { ok: false, reason: "Genesis Key is not in the city vault" };
  }

  const ix = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: CU_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE_MICRO_LAMPORTS }),
    createAssociatedTokenAccountIdempotentInstruction(treasury.publicKey, toAta, toOwner, mint),
    createTransferCheckedInstruction(fromAta, mint, toAta, treasury.publicKey, NFT_AMOUNT, NFT_DECIMALS),
  ];

  let lastReason = POOL_EMPTY_USER_MSG;
  for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
    try {
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: treasury.publicKey, recentBlockhash: blockhash });
      tx.add(...ix);
      tx.sign(treasury);
      const raw = tx.serialize({ requireAllSignatures: true, verifySignatures: false });
      const sig = await conn.sendRawTransaction(raw, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 3,
      });
      try {
        await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      } catch {
        /* confirm may lag; caller re-reads owner */
      }
      console.log(`[gkey] transfer mint=${mint.toBase58()} → ${toOwner.toBase58()} sig=${sig}`);
      return { ok: true, sig, owner: toOwner.toBase58() };
    } catch (e) {
      lastReason = String((e as Error)?.message ?? e).slice(0, 160);
      if (!isBlockhashGone(e) && attempt === SEND_ATTEMPTS - 1) break;
    }
  }
  return { ok: false, reason: lastReason };
}

/** Treasury → buyer. Fails closed if the Key is not sitting in the vault. */
export async function transferKeyToWallet(cfg: NftCfg, mint: string, buyerWallet: string): Promise<NftOpResult> {
  if (!isSolanaPubkey(mint) || !isSolanaPubkey(buyerWallet)) {
    return { ok: false, reason: "invalid Genesis Key mint or wallet" };
  }
  const treas = treasuryFromSecret(cfg.treasurySecretB64);
  if (!treas) return { ok: false, reason: POOL_EMPTY_USER_MSG };
  const conn = new Connection(cfg.rpc, "confirmed");
  return sendNftTx(conn, treas.kp, new PublicKey(mint), treas.kp.publicKey, new PublicKey(buyerWallet));
}

export const GENESIS_COSMETIC_ID = "genesis";

export async function grantGenesisCosmetic(db: D1Database, playerId: string): Promise<boolean> {
  try {
    const ins = await db
      .prepare("INSERT OR IGNORE INTO player_cosmetics (player, cosmetic_id, equipped, at) VALUES (?,?,0,?)")
      .bind(playerId, GENESIS_COSMETIC_ID, Date.now())
      .run();
    return (ins.meta.changes ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function tokensHeldInGame(db: D1Database, playerId: string): Promise<number[]> {
  try {
    const { results } = await db
      .prepare("SELECT token FROM estates WHERE owner = ? AND token IS NOT NULL ORDER BY token")
      .bind(playerId)
      .all<{ token: number }>();
    return (results ?? [])
      .map((r) => Math.floor(Number(r.token) || 0))
      .filter((t) => t >= 1 && t <= GENESIS_KEY_COUNT);
  } catch {
    return [];
  }
}

export async function grantGenesisIfHolder(db: D1Database, playerId: string): Promise<number[]> {
  const tokens = await tokensHeldInGame(db, playerId);
  if (tokens.length) await grantGenesisCosmetic(db, playerId);
  return tokens;
}

export function tokenForZone(zone: string): number | null {
  return tokenFromEstateId(zone);
}

export function shouldRefreshDeed(checkedAt: number, now = Date.now()): boolean {
  return !checkedAt || now - checkedAt > DEED_CACHE_MS;
}

type EstateNftRow = { id: string; owner: string | null; owner_name: string | null; nft: string | null; token: number | null };

/**
 * Bind D1 owner to the on-chain holder. Unknown wallets lock the plot (`w:<pubkey>`)
 * until that wallet signs in; marketplace escrow is tagged via owner_name.
 */
export async function reconcileEstates(env: EstatesNftEnv): Promise<{ checked: number; moved: number }> {
  const treas = treasuryFromSecret(env.METRO_TREASURY_SECRET);
  const rpc = defaultRpc(env);
  if (!treas) return { checked: 0, moved: 0 };
  let rows: EstateNftRow[] = [];
  try {
    const q = await env.DB.prepare("SELECT id, owner, owner_name, nft, token FROM estates WHERE nft IS NOT NULL AND nft != ''").all<EstateNftRow>();
    rows = q.results ?? [];
  } catch {
    return { checked: 0, moved: 0 };
  }
  let moved = 0;
  for (const row of rows) {
    const mint = (row.nft || "").trim();
    if (!mint) continue;
    const deed = await resolveDeed({ rpc, mint, treasury: treas.pubkey, d1Owner: row.owner });
    const chain = deed.owner;
    if (!chain) continue;
    if (chain === treas.pubkey) {
      if (row.owner_name === "OFF-WORLD HOLDING") {
        await env.DB.prepare("UPDATE estates SET owner_name = NULL, updated = ? WHERE id = ? AND owner_name = ?")
          .bind(Date.now(), row.id, "OFF-WORLD HOLDING")
          .run();
      }
      continue;
    }
    const asPlayer = `w:${chain}`;
    if (deed.marketplace) {
      if (row.owner_name !== "OFF-WORLD HOLDING") {
        await env.DB.prepare("UPDATE estates SET owner_name = ?, for_sale = 0, updated = ? WHERE id = ?")
          .bind("OFF-WORLD HOLDING", Date.now(), row.id)
          .run();
        moved++;
        console.log(`[gkey] marketplace escrow ${row.id} mint=${mint}`);
      }
      continue;
    }
    if (row.owner === asPlayer) continue;
    // Unknown (or newly signed-in) wallet is the deed — lock until they play.
    await env.DB.prepare("UPDATE estates SET owner = ?, owner_name = COALESCE((SELECT name FROM players WHERE id = ?), owner_name), for_sale = 0, updated = ? WHERE id = ?")
      .bind(asPlayer, asPlayer, Date.now(), row.id)
      .run();
    moved++;
    console.log(`[gkey] reconcile ${row.id} → ${asPlayer}`);
    await grantGenesisIfHolder(env.DB, asPlayer);
  }
  return { checked: rows.length, moved };
}
