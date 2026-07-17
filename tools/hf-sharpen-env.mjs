#!/usr/bin/env node
// METROPHAGE — sharpen environment art in place.
//
// WHY: the baked environment art is tiny (district kits are 141×224) but the world
// stretches it hard — a scenery block is an 8×7 design rect × DISTRICT_SCALE 3 = 24×21
// tiles = 768×672px, a ~5.4× blow-up, and buildingFacades/dressArtRoom filter LINEAR on
// top. That blur is missing pixels, not a filter setting, so no render tweak fixes it.
//
// PIPELINE, per asset:
//   1. bytedance_image_upscale → 2k   (composition preserved; ~1.1 credits)
//   2. re-composite the ORIGINAL alpha
//        ⚠ The upscaler returns RGB and DROPS the alpha channel. Shipping that would
//        paint every building as an opaque black rectangle over the world — the exact
//        "buildings are all black" bug. The composition is identical, so the original's
//        alpha mask still registers; scale it and put it back.
//   3. resize to SCALE× the ORIGINAL (the upscaler drifts a few % off-aspect) and save RGBA.
//        ⚠ Do NOT palette-quantise. It looked fine on a building (high-contrast neon on
//        transparency) and destroyed the room art (full-bleed, subtle dark gradients):
//        harsh banding + white speckle, visibly worse than the low-res original. Always
//        eyeball a full-bleed asset, not just a cutout, before trusting a size trick.
//
// Composition is preserved throughout, which is what keeps world/rooms.ts collision —
// traced from these images — still valid. Never regenerate room art with a prompt: an
// image-to-image "restyle" moves the fixtures and desyncs the walls from the picture.
//
// Usage: node tools/hf-sharpen-env.mjs <key> [<key>...]
//        node tools/hf-sharpen-env.mjs --dry <key>

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OBJ = "public/assets/objects";
const BACKUP = "tmp-art-backup";
// 3× clears every display size in the world (a room renders at ~480px from a ~180px
// source) without the oversampling 4× costs in bytes.
const SCALE = 3;

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const keys = args.filter((a) => !a.startsWith("--"));
if (!keys.length) {
  console.error("usage: node tools/hf-sharpen-env.mjs [--dry] <key>...");
  process.exit(1);
}

if (!dry) mkdirSync(BACKUP, { recursive: true });

const py = (src, up, out) => `
from PIL import Image
orig = Image.open(${JSON.stringify(src)}).convert("RGBA")
up   = Image.open(${JSON.stringify(up)}).convert("RGB")
target = (orig.width * ${SCALE}, orig.height * ${SCALE})
rgb   = up.resize(target, Image.LANCZOS)
alpha = orig.getchannel("A").resize(target, Image.LANCZOS)
im = rgb.copy(); im.putalpha(alpha)
im.save(${JSON.stringify(out)}, optimize=True)
print(target[0], target[1])
`;

let ok = 0;
let spent = 0;
for (const key of keys) {
  const src = join(OBJ, `${key}.png`);
  if (!existsSync(src)) {
    console.log(`SKIP  ${key} — no source PNG`);
    continue;
  }
  if (dry) {
    console.log(`would sharpen ${key}`);
    continue;
  }
  try {
    const abs = join(process.cwd(), src);
    const url = execFileSync(
      "higgsfield",
      ["generate", "create", "bytedance_image_upscale", "--image", abs, "--resolution", "2k", "--wait"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10 * 60_000 },
    )
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("http"))
      .pop();
    if (!url) throw new Error("no result url");
    spent += 1.1;

    const tmp = join(BACKUP, `${key}.up.png`);
    execFileSync("curl", ["-sL", url, "-o", tmp]);
    copyFileSync(src, join(BACKUP, `${key}.orig.png`)); // originals are git-tracked too
    const dims = execFileSync("python3", ["-c", py(src, tmp, src)], { encoding: "utf8" }).trim();
    console.log(`OK    ${key} → ${dims}`);
    ok++;
  } catch (e) {
    console.log(`FAIL  ${key} — ${String(e.message).slice(0, 90)}`);
  }
}
if (!dry) {
  writeFileSync(join(BACKUP, "_report.txt"), `sharpened ${ok}/${keys.length}, ~${spent.toFixed(1)} credits\n`);
  console.log(`\nsharpened ${ok}/${keys.length} · ~${spent.toFixed(1)} credits · originals in ${BACKUP}/`);
}
