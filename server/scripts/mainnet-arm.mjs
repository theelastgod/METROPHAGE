// METROPHAGE — record the Solana SPL $METRO mint CA and print launch commands.
//
// Prerequisites:
//   1. node scripts/mainnet-prepare.mjs   (Solana treasury exists)
//   2. you hold the SPL mint address (base58) for $METRO
//   3. counsel sign-off before setting either METRO_MAINNET_ARMED flag
//
// Usage (authoritative Solana path):
//   node scripts/mainnet-arm.mjs <base58_mint>
//   node scripts/mainnet-arm.mjs <base58_mint> --with-arm-flag   # counsel only
//
// Dormant EVM alternate (only if re-enabling Robinhood):
//   node scripts/mainnet-arm.mjs <0x_CA> --evm
//   node scripts/mainnet-arm.mjs <0x_CA> --evm --with-arm-flag

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Wallet, getAddress } from "ethers";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const TREASURY = path.join(__dir, "../.mainnet-treasury.json");
const SOL_ALIAS = path.join(__dir, "../.solana-treasury.json");
const mintArg = (process.argv[2] || "").trim();
const withArm = process.argv.includes("--with-arm-flag");
const wantEvm = process.argv.includes("--evm") || process.argv.includes("--robinhood");

function usage() {
  console.error("usage: node scripts/mainnet-arm.mjs <mint_CA> [--with-arm-flag]");
  console.error("  Solana (default): <base58 SPL mint>");
  console.error("  EVM alternate:    <0x ERC-20> --evm");
}

function writeState(state) {
  const body = JSON.stringify(state, null, 2);
  fs.writeFileSync(TREASURY, body, { mode: 0o600 });
  try {
    fs.chmodSync(TREASURY, 0o600);
  } catch {
    /* best effort */
  }
  if (state.chain === "solana") {
    fs.writeFileSync(SOL_ALIAS, body, { mode: 0o600 });
    try {
      fs.chmodSync(SOL_ALIAS, 0o600);
    } catch {
      /* best effort */
    }
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
  console.error("No treasury file. Run: node scripts/mainnet-prepare.mjs");
  process.exit(1);
}

const isEvmShape = wantEvm || /^0x[a-fA-F0-9]{40}$/.test(mintArg);

if (isEvmShape) {
  let mint;
  try {
    mint = getAddress(mintArg);
  } catch {
    usage();
    process.exit(1);
  }
  const secret = String(state.treasurySecret || "").trim();
  let treasurySecret = null;
  if (/^0x[0-9a-fA-F]{64}$/.test(secret)) treasurySecret = secret;
  else if (/^[0-9a-fA-F]{64}$/.test(secret)) treasurySecret = "0x" + secret;
  if (!treasurySecret) {
    console.error("Treasury file is not EVM-ready. For dormant EVM path run:");
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
    mint,
    mintSetAt: new Date().toISOString(),
    mainnetArmed: withArm,
    authoritative: false,
    alternate: true,
  };
  writeState(state);

  console.log(`
Recorded DORMANT Robinhood ERC-20 CA (not the live Solana path).

  mint CA:  ${mint}
  treasury: ${treasuryAddress}
  chain:    Robinhood Chain mainnet (${CHAIN_ID})

── To activate this alternate (counsel only) ─────────────────────────────
  cd server
  node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \\
    | npx wrangler secret put METRO_TREASURY_SECRET
  echo -n '${mint}' | npx wrangler secret put METRO_MINT
  echo -n '${RPC}' | npx wrangler secret put METRO_RPC
  echo -n '${CHAIN_ID}' | npx wrangler secret put METRO_CHAIN_ID
  echo -n 'robinhood' | npx wrangler secret put METRO_SETTLEMENT
${withArm ? "  echo -n '1' | npx wrangler secret put METRO_MAINNET_ARMED\n" : "  # leave METRO_MAINNET_ARMED unset until counsel\n"}  npx wrangler deploy

Client:
  VITE_METRO_MINT=${mint} VITE_METRO_CLUSTER=robinhood VITE_METRO_SETTLEMENT=robinhood \\
  VITE_METRO_RPC=${RPC} VITE_METRO_CHAIN_ID=${CHAIN_ID} npm run deploy:client
`);
  process.exit(0);
}

// Authoritative Solana path
let mint;
try {
  mint = new PublicKey(mintArg).toBase58();
} catch {
  console.error("Mint must be a Solana base58 pubkey (or pass --evm for 0x CA).");
  usage();
  process.exit(1);
}

const secret = String(state.treasurySecret || "").trim();
let treasuryAddress;
try {
  const bytes = Buffer.from(secret, "base64");
  if (bytes.length !== 64) throw new Error(`secret is ${bytes.length} bytes, need 64`);
  treasuryAddress = Keypair.fromSecretKey(new Uint8Array(bytes)).publicKey.toBase58();
} catch (e) {
  console.error("Treasury file is not Solana-ready:", String(e?.message || e));
  console.error("  node scripts/mainnet-prepare.mjs --replace");
  process.exit(1);
}

const RPC = process.env.METRO_RPC || "https://api.mainnet-beta.solana.com";

state = {
  ...state,
  chain: "solana",
  cluster: "mainnet-beta",
  treasuryAddress,
  treasuryPubkey: treasuryAddress,
  treasurySecret: secret,
  secretFormat: "base64-64-byte-solana-keypair",
  mint,
  mintSetAt: new Date().toISOString(),
  mainnetArmed: withArm,
  authoritative: true,
  alternate: false,
  note: "AUTHORITATIVE Solana treasury + mint. Never commit. Players pay SOL on claims.",
};
writeState(state);

console.log(`
Recorded Solana SPL $METRO mint against Solana treasury.

  mint CA:  ${mint}
  treasury: ${treasuryAddress}
  chain:    Solana mainnet-beta
  rpc:      ${RPC}
  file:     ${TREASURY}

── 1) Server secrets FIRST ───────────────────────────────────────────────
  cd server

  node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \\
    | npx wrangler secret put METRO_TREASURY_SECRET
  echo -n '${mint}' | npx wrangler secret put METRO_MINT
  echo -n '${RPC}' | npx wrangler secret put METRO_RPC
  echo -n 'solana' | npx wrangler secret put METRO_SETTLEMENT
${withArm ? "  echo -n '1' | npx wrangler secret put METRO_MAINNET_ARMED\n" : "  # counsel-gated: leave METRO_MAINNET_ARMED unset until legal OK\n"}  npx wrangler d1 migrations apply metrophage --remote
  npx wrangler deploy

  curl -s https://metrophage-server.wendellphillips.workers.dev/metro/pool | jq '{settlement,family,treasury,mint}'

── 2) Client build SECOND ────────────────────────────────────────────────
  VITE_METRO_MINT=${mint} \\
  VITE_METRO_CLUSTER=mainnet-beta \\
  VITE_METRO_RPC=${RPC} \\
  VITE_METRO_SETTLEMENT=solana \\
${withArm ? "  VITE_METRO_MAINNET_ARMED=1 \\\\\n" : ""}  npm run deploy:client

Treasury never spends SOL — players pay fees on deposit + claim withdraw.
`);
