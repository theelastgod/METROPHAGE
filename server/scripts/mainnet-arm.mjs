// METROPHAGE — record the Robinhood ERC-20 $METRO mint CA and print launch commands.
//
// Prerequisites:
//   1. node scripts/mainnet-prepare.mjs --evm   (EVM treasury exists)
//   2. you hold the ERC-20 contract address (0x…) for $METRO on Robinhood Chain
//   3. counsel sign-off before setting either METRO_MAINNET_ARMED flag
//
// Usage (Robinhood — this build is EVM-only; the SPL flow lives on `settlement/solana`):
//   node scripts/mainnet-arm.mjs <0x_CA>
//   node scripts/mainnet-arm.mjs <0x_CA> --with-arm-flag   # counsel only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Wallet, getAddress } from "ethers";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const TREASURY = path.join(__dir, "../.mainnet-treasury.json");
const mintArg = (process.argv[2] || "").trim();
const withArm = process.argv.includes("--with-arm-flag");

function usage() {
  console.error("usage: node scripts/mainnet-arm.mjs <0x ERC-20 contract> [--with-arm-flag]");
}

function writeState(state) {
  const body = JSON.stringify(state, null, 2);
  fs.writeFileSync(TREASURY, body, { mode: 0o600 });
  try {
    fs.chmodSync(TREASURY, 0o600);
  } catch {
    /* best effort */
  }
}

if (!mintArg) {
  usage();
  process.exit(1);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(TREASURY, "utf8"));
} catch {
  console.error("No treasury file. Run: node scripts/mainnet-prepare.mjs --evm");
  process.exit(1);
}

// Authoritative Robinhood / EVM path
let mint;
try {
  mint = getAddress(mintArg);
} catch {
  console.error("Mint must be a 0x ERC-20 contract address.");
  usage();
  process.exit(1);
}

const secret = String(state.treasurySecret || "").trim();
let treasurySecret = null;
if (/^0x[0-9a-fA-F]{64}$/.test(secret)) treasurySecret = secret;
else if (/^[0-9a-fA-F]{64}$/.test(secret)) treasurySecret = "0x" + secret;
if (!treasurySecret) {
  console.error("Treasury file is not EVM-ready. Run:");
  console.error("  node scripts/mainnet-prepare.mjs --evm --replace");
  process.exit(1);
}

const RPC = process.env.METRO_RPC || "https://rpc.mainnet.chain.robinhood.com";
const CHAIN_ID = "4663";
const treasuryAddress = state.treasuryAddress || new Wallet(treasurySecret).address;

state = {
  ...state,
  chain: "robinhood",
  cluster: "robinhood",
  treasuryAddress,
  treasurySecret,
  secretFormat: "evm-hex-private-key",
  mint,
  mintSetAt: new Date().toISOString(),
  mainnetArmed: withArm,
  authoritative: true,
  alternate: false,
  note: "AUTHORITATIVE Robinhood Chain treasury + ERC-20 mint. Never commit. Treasury pays gas on cash-outs.",
};
writeState(state);

console.log(`
Recorded Robinhood ERC-20 $METRO mint against EVM treasury.

  mint CA:  ${mint}
  treasury: ${treasuryAddress}
  chain:    Robinhood Chain mainnet (${CHAIN_ID})
  rpc:      ${RPC}
  file:     ${TREASURY}

── 1) Server secrets FIRST ───────────────────────────────────────────────
  cd server

  node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \\
    | npx wrangler secret put METRO_TREASURY_SECRET
  echo -n '${mint}' | npx wrangler secret put METRO_MINT
  echo -n '${RPC}' | npx wrangler secret put METRO_RPC
  echo -n '${CHAIN_ID}' | npx wrangler secret put METRO_CHAIN_ID
  echo -n 'robinhood' | npx wrangler secret put METRO_SETTLEMENT
${withArm ? "  echo -n '1' | npx wrangler secret put METRO_MAINNET_ARMED\n" : "  # counsel-gated: leave METRO_MAINNET_ARMED unset until legal OK\n"}  npx wrangler d1 migrations apply metrophage --remote
  npx wrangler deploy

  curl -s https://metrophage-server.wendellphillips.workers.dev/metro/pool | jq '{settlement,family,treasury,mint}'

── 2) Client build SECOND ────────────────────────────────────────────────
  VITE_METRO_MINT=${mint} \\
  VITE_METRO_CLUSTER=robinhood \\
  VITE_METRO_RPC=${RPC} \\
  VITE_METRO_CHAIN_ID=${CHAIN_ID} \\
  VITE_METRO_SETTLEMENT=robinhood \\
${withArm ? "  VITE_METRO_MAINNET_ARMED=1 \\\\\n" : ""}  npm run deploy:client

Fund the treasury with a small native-gas float for cash-out transactions.
Deposits remain player-paid; the pool only pays out what player deposits funded.
`);
