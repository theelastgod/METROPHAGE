#!/usr/bin/env node
// METROPHAGE — slice the Higgsfield top-down building sheet into shippable
// landmark building props (drop-in objects, keyed off pure black).
//
// Inputs (art-source/higgsfield/, gitignored staging):
//   sheet_building_facade.png    2×2 grid of top-down neon buildings on black
//     [0,0] bar (magenta)      [1,0] clinic (green)
//     [0,1] subway (cyan)      [1,1] shop (amber)
//   sheet_building_facade_2.png  3×2 grid on black
//     [0,0] guild (cyan)   [1,0] hotel (blue)   [2,0] stadium (red)
//     [0,1] citycenter (yellow) [1,1] home (orange) [2,1] den (purple)
//
// Outputs under public/assets/objects/: hf_building_<kind>.png
//
// Same keyBlack → trim → resize flow as higgsfield-hud-build.mjs.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "art-source/higgsfield";
const OUT_OBJ = "public/assets/objects";
// Landmark props are bigger than street clutter (hf_prop_* ~50×64). Cap the
// long side so a 7×5-tile footprint (~224×160px) reads without dominating.
const MAX_SIDE = 224;

/** Key near-black to transparent (Higgsfield sheets are RGB on black). */
async function keyBlack(buf, tol = 20) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    if (data[i] <= tol && data[i + 1] <= tol && data[i + 2] <= tol) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/** Extract one grid cell, key black, trim transparent padding, downscale to game scale. */
async function cell(sheet, cols, rows, c, r, { inset = 0.02, maxSide = MAX_SIDE } = {}) {
  const meta = await sharp(path.join(SRC, sheet)).metadata();
  const cw = meta.width / cols;
  const ch = meta.height / rows;
  const ix = cw * inset;
  const iy = ch * inset;
  let buf = await sharp(path.join(SRC, sheet))
    .extract({
      left: Math.round(c * cw + ix),
      top: Math.round(r * ch + iy),
      width: Math.round(cw - ix * 2),
      height: Math.round(ch - iy * 2),
    })
    .png()
    .toBuffer();
  buf = await keyBlack(buf);
  const trimmed = await sharp(buf).trim({ threshold: 10 }).toBuffer();
  const m = await sharp(trimmed).metadata();
  const scale = Math.min(1, maxSide / Math.max(m.width, m.height));
  return sharp(trimmed)
    .resize(Math.round(m.width * scale), Math.round(m.height * scale), {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function write(buf, name) {
  const out = path.join(OUT_OBJ, name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(buf).png().toFile(out);
  const m = await sharp(buf).metadata();
  console.log("→", out, `${m.width}×${m.height}`);
}

// [sheet, cols, rows, col, row, kind]
const CELLS = [
  ["sheet_building_facade.png", 2, 2, 0, 0, "bar"],
  ["sheet_building_facade.png", 2, 2, 1, 0, "clinic"],
  ["sheet_building_facade.png", 2, 2, 0, 1, "subway"],
  ["sheet_building_facade.png", 2, 2, 1, 1, "shop"],
  ["sheet_building_facade_2.png", 3, 2, 0, 0, "guild"],
  ["sheet_building_facade_2.png", 3, 2, 1, 0, "hotel"],
  ["sheet_building_facade_2.png", 3, 2, 2, 0, "stadium"],
  ["sheet_building_facade_2.png", 3, 2, 0, 1, "citycenter"],
  ["sheet_building_facade_2.png", 3, 2, 1, 1, "home"],
  ["sheet_building_facade_2.png", 3, 2, 2, 1, "den"],
];

async function main() {
  for (const [sheet, cols, rows, c, r, kind] of CELLS) {
    if (!fs.existsSync(path.join(SRC, sheet))) {
      console.error("missing", path.join(SRC, sheet));
      process.exit(1);
    }
    await write(await cell(sheet, cols, rows, c, r), `hf_building_${kind}.png`);
  }
}

main();
