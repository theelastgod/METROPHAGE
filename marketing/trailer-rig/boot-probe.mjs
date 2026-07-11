// Boot probe — log failing asset URLs + loader progress until Select appears.
import { launch, sleep } from "./rig.mjs";

const { browser, page } = await launch();
page.on("response", (r) => {
  if (r.status() >= 400) console.log("[http]", r.status(), r.url());
});
page.on("requestfailed", (r) => console.log("[reqfail]", r.url(), r.failure()?.errorText));
await page.goto("http://127.0.0.1:5188/", { waitUntil: "commit", timeout: 60000 });

for (let i = 0; i < 20; i++) {
  await sleep(2000);
  const st = await page.evaluate(() => {
    const g = window.__game;
    if (!g) return { game: false };
    const active = g.scene.scenes.filter((s) => s.scene.isActive()).map((s) => s.scene.key);
    const boot = g.scene.getScene("Boot");
    const ld = boot?.load;
    return { game: true, active, progress: ld?.progress, pending: ld?.list?.size, failed: ld?.totalFailed };
  });
  console.log(JSON.stringify(st));
  if (st.active?.includes("Select") || st.active?.includes("Online")) break;
}
await browser.close();
