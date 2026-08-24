// METROPHAGE — pre-CA treasury preparation (Solana).
//
//   node scripts/mainnet-prepare.mjs            # create (or reuse) the Solana treasury
//   node scripts/mainnet-prepare.mjs --replace  # mint a new one (previous is backed up)
//
// Writes (gitignored): server/.mainnet-treasury.json + .solana-treasury.json
// Does not mint a new secret on resume.
//
// After pump.fun creates the mint:
//   set METRO_MINT + VITE_METRO_MINT to the base58 CA; arm mainnet only with counsel.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dir, "../.mainnet-treasury.json");
const OUT_SOL = path.join(__dir, "../.solana-treasury.json");
const BACKUP_DIR = path.join(__dir, "../.wrangler/secret-backups");
const printSecret = process.argv.includes("--print-secret");
const replace = process.argv.includes("--replace") || process.argv.includes("--replace-legacy");

if (process.argv.includes("--evm") || process.argv.includes("--robinhood")) {
  console.error("EVM treasury is not a live path. Omit --evm and generate a Solana keypair.");
  process.exit(1);
}

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
  fs.writeFileSync(OUT_SOL, body, { mode: 0o600 });
  chmod600(OUT_SOL);
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
      "Worker broadcasts cash-outs and pays SOL (no player-fee fallback).",
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
  # METRO_SETTLEMENT=solana is already in wrangler.toml [vars]
  npx wrangler deploy

── When pump.fun has created the mint ────────────────────────────────────
  npx wrangler secret put METRO_MINT          # base58, never lowercased
  npx wrangler secret put METRO_RPC           # Helius or cluster RPC
  # client: VITE_METRO_MINT=<base58> VITE_METRO_CLUSTER=devnet|mainnet-beta

  • Do NOT set METRO_MINT / VITE_METRO_MINT until the CA is real
  • METRO_MAINNET_ARMED stays OFF until counsel
  • Fund the treasury with a SOL float for cash-out fees + ATA rent

Treasury (Solana — AUTHORITATIVE):
  address: ${record.treasuryAddress}
  file:    ${OUT}
  alias:   ${OUT_SOL}`);
  if (printSecret) console.log(`  METRO_TREASURY_SECRET=${record.treasurySecret}`);
  else console.log("  (re-run with --print-secret to show the base64 secret)");
}

const existing = readExisting();
if (existing && !replace) {
  const kind = existing.chain || secretKind(existing.treasurySecret);
  if (kind === "solana" || secretKind(existing.treasurySecret) === "solana") {
    console.log("Reusing existing solana treasury (pass --replace to mint a new one).");
    console.log(`  address: ${existing.treasuryAddress || existing.treasuryPubkey}`);
    printSolanaSteps(existing);
    process.exit(0);
  }
  console.error(
    `Existing treasury is ${kind}, which this Solana build cannot use. ` +
      `Re-run with --replace (previous file is backed up under .wrangler/secret-backups/).`,
  );
  process.exit(1);
}

if (existing) {
  const backup = backupExisting(existing);
  console.log(`Backed up previous treasury → ${backup}`);
}

const kp = Keypair.generate();
const record = makeSolanaRecord(kp);
writeRecord(record);
console.log("Created AUTHORITATIVE Solana treasury.");
printSolanaSteps(record);
