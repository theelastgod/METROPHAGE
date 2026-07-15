// METROPHAGE — pre-CA treasury preparation.
//
// AUTHORITATIVE path: Robinhood Chain / EVM treasury (0x private key).
//   node scripts/mainnet-prepare.mjs --evm
//   node scripts/mainnet-prepare.mjs --evm --replace
//
// Dormant alternate: Solana keypair (only if METRO_SETTLEMENT=solana):
//   node scripts/mainnet-prepare.mjs
//   node scripts/mainnet-prepare.mjs --replace
//
// Writes (gitignored): server/.mainnet-treasury.json (+ .solana-treasury.json for SOL)
//
// After you have the Robinhood ERC-20 mint CA:
//   set METRO_MINT + VITE_METRO_MINT to the 0x address; arm mainnet only with counsel.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import { Wallet } from "ethers";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dir, "../.mainnet-treasury.json");
const OUT_SOL = path.join(__dir, "../.solana-treasury.json");
const BACKUP_DIR = path.join(__dir, "../.wrangler/secret-backups");
const printSecret = process.argv.includes("--print-secret");
const replace = process.argv.includes("--replace") || process.argv.includes("--replace-legacy");
const wantEvm = process.argv.includes("--evm") || process.argv.includes("--robinhood");

function chmod600(file) {
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* best effort */
  }
}

function readExisting() {
  try {
    return JSON.parse(fs.readFileSync(OUT, "utf8"));
  } catch {
    return null;
  }
}

function secretKind(secret) {
  const v = String(secret || "").trim();
  if (!v) return "missing";
  if (/^0x[0-9a-fA-F]{64}$/.test(v) || /^[0-9a-fA-F]{64}$/.test(v)) return "evm";
  try {
    const bytes = Buffer.from(v, "base64").length;
    if (bytes === 64) return "solana";
    if (bytes === 32) return "evm-base64";
    return `unknown-base64-${bytes}`;
  } catch {
    return "unknown";
  }
}

function writeRecord(record) {
  const body = JSON.stringify(record, null, 2);
  fs.writeFileSync(OUT, body, { mode: 0o600 });
  chmod600(OUT);
  if (record.chain === "solana") {
    fs.writeFileSync(OUT_SOL, body, { mode: 0o600 });
    chmod600(OUT_SOL);
  }
}

function backupExisting(existing) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const kind = existing.chain || secretKind(existing.treasurySecret) || "legacy";
  const backup = path.join(BACKUP_DIR, `treasury-${kind}-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(existing, null, 2), { mode: 0o600 });
  chmod600(backup);
  return backup;
}

function makeSolanaRecord(kp) {
  const address = kp.publicKey.toBase58();
  const secretB64 = Buffer.from(kp.secretKey).toString("base64");
  return {
    chain: "solana",
    cluster: "mainnet-beta",
    treasuryAddress: address,
    treasuryPubkey: address,
    treasurySecret: secretB64,
    secretFormat: "base64-64-byte-solana-keypair",
    createdAt: new Date().toISOString(),
    note:
      "AUTHORITATIVE Solana treasury for $METRO. Never commit. Receives SPL deposits; " +
      "partially signs claims (player pays SOL). Treasury never spends SOL. " +
      "EVM alternate: node scripts/mainnet-prepare.mjs --evm --replace",
    mint: null,
    mainnetArmed: false,
    authoritative: true,
  };
}

function makeEvmRecord(wallet) {
  return {
    chain: "robinhood",
    cluster: "robinhood-testnet",
    treasuryAddress: wallet.address,
    treasurySecret: wallet.privateKey,
    secretFormat: "evm-hex-private-key",
    createdAt: new Date().toISOString(),
    note:
      "AUTHORITATIVE Robinhood Chain treasury for $METRO. Never commit. " +
      "Receives ERC-20 deposits; signs cash-outs (fund with ETH for gas). " +
      "Solana alternate: node scripts/mainnet-prepare.mjs --replace (no --evm).",
    mint: null,
    mainnetArmed: false,
    authoritative: true,
  };
}

function printSolanaSteps(record) {
  console.log(`
── Install Solana treasury secret on Cloudflare (no CA required yet) ─────
  cd server
  node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \\
    | npx wrangler secret put METRO_TREASURY_SECRET
  # optional force (default in wrangler.toml is already solana):
  # echo -n solana | npx wrangler secret put METRO_SETTLEMENT
  npx wrangler deploy

── When you have the Solana SPL mint CA ──────────────────────────────────
  cd server
  node scripts/mainnet-arm.mjs <base58_MINT>

── Until then ────────────────────────────────────────────────────────────
  • Do NOT set METRO_MINT / VITE_METRO_MINT until the CA is real
  • METRO_MAINNET_ARMED stays OFF until counsel
  • Treasury never needs SOL (players pay fees)

Treasury (Solana — AUTHORITATIVE):
  address: ${record.treasuryAddress}
  file:    ${OUT}
  alias:   ${OUT_SOL}`);
  if (printSecret) console.log(`  METRO_TREASURY_SECRET=${record.treasurySecret}`);
  else console.log("  (re-run with --print-secret to show the base64 secret)");
}

function printEvmSteps(record) {
  console.log(`
── Install Robinhood treasury secret on Cloudflare (no CA required yet) ──
  cd server
  node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \\
    | npx wrangler secret put METRO_TREASURY_SECRET
  # METRO_SETTLEMENT=robinhood is already in wrangler.toml [vars]
  npx wrangler deploy

── When you have the Robinhood ERC-20 mint CA ────────────────────────────
  npx wrangler secret put METRO_MINT          # 0x…
  # client: VITE_METRO_MINT=0x… VITE_METRO_CLUSTER=robinhood-testnet|robinhood

Treasury (Robinhood Chain — AUTHORITATIVE):
  address: ${record.treasuryAddress}
  file:    ${OUT}`);
  if (printSecret) console.log(`  METRO_TREASURY_SECRET=${record.treasurySecret}`);
  else console.log("  (re-run with --print-secret to show the hex private key)");
}

const existing = readExisting();
if (existing && !replace) {
  const kind = existing.chain || secretKind(existing.treasurySecret);
  const wantKind = wantEvm ? "robinhood" : "solana";
  const same =
    (wantKind === "solana" && (kind === "solana" || secretKind(existing.treasurySecret) === "solana")) ||
    (wantKind === "robinhood" && (kind === "robinhood" || secretKind(existing.treasurySecret) === "evm"));
  if (same) {
    console.log(`Reusing existing ${kind} treasury (pass --replace to mint a new one).`);
    console.log(`  address: ${existing.treasuryAddress || existing.treasuryPubkey}`);
    if (wantEvm) printEvmSteps(existing);
    else printSolanaSteps(existing);
    process.exit(0);
  }
  console.error(
    `Existing treasury is ${kind}; you asked for ${wantKind}. ` +
      `Re-run with --replace (previous file is backed up under .wrangler/secret-backups/).`,
  );
  process.exit(1);
}

if (existing) {
  const backup = backupExisting(existing);
  console.log(`Backed up previous treasury → ${backup}`);
}

if (wantEvm) {
  const wallet = Wallet.createRandom();
  const record = makeEvmRecord(wallet);
  writeRecord(record);
  console.log("Created Robinhood/EVM treasury (AUTHORITATIVE).");
  printEvmSteps(record);
} else {
  const kp = Keypair.generate();
  const record = makeSolanaRecord(kp);
  writeRecord(record);
  console.log("Created AUTHORITATIVE Solana treasury.");
  printSolanaSteps(record);
}
