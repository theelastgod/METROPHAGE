// METROPHAGE grid chroma-key slicer — for atlases laid out on a REGULAR grid with a
// painted background/gridlines (so flood-fill merges everything). Cuts cols×rows equal
// cells, keys each cell's background to transparency, trims, and exports clean RGBA
// sprites. Use for INTERACTIVE OBJECTS / WALLS / terrain grids (dev-only).
//
// Usage:
//   node tools/grid-key-slice.mjs "<atlas.png>" <outDir> <cols> <rows> [inset] [keyTol]
//     inset  : px shaved off each cell edge to drop gridlines/neighbour bleed (default 6).
//     keyTol : color distance from cell background still counted as background
//              (default 46). 0 = no keying (keep solid cell, e.g. seamless terrain).
//
// Prints "<idx>\t<col>\t<row>\t<file>" per non-empty cell.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const [, , atlas, outDir, colsA, rowsA, insetA = "6", keyTolA = "46"] = process.argv;
if (!atlas || !outDir || !colsA || !rowsA) {
  console.error('usage: grid-key-slice "<atlas.png>" <outDir> <cols> <rows> [inset] [keyTol]');
  process.exit(1);
}
const COLS = +colsA, ROWS = +rowsA, INSET = +insetA, KEY_TOL = +keyTolA;

const { data, info } = await sharp(atlas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const cw = Math.floor(W / COLS), ch = Math.floor(H / ROWS);
fs.mkdirSync(outDir, { recursive: true });

let idx = 0;
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const x0 = c * cw + INSET, y0 = r * ch + INSET;
    const w = cw - 2 * INSET, h = ch - 2 * INSET;
    // background = median of this cell's four corners (each cell can sit on a different tone)
    const corner = (cx, cy) => { const o = ((y0 + cy) * W + (x0 + cx)) * C; return [data[o], data[o + 1], data[o + 2]]; };
    const cs = [corner(0, 0), corner(w - 1, 0), corner(0, h - 1), corner(w - 1, h - 1)];
    const bg = [0, 1, 2].map((k) => cs.map((p) => p[k]).sort((a, b) => a - b)[1]);
    const tol2 = KEY_TOL * KEY_TOL;
    const buf = Buffer.alloc(w * h * 4);
    let solidCount = 0;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const so = ((y0 + yy) * W + (x0 + xx)) * C;
        const dr = data[so] - bg[0], dg = data[so + 1] - bg[1], db = data[so + 2] - bg[2];
        const solid = KEY_TOL <= 0 || dr * dr + dg * dg + db * db > tol2;
        const dOff = (yy * w + xx) * 4;
        buf[dOff] = data[so]; buf[dOff + 1] = data[so + 1]; buf[dOff + 2] = data[so + 2];
        buf[dOff + 3] = solid ? 255 : 0;
        if (solid) solidCount++;
      }
    }
    if (solidCount < w * h * 0.02) continue; // essentially-empty cell
    idx++;
    const file = path.join(outDir, String(idx).padStart(3, "0") + ".png");
    let pipe = sharp(buf, { raw: { width: w, height: h, channels: 4 } });
    if (KEY_TOL > 0) { try { pipe = pipe.trim({ threshold: 1 }); } catch {} }
    await pipe.png().toFile(file);
    console.log(`${idx}\t${c}\t${r}\t${file}`);
  }
}
console.error(`${path.basename(atlas)}: ${idx} cells (${COLS}x${ROWS} inset=${INSET} keyTol=${KEY_TOL})`);
