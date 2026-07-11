// Diagnose wallet B's world join: scenes, ws state, net id, server zone stats.
import { launch, boot, clickText, visibleTexts, sleep, SCRATCH_DIR } from "./rig.mjs";
process.env.WALLET_FILE = `${SCRATCH_DIR}/trailer-wallet-b.json`;
const { browser, context, page } = await launch({});
try {
  await boot(page);
  await clickText(page, "◈ SIGN IN");
  await sleep(5000);
  for (let i = 0; i < 12; i++) {
    const st = await page.evaluate(() => {
      const g = window.__game;
      const scenes = g.scene.getScenes(true).map((s) => s.scene.key);
      const on = g.scene.getScene("Online");
      return {
        scenes,
        online: on && on.scene.isActive() ? { zone: on.zone, ws: on.net?.ws?.readyState, id: on.net?.id } : null,
      };
    }).catch((e) => ({ err: String(e).slice(0, 120) }));
    console.log(i, JSON.stringify(st));
    const txt = (await visibleTexts(page)).map((t) => t.text).join(" | ").slice(0, 200);
    console.log("  txt:", txt);
    if (st.scenes?.includes("Select")) {
      if (txt.includes("choose your class")) { await page.keyboard.press("1"); }
      else { for (const p of ["ENTER WORLD", "ENTER METRO CITY", "◈ DEPLOY", "RESUME"]) if (await clickText(page, p)) break; }
    } else if (st.scenes?.includes("Customize")) {
      for (let k = 0; k < 14; k++) await page.keyboard.press("Backspace");
      await page.keyboard.type("VESSEL", { delay: 40 });
      await clickText(page, "LOCK IN & DEPLOY");
    } else if (st.scenes?.includes("Prologue")) {
      await page.evaluate(() => window.__game.scene.getScene("Prologue").scene.start("Online", { zone: "safe" }));
    }
    await sleep(4000);
  }
  const stats = await fetch("http://127.0.0.1:8787/stats?zone=safe").then((r) => r.text()).catch((e) => String(e));
  console.log("server stats:", stats.slice(0, 400));
} finally {
  await context.close();
  await browser.close();
}
