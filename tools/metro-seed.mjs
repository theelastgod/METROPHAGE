#!/usr/bin/env node
/**
 * Record the developer 1% $METRO treasury seed into remote (or local) D1.
 * Pool = seed + deposits − withdrawals. Safe to re-run (UPSERT by id).
 *
 * Usage:
 *   node tools/metro-seed.mjs                 # remote, 10_000_000 (1%)
 *   node tools/metro-seed.mjs 10000000
 *   node tools/metro-seed.mjs 10000000 --local
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = join(root, "server");
const DEV_SEED = 10_000_000;
const args = process.argv.slice(2);
const local = args.includes("--local");
const amount = Math.max(0, Number(args.find((a) => !a.startsWith("-")) ?? DEV_SEED) || DEV_SEED);
const id = "dev_1pct";
const note = `developer treasury seed ${((amount / 1e9) * 100).toFixed(2)}% of 1B supply`;

const pinned = join(serverDir, "node_modules", "wrangler", "bin", "wrangler.js");
const bin = existsSync(pinned) ? [process.execPath, pinned] : ["npx", "wrangler"];

const sql = `INSERT INTO metro_seed (id, metro, note, created_at) VALUES ('${id}', ${amount}, '${note.replace(/'/g, "''")}', ${Date.now()})
ON CONFLICT(id) DO UPDATE SET metro=excluded.metro, note=excluded.note, created_at=excluded.created_at;`;

console.log(`Recording seed id=${id} metro=${amount} (${local ? "local" : "remote"})…`);
const r = spawnSync(
  bin[0],
  [...bin.slice(1), "d1", "execute", "metrophage", local ? "--local" : "--remote", "--command", sql],
  { cwd: serverDir, encoding: "utf8", stdio: "inherit" },
);
process.exit(r.status ?? 1);
