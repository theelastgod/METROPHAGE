// METROPHAGE capture rig: headed Chromium + injected Solana wallet (Node signs).
import { chromium } from "/Users/wendellphillips/METROPHAGE/node_modules/playwright/index.mjs";
import { ed25519 } from "/Users/wendellphillips/METROPHAGE/server/node_modules/@noble/curves/ed25519.js";
import fs from "node:fs";

const SCRATCH = "/Users/wendellphillips/METROPHAGE/marketing/trailer-rig";
// Resolved at call time so capture scripts can swap wallets between launches.
const keyfile = () => process.env.WALLET_FILE || `${SCRATCH}/trailer-wallet.json`;

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58encode(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      const x = digits[j] * 256 + carry;
      digits[j] = x % 58;
      carry = (x / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let s = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) s += B58[digits[i]];
  return s;
}

function loadKeypair() {
  const kf = keyfile();
  if (fs.existsSync(kf)) {
    const j = JSON.parse(fs.readFileSync(kf, "utf8"));
    return { priv: Uint8Array.from(j.priv), pub58: j.pub58 };
  }
  const priv = ed25519.utils.randomPrivateKey();
  const pub58 = b58encode(ed25519.getPublicKey(priv));
  fs.writeFileSync(kf, JSON.stringify({ priv: Array.from(priv), pub58 }));
  return { priv, pub58 };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ recordDir = null, slowMoWindow = "40,40" } = {}) {
  const { priv, pub58 } = loadKeypair();
  const browser = await chromium.launch({
    headless: false,
    args: ["--use-angle=metal", `--window-position=${slowMoWindow}`, "--hide-crash-restore-bubble"],
  });
  const ctxOpts = { viewport: { width: 1280, height: 720 } };
  if (recordDir) ctxOpts.recordVideo = { dir: recordDir, size: { width: 1280, height: 720 } };
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();

  await page.exposeFunction("__walletSign", (msg) => {
    const sig = ed25519.sign(new TextEncoder().encode(msg), priv);
    return Array.from(sig);
  });
  // Action-mode controls: WASD + hold-to-fire (cinematic), not click-to-walk.
  await page.addInitScript(() => {
    try {
      const KEY = "metrophage_settings_v1";
      const cur = JSON.parse(localStorage.getItem(KEY) || "{}");
      cur.rsControls = false;
      localStorage.setItem(KEY, JSON.stringify(cur));
      // rig sessions are returning players — skip the first-boot cold open
      // Skip trailer on every reload so captures hit the menu/game immediately.
      // (coldopen-view.mjs clears these to audit the intro itself)
      localStorage.setItem("metrophage_skip_coldopen", "1");
      localStorage.setItem("metrophage_coldopen_v2", "1");
      localStorage.setItem("metrophage_coldopen_v1", "1");
    } catch {}
  });
  await page.addInitScript((pub) => {
    const provider = {
      publicKey: { toString: () => pub },
      isConnected: false,
      async connect() {
        this.isConnected = true;
        return { publicKey: { toString: () => pub } };
      },
      async disconnect() {
        this.isConnected = false;
      },
      async signMessage(message) {
        const text = new TextDecoder().decode(message);
        const arr = await window.__walletSign(text);
        return { signature: Uint8Array.from(arr) };
      },
    };
    window.phantom = { solana: provider };
    window.solana = provider;
  }, pub58);

  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
  return { browser, context, page, wallet: pub58 };
}

export async function boot(page) {
  await page.goto("http://127.0.0.1:5188/", { waitUntil: "commit", timeout: 60000 });
  // Survive mid-boot reloads: poll until the Select scene is actually up.
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const ready = await page.evaluate(() => {
        const g = window.__game;
        return !!(g && g.scene.getScenes(true).some((s) => s.scene.key === "Select"));
      });
      if (ready) break;
    } catch { /* navigation destroyed context — keep polling */ }
    await sleep(1000);
  }
  await sleep(2500);
}

// List visible Phaser text objects across active scenes (canvas coords).
export async function visibleTexts(page) {
  return page.evaluate(() => {
    const g = window.__game;
    const out = [];
    const walk = (obj, scene) => {
      if (!obj || obj.visible === false) return;
      if (obj.type === "Text" && obj.text && obj.text.trim()) {
        const m = obj.getWorldTransformMatrix();
        out.push({
          scene,
          text: obj.text.slice(0, 60),
          x: Math.round(m.tx + (0.5 - obj.originX) * obj.displayWidth),
          y: Math.round(m.ty + (0.5 - obj.originY) * obj.displayHeight),
        });
      }
      if (obj.list) for (const c of obj.list) walk(c, scene);
    };
    for (const s of g.scene.getScenes(true)) {
      for (const c of s.children.list) walk(c, s.scene.key);
    }
    return out;
  });
}

// Click the center of the first visible Phaser text matching `pattern` (string regex).
export async function clickText(page, pattern, { nth = 0 } = {}) {
  const texts = await visibleTexts(page);
  const re = new RegExp(pattern, "i");
  const hits = texts.filter((t) => re.test(t.text));
  if (!hits[nth]) {
    console.log(`clickText MISS for /${pattern}/. Visible:`, texts.map((t) => t.text).join(" | ").slice(0, 900));
    return false;
  }
  const t = hits[nth];
  // Canvas is FIT-scaled into the viewport; map canvas coords → page coords.
  const rect = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height, cw: c.width, ch: c.height };
  });
  const scale = await page.evaluate(() => window.__game.scale.displayScale ? { x: window.__game.scale.displayScale.x, y: window.__game.scale.displayScale.y } : null);
  const px = rect.left + t.x / (scale ? scale.x : rect.cw / rect.w);
  const py = rect.top + t.y / (scale ? scale.y : rect.ch / rect.h);
  await page.mouse.click(px, py);
  console.log(`clicked "${t.text}" @canvas(${t.x},${t.y}) page(${Math.round(px)},${Math.round(py)})`);
  return true;
}

export const SCRATCH_DIR = SCRATCH;
