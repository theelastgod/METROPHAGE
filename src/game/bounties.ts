// METROPHAGE — authored NPC bounties: pure-data, Phaser-FREE, shared by server (grant) and
// client (offer dialogue + tracker). Distinct from the daily contracts (auto-tracked, 3/day)
// and The Blank (narrative spine): a bounty is a CHARACTER's repeatable job you accept by
// talking to them — one active at a time, auto-rewarded on completion. Keyed by NPC id.

export type BountyObjective = "kill" | "collect" | "boss";

export interface Bounty {
  id: string;
  npc: string; // the NPC id who gives it
  name: string;
  desc: string;
  objective: BountyObjective;
  count: number;
  rewardCredits: number;
  rewardRep: number;
  offer: string; // the line shown when offered/accepted
}

export const BOUNTIES: Record<string, Bounty> = {
  rin: { id: "rin_sweep", npc: "rin", name: "RIN'S SWEEP", desc: "Purge 12 HSS units", objective: "kill", count: 12, rewardCredits: 320, rewardRep: 18, offer: "A shipment's pinned down — clear 12 HSS and it's yours." },
  doc: { id: "doc_cores", npc: "doc", name: "DOC'S SALVAGE", desc: "Collect 5 data cores", objective: "collect", count: 5, rewardCredits: 280, rewardRep: 16, offer: "I need 5 data cores for the clinic. Pull them off the dead." },
  vex: { id: "vex_intel", npc: "vex", name: "VEX'S CONTRACT", desc: "Purge 20 HSS units", objective: "kill", count: 20, rewardCredits: 540, rewardRep: 30, offer: "Information costs blood. Drop 20 HSS and we'll talk." },
  marek: { id: "marek_grudge", npc: "marek", name: "MAREK'S GRUDGE", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 900, rewardRep: 52, offer: "One of their commanders took everything from me. End it." },
};

export function bountyForNpc(npcId: string): Bounty | undefined {
  return BOUNTIES[npcId];
}
export function bountyById(id: string): Bounty | undefined {
  return Object.values(BOUNTIES).find((b) => b.id === id);
}
