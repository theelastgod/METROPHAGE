// Tier audit — capture the city at a forced graphics tier (default: whatever auto picks).
// TIER=low|medium|high OUT=/tmp/dir node tier-audit.mjs
import { launch, boot, sleep } from "./rig.mjs";
import fs from "node:fs";

const TIER = process.env.TIER || "";
const OUT = process.env.OUT || `/tmp/tier-${TIER || "auto"}`;
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await launch();
if (TIER) {
  await page.addInitScript((tier) => {
    try {
      const KEY = "metrophage_settings_v1";
      const cur = JSON.parse(localStorage.getItem(KEY) || "{}");
      cur.graphicsQuality = tier;
      localStorage.setItem(KEY, JSON.stringify(cur));
    } catch {}
  }, TIER);
}
await boot(page);
await page.evaluate(() => window.__enterCity());
await sleep(9000);

const cdp = await page.context().newCDPSession(page);
async function shot(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  console.log("shot", name);
}

await shot("hub");
await sleep(1200);
await shot("hub2"); // full-screen juice flashes (level-up etc.) can eat a single frame
// deploy to a garrisoned district so enemies (and their shadows) are in frame
await page.evaluate(() => window.__game.scene.getScene("Online").enterZone("d1"));
await sleep(8000);
// walk toward the action for a couple seconds
await page.keyboard.down("d");
await sleep(2000);
await page.keyboard.up("d");
await sleep(500);
await shot("district");
await sleep(1200);
await shot("district2");

const fps = await page.evaluate(() => Math.round(window.__game.loop.actualFps));
const tier = await page.evaluate(() => JSON.parse(localStorage.getItem("metrophage_settings_v1") || "{}"));
console.log("fps:", fps, "settings tier:", tier.graphicsQuality, "cap:", tier.autoTierCap);

await browser.close();
console.log("done ->", OUT);
