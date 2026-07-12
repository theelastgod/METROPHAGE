#!/usr/bin/env node
// Verify the mobile quest tracker hugs the LEFT edge (not mid-screen) + screenshot.
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

const BASE = `http://127.0.0.1:5177/?mobile=1`;
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 844, height: 390 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__enterCity === "function", { timeout: 20000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__enterCity());
await page.waitForFunction(() => window.__panelProbe && window.__game.scene.getScene("Online").net.connected, { timeout: 20000 });
await page.waitForTimeout(1500);

const r = await page.evaluate(() => {
  const s = window.__game.scene.getScene("Online");
  const rows = ["questText", "dailyText", "bountyText"]
    .map((k) => s[k])
    .filter((t) => t && t.visible && t.text.length > 0)
    .map((t) => ({ x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.width), text: t.text.slice(0, 40) }));
  return { W: s.scale.width, H: s.scale.height, rows };
});
console.log(JSON.stringify(r, null, 2));
for (const row of r.rows) {
  const leftEdge = row.x - row.w / 2; // rows are origin 0.5
  const ok = leftEdge < r.W * 0.25 && row.x < r.W * 0.45;
  console.log(`${ok ? "PASS" : "FAIL"}  row left=${Math.round(leftEdge)} centre=${row.x} (W=${r.W}) — "${row.text}"`);
  if (!ok) process.exitCode = 1;
}
if (r.rows.length === 0) console.log("WARN — no tracker rows visible (no active quest state on this account)");
const cdp = await page.context().newCDPSession(page);
const png = await cdp.send("Page.captureScreenshot", { format: "png" });
await writeFile("tools/playtest-out/tracker-mobile.png", Buffer.from(png.data, "base64"));
console.log("screenshot: tools/playtest-out/tracker-mobile.png");
await b.close();
