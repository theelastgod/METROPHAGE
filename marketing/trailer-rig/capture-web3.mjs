// Web3-trailer re-shoot: TWO live clients so the MMO/PvP beats show real players.
// Browser A records; browser B co-stars (separate wallet). Both need $METRO for
// the crucible buy-in — sim-deposited via the devnet-sim bridge before shooting.
// Usage: node capture-web3.mjs [clip ...]   clips: city30 quest30 duo30 pvp30 metro30
import { launch, boot, clickText, visibleTexts, sleep, SCRATCH_DIR } from "./rig.mjs";
import fs from "node:fs";

const CLIPS = `${SCRATCH_DIR}/clips`;
const API = "http://127.0.0.1:8787";
const WALLET_A = `${SCRATCH_DIR}/trailer-wallet.json`;
const WALLET_B = `${SCRATCH_DIR}/trailer-wallet-b.json`;
fs.mkdirSync(CLIPS, { recursive: true });

const activeScenes = (page) => page.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));
const allText = async (page) => (await visibleTexts(page)).map((t) => t.text).join(" | ");

async function enterWorld(page, { name = "BLANK", zone = "safe" } = {}) {
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
      await page.keyboard.type(name, { delay: 60 });
      await clickText(page, "LOCK IN & DEPLOY");
      await sleep(3200);
    } else if (sc.includes("Prologue")) {
      await page.evaluate((z) => window.__game.scene.getScene("Prologue").scene.start("Online", { zone: z }), zone);
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
const pos = (page) =>
  page.evaluate(() => {
    const s = window.__game.scene.getScene("Online");
    return s && s.net ? { x: s.net.pred.x, y: s.net.pred.y, zone: s.zone } : null;
  });

// Nearest target on screen: mode "enemy" uses enemySprites, "player" remoteSprites.
async function aimAt(page, rect, mode) {
  const e = await page.evaluate((m) => {
    const s = window.__game.scene.getScene("Online");
    if (!s || !s.scene.isActive()) return null;
    const cam = s.cameras.main;
    const px = s.net?.pred?.x ?? 0, py = s.net?.pred?.y ?? 0;
    let best = null, bd = Infinity;
    const bag = m === "player" ? s.remoteSprites : s.enemySprites;
    const iter = bag ? (bag.values ? Array.from(bag.values()) : Object.values(bag)) : [];
    for (const en of iter) {
      const sp = en?.sprite ?? en;
      if (!sp || sp.active === false || typeof sp.x !== "number") continue;
      const d = (sp.x - px) ** 2 + (sp.y - py) ** 2;
      if (d < bd) { bd = d; best = sp; }
    }
    if (!best) return null;
    return { x: (best.x - cam.worldView.x) * cam.zoom, y: (best.y - cam.worldView.y) * cam.zoom, dist: Math.sqrt(bd) };
  }, mode);
  if (!e) return null;
  await page.mouse.move(rect.left + Math.max(10, Math.min(1270, e.x)) / rect.sx, rect.top + Math.max(10, Math.min(710, e.y)) / rect.sy);
  return e;
}

const DIRS = ["w", "a", "s", "d"];
async function combat(page, ms, mode = "enemy") {
  const rect = await canvasRect(page);
  const t0 = Date.now();
  let held = null, lastDash = 0, lastQ = 0, lastF = 0;
  await page.mouse.down();
  while (Date.now() - t0 < ms) {
    const e = await aimAt(page, rect, mode);
    const dir = DIRS[Math.floor(Math.random() * 4)];
    if (held !== dir) { if (held) await page.keyboard.up(held); await page.keyboard.down(dir); held = dir; }
    const now = Date.now();
    if (now - lastDash > 3200 + Math.random() * 1400) { await page.keyboard.press("Space"); lastDash = now; }
    if (e && e.dist < 460 && now - lastQ > 7000) { await page.keyboard.press("q"); lastQ = now; }
    if (e && e.dist < 280 && now - lastF > 9000) { await page.keyboard.press("f"); lastF = now; }
    await sleep(380 + Math.random() * 300);
  }
  if (held) await page.keyboard.up(held);
  await page.mouse.up();
}

// Hold the dominant-axis key toward (tx,ty) until close or timeout.
async function walkTo(page, tx, ty, timeoutMs = 45000, close = 60) {
  const t0 = Date.now();
  let held = null;
  while (Date.now() - t0 < timeoutMs) {
    const p = await pos(page);
    if (!p) break;
    const dx = tx - p.x, dy = ty - p.y;
    if (Math.hypot(dx, dy) < close) break;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "d" : "a") : (dy > 0 ? "s" : "w");
    if (held !== dir) { if (held) await page.keyboard.up(held); await page.keyboard.down(dir); held = dir; }
    await sleep(240);
  }
  if (held) await page.keyboard.up(held);
}

// B trails A so the recorded frame keeps a second runner on screen.
async function follow(pageB, pageA, ms, gap = 90) {
  const t0 = Date.now();
  let held = null;
  while (Date.now() - t0 < ms) {
    const a = await pos(pageA), b = await pos(pageB);
    if (a && b) {
      const dx = a.x - b.x, dy = a.y - b.y;
      if (Math.hypot(dx, dy) > gap) {
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "d" : "a") : (dy > 0 ? "s" : "w");
        if (held !== dir) { if (held) await pageB.keyboard.up(held); await pageB.keyboard.down(dir); held = dir; }
      } else if (held) { await pageB.keyboard.up(held); held = null; }
    }
    await sleep(260);
  }
  if (held) await pageB.keyboard.up(held);
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

async function chat(page, text) {
  await page.keyboard.press("t");
  await sleep(400);
  await page.keyboard.type(text, { delay: 55 });
  await page.keyboard.press("Enter");
}

function pub58Of(file) {
  return JSON.parse(fs.readFileSync(file, "utf8")).pub58;
}

// Devnet-sim bridge deposit → funds the crucible buy-in (server credits p.metro on next connect).
async function simDeposit(pub, metro) {
  const r = await fetch(`${API}/metro/deposit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ player: `w:${pub}`, wallet: pub, txSig: `trailer-${pub.slice(0, 6)}-${Date.now()}`, metro }),
  });
  console.log(`deposit ${pub.slice(0, 6)}…`, r.status, (await r.text()).slice(0, 160));
}

// One-time: connect wallet B so its players row exists, then disconnect (persists).
async function ensureRow(walletFile, name) {
  process.env.WALLET_FILE = walletFile;
  const { browser, context, page } = await launch({});
  try {
    await enterWorld(page, { name });
    // move a little so the player is dirty, then linger until the persist
    // alarm writes the players row (poll the bridge until it resolves)
    await page.keyboard.down("w");
    await sleep(1500);
    await page.keyboard.up("w");
    const pub = pub58Of(process.env.WALLET_FILE);
    for (let i = 0; i < 30; i++) {
      const r = await fetch(`${API}/metro/account?player=${encodeURIComponent("w:" + pub)}`).then((x) => x.json()).catch(() => ({}));
      if (r.ok) { console.log(`players row for ${pub.slice(0, 6)}… is live`); break; }
      await sleep(3000);
    }
  } finally {
    await context.close();
    await browser.close();
  }
  delete process.env.WALLET_FILE;
}

async function launchPair({ record = true } = {}) {
  process.env.WALLET_FILE = WALLET_A;
  const A = await launch(record ? { recordDir: CLIPS } : {});
  process.env.WALLET_FILE = WALLET_B;
  const B = await launch({ slowMoWindow: "1330,40" });
  delete process.env.WALLET_FILE;
  return { A, B };
}

async function closePair({ A, B }, clipName) {
  const video = A.page.video && A.page.video();
  await A.context.close();
  await B.context.close();
  if (video && clipName) {
    fs.renameSync(await video.path(), `${CLIPS}/${clipName}.webm`);
    console.log(`saved ${clipName}.webm`);
  }
  await A.browser.close();
  await B.browser.close();
}

const DEFS = {
  // MMORPG city beat: B trails A through neon streets, drops a chat line mid-take.
  city30: async () => {
    const pair = await launchPair();
    try {
      await enterWorld(pair.B.page, { name: "VESSEL" });
      await enterWorld(pair.A.page);
      const roamP = roam(pair.A.page, 30000);
      const followP = follow(pair.B.page, pair.A.page, 30000);
      await sleep(9000);
      await chat(pair.B.page, "wake the blanks");
      await Promise.all([roamP, followP]);
    } finally { await closePair(pair, "city30"); }
  },
  // Quest beat: open the journal over the city, then run the waypoint.
  quest30: async () => {
    process.env.WALLET_FILE = WALLET_A;
    const { browser, context, page } = await launch({ recordDir: CLIPS });
    delete process.env.WALLET_FILE;
    try {
      await enterWorld(page);
      await sleep(1500);
      await page.keyboard.press("j");
      await sleep(4500);
      await page.keyboard.press("Escape");
      await sleep(600);
      await roam(page, 14000);
    } finally {
      const video = page.video();
      await context.close();
      if (video) fs.renameSync(await video.path(), `${CLIPS}/quest30.webm`);
      await browser.close();
      console.log("saved quest30.webm");
    }
  },
  // Duo mob combat in d0 — two runners, shared fights.
  duo30: async () => {
    const pair = await launchPair();
    try {
      await enterWorld(pair.B.page, { name: "VESSEL" });
      await enterWorld(pair.A.page);
      await travel(pair.B.page, "d0");
      await travel(pair.A.page, "d0");
      await Promise.all([combat(pair.A.page, 42000, "enemy"), combat(pair.B.page, 42000, "enemy")]);
    } finally { await closePair(pair, "duo30"); }
  },
  // THE CRUCIBLE: both walk into the arena (buy-in banners fire), then duel.
  pvp30: async () => {
    const pair = await launchPair();
    try {
      await enterWorld(pair.B.page, { name: "VESSEL" });
      await enterWorld(pair.A.page);
      await travel(pair.B.page, "d1");
      await travel(pair.A.page, "d1");
      const z = await pair.A.page.evaluate(() => {
        const s = window.__game.scene.getScene("Online");
        const r = s.pvpZones && s.pvpZones[0];
        return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
      });
      if (!z) throw new Error("no pvp zone in d1");
      console.log("crucible @", z);
      await Promise.all([walkTo(pair.A.page, z.x - 60, z.y, 60000), walkTo(pair.B.page, z.x + 60, z.y, 60000)]);
      await sleep(2500); // buy-in banner beat
      await Promise.all([combat(pair.A.page, 32000, "player"), combat(pair.B.page, 32000, "player")]);
    } finally { await closePair(pair, "pvp30"); }
  },
  // $METRO bridge panel over live gameplay: open FAB, connect, show balance/MAX.
  metro30: async () => {
    process.env.WALLET_FILE = WALLET_A;
    const { browser, context, page } = await launch({ recordDir: CLIPS });
    delete process.env.WALLET_FILE;
    try {
      await enterWorld(page);
      await sleep(1200);
      const fab = await page.$("#metro-fab");
      if (!fab) throw new Error("no #metro-fab — VITE_METRO_MINT not set?");
      await fab.click();
      await sleep(1500);
      const connect = await page.$("#m-connect");
      if (connect) { await connect.click().catch(() => {}); await sleep(2500); }
      const refresh = await page.$("#m-refresh");
      if (refresh) { await refresh.click().catch(() => {}); await sleep(2000); }
      const max = await page.$("#m-max");
      if (max) { await max.click().catch(() => {}); await sleep(2500); }
      await sleep(3000);
      await page.keyboard.press("Escape");
      const x = await page.$("#m-x");
      if (x) await x.click().catch(() => {});
      await sleep(800);
      await roam(page, 6000);
    } finally {
      const video = page.video();
      await context.close();
      if (video) fs.renameSync(await video.path(), `${CLIPS}/metro30.webm`);
      await browser.close();
      console.log("saved metro30.webm");
    }
  },
};

const argv = process.argv.slice(2);
if (argv[0] === "setup") {
  // one-time: create wallet B's row, then fund both wallets' $METRO via sim deposits
  if (!fs.existsSync(WALLET_B)) console.log("wallet B will be generated on first launch");
  await ensureRow(WALLET_B, "VESSEL");
  await simDeposit(pub58Of(WALLET_A), 120000);
  await simDeposit(pub58Of(WALLET_B), 120000);
  process.exit(0);
}
const wanted = argv.length ? argv : Object.keys(DEFS);
for (const name of wanted) {
  console.log(`=== ${name} ===`);
  try {
    await DEFS[name]();
  } catch (e) {
    console.log(`ERR ${name}:`, String(e).slice(0, 300));
  }
}
console.log("DONE");
