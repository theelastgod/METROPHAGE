// METROPHAGE — pre-CA Robinhood Chain preparation.
//
// Generates a FRESH EVM treasury key (the account that receives ERC-20 deposits
// and signs ERC-20 cash-out transfers). Does NOT need a mint/CA. Does NOT arm
// mainnet.
//
// Writes (gitignored):
//   server/.mainnet-treasury.json
//
// Usage:
//   node scripts/mainnet-prepare.mjs
//   node scripts/mainnet-prepare.mjs --print-secret
//   node scripts/mainnet-prepare.mjs --replace-legacy
//
// After Robinhood Chain gives you a CA, run:
//   node scripts/mainnet-arm.mjs <0x_CA>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Wallet } from "ethers";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dir, "../.mainnet-treasury.json");
const BACKUP_DIR = path.join(__dir, "../.wrangler/secret-backups");
const printSecret = process.argv.includes("--print-secret");
const replaceLegacy = process.argv.includes("--replace-legacy");

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
    if (bytes === 32) return "evm-base64";
    if (bytes === 64) return "legacy-solana";
    return `unknown-base64-${bytes}`;
  } catch {
    return "unknown";
  }
}

function normalizeEvmSecret(secret) {
  const v = String(secret || "").trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return v;
  if (/^[0-9a-fA-F]{64}$/.test(v)) return "0x" + v;
  const raw = Buffer.from(v, "base64");
  if (raw.length === 32) return "0x" + raw.toString("hex");
  return null;
}

function writeRecord(record) {
  fs.writeFileSync(OUT, JSON.stringify(record, null, 2), { mode: 0o600 });
  chmod600(OUT);
}

function backupLegacy(existing) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(BACKUP_DIR, `mainnet-treasury-legacy-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(existing, null, 2), { mode: 0o600 });
  chmod600(backup);
  return backup;
}

function makeRecord(wallet) {
  return {
    chain: "robinhood",
    cluster: "robinhood",
    treasuryAddress: wallet.address,
    treasurySecret: wallet.privateKey,
    createdAt: new Date().toISOString(),
    note:
      "FRESH Robinhood/EVM treasury for $METRO bridge. Never commit this file. " +
      "Treasury receives player ERC-20 deposits and signs ERC-20 cash-outs; keep " +
      "a small ETH balance on Robinhood Chain for gas.",
    mint: null,
    mainnetArmed: false,
  };
}

function printNextSteps(record) {
  console.log(`
── Install treasury secret on Cloudflare (no CA required yet) ────────────
  cd server
  node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \\
    | npx wrangler secret put METRO_TREASURY_SECRET
  npx wrangler deploy

── When you have the Robinhood Chain CA ──────────────────────────────────
  cd server
  node scripts/mainnet-arm.mjs <0x_CA>

── Until then ────────────────────────────────────────────────────────────
  • Do NOT set METRO_MINT on the Worker
  • Do NOT set VITE_METRO_MINT on the client
  • METRO_MAINNET_ARMED stays OFF until counsel
  • Treasury needs a small ETH balance on Robinhood Chain before cash-outs

Treasury:
  address: ${record.treasuryAddress}
  file:    ${OUT}`);
  if (printSecret) console.log(`  METRO_TREASURY_SECRET=${record.treasurySecret}`);
  else console.log("  (re-run with --print-secret to show the 0x private key)");
}

function main() {
  const existing = readExisting();
  const kind = secretKind(existing?.treasurySecret);

  if (kind === "evm" || kind === "evm-base64") {
    const key = normalizeEvmSecret(existing.treasurySecret);
    const wallet = new Wallet(key);
    const record = {
      ...existing,
      chain: existing.chain || "robinhood",
      cluster: existing.cluster || "robinhood",
      treasuryAddress: existing.treasuryAddress || wallet.address,
      treasurySecret: key,
      mainnetArmed: existing.mainnetArmed === true,
    };
    writeRecord(record);
    console.log("Reusing existing Robinhood/EVM treasury.\n");
    console.log(`  address: ${record.treasuryAddress}`);
    console.log(`  file:    ${OUT}`);
    console.log(`  created: ${record.createdAt ?? "?"}`);
    printNextSteps(record);
    return;
  }

  if (existing && !replaceLegacy) {
    console.error("Existing treasury file is not a Robinhood/EVM private key.");
    console.error(`  file: ${OUT}`);
    console.error(`  detected: ${kind}`);
    console.error("\nRun this only if you are ready to create a fresh Robinhood treasury:");
    console.error("  node scripts/mainnet-prepare.mjs --replace-legacy");
    process.exit(1);
  }

  if (existing) {
    const backup = backupLegacy(existing);
    console.log("Backed up legacy treasury file:");
    console.log(`  ${backup}\n`);
  }

  const record = makeRecord(Wallet.createRandom());
  writeRecord(record);
  console.log("Generated FRESH Robinhood/EVM treasury.\n");
  console.log(`  address: ${record.treasuryAddress}`);
  console.log(`  file:    ${OUT}  (gitignored, mode 600)`);
  printNextSteps(record);
}

main();
