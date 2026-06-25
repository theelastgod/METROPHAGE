// METROPHAGE atlas slicer — segment a sprite atlas (objects on a transparent
// background) into individual trimmed PNGs via alpha flood-fill (dev-only).
//
// Usage:
//   node tools/atlas-slice.mjs "<atlas.png>" <outDir> [minArea] [dilate] [skipTop]
//     minArea  : drop components smaller than this many px (default 400) — kills
//                title-banner letters / specks.
//     dilate   : morphological-close radius so nearby fragments of one object
//                merge into a single sprite (default 5).
//     skipTop  : ignore the top N px (per-sheet title banner) (default 0).
//
// Prints a manifest line per sprite: "<idx>\t<x>\t<y>\t<w>\t<h>\t<file>".
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const [, , atlas, outDir, minAreaA = "400", dilateA = "5", skipTopA = "0"] = process.argv;
if (!atlas || !outDir) {
  console.error('usage: atlas-slice "<atlas.png>" <outDir> [minArea] [dilate] [skipTop]');
  process.exit(1);
}
const minArea = +minAreaA;
const R = +dilateA;
const skipTop = +skipTopA;
const ALPHA_T = 16; // alpha above this = solid

const { data, info } = await sharp(atlas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;

// 1) solid mask from alpha
const solid = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) if (data[i * C + 3] > ALPHA_T) solid[i] = 1;

// 2) separable box-dilation (binary OR) by radius R → close gaps within one object
function dilate(src) {
  const tmp = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < W && src[row + xx]) { v = 1; break; }
      }
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let v = 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < H && tmp[yy * W + x]) { v = 1; break; }
      }
      out[y * W + x] = v;
    }
  }
  return out;
}
const mask = R > 0 ? dilate(solid) : solid;

// 3) connected components (8-conn) over the dilated mask, bbox from solid pixels
const seen = new Uint8Array(W * H);
const stack = new Int32Array(W * H);
const comps = [];
const N8 = [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1];
for (let y = skipTop; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const s = y * W + x;
    if (!mask[s] || seen[s]) continue;
    let sp = 0;
    stack[sp++] = s;
    seen[s] = 1;
    let minX = x, maxX = x, minY = y, maxY = y, area = 0;
    while (sp) {
      const p = stack[--sp];
      const px = p % W, py = (p / W) | 0;
      if (solid[p]) {
        area++;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
      for (const d of N8) {
        const q = p + d;
        if (q < 0 || q >= W * H) continue;
        const qx = q % W;
        if (Math.abs(qx - px) > 1) continue; // wrapped row edge
        if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
      }
    }
    if (area >= minArea && maxX > minX && maxY > minY) {
      comps.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
    }
  }
}

// 4) sort top→bottom, left→right (row-banded), export trimmed sprites
comps.sort((a, b) => (Math.abs(a.y - b.y) > 24 ? a.y - b.y : a.x - b.x));
fs.mkdirSync(outDir, { recursive: true });
let idx = 0;
for (const c of comps) {
  idx++;
  const file = path.join(outDir, String(idx).padStart(3, "0") + ".png");
  const region = sharp(atlas).extract({ left: c.x, top: c.y, width: c.w, height: c.h });
  try {
    await region.clone().trim({ threshold: 1 }).png().toFile(file);
  } catch {
    await region.png().toFile(file); // trim can throw on edge-to-edge content
  }
  console.log(`${idx}\t${c.x}\t${c.y}\t${c.w}\t${c.h}\t${file}`);
}
console.error(`${path.basename(atlas)}: ${idx} sprites (minArea=${minArea} dilate=${R} skipTop=${skipTop})`);
