// METROPHAGE — daily contracts + reputation: pure-data, Phaser-FREE, shared by server
// (authoritative grant) and client (display). Dailies are DAY-SEEDED so the whole server
// shares the same rotation each day; completing them grants credits + reputation, and the
// reputation track unlocks higher vendor tiers (see the SHOP repReq gates).

export type DailyObjective = "kill" | "capture" | "boss";

export interface DailyContract {
  id: string;
  name: string;
  desc: string;
  objective: DailyObjective;
  count: number;
  rewardCredits: number;
  rewardRep: number;
}

/** The guaranteed daily is always a kill bounty (rotating size) so there's a reliable
 *  on-ramp; the other two rotate from the wider pool. */
// Rewards slightly trimmed vs emit volume so contracts don't flood ₵ relative to sinks.
const KILL_DAILIES: DailyContract[] = [
  { id: "k_sweep_s", name: "STREET SWEEP", desc: "Purge 5 HSS units", objective: "kill", count: 5, rewardCredits: 91, rewardRep: 12 },
  { id: "k_sweep_m", name: "PURGE QUOTA", desc: "Purge 7 HSS units", objective: "kill", count: 7, rewardCredits: 130, rewardRep: 16 },
  { id: "k_sweep_l", name: "CULL ORDER", desc: "Purge 9 HSS units", objective: "kill", count: 9, rewardCredits: 172, rewardRep: 20 },
];

const POOL: DailyContract[] = [
  { id: "k_grind", name: "ATTRITION", desc: "Purge 25 HSS units", objective: "kill", count: 25, rewardCredits: 364, rewardRep: 30 },
  { id: "cap_2", name: "GROUND GAME", desc: "Capture 2 territory nodes", objective: "capture", count: 2, rewardCredits: 224, rewardRep: 22 },
  { id: "cap_4", name: "TERRITORIAL", desc: "Capture 4 territory nodes", objective: "capture", count: 4, rewardCredits: 406, rewardRep: 38 },
  { id: "boss_1", name: "DECAPITATION", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 504, rewardRep: 45 },
  { id: "k_elite", name: "DEEP PURGE", desc: "Purge 40 HSS units", objective: "kill", count: 40, rewardCredits: 616, rewardRep: 55 },
  { id: "k_docks", name: "TIDAL SWEEP", desc: "Purge 18 HSS in any district", objective: "kill", count: 18, rewardCredits: 266, rewardRep: 24 },
  { id: "cap_6", name: "DOMINION", desc: "Capture 6 territory nodes", objective: "capture", count: 6, rewardCredits: 560, rewardRep: 48 },
  { id: "boss_2", name: "DOUBLE DECAP", desc: "Fell 2 world bosses", objective: "boss", count: 2, rewardCredits: 840, rewardRep: 70 },
  { id: "k_wastes", name: "OUTER RING CULL", desc: "Purge 50 HSS units", objective: "kill", count: 50, rewardCredits: 735, rewardRep: 62 },
  { id: "cap_3", name: "TRI-NODE", desc: "Capture 3 territory nodes", objective: "capture", count: 3, rewardCredits: 315, rewardRep: 30 },
  // New rotation entries — more capture/boss mix so days don't feel samey.
  { id: "k_mid", name: "MIDTOWN CULL", desc: "Purge 15 HSS units", objective: "kill", count: 15, rewardCredits: 238, rewardRep: 22 },
  { id: "cap_1", name: "FOOT HOLD", desc: "Capture 1 territory node", objective: "capture", count: 1, rewardCredits: 126, rewardRep: 14 },
  { id: "boss_night", name: "NIGHT COMMAND", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 532, rewardRep: 48 },
  { id: "k_blitz", name: "BLITZ QUOTA", desc: "Purge 12 HSS units", objective: "kill", count: 12, rewardCredits: 203, rewardRep: 18 },
];

export const DAILY_COUNT = 3;

/** UTC day index — the seed that rotates the daily set for everyone, server-wide. */
export function currentDay(now = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

// small deterministic PRNG so a given day yields the same set on client + server
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The day's contract set: one guaranteed kill bounty + 2 rotating, deterministic by day. */
export function dailyContracts(day: number): DailyContract[] {
  const rnd = mulberry32(day * 2654435761);
  const guaranteed = KILL_DAILIES[Math.floor(rnd() * KILL_DAILIES.length)];
  const pool = [...POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [guaranteed, ...pool.slice(0, DAILY_COUNT - 1)];
}

const ALL_BY_ID = new Map<string, DailyContract>([...KILL_DAILIES, ...POOL].map((c) => [c.id, c]));
export function getDaily(id: string): DailyContract | undefined {
  return ALL_BY_ID.get(id);
}

// ── reputation ──────────────────────────────────────────────────────────
export interface RepTierDef {
  tier: number;
  name: string;
  min: number;
}
export const REP_TIERS: RepTierDef[] = [
  { tier: 0, name: "UNKNOWN", min: 0 },
  { tier: 1, name: "CONTACT", min: 250 },
  { tier: 2, name: "OPERATIVE", min: 800 },
  { tier: 3, name: "LIEUTENANT", min: 2000 },
  { tier: 4, name: "COMMANDER", min: 5000 },
];

export function repTier(rep: number): number {
  let t = 0;
  for (const r of REP_TIERS) if (rep >= r.min) t = r.tier;
  return t;
}
export function repTierName(rep: number): string {
  return REP_TIERS[repTier(rep)].name;
}
/** Current/next tier thresholds for a progress bar. */
export function repProgress(rep: number): { tier: number; name: string; cur: number; next: number; nextName: string } {
  const t = repTier(rep);
  const cur = REP_TIERS[t].min;
  const nextDef = REP_TIERS[t + 1];
  return { tier: t, name: REP_TIERS[t].name, cur, next: nextDef ? nextDef.min : cur, nextName: nextDef ? nextDef.name : "MAX" };
}
