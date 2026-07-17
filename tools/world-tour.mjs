#!/usr/bin/env node
// METROPHAGE — walk the world and photograph it: hub + every district + subway.
// Boots the real client once, then hops zones via the dev __playtest.gotoZone hook,
// waiting for each scene to BUILD (display list populated) before shooting.
//
// Usage: node tools/world-tour.mjs [vite-url]   (needs the dev hooks — vite dev only)
// Output: tmp-art-backup/tour-<zone>.png

import { chromium } from "playwright";

const base = process.argv.find((a) => a.startsWith("http")) ?? "http://127.0.0.1:5177";
const url = base + (base.includes("?") ? "&" : "?") + "skipIntro=1&noUpdateWatch=1";
const ZONES = ["safe", "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "subway"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(240_000);
page.on("pageerror", (e) => console.log(`  pageerror: ${String(e?.message ?? e).slice(0, 240)}`));

await page.addInitScript(() => {
  try { localStorage.setItem("metrophage_beta_notice_v1", "1"); } catch { /* fine */ }
});
console.log(`tour: booting ${url}`);
await page.goto(url, { waitUntil: "commit" });
await page.waitForFunction(() => window.__bootDone === true, null, { timeout: 240_000 });
await page.waitForFunction(() => {
  const a = window.__game?.scene?.getScenes?.(true) ?? [];
  return a.length === 1 && a[0].scene.key === "Select";
});

const sceneBuilt = () =>
  page
    .waitForFunction(
      () => {
        const s = window.__game?.scene?.getScene?.("Online");
        return s?.sys?.settings?.status === 5 && (s?.children?.list?.length ?? 0) > 50;
      },
      null,
      { timeout: 240_000 },
    )
    .then(() => true)
    .catch(() => false);

/** Concurrent dev edits HMR-reload the page and wipe __game — re-boot and carry on. */
async function ensureBooted() {
  const alive = await page.evaluate(() => !!window.__game && window.__bootDone === true).catch(() => false);
  if (alive) return;
  console.log("  (page reloaded under us — re-booting)");
  await page.waitForFunction(() => window.__bootDone === true, null, { timeout: 240_000 });
  await page.waitForFunction(() => {
    const a = window.__game?.scene?.getScenes?.(true) ?? [];
    return a.length >= 1;
  });
}

for (const zone of ZONES) {
  await ensureBooted();
  // Fresh identity per hop: the hard scene.restart skips the graceful disconnect,
  // so reusing one callsign trips the server's one-session-per-identity lock.
  await page.evaluate((z) => {
    const g = window.__game;
    const cur = g.registry.get("customization") || {};
    g.registry.set("customization", { ...cur, callsign: ("TUR-" + Math.random().toString(36).slice(2, 8)).toUpperCase().slice(0, 12) });
    window.__playtest.gotoZone(z);
  }, zone);
  const built = await sceneBuilt();
  await page.waitForTimeout(3500); // dressing + props settle
  const state = await page
    .evaluate(() => {
      const s = window.__game?.scene?.getScene?.("Online");
      return { zone: s?.zone, objects: s?.children?.list?.length ?? 0, connected: s?.net?.connected ?? false };
    })
    .catch(() => ({ zone, objects: -1, connected: false }));
  await page.screenshot({ path: `tmp-art-backup/tour-${zone}.png` });
  console.log(`  ${zone.padEnd(7)} built=${built} objects=${state.objects} connected=${state.connected} → tour-${zone}.png`);
}

await browser.close();
console.log("tour complete");
