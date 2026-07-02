// Terrain audit — clean world screenshots of hub + district + wilderness.
import { launch, boot, sleep } from "./rig.mjs";

const OUT = process.env.OUT || "/tmp/terrain-audit";
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await launch();
await boot(page);
await page.evaluate(() => window.__enterCity());
await sleep(9000);

// CDP capture — page.screenshot() hangs waiting on the Google-Fonts @import here
const cdp = await page.context().newCDPSession(page);
async function shot(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  console.log("shot", name);
}

async function goZone(zone) {
  await page.evaluate((z) => {
    const on = window.__game.scene.getScene("Online");
    on.enterZone(z);
  }, zone);
  await sleep(8000);
}

// walk a bit so we see streets, then screenshot
async function walk(ms, key = "d") {
  await page.keyboard.down(key);
  await sleep(ms);
  await page.keyboard.up(key);
  await sleep(400);
}

await shot("01-hub-spawn");
await walk(2500, "d");
await shot("02-hub-east");
await walk(2500, "s");
await shot("03-hub-south");

await goZone("d3");
await shot("04-d3-district");
await walk(2500, "w");
await shot("05-d3-walk");

await goZone("d6");
await shot("06-d6-district");

await browser.close();
console.log("done ->", OUT);
