import { chromium } from "/Users/wendellphillips/METROPHAGE/node_modules/playwright/index.mjs";
const S = "/Users/wendellphillips/METROPHAGE/marketing/trailer-rig";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`file://${S}/cards/captions.html`);
for (const id of ["p1", "p2", "p3", "p4", "p5", "p6", "p7"]) {
  await page.evaluate((i) => {
    document.querySelectorAll(".cap,.card").forEach((c) => c.classList.remove("active"));
    document.getElementById(i).classList.add("active");
  }, id);
  await page.screenshot({ path: `${S}/cards/${id}.png`, omitBackground: true });
}
await page.evaluate(() => {
  document.querySelectorAll(".cap,.card").forEach((c) => c.classList.remove("active"));
  document.getElementById("c6").classList.add("active");
});
await page.screenshot({ path: `${S}/cards/c6.png` });
await browser.close();
console.log("captions done");
