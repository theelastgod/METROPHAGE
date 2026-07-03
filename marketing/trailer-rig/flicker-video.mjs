// Flicker video — record gameplay (walk + fire) and extract frames to eyeball strobing.
import { launch, boot, sleep } from "./rig.mjs";
import fs from "node:fs";

const OUT = "/tmp/flicker-video";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const { browser, context, page } = await launch({ recordDir: OUT });
await boot(page);
await page.evaluate(() => window.__enterCity());
await sleep(9000);

// deploy into a district for combat + movement (heat drives the shader hardest)
await page.evaluate(() => {
  const on = window.__game.scene.getScene("Online");
  on.enterZone("d1");
});
await sleep(8000);

// walk in a square while holding fire (mouse down at screen center-right)
await page.mouse.move(900, 360);
await page.mouse.down();
const keys = ["d", "s", "a", "w"];
for (const k of keys) {
  await page.keyboard.down(k);
  await sleep(1800);
  await page.keyboard.up(k);
}
await page.mouse.up();
await sleep(1000);

await context.close(); // flush the video
await browser.close();
console.log("done ->", OUT);
