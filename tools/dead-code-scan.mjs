#!/usr/bin/env node
// Reachability scan: BFS the import graph from the live entry points and list
// every src/ module that nothing live imports. Regex-based (imports in this
// repo are static string literals), good enough for a delete-list.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const ROOTS = [join(ROOT, "src/main.ts"), join(ROOT, "server/src/index.ts")];

function listTs(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (/\.ts$/.test(e) && !/\.d\.ts$/.test(e)) out.push(p);
  }
  return out;
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".")) return null; // package import
  const base = resolve(dirname(fromFile), spec);
  for (const c of [base + ".ts", base + ".tsx", join(base, "index.ts")]) {
    if (existsSync(c)) return c;
  }
  return null;
}

const IMPORT_RE = /(?:import|export)\s[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;

const seen = new Set();
const queue = [...ROOTS];
while (queue.length) {
  const f = queue.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    const r = resolveImport(f, spec);
    if (r && !seen.has(r)) queue.push(r);
  }
}

const all = [...listTs(join(ROOT, "src")), ...listTs(join(ROOT, "server/src"))];
const dead = all.filter((f) => !seen.has(f) && !/\.test\.ts$/.test(f));
const deadTests = all.filter((f) => /\.test\.ts$/.test(f) && !seen.has(f.replace(/\.test\.ts$/, ".ts")));

let deadLines = 0;
for (const f of dead) deadLines += readFileSync(f, "utf8").split("\n").length;

console.log(`live modules: ${seen.size}`);
console.log(`dead modules (${dead.length}, ${deadLines} lines):`);
for (const f of dead.sort()) console.log("  " + f.replace(ROOT + "/", ""));
if (deadTests.length) {
  console.log(`tests of dead modules (${deadTests.length}):`);
  for (const f of deadTests.sort()) console.log("  " + f.replace(ROOT + "/", ""));
}
