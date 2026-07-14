#!/usr/bin/env node
/**
 * Every-cycle helper for the 3h auto-redeploy loop.
 *
 * - If $METRO is not live yet → exit 0 (skip, wait for next cycle).
 * - If live → run tools/safe-redeploy.mjs (server + client).
 * - Stop switch: localStorage-free file STOP flag or env METRO_AUTO_REDEPLOY=0
 *
 * Live = mint configured AND settlement is real (not sim-locked).
 *
 * Usage:
 *   node tools/metro-auto-redeploy.mjs
 *   METRO_AUTO_REDEPLOY=0 node tools/metro-auto-redeploy.mjs   # force skip
 */
import { existsSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = "https://metrophage-server.wendellphillips.workers.dev";
const STOP_FILE = join(root, ".metro-auto-redeploy.stop");
const LOG_DIR = join(root, "logs");
const LOG = join(LOG_DIR, "auto-redeploy.log");

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG, line + "\n");
  } catch {
    /* ignore */
  }
}

if (process.env.METRO_AUTO_REDEPLOY === "0" || process.env.METRO_AUTO_REDEPLOY === "off") {
  log("skip: METRO_AUTO_REDEPLOY=0");
  process.exit(0);
}
if (existsSync(STOP_FILE)) {
  log(`skip: stop file present (${STOP_FILE}) — remove it or tell ops to resume`);
  process.exit(0);
}

async function metroLive() {
  const urls = [`${LIVE}/metro/status`, `${LIVE}/metro/pool`];
  for (const url of urls) {
    try {
      const j = await fetch(url, { signal: AbortSignal.timeout(15_000) }).then((r) => r.json());
      const mint = !!(j.mintConfigured || (j.mint && String(j.mint).length > 8));
      const liveBridge = j.liveBridge === true || (j.settlement && j.settlement !== "sim");
      const simLocked = j.simLocked === true || j.dangerousSim === true;
      // Live = mint on Worker AND real settlement path (not sim-locked).
      if (mint && liveBridge && !simLocked) {
        return { live: true, detail: j };
      }
      if (mint && !simLocked && j.settlement && j.settlement !== "sim") {
        return { live: true, detail: j };
      }
      return {
        live: false,
        reason:
          j.reason ||
          `mintConfigured=${!!j.mintConfigured} settlement=${j.settlement} simLocked=${j.simLocked}`,
        detail: j,
      };
    } catch (e) {
      log(`status fetch failed ${url}: ${e}`);
    }
  }
  return { live: false, reason: "status unreachable" };
}

const status = await metroLive();
if (!status.live) {
  log(`skip: $METRO not live yet (${status.reason})`);
  process.exit(0);
}

log(
  `LIVE — mint armed, settlement=${status.detail?.settlement ?? "?"} · running safe-redeploy`,
);
const r = spawnSync(process.execPath, [join(root, "tools", "safe-redeploy.mjs")], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
if (r.status !== 0) {
  log(`safe-redeploy failed exit=${r.status}`);
  process.exit(r.status ?? 1);
}
log("safe-redeploy ok");
writeFileSync(join(LOG_DIR, "last-auto-redeploy.ok"), new Date().toISOString() + "\n");
process.exit(0);
