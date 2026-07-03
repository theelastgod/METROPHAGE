// A/B the NeonPipeline heat drive: burst-diff frames at uHeat 0 vs 0.77.
import { launch, boot, sleep } from "./rig.mjs";
import fs from "node:fs";
import sharp from "/Users/wendellphillips/METROPHAGE/node_modules/sharp/dist/index.cjs";

const OUT = "/tmp/heat-flicker";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await launch();
await boot(page);
await page.evaluate(() => window.__enterCity());
await sleep(9000);

const cdp = await page.context().newCDPSession(page);
async function shot(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
}
async function diffPct(a, b) {
  const A = await sharp(`${OUT}/${a}.png`).raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(`${OUT}/${b}.png`).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = A.info;
  let changed = 0;
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    const d = Math.abs(A.data[o]-B.data[o]) + Math.abs(A.data[o+1]-B.data[o+1]) + Math.abs(A.data[o+2]-B.data[o+2]);
    if (d > 60) changed++;
  }
  return ((changed / (width * height)) * 100).toFixed(2);
}

// pin the shader heat via the scene's neon handle
async function setHeat(v) {
  await page.evaluate((h) => {
    const on = window.__game.scene.getScene("Online");
    if (on.neon) { Object.defineProperty(on, "neonHeatPin", { value: h, configurable: true }); on.neon.heat = h; }
    // hold it against the per-frame update
    if (window.__heatPin) clearInterval(window.__heatPin);
    window.__heatPin = setInterval(() => { const s = window.__game.scene.getScene("Online"); if (s.neon) s.neon.heat = h; }, 30);
  }, v);
  await sleep(600);
}

for (const h of [0, 0.45, 0.77]) {
  await setHeat(h);
  await shot(`h${h}-a`);
  await sleep(150);
  await shot(`h${h}-b`);
  await sleep(150);
  await shot(`h${h}-c`);
  const d1 = await diffPct(`h${h}-a`, `h${h}-b`);
  const d2 = await diffPct(`h${h}-b`, `h${h}-c`);
  console.log(`uHeat=${h}: frame diffs ${d1}% / ${d2}%`);
}

await browser.close();
console.log("done ->", OUT);
