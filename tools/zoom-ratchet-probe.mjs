#!/usr/bin/env node
// Regression probe for the zoom-punch ratchet: fire 40 OVERLAPPING kill-style
// zoom punches, then assert the camera settles back to its resting zoom.
// Before the fix, each overlap captured the previous punch's zoomed-in value
// as "base" — the camera crept in permanently ("won't zoom back out").
import { chromium } from "playwright";

const BASE = `http://127.0.0.1:5177/`;
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  localStorage.setItem(
    "metrophage_first_session_v3",
    JSON.stringify({ step: "done", kills: 99, talkedFixer: true, deployed: true, heatCoached: true, dismissed: true }),
  );
});
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__enterCity === "function", { timeout: 20000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__enterCity());
await page.waitForFunction(() => window.__panelProbe?.camZoom && window.__game.scene.getScene("Online").net.connected, {
  timeout: 20000,
});
await page.waitForTimeout(800);

const before = await page.evaluate(() => window.__panelProbe.camZoom());
// 40 punches, 30ms apart — each lasts ~64ms+yoyo, so every one overlaps the last.
await page.evaluate(
  () =>
    new Promise((done) => {
      let n = 0;
      const t = setInterval(() => {
        window.__panelProbe.zoomPunch();
        if (++n >= 40) {
          clearInterval(t);
          done(null);
        }
      }, 30);
    }),
);
await page.waitForTimeout(1200); // let the last punch settle
const after = await page.evaluate(() => window.__panelProbe.camZoom());
const drift = Math.abs(after - before);
console.log(`zoom before=${before.toFixed(4)} after=${after.toFixed(4)} drift=${drift.toFixed(4)}`);
console.log(drift < 0.001 ? "PASS — camera settles back to resting zoom" : "FAIL — zoom ratcheted and stuck");
await b.close();
process.exit(drift < 0.001 ? 0 : 1);
