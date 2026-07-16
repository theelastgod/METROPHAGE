#!/usr/bin/env node
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const RAW = "tmp-art-backup/hf-web-2026-07-16/ground-raw";
const OUT = "public/assets/tilesets";
await mkdir(OUT, { recursive: true });

const plates = {
  "02_city_spawn_plate.png": "hf_ground_city_spawn",
  "03_palantir_plaza.png": "hf_ground_downtown",
  "04_anduril_yards.png": "hf_ground_stacks",
  "05_argus_spire.png": "hf_ground_spire",
  "06_tidal_yards.png": "hf_ground_docks",
  "07_undercity.png": "hf_ground_undercity",
  "08_orbital_relay.png": "hf_ground_relay",
  "09_wasteland.png": "hf_ground_wastes",
  "10_kernel.png": "hf_ground_core",
};

for (const [source, key] of Object.entries(plates)) {
  if (existsSync(`${OUT}/${key}.png`)) continue;
  await sharp(`${RAW}/${source}`)
    .resize(1024, 1024, { fit: "cover", kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: true, quality: 92 })
    .toFile(`${OUT}/${key}.png`);
  console.log(`${OUT}/${key}.png`);
}

const atlases = {
  "01_city_spawn_atlas.png": "hf_ground_spawn_tile",
  "11_city_ground_atlas.png": "hf_ground_city_tile",
  "12_progression_atlas.png": "hf_ground_progress_tile",
  "13_interior_floor_atlas.png": "hf_ground_interior_tile",
  "14_subway_atlas.png": "hf_ground_subway_tile",
  "15_wilderness_atlas.png": "hf_ground_wilderness_tile",
};

for (const [source, prefix] of Object.entries(atlases)) {
  const file = `${RAW}/${source}`;
  const meta = await sharp(file).metadata();
  if (!meta.width || !meta.height) throw new Error(`missing dimensions: ${file}`);
  const cellW = Math.floor(meta.width / 4);
  const cellH = Math.floor(meta.height / 4);
  for (let index = 0; index < 16; index++) {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const left = col * cellW;
    const top = row * cellH;
    const width = col === 3 ? meta.width - left : cellW;
    const height = row === 3 ? meta.height - top : cellH;
    const side = Math.min(width, height);
    const key = `${prefix}_${String(index + 1).padStart(2, "0")}`;
    if (existsSync(`${OUT}/${key}.png`)) continue;
    await sharp(file)
      .extract({ left: left + Math.floor((width - side) / 2), top: top + Math.floor((height - side) / 2), width: side, height: side })
      .resize(256, 256, { fit: "fill", kernel: "lanczos3" })
      .png({ compressionLevel: 9, palette: true, quality: 92 })
      .toFile(`${OUT}/${key}.png`);
  }
  console.log(`${OUT}/${prefix}_01..16.png`);
}
