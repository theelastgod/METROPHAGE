import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const LIVE_SERVER_URL = "wss://metrophage-server.wendellphillips.workers.dev/ws";
const PAGES_PROJECT = "metrophagev1";
const PRODUCTION_BRANCH = "main";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildOnly = process.argv.includes("--build-only");
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--build-only");

if (unknownArgs.length > 0) {
  console.error(`Unknown argument(s): ${unknownArgs.join(" ")}`);
  process.exit(2);
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function filesUnder(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const npmCli = process.env.npm_execpath;
if (!npmCli || !existsSync(npmCli)) {
  console.error("Run this helper through npm: npm run deploy:client");
  process.exit(2);
}

const wcProjectId = (process.env.VITE_WALLETCONNECT_PROJECT_ID || "").trim();
// Robinhood mainnet is the production network. Mint stays empty until CA is set.
const metroCluster = (process.env.VITE_METRO_CLUSTER || "robinhood").trim();
const metroSettlement = (process.env.VITE_METRO_SETTLEMENT || "robinhood").trim();
const metroMint = (process.env.VITE_METRO_MINT || "").trim();
console.log(`Building production client for ${LIVE_SERVER_URL}`);
console.log(`$METRO network: ${metroSettlement} · cluster=${metroCluster}${metroMint ? ` · mint=${metroMint.slice(0, 10)}…` : " · mint=awaiting CA"}`);
if (wcProjectId) {
  console.log(`WalletConnect project id: ${wcProjectId.slice(0, 8)}…`);
} else {
  console.warn(
    "⚠ VITE_WALLETCONNECT_PROJECT_ID unset — mobile WalletConnect modal disabled (injected wallets + MetaMask deep-link only). Free id: https://dashboard.reown.com",
  );
}
run(process.execPath, [npmCli, "run", "build"], {
  ...process.env,
  VITE_SERVER_URL: LIVE_SERVER_URL,
  VITE_METRO_CLUSTER: metroCluster,
  VITE_METRO_SETTLEMENT: metroSettlement,
  // Only bake mint when explicitly provided — never invent a CA.
  ...(metroMint ? { VITE_METRO_MINT: metroMint } : { VITE_METRO_MINT: "" }),
  VITE_METRO_RPC: process.env.VITE_METRO_RPC || "https://rpc.mainnet.chain.robinhood.com",
  VITE_METRO_CHAIN_ID: process.env.VITE_METRO_CHAIN_ID || "4663",
  ...(wcProjectId ? { VITE_WALLETCONNECT_PROJECT_ID: wcProjectId } : {}),
});

const dist = join(root, "dist");
const serverUrlIsBakedIn = filesUnder(dist).some((path) => {
  if (!/\.(?:html|js|css|json)$/.test(path)) return false;
  return readFileSync(path, "utf8").includes(LIVE_SERVER_URL);
});

if (!serverUrlIsBakedIn) {
  console.error(`Release verification failed: ${LIVE_SERVER_URL} is absent from dist/.`);
  process.exit(1);
}
console.log(`Verified dist/ contains ${LIVE_SERVER_URL}`);

if (buildOnly) {
  console.log("Build-only verification complete; nothing was deployed.");
  process.exit(0);
}

const wranglerBin = join(root, "server", "node_modules", "wrangler", "bin", "wrangler.js");
if (!existsSync(wranglerBin)) {
  console.error("Pinned Wrangler is missing. Run npm install in server/ and retry.");
  process.exit(2);
}

console.log(`Deploying dist/ to Cloudflare Pages project ${PAGES_PROJECT}, branch ${PRODUCTION_BRANCH}`);
run(process.execPath, [
  wranglerBin,
  "pages",
  "deploy",
  "dist",
  `--project-name=${PAGES_PROJECT}`,
  `--branch=${PRODUCTION_BRANCH}`,
  "--commit-dirty=true",
]);
