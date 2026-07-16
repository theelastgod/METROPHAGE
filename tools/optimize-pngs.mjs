#!/usr/bin/env node
// Losslessly recompress PNG assets without palette conversion or resizing.
// Usage: node tools/optimize-pngs.mjs [directory]

import { readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(process.argv[2] ?? "public/assets/objects");

async function pngs(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await pngs(file)));
    else if (ent.isFile() && ent.name.toLowerCase().endsWith(".png")) out.push(file);
  }
  return out;
}

const files = await pngs(root);
let before = 0;
let after = 0;
let changed = 0;

for (const file of files) {
  const original = await readFile(file);
  before += original.length;
  const optimized = await sharp(original, { failOn: "error" })
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false, effort: 10 })
    .toBuffer();
  if (optimized.length < original.length) {
    const tmp = `${file}.opt-${process.pid}`;
    try {
      await writeFile(tmp, optimized);
      await rename(tmp, file);
      changed++;
      after += optimized.length;
    } finally {
      try {
        await unlink(tmp);
      } catch {
        // rename already consumed it
      }
    }
  } else {
    after += original.length;
  }
}

const mib = (n) => (n / 1048576).toFixed(2);
console.log(`PNG optimize: ${changed}/${files.length} changed · ${mib(before)} → ${mib(after)} MiB · saved ${mib(before - after)} MiB`);
