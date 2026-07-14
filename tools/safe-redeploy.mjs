#!/usr/bin/env node
/**
 * Progress-safe production redeploy for METROPHAGE.
 *
 * Guarantees:
 *  - Never creates / deletes / renames the D1 database
 *  - Never runs local D1 or smoke seeds against remote
 *  - Only applies additive migrations (check-migrations-safe.mjs first)
 *  - Snapshots player count + progress fingerprint before deploy
 *  - Aborts if fingerprint drops after server deploy
 *  - Worker code redeploy keeps D1; DO SQLite storage survives class code updates
 *
 * Usage (repo root):
 *   node tools/safe-redeploy.mjs              # server + client
 *   node tools/safe-redeploy.mjs --server     # Worker only
 *   node tools/safe-redeploy.mjs --client     # Pages only
 *   node tools/safe-redeploy.mjs --dry-run    # checks only
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = join(root, "server");
const LIVE_WORKER = "https://metrophage-server.wendellphillips.workers.dev";
const LIVE_WS = "wss://metrophage-server.wendellphillips.workers.dev/ws";
const PROD_D1_ID = "7f030a09-a0d0-44f5-8192-cf657bd04253";
const PROD_D1_NAME = "metrophage";
const PAGES_PROJECT = "metrophagev1";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const serverOnly = args.has("--server");
const clientOnly = args.has("--client");
const doServer = !clientOnly;
const doClient = !serverOnly;

function die(msg, code = 1) {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: opts.cwd ?? root,
    env: { ...process.env, ...opts.env },
    encoding: "utf8",
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    if (opts.capture) {
      console.error(r.stdout || "");
      console.error(r.stderr || "");
    }
    die(opts.failMsg ?? `${cmd} ${cmdArgs.join(" ")} failed (exit ${r.status})`, r.status ?? 1);
  }
  return r;
}

function wranglerBin() {
  const pinned = join(serverDir, "node_modules", "wrangler", "bin", "wrangler.js");
  if (existsSync(pinned)) return [process.execPath, pinned];
  return ["npx", "wrangler"];
}

/** Ensure wrangler.toml still points at the live D1 — never a new empty database. */
function assertProdD1Binding() {
  const toml = readFileSync(join(serverDir, "wrangler.toml"), "utf8");
  if (!toml.includes(`database_id = "${PROD_D1_ID}"`)) {
    die(
      `wrangler.toml database_id is not the production D1 (${PROD_D1_ID}). ` +
        `Refusing deploy to protect player progression.`,
    );
  }
  if (!toml.includes(`database_name = "${PROD_D1_NAME}"`)) {
    die(`wrangler.toml database_name must be "${PROD_D1_NAME}"`);
  }
  // Never allow a second [[migrations]] that recreates DO classes (would orphan storage).
  const migTags = [...toml.matchAll(/tag\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  if (migTags.length !== 1 || migTags[0] !== "v1") {
    die(
      `wrangler.toml DO migrations must remain a single tag "v1" (found: ${migTags.join(", ") || "none"}). ` +
        `Adding new_classes / deleted_classes can orphan or wipe zone state.`,
    );
  }
  console.log(`✓ D1 binding locked to prod ${PROD_D1_NAME} (${PROD_D1_ID})`);
  console.log(`✓ DO migration tag locked to v1 (no class recreate)`);
}

/** Snapshot durable progression fingerprint from remote D1. */
function progressFingerprint() {
  const [bin, ...pre] = wranglerBin();
  const sql =
    "SELECT " +
    "(SELECT COUNT(*) FROM players) AS players, " +
    "(SELECT COALESCE(SUM(credits),0) FROM players) AS credits_sum, " +
    "(SELECT COALESCE(SUM(xp),0) FROM players) AS xp_sum, " +
    "(SELECT COALESCE(SUM(tutorial_done),0) FROM players) AS tutorials, " +
    "(SELECT COUNT(*) FROM metro_deposits) AS deposits, " +
    "(SELECT COUNT(*) FROM metro_withdrawals) AS withdrawals";
  const r = spawnSync(
    bin,
    [...pre, "d1", "execute", PROD_D1_NAME, "--remote", "--json", "--command", sql],
    { cwd: serverDir, encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(r.stdout || r.stderr);
    die("failed to read remote D1 fingerprint — aborting deploy");
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    die(`could not parse D1 fingerprint JSON:\n${r.stdout}`);
  }
  // wrangler --json shape varies; dig for results row
  const row =
    parsed?.[0]?.results?.[0] ??
    parsed?.results?.[0] ??
    parsed?.[0]?.result?.[0] ??
    null;
  if (!row || typeof row.players !== "number") {
    // Sometimes results nest under success payloads
    const flat = JSON.stringify(parsed);
    const m = flat.match(/"players"\s*:\s*(\d+)/);
    if (!m) die(`unexpected D1 fingerprint shape:\n${r.stdout.slice(0, 500)}`);
    return {
      players: Number(m[1]),
      credits_sum: Number(flat.match(/"credits_sum"\s*:\s*(-?\d+)/)?.[1] ?? 0),
      xp_sum: Number(flat.match(/"xp_sum"\s*:\s*(-?\d+)/)?.[1] ?? 0),
      tutorials: Number(flat.match(/"tutorials"\s*:\s*(-?\d+)/)?.[1] ?? 0),
      deposits: Number(flat.match(/"deposits"\s*:\s*(-?\d+)/)?.[1] ?? 0),
      withdrawals: Number(flat.match(/"withdrawals"\s*:\s*(-?\d+)/)?.[1] ?? 0),
      raw: flat.slice(0, 200),
    };
  }
  return {
    players: Number(row.players) || 0,
    credits_sum: Number(row.credits_sum) || 0,
    xp_sum: Number(row.xp_sum) || 0,
    tutorials: Number(row.tutorials) || 0,
    deposits: Number(row.deposits) || 0,
    withdrawals: Number(row.withdrawals) || 0,
  };
}

function printFp(label, fp) {
  console.log(
    `${label}: players=${fp.players} creditsΣ=${fp.credits_sum} xpΣ=${fp.xp_sum} ` +
      `tutorials=${fp.tutorials} deposits=${fp.deposits} withdrawals=${fp.withdrawals}`,
  );
}

function assertProgressPreserved(before, after) {
  if (after.players < before.players) {
    die(
      `PLAYER COUNT DROPPED ${before.players} → ${after.players}. ` +
        `Progress may have been lost — investigate before further deploys.`,
    );
  }
  // Sums should never go to zero if they were non-zero (catches full table wipe + empty reseed)
  if (before.players > 0 && after.players === 0) {
    die("players table emptied after deploy");
  }
  if (before.credits_sum > 0 && after.credits_sum === 0) {
    die("credits wiped after deploy");
  }
  if (before.xp_sum > 0 && after.xp_sum === 0) {
    die("xp wiped after deploy");
  }
  // Soft: allow small drift from live play during deploy window (players earn)
  console.log("✓ progress fingerprint preserved (players ≥ before; no mass wipe)");
}

console.log("── METROPHAGE safe redeploy ──");
assertProdD1Binding();

// Refuse AI/tool authorship fingerprints on every ship.
run(process.execPath, [join(root, "tools", "scrub-ship.mjs")], {
  failMsg: "ship scrub failed — clean AI/tool markers before deploy",
});

// Migration safety scan (local files)
run(process.execPath, [join(root, "tools", "check-migrations-safe.mjs")], {
  failMsg: "destructive migrations blocked",
});

const before = progressFingerprint();
printFp("before", before);

if (dryRun) {
  console.log("dry-run: no deploy performed");
  process.exit(0);
}

async function main() {
  if (doServer) {
    console.log("\n→ applying pending D1 migrations (remote, additive only)…");
    {
      const [bin, ...pre] = wranglerBin();
      run(bin, [...pre, "d1", "migrations", "apply", PROD_D1_NAME, "--remote"], {
        cwd: serverDir,
        failMsg: "remote migrations failed",
      });
    }

    // stamp + deploy worker (never d1 create / delete)
    console.log("\n→ stamping METRO_BUILD + deploying Worker…");
    run(process.execPath, [join(serverDir, "scripts", "stamp-build.mjs")], { cwd: serverDir });
    {
      const [bin, ...pre] = wranglerBin();
      run(bin, [...pre, "deploy"], { cwd: serverDir, failMsg: "wrangler deploy failed" });
    }

    // Health
    try {
      const h = await fetch(`${LIVE_WORKER}/health`).then((r) => r.json());
      if (!h?.ok) die(`post-deploy /health not ok: ${JSON.stringify(h)}`);
      console.log(`✓ /health ok build=${h.build ?? "?"} plan=${h.plan ?? "?"}`);
    } catch (e) {
      die(`post-deploy /health unreachable: ${e}`);
    }

    const after = progressFingerprint();
    printFp("after ", after);
    assertProgressPreserved(before, after);
  }

  if (doClient) {
    console.log("\n→ building + deploying client (Pages)…");
    // Prefer release helper (bakes LIVE_WS). Pass through VITE_METRO_MINT if set.
    const env = {
      ...process.env,
      VITE_SERVER_URL: process.env.VITE_SERVER_URL || LIVE_WS,
    };
    run(process.execPath, [join(root, "tools", "release-client.mjs")], {
      env,
      failMsg: "client deploy failed",
    });
  }

  console.log("\n✓ safe redeploy complete — D1 progression intact");
}

await main();
