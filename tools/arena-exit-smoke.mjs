/**
 * Browser regression: entering the hub arena lobby (THE CRUCIBLE) and stepping on
 * the exit mat must return to the city instead of leaving the camera frozen black.
 *
 * Run with Vite + local Worker running:
 *   PLAYTEST_URL=http://127.0.0.1:5188/ node tools/arena-exit-smoke.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.PLAYTEST_URL ?? "http://127.0.0.1:5188/";
const log = (msg) => console.log(`[arena-smoke] ${msg}`);

async function waitForOnline(page, zone, timeout = 15000) {
  await page.waitForFunction(
    (z) => {
      const scene = window.__game?.scene?.getScene?.("Online");
      return scene?.zone === z && scene?.net?.connected === true && !scene?.net?.dead;
    },
    zone,
    { timeout },
  );
}

function fail(message, data = {}) {
  const err = new Error(message);
  err.data = data;
  throw err;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.stack || String(err)));

  try {
    log(`loading ${BASE}`);
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
    log("waiting for game globals");
    await page.waitForFunction(
      () => !!document.querySelector("#game-root canvas") && !!window.__game && typeof window.__enterCity === "function",
      undefined,
      { timeout: 20000 },
    );

    log("finding arena lobby");
    const { arenaZone, callsign } = await page.evaluate(async () => {
      const { ONLINE_CITY } = await import("/src/world/city.ts");
      const { randomCustomization } = await import("/src/game/customization.ts");
      const idx = ONLINE_CITY.buildings.findIndex((b) => b.kind === "stadium");
      if (idx < 0) throw new Error("stadium building not found");
      const callsign = `ARENA${String(Date.now() % 1000000).padStart(6, "0")}`.slice(0, 12);
      const cust = randomCustomization("metrophage");
      cust.callsign = callsign;
      window.__game.registry.set("guestPlay", true);
      window.__game.registry.remove("offlinePlay");
      window.__game.registry.remove("walletAddress");
      window.__game.registry.remove("characterLocked");
      window.__game.registry.set("classId", "metrophage");
      window.__game.registry.set("customization", cust);
      return { arenaZone: `h${idx}`, callsign };
    });

    await page.evaluate((zone) => {
      window.__game.scene.start("Online", { zone, from: "safe" });
    }, arenaZone);
    log(`waiting for ${arenaZone} as ${callsign}`);
    await waitForOnline(page, arenaZone);

    log("stepping onto exit mat");
    await page.locator("#game-root canvas").click({ position: { x: 640, y: 360 } });
    await page.keyboard.down("s");
    await page.waitForTimeout(2000);
    await page.keyboard.up("s");
    const postStep = await page.evaluate(async () => {
      const scene = window.__game.scene.getScene("Online");
      const { venueLayoutFor } = await import("/src/world/district.ts");
      const mat = venueLayoutFor(scene.zone).mat;
      return {
        zone: scene.zone,
        pred: { x: Math.round(scene.net.pred.x), y: Math.round(scene.net.pred.y) },
        tile: { x: Math.floor(scene.net.pred.x / 32), y: Math.floor(scene.net.pred.y / 32) },
        mat: { x: mat[0], y: mat[1] },
        doorTransit: scene.doorTransit,
        connected: scene.net.connected,
      };
    });
    log(`post-step ${JSON.stringify(postStep)}`);

    log("waiting for safe city");
    try {
      await page.waitForFunction(
        () => {
          const scene = window.__game?.scene?.getScene?.("Online");
          return scene?.zone === "safe" && scene?.net?.connected === true;
        },
        undefined,
        { timeout: 12000 },
      );
    } catch {
      fail("arena exit did not return to safe city", postStep);
    }
    log("waiting for fade to clear");
    try {
      await page.waitForFunction(
        () => {
          const scene = window.__game?.scene?.getScene?.("Online");
          const fade = scene?.cameras?.main?.fadeEffect;
          return scene?.zone === "safe" && fade && !fade.isRunning && (!fade.isComplete || fade.alpha <= 0.05);
        },
        undefined,
        { timeout: 20000 },
      );
    } catch {
      const fadeState = await page.evaluate(() => {
        const scene = window.__game?.scene?.getScene?.("Online");
        const fade = scene?.cameras?.main?.fadeEffect;
        return {
          zone: scene?.zone,
          connected: scene?.net?.connected,
          fadeRunning: fade?.isRunning,
          fadeComplete: fade?.isComplete,
          fadeDirection: fade?.direction,
          fadeProgress: fade?.progress,
          fadeAlpha: fade?.alpha,
        };
      });
      fail("safe city fade did not clear", fadeState);
    }

    const state = await page.evaluate(() => {
      const scene = window.__game.scene.getScene("Online");
      const cam = scene.cameras.main;
      return {
        zone: scene.zone,
        connected: scene.net.connected,
        fadeRunning: cam.fadeEffect.isRunning,
        fadeComplete: cam.fadeEffect.isComplete,
        fadeAlpha: cam.fadeEffect.alpha,
        children: scene.children.list.length,
      };
    });

    if (state.zone !== "safe" || !state.connected) fail("arena exit did not return to safe city", state);
    if ((state.fadeRunning || state.fadeComplete) && state.fadeAlpha > 0.05) fail("camera fade remained over the scene", state);
    if (pageErrors.length) fail("page errors during arena exit", { pageErrors });
    if (consoleErrors.length) fail("console errors during arena exit", { consoleErrors: [...new Set(consoleErrors)].slice(0, 8) });

    console.log("[PASS] ARENA EXIT — THE CRUCIBLE lobby exits to city without black-screen freeze");
    console.log("   data:", JSON.stringify({ arenaZone, callsign, ...state }));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[FAIL] ARENA EXIT —", err.message);
  if (err.data) console.error("   data:", JSON.stringify(err.data));
  process.exit(1);
});
