// METROPHAGE — record the Robinhood Chain $METRO CA and print launch commands.
//
// Prerequisites:
//   1. node scripts/mainnet-prepare.mjs   (Robinhood/EVM treasury exists)
//   2. you hold the ERC-20 contract address (CA) on Robinhood Chain
//   3. counsel sign-off before setting either METRO_MAINNET_ARMED flag
//
// Usage:
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
const RPC = process.env.METRO_RPC || "https://rpc.mainnet.chain.robinhood.com";
const CHAIN_ID = "4663";

function usage() {
  console.error("usage: node scripts/mainnet-arm.mjs <0x_CA> [--with-arm-flag]");
  console.error("  <0x_CA> must be a Robinhood Chain ERC-20 contract address.");
}

function normalizeEvmSecret(secret) {
  const v = String(secret || "").trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return v;
  if (/^[0-9a-fA-F]{64}$/.test(v)) return "0x" + v;
  try {
    const raw = Buffer.from(v, "base64");
    if (raw.length === 32) return "0x" + raw.toString("hex");
  } catch {
    /* not base64 */
  }
  return null;
}

let mint;
try {
  mint = getAddress(mintArg);
} catch {
  usage();
  process.exit(1);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(TREASURY, "utf8"));
} catch {
  console.error("No treasury file. Run: node scripts/mainnet-prepare.mjs");
  process.exit(1);
}

const treasurySecret = normalizeEvmSecret(state.treasurySecret);
if (!treasurySecret) {
  console.error("Treasury file is not Robinhood/EVM-ready.");
  console.error("Run: node scripts/mainnet-prepare.mjs --replace-legacy");
  process.exit(1);
}

const treasuryAddress = state.treasuryAddress || new Wallet(treasurySecret).address;
state.chain = "robinhood";
state.cluster = "robinhood";
state.treasuryAddress = treasuryAddress;
state.treasurySecret = treasurySecret;
state.mint = mint;
state.mintSetAt = new Date().toISOString();
state.mainnetArmed = withArm;
fs.writeFileSync(TREASURY, JSON.stringify(state, null, 2), { mode: 0o600 });
try {
  fs.chmodSync(TREASURY, 0o600);
} catch {
  /* best effort */
}

console.log(`
Recorded Robinhood Chain $METRO CA against mainnet treasury.

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
${withArm ? "  echo -n '1' | npx wrangler secret put METRO_MAINNET_ARMED\n" : "  # counsel-gated: leave METRO_MAINNET_ARMED unset until legal OK\n"}  npx wrangler d1 migrations apply metrophage --remote
  npx wrangler deploy

  curl -s https://metrophage-server.wendellphillips.workers.dev/metro/status
  curl -s https://metrophage-server.wendellphillips.workers.dev/metro/pool

── 2) Client build SECOND ────────────────────────────────────────────────
  cd ..
  VITE_SERVER_URL=wss://metrophage-server.wendellphillips.workers.dev/ws \\
  VITE_METRO_MINT=${mint} \\
  VITE_METRO_CLUSTER=robinhood \\
  VITE_METRO_RPC=${RPC} \\
  VITE_METRO_CHAIN_ID=${CHAIN_ID} \\
${withArm ? "  VITE_METRO_MAINNET_ARMED=1 \\\\\n" : "  # counsel-gated: leave VITE_METRO_MAINNET_ARMED unset until legal OK\n"}  npm run build
  npx wrangler pages deploy dist --project-name=metrophagev1 --branch=main --commit-dirty=true

── 3) Before cash-outs ───────────────────────────────────────────────────
  Fund treasury ${treasuryAddress} with a small ETH balance on Robinhood Chain
  for gas. Deposits can fill the $METRO pool; withdrawals cannot pay out until
  the treasury has both gas and enough $METRO.

⚠ Never ship VITE_METRO_MINT before the Worker secrets and deploy are live.
`);
