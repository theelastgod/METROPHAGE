// METROPHAGE — daily district conditions + the HIGH-VALUE TARGET rota. Deterministic
// per (district, day) so every client and the server agree without any sync: the city
// plays differently each day, and every district hides one named bounty elite.
// Pure data + math; imported by the Worker (stat/credit application) and the client
// (map blurbs / flavour).

export interface DistrictMod {
  id: string;
  name: string;
  blurb: string; // one-liner for the map + the arrival sys message
  enemyHpMult: number;
  enemySpeedMult: number;
  creditMult: number; // kill-credit multiplier while the condition holds
}

export const DISTRICT_MODS: DistrictMod[] = [
  { id: "surge", name: "SURGE PRICING", blurb: "corp bounties pay fat today — the garrison knows it", enemyHpMult: 1.1, enemySpeedMult: 1, creditMult: 1.5 },
  { id: "lockdown", name: "LOCKDOWN", blurb: "double plating on every unit; hazard pay to match", enemyHpMult: 1.35, enemySpeedMult: 1, creditMult: 1.3 },
  { id: "ghostgrid", name: "GHOST GRID", blurb: "units run silent and fast — keep your head moving", enemyHpMult: 1, enemySpeedMult: 1.2, creditMult: 1.25 },
  { id: "overclock", name: "OVERCLOCK", blurb: "everything runs hot, both ways", enemyHpMult: 1.15, enemySpeedMult: 1.15, creditMult: 1.4 },
  { id: "brownout", name: "BROWNOUT", blurb: "half the grid is asleep — easy pickings, light pay", enemyHpMult: 0.85, enemySpeedMult: 1, creditMult: 0.9 },
];

/** UTC day index — the rotation clock. */
export const dayIndex = (now = Date.now()): number => Math.floor(now / 86_400_000);

/** Today's condition for a district (deterministic client+server). */
export function dailyDistrictMod(district: number, day = dayIndex()): DistrictMod {
  return DISTRICT_MODS[(((district * 5 + day) % DISTRICT_MODS.length) + DISTRICT_MODS.length) % DISTRICT_MODS.length];
}

// ── HIGH-VALUE TARGET ────────────────────────────────────────────────────────
/** Payout multiplier for downing the day's HVT (credits + XP). */
export const HVT_BOUNTY_MULT = 25;
/** HP multiplier applied when a garrison unit is promoted to the day's HVT. */
export const HVT_HP_MULT = 4;
/** The HVT's aura/label colour — bounty gold. */
export const HVT_TINT = 0xffd24a;

const HVT_CALLSIGNS = [
  "SIGMA-7",
  "NULL PRIEST",
  "CINDER-9",
  "THE AUDITOR",
  "KESTREL",
  "MANTIS-3",
  "LOWLIGHT",
  "THE NOTARY",
  "HALFLIFE",
  "VELVET GLOVE",
  "TITHE",
  "STATIC SAINT",
];

/** Today's named bounty for a district. */
export function hvtCallsign(district: number, day = dayIndex()): string {
  return HVT_CALLSIGNS[(((district * 7 + day) % HVT_CALLSIGNS.length) + HVT_CALLSIGNS.length) % HVT_CALLSIGNS.length];
}
