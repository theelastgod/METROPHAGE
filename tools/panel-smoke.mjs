#!/usr/bin/env node
/**
 * E2E panel smoke — proves every online overlay OPENS and CLOSES in a real
 * browser, on desktop (hotkey + ESC + tap-outside) and mobile (?mobile=1,
 * floating ✕). This is the regression net the pure-logic vitest suite lacks.
 *
 * Self-contained: spawns wrangler dev (:8787) + vite dev (:5177 with
 * VITE_SERVER_URL pointed at it), runs both passes, kills them, exits 0/1.
 *
 * Run: node tools/panel-smoke.mjs            (assumes deps installed)
 *      node tools/panel-smoke.mjs --keep     (leave servers running after)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const VITE_PORT = 5177;
const WS_PORT = 8787;
const KEEP = process.argv.includes("--keep");

const failures = [];
const log = (m) => console.log(`[panel-smoke] ${m}`);
const check = (ok, what) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures.push(what);
};

function spawnServer(name, cmd, args, cwd, readyMatch) {
  const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} not ready in 120s`)), 120000);
    const onData = (buf) => {
      if (String(buf).match(readyMatch)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`${name} exited ${code} before ready`)));
  });
  return { name, child, ready };
}

async function httpUp(url, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 426) return true; // 426 = worker answering (expects WS)
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** Boot the game to the connected Online scene. Returns the canvas bounding box. */
async function enterCity(page, base) {
  log(`booting ${base.includes("mobile=1") ? "mobile landscape" : "desktop"} client…`);
  page.on("pageerror", (err) => console.error(`[panel-smoke] page error: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error(`[panel-smoke] console: ${msg.text()}`);
  });
  page.on("requestfailed", (req) => console.error(`[panel-smoke] request failed: ${req.url()} · ${req.failure()?.errorText}`));
  await page.addInitScript(() => {
    // An async throw between scene create and net.connect() dies silently otherwise
    // (gen stays 0 and the smoke just times out with no cause in the log).
    window.addEventListener("unhandledrejection", (e) => {
      const r = e.reason;
      console.error(`UNHANDLED REJECTION: ${r?.message || String(r)}\n${(r?.stack || "").slice(0, 500)}`);
    });
    // Lift the first-hour funnel locks (the smoke exercises panels, not onboarding)
    localStorage.setItem(
      "metrophage_first_session_v4",
      JSON.stringify({
        step: "done",
        kills: 99,
        talkedFixer: true,
        deployed: true,
        heatCoached: true,
        openedContracts: true,
        acceptedBounty: true,
        openedGear: true,
        dismissed: true,
      }),
    );
  });
  // Heavy environment packs can keep DOMContentLoaded behind asset work for longer than
  // the smoke's old 30s navigation cap. Navigation commit is the reliable readiness gate;
  // the explicit canvas / dev-hook waits below prove the game itself has actually booted.
  await page.goto(base, { waitUntil: "commit", timeout: 120000 });
  await page.waitForFunction(
    () => {
      const c = document.querySelector("#game-root canvas");
      return c && c.width > 0;
    },
    null,
    { timeout: 120000 },
  );
  await page.waitForFunction(() => typeof window.__enterCity === "function", null, { timeout: 120000 });
  // Entering mid-preload starts Online half-loaded and it never connects. Wait for the
  // Boot scene's completion beacon instead of guessing with a sleep, then for the scene
  // stack to SETTLE on the title menu — entering during the Boot→Select handoff races
  // the scene queue and can strand a zombie Select above (or instead of) Online.
  await page.waitForFunction(() => window.__bootDone === true, null, { timeout: 180000 });
  await page.waitForFunction(
    () => {
      const actives = window.__game?.scene?.getScenes?.(true) ?? [];
      return actives.length === 1 && actives[0].scene.key === "Select";
    },
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    // The smoke is a real local multiplayer client, so give it an explicit guest
    // identity instead of relying on whatever random callsign the dev shortcut picked.
    // Reusing one of the small production callsign pool can hit a D1-bound identity and
    // correctly close with auth code 4001, which looks like a panel boot failure.
    const g = window.__game;
    const current = g.registry.get("customization") || {};
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    g.registry.set("customization", { ...current, callsign: `SMK-${suffix}`.slice(0, 12) });
    g.registry.set("guestPlay", true);
    g.registry.remove("walletAddress");
    window.__enterCity();
  });
  const connected = await page
    .waitForFunction(
      () => {
        const s = window.__game?.scene?.getScene?.("Online");
        return s?.net?.connected === true && !!window.__panelProbe;
      },
      null,
      { timeout: 120000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!connected) {
    const diag = await page.evaluate(() => {
      const s = window.__game?.scene?.getScene?.("Online");
      return {
        activeScenes: window.__game?.scene?.getScenes?.(true)?.map?.((x) => x.scene?.key),
        zone: s?.zone,
        connected: s?.net?.connected,
        socketState: s?.net?.ws?.readyState,
        socketUrl: s?.net?.ws?.url,
        netUrl: s?.net?.url,
        attempts: s?.net?.reconnectAttempts,
        gen: s?.net?.socketGen,
        lastServerMessageAt: s?.net?.lastServerMessageAt,
        protocolBlocked: s?.net?.protocolBlocked,
        manualClose: s?.net?.manualClose,
      };
    });
    throw new Error(`Online scene never connected — ${JSON.stringify(diag)}`);
  }
  await page.waitForTimeout(1000);
  return await (await page.$("#game-root canvas")).boundingBox();
}

const anyOpen = (page) => page.evaluate(() => window.__panelProbe.anyOpen());

// A timed story toast deliberately owns the first ESC so narrative text is dismissed
// before a modal. Allow that documented priority, but still require the panel to close.
async function closeWithEscape(page) {
  for (let attempt = 0; attempt < 3 && (await anyOpen(page)); attempt++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
  }
  return !(await anyOpen(page));
}

/** Convert game-canvas coords → CSS page coords (canvas is FIT-scaled). */
async function gameToPage(page, box, gx, gy) {
  const s = await page.evaluate(() => ({ w: window.__game.scale.width, h: window.__game.scale.height }));
  return { x: box.x + (gx / s.w) * box.width, y: box.y + (gy / s.h) * box.height };
}

async function desktopPass(browser, base) {
  log("── desktop pass (hotkeys, ESC, tap-outside)");
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const box = await enterCity(page, base);
  // Panels reachable by hotkey in the hub. J = contracts (first hour) / quest log.
  const panels = [
    ["i", "Bag"],
    ["b", "Vendor"],
    ["g", "Forge"],
    ["k", "Market"],
    ["j", "Quests/Contracts"],
    ["m", "Map"],
    ["'", "Skills"],
    ["l", "Board"],
    ["c", "Guild"],
    ["y", "Cosmetics"],
  ];
  for (const [key, name] of panels) {
    await page.keyboard.press(key);
    await page.waitForTimeout(450);
    const opened = await anyOpen(page);
    check(opened, `${name} opens on '${key}'`);
    if (opened) {
      check(await closeWithEscape(page), `${name} closes on ESC`);
    }
    await page.waitForTimeout(150);
  }
  // Tap-outside: vendor is a centered 580-wide modal — click the far-left dim area.
  await page.keyboard.press("b");
  await page.waitForTimeout(450);
  if (await anyOpen(page)) {
    // First: a click on the card BODY (header strip — no buttons there) must NOT close.
    const hdr = await page.evaluate(() => {
      const g = window.__game;
      const s = g.scale.height / 540; // uiDim scale (height-derived)
      const margin = 24 * s;
      const w = Math.min(520 * s, g.scale.width - margin * 2);
      const h = Math.min((92 + 9 * 50) * s, g.scale.height - margin * 2);
      const x = (g.scale.width - w) / 2;
      const y = Math.max(margin, (g.scale.height - h) / 2);
      return { x: x + w / 2, y: y + 28 * s };
    });
    const hp = await gameToPage(page, box, hdr.x, hdr.y);
    await page.mouse.click(hp.x, hp.y);
    await page.waitForTimeout(350);
    check(await anyOpen(page), "click on card body does NOT close");
    // Then: the dim area outside the card dismisses.
    const p = await gameToPage(page, box, 40, 700); // left edge, mid-height (game coords)
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(350);
    check(!(await anyOpen(page)), "Vendor closes on tap-outside");
  } else {
    check(false, "Vendor reopens for tap-outside test");
  }
  await page.close();
}

async function mobilePass(browser, base) {
  log("── mobile pass (?mobile=1, floating ✕)");
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const url = base + (base.includes("?") ? "&" : "?") + "mobile=1";
  const box = await enterCity(page, url);
  // Open the Bag (keyboard still fires in the emulated mobile UX) → ✕ appears.
  await page.keyboard.press("i");
  await page.waitForTimeout(450);
  check(await anyOpen(page), "Bag opens (mobile)");
  const btnShown = await page.evaluate(() => window.__panelProbe.closeBtnShown());
  check(btnShown, "floating ✕ appears while panel open");
  if (btnShown) {
    const xy = await page.evaluate(() => window.__panelProbe.closeBtnXY());
    const p = await gameToPage(page, box, xy.x, xy.y);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(400);
    check(!(await anyOpen(page)), "tap ✕ closes the panel");
    const hidden = await page.evaluate(() => !window.__panelProbe.closeBtnShown());
    check(hidden, "✕ hides once nothing is open");
  }
  // Tap-outside on mobile too (vendor modal).
  await page.keyboard.press("b");
  await page.waitForTimeout(450);
  if (await anyOpen(page)) {
    // Mobile sheets are near-full-bleed (6 design px inset), so use the actual
    // canvas edge rather than the desktop dim-area coordinate.
    const p = await gameToPage(page, box, 1, 700);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(350);
    check(!(await anyOpen(page)), "tap-outside closes on mobile");
  }
  await page.close();
}

async function main() {
  process.env.VITE_SERVER_URL ??= `ws://127.0.0.1:${WS_PORT}/ws`; // must precede the vite spawn
  const servers = [];
  // Reuse an already-running wrangler dev (leftover sessions often hold :8787).
  const wranglerUp = await httpUp(`http://127.0.0.1:${WS_PORT}/health`, 1);
  if (wranglerUp) {
    log(`reusing running server on :${WS_PORT}`);
  } else {
    log("starting wrangler dev…");
    servers.push(
      spawnServer(
        "wrangler",
        "node",
        ["node_modules/.bin/wrangler", "dev", "--port", String(WS_PORT)],
        path.join(ROOT, "server"),
        /Ready on|Listening on|wrangler dev now uses local/i,
      ),
    );
  }
  log("starting vite dev…");
  servers.push(
    spawnServer("vite", "node", ["node_modules/.bin/vite", "--port", String(VITE_PORT), "--strictPort"], ROOT, /Local:.*:5177/i),
  );
  const kill = () => {
    if (KEEP) return;
    for (const s of servers) {
      try {
        s.child.kill("SIGTERM");
      } catch {
        /* gone */
      }
    }
  };
  try {
    await Promise.all(servers.map((s) => s.ready));
    check(await httpUp(`http://127.0.0.1:${WS_PORT}/health`), "wrangler /health answers");
    check(await httpUp(`http://127.0.0.1:${VITE_PORT}/`), "vite answers");
    const browser = await chromium.launch({ headless: true });
    // skipIntro: with the boot-done gate the smoke no longer enters mid-boot, so the
    // ColdOpen trailer would otherwise start and hold the scene stack.
    const base = `http://127.0.0.1:${VITE_PORT}/?skipIntro=1`;
    try {
      await desktopPass(browser, base);
      await mobilePass(browser, base);
    } finally {
      await browser.close();
    }
  } finally {
    kill();
  }
  console.log("");
  if (failures.length) {
    log(`❌ ${failures.length} failure(s)`);
    process.exit(1);
  }
  log("✅ all panel open/close paths verified");
}

main().catch((e) => {
  console.error(`[panel-smoke] fatal: ${e.message}`);
  process.exit(1);
});
