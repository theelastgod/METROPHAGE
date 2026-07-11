#!/usr/bin/env node
// METROPHAGE — slice Higgsfield HUD/UI + prop sheets into shippable game assets.
//
// Inputs (art-source/higgsfield/, gitignored staging):
//   sheet_hud_chrome.png     3×3 empty neon frames / skill slots / button rings
//   sheet_ability_icons.png  ability icons (4×4; we take the best unique cells)
//   sheet_weapon_icons.png   neon weapon silhouettes
//   sheet_props.png          top-down city props
//
// Outputs under public/assets/:
//   ui/hud_panel.png, ui/skill_frame_hf.png, ui/btn_ring.png
//   ui/ability_*.png (8), ui/gun_hf_*.png (up to 6)
//   objects/hf_prop_*.png (curated top-down props)
//   + favicon.ico / favicon-32.png from keyart/og if present

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "art-source/higgsfield";
const OUT_UI = "public/assets/ui";
const OUT_OBJ = "public/assets/objects";

/** Key near-black to transparent (Higgsfield sheets are RGB on black). */
async function keyBlack(buf, tol = 18) {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= tol && g <= tol && b <= tol) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/** Extract grid cell, key black, trim transparent padding, resize. */
async function cell(file, cols, rows, c, r, { inset = 0.04, size, maxSide } = {}) {
  const img = sharp(path.join(SRC, file));
  const meta = await img.metadata();
  const cw = meta.width / cols;
  const ch = meta.height / rows;
  const ix = cw * inset;
  const iy = ch * inset;
  let buf = await sharp(path.join(SRC, file))
    .extract({
      left: Math.round(c * cw + ix),
      top: Math.round(r * ch + iy),
      width: Math.round(cw - ix * 2),
      height: Math.round(ch - iy * 2),
    })
    .png()
    .toBuffer();
  buf = await keyBlack(buf);
  let s = sharp(buf).trim({ threshold: 8 });
  if (size) s = s.resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  else if (maxSide) {
    const t = await s.toBuffer();
    const m = await sharp(t).metadata();
    const scale = Math.min(1, maxSide / Math.max(m.width, m.height));
    s = sharp(t).resize(Math.round(m.width * scale), Math.round(m.height * scale), {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  return s.png().toBuffer();
}

async function write(buf, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(buf).png().toFile(out);
  console.log("→", out);
}

async function main() {
  fs.mkdirSync(OUT_UI, { recursive: true });
  fs.mkdirSync(OUT_OBJ, { recursive: true });

  // ── HUD chrome 3×3 ──
  // [0,0] panel (primary)  [1,0] panel  [2,0] panel
  // [0,1] diamond frame    [1,1] hex    [2,1] diamond
  // [0,2] ring             [1,2] ring   [2,2] ring
  const panel = await cell("sheet_hud_chrome.png", 3, 3, 0, 0, { inset: 0.06, size: 256 });
  await write(panel, `${OUT_UI}/hud_panel.png`);
  // 9-slice friendly copy (keep glass interior slightly translucent for tinting)
  await write(await cell("sheet_hud_chrome.png", 3, 3, 1, 0, { inset: 0.06, size: 256 }), `${OUT_UI}/hud_panel_alt.png`);

  const skillFrame = await cell("sheet_hud_chrome.png", 3, 3, 0, 1, { inset: 0.08, size: 96 });
  await write(skillFrame, `${OUT_UI}/skill_frame_hf.png`);
  // Overwrite skill_frame used by HUD if we want the new one as default — keep both
  await write(skillFrame, `${OUT_UI}/skill_frame.png`);

  const btnRing = await cell("sheet_hud_chrome.png", 3, 3, 1, 2, { inset: 0.08, size: 96 });
  await write(btnRing, `${OUT_UI}/btn_ring.png`);
  const btnRingAlt = await cell("sheet_hud_chrome.png", 3, 3, 0, 2, { inset: 0.08, size: 96 });
  await write(btnRingAlt, `${OUT_UI}/btn_ring_alt.png`);

  // ── Ability icons 4×4 (pick unique useful set) ──
  // Row-major useful picks:
  // 0,0 dash comet · 1,0 hex shield · 2,0 pulse · 3,0 virus diamond
  // 0,1 rail arrow · 1,1 star · 2,1 blade crescent · 3,1 radar
  const abilityMap = [
    ["ability_dash", 0, 0],
    ["ability_shield", 1, 0],
    ["ability_pulse", 2, 0],
    ["ability_virus", 3, 0],
    ["ability_rail", 0, 1],
    ["ability_overdrive", 1, 1],
    ["ability_blade", 2, 1],
    ["ability_radar", 3, 1],
  ];
  for (const [name, c, r] of abilityMap) {
    const buf = await cell("sheet_ability_icons.png", 4, 4, c, r, { inset: 0.08, size: 64 });
    await write(buf, `${OUT_UI}/${name}.png`);
  }

  // ── Weapons: sheet is ~2×4 neon silhouettes ──
  // Export first 6 as gun_hf_01..06 and promote gun_01 from pistol cell
  const weaponCells = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0, 2],
    [1, 2],
  ];
  for (let i = 0; i < weaponCells.length; i++) {
    const [c, r] = weaponCells[i];
    // weapons are wider than tall — contain into 64×32-ish
    let buf = await cell("sheet_weapon_icons.png", 2, 4, c, r, { inset: 0.06 });
    buf = await sharp(buf)
      .resize(96, 48, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await write(buf, `${OUT_UI}/gun_hf_${String(i + 1).padStart(2, "0")}.png`);
    if (i === 0) await write(buf, `${OUT_UI}/gun_01.png`);
  }

  // ── Props 4×4 top-down-ish ──
  // Curate the cleanest unique cells into hf_prop_01..
  const propPicks = [
    [0, 0], // streetlight
    [1, 0], // vending
    [2, 0], // trash
    [3, 0], // hydrant
    [0, 1], // crate
    [1, 1], // dumpster
    [2, 1], // taxi
    [3, 1], // van
    [0, 2], // AC
    [1, 2], // holo city
    [2, 2], // terminal
    [3, 2], // pallet
  ];
  for (let i = 0; i < propPicks.length; i++) {
    const [c, r] = propPicks[i];
    const buf = await cell("sheet_props.png", 4, 4, c, r, { inset: 0.06, maxSide: 64 });
    await write(buf, `${OUT_OBJ}/hf_prop_${String(i + 1).padStart(2, "0")}.png`);
  }

  // ── Favicon from key art / og ──
  const favSrc = fs.existsSync("public/og.png")
    ? "public/og.png"
    : fs.existsSync(`${SRC}/keyart_title.png`)
      ? `${SRC}/keyart_title.png`
      : null;
  if (favSrc) {
    await sharp(favSrc)
      .resize(32, 32, { fit: "cover" })
      .png()
      .toFile("public/favicon-32.png");
    await sharp(favSrc)
      .resize(180, 180, { fit: "cover" })
      .png()
      .toFile("public/apple-touch-icon.png");
    // simple multi-size ico substitute: 32px png referenced as icon
    console.log("→ public/favicon-32.png + apple-touch-icon.png");
  }

  console.log("higgsfield-hud-build complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
