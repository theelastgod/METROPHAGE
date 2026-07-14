#!/usr/bin/env node
// METROPHAGE — slice expansion sheets (bosses, interact NPCs, district/infected buildings, icons)
// into public/assets. Same keyBlack→trim flow as higgsfield-building-build.mjs.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "art-source/higgsfield";
const OUT_P = "public/assets/portraits";
const OUT_OBJ = "public/assets/objects";
const OUT_UI = "public/assets/ui";
const CELL = 256;
const MAX_SIDE = 224;

async function keyBlack(buf, tol = 20) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    if (data[i] <= tol && data[i + 1] <= tol && data[i + 2] <= tol) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/** Portrait grid → jpeg sheet + optional named singles. */
async function portraitSheet(file, cols, rows, outSheet, { insetTop = 0.06, inset = 0.06 } = {}) {
  const src = path.join(SRC, file);
  if (!fs.existsSync(src)) {
    console.warn("skip missing", src);
    return [];
  }
  const img = sharp(src);
  const { width: W, height: H } = await img.metadata();
  const cw = W / cols;
  const ch = H / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const top = ch * insetTop;
      const side = cw * inset;
      const bottom = ch * inset;
      const w = cw - side * 2;
      const h = ch - top - bottom;
      const size = Math.min(w, h);
      const left = Math.round(c * cw + (cw - size) / 2);
      const yTop = Math.round(r * ch + top + (h - size) / 2);
      cells.push(
        await sharp(src)
          .extract({ left, top: yTop, width: Math.round(size), height: Math.round(size) })
          .resize(CELL, CELL)
          .jpeg({ quality: 88 })
          .toBuffer(),
      );
    }
  }
  fs.mkdirSync(path.dirname(outSheet), { recursive: true });
  await sharp({
    create: { width: CELL * cols, height: CELL * rows, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite(cells.map((input, i) => ({ input, left: (i % cols) * CELL, top: Math.floor(i / cols) * CELL })))
    .jpeg({ quality: 86 })
    .toFile(outSheet);
  console.log("portrait sheet →", outSheet, `(${cells.length} frames)`);
  return cells;
}

async function buildingCell(sheet, cols, rows, c, r, outName) {
  const src = path.join(SRC, sheet);
  if (!fs.existsSync(src)) {
    console.warn("skip", src);
    return;
  }
  const meta = await sharp(src).metadata();
  const cw = meta.width / cols;
  const ch = meta.height / rows;
  const ix = cw * 0.03;
  const iy = ch * 0.03;
  let buf = await sharp(src)
    .extract({
      left: Math.round(c * cw + ix),
      top: Math.round(r * ch + iy),
      width: Math.round(cw - ix * 2),
      height: Math.round(ch - iy * 2),
    })
    .png()
    .toBuffer();
  buf = await keyBlack(buf);
  const trimmed = await sharp(buf).trim({ threshold: 10 }).toBuffer();
  const m = await sharp(trimmed).metadata();
  const scale = Math.min(1, MAX_SIDE / Math.max(m.width, m.height));
  const out = path.join(OUT_OBJ, outName);
  fs.mkdirSync(OUT_OBJ, { recursive: true });
  await sharp(trimmed)
    .resize(Math.round(m.width * scale), Math.round(m.height * scale), { fit: "inside" })
    .png()
    .toFile(out);
  console.log("→", out);
}

async function iconCells(sheet, cols, rows, names) {
  const src = path.join(SRC, sheet);
  if (!fs.existsSync(src)) {
    console.warn("skip icons", src);
    return;
  }
  const meta = await sharp(src).metadata();
  const cw = meta.width / cols;
  const ch = meta.height / rows;
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const name = names[i++];
      if (!name) continue;
      let buf = await sharp(src)
        .extract({
          left: Math.round(c * cw + cw * 0.04),
          top: Math.round(r * ch + ch * 0.04),
          width: Math.round(cw * 0.92),
          height: Math.round(ch * 0.92),
        })
        .png()
        .toBuffer();
      buf = await keyBlack(buf, 24);
      const trimmed = await sharp(buf).trim({ threshold: 8 }).toBuffer();
      const out = path.join(OUT_UI, name);
      fs.mkdirSync(OUT_UI, { recursive: true });
      await sharp(trimmed).resize(96, 96, { fit: "inside" }).png().toFile(out);
      console.log("icon →", out);
    }
  }
}

const BOSS_NAMES = [
  "gutter_king",
  "anduril_sentinel",
  "palantir_oracle",
  "tidal_leviathan",
  "the_maw",
  "skylink_beacon",
  "scrap_sovereign",
  "helios_warden",
  "void_herald",
];

const NPC_INTERACT = [
  "porter",
  "tunnel_rat",
  "scrap_boss",
  "hawker",
  "preacher",
  "street_kid",
  "amb_tech",
  "amb_vendor",
  "subway_warden",
  "amb_courier",
  "keep_den",
  "keep_citycenter",
];

const DIST_BUILD = ["core", "sprawl", "undercity", "docks", "helios", "stacks"];
const INF_BUILD = ["inf_bar", "inf_clinic", "inf_shop", "inf_den", "inf_guild", "inf_home"];

const ICON_NAMES = [
  "ability_hf_dash.png",
  "ability_hf_cone.png",
  "ability_hf_drones.png",
  "ability_hf_ult.png",
  "ability_hf_shield.png",
  "ability_hf_pulse.png",
  "ability_hf_rail.png",
  "ability_hf_radar.png",
  "loot_credit.png",
  "loot_core.png",
  "loot_crate.png",
  "loot_medpatch.png",
  "crest_metrophage.png",
  "crest_kguerilla.png",
  "crest_wintermute.png",
  "crest_swarm.png",
  // leftover cells if 4x4 has more — metro token last preferred
  "metro_token.png",
];

async function main() {
  // Bosses 3×3 → sheet + singles for splash
  const bosses = await portraitSheet("sheet_bosses.png", 3, 3, `${OUT_P}/bosses_sheet.jpg`, {
    insetTop: 0.05,
    inset: 0.05,
  });
  fs.mkdirSync(path.join(OUT_P, "bosses"), { recursive: true });
  for (let i = 0; i < bosses.length && i < BOSS_NAMES.length; i++) {
    const out = path.join(OUT_P, "bosses", `${BOSS_NAMES[i]}.jpg`);
    await sharp(bosses[i]).jpeg({ quality: 88 }).toFile(out);
  }
  console.log("boss singles → portraits/bosses/*.jpg");

  // Interact NPCs 4×3
  const npcs = await portraitSheet("sheet_npc_interact.png", 4, 3, `${OUT_P}/interact_sheet.jpg`);
  fs.mkdirSync(path.join(OUT_P, "interact"), { recursive: true });
  for (let i = 0; i < npcs.length && i < NPC_INTERACT.length; i++) {
    await sharp(npcs[i]).jpeg({ quality: 88 }).toFile(path.join(OUT_P, "interact", `${NPC_INTERACT[i]}.jpg`));
  }

  // District buildings 3×2
  for (let i = 0; i < DIST_BUILD.length; i++) {
    const c = i % 3;
    const r = Math.floor(i / 3);
    await buildingCell("sheet_buildings_district.png", 3, 2, c, r, `hf_building_dist_${DIST_BUILD[i]}.png`);
  }
  // Infected 3×2
  for (let i = 0; i < INF_BUILD.length; i++) {
    const c = i % 3;
    const r = Math.floor(i / 3);
    await buildingCell("sheet_buildings_infected.png", 3, 2, c, r, `hf_building_${INF_BUILD[i]}.png`);
  }

  // Icons — try expand sheet; fall back if tiny/corrupt
  const iconSrc = path.join(SRC, "sheet_icons_expand.png");
  if (fs.existsSync(iconSrc)) {
    const m = await sharp(iconSrc).metadata();
    if ((m.width || 0) >= 512) {
      // 4x4 if square large enough
      await iconCells("sheet_icons_expand.png", 4, 4, ICON_NAMES);
    } else {
      console.warn("icons sheet too small, skip slice", m.width);
    }
  }

  // Copy audio wav → public/assets/sfx + music beds.
  // Ambient beds also land in src/assets/music so Vite import.meta.glob (musicTracks.ts) sees them.
  const audioSrc = path.join(SRC, "audio");
  if (fs.existsSync(audioSrc)) {
    fs.mkdirSync("public/assets/sfx", { recursive: true });
    for (const f of fs.readdirSync(audioSrc)) {
      if (!/\.(wav|mp3|m4a)$/i.test(f)) continue;
      const isBed = f.startsWith("amb_") || f.startsWith("stinger_");
      const dests = isBed
        ? ["public/assets/music", "src/assets/music"]
        : ["public/assets/sfx"];
      for (const destDir of dests) {
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(path.join(audioSrc, f), path.join(destDir, f));
        console.log("audio →", path.join(destDir, f));
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
