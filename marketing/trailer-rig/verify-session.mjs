// Verify this session's work in a live game: human cops (stub-sprite fix), the
// PROVING hub door, elite auras, and combat. Zoomed captures.
import { launch, boot, sleep } from "./rig.mjs";
import fs from "node:fs";

const OUT = "/tmp/verify-session";
fs.rmSync(OUT, { recursive: true, force: true });
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

// dismiss any dialogue (click, never ESC — ESC quits online to menu)
await page.mouse.click(640, 400);
await sleep(500);

// deploy into a garrisoned district so cops (the stub-fix target) are in frame
await page.evaluate(() => window.__game.scene.getScene("Online").enterZone("d1"));
await sleep(9000);
await page.evaluate(() => { const on = window.__game.scene.getScene("Online"); on.cameras.main.setZoom(2.4); });
await sleep(600);
await shot("district-cops-idle");

// walk toward the nearest enemy and open fire so we catch cops mid-fight + FX
for (let i = 0; i < 18; i++) {
  const dir = await page.evaluate(() => {
    const on = window.__game.scene.getScene("Online");
    let best = null, bd = 1e9;
    for (const e of on.net.enemies.values()) {
      const d = Math.hypot(e.x - on.me.x, e.y - on.me.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return null;
    return { dx: best.x - on.me.x, dy: best.y - on.me.y };
  });
  if (dir) {
    const k = Math.abs(dir.dx) > Math.abs(dir.dy) ? (dir.dx > 0 ? "d" : "a") : (dir.dy > 0 ? "s" : "w");
    await page.keyboard.down(k);
    await sleep(220);
    await page.keyboard.up(k);
    await page.mouse.click(640 + Math.sign(dir.dx) * 120, 360 + Math.sign(dir.dy) * 90);
  }
  await sleep(120);
}
await shot("district-combat");

const stat = await page.evaluate(() => {
  const on = window.__game.scene.getScene("Online");
  const cop = on.enemySprites.size ? [...on.enemySprites.values()][0] : null;
  return {
    enemies: on.net.enemies.size,
    copTexture: cop ? cop.texture.key : "none",
    copFrames: cop ? cop.texture.frameTotal : 0, // human bake = 16 frames; stub = 4
  };
});
console.log("in-district:", JSON.stringify(stat));

await browser.close();
console.log("done ->", OUT);
