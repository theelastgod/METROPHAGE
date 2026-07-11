// Replace the walkable district floor cells of metrophage_tiles.png with SEAMLESS,
// borderless dark-concrete/asphalt tiles. The source art tiles are framed panels — each
// has a bright per-cell border, so tiling them draws a visible grid ("block maze"). These
// wrap-tileable noise tiles read as one continuous grimy street instead.
//
// Only the district walkable floors are touched (FLOOR/SIDEWALK/LANE + their variant cells,
// per TILE_VARIANTS in district.ts). Neon/plaza/dirt/grass/roof/wall cells are left alone,
// so the wilderness + neon accents + buildings keep their authored art.
//
// Usage: ~/.local/node/bin/node tools/floor-tiles-gen.mjs
import sharp from "sharp";

const CELL = 32, COLS = 8;
const SRC = "public/assets/tilesets/metrophage_tiles.png";

// index → cell (x,y) in the atlas
const cellXY = (i) => [(i % COLS) * CELL, Math.floor(i / COLS) * CELL];

// hash → 0..1
const rnd = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

// wrap-tileable value noise on a G×G control grid (edges wrap → seamless when tiled)
function wrapNoise(seed, G = 6) {
  const g = [];
  for (let j = 0; j < G; j++) { g[j] = []; for (let i = 0; i < G; i++) g[j][i] = rnd(seed, i, j); }
  const sm = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const gx = u * G, gy = v * G;
    const i0 = Math.floor(gx) % G, j0 = Math.floor(gy) % G;
    const i1 = (i0 + 1) % G, j1 = (j0 + 1) % G;
    const fx = sm(gx - Math.floor(gx)), fy = sm(gy - Math.floor(gy));
    const a = g[j0][i0] * (1 - fx) + g[j0][i1] * fx;
    const b = g[j1][i0] * (1 - fx) + g[j1][i1] * fx;
    return a * (1 - fy) + b * fy;
  };
}

/** Generate one seamless 32×32 RGBA tile as a raw Buffer. */
function makeTile(base, seed, opts = {}) {
  const amp = opts.amp ?? 0.34;      // large-scale mottling
  const grain = opts.grain ?? 0.05;  // fine per-pixel grain
  const coarse = wrapNoise(seed, opts.G ?? 6);
  const fine = wrapNoise(seed + 91, 12);
  const buf = Buffer.alloc(CELL * CELL * 4);
  // a couple of darker grime specks per tile (kept off the very edges is unnecessary since
  // they're small; positions are hashed for variety)
  const specks = [];
  const ns = 2 + Math.floor(rnd(seed, 7, 7) * 3);
  for (let s = 0; s < ns; s++) specks.push([rnd(seed, s, 11) * CELL, rnd(seed, s, 23) * CELL, 2 + rnd(seed, s, 5) * 3]);
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const u = x / CELL, v = y / CELL;
      let f = 1 + (coarse(u, v) - 0.5) * amp + (fine(u, v) - 0.5) * grain;
      // subtle diagonal sheen so it isn't dead-flat (wraps: uses only the noise, no seams)
      for (const [sx, sy, sr] of specks) {
        // toroidal distance so specks near an edge still tile cleanly
        const dx = Math.min(Math.abs(x - sx), CELL - Math.abs(x - sx));
        const dy = Math.min(Math.abs(y - sy), CELL - Math.abs(y - sy));
        const d = Math.hypot(dx, dy);
        if (d < sr) f *= 0.72 + 0.28 * (d / sr);
      }
      const o = (y * CELL + x) * 4;
      buf[o] = Math.max(0, Math.min(255, Math.round(base[0] * f)));
      buf[o + 1] = Math.max(0, Math.min(255, Math.round(base[1] * f)));
      buf[o + 2] = Math.max(0, Math.min(255, Math.round(base[2] * f)));
      buf[o + 3] = 255;
    }
  }
  return buf;
}

/** A seamless dark ROOF/wall tile: dark base + faint interior panel seams + a couple of
 *  dim tech-window glints in the type's accent — no bright per-cell frame, so buildings
 *  read as continuous solid masses instead of a grid of framed squares. */
function makeRoofTile(base, accent, seed) {
  const coarse = wrapNoise(seed, 5);
  const fine = wrapNoise(seed + 41, 12);
  const buf = Buffer.alloc(CELL * CELL * 4);
  // interior panel seams (never on the edge → tiles stay seamless)
  const seamX = 6 + Math.floor(rnd(seed, 1, 2) * 20);
  const seamY = 6 + Math.floor(rnd(seed, 3, 4) * 20);
  // a few dim windows
  const wins = [];
  const nw = 1 + Math.floor(rnd(seed, 9, 9) * 3);
  for (let w = 0; w < nw; w++) wins.push([5 + rnd(seed, w, 13) * 22, 5 + rnd(seed, w, 27) * 22, 0.15 + rnd(seed, w, 31) * 0.3]);
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const u = x / CELL, v = y / CELL;
      let f = 1 + (coarse(u, v) - 0.5) * 0.22 + (fine(u, v) - 0.5) * 0.05;
      if (x === seamX || y === seamY) f *= 0.7; // recessed panel seam
      let r = base[0] * f, g = base[1] * f, b = base[2] * f;
      for (const [wx, wy, wa] of wins) {
        if (Math.abs(x - wx) <= 1 && Math.abs(y - wy) <= 1) {
          r = r * (1 - wa) + ((accent >> 16) & 0xff) * wa;
          g = g * (1 - wa) + ((accent >> 8) & 0xff) * wa;
          b = b * (1 - wa) + (accent & 0xff) * wa;
        }
      }
      const o = (y * CELL + x) * 4;
      buf[o] = Math.max(0, Math.min(255, Math.round(r)));
      buf[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      buf[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
      buf[o + 3] = 255;
    }
  }
  return buf;
}

/** A seamless NEON floor tile (plaza / neon strip): dark base with soft pools of glow in
 *  the accent colour — reads as wet, neon-lit ground instead of a framed magenta grid. */
function makeNeonTile(base, glow, seed) {
  const pool = wrapNoise(seed, 4);      // large soft glow pools
  const fine = wrapNoise(seed + 61, 10);
  const buf = Buffer.alloc(CELL * CELL * 4);
  const gr = (glow >> 16) & 0xff, gg = (glow >> 8) & 0xff, gb = glow & 0xff;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const u = x / CELL, v = y / CELL;
      // glow amount: smooth pools, gently gated so most of the tile stays dark
      let p = pool(u, v);
      p = Math.max(0, p - 0.4) / 0.6;   // only the brighter half pools glow
      p = p * p * (0.7 + 0.6 * fine(u, v));
      const g2 = Math.min(1, p * 0.85);
      const r = base[0] * (1 - g2) + gr * g2;
      const g = base[1] * (1 - g2) + gg * g2;
      const b = base[2] * (1 - g2) + gb * g2;
      const o = (y * CELL + x) * 4;
      buf[o] = Math.max(0, Math.min(255, Math.round(r)));
      buf[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      buf[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
      buf[o + 3] = 255;
    }
  }
  return buf;
}

// neon floor families (plaza + neon strip): dark base + accent glow
const NEONS = [
  { name: "PLAZA", base: [30, 18, 44], glow: 0xc23bff, cells: [3, 22] },   // purple nightlife plaza
  { name: "NEON",  base: [34, 14, 40], glow: 0xff2bd6, cells: [13, 35] },  // magenta neon strip
];

// walkable floor families: base tone + atlas cells (base index + its variants)
const FAMILIES = [
  { name: "FLOOR",    base: [34, 40, 55], cells: [0, 18, 19] },
  { name: "SIDEWALK", base: [50, 57, 72], cells: [1, 21, 37] },
  { name: "LANE",     base: [19, 21, 30], cells: [2, 20, 38] },
];
// building roof/wall families: base tone + accent (window glint) + cells (base + variant)
const ROOFS = [
  { name: "WALL",     base: [40, 46, 62], accent: 0xbfe8ff, cells: [4, 25] },  // downtown
  { name: "WALL_IND", base: [52, 46, 34], accent: 0x9dff3c, cells: [7, 26] },  // industrial
  { name: "WALL_RES", base: [54, 44, 50], accent: 0xffb86a, cells: [8, 27] },  // residential
  { name: "WALL_CORP",base: [36, 48, 68], accent: 0x29e7ff, cells: [9, 28] },  // corporate glass
  { name: "WALL_SLUM",base: [46, 42, 40], accent: 0xff5ad0, cells: [15, 29] }, // shanty
  { name: "INNER",    base: [48, 44, 58], accent: 0x8dfff0, cells: [17, 36] }, // interior wall
];

const composites = [];
for (const fam of FAMILIES) {
  for (let k = 0; k < fam.cells.length; k++) {
    const idx = fam.cells[k];
    const raw = makeTile(fam.base, idx * 131 + k * 17 + 3, { amp: fam.name === "LANE" ? 0.28 : 0.36 });
    const png = await sharp(raw, { raw: { width: CELL, height: CELL, channels: 4 } }).png().toBuffer();
    const [x, y] = cellXY(idx);
    composites.push({ input: png, left: x, top: y });
  }
}
for (const fam of ROOFS) {
  for (let k = 0; k < fam.cells.length; k++) {
    const idx = fam.cells[k];
    const raw = makeRoofTile(fam.base, fam.accent, idx * 197 + k * 29 + 11);
    const png = await sharp(raw, { raw: { width: CELL, height: CELL, channels: 4 } }).png().toBuffer();
    const [x, y] = cellXY(idx);
    composites.push({ input: png, left: x, top: y });
  }
}
for (const fam of NEONS) {
  for (let k = 0; k < fam.cells.length; k++) {
    const idx = fam.cells[k];
    const raw = makeNeonTile(fam.base, fam.glow, idx * 233 + k * 41 + 7);
    const png = await sharp(raw, { raw: { width: CELL, height: CELL, channels: 4 } }).png().toBuffer();
    const [x, y] = cellXY(idx);
    composites.push({ input: png, left: x, top: y });
  }
}

import fs from "node:fs";
const out = "public/assets/tilesets/metrophage_tiles.png";
const tmp = out + ".tmp.png";
await sharp(SRC).composite(composites).toFile(tmp);
fs.renameSync(tmp, out);
console.log(`rewrote ${composites.length} cells (floors + building roofs, seamless) → ${out}`);
