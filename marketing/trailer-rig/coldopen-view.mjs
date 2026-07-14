// Cold-open audit — clear the seen flag, watch the intro beats, fight, capture.
import { launch, sleep } from "./rig.mjs";
import fs from "node:fs";

const OUT = "/tmp/coldopen";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await launch();
await page.addInitScript(() => {
  try {
    localStorage.removeItem("metrophage_skip_coldopen");
    localStorage.removeItem("metrophage_coldopen_v2");
    localStorage.removeItem("metrophage_coldopen_v1");
  } catch {}
});
await page.goto("http://127.0.0.1:5188/", { waitUntil: "commit", timeout: 60000 });

const cdp = await page.context().newCDPSession(page);
async function shot(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  console.log("shot", name);
}

// wait for the ColdOpen scene
const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  try {
    const on = await page.evaluate(() => {
      const g = window.__game;
      return !!g && g.scene.getScenes(true).some((s) => s.scene.key === "ColdOpen");
    });
    if (on) break;
  } catch {}
  await sleep(500);
}
await sleep(800);
await shot("1-stream-intro");
// skip the Stream overlay if present, then capture text beats
try {
  await page.click("#mp-intro .mp-intro-skip", { timeout: 4000 });
} catch {
  await page.keyboard.press("Escape");
}
await sleep(1200);
await shot("2-signal-lost");
await sleep(2200);
await shot("3-reprint");
await sleep(2200);
await shot("4-hook");
// let remaining lines run out to the menu
await sleep(5000);
const state = await page.evaluate(() => {
  const g = window.__game;
  return {
    active: g.scene.getScenes(true).map((s) => s.scene.key),
    seen: localStorage.getItem("metrophage_coldopen_v2"),
  };
});
console.log("end state:", JSON.stringify(state));
await shot("5-after");

await browser.close();
console.log("done ->", OUT);
