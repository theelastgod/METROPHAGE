// METROPHAGE — dynamic world events (data-driven). Per-district, telegraphed then
// triggered phenomena that shift the district and reward participation, keyed to
// Heat / Singularity. The WorldEvents scheduler picks one, warns, runs it, pays
// out; GameScene implements the actual effects (WorldEventHost).

export type WorldEventId =
  | "neon_storm"
  | "blackout"
  | "purge_wave"
  | "contagion_outbreak"
  | "heat_spike"
  | "repo_siren"
  | "market_glitch";

export interface WorldEventDef {
  id: WorldEventId;
  name: string;
  tagline: string; // shown under the warning
  color: number;
  hex: string;
  telegraphMs: number; // warning window before it triggers
  durationMs: number; // active phase length
  minHeatNorm: number; // gate: only eligible at/above this Heat (0..1)
  weight: number; // relative pick weight among eligible events
  reward: { xp: number; currency: number };
}

export const WORLD_EVENTS: WorldEventDef[] = [
  {
    id: "neon_storm",
    name: "NEON STORM",
    tagline: "lightning floods the grid — keep moving",
    color: 0x8a5cff,
    hex: "#8a5cff",
    telegraphMs: 2600,
    durationMs: 11000,
    minHeatNorm: 0,
    weight: 1,
    reward: { xp: 55, currency: 22 },
  },
  {
    id: "blackout",
    name: "BLACKOUT",
    tagline: "the district goes dark",
    color: 0x29e7ff,
    hex: "#29e7ff",
    telegraphMs: 2400,
    durationMs: 10000,
    minHeatNorm: 0,
    weight: 0.8,
    reward: { xp: 45, currency: 19 },
  },
  {
    id: "purge_wave",
    name: "REPO PURGE WAVE",
    tagline: "corp reinforcements inbound",
    color: 0xff3b6b,
    hex: "#ff3b6b",
    telegraphMs: 2800,
    durationMs: 9000,
    minHeatNorm: 0.35, // only when the district is already hot
    weight: 1.1,
    reward: { xp: 75, currency: 33 },
  },
  {
    id: "contagion_outbreak",
    name: "CONTAGION OUTBREAK",
    tagline: "the infection accelerates",
    color: 0x39ff88,
    hex: "#39ff88",
    telegraphMs: 2400,
    durationMs: 10000,
    minHeatNorm: 0,
    weight: 0.9,
    reward: { xp: 55, currency: 22 },
  },
  {
    id: "heat_spike",
    name: "HEAT SPIKE",
    tagline: "ult meters climb — the district wants blood",
    color: 0xff9d3c,
    hex: "#ff9d3c",
    telegraphMs: 2200,
    durationMs: 12000,
    minHeatNorm: 0.15,
    weight: 1,
    reward: { xp: 50, currency: 25 },
  },
  {
    id: "repo_siren",
    name: "REPO SIREN",
    tagline: "HSS dens spawn denser — stay loud or die quiet",
    color: 0xff3b6b,
    hex: "#ff3b6b",
    telegraphMs: 3000,
    durationMs: 14000,
    minHeatNorm: 0.2,
    weight: 0.95,
    reward: { xp: 70, currency: 30 },
  },
  {
    id: "market_glitch",
    name: "MARKET GLITCH",
    tagline: "vendor caches feel cheap for a window — spend or regret",
    color: 0xf7ff3c,
    hex: "#f7ff3c",
    telegraphMs: 2000,
    durationMs: 16000,
    minHeatNorm: 0,
    weight: 0.7,
    reward: { xp: 40, currency: 16 },
  },
];

export function getWorldEvent(id: WorldEventId): WorldEventDef {
  return WORLD_EVENTS.find((e) => e.id === id) ?? WORLD_EVENTS[0];
}
