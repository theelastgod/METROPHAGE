#!/usr/bin/env node
// Stamp METRO_BUILD in wrangler.toml from git short SHA + date (ops /health).
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const toml = join(root, "..", "wrangler.toml");
const sha =
  spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).stdout?.trim() || "local";
const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const stamp = `${sha}-${day}`;

let text = readFileSync(toml, "utf8");
if (/METRO_BUILD\s*=/.test(text)) {
  text = text.replace(/METRO_BUILD\s*=\s*"[^"]*"/, `METRO_BUILD = "${stamp}"`);
} else {
  text = text.replace(/(\[vars\][^\n]*\n)/, `$1METRO_BUILD = "${stamp}"\n`);
}
writeFileSync(toml, text);
console.log(`stamped METRO_BUILD=${stamp}`);
