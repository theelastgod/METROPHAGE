// METROPHAGE trailer capture: records live gameplay clips as separate .webm files.
// Usage: node capture.mjs [clipName ...]   (default: all)
import { launch, boot, clickText, visibleTexts, sleep, SCRATCH_DIR } from "./rig.mjs";
import fs from "node:fs";

const CLIPS_DIR = `${SCRATCH_DIR}/clips`;
fs.mkdirSync(CLIPS_DIR, { recursive: true });

const activeScenes = (page) => page.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));
const allText = async (page) => (await visibleTexts(page)).map((t) => t.text).join(" | ");

// ---- world entry ------------------------------------------------------------
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
      // clear random callsign, brand the runner
      for (let i = 0; i < 14; i++) await page.keyboard.press("Backspace");
      await page.keyboard.type("BLANK", { delay: 60 });
      await sleep(400);
      await clickText(page, "LOCK IN & DEPLOY");
      await sleep(3200);
    } else if (sc.includes("Prologue")) {
      await page.evaluate(() => {
        const g = window.__game;
        g.scene.getScene("Prologue").scene.start("Online", { zone: "safe" });
      });
      await sleep(4000);
    } else if (sc.includes("Select")) {
      // locked-runner path: find the step-3 CTA
      let clicked = false;
      for (const p of ["ENTER WORLD", "ENTER METRO CITY", "◈ DEPLOY", "RESUME"]) {
        if (await clickText(page, p)) { clicked = true; break; }
      }
      if (!clicked) console.log("UNKNOWN Select state:", txt.slice(0, 700));
      await sleep(3500);
    } else {
      await sleep(1200);
    }
  }
  // wait for socket
  await page.waitForFunction(() => {
    const s = window.__game?.scene?.getScene("Online");
    return !!(s && s.scene.isActive() && s.net && s.net.ws && s.net.ws.readyState === 1);
  }, { timeout: 30000 }).catch(() => console.log("WARN: ws not confirmed open"));
  await sleep(1500);
}

// ---- geometry helpers -------------------------------------------------------
async function canvasRect(page) {
  return page.evaluate(() => {
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    const ds = window.__game.scale.displayScale;
    return { left: r.left, top: r.top, sx: ds.x, sy: ds.y };
  });
}

// nearest enemy position in canvas coords, or null
async function nearestEnemyCanvas(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScene("Online");
    if (!s || !s.scene.isActive()) return null;
    const cam = s.cameras.main;
    const px = s.net?.pred?.x ?? 0;
    const py = s.net?.pred?.y ?? 0;
    let best = null, bd = Infinity;
    const bag = s.enemySprites;
    const iter = bag ? (bag.values ? Array.from(bag.values()) : Object.values(bag)) : [];
    for (const e of iter) {
      const sp = e?.sprite ?? e;
      if (!sp || sp.active === false || typeof sp.x !== "number") continue;
      const d = (sp.x - px) ** 2 + (sp.y - py) ** 2;
      if (d < bd) { bd = d; best = sp; }
    }
    if (!best) return null;
    return {
      x: (best.x - cam.worldView.x) * cam.zoom,
      y: (best.y - cam.worldView.y) * cam.zoom,
      dist: Math.sqrt(bd),
    };
  });
}

async function aimAtEnemy(page, rect) {
  const e = await nearestEnemyCanvas(page);
  if (!e) return null;
  const px = rect.left + Math.max(10, Math.min(1270, e.x)) / rect.sx;
  const py = rect.top + Math.max(10, Math.min(710, e.y)) / rect.sy;
  await page.mouse.move(px, py);
  return e;
}

const DIRS = ["w", "a", "s", "d"];

// ---- drivers ----------------------------------------------------------------
// Fight for `ms`: track nearest enemy, hold fire, strafe, dash, Q/F kit.
async function combatDriver(page, ms, { fire = true } = {}) {
  const rect = await canvasRect(page);
  const t0 = Date.now();
  let held = null;
  let lastDash = 0, lastQ = 0, lastF = 0;
  if (fire) await page.mouse.down();
  while (Date.now() - t0 < ms) {
    const e = await aimAtEnemy(page, rect);
    // strafe: move toward enemy-ish direction with jitter, else wander
    const dir = DIRS[Math.floor(Math.random() * 4)];
    if (held !== dir) {
      if (held) await page.keyboard.up(held);
      await page.keyboard.down(dir);
      held = dir;
    }
    const now = Date.now();
    if (now - lastDash > 3800 + Math.random() * 1500) { await page.keyboard.press("Space"); lastDash = now; }
    if (e && e.dist < 420 && now - lastQ > 7000) { await page.keyboard.press("q"); lastQ = now; }
    if (e && e.dist < 260 && now - lastF > 9000) { await page.keyboard.press("f"); lastF = now; }
    await sleep(450 + Math.random() * 350);
  }
  if (held) await page.keyboard.up(held);
  if (fire) await page.mouse.up();
}

// Roam for `ms`: longer holds per direction, gentle aim drift, no fire.
async function roamDriver(page, ms) {
  const rect = await canvasRect(page);
  const t0 = Date.now();
  const seq = ["w", "w", "d", "w", "a", "s", "d", "w", "a", "w"];
  let i = 0;
  while (Date.now() - t0 < ms) {
    const dir = seq[i++ % seq.length];
    await page.keyboard.down(dir);
    await page.mouse.move(
      rect.left + (400 + Math.random() * 800) / rect.sx,
      rect.top + (250 + Math.random() * 400) / rect.sy,
      { steps: 20 },
    );
    await sleep(1700 + Math.random() * 900);
    await page.keyboard.up(dir);
  }
}

async function travel(page, zone) {
  await page.evaluate((z) => {
    window.__game.scene.getScene("Online").travelTo(z);
  }, zone);
  await sleep(6500); // deploy transition + zone handoff
  await page.waitForFunction(() => {
    const s = window.__game?.scene?.getScene("Online");
    return !!(s && s.scene.isActive());
  }, { timeout: 20000 }).catch(() => {});
  await sleep(1500);
}

// ---- clips ------------------------------------------------------------------
const CLIP_DEFS = {
  // Metro City hub: neon streets, NPCs, market
  city: async (page) => {
    await roamDriver(page, 26000);
  },
  // District combat with kit + (likely) a world event around the 18s mark
  downtown: async (page) => {
    await travel(page, "downtown");
    await combatDriver(page, 80000);
  },
  // Second district for visual variety (different accent/tileset)
  stacks: async (page) => {
    await travel(page, "stacks");
    await combatDriver(page, 55000);
  },
  // ICE VAULT dive: entry + guard chambers (v2 has an ICE WARDEN)
  vault: async (page) => {
    await travel(page, "v2");
    await combatDriver(page, 70000);
  },
  // THE UNDERLINE subway atmosphere
  subway: async (page) => {
    await travel(page, "subway");
    await combatDriver(page, 30000, { fire: true });
  },
  // High-tier district: dramatic stakes, possible SIGNAL LOST
  kernel: async (page) => {
    await travel(page, "core");
    await combatDriver(page, 45000);
  },
  // ANDURIL YARDS — tier-1 district, different tileset/accent
  yards: async (page) => {
    await travel(page, "d1");
    await combatDriver(page, 55000);
  },
  // THE KERNEL — top-tier district, expect carnage
  kernel7: async (page) => {
    await travel(page, "d7");
    await combatDriver(page, 50000);
  },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CLIP_DEFS);

for (const name of wanted) {
  console.log(`\n=== CLIP: ${name} ===`);
  const { browser, context, page } = await launch({ recordDir: CLIPS_DIR });
  try {
    await enterWorld(page);
    console.log("scenes:", await activeScenes(page));
    await CLIP_DEFS[name](page);
    await page.screenshot({ path: `${CLIPS_DIR}/${name}_end.png` });
  } catch (e) {
    console.log(`CLIP ${name} ERROR:`, String(e).slice(0, 300));
  }
  const video = page.video();
  await context.close();
  if (video) {
    const p = await video.path();
    fs.renameSync(p, `${CLIPS_DIR}/${name}.webm`);
    console.log(`saved ${name}.webm (${Math.round(fs.statSync(`${CLIPS_DIR}/${name}.webm`).size / 1e6)}MB)`);
  }
  await browser.close();
}
console.log("CAPTURE DONE");
