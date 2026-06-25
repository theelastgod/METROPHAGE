// METROPHAGE chroma-key atlas slicer — segment objects laid out on a SOLID
// background (no alpha) into individual trimmed, background-keyed PNGs (dev-only).
//
// The asset-drop packs are flat RGB (no alpha) with each object sitting on a flat
// dark background. This keys that background to transparency, flood-fills the
// remaining "solid" pixels into connected components, and exports each as a clean
// RGBA sprite. Sibling to atlas-slice.mjs (which needs a pre-existing alpha mask).
//
// Usage:
//   node tools/atlas-key-slice.mjs "<atlas.png>" <outDir> [minArea] [dilate] [keyTol]
//     minArea : drop components smaller than this many px (default 1500).
//     dilate  : morphological-close radius so fragments of one object merge (default 4).
//     keyTol  : color distance from background that still counts as background
//               (default 42). Higher = more aggressive background removal.
//
// Prints a manifest line per sprite: "<idx>\t<x>\t<y>\t<w>\t<h>\t<file>".
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const [, , atlas, outDir, minAreaA = "1500", dilateA = "4", keyTolA = "42"] = process.argv;
if (!atlas || !outDir) {
  console.error('usage: atlas-key-slice "<atlas.png>" <outDir> [minArea] [dilate] [keyTol]');
  process.exit(1);
}
const minArea = +minAreaA;
const R = +dilateA;
const KEY_TOL = +keyTolA;

const { data, info } = await sharp(atlas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;

// 1) background color = median-ish of the four corners (robust to a stray lit corner)
function px(x, y) {
  const o = (y * W + x) * C;
  return [data[o], data[o + 1], data[o + 2]];
}
const corners = [px(0, 0), px(W - 1, 0), px(0, H - 1), px(W - 1, H - 1)];
const bg = [0, 1, 2].map((c) => corners.map((p) => p[c]).sort((a, b) => a - b)[1]); // 2nd smallest ≈ median
const dist2 = (r, g, b) => {
  const dr = r - bg[0], dg = g - bg[1], db = b - bg[2];
  return dr * dr + dg * dg + db * db;
};
const tol2 = KEY_TOL * KEY_TOL;

// 2) solid mask = pixels whose color differs from the background beyond tolerance
const solid = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  const o = i * C;
  if (dist2(data[o], data[o + 1], data[o + 2]) > tol2) solid[i] = 1;
}

// 3) separable box-dilation (binary OR) by radius R → close gaps within one object
function dilate(src) {
  const tmp = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let dx = -R; dx <= R; dx++) { const xx = x + dx; if (xx >= 0 && xx < W && src[row + xx]) { v = 1; break; } }
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let v = 0;
      for (let dy = -R; dy <= R; dy++) { const yy = y + dy; if (yy >= 0 && yy < H && tmp[yy * W + x]) { v = 1; break; } }
      out[y * W + x] = v;
    }
  }
  return out;
}
const mask = R > 0 ? dilate(solid) : solid;

// 4) connected components (8-conn) over the dilated mask, bbox from solid pixels
const seen = new Uint8Array(W * H);
const stack = new Int32Array(W * H);
const comps = [];
const N8 = [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const s = y * W + x;
    if (!mask[s] || seen[s]) continue;
    let sp = 0;
    stack[sp++] = s;
    seen[s] = 1;
    let minX = x, maxX = x, minY = y, maxY = y, area = 0;
    while (sp) {
      const p = stack[--sp];
      const pxi = p % W, py = (p / W) | 0;
      if (solid[p]) {
        area++;
        if (pxi < minX) minX = pxi; if (pxi > maxX) maxX = pxi;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
      for (const d of N8) {
        const q = p + d;
        if (q < 0 || q >= W * H) continue;
        if (Math.abs((q % W) - pxi) > 1) continue; // wrapped row edge
        if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
      }
    }
    if (area >= minArea && maxX > minX && maxY > minY) comps.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
  }
}

// 5) sort top→bottom, left→right (row-banded), export background-keyed sprites
comps.sort((a, b) => (Math.abs(a.y - b.y) > 24 ? a.y - b.y : a.x - b.x));
fs.mkdirSync(outDir, { recursive: true });
let idx = 0;
for (const c of comps) {
  idx++;
  const file = path.join(outDir, String(idx).padStart(3, "0") + ".png");
  // Build an RGBA buffer for the bbox: copy RGB, set alpha from the solid mask so the
  // flat background drops out. A 1px alpha erode would harden edges; we keep the raw
  // mask (objects here have crisp dark outlines, so halos are negligible).
  const buf = Buffer.alloc(c.w * c.h * 4);
  for (let yy = 0; yy < c.h; yy++) {
    for (let xx = 0; xx < c.w; xx++) {
      const sx = c.x + xx, sy = c.y + yy;
      const so = (sy * W + sx) * C;
      const dOff = (yy * c.w + xx) * 4;
      buf[dOff] = data[so]; buf[dOff + 1] = data[so + 1]; buf[dOff + 2] = data[so + 2];
      buf[dOff + 3] = solid[sy * W + sx] ? 255 : 0;
    }
  }
  await sharp(buf, { raw: { width: c.w, height: c.h, channels: 4 } }).png().toFile(file);
  console.log(`${idx}\t${c.x}\t${c.y}\t${c.w}\t${c.h}\t${file}`);
}
console.error(`${path.basename(atlas)}: ${idx} sprites (bg=rgb(${bg.join(",")}) minArea=${minArea} dilate=${R} keyTol=${KEY_TOL})`);
