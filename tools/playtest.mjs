/**
 * Quick browser playtest — boot → select → customize flow, console errors, screenshots.
 * Run: node tools/playtest.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const BASE = process.env.PLAYTEST_URL ?? "http://127.0.0.1:5188/";
const OUT = path.join(process.cwd(), "tools/playtest-out");

const issues = [];
const log = (msg) => console.log(`[playtest] ${msg}`);
const issue = (sev, area, msg) => {
  issues.push({ sev, area, msg });
  console.log(`[${sev}] ${area}: ${msg}`);
};

async function shot(page, name) {
  const cdp = await page.context().newCDPSession(page);
  const png = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(path.join(OUT, `${name}.png`), Buffer.from(png.data, "base64"));
  log(`screenshot ${name}.png`);
}

async function waitGame(page, ms = 12000) {
  await page.waitForFunction(
    () => {
      const c = document.querySelector("#game-root canvas");
      return c && c.width > 0 && c.height > 0;
    },
    { timeout: ms },
  );
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  try {
    log(`loading ${BASE}`);
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    await waitGame(page);
    await page.waitForTimeout(3500);
    await shot(page, "01-boot");

    // Boot → Select
    const boot = await page.$("#boot");
    if (boot) {
      const visible = await boot.isVisible();
      if (visible) issue("warn", "boot", "boot overlay still visible after 3.5s");
    }

    await shot(page, "02-select");
    const title = await page.title();
    if (!title.includes("METROPHAGE")) issue("warn", "boot", `unexpected title: ${title}`);

    // Click canvas center — may trigger audio / wallet panel interaction
    const canvas = await page.$("#game-root canvas");
    if (!canvas) {
      issue("critical", "boot", "no game canvas found");
    } else {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(800);
      }
    }

    const offline = await page.evaluate(() => {
      const w = window;
      if (typeof w.__playtest?.offline === "function") {
        w.__playtest.offline();
        return true;
      }
      return false;
    });
    if (offline) {
      log("offline play flow");
      await page.waitForTimeout(2500);
      await shot(page, "03-offline-select");
      await page.keyboard.press("1");
      await page.waitForTimeout(2000);
      await shot(page, "04-customize");
    }

    const entered = await page.evaluate(() => {
      const w = window;
      if (typeof w.__enterCity === "function") {
        w.__enterCity();
        return true;
      }
      return false;
    });
    if (entered) {
      log("used __enterCity dev shortcut");
      const linked = await page.waitForFunction(
        () => {
          const scene = window.__game?.scene?.getScene?.("Online");
          return scene?.net?.connected === true;
        },
        { timeout: 12000 },
      ).then(() => true).catch(() => false);
      if (!linked) {
        issue("warn", "online", "server not connected after 12s — run: cd server && npm run migrate:local && npm run dev");
      } else {
        log("server connected");
      }
      await page.waitForTimeout(1200);
      await shot(page, "05-online-city");
    }

    // Keyboard smoke on online scene
    if (entered) {
      await page.keyboard.press("w");
      await page.waitForTimeout(400);
      await page.keyboard.press("w");
      await page.waitForTimeout(400);
      const box = await canvas.boundingBox();
      if (box) await page.mouse.click(box.x + 400, box.y + 360);
      await page.waitForTimeout(600);
      await shot(page, "06-online-move");
      const hudLine = await page.evaluate(() => {
        const scene = window.__game?.scene?.getScene?.("Online");
        return scene?.hud?.text?.split?.("\n")?.[0] ?? "";
      });
      log(`hud: ${hudLine}`);
      if (hudLine.includes("connecting to server") && !hudLine.includes("PREVIEW")) {
        issue("warn", "hud", `still showing connecting copy: ${hudLine}`);
      }
    }

    if (consoleErrors.length) {
      for (const e of [...new Set(consoleErrors)].slice(0, 8)) issue("error", "console", e);
    }
    if (pageErrors.length) {
      for (const e of [...new Set(pageErrors)]) issue("critical", "page", e);
    }

    log(`done — ${issues.length} issue(s) logged`);
    if (issues.length === 0) log("no issues detected in automated pass");
  } finally {
    await browser.close();
  }

  return issues;
}

main().then((issues) => {
  process.exit(issues.some((i) => i.sev === "critical") ? 1 : 0);
});
