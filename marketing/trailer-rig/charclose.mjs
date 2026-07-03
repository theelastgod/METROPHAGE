// Close-up of the player figure in-world: dismiss dialogue, zoom the camera, walk a bit.
import { launch, boot, sleep } from "./rig.mjs";
import fs from "node:fs";

const OUT = "/tmp/charclose";
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await launch();
await boot(page);
await page.evaluate(() => window.__enterCity());
await sleep(9000);

const cdp = await page.context().newCDPSession(page);
async function shot(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  console.log("shot", name);
}

// advance any dialogue (click), then zoom in on the runner (ESC would quit to menu!)
await page.mouse.click(640, 400);
await sleep(400);
await page.mouse.click(640, 400);
await sleep(400);
await page.evaluate(() => {
  const on = window.__game.scene.getScene("Online");
  on.cameras.main.setZoom(3);
});
await sleep(600);
await shot("idle");
// walk down (front view mid-stride)
await page.keyboard.down("s");
await sleep(700);
await shot("walk-down");
await page.keyboard.up("s");
// walk right (profile)
await page.keyboard.down("d");
await sleep(700);
await shot("walk-right");
await page.keyboard.up("d");
// face up (back view)
await page.keyboard.down("w");
await sleep(700);
await shot("walk-up");
await page.keyboard.up("w");

await browser.close();
console.log("done ->", OUT);
