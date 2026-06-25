// METROPHAGE — music track registry (data; the world owns the mood).
//
// One looping bed per environment. The MusicDirector crossfades between these;
// BootScene loads them via the asset manifest. The MP3s live in
// src/assets/music/ and are generated with ElevenLabs by tools/gen-music.mjs.
//
// Why src/ and not public/: Vite's import.meta.glob resolves the URL of every
// bed that ACTUALLY EXISTS on disk. Beds that haven't been generated yet simply
// don't appear — so nothing 404s / mis-decodes, and each missing environment
// falls back to the procedural Synth automatically (see MusicDirector.play).
// Dropping a generated mp3 into src/assets/music/ auto-registers it on reload —
// a zero-code upgrade.
//
// ⚠ Keep the `base` filenames here in sync with tools/gen-music.mjs.

export type MusicEnv =
  | "menu" // title / customize / prologue
  | "city" // overworld fast-travel hub
  | "subway" // inter-district transit
  | "dive" // ICE dive — cyberspace
  | "online" // multiplayer hub
  | "district_downtown" // Palantir Plaza — magenta, rain
  | "district_stacks" // Anduril Yards — yellow, smog, industrial
  | "district_spire" // Argus Spire — cyan, surveillance
  | "district_core" // The Kernel — red, embers, final
  | "meltdown"; // city meltdown climax

export interface MusicTrack {
  env: MusicEnv;
  /** Stable logical asset key (must match the manifest entry). */
  key: string;
  /** Source basename in src/assets/music/ (matches tools/gen-music.mjs output). */
  base: string;
  /** Bed level (0..1) BEFORE the user music/master sliders scale it. */
  gain: number;
  /** Build-time-resolved URL — present only if the mp3 exists; else undefined. */
  url?: string;
}

// basename -> resolved URL, for every bed that exists in src/assets/music/.
const RESOLVED: Record<string, string> = {};
for (const [p, url] of Object.entries(
  import.meta.glob("../assets/music/*.mp3", {
    eager: true,
    query: "?url",
    import: "default",
  }) as Record<string, string>,
)) {
  const base = p.split("/").pop();
  if (base) RESOLVED[base] = url;
}

const BASE_TRACKS: Omit<MusicTrack, "url">[] = [
  { env: "menu", key: "mus_menu", base: "menu.mp3", gain: 0.6 },
  { env: "city", key: "mus_city", base: "city.mp3", gain: 0.55 },
  { env: "subway", key: "mus_subway", base: "subway.mp3", gain: 0.55 },
  { env: "dive", key: "mus_dive", base: "dive.mp3", gain: 0.6 },
  { env: "online", key: "mus_online", base: "online.mp3", gain: 0.55 },
  { env: "district_downtown", key: "mus_downtown", base: "downtown.mp3", gain: 0.58 },
  { env: "district_stacks", key: "mus_stacks", base: "stacks.mp3", gain: 0.58 },
  { env: "district_spire", key: "mus_spire", base: "spire.mp3", gain: 0.58 },
  { env: "district_core", key: "mus_core", base: "core.mp3", gain: 0.62 },
  { env: "meltdown", key: "mus_meltdown", base: "meltdown.mp3", gain: 0.7 },
];

export const MUSIC_TRACKS: MusicTrack[] = BASE_TRACKS.map((t) => ({
  ...t,
  url: RESOLVED[t.base],
}));

export const MUSIC_BY_ENV: Record<MusicEnv, MusicTrack> = Object.fromEntries(
  MUSIC_TRACKS.map((t) => [t.env, t]),
) as Record<MusicEnv, MusicTrack>;

/** Map a campaign district id (DistrictDef.id) to its music environment. */
export function districtEnv(id: string): MusicEnv {
  switch (id) {
    case "stacks":
      return "district_stacks";
    case "spire":
      return "district_spire";
    case "core":
      return "district_core";
    default:
      return "district_downtown"; // downtown + any future / unknown id
  }
}
