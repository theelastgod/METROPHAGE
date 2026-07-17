// METROPHAGE — durable contact trust + district standing.
//
// Values live in the existing additive player_stats ledger. This module owns the
// bounded key format, tiers, and authored disclosures so the Worker and client
// interpret the same state. Phaser/DOM-free.

import { DISTRICTS } from "./districts";

export type RelationshipTier = 0 | 1 | 2 | 3;

export interface RelationshipTierDef {
  tier: RelationshipTier;
  name: string;
  jobs: number;
}

export const RELATIONSHIP_TIERS: readonly RelationshipTierDef[] = [
  { tier: 0, name: "STRANGER", jobs: 0 },
  { tier: 1, name: "KNOWN", jobs: 0 },
  { tier: 2, name: "TRUSTED", jobs: 1 },
  { tier: 3, name: "CONFIDANT", jobs: 3 },
];

export const MAX_RELATIONSHIP_JOBS = 3;
export const MAX_DISTRICT_STANDING = 200;

export function safeRelationshipNpcId(npcId: string): string {
  return (npcId || "").replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, 48);
}

export const relationshipTalkKey = (npcId: string): string => `rel_t_${safeRelationshipNpcId(npcId)}`;
export const relationshipJobsKey = (npcId: string): string => `rel_j_${safeRelationshipNpcId(npcId)}`;
export const districtStandingKey = (district: number): string => `local_d${Math.max(0, Math.floor(district) || 0)}`;

export function relationshipTier(talked: number, jobs: number): RelationshipTier {
  if (jobs >= 3) return 3;
  if (jobs >= 1) return 2;
  if (talked >= 1) return 1;
  return 0;
}

export function relationshipTierName(tier: number): string {
  return RELATIONSHIP_TIERS[Math.max(0, Math.min(3, Math.floor(tier) || 0))].name;
}

export function relationshipTrust(stats: Record<string, number>, npcId: string): RelationshipTier {
  return relationshipTier(stats[relationshipTalkKey(npcId)] ?? 0, stats[relationshipJobsKey(npcId)] ?? 0);
}

/** Compact wire view: only contacts the player has actually met are included. */
export function relationshipSnapshot(stats: Record<string, number>): Record<string, RelationshipTier> {
  const ids = new Set<string>();
  for (const key of Object.keys(stats)) {
    if (key.startsWith("rel_t_")) ids.add(key.slice(6));
    else if (key.startsWith("rel_j_")) ids.add(key.slice(6));
  }
  const out: Record<string, RelationshipTier> = {};
  for (const id of ids) {
    const trust = relationshipTrust(stats, id);
    if (trust > 0) out[id] = trust;
  }
  return out;
}

export interface DistrictStandingTierDef {
  tier: number;
  name: string;
  min: number;
}

export const DISTRICT_STANDING_TIERS: readonly DistrictStandingTierDef[] = [
  { tier: 0, name: "UNKNOWN", min: 0 },
  { tier: 1, name: "NEIGHBOR", min: 20 },
  { tier: 2, name: "ANCHOR", min: 60 },
  { tier: 3, name: "KEEPER", min: 140 },
];

export function districtStandingTier(value: number): DistrictStandingTierDef {
  const n = Math.max(0, Number(value) || 0);
  let found = DISTRICT_STANDING_TIERS[0];
  for (const tier of DISTRICT_STANDING_TIERS) if (n >= tier.min) found = tier;
  return found;
}

export function districtStandingSnapshot(stats: Record<string, number>): number[] {
  return DISTRICTS.map((_, district) =>
    Math.max(0, Math.min(MAX_DISTRICT_STANDING, Math.floor(stats[districtStandingKey(district)] ?? 0))),
  );
}

export function districtStandingSummary(district: number, value: number): string {
  const tier = districtStandingTier(value);
  const next = DISTRICT_STANDING_TIERS[tier.tier + 1];
  const progress = next ? `${Math.max(0, Math.floor(value))}/${next.min} → ${next.name}` : `${Math.floor(value)} · MAX`;
  return `LOCAL STANDING: ${tier.name} (${progress}) in ${DISTRICTS[district]?.name ?? `district ${district}`}.`;
}

type DisclosureSet = readonly [string, string, string];

/**
 * Recognition, trust, confession. These disclose character and setting; they do
 * not grant stats or gate core access. Unknown contacts use the generic ladder.
 */
const DISCLOSURES: Readonly<Record<string, DisclosureSet>> = {
  rin: [
    "You came back with the route clear. Most runners come back with excuses.",
    "Those crates aren't weapons. They're names—paper copies, because the grid can't repossess paper yet.",
    "I was a manifest clerk before I was RIN. Three people I marked as cargo still send me birthday messages.",
  ],
  doc: [
    "I remember your blood type now. That's not intimacy in this city, but it's close.",
    "The clinic keeps one bed empty for a mind that wakes before its body does.",
    "I helped design REISSUE triage. I told myself a clean memory was kinder than a broken one. I was wrong.",
  ],
  vex: [
    "Your work checks out. That makes you rarer than good information.",
    "I sell secrets to fund witnesses. The expensive lies keep the cheap truths alive.",
    "My real ledger is a list of everyone I couldn't move before Blackwater sealed the quay.",
  ],
  marek: [
    "You hold your ground when nobody's scoring it. I notice that.",
    "The old war never ended. They just taught the occupation to call itself customer service.",
    "I had a daughter in the first Blank cohort. Every new runner has her pause before they lie.",
  ],
  juno: [
    "You clear roads. Couriers remember people who make distance possible.",
    "Half my packages are letters to people the registry says never existed.",
    "JUNO is a route name. The person who started it died. We all answer so the route stays alive.",
  ],
  sable: [
    "First drink's still not free. The chair is, which is worth more.",
    "I keep the bar loud so people can confess without a clean recording.",
    "The Feral Cat was a holding cell. The counter is the old booking desk. Nobody drinks alone in a cage now.",
  ],
  kessler: [
    "You finish what you sign. A Cell can build around that.",
    "Guild ranks are theater. Shared risk is the only promotion I trust.",
    "I dissolved my first Cell after its officers started pricing protection. I still carry every member's tag.",
  ],
  mira: [
    "You bring stock back alive. That's the kind of supplier I remember.",
    "The stall's margins pay three families whose names can't touch a bank account.",
    "Every sealed cache has one item I never sell: proof of who made it before the factory erased the shift.",
  ],
  ghost: [
    "You can close a name without turning it into a story. Useful.",
    "The quiet ledger isn't a kill list. It's everyone the HSS paid to make disappear—and what they were paid.",
    "GHOST was my target. I found them, heard them out, and buried my own name instead.",
  ],
  porter: [
    "A clear pier buys more trust than a clean manifest.",
    "Berth Zero unloads people, never freight. The cranes pretend not to see.",
    "I signed the manifest that drowned my brother. Every boat I move now is an amendment.",
  ],
  tunnel_rat: [
    "You brought light back and didn't ask what it illuminated.",
    "The station voices know your footsteps now. They pronounce you differently when you're hurt.",
    "There are no ghosts below—only workers whose termination orders reached payroll before their minds.",
  ],
  scrap_boss: [
    "You kill the machine and leave the useful pieces. Respectable.",
    "The yard builds prosthetics at night. Same steel as the hunters; better instructions.",
    "I wore an Anduril foreman rig during the strike. The workers spared me. I have been paying interest since.",
  ],
  preacher: [
    "You listen after the warning. Most only listen after the fire.",
    "The Singularity isn't a god. It's the moment ownership runs out of definitions.",
    "I preached REISSUE once. Called forgetting a resurrection. Some of my congregation believed me all the way into the chair.",
  ],
  subway_warden: [
    "You came back above the line. I can write that in ink.",
    "The arrival board adds a station whenever someone remembers a buried neighborhood.",
    "I don't log runners going down. I log the voices that come back wearing them.",
  ],
};

export function relationshipLine(npcId: string, displayName: string, trust: number, _variation = 0): string | null {
  const tier = Math.max(0, Math.min(3, Math.floor(trust) || 0));
  if (tier <= 0) return null;
  const set = DISCLOSURES[npcId];
  if (set) return `${displayName}: ${set[tier - 1]}`;
  const generic: DisclosureSet = [
    "You came back. I remember people who come back.",
    "You've done right by me. Ask what you actually came to ask.",
    "All right. No counter, no role, no sales voice. For you, I talk plain.",
  ];
  return `${displayName}: ${generic[tier - 1]}`;
}
