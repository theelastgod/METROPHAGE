// Clean hub capture: the FIXER NPC (human bake, stub-fix target) + the PROVING door.
import { launch, boot, sleep } from "./rig.mjs";
import fs from "node:fs";

const OUT = "/tmp/verify-hub";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await launch();
await boot(page);
await page.evaluate(() => window.__enterCity());
await sleep(9000);
await page.mouse.click(640, 400); // dismiss dialogue
await sleep(500);

const cdp = await page.context().newCDPSession(page);
async function shot(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  console.log("shot", name);
}

// find the FIXER NPC and the PROVING door, teleport-walk the camera near the NPC
const info = await page.evaluate(() => {
  const on = window.__game.scene.getScene("Online");
  const npc = (on.npcs || [])[0] || null;
  on.cameras.main.setZoom(2.6);
  // nudge the player toward the first NPC so it's on-screen
  if (npc) { on.me.x = npc.x - 20; on.me.y = npc.y + 30; on.cameras.main.centerOn(npc.x, npc.y); }
  return {
    npcs: (on.npcs || []).length,
    npcTexture: npc ? (npc.sprite ? npc.sprite.texture.key : "?") : "none",
    doors: (on.hubDoors || []).map((d) => d.label ?? d.dest).filter(Boolean),
  };
});
console.log("hub:", JSON.stringify(info));
await sleep(700);
await shot("hub-npc");

// pan to the PROVING door (hub east): center on the vault door tile if present
await page.evaluate(() => {
  const on = window.__game.scene.getScene("Online");
  on.cameras.main.setZoom(1.4);
  on.cameras.main.centerOn(on.me.x, on.me.y);
});
await sleep(600);
await shot("hub-wide");

await browser.close();
console.log("done ->", OUT);
