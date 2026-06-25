// Assemble the real-art 8×4 METROPHAGE tileset (public/assets/tilesets/metrophage_tiles.png)
// from the asset-drop terrain cells, preserving the index→tile contract in src/world/district.ts.
//
// Cells 0–17 are the canonical tiles (one best-match per game index). Cells 18–31 hold
// extra VARIANTS of the most-repeated tiles (concrete/road/roofs/…), each a visibly different
// source swatch, so the in-game variation pass (src/render/tileVariants.ts) can scatter them
// and break the "same square repeated" grid. The script prints the VARIANTS map to paste into
// district.ts.
//
// Auto-pick scoring: tone-match to a per-index target + (for field tiles) a uniformity penalty
// (quadrant variance catches straddle-seams, centre-vs-border catches centred frames). Field
// tiles are centre-cropped to drop each cell's decorative border so a tiled field reads as
// continuous texture; framed roof/wall tiles keep their frame.
//
// Prereq: slice every terrain atlas file into art-source/terrain/{field_*,framed_*} dirs first
// (tools/grid-key-slice.mjs, full cells: "<atlas>" <out> <cols> <rows> 0 0 — field 8×8, framed 4×4).
// Usage: ~/.local/node/bin/node tools/tileset-gen.mjs [cellPx=32]
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const CELL = +(process.argv[2] || 32);
const COLS = 8, ROWS = 4;
const T = "art-source/terrain";
const poolByPrefix = (prefix) => fs.readdirSync(T)
  .filter((d) => d.startsWith(prefix) && fs.statSync(path.join(T, d)).isDirectory())
  .flatMap((d) => fs.readdirSync(path.join(T, d)).filter((f) => f.endsWith(".png")).map((f) => path.join(T, d, f)));
const FIELD = poolByPrefix("field_");
const FRAMED = poolByPrefix("framed_");
const srcDir = (f) => path.basename(path.dirname(f)); // per-file source dir, e.g. "field_groun_2"

// ── per-cell stats ──────────────────────────────────────────────────────────
async function stats(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const mean = (x0, y0, x1, y1) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * W + x) * 3; r += data[o]; g += data[o + 1]; b += data[o + 2]; n++; }
    return [r / n, g / n, b / n];
  };
  const hx = W >> 1, hy = H >> 1;
  const quads = [mean(0, 0, hx, hy), mean(hx, 0, W, hy), mean(0, hy, hx, H), mean(hx, hy, W, H)];
  const all = mean(0, 0, W, H);
  let qv = 0;
  for (let c = 0; c < 3; c++) { const m = quads.reduce((s, q) => s + q[c], 0) / 4; qv += quads.reduce((s, q) => s + (q[c] - m) ** 2, 0) / 4; }
  const cen = mean((W >> 2), (H >> 2), W - (W >> 2), H - (H >> 2));
  const border = [0, 1, 2].map((c) => (all[c] * W * H - cen[c] * (W / 2) * (H / 2)) / (W * H - (W / 2) * (H / 2)));
  const cb = Math.hypot(cen[0] - border[0], cen[1] - border[1], cen[2] - border[2]);
  return { file, mean: all, qv: Math.sqrt(qv), cb };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sat = (m) => Math.max(...m) - Math.min(...m);

// ── tile spec: index → {pool, target tone, mode} ──────────────────────────────
const SPEC = {
  0:  { pool: "field", t: [30, 38, 54], mode: "flat" },
  1:  { pool: "field", t: [58, 66, 84], mode: "flat" },
  2:  { pool: "field", t: [10, 12, 18], mode: "flat" },
  3:  { pool: "field", t: [96, 40, 128], mode: "neon" },
  5:  { pool: "field", t: [22, 56, 44], mode: "flat" },
  6:  { pool: "field", t: [16, 44, 86], mode: "flat" },
  10: { pool: "field", t: [70, 44, 18], mode: "flat" },
  11: { pool: "framed", t: [44, 50, 60], mode: "framed" },
  12: { pool: "field", t: [44, 50, 64], mode: "flat" },
  13: { pool: "field", t: [150, 48, 156], mode: "neon" },
  14: { pool: "field", t: [42, 32, 22], mode: "flat" },
  16: { pool: "field", t: [56, 44, 32], mode: "flat" },
  4:  { pool: "framed", t: [26, 40, 62], mode: "framed" },
  7:  { pool: "framed", t: [74, 52, 26], mode: "framed" },
  8:  { pool: "framed", t: [50, 44, 58], mode: "framed" },
  9:  { pool: "framed", t: [14, 22, 44], mode: "framed" },
  15: { pool: "framed", t: [50, 36, 22], mode: "framed" },
  17: { pool: "framed", t: [30, 28, 42], mode: "framed" },
};

// which bases get extra variants, and the free cell slots (18–31) that hold them
const VAR_SLOTS = {
  0: [18, 19], 2: [20], 1: [21], 3: [22], 10: [23], 14: [24],
  4: [25], 7: [26], 8: [27], 9: [28], 15: [29], 16: [30], 11: [31],
};

const fieldStats = await Promise.all(FIELD.map(stats));
const framedStats = await Promise.all(FRAMED.map(stats));

const scoreFor = (idx, c) => {
  const s = SPEC[idx];
  if (s.mode === "neon") return dist(c.mean, s.t) - 0.7 * sat(c.mean);
  let sc = dist(c.mean, s.t);
  if (s.mode === "flat") sc += 2.0 * c.qv + 3.5 * c.cb;
  return sc; // framed: tone only
};

// sorted candidate list per index (best first)
const sorted = {};
for (const idx of Object.keys(SPEC).map(Number)) {
  const cands = (SPEC[idx].pool === "framed" ? framedStats : fieldStats).slice();
  cands.sort((a, b) => scoreFor(idx, a) - scoreFor(idx, b));
  sorted[idx] = cands;
}

// primaries (priority order, anti-reuse so distinct indices don't grab the same swatch)
const order = [2, 0, 1, 3, 13, 6, 5, 10, 14, 12, 16, 9, 4, 7, 8, 15, 11, 17];
const used = new Set();
const pick = {};
for (const idx of order) {
  const c = sorted[idx].find((c) => !used.has(c.file)) || sorted[idx][0];
  used.add(c.file);
  pick[idx] = c;
}

// variants: next best candidates from a DIFFERENT source file (visible diversity), not reused
const slotCell = {};   // slot index → cell
const slotBase = {};   // slot index → base index (for framed-aware crop)
const VARIANTS = {};   // base → [base, ...slots]
const TONE = 40; // a variant must be within this colour distance of the primary (same surface)
for (const baseS of Object.keys(VAR_SLOTS)) {
  const base = +baseS;
  VARIANTS[base] = [base];
  const chosenDirs = new Set([srcDir(pick[base].file)]);
  const take = (requireNewDir) => {
    for (const c of sorted[base]) {
      if (VARIANTS[base].length - 1 >= VAR_SLOTS[base].length) break;
      if (used.has(c.file)) continue;
      if (dist(c.mean, pick[base].mean) > TONE) continue;            // same surface tone (not a different material)
      if (requireNewDir && chosenDirs.has(srcDir(c.file))) continue; // different source file → different detail
      const slot = VAR_SLOTS[base][VARIANTS[base].length - 1];
      slotCell[slot] = c; slotBase[slot] = base; used.add(c.file); chosenDirs.add(srcDir(c.file));
      VARIANTS[base].push(slot);
    }
  };
  take(true);   // prefer different source files (visible variety)
  take(false);  // relax to same-file swatches if we still need more
}

// ── composite the 8×4 tileset ─────────────────────────────────────────────────
const cellFor = (idx) => idx < 18 ? pick[idx] : slotCell[idx];
const modeFor = (idx) => idx < 18 ? SPEC[idx]?.mode : SPEC[slotBase[idx]]?.mode;
const comps = [];
const placed = {};
for (let idx = 0; idx < COLS * ROWS; idx++) {
  const cell = cellFor(idx) || pick[0]; // unfilled → concrete, never invisible
  const framed = (modeFor(idx) ?? "flat") === "framed";
  let img = sharp(cell.file);
  if (!framed) {
    const m = await img.metadata();
    const cw = Math.round(m.width * 0.78), ch = Math.round(m.height * 0.78);
    img = sharp(cell.file).extract({ left: (m.width - cw) >> 1, top: (m.height - ch) >> 1, width: cw, height: ch });
  }
  const buf = await img.resize(CELL, CELL, { kernel: "lanczos3" }).removeAlpha().png().toBuffer();
  comps.push({ input: buf, left: (idx % COLS) * CELL, top: Math.floor(idx / COLS) * CELL });
  placed[idx] = cell ? srcDir(cell.file) + "/" + path.basename(cell.file) : "(concrete)";
}
const out = "public/assets/tilesets/metrophage_tiles.png";
// Noir grade: pull the floor DOWN in brightness + saturation so terrain recedes and the
// characters / neon / signage read on top of it (these source tiles are too hot/busy raw).
const DARKEN = 0.6, DESAT = 0.78;
await sharp({ create: { width: COLS * CELL, height: ROWS * CELL, channels: 3, background: { r: 8, g: 8, b: 12 } } })
  .composite(comps).modulate({ brightness: DARKEN, saturation: DESAT }).png({ compressionLevel: 9 }).toFile(out);

// ── report + district.ts snippet ─────────────────────────────────────────────
const NAMES = { 0: "concrete", 1: "sidewalk", 2: "road", 3: "plaza", 4: "roof-downtown", 5: "park", 6: "water", 7: "roof-industrial", 8: "roof-residential", 9: "roof-corporate", 10: "market", 11: "grate", 12: "crosswalk", 13: "neon", 14: "dirt", 15: "roof-slum", 16: "inner-floor", 17: "inner-wall" };
console.log(`\n${out} — ${COLS * CELL}×${ROWS * CELL} (cell ${CELL}px)\n`);
for (let i = 0; i < 18; i++) {
  const vs = VARIANTS[i] ? `  variants→[${VARIANTS[i].join(",")}]` : "";
  console.log(`  ${String(i).padStart(2)} ${NAMES[i].padEnd(16)} ← ${placed[i]}${vs}`);
}
const WALL_BASES = [4, 7, 8, 9, 15]; // colliding roofs
const wallVariants = WALL_BASES.flatMap((b) => (VARIANTS[b] || []).slice(1));
console.log(`\n// paste into src/world/district.ts:`);
console.log(`export const TILE_VARIANTS: Record<number, number[]> = ${JSON.stringify(VARIANTS).replace(/"/g, "")};`);
console.log(`// wall-variant indices (must collide): [${wallVariants.join(", ")}]`);
