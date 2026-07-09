import { chromium } from "/Users/wendellphillips/METROPHAGE/node_modules/playwright/index.mjs";
const S = "/private/tmp/claude-502/-Users-wendellphillips-Desktop-Claude-Code/881a4279-ffa0-487a-822c-61ed8cf16e71/scratchpad";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`file://${S}/cards/cards.html`);
for (const id of ["c1", "c2", "c3", "c4", "c5"]) {
  await page.evaluate((i) => {
    document.querySelectorAll(".card").forEach((c) => c.classList.remove("active"));
    document.getElementById(i).classList.add("active");
  }, id);
  await page.screenshot({ path: `${S}/cards/${id}.png` });
}
await browser.close();
console.log("cards done");
