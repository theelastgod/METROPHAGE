#!/usr/bin/env node
/**
 * Pre-ship scrub: fail the deploy if the tree still contains tool/AI authorship
 * markers that should never land on the public GitHub history.
 *
 * Run on every redeploy (wired into tools/safe-redeploy.mjs and CI deploy).
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

/** Patterns that read as AI / agent / vibe-coding fingerprints in shipped sources. */
const BANNED = [
  { re: /\bClaude Code\b/i, why: "Claude Code product mention" },
  { re: /\bfor Codex\b/i, why: "Codex product mention" },
  { re: /\bproject brief for (Codex|Claude|Grok)\b/i, why: "agent product brief title" },
  { re: /📌\s*PINNED/i, why: "emoji PINNED marker" },
  { re: /Pinned for the user/i, why: "agent pin note" },
  { re: /Generated with (Claude|Cursor|Copilot|Grok|Codex)/i, why: "AI generator stamp" },
  { re: /Co-Authored-By:\s*(Claude|Cursor|Copilot|GPT)/i, why: "AI co-author trailer" },
  { re: /\/private\/tmp\/claude-/i, why: "local Claude temp path" },
  { re: /\.claude\/projects\//i, why: "Claude project memory path" },
  { re: /\.Codex\/projects\//i, why: "Codex project memory path" },
  { re: /as an AI\b/i, why: "AI self-reference" },
  { re: /\bvibecod/i, why: "vibecode mention" },
];

const SKIP_DIR = new Set([
  "node_modules",
  "dist",
  ".git",
  ".wrangler",
  "logs",
  "marketing/trailer-rig/node_modules",
]);

const SKIP_FILE = new Set([
  // Intentionally not scanned as binary / lock noise
  "package-lock.json",
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name.startsWith(".") && name !== ".github" && name !== ".env.example" && name !== ".gitignore") {
      // skip other dotfiles/dirs except workflow roots we care about
      if (name !== ".github") continue;
    }
    const p = join(dir, name);
    const rel = relative(root, p);
    if (SKIP_DIR.has(name) || SKIP_DIR.has(rel.split(/[/\\]/)[0])) continue;
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (rel.includes("node_modules") || rel.includes("trailer-rig/node_modules")) continue;
      walk(p, out);
    } else if (st.isFile()) {
      if (SKIP_FILE.has(name)) continue;
      if (!/\.(ts|tsx|js|mjs|cjs|md|yml|yaml|html|toml|json|css|txt)$/i.test(name)) continue;
      out.push(p);
    }
  }
  return out;
}

const hits = [];
for (const file of walk(root)) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  // Skip this scrubber itself (documents the patterns).
  if (file.endsWith("scrub-ship.mjs")) continue;
  const rel = relative(root, file);
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const { re, why } of BANNED) {
      if (re.test(lines[i])) {
        hits.push(`${rel}:${i + 1}: ${why} → ${lines[i].trim().slice(0, 100)}`);
      }
    }
  }
}

if (hits.length) {
  console.error("✗ ship scrub failed — remove AI/tool fingerprints before deploy:\n");
  for (const h of hits.slice(0, 40)) console.error("  " + h);
  if (hits.length > 40) console.error(`  … +${hits.length - 40} more`);
  process.exit(1);
}

// Soft: ensure no staged .env
try {
  const staged = execSync("git diff --cached --name-only", { encoding: "utf8" });
  if (/(^|\/)\.env(\.|$)/m.test(staged) && !staged.includes(".env.example")) {
    console.error("✗ refusing to ship staged .env secret file");
    process.exit(1);
  }
} catch {
  /* not a git repo or nothing staged — ok */
}

if (existsSync(join(root, ".env"))) {
  // just a reminder; .env is gitignored
}

console.log("✓ ship scrub clean (no AI/tool authorship markers in tree)");
