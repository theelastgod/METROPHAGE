#!/usr/bin/env node
// METROPHAGE — does the HF art pack actually reach the texture cache?
//
// Every world dresser gates on `scene.textures.exists(key)`, so a missing pack degrades
// SILENTLY: no hf_building_* → procedural façade under a dark roof cap (reads as black
// buildings); no hf_prop_* → propScatter drops its whole pool (bare ground). This boots
// the real client in Chromium and reports the counts, so "the art didn't load" is a
// measurement instead of an argument.
//
// Usage: node tools/art-probe.mjs [url] [--headed]

import { chromium } from "playwright";

const url = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:4188";
const headed = process.argv.includes("--headed");
const DEADLINE_MS = 240_000;

const browser = await chromium.launch({ headless: !headed });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// The resource-timing buffer defaults to 250 entries and then silently drops the rest —
// measuring it instead of the game makes a full manifest look like "100 assets missing".
await page.addInitScript(() => performance.setResourceTimingBufferSize(5000));

const bootLines = [];
page.on("console", (m) => {
  const t = m.text();
  if (t.includes("[boot]")) {
    bootLines.push(t);
    console.log("CONSOLE:", t);
  }
});
const failedReqs = [];
page.on("requestfailed", (r) => failedReqs.push(`${r.url().split("/").pop()} — ${r.failure()?.errorText}`));

// 'commit' returns as soon as navigation commits; waiting on domcontentloaded here is
// what makes panel-smoke time out on a heavy boot.
await page.goto(url, { waitUntil: "commit", timeout: 60_000 });

const started = Date.now();
let last = -1;
while (Date.now() - started < DEADLINE_MS) {
  const state = await page.evaluate(() => {
    const tag = document.querySelector("#boot .tag");
    return {
      booted: !document.getElementById("boot"),
      tag: tag ? tag.textContent : null,
      loaded: performance.getEntriesByType("resource").length,
    };
  });
  if (state.loaded !== last) {
    last = state.loaded;
    process.stdout.write(`\r  ${state.tag ?? "in game"} — ${state.loaded} resources   `);
  }
  if (state.booted) { await page.waitForTimeout(8000); break; }  // let the tail of the queue settle
  await page.waitForTimeout(2000);
}
console.log("");

const expected = process.env.EXPECT ? process.env.EXPECT.split(",") : [];
const missing = await page.evaluate((exp) => {
  const got = new Set(performance.getEntriesByType("resource").map((r) => r.name.split("/").pop()));
  return exp.filter((n) => !got.has(n));
}, expected);
if (expected.length) {
  console.log(`\nexpected ${expected.length} object PNGs · MISSING ${missing.length}`);
  if (missing.length) console.log("  " + missing.slice(0, 40).join("\n  "));
}

const report = await page.evaluate(() => {
  const rs = performance.getEntriesByType("resource").map((r) => r.name.split("/").pop());
  const count = (p) => rs.filter((n) => n.startsWith(p)).length;
  return {
    totalResources: rs.length,
    hf_total: count("hf_"),
    hf_building: count("hf_building"),
    hf_int_room: rs.filter((n) => n.startsWith("hf_int_")).length,
    hf_prop: count("hf_prop"),
    booted: !document.getElementById("boot"),
  };
});

console.log("\n── ART PROBE ──");
console.log(`url            ${url}`);
console.log(`booted         ${report.booted}`);
console.log(`resources      ${report.totalResources}`);
console.log(`hf_* total     ${report.hf_total}`);
console.log(`  buildings    ${report.hf_building}`);
console.log(`  int rooms    ${report.hf_int_room}`);
console.log(`  props        ${report.hf_prop}`);
console.log(`boot console   ${bootLines.length ? bootLines.join(" | ") : "(none — never finished loading)"}`);
if (failedReqs.length) console.log(`failed reqs    ${failedReqs.length}\n  ` + failedReqs.slice(0, 10).join("\n  "));

await page.screenshot({ path: "tmp-art-backup/probe.png" });
await browser.close();
