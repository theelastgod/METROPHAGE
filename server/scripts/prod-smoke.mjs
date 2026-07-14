#!/usr/bin/env node
// METROPHAGE — production smoke gate.
// Runs trusted modes against a live WSS (never localhost by default).
//
//   WS_URL=wss://metrophage-server.wendellphillips.workers.dev/ws node scripts/prod-smoke.mjs
//   npm run smoke:prod   (from server/ or root via package script)
//
// Exit 0 only if every mode PASSes.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const smoke = join(root, "smoke.mjs");

const LIVE =
  process.env.WS_URL ||
  "wss://metrophage-server.wendellphillips.workers.dev/ws";

if (/127\.0\.0\.1|localhost/i.test(LIVE) && process.env.ALLOW_LOCAL_PROD_SMOKE !== "1") {
  console.error("prod-smoke refuses localhost. Set WS_URL to the live WSS, or ALLOW_LOCAL_PROD_SMOKE=1.");
  process.exit(2);
}

// Standalone modes — never battery-order dependent.
// market omitted by default (needs D1 seed credits on prod); override with PROD_SMOKE_MODES.
const MODES = (process.env.PROD_SMOKE_MODES || "launch,move,combat,abuse,reconnect,stash")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`prod-smoke → ${LIVE}`);
console.log(`modes: ${MODES.join(" · ")}`);

let failed = 0;
for (const mode of MODES) {
  console.log(`\n======== ${mode} ========`);
  const r = spawnSync(process.execPath, [smoke, mode], {
    cwd: root,
    env: { ...process.env, WS_URL: LIVE },
    stdio: "inherit",
  });
  if (r.status !== 0) {
    failed++;
    console.error(`FAIL mode=${mode} exit=${r.status}`);
    // Continue remaining modes for a fuller report unless FAIL_FAST=1
    if (process.env.FAIL_FAST === "1") process.exit(r.status || 1);
  }
}

if (failed) {
  console.error(`\nprod-smoke: ${failed}/${MODES.length} mode(s) failed`);
  process.exit(1);
}
console.log(`\nprod-smoke: all ${MODES.length} modes passed`);
process.exit(0);
