// Final character review — Customize previews across both body types.
import { launch, boot, sleep } from "./rig.mjs";
import fs from "node:fs";

const OUT = "/tmp/charfinal";
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await launch();
await boot(page);

const cdp = await page.context().newCDPSession(page);
async function shot(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  console.log("shot", name);
}

await page.evaluate(() => {
  const g = window.__game;
  g.registry.set("offlinePlay", true);
  g.registry.set("classId", "metrophage");
  g.scene.getScene("Select").scene.start("Customize");
});
await sleep(3000);
await shot("male");
// flip body type: BODY TYPE row is the 2nd — arrow down once from COLOUR then toggle
await page.keyboard.press("ArrowDown");
await sleep(200);
await page.keyboard.press("ArrowRight");
await sleep(600);
await shot("female");

await browser.close();
console.log("done ->", OUT);
