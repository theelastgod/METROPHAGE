// METROPHAGE — arm mainnet AFTER you have a mint CA (pump.fun contract address).
//
// Prerequisites:
//   1. node scripts/mainnet-prepare.mjs   (treasury exists)
//   2. counsel sign-off for real-value mainnet
//   3. you hold the mint CA as argv[2]
//
// This script:
//   - records the mint next to the treasury file
//   - prints exact wrangler secret + client build commands
//   - does NOT auto-arm METRO_MAINNET_ARMED (you type that after counsel)
//
// Usage:
//   node scripts/mainnet-arm.mjs <MINT_CA>
//   node scripts/mainnet-arm.mjs <MINT_CA> --with-arm-flag   # also print ARM=1 commands

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const TREASURY = path.join(__dir, "../.mainnet-treasury.json");
const mint = (process.argv[2] || "").trim();
const withArm = process.argv.includes("--with-arm-flag");

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function looksLikeMint(s) {
  if (!s || s.length < 32 || s.length > 44) return false;
  for (const c of s) if (!BASE58.includes(c)) return false;
  return true;
}

if (!looksLikeMint(mint)) {
  console.error("usage: node scripts/mainnet-arm.mjs <MINT_CA> [--with-arm-flag]");
  console.error("  MINT_CA must be a base58 Solana address (32–44 chars).");
  process.exit(1);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(TREASURY, "utf8"));
} catch {
  console.error("No treasury file. Run: node scripts/mainnet-prepare.mjs");
  process.exit(1);
}

state.mint = mint;
state.mintSetAt = new Date().toISOString();
state.mainnetArmed = false;
fs.writeFileSync(TREASURY, JSON.stringify(state, null, 2), { mode: 0o600 });

const rpc = process.env.METRO_RPC || "https://api.mainnet-beta.solana.com";
const treasury = state.treasuryPubkey;

console.log(`
Recorded mint against mainnet treasury.

  mint:     ${mint}
  treasury: ${treasury}
  file:     ${TREASURY}

── 1) Server secrets (ORDER MATTERS — secrets BEFORE client mint) ────────
  cd server

  # mint (prefer METRO_MINT; METRO_DEVNET_MINT still accepted as alias)
  echo -n '${mint}' | npx wrangler secret put METRO_MINT
  # optional alias for older code paths:
  echo -n '${mint}' | npx wrangler secret put METRO_DEVNET_MINT

  # RPC
  echo -n '${rpc}' | npx wrangler secret put METRO_RPC

  # treasury (if not already set from prepare)
  node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \\
    | npx wrangler secret put METRO_TREASURY_SECRET

  npx wrangler deploy

  # sanity
  curl -s https://metrophage-server.wendellphillips.workers.dev/metro/pool | jq .

── 2) Client build (ONLY after server secrets + deploy) ──────────────────
  cd ..   # repo root
  VITE_SERVER_URL=wss://metrophage-server.wendellphillips.workers.dev/ws \\
  VITE_METRO_MINT=${mint} \\
  VITE_METRO_CLUSTER=mainnet-beta \\
  VITE_METRO_RPC=${rpc} \\
${withArm ? "  VITE_METRO_MAINNET_ARMED=1 \\\\\n" : "  # leave VITE_METRO_MAINNET_ARMED unset until counsel OK\n"}  npm run build
  npx wrangler pages deploy dist --project-name=metrophagev1 --branch=main --commit-dirty=true

── 3) Counsel arm (server) — ONLY after legal OK ─────────────────────────
  cd server
  echo -n '1' | npx wrangler secret put METRO_MAINNET_ARMED
  npx wrangler deploy

── 4) Verify ─────────────────────────────────────────────────────────────
  curl -s https://metrophage-server.wendellphillips.workers.dev/metro/pool
  # expect: settlement=solana, treasury=${treasury}, phase=bootstrap until deposits

  # deposit path: player sends $METRO to treasury, claims in-game
  # withdraw path: claim tx, player pays fee, confirm

⚠ Never ship VITE_METRO_MINT to players before server secrets are live.
  Sim settlement + live panel = fabricatable deposits.
`);
