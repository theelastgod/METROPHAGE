#!/usr/bin/env node
// Bulk Higgsfield world-expansion build. Resumable: completed PNGs are skipped.
// All generations use Nano Banana 2 (1.5 cr). Cutouts are prompted on plain black and
// remove only edge-connected background locally; subway plates remain full-frame skins.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const exec = promisify(execFile);
const OUT = "public/assets/objects";
const RAW = "tmp-art-backup/hf-expansion-raw";
const CONCURRENCY = Number(process.env.HF_CONCURRENCY || 4);
const REPROCESS = process.argv.includes("--reprocess");

const numbered = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(2, "0")}`);

const BUILDINGS = [
  "hf_building_ripperdoc_b", "hf_building_ripperdoc_c",
  "hf_building_pawn", "hf_building_pawn_b", "hf_building_pawn_c",
  "hf_building_arcade", "hf_building_arcade_b", "hf_building_arcade_c",
  "hf_building_garage", "hf_building_garage_b", "hf_building_garage_c",
  "hf_building_radio", "hf_building_radio_b", "hf_building_radio_c",
  "hf_building_noodle_b", "hf_building_noodle_c", "hf_building_subway_c",
  "hf_building_hotel_c", "hf_building_stadium_b", "hf_building_stadium_c",
  "hf_building_citycenter_b", "hf_building_citycenter_c",
  ...["core", "sprawl", "undercity", "docks", "stacks", "spire", "wastes", "relay", "helios"].map((s) => `hf_building_dist_${s}_c`),
  ...["market", "park", "corporate", "arcology", "kernel"].flatMap((s) => [`hf_building_dist_${s}_b`, `hf_building_dist_${s}_c`]),
];

const WORLD = [
  ...numbered("hf_city_market", 12), ...numbered("hf_city_neon", 12),
  ...numbered("hf_city_residential", 10), ...numbered("hf_city_industrial", 10),
  ...numbered("hf_city_slum", 10), ...numbered("hf_city_corporate", 8),
  ...numbered("hf_city_landmark", 8), "hf_city_oddity_01",
];

const SUBWAY_CUTOUTS = [
  ...numbered("hf_subway_fixture", 20), ...numbered("hf_subway_debris", 16),
  ...numbered("hf_subway_signalset", 12), ...numbered("hf_subway_maintenance", 12),
  ...numbered("hf_subway_platformprop", 16), ...numbered("hf_subway_horror", 12),
];

const LANDMARKS = [
  ...numbered("hf_early_landmark", 8), ...numbered("hf_early_furniture", 8),
  ...numbered("hf_early_vendor", 8), ...numbered("hf_early_storyprop", 8),
];

// 232 fresh cutouts after the already-generated hf_building_ripperdoc base.
const CUTOUT_NAMES = [...BUILDINGS, ...WORLD, ...SUBWAY_CUTOUTS, ...LANDMARKS];
if (CUTOUT_NAMES.length !== 232) throw new Error(`cutout plan drifted: ${CUTOUT_NAMES.length}`);

// 224 full-frame subway modules. Art varies while geometry remains server-authored.
const MODULE_NAMES = [
  ...numbered("hf_subway_tile_straight", 25),
  ...numbered("hf_subway_tile_junction", 18),
  ...numbered("hf_subway_tile_cross", 12),
  ...numbered("hf_subway_tile_station", 24),
  ...numbered("hf_subway_tile_curve", 40),
  ...numbered("hf_subway_tile_service", 40),
  ...numbered("hf_subway_tile_stationdeep", 40),
  ...numbered("hf_subway_tile_track", 25),
];
const INTERIOR_NAMES = [
  "hf_int_ripperdoc_room", "hf_int_pawn_room", "hf_int_arcade_room",
  "hf_int_garage_room", "hf_int_radio_room", "hf_int_hotel_room",
];

function cutoutBrief(name) {
  if (name.startsWith("hf_building_")) {
    const role = name.replace(/^hf_building_/, "").replace(/_[bc]$/, "").replaceAll("_", " ");
    return `Distinct ${role} building exterior for a top-down 2D cyberpunk action RPG. Three-quarter top-down orthographic projection, compact readable silhouette, neon-noir magenta cyan amber accents, dense believable rooftop machinery, weathered lived-in architecture, clear doorway, no readable text. Centered isolated single building on plain black background, no people, no street, no surrounding scene, no border. Match the reference asset's game-art language but change massing, roofline and details.`;
  }
  const role = name.replace(/^hf_/, "").replace(/_\d+$/, "").replaceAll("_", " ");
  return `One distinct ${role} prop for a top-down 2D cyberpunk action RPG. Three-quarter top-down orthographic game asset, neon-noir industrial realism, worn materials, strong readable silhouette at small scale, magenta cyan amber practical lights, world-building detail, no readable text. Single object or tight object cluster, centered and isolated on plain black background, no people, no floor scene, no border. Match the reference asset's projection and palette while inventing a new design.`;
}

function moduleBrief(name) {
  const kind = name.includes("straight") ? "straight rail tunnel" : name.includes("junction") ? "branching rail junction" : name.includes("cross") ? "four-way rail crossing" : "subway station platform chamber";
  return `Seamless full-frame top-down environment plate for a cyberpunk action RPG: ${kind}. Orthographic overhead view, walkable dark concrete and rails clearly readable, neon-noir cyan magenta amber safety lighting, grime, leaks, cables, signage shapes without readable text, varied architectural storytelling, no people or creatures. Fill the square frame edge to edge, no border, no perspective horizon. Preserve a broad clear traversal lane through the module.`;
}

function interiorBrief(name) {
  const role = name.replace(/^hf_int_/, "").replace(/_room$/, "").replaceAll("_", " ");
  return `Full-frame orthographic top-down interior room for a cyberpunk action RPG: a distinct ${role}. Neon-noir industrial realism, magenta cyan amber practical lighting, believable lived-in clutter, one clear entrance centered on the south wall, broad connected walkable aisles, fixtures grouped cleanly against walls or as readable islands, no people, no labels, no readable text, no exterior view, no perspective horizon. Square room fills the frame edge to edge. Make collision silhouettes unambiguous at game scale.`;
}

function referenceFor(name) {
  if (name.startsWith("hf_building_dist_")) return `${OUT}/hf_building_dist_core.png`;
  if (name.startsWith("hf_building_")) return `${OUT}/hf_building_clinic.png`;
  if (name.startsWith("hf_subway_horror")) return `${OUT}/hf_enemy_platform_husk.png`;
  if (name.startsWith("hf_subway_")) return `${OUT}/hf_subway_booth.png`;
  if (name.includes("landmark")) return `${OUT}/hf_landmark_fountain.png`;
  if (name.includes("furniture")) return `${OUT}/hf_furn_terminal.png`;
  return `${OUT}/hf_prop_01.png`;
}

async function hf(args) {
  const { stdout } = await exec("higgsfield", args, { maxBuffer: 1024 * 1024, timeout: 25 * 60_000 });
  const url = stdout.split(/\s+/).findLast((s) => s.startsWith("http"));
  if (!url) throw new Error(`no Higgsfield result URL: ${stdout.slice(-180)}`);
  return url;
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

async function removeEdgeBackground(src, dest, isBuilding) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const cornerIds = [0, w - 1, (h - 1) * w, h * w - 1];
  const bg = [0, 1, 2].map((ch) => {
    const values = cornerIds.map((i) => data[i * c + ch]).sort((a, b) => a - b);
    return Math.round((values[1] + values[2]) / 2);
  });
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const background = (i) => {
    const p = i * c;
    const dr = data[p] - bg[0];
    const dg = data[p + 1] - bg[1];
    const db = data[p + 2] - bg[2];
    return dr * dr + dg * dg + db * db < 85 * 85;
  };
  const push = (i) => {
    if (!seen[i] && background(i)) { seen[i] = 1; queue[tail++] = i; }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i / w) | 0;
    if (x) push(i - 1);
    if (x + 1 < w) push(i + 1);
    if (y) push(i - w);
    if (y + 1 < h) push(i + w);
  }
  for (let i = 0; i < seen.length; i++) if (seen[i]) data[i * c + 3] = 0;
  await sharp(data, { raw: info })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({ width: isBuilding ? 768 : 384, height: isBuilding ? 768 : 384, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(dest);
}

async function createCutout(name) {
  const out = `${OUT}/${name}.png`;
  if (existsSync(out) && !REPROCESS) return { name, skipped: true };
  const raw = `${RAW}/${name}.raw.png`;
  if (REPROCESS && !existsSync(raw)) return { name, skipped: true };
  if (!existsSync(raw)) {
    const genUrl = await hf(["generate", "create", "nano_banana_flash", "--prompt", cutoutBrief(name), "--image", referenceFor(name), "--aspect_ratio", "1:1", "--resolution", "1k", "--wait", "--wait-timeout", "20m"]);
    await download(genUrl, raw);
  }
  const isBuilding = name.startsWith("hf_building_");
  await removeEdgeBackground(raw, out, isBuilding);
  return { name, skipped: false };
}

async function createModule(name) {
  const out = `${OUT}/${name}.png`;
  if (existsSync(out)) return { name, skipped: true };
  const url = await hf(["generate", "create", "nano_banana_flash", "--prompt", moduleBrief(name), "--image", `${OUT}/hf_subway_tunnel_junction.png`, "--aspect_ratio", "1:1", "--resolution", "1k", "--wait", "--wait-timeout", "20m"]);
  const raw = `${RAW}/${name}.raw.png`;
  await download(url, raw);
  await sharp(raw).resize(512, 512, { fit: "cover" }).png({ compressionLevel: 9 }).toFile(out);
  return { name, skipped: false };
}

async function createInterior(name) {
  const out = `${OUT}/${name}.png`;
  if (existsSync(out)) return { name, skipped: true };
  const url = await hf(["generate", "create", "nano_banana_flash", "--prompt", interiorBrief(name), "--image", `${OUT}/hf_int_noodle_room.png`, "--aspect_ratio", "1:1", "--resolution", "1k", "--wait", "--wait-timeout", "20m"]);
  const raw = `${RAW}/${name}.raw.png`;
  await download(url, raw);
  await sharp(raw).resize(576, 576, { fit: "cover" }).png({ compressionLevel: 9 }).toFile(out);
  return { name, skipped: false };
}

async function runPool(items) {
  let cursor = 0;
  let done = 0;
  let failed = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        const result = await item.run(item.name);
        done++;
        console.log(`${result.skipped ? "SKIP" : "OK  "} ${item.name} (${done + failed}/${items.length})`);
      } catch (error) {
        failed++;
        console.error(`FAIL ${item.name}: ${String(error?.message || error).slice(0, 220)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { done, failed };
}

await mkdir(RAW, { recursive: true });
const only = REPROCESS || process.argv.includes("--cutouts") ? "cutouts" : process.argv.includes("--modules") ? "modules" : "all";
const items = [
  ...(only !== "modules" ? CUTOUT_NAMES.map((name) => ({ name, run: createCutout })) : []),
  ...(only !== "cutouts" ? MODULE_NAMES.map((name) => ({ name, run: createModule })) : []),
  ...(only === "all" ? INTERIOR_NAMES.map((name) => ({ name, run: createInterior })) : []),
];
console.log(`Higgsfield expansion: ${items.length} assets, concurrency ${CONCURRENCY}, mode ${only}`);
const report = await runPool(items);
await writeFile(`${RAW}/report.json`, JSON.stringify({ at: new Date().toISOString(), only, ...report }, null, 2));
console.log(`complete: ${report.done} done/skipped, ${report.failed} failed`);
if (report.failed) process.exitCode = 1;
