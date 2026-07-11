#!/usr/bin/env node
// METROPHAGE — Higgsfield art build.
//
// Rebuilds the shipped presentation art from the raw 4K Higgsfield generations in
// art-source/higgsfield/ (gitignored staging, like the other art-source inputs):
//
//   sheet_cast.png / sheet_keepers.png / sheet_residents.png  (4×3 portrait grids)
//     → public/assets/portraits/{cast,keepers,residents}_sheet.png  (12 × 256px frames)
//     → public/assets/portraits/painted_player.png / painted_fixer.png (singles)
//   sheet_classes.png  (2×2 class art grid)
//     → public/assets/ui/classart_{id}.jpg  (card-aspect crops)
//   keyart_title.png   → public/og.png (1200×630) + landing/og.png
//   menu_bg.png        → public/assets/ui/menu_bg.jpg (1920×1080) + landing/hero.jpg
//
// The model draws its own gutters; cells are cut on exact grid fractions with a
// safety inset. The keepers sheet baked small role labels into each cell's top
// band, so its cells take a deeper top inset that crops the labels away.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "art-source/higgsfield";
const OUT_PORTRAITS = "public/assets/portraits";
const OUT_UI = "public/assets/ui";
const CELL = 256; // shipped portrait frame size

async function grid(file, cols, rows, out, { insetTop, inset }) {
  const img = sharp(path.join(SRC, file));
  const { width: W, height: H } = await img.metadata();
  const cw = W / cols;
  const ch = H / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // label-safe window inside the cell, then squared on the smaller side
      const top = ch * insetTop;
      const side = cw * inset;
      const bottom = ch * inset;
      const w = cw - side * 2;
      const h = ch - top - bottom;
      const size = Math.min(w, h);
      const left = Math.round(c * cw + (cw - size) / 2);
      const yTop = Math.round(r * ch + top + (h - size) / 2);
      cells.push(
        await sharp(path.join(SRC, file))
          .extract({ left, top: yTop, width: Math.round(size), height: Math.round(size) })
          .resize(CELL, CELL)
          .png()
          .toBuffer(),
      );
    }
  }
  // recomposite as a clean gutterless spritesheet — frame index = row-major cell order.
  // JPEG: portraits render full-bleed behind the dialogue frame, no alpha needed.
  const sheet = sharp({
    create: { width: CELL * cols, height: CELL * rows, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).composite(cells.map((input, i) => ({ input, left: (i % cols) * CELL, top: Math.floor(i / cols) * CELL })));
  await sheet.jpeg({ quality: 86 }).toFile(out);
  console.log("sheet →", out);
  return cells;
}

async function main() {
  fs.mkdirSync(OUT_PORTRAITS, { recursive: true });
  fs.mkdirSync(OUT_UI, { recursive: true });

  // portrait sheets — cast/residents are clean; keepers needs the label band cropped
  const cast = await grid("sheet_cast.png", 4, 3, `${OUT_PORTRAITS}/cast_sheet.jpg`, { insetTop: 0.06, inset: 0.06 });
  await grid("sheet_keepers.png", 4, 3, `${OUT_PORTRAITS}/keepers_sheet.jpg`, { insetTop: 0.16, inset: 0.06 });
  await grid("sheet_residents.png", 4, 3, `${OUT_PORTRAITS}/residents_sheet.jpg`, { insetTop: 0.06, inset: 0.06 });

  // premium singles used by the SP campaign dialogue (fixer = frame 0, runner = frame 1)
  await sharp(cast[0]).jpeg({ quality: 88 }).toFile(`${OUT_PORTRAITS}/painted_fixer.jpg`);
  await sharp(cast[1]).jpeg({ quality: 88 }).toFile(`${OUT_PORTRAITS}/painted_player.jpg`);
  console.log("singles → painted_fixer.jpg painted_player.jpg");

  // class card art — 2×2 cells cropped to the select-card aspect (≈370:332)
  const ids = ["metrophage", "k-guerilla", "wintermute", "swarm"];
  const meta = await sharp(path.join(SRC, "sheet_classes.png")).metadata();
  const cw = meta.width / 2;
  const ch = meta.height / 2;
  const aspect = 370 / 332;
  for (let i = 0; i < 4; i++) {
    const cx = (i % 2) * cw;
    const cy = Math.floor(i / 2) * ch;
    const innerW = cw * 0.96;
    const innerH = ch * 0.96;
    const w = Math.min(innerW, innerH * aspect);
    const h = w / aspect;
    await sharp(path.join(SRC, "sheet_classes.png"))
      .extract({
        left: Math.round(cx + (cw - w) / 2),
        top: Math.round(cy + (ch - h) / 2),
        width: Math.round(w),
        height: Math.round(h),
      })
      .resize(768, Math.round(768 / aspect))
      .jpeg({ quality: 84 })
      .toFile(`${OUT_UI}/classart_${ids[i]}.jpg`);
  }
  console.log("class art → classart_{id}.jpg ×4");

  // og image — 1200×630 center-crop of the titled key art
  await sharp(path.join(SRC, "keyart_title.png")).resize(1200, 630, { fit: "cover" }).png().toFile("public/og.png");
  fs.copyFileSync("public/og.png", "landing/og.png");
  console.log("og → public/og.png + landing/og.png");

  // menu backdrop (textless) — also the landing hero
  await sharp(path.join(SRC, "menu_bg.png")).resize(1920, 1080, { fit: "cover" }).jpeg({ quality: 80 }).toFile(`${OUT_UI}/menu_bg.jpg`);
  await sharp(path.join(SRC, "menu_bg.png")).resize(1600, 900, { fit: "cover" }).jpeg({ quality: 76 }).toFile("landing/hero.jpg");
  console.log("backdrops → menu_bg.jpg + landing/hero.jpg");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
