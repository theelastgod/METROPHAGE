#!/usr/bin/env node
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const [,, input, prefix, ...labels] = process.argv;
if (!input || !prefix || labels.length !== 16) {
  throw new Error("usage: node tools/process-hf-web-sheet.mjs INPUT PREFIX label1 ... label16");
}

const outDir = process.env.HF_SHEET_OUT || "public/assets/objects";
await mkdir(outDir, { recursive: true });
const meta = await sharp(input).metadata();
if (!meta.width || !meta.height) throw new Error("image dimensions unavailable");

const cols = 4;
const rows = 4;
const cellW = Math.floor(meta.width / cols);
const cellH = Math.floor(meta.height / rows);
// Some generators add a caption strip even when prompted not to. Allow callers
// to discard that strip before alpha extraction without changing normal sheets.
const cropBottomRatio = Math.min(1, Math.max(0.5, Number(process.env.HF_SHEET_CROP_BOTTOM || 1)));

async function removeConnectedBackground(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const corners = [0, width - 1, (height - 1) * width, width * height - 1];
  const bg = [0, 1, 2].map((channel) => {
    const values = corners.map((i) => data[i * channels + channel]).sort((a, b) => a - b);
    return Math.round((values[1] + values[2]) / 2);
  });
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const isBackground = (i) => {
    const p = i * channels;
    const dr = data[p] - bg[0];
    const dg = data[p + 1] - bg[1];
    const db = data[p + 2] - bg[2];
    return dr * dr + dg * dg + db * db < 42 * 42;
  };
  const enqueue = (i) => {
    if (!seen[i] && isBackground(i)) {
      seen[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = Math.floor(i / width);
    data[i * channels + 3] = 0;
    if (x > 0) enqueue(i - 1);
    if (x + 1 < width) enqueue(i + 1);
    if (y > 0) enqueue(i - width);
    if (y + 1 < height) enqueue(i + width);
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

for (let i = 0; i < 16; i++) {
  const x = (i % cols) * cellW;
  const y = Math.floor(i / cols) * cellH;
  const width = i % cols === cols - 1 ? meta.width - x : cellW;
  const sourceHeight = Math.floor(i / cols) === rows - 1 ? meta.height - y : cellH;
  const height = Math.max(1, Math.floor(sourceHeight * cropBottomRatio));
  const crop = await sharp(input).extract({ left: x, top: y, width, height }).png().toBuffer();
  const transparent = await removeConnectedBackground(crop);
  const dest = `${outDir}/${prefix}_${labels[i]}.png`;
  await sharp(transparent)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(384, 384, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toFile(dest);
  console.log(dest);
}
