#!/usr/bin/env node
// METROPHAGE — boot the real client, walk into the hub, and photograph it.
//
// Static analysis kept saying the city-center buildings should render: the textures load
// (tools/art-probe.mjs proves 261/262), selectBuildingSprite resolves a key, and the art
// is a white-and-gold spire, not a black slab. So the failure is downstream in the render
// path — which means looking at the frame is the only way to settle it.
//
// Uses the same window.__enterCity / window.__game hooks tools/panel-smoke.mjs relies on.
//
// Usage: node tools/hub-probe.mjs [url]

import { chromium } from "playwright";

const url = process.argv.find((a) => a.startsWith("http")) ?? "https://metrophagev1.pages.dev";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(180_000);
page.on("console", (m) => {
  const t = m.text();
  if (t.includes("[boot]") || m.type() === "error") console.log(`  console(${m.type()}): ${t.slice(0, 160)}`);
});

console.log(`booting ${url} …`);
await page.goto(url, { waitUntil: "commit", timeout: 180_000 });
await page.waitForFunction(() => typeof window.__enterCity === "function", { timeout: 60_000 });
// Wait for the loader to finish rather than a fixed sleep — a cold CDN boot is slow.
await page.waitForFunction(() => !document.getElementById("boot"), { timeout: 240_000 });
console.log("booted; entering city …");
await page.evaluate(() => window.__enterCity());

const connected = await page
  .waitForFunction(() => window.__game?.scene?.getScene?.("Online")?.net?.connected === true, { timeout: 60_000 })
  .then(() => true)
  .catch(() => false);
console.log("online connected:", connected);
await page.waitForTimeout(6000); // let the zone build + dress

const report = await page.evaluate(() => {
  const g = window.__game;
  const s = g.scene.getScene("Online");
  const t = g.textures;
  const keys = ["hf_building_citycenter", "hf_building_bar", "hf_building_home", "hf_prop_01", "hf_int_bar_room"];
  const tex = {};
  for (const k of keys) tex[k] = t.exists(k) ? t.get(k).source[0].width + "x" + t.get(k).source[0].height : "MISSING";

  // What is actually in the display list, and at what depth?
  const list = s.children?.list ?? [];
  const byType = {};
  const images = [];
  for (const o of list) {
    const ty = o.type ?? "?";
    byType[ty] = (byType[ty] ?? 0) + 1;
    if (ty === "Image" && o.texture?.key && o.texture.key.startsWith("hf_")) {
      images.push({ key: o.texture.key, d: o.depth, a: o.alpha, w: Math.round(o.displayWidth), v: o.visible });
    }
  }
  // Histogram every image key actually drawn, plus the flags that gate the façade pass.
  const keyHist = {};
  for (const o of list) if (o.type === "Image" && o.texture?.key) keyHist[o.texture.key] = (keyHist[o.texture.key] ?? 0) + 1;
  const flags = {
    isCityHub: s.isCityHub, interior: s.interior, isEstates: s.isEstates,
    worldW: s.worldW, worldH: s.worldH,
    cityBuildings: (window.__ONLINE_CITY_BUILDINGS ?? null),
  };
  return {
    flags, keyHist,
    zone: s.zone,
    textures: tex,
    displayListSize: list.length,
    byType,
    hfImagesOnScreen: images.length,
    sampleHfImages: images.slice(0, 8),
    totalTextures: t.getTextureKeys().length,
  };
});

console.log("\n── HUB PROBE ──");
console.log("zone                ", report.zone);
console.log("textures loaded     ", report.totalTextures);
for (const [k, v] of Object.entries(report.textures)) console.log(`  ${k.padEnd(24)} ${v}`);
console.log("display list        ", report.displayListSize, JSON.stringify(report.byType));
console.log("hf_ images in scene ", report.hfImagesOnScreen);
console.log("flags               ", JSON.stringify(report.flags));
console.log("image keys drawn    ", JSON.stringify(report.keyHist));
for (const i of report.sampleHfImages) console.log(`   ${i.key.padEnd(28)} depth=${i.d} alpha=${i.a} w=${i.w} visible=${i.v}`);

await page.screenshot({ path: "tmp-art-backup/hub.png" });
console.log("\nscreenshot → tmp-art-backup/hub.png");
await browser.close();
