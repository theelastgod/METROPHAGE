#!/usr/bin/env node
// METROPHAGE — generate the per-environment music beds with ElevenLabs Music.
//
// Build-time only. The API key never ships to the browser — only the resulting
// MP3s in src/assets/music/ are loaded at runtime (resolved by import.meta.glob;
// each falls back to the procedural Synth until it exists). Filenames mirror
// src/audio/musicTracks.ts.
//
// Key resolution: $ELEVENLABS_API_KEY, else the ELEVENLABS_API_KEY line in .env
// (gitignored) — same convention as tools/gen-vo.sh.
//
// Usage:
//   node tools/gen-music.mjs                 # generate every missing bed
//   node tools/gen-music.mjs --force         # regenerate all (overwrite)
//   node tools/gen-music.mjs menu dive core  # only these (by env name)
//   node tools/gen-music.mjs --model=music_v2
//
// Requires Node 18+ (global fetch).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "src/assets/music");
const ENDPOINT = "https://api.elevenlabs.io/v1/music";
const OUTPUT_FORMAT = "mp3_44100_128";

// One entry per environment. `file` basenames MUST match src/audio/musicTracks.ts.
// Prompts are instrumental, loopable beds tuned to each environment's mood/lore.
const TRACKS = [
  {
    env: "menu",
    file: "menu.mp3",
    lengthMs: 75000,
    prompt:
      "Dark cyberpunk synthwave main theme for a dystopian hacker-resistance game. " +
      "Brooding, cinematic, mysterious. Slow-building analog synth pads, a haunting " +
      "minor-key arpeggio, deep sub bass, distant industrial reverb. Neon-noir and " +
      "defiant — the calm before a revolution. Fully instrumental, seamless loop, ~80 BPM.",
  },
  {
    env: "city",
    file: "city.mp3",
    lengthMs: 80000,
    prompt:
      "Atmospheric cyberpunk ambient groove for roaming a rain-soaked neon megacity at " +
      "night. Mid-tempo darksynth, warm pulsing bassline, dreamy detuned synth leads, " +
      "soft arpeggios, faint rain and distant sirens. Contemplative but watchful. " +
      "Fully instrumental, seamless loop, ~95 BPM.",
  },
  {
    env: "subway",
    file: "subway.mp3",
    lengthMs: 70000,
    prompt:
      "Driving cyberpunk transit groove — riding a maglev through the underbelly of a " +
      "megacity. Hypnotic motorik pulse, propulsive sequenced bass, tight mechanical " +
      "percussion, a repeating synth ostinato, constant sense of forward motion. " +
      "Fully instrumental, seamless loop, ~110 BPM.",
  },
  {
    env: "dive",
    file: "dive.mp3",
    lengthMs: 80000,
    prompt:
      "Glitchy digital cyberspace combat music — diving into hostile ICE inside a hacked " +
      "mainframe. Fast skittering arpeggios, abstract granular textures, bit-crushed " +
      "distorted synths, urgent driving beat, datastream blips, claustrophobic and " +
      "intense. Fully instrumental, seamless loop, ~130 BPM.",
  },
  {
    env: "online",
    file: "online.mp3",
    lengthMs: 75000,
    prompt:
      "Defiant cyberpunk anthem for an online resistance — many free minds fighting the " +
      "corporations together. Uplifting yet dark synthwave: a soaring lead melody over a " +
      "steady four-on-the-floor pulse, hopeful, communal, electric. " +
      "Fully instrumental, seamless loop, ~118 BPM.",
  },
  {
    env: "district_downtown",
    file: "downtown.mp3",
    lengthMs: 85000,
    prompt:
      "Neon-noir cyberpunk combat groove in a rain-drenched downtown plaza ruled by a " +
      "predictive-policing AI. Magenta-lit, brooding mid-tempo darksynth, gritty saw " +
      "bass, tense detuned leads, rainfall and the drone of surveillance. Dangerous but " +
      "stylish. Fully instrumental, seamless loop, ~100 BPM.",
  },
  {
    env: "district_stacks",
    file: "stacks.mp3",
    lengthMs: 85000,
    prompt:
      "Heavy industrial cyberpunk music inside an automated drone-weapon foundry choked " +
      "with yellow smog. Clanking metallic percussion, grinding distorted bass, " +
      "mechanical rhythms, harsh factory textures, ominous low synth-brass. Oppressive " +
      "and relentless. Fully instrumental, seamless loop, ~108 BPM.",
  },
  {
    env: "district_spire",
    file: "spire.mp3",
    lengthMs: 85000,
    prompt:
      "Cold corporate cyberpunk surveillance music inside a towering glass spire of a " +
      "total-awareness AI. Glassy crystalline synths, icy cyan ambience, sterile pulsing " +
      "arpeggios, watchful tension, elegant menace — clinical and paranoid. " +
      "Fully instrumental, seamless loop, ~104 BPM.",
  },
  {
    env: "district_core",
    file: "core.mp3",
    lengthMs: 90000,
    prompt:
      "Climactic boss-fortress cyberpunk music at the burning red heart of the master AI " +
      "grid. Apocalyptic and intense: blaring distorted leads, pounding war drums, " +
      "dread-filled choir-synth swells, falling embers, the final assault. Epic and " +
      "terrifying. Fully instrumental, seamless loop, ~118 BPM.",
  },
  {
    env: "meltdown",
    file: "meltdown.mp3",
    lengthMs: 50000,
    prompt:
      "Cataclysmic cyberpunk meltdown finale — the entire human-security AI system " +
      "collapses and the city accelerates past escape velocity. Overwhelming rising " +
      "synth sirens, a distorted euphoric-yet-terrifying climax, glitching breakdown, " +
      "triumphant and catastrophic. Fully instrumental, ~85 BPM.",
  },
];

function readKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  try {
    const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith("ELEVENLABS_API_KEY="));
    if (line) return line.slice("ELEVENLABS_API_KEY=".length).trim();
  } catch {
    /* no .env */
  }
  return "";
}

function parseArgs(argv) {
  const flags = { force: false, model: "music_v1" };
  const only = [];
  for (const a of argv) {
    if (a === "--force") flags.force = true;
    else if (a.startsWith("--model=")) flags.model = a.slice("--model=".length);
    else if (!a.startsWith("--")) only.push(a);
  }
  return { flags, only };
}

async function generate(track, key, model) {
  const out = path.join(OUT_DIR, track.file);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 240_000); // music gen can be slow
  try {
    const res = await fetch(`${ENDPOINT}?output_format=${OUTPUT_FORMAT}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: track.prompt,
        music_length_ms: track.lengthMs,
        model_id: model,
        force_instrumental: true,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, detail: text };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return { ok: false, status: res.status, detail: "suspiciously tiny payload" };
    fs.writeFileSync(out, buf);
    return { ok: true, bytes: buf.length };
  } catch (e) {
    return { ok: false, status: 0, detail: e?.name === "AbortError" ? "timed out (240s)" : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const key = readKey();
  if (!key) {
    console.error("✘ No ELEVENLABS_API_KEY (checked $ELEVENLABS_API_KEY and .env). Aborting.");
    process.exit(1);
  }
  const { flags, only } = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let queue = TRACKS;
  if (only.length) {
    queue = TRACKS.filter((t) => only.includes(t.env) || only.includes(t.file.replace(/\.mp3$/, "")));
    const known = new Set(TRACKS.map((t) => t.env));
    for (const name of only) if (!known.has(name) && !TRACKS.some((t) => t.file.replace(/\.mp3$/, "") === name))
      console.warn(`⚠ unknown env "${name}" — skipped`);
  }

  console.log(`♪ METROPHAGE music — model=${flags.model}, ${queue.length} track(s) → src/assets/music/\n`);
  let made = 0;
  let skipped = 0;
  let failed = 0;
  for (const track of queue) {
    const out = path.join(OUT_DIR, track.file);
    if (fs.existsSync(out) && !flags.force) {
      console.log(`• ${track.env.padEnd(18)} skip (exists — use --force to redo)`);
      skipped++;
      continue;
    }
    process.stdout.write(`• ${track.env.padEnd(18)} generating ${(track.lengthMs / 1000) | 0}s … `);
    const r = await generate(track, key, flags.model);
    if (r.ok) {
      console.log(`ok (${(r.bytes / 1024).toFixed(0)} KB)`);
      made++;
    } else {
      failed++;
      console.log(`FAILED (HTTP ${r.status})`);
      if (/payment_issue|payment_required/i.test(r.detail)) {
        console.error(
          "\n✘ ElevenLabs reports a billing problem on this account — clear the invoice at\n" +
            "  https://elevenlabs.io/app/settings/billing then re-run. Stopping early.\n",
        );
        break;
      }
      if (r.detail) console.error(`    ↳ ${r.detail.slice(0, 300)}`);
    }
  }
  console.log(`\nDone — ${made} made, ${skipped} skipped, ${failed} failed.`);
  process.exit(failed && !made ? 1 : 0);
}

main();
