#!/usr/bin/env node
/**
 * Refuse destructive D1 migrations that could wipe player progression.
 * Run before any remote migrate / deploy.
 *
 * Allowed: CREATE TABLE IF NOT EXISTS, ALTER TABLE ADD COLUMN, CREATE INDEX, …
 * Blocked: DROP TABLE, TRUNCATE, DELETE FROM players (unscoped), DROP COLUMN, etc.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migDir = join(root, "server", "migrations");

const BLOCK = [
  { re: /\bDROP\s+TABLE\b/i, why: "DROP TABLE destroys player data" },
  { re: /\bTRUNCATE\b/i, why: "TRUNCATE destroys player data" },
  { re: /\bDROP\s+COLUMN\b/i, why: "DROP COLUMN can erase progression fields" },
  // Unscoped deletes on durable player tables
  {
    re: /\bDELETE\s+FROM\s+players\b(?!\s+WHERE)/i,
    why: "DELETE FROM players without WHERE",
  },
  {
    re: /\bDELETE\s+FROM\s+player_/i,
    why: "DELETE FROM player_* (use scoped maintenance scripts, never migrations)",
  },
  {
    re: /\bDELETE\s+FROM\s+metro_(deposits|withdrawals)\b(?!\s+WHERE)/i,
    why: "unscoped DELETE on metro ledger",
  },
  { re: /\bUPDATE\s+players\s+SET\b[\s\S]{0,80}\bcredits\s*=\s*0\b/i, why: "mass zero credits" },
];

let failed = 0;
const files = readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const f of files) {
  const sql = readFileSync(join(migDir, f), "utf8");
  // Strip line comments for a slightly cleaner scan
  const body = sql.replace(/--[^\n]*/g, "\n");
  for (const { re, why } of BLOCK) {
    if (re.test(body)) {
      console.error(`✗ ${f}: ${why}`);
      failed++;
    }
  }
}

if (failed) {
  console.error(`\n${failed} migration safety violation(s). Fix SQL before deploying.`);
  process.exit(1);
}
console.log(`✓ ${files.length} migrations scanned — no destructive patterns`);
