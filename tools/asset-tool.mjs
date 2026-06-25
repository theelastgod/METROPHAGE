// METROPHAGE asset tool — slice/curate dropped art packs with sharp (dev-only).
// Usage:
//   node tools/asset-tool.mjs montage "<glob-dir>" <out.png> [cols] [cell]
//   node tools/asset-tool.mjs up <src> <out> <scale>            # nearest-neighbour upscale (for viewing)
//   node tools/asset-tool.mjs slice <src> <out> <left> <top> <w> <h>  # extract a region
//   node tools/asset-tool.mjs fit <src> <out> <w> <h>          # resize (contain, transparent pad)
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const [, , cmd, ...a] = process.argv;

function listPngs(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort()
    .map((f) => path.join(dir, f));
}

async function montage(dir, out, cols = 10, cell = 64, pad = 2) {
  cols = +cols || 10;
  cell = +cell || 64;
  const files = listPngs(dir);
  const rows = Math.ceil(files.length / cols);
  const W = cols * (cell + pad) + pad;
  const H = rows * (cell + pad) + pad;
  const comps = [];
  for (let i = 0; i < files.length; i++) {
    const buf = await sharp(files[i])
      .resize(cell, cell, { kernel: "nearest", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    comps.push({ input: buf, left: pad + (i % cols) * (cell + pad), top: pad + Math.floor(i / cols) * (cell + pad) });
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 12, g: 10, b: 26, alpha: 255 } } })
    .composite(comps)
    .png()
    .toFile(out);
  console.log(`montage ${out}: ${files.length} files, ${cols}x${rows} (cell ${cell}px). index = row*${cols}+col (0-based, row-major)`);
}

async function up(src, out, scale = 4) {
  scale = +scale || 4;
  const m = await sharp(src).metadata();
  await sharp(src).resize(m.width * scale, m.height * scale, { kernel: "nearest" }).png().toFile(out);
  console.log(`up ${out}: ${m.width}x${m.height} -> ${m.width * scale}x${m.height * scale}`);
}

async function slice(src, out, left, top, w, h) {
  await sharp(src).extract({ left: +left, top: +top, width: +w, height: +h }).png().toFile(out);
  console.log(`slice ${out}: ${w}x${h} @ ${left},${top}`);
}

async function fit(src, out, w, h) {
  await sharp(src).resize(+w, +h, { kernel: "nearest", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(out);
  console.log(`fit ${out}: ${w}x${h}`);
}

const run = { montage, up, slice, fit }[cmd];
if (!run) {
  console.error("unknown cmd:", cmd);
  process.exit(1);
}
await run(...a);
