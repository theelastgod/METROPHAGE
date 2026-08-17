// Estates + shopping trailer capture: 3 clips (street / home buy+furnish / vendor shop).
import { launch, boot, clickText, visibleTexts, sleep, SCRATCH_DIR } from "./rig.mjs";
import fs from "node:fs";

const CLIPS = `${SCRATCH_DIR}/clips`;
const activeScenes = (page) => page.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));
const allText = async (page) => (await visibleTexts(page)).map((t) => t.text).join(" | ");

async function enterWorld(page) {
  await page.addInitScript(() => {
    localStorage.setItem("metrophage_first_session_v4", JSON.stringify({ step: "done", dismissed: true, talkedFixer: true, deployed: true }));
  });
  await boot(page);
  await clickText(page, "◈ SIGN IN");
  await sleep(4000);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const sc = await activeScenes(page);
    if (sc.includes("Online")) break;
    const txt = await allText(page);
    if (sc.includes("Select") && txt.includes("choose your class")) { await page.keyboard.press("1"); await sleep(2200); }
    else if (sc.includes("Customize")) {
      for (let i = 0; i < 14; i++) await page.keyboard.press("Backspace");
      await page.keyboard.type("BLANK", { delay: 60 }); await sleep(400);
      await clickText(page, "LOCK IN & DEPLOY"); await sleep(3200);
    } else if (sc.includes("Prologue")) {
      await page.evaluate(() => window.__game.scene.getScene("Prologue").scene.start("Online", { zone: "safe" }));
      await sleep(4000);
    } else if (sc.includes("Select")) {
      let ok = false;
      for (const p of ["ENTER WORLD", "ENTER METRO CITY", "◈ DEPLOY", "RESUME"]) if (await clickText(page, p)) { ok = true; break; }
      if (!ok) console.log("UNKNOWN Select:", txt.slice(0, 500));
      await sleep(3500);
    } else await sleep(1200);
  }
  await page.waitForFunction(() => {
    const s = window.__game?.scene?.getScene("Online");
    return !!(s && s.scene.isActive() && s.net && s.net.ws && s.net.ws.readyState === 1);
  }, { timeout: 30000 }).catch(() => console.log("WARN ws"));
  await sleep(1500);
}

async function canvasRect(page) {
  return page.evaluate(() => {
    const r = document.querySelector("canvas").getBoundingClientRect();
    const ds = window.__game.scale.displayScale;
    return { left: r.left, top: r.top, sx: ds.x, sy: ds.y };
  });
}
async function travel(page, zone) {
  await page.evaluate((z) => window.__game.scene.getScene("Online").travelTo(z), zone);
  await sleep(6500);
  await page.waitForFunction(() => { const s = window.__game?.scene?.getScene("Online"); return !!(s && s.scene.isActive()); }, { timeout: 20000 }).catch(() => {});
  await sleep(1500);
}
async function roam(page, ms, seq = ["d", "d", "w", "d", "s", "d", "a", "w", "d", "d"]) {
  const rect = await canvasRect(page);
  const t0 = Date.now(); let i = 0;
  while (Date.now() - t0 < ms) {
    const dir = seq[i++ % seq.length];
    await page.keyboard.down(dir);
    await page.mouse.move(rect.left + (400 + Math.random() * 600) / rect.sx, rect.top + (250 + Math.random() * 300) / rect.sy, { steps: 20 });
    await sleep(1400 + Math.random() * 700);
    await page.keyboard.up(dir);
  }
}
const ev = (page, fn) => page.evaluate(fn);
const stat = (page) => ev(page, () => { const s = window.__game.scene.getScene("Online"); return { zone: s.zone, credits: s.net?.credits, est: s.net?.estate, homeIdx: s.homeIdx, log: (s.net?.chatLog ?? []).slice(-3) }; });

const CLIP_DEFS = {
  // hub → walk → THE ESTATES street (FOR SALE plates)
  street: async (page) => {
    await roam(page, 5000, ["a", "s", "a", "s"]);
    await travel(page, "estates");
    console.log("street", JSON.stringify(await stat(page)));
    await roam(page, 16000);
  },
  // est3: buy the home, then furnish it
  home: async (page) => {
    await travel(page, "est3");
    console.log("home0", JSON.stringify(await stat(page)));
    await roam(page, 2500, ["w", "d"]);
    await page.keyboard.press("b"); // BUY
    await sleep(3000);
    console.log("home1", JSON.stringify(await stat(page)));
    await page.keyboard.press("u"); // furnish editor
    await sleep(1500);
    const rect = await canvasRect(page);
    const pieces = [["sofa", 4, 4], ["table", 7, 5], ["chair", 8, 5], ["lamp", 3, 3], ["plant", 12, 3], ["rug", 6, 8], ["bed", 12, 8], ["shelf", 3, 10]];
    for (const [k, tx, ty] of pieces) {
      await ev(page, (kk) => { window.__game.scene.getScene("Online").homeSelKind = kk; }, k).catch(() => {});
      await page.evaluate((kk) => { const s = window.__game.scene.getScene("Online"); s.homeSelKind = kk; s.refreshHome && s.refreshHome(); }, k);
      const p = await page.evaluate(([tx, ty]) => {
        const s = window.__game.scene.getScene("Online"); const cam = s.cameras.main; const T = 32;
        return { x: ((tx + 0.5) * T - cam.worldView.x) * cam.zoom, y: ((ty + 0.5) * T - cam.worldView.y) * cam.zoom };
      }, [tx, ty]);
      await page.mouse.move(rect.left + p.x / rect.sx, rect.top + p.y / rect.sy, { steps: 12 });
      await sleep(500);
      await page.mouse.click(rect.left + p.x / rect.sx, rect.top + p.y / rect.sy);
      await sleep(900);
    }
    await sleep(800);
    if (!(await clickText(page, "✓ SAVE"))) {
      await ev(page, () => { const s = window.__game.scene.getScene("Online"); s.net.estateFurnish(s.homeDraft); s.homeEditing = false; s.refreshHome(); });
    }
    await sleep(2500);
    console.log("home2", JSON.stringify(await stat(page)));
    await roam(page, 5000, ["a", "s", "d", "w"]);
  },
  // hub vendor: open the shop, buy a few items
  shop: async (page) => {
    await roam(page, 3000, ["w", "d"]);
    await ev(page, () => window.__game.scene.getScene("Online").shop.toggle());
    await sleep(2500);
    for (let i = 0; i < 3; i++) {
      const ok = await clickText(page, "^BUY$", { nth: i });
      if (!ok) break;
      await sleep(1600);
    }
    await sleep(1500);
    console.log("shop", JSON.stringify(await stat(page)));
    await page.keyboard.press("Escape");
    await sleep(800);
    // forge / market for variety
    await ev(page, () => { const s = window.__game.scene.getScene("Online"); s.forge.setState(s.net.inventory, s.net.equipped, s.net.credits, s.net.cores); s.forge.toggle(); });
    await sleep(3500);
    await page.keyboard.press("Escape");
    await roam(page, 3000, ["d", "s"]);
  },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CLIP_DEFS);
for (const name of wanted) {
  console.log(`\n=== CLIP: ${name} ===`);
  const { browser, context, page } = await launch({ recordDir: CLIPS });
  try {
    await enterWorld(page);
    await CLIP_DEFS[name](page);
    await page.screenshot({ path: `${CLIPS}/est_${name}_end.png` });
  } catch (e) { console.log(`CLIP ${name} ERROR:`, String(e).slice(0, 400)); }
  const video = page.video();
  await context.close();
  if (video) { fs.renameSync(await video.path(), `${CLIPS}/est_${name}.webm`); console.log(`saved est_${name}.webm`); }
  await browser.close();
}
console.log("CAPTURE DONE");
