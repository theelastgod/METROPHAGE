#!/usr/bin/env node
// Final 20-credit Nano Banana 2 batch: 13 × 1.5 credits = 19.5.
// Resumable: existing files skip. Raw sheets are processed separately.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const exec = promisify(execFile);
const RAW = "tmp-art-backup/hf-web-2026-07-16/final-credit-raw";
await mkdir(RAW, { recursive: true });
await mkdir("public/assets/portraits/interact", { recursive: true });
await mkdir("public/assets/ui", { recursive: true });

const commonPortrait = "Square dialogue portrait for METROPHAGE, a neon-noir cyberpunk action RPG. Bust from chest upward, dark simple location background, strong readable silhouette, painterly high-detail game portrait, grounded industrial cyberpunk realism, restrained cyan magenta and amber practical lighting. No text, logo, watermark, extra people, fashion photography, or weapon aimed at camera. ";
const jobs = [
  {
    file: `${RAW}/13_interior_floor_atlas.png`, aspect: "1:1", ref: "public/assets/objects/hf_int_layout_studio.png",
    prompt: "A precise 4 by 4 directly overhead game-texture atlas containing sixteen cyberpunk interior floor materials in exact row-major order: capsule hotel floor, underground clinic floor, pawn-shop floor, arcade floor; garage workshop floor, pirate-radio studio floor, noodle-shop floor, dive-bar floor; guild hall floor, residential tenement floor, civic office floor, subway ticket-hall floor; stadium floor, secure storage floor, generic backroom floor, neutral interior transition floor. Exactly sixteen equal square cells containing flat floor material only. No furniture, counters, people, walls, doors, standing props, readable text, letters, numbers, or logos. Each cell internally seamless. Directly overhead orthographic texture, sharp worn industrial detail, restrained cyan magenta and amber lighting."
  },
  {
    file: `${RAW}/service_quest_icons.png`, aspect: "1:1", ref: "public/assets/icons/MEDKIT.png",
    prompt: "A clean 4 by 4 sprite sheet containing sixteen distinct cyberpunk action-RPG service and quest icons in exact row-major order: hotel sleep pod crescent, medical healing cross, pawn trade scales, garage repair wrench; arcade leaderboard trophy, radio contract antenna, quest pickup case, bounty target reticle; neural implant, armor plate, weapon upgrade module, credit chips; police heat warning beacon, subway token, district map marker, boss-alert skull. Exactly sixteen separate emblematic objects, one centered per equal grid cell, generous empty margin, no overlaps, people, scene, letters, numbers, readable text, logos, borders or watermarks. Sharp high-contrast worn-metal neon-noir UI icons, cyan magenta amber accents, readable at 32 pixels, pure solid black background, no visible grid lines or connecting shadows."
  },
  {
    file: `${RAW}/business_interior_props.png`, aspect: "1:1", ref: "public/assets/objects/hf_furn_terminal.png",
    prompt: "A clean 4 by 4 sprite sheet containing sixteen distinct top-down orthographic cyberpunk business props in exact row-major order: surgical chair, scanner arm, implant cabinet, organ cooler; appraisal scanner, locked display case, arcade cabinet, neural VR chair; vehicle lift, engine block, welding station, drone repair cradle; broadcast mixing console, transmitter rack, hotel sleep pod, reception terminal. Exactly sixteen separate objects, one centered per equal grid cell, generous empty margin, no overlaps, people, room, floor scene, horizon, letters, numbers, readable text, borders or watermarks. Consistent sharp three-quarter top-down game-asset projection, worn industrial detail, cyan magenta amber practical lights, pure solid black background, no grid lines or connecting shadows."
  },
  {
    file: `${RAW}/subway_identity_props.png`, aspect: "1:1", ref: "public/assets/objects/hf_subway_booth.png",
    prompt: "A clean 4 by 4 sprite sheet containing sixteen distinct top-down orthographic cyberpunk subway identity props in exact row-major order: abandoned ticket shrine, flooded platform pump, sealed quarantine gate, signal-control altar; scavenger camp without people, collapsed escalator mouth, memorial platform marker, maintenance-train nose; empty route-map frame, warning-light cluster, cable bundle, ventilation fan; dripping pipe manifold, emergency cabinet, signal repeater, locked service hatch. Exactly sixteen separate objects, one centered per equal grid cell, generous empty margin, no overlaps, people, creatures, room, floor scene, horizon, letters, numbers, readable text, borders or watermarks. Sharp grimy underground industrial game assets, cyan magenta amber safety lights, pure solid black background, no grid lines or connecting shadows."
  },
  { file: "public/assets/portraits/interact/keep_hotel.jpg", aspect: "1:1", ref: "public/assets/portraits/keepers_sheet.jpg", prompt: commonPortrait + "A tired but alert adult capsule-hotel night clerk, androgynous, practical dark uniform, subtle cranial interface, guarded but sympathetic expression, warm amber desk light with cyan neon." },
  { file: "public/assets/portraits/interact/keep_ripperdoc.jpg", aspect: "1:1", ref: "public/assets/portraits/keepers_sheet.jpg", prompt: commonPortrait + "An experienced adult underground ripperdoc, observant expression, practical surgical clothing, magnifying cybernetic eye implant, worn gloves, compassionate but unsentimental, sterile cyan clinic light." },
  { file: "public/assets/portraits/interact/keep_pawn.jpg", aspect: "1:1", ref: "public/assets/portraits/keepers_sheet.jpg", prompt: commonPortrait + "A wary adult pawn broker and salvage appraiser, layered street clothing, monocular appraisal implant, calculating expression with dry humor, amber counter light and cyan rim light." },
  { file: "public/assets/portraits/interact/keep_garage.jpg", aspect: "1:1", ref: "public/assets/portraits/keepers_sheet.jpg", prompt: commonPortrait + "An adult underground mechanic and drone engineer, oil-stained work jacket, goggles pushed upward, small cybernetic tool interface, confident impatient expression, welding amber light and cyan rim light." },
  { file: "public/assets/portraits/interact/keep_arcade.jpg", aspect: "1:1", ref: "public/assets/portraits/keepers_sheet.jpg", prompt: commonPortrait + "An adult underground arcade operator and leaderboard fixer, practical retro-tech jacket, subtle neural gaming ports, lively mischievous expression, colorful cabinet glow, grounded realism rather than anime." },
  { file: "public/assets/portraits/interact/keep_radio.jpg", aspect: "1:1", ref: "public/assets/portraits/keepers_sheet.jpg", prompt: commonPortrait + "An adult pirate-radio host and contract broker, worn broadcast headset, compact throat microphone, layered dark street clothing, intense conspiratorial expression, magenta studio and cyan signal-monitor light." },
  {
    file: "public/assets/ui/hf_loading_early_city.png", aspect: "16:9", ref: "public/assets/ui/menu_bg.jpg",
    prompt: "Cinematic wide loading-screen illustration for METROPHAGE, a top-down neon-noir cyberpunk action RPG. Rain-soaked inhabited district from a high three-quarter overhead angle: dense patched buildings, noodle carts, holographic navigation markers, generators, rooftop water systems, narrow wet streets and distant elevated rail, cyan magenta neon and warm amber human-scale lights. Dangerous but lived in, clear routes, layered world-building. No dominant person, readable text, logo, title or watermark. Upper-left visually calm for real UI text. Sharp detailed game key art, not photography."
  },
  {
    file: "public/assets/ui/hf_loading_subway.png", aspect: "16:9", ref: "public/assets/objects/hf_subway_platform_deep.png",
    prompt: "Cinematic wide loading-screen illustration for METROPHAGE. Immense abandoned underground rail station from a high three-quarter overhead angle: flooded platform edges, dead maintenance train, damaged signals, quarantine gate, cable bundles, distant infected glow, clear traversal path through center, cyan emergency lights, magenta contamination glow, amber maintenance lamps. Tense environmental storytelling without clearly showing a creature. No readable text, logos, title, watermark or close figures. Upper-left calm for UI text. Sharp detailed game key art."
  },
  {
    file: "public/assets/ui/hf_loading_hotel.png", aspect: "16:9", ref: "public/assets/objects/hf_int_hotel_room.png",
    prompt: "Cinematic wide loading-screen illustration for METROPHAGE. Secure inexpensive cyberpunk capsule hotel from a high three-quarter overhead angle: reception desk left, reinforced sleep pods right, luggage cage, vending and medical dispensers, worn clean floor, warm amber safety lights with cyan and magenta neon. Quiet refuge from a dangerous city, industrial and slightly uneasy. No people, readable text, logos, title or watermark. Upper-left calm for UI text. Sharp detailed game key art."
  },
];

async function run(job, index) {
  if (existsSync(job.file)) return console.log(`SKIP ${index + 1}/${jobs.length} ${job.file}`);
  const args = ["generate", "create", "nano_banana_flash", "--prompt", job.prompt, "--image", job.ref, "--aspect_ratio", job.aspect, "--resolution", "1k", "--wait", "--wait-timeout", "20m"];
  const { stdout } = await exec("higgsfield", args, { maxBuffer: 1024 * 1024, timeout: 25 * 60_000 });
  const url = stdout.split(/\s+/).findLast((s) => s.startsWith("http"));
  if (!url) throw new Error(`no result URL for ${job.file}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download ${response.status} for ${job.file}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (job.file.endsWith(".jpg")) {
    const sharp = (await import("sharp")).default;
    await sharp(bytes).resize(512, 512, { fit: "cover" }).jpeg({ quality: 92, mozjpeg: true }).toFile(job.file);
  } else {
    await writeFile(job.file, bytes);
  }
  console.log(`DONE ${index + 1}/${jobs.length} ${job.file}`);
}

let cursor = 0;
const workers = Array.from({ length: 4 }, async () => {
  while (cursor < jobs.length) {
    const index = cursor++;
    try { await run(jobs[index], index); }
    catch (error) { console.error(`FAIL ${index + 1}/${jobs.length} ${jobs[index].file}: ${error.message}`); }
  }
});
await Promise.all(workers);
