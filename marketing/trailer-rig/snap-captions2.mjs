// Snap caption overlays (transparent PNGs) from cards/captions.html.
// Usage: node snap-captions2.mjs [id ...]   default: p8
import { chromium } from "/Users/wendellphillips/METROPHAGE/node_modules/playwright/index.mjs";
const DIR = "/Users/wendellphillips/METROPHAGE/marketing/trailer-rig/cards";
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["p8"];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`file://${DIR}/captions.html`);
for (const id of ids) {
  await page.evaluate((i) => {
    document.querySelectorAll(".cap,.card").forEach((c) => c.classList.remove("active"));
    document.getElementById(i).classList.add("active");
  }, id);
  await page.screenshot({ path: `${DIR}/${id}.png`, omitBackground: true });
  console.log(`snapped ${id}.png`);
}
await browser.close();
