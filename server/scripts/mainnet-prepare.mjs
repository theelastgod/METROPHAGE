// METROPHAGE — pre-CA mainnet preparation.
//
// Generates a FRESH mainnet treasury keypair (the custodian that will hold player
// $METRO deposits). Does NOT need a mint/CA. Does NOT arm mainnet. Does NOT fund
// anything on-chain (treasury holds $METRO only after players deposit).
//
// Writes (gitignored):
//   server/.mainnet-treasury.json
//
// Usage:
//   node scripts/mainnet-prepare.mjs
//   node scripts/mainnet-prepare.mjs --print-secret   # also print base64 for wrangler
//
// After pump.fun gives you a CA, run:
//   node scripts/mainnet-arm.mjs <MINT_CA>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dir, "../.mainnet-treasury.json");
const printSecret = process.argv.includes("--print-secret");

function b64(kp) {
  return Buffer.from(kp.secretKey).toString("base64");
}

function main() {
  let existing = null;
  try {
    existing = JSON.parse(fs.readFileSync(OUT, "utf8"));
  } catch {
    /* none */
  }

  if (existing?.treasurySecret && existing?.treasuryPubkey) {
    console.log("Reusing existing mainnet treasury (already prepared):\n");
    console.log(`  public:  ${existing.treasuryPubkey}`);
    console.log(`  file:    ${OUT}`);
    console.log(`  created: ${existing.createdAt ?? "?"}`);
    if (printSecret) {
      console.log(`\n  METRO_TREASURY_SECRET=${existing.treasurySecret}`);
    } else {
      console.log("\n  (re-run with --print-secret to show the base64 secret)");
    }
    printNextSteps(existing.treasuryPubkey);
    return;
  }

  const treasury = Keypair.generate();
  const record = {
    cluster: "mainnet-beta",
    treasuryPubkey: treasury.publicKey.toBase58(),
    treasurySecret: b64(treasury),
    createdAt: new Date().toISOString(),
    note:
      "FRESH mainnet treasury for $METRO bridge. NEVER reuse a devnet key. " +
      "Never commit this file. Fund nothing with SOL — treasury only signs claims. " +
      "Players deposit $METRO here after the CA is live.",
    mint: null, // filled later by mainnet-arm.mjs
    mainnetArmed: false,
  };
  fs.writeFileSync(OUT, JSON.stringify(record, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(OUT, 0o600);
  } catch {
    /* windows */
  }

  console.log("Generated FRESH mainnet treasury keypair.\n");
  console.log(`  public:  ${record.treasuryPubkey}`);
  console.log(`  file:    ${OUT}  (gitignored, mode 600)`);
  if (printSecret) {
    console.log(`\n  METRO_TREASURY_SECRET=${record.treasurySecret}`);
  } else {
    console.log("\n  Secret written to file only. Use --print-secret if you need the base64.");
  }
  printNextSteps(record.treasuryPubkey);
}

function printNextSteps(pubkey) {
  console.log(`
── Install treasury secret on Cloudflare (no mint required yet) ──────────
  cd server
  node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \\
    | npx wrangler secret put METRO_TREASURY_SECRET
  npx wrangler deploy

── When pump.fun gives you the CA ────────────────────────────────────────
  cd server
  node scripts/mainnet-arm.mjs <MINT_ADDRESS>

── Until then ────────────────────────────────────────────────────────────
  • METRO_MAINNET_ARMED stays OFF
  • Do NOT set VITE_METRO_MINT on the client
  • Pool stays empty; deposits impossible without a mint
  • Treasury pubkey (deposit address once mint exists):
      ${pubkey}
`);
}

main();
