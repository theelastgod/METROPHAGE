#!/usr/bin/env node
// Full-bleed plates → WebP q85 (subway modules, interior rooms, layout plates).
// Alpha-preserving. Companion manifest change points these groups at .webp.
// Convert full-bleed plate groups to WebP q85. Alpha-preserving; skips missing.
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import sharp from "sharp";

const num = (base, n) => Array.from({ length: n }, (_, i) => `${base}_${String(i + 1).padStart(2, "0")}`);
const keys = [
  ...num("hf_subway_tile_straight", 25), ...num("hf_subway_tile_junction", 18),
  ...num("hf_subway_tile_cross", 12), ...num("hf_subway_tile_station", 24),
  ...num("hf_subway_tile_curve", 40), ...num("hf_subway_tile_service", 39),
  ...num("hf_subway_tile_stationdeep", 40), ...num("hf_subway_tile_track", 25),
  "hf_int_bar_room", "hf_int_noodle_room", "hf_int_clinic_room", "hf_int_shop_room", "hf_int_guild_room",
  "hf_int_den_room", "hf_int_home_room", "hf_int_stadium_room", "hf_int_citycenter_room",
  "hf_int_ripperdoc_room", "hf_int_pawn_room", "hf_int_arcade_room", "hf_int_garage_room",
  "hf_int_radio_room", "hf_int_hotel_room",
  "hf_int_layout_studio", "hf_int_layout_loft", "hf_int_layout_hall", "hf_int_layout_backroom", "hf_int_layout_atrium",
];
let before = 0, after = 0, done = 0, missing = 0;
for (const k of keys) {
  const src = `public/assets/objects/${k}.png`;
  if (!existsSync(src)) { missing++; console.warn("missing:", k); continue; }
  const buf = readFileSync(src);
  before += buf.length;
  const out = await sharp(buf).webp({ quality: 85, effort: 6 }).toBuffer();
  writeFileSync(`public/assets/objects/${k}.webp`, out);
  after += out.length;
  done++;
}
const mib = (n) => (n / 1048576).toFixed(1);
console.log(`webp: ${done} converted, ${missing} missing · ${mib(before)} → ${mib(after)} MiB`);
