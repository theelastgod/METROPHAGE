// METROPHAGE — music track registry (data; the world owns the mood).
//
// One looping bed per environment. The MusicDirector crossfades between these;
// BootScene loads them via the asset manifest. The audio lives in src/assets/music/.
//
// Beds can come from EITHER generator (both write to src/assets/music/):
//   • tools/gen-music-local.mjs — offline, zero-dependency synth → <stem>.wav
//   • tools/gen-music.mjs       — ElevenLabs → <stem>.mp3 (optional upgrade)
//
// Resolution is by filename STEM across any audio extension (Vite import.meta.glob),
// so a bed is matched whatever format it's in — and only beds that ACTUALLY EXIST
// are referenced (nothing 404s / mis-decodes). Any missing environment falls back to
// the procedural Synth (see MusicDirector.play). If both an mp3 and a wav exist for a
// stem, the mp3 (the ElevenLabs upgrade) wins — see EXT_PREF.
//
// ⚠ Keep the `stem` names here in sync with the two generators.

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
  /** Source basename without extension in src/assets/music/ (matches the generators). */
  stem: string;
  /** Bed level (0..1) BEFORE the user music/master sliders scale it. */
  gain: number;
  /** Build-time-resolved URL — present only if a matching file exists; else undefined. */
  url?: string;
}

// Lower index = preferred when several formats exist for one stem.
const EXT_PREF = ["mp3", "ogg", "m4a", "wav"];

// stem -> resolved URL, for every bed file that exists in src/assets/music/.
const RESOLVED: Record<string, string> = {};
const RESOLVED_EXT: Record<string, number> = {};
for (const [p, url] of Object.entries(
  import.meta.glob("../assets/music/*.{mp3,ogg,m4a,wav}", {
    eager: true,
    query: "?url",
    import: "default",
  }) as Record<string, string>,
)) {
  const file = p.split("/").pop() ?? "";
  const dot = file.lastIndexOf(".");
  const stem = file.slice(0, dot);
  const ext = file.slice(dot + 1).toLowerCase();
  const pref = EXT_PREF.indexOf(ext);
  if (pref < 0) continue;
  if (!(stem in RESOLVED) || pref < RESOLVED_EXT[stem]) {
    RESOLVED[stem] = url;
    RESOLVED_EXT[stem] = pref;
  }
}

const BASE_TRACKS: Omit<MusicTrack, "url">[] = [
  { env: "menu", key: "mus_menu", stem: "menu", gain: 0.6 },
  { env: "city", key: "mus_city", stem: "city", gain: 0.55 },
  { env: "subway", key: "mus_subway", stem: "subway", gain: 0.55 },
  { env: "dive", key: "mus_dive", stem: "dive", gain: 0.6 },
  { env: "online", key: "mus_online", stem: "online", gain: 0.55 },
  { env: "district_downtown", key: "mus_downtown", stem: "downtown", gain: 0.58 },
  { env: "district_stacks", key: "mus_stacks", stem: "stacks", gain: 0.58 },
  { env: "district_spire", key: "mus_spire", stem: "spire", gain: 0.58 },
  { env: "district_core", key: "mus_core", stem: "core", gain: 0.62 },
  { env: "meltdown", key: "mus_meltdown", stem: "meltdown", gain: 0.7 },
];

export const MUSIC_TRACKS: MusicTrack[] = BASE_TRACKS.map((t) => ({
  ...t,
  url: RESOLVED[t.stem],
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
