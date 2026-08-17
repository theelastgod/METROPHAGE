// METROPHAGE — pre-CA treasury preparation (Robinhood Chain / EVM).
//
// This build is EVM-only. (The Solana keypair flow lives on the `settlement/solana` branch.)
//   node scripts/mainnet-prepare.mjs            # create (or reuse) the EVM treasury
//   node scripts/mainnet-prepare.mjs --replace  # mint a new one (previous is backed up)
//   --evm / --robinhood are accepted for compatibility and are the default.
//
// Writes (gitignored): server/.mainnet-treasury.json
//
// After you have the Robinhood ERC-20 mint CA:
//   set METRO_MINT + VITE_METRO_MINT to the 0x address; arm mainnet only with counsel.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Wallet } from "ethers";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dir, "../.mainnet-treasury.json");
const BACKUP_DIR = path.join(__dir, "../.wrangler/secret-backups");
const printSecret = process.argv.includes("--print-secret");
const replace = process.argv.includes("--replace") || process.argv.includes("--replace-legacy");

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
    if (bytes === 64) return "solana"; // legacy SPL keypair — not usable on this build
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
      "Receives ERC-20 deposits; signs cash-outs (fund with ETH for gas).",
    mint: null,
    mainnetArmed: false,
    authoritative: true,
  };
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
  const isEvm = kind === "robinhood" || secretKind(existing.treasurySecret) === "evm";
  if (isEvm) {
    console.log(`Reusing existing ${kind} treasury (pass --replace to mint a new one).`);
    console.log(`  address: ${existing.treasuryAddress}`);
    printEvmSteps(existing);
    process.exit(0);
  }
  console.error(
    `Existing treasury is ${kind}, which this EVM-only build cannot use. ` +
      `Re-run with --replace (previous file is backed up under .wrangler/secret-backups/).`,
  );
  process.exit(1);
}

if (existing) {
  const backup = backupExisting(existing);
  console.log(`Backed up previous treasury → ${backup}`);
}

const wallet = Wallet.createRandom();
const record = makeEvmRecord(wallet);
writeRecord(record);
console.log("Created Robinhood/EVM treasury (AUTHORITATIVE).");
printEvmSteps(record);
