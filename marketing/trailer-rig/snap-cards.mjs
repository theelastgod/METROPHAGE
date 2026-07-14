import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)));
const cardsDir = join(root, "cards");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`file://${join(cardsDir, "cards.html")}`);
for (const id of ["c1", "c2", "c3", "c4", "c5"]) {
  await page.evaluate((i) => {
    document.querySelectorAll(".card").forEach((c) => c.classList.remove("active"));
    document.getElementById(i).classList.add("active");
  }, id);
  await page.screenshot({ path: join(cardsDir, `${id}.png`) });
}
await browser.close();
console.log("cards done");
