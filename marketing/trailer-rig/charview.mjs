// Character art review — screenshots of Select (class cards) + Customize (big preview)
// + an in-world shot, so the new figure can be judged at every scale.
import { launch, boot, sleep } from "./rig.mjs";
import fs from "node:fs";

const OUT = process.env.OUT || "/tmp/charview";
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await launch();
await boot(page);

const cdp = await page.context().newCDPSession(page);
async function shot(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  console.log("shot", name);
}

await shot("select");

// enter the customizer (needs offlinePlay so the wallet gate passes)
await page.evaluate(() => {
  const g = window.__game;
  g.registry.set("offlinePlay", true);
  g.registry.set("classId", "metrophage");
  g.scene.getScene("Select").scene.start("Customize");
});
await sleep(3000);
await shot("customize");

// in-world scale
await page.evaluate(() => {
  const g = window.__game;
  g.scene.getScene("Customize").scene.stop();
  window.__enterCity();
});
await sleep(9000);
await shot("world");
await sleep(1000);
await shot("world2");

await browser.close();
console.log("done ->", OUT);
