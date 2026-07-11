// Depth-pass audit: hub + district captures at two camera positions (the roof
// projection only reads against motion — compare cap offsets between shots).
// TIER=low for the thinned path.
import { launch, boot, sleep } from "./rig.mjs";
import fs from "node:fs";

const TIER = process.env.TIER || "";
const OUT = process.env.OUT || `/tmp/depth-${TIER || "high"}`;
fs.rmSync(OUT, { recursive: true, force: true });
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
await page.mouse.click(640, 400); // clear dialogue
await sleep(400);

const cdp = await page.context().newCDPSession(page);
async function shot(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  console.log("shot", name);
}

// hub: hold a walk so the roofs shear + the camera leads, then snap mid-motion
await page.keyboard.down("d");
await sleep(1600);
await shot("hub-walk-east");
await page.keyboard.up("d");
await page.keyboard.down("w");
await sleep(1600);
await shot("hub-walk-north");
await page.keyboard.up("w");

// district: same, with combat light pools
await page.evaluate(() => window.__game.scene.getScene("Online").enterZone("d0"));
await sleep(9000);
await page.keyboard.down("s");
await sleep(1400);
await page.keyboard.up("s");
for (let i = 0; i < 6; i++) {
  await page.mouse.click(700, 300);
  await sleep(160);
}
await shot("district-fire");

const err = await page.evaluate(() => (window.__lastError ?? null));
console.log("pageerror:", err);
await browser.close();
console.log("done ->", OUT);
