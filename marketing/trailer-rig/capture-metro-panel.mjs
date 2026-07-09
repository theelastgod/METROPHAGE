// metro30b: $METRO bridge panel money-shot, DOM-driven (the pointer click on the
// FAB hangs under Playwright — an overlay intercepts the pointer — so drive the
// panel entirely via element.click() in page context).
import { launch, boot, clickText, visibleTexts, sleep, SCRATCH_DIR } from "./rig.mjs";
import fs from "node:fs";

const CLIPS = `${SCRATCH_DIR}/clips`;

const activeScenes = (page) => page.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));
const allText = async (page) => (await visibleTexts(page)).map((t) => t.text).join(" | ");

async function enterWorld(page) {
  await boot(page);
  await clickText(page, "◈ SIGN IN");
  await sleep(4000);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const sc = await activeScenes(page);
    if (sc.includes("Online")) break;
    const txt = await allText(page);
    if (sc.includes("Select") && txt.includes("choose your class")) {
      await page.keyboard.press("1");
      await sleep(2200);
    } else if (sc.includes("Prologue")) {
      await page.evaluate(() => window.__game.scene.getScene("Prologue").scene.start("Online", { zone: "safe" }));
      await sleep(4000);
    } else if (sc.includes("Select")) {
      for (const p of ["ENTER WORLD", "ENTER METRO CITY", "◈ DEPLOY", "RESUME"]) {
        if (await clickText(page, p)) break;
      }
      await sleep(3500);
    } else await sleep(1200);
  }
  await page.waitForFunction(() => {
    const s = window.__game?.scene?.getScene("Online");
    return !!(s && s.scene.isActive() && s.net && s.net.ws && s.net.ws.readyState === 1);
  }, { timeout: 30000 }).catch(() => console.log("WARN ws"));
  await sleep(1500);
}

const domClick = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return `MISS ${s}`;
    el.click();
    return `clicked ${s}`;
  }, sel);

const { browser, context, page } = await launch({ recordDir: CLIPS });
try {
  await enterWorld(page);
  // gentle drift so the world lives behind the panel
  page.keyboard.down("w").catch(() => {});
  await sleep(1500);
  page.keyboard.up("w").catch(() => {});
  console.log(await domClick(page, "#metro-fab"));
  await sleep(2000);
  console.log(await domClick(page, "#m-connect"));
  await sleep(3000);
  console.log(await domClick(page, "#m-refresh"));
  await sleep(2500);
  console.log(await domClick(page, "#m-max"));
  await sleep(4000);
  // linger on the filled-in panel — this is the hero frame
  await sleep(3000);
  console.log(await domClick(page, "#m-x"));
  await sleep(1500);
} finally {
  const video = page.video();
  await context.close();
  if (video) fs.renameSync(await video.path(), `${CLIPS}/metro30b.webm`);
  await browser.close();
  console.log("saved metro30b.webm");
}
