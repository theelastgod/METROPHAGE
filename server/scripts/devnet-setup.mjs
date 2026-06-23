// METROPHAGE — devnet rig for the $METRO bridge (Phase 5 · step 2b).
//
// Stands up a THROWAWAY devnet stand-in for $METRO so the custodial bridge can be
// rehearsed against a real chain for free:
//   - a treasury keypair (the custodian), funded with devnet SOL,
//   - a test SPL mint (6 decimals, like a pump.fun token) with a supply minted to the
//     treasury — this is the devnet stand-in, NOT the real $METRO (which is mainnet,
//     minted on pump.fun when the game is done),
//   - a test player wallet, funded with a little SOL for deposit-side fees/rent.
//
// Writes `.devnet-state.json` (gitignored) with the mint + keypairs, and prints the
// `.dev.vars` lines the Worker reads. Idempotent: reuses existing keys, tops up SOL,
// reuses the mint if it still exists.

import fs from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getMint,
} from "@solana/spl-token";

const STATE = new URL("../.devnet-state.json", import.meta.url);
const RPC = process.env.SOLANA_RPC || clusterApiUrl("devnet");
const DECIMALS = 6;
const SUPPLY = 1_000_000; // test tokens minted to the treasury
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b58 = (kp) => Buffer.from(kp.secretKey).toString("base64");
const fromB64 = (s) => Keypair.fromSecretKey(new Uint8Array(Buffer.from(s, "base64")));

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
}

async function ensureSol(conn, kp, minSol, label) {
  let bal = (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
  if (bal >= minSol) {
    console.log(`  ${label}: ${bal.toFixed(3)} SOL (ok)`);
    return;
  }
  for (let attempt = 1; attempt <= 5 && bal < minSol; attempt++) {
    try {
      console.log(`  ${label}: airdrop 1 SOL (attempt ${attempt})...`);
      const sig = await conn.requestAirdrop(kp.publicKey, 1 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
    } catch (e) {
      console.log(`    airdrop failed: ${String(e?.message || e).slice(0, 80)}`);
      await sleep(2000);
    }
    bal = (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
  }
  if (bal < minSol) throw new Error(`${label} underfunded (${bal} SOL) — devnet faucet rate-limited; retry later or fund ${kp.publicKey.toBase58()} manually`);
  console.log(`  ${label}: ${bal.toFixed(3)} SOL`);
}

async function main() {
  const conn = new Connection(RPC, "confirmed");
  console.log(`RPC: ${RPC}`);
  const state = loadState();

  const treasury = state.treasurySecret ? fromB64(state.treasurySecret) : Keypair.generate();
  const wallet = state.walletSecret ? fromB64(state.walletSecret) : Keypair.generate();
  console.log(`treasury: ${treasury.publicKey.toBase58()}`);
  console.log(`test wallet: ${wallet.publicKey.toBase58()}`);

  console.log("funding (devnet SOL)...");
  await ensureSol(conn, treasury, 1, "treasury");
  await ensureSol(conn, wallet, 0.5, "wallet");

  // mint: reuse if it still exists on-chain, else create.
  let mint = state.mint;
  if (mint) {
    try {
      await getMint(conn, new PublicKey(mint));
      console.log(`mint: ${mint} (reused)`);
    } catch {
      mint = null;
    }
  }
  if (!mint) {
    console.log("creating test mint...");
    const mintPk = await createMint(conn, treasury, treasury.publicKey, null, DECIMALS);
    mint = mintPk.toBase58();
    console.log(`mint: ${mint} (created, ${DECIMALS} decimals)`);
    console.log("minting supply to treasury...");
    const ata = await getOrCreateAssociatedTokenAccount(conn, treasury, mintPk, treasury.publicKey);
    await mintTo(conn, treasury, mintPk, ata.address, treasury, BigInt(SUPPLY) * BigInt(10 ** DECIMALS));
    console.log(`  treasury ATA: ${ata.address.toBase58()} funded with ${SUPPLY} tokens`);
  }

  const out = {
    rpc: RPC,
    mint,
    decimals: DECIMALS,
    treasuryPubkey: treasury.publicKey.toBase58(),
    treasurySecret: b58(treasury),
    walletPubkey: wallet.publicKey.toBase58(),
    walletSecret: b58(wallet),
  };
  fs.writeFileSync(STATE, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${STATE.pathname}`);
  console.log("\n--- .dev.vars (wrangler local secrets) ---");
  console.log(`METRO_DEVNET_MINT=${mint}`);
  console.log(`METRO_TREASURY_SECRET=${b58(treasury)}`);
  console.log(`METRO_RPC=${RPC}`);
  console.log("\ndevnet rig ready.");
}

main().catch((e) => {
  console.error("\nFAILED:", e?.message || e);
  process.exit(1);
});
