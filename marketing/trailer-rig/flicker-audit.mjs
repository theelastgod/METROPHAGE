// Flicker audit — burst-capture consecutive frames and diff them to catch strobing.
import { launch, boot, sleep } from "./rig.mjs";
import fs from "node:fs";
import sharp from "/Users/wendellphillips/METROPHAGE/node_modules/sharp/dist/index.cjs";

const OUT = process.env.OUT || "/tmp/flicker-audit";
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await launch();
await boot(page);
await page.evaluate(() => window.__enterCity());
await sleep(10000);

const cdp = await page.context().newCDPSession(page);
async function shot(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
}

// hold still (no input) so ONLY spontaneous flicker shows in the diffs
const N = 8;
for (let i = 0; i < N; i++) {
  await shot(`f${i}`);
  await sleep(140);
}

// per-pixel diff of consecutive frames: % changed + a rough bounding box
for (let i = 1; i < N; i++) {
  const a = await sharp(`${OUT}/f${i - 1}.png`).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(`${OUT}/f${i}.png`).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = a.info;
  let changed = 0;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * channels;
      const d =
        Math.abs(a.data[o] - b.data[o]) +
        Math.abs(a.data[o + 1] - b.data[o + 1]) +
        Math.abs(a.data[o + 2] - b.data[o + 2]);
      if (d > 60) {
        changed++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const pct = ((changed / (width * height)) * 100).toFixed(2);
  console.log(`f${i - 1}->f${i}: ${pct}% changed, bbox=(${minX},${minY})-(${maxX},${maxY})`);
}

await browser.close();
console.log("done ->", OUT);
