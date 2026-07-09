// 30s-trailer re-shoot: short focused takes + a dedicated wallet/creation take.
// Usage: node capture30.mjs [clip ...]
import { launch, boot, clickText, visibleTexts, sleep, SCRATCH_DIR } from "./rig.mjs";
import fs from "node:fs";

const CLIPS = `${SCRATCH_DIR}/clips`;
fs.mkdirSync(CLIPS, { recursive: true });

const activeScenes = (page) => page.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));
const allText = async (page) => (await visibleTexts(page)).map((t) => t.text).join(" | ");

async function enterWorld(page) {
  await boot(page);
  await clickText(page, "◈ SIGN IN");
  await sleep(4000);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const sc = await activeScenes(page);
    if (sc.includes("Online")) break;
    const txt = await allText(page);
    if (sc.includes("Select") && txt.includes("choose your class")) {
      await page.keyboard.press("1");
      await sleep(2200);
    } else if (sc.includes("Customize")) {
      for (let i = 0; i < 14; i++) await page.keyboard.press("Backspace");
      await page.keyboard.type("BLANK", { delay: 60 });
      await clickText(page, "LOCK IN & DEPLOY");
      await sleep(3200);
    } else if (sc.includes("Prologue")) {
      await page.evaluate(() => window.__game.scene.getScene("Prologue").scene.start("Online", { zone: "safe" }));
      await sleep(4000);
    } else if (sc.includes("Select")) {
      for (const p of ["ENTER WORLD", "ENTER METRO CITY", "◈ DEPLOY", "RESUME"]) {
        if (await clickText(page, p)) break;
      }
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
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    const ds = window.__game.scale.displayScale;
    return { left: r.left, top: r.top, sx: ds.x, sy: ds.y };
  });
}
async function aimAtEnemy(page, rect) {
  const e = await page.evaluate(() => {
    const s = window.__game.scene.getScene("Online");
    if (!s || !s.scene.isActive()) return null;
    const cam = s.cameras.main;
    const px = s.net?.pred?.x ?? 0, py = s.net?.pred?.y ?? 0;
    let best = null, bd = Infinity;
    const bag = s.enemySprites;
    const iter = bag ? (bag.values ? Array.from(bag.values()) : Object.values(bag)) : [];
    for (const en of iter) {
      const sp = en?.sprite ?? en;
      if (!sp || sp.active === false || typeof sp.x !== "number") continue;
      const d = (sp.x - px) ** 2 + (sp.y - py) ** 2;
      if (d < bd) { bd = d; best = sp; }
    }
    if (!best) return null;
    return { x: (best.x - cam.worldView.x) * cam.zoom, y: (best.y - cam.worldView.y) * cam.zoom, dist: Math.sqrt(bd) };
  });
  if (!e) return null;
  await page.mouse.move(rect.left + Math.max(10, Math.min(1270, e.x)) / rect.sx, rect.top + Math.max(10, Math.min(710, e.y)) / rect.sy);
  return e;
}
const DIRS = ["w", "a", "s", "d"];
async function combat(page, ms) {
  const rect = await canvasRect(page);
  const t0 = Date.now();
  let held = null, lastDash = 0, lastQ = 0, lastF = 0;
  await page.mouse.down();
  while (Date.now() - t0 < ms) {
    const e = await aimAtEnemy(page, rect);
    const dir = DIRS[Math.floor(Math.random() * 4)];
    if (held !== dir) { if (held) await page.keyboard.up(held); await page.keyboard.down(dir); held = dir; }
    const now = Date.now();
    if (now - lastDash > 3600 + Math.random() * 1400) { await page.keyboard.press("Space"); lastDash = now; }
    if (e && e.dist < 420 && now - lastQ > 7000) { await page.keyboard.press("q"); lastQ = now; }
    if (e && e.dist < 260 && now - lastF > 9000) { await page.keyboard.press("f"); lastF = now; }
    await sleep(420 + Math.random() * 320);
  }
  if (held) await page.keyboard.up(held);
  await page.mouse.up();
}
async function roam(page, ms) {
  const rect = await canvasRect(page);
  const t0 = Date.now();
  const seq = ["w", "d", "w", "a", "s", "d", "w", "a"];
  let i = 0;
  while (Date.now() - t0 < ms) {
    const dir = seq[i++ % seq.length];
    await page.keyboard.down(dir);
    await page.mouse.move(rect.left + (400 + Math.random() * 700) / rect.sx, rect.top + (250 + Math.random() * 350) / rect.sy, { steps: 18 });
    await sleep(1600 + Math.random() * 800);
    await page.keyboard.up(dir);
  }
}
async function travel(page, zone) {
  await page.evaluate((z) => window.__game.scene.getScene("Online").travelTo(z), zone);
  await sleep(6500);
  await page.waitForFunction(() => {
    const s = window.__game?.scene?.getScene("Online");
    return !!(s && s.scene.isActive());
  }, { timeout: 20000 }).catch(() => {});
  await sleep(1200);
}

const DEFS = {
  // fresh-wallet creation flow: gate → sign → class → customize (cycle looks) → lock in
  creation: async (page) => {
    await boot(page);
    await sleep(1200);
    await clickText(page, "◈ SIGN IN");
    await sleep(4500);
    await page.keyboard.press("1"); // METROPHAGE
    await sleep(3000);
    for (const k of ["ArrowDown", "ArrowRight", "ArrowRight", "ArrowDown", "ArrowRight", "ArrowDown", "ArrowRight", "ArrowRight", "ArrowDown", "ArrowRight"]) {
      await page.keyboard.press(k);
      await sleep(700);
    }
    for (let i = 0; i < 14; i++) await page.keyboard.press("Backspace");
    await page.keyboard.type("VESSEL", { delay: 140 });
    await sleep(1200);
    await clickText(page, "LOCK IN & DEPLOY");
    await sleep(5000);
  },
  city: async (page) => { await enterWorld(page); await roam(page, 32000); },
  d0: async (page) => { await enterWorld(page); await travel(page, "d0"); await combat(page, 60000); },
  d1: async (page) => { await enterWorld(page); await travel(page, "d1"); await combat(page, 45000); },
  d7: async (page) => { await enterWorld(page); await travel(page, "d7"); await combat(page, 45000); },
  v2: async (page) => { await enterWorld(page); await travel(page, "v2"); await combat(page, 55000); },
  subway: async (page) => { await enterWorld(page); await travel(page, "subway"); await combat(page, 45000); },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(DEFS);
for (const name of wanted) {
  console.log(`=== ${name} ===`);
  if (name === "creation") process.env.WALLET_FILE = `${SCRATCH_DIR}/creation-wallet.json`;
  else delete process.env.WALLET_FILE;
  const { browser, context, page } = await launch({ recordDir: CLIPS });
  try {
    await DEFS[name](page);
  } catch (e) {
    console.log(`ERR ${name}:`, String(e).slice(0, 250));
  }
  const video = page.video();
  await context.close();
  if (video) {
    fs.renameSync(await video.path(), `${CLIPS}/${name}.webm`);
    console.log(`saved ${name}.webm`);
  }
  await browser.close();
}
console.log("DONE");
