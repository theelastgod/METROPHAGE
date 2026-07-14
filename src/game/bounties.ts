// METROPHAGE — authored NPC bounties: pure-data, Phaser-FREE, shared by server (grant) and
// client (offer dialogue + tracker). Distinct from the daily contracts (auto-tracked, 3/day)
// and The Blank (narrative spine): a bounty is a CHARACTER's repeatable job you accept by
// talking to them — one active at a time, auto-rewarded on completion. Keyed by NPC id.

export type BountyObjective = "kill" | "collect" | "boss" | "hvt";

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
  juno: { id: "juno_courier", npc: "juno", name: "JUNO'S RUN", desc: "Purge 14 HSS units", objective: "kill", count: 14, rewardCredits: 420, rewardRep: 24, offer: "Courier work's dead while the corps hold the streets. Clear fourteen HSS — I'll pay." },
  sable: { id: "sable_sweep", npc: "sable", name: "SABLE'S SWEEP", desc: "Purge 15 HSS units", objective: "kill", count: 15, rewardCredits: 480, rewardRep: 26, offer: "The bar's quiet because the streets aren't. Clear fifteen HSS." },
  kessler: { id: "kessler_hold", npc: "kessler", name: "KESSLER'S HOLD", desc: "Purge 10 HSS units", objective: "kill", count: 10, rewardCredits: 380, rewardRep: 22, offer: "Guild needs muscle on the ground. Drop ten HSS and I'll mark you operative." },
  mira: { id: "mira_cores", npc: "mira", name: "MIRA'S STOCK", desc: "Collect 8 data cores", objective: "collect", count: 8, rewardCredits: 520, rewardRep: 28, offer: "Stall's dry. Pull eight cores off the dead — I'll make it worth your while." },
  ghost: { id: "ghost_hvt", npc: "ghost", name: "THE QUIET LEDGER", desc: "Collect today's HIGH-VALUE TARGET bounty", objective: "hvt", count: 1, rewardCredits: 1200, rewardRep: 45, offer: "There's a name on today's kill sheet. Every district posts one. Make it a statistic and I'll double what the grid pays." },
  amb_tech: { id: "grid_sweep", npc: "amb_tech", name: "GRID SWEEP", desc: "Purge 30 HSS units", objective: "kill", count: 30, rewardCredits: 680, rewardRep: 34, offer: "Grid's crawling with HSS tonight. Drop thirty and I'll wire the credits." },
  // Regional / profession variety (depth pass — not all kill-N)
  porter: { id: "porter_docks", npc: "porter", name: "DOCK QUIET", desc: "Purge 12 HSS units", objective: "kill", count: 12, rewardCredits: 360, rewardRep: 20, offer: "Manifests don't move while HSS holds the piers. Twelve. Then we talk freight." },
  tunnel_rat: { id: "tunnel_cores", npc: "tunnel_rat", name: "UNDER-CORE", desc: "Collect 6 data cores", objective: "collect", count: 6, rewardCredits: 400, rewardRep: 22, offer: "Bring six cores from the dark. I don't care whose they were." },
  scrap_boss: { id: "scrap_boss_kill", npc: "scrap_boss", name: "SCRAP CLAIM", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 750, rewardRep: 40, offer: "Something big's chewing the yards. Drop a world boss and the scrap is yours." },
  hawker: { id: "hawker_stock", npc: "hawker", name: "STREET STOCK", desc: "Collect 4 data cores", objective: "collect", count: 4, rewardCredits: 260, rewardRep: 14, offer: "Stall's empty. Four cores. Cash on delivery, no questions." },
  preacher: { id: "preacher_hvt", npc: "preacher", name: "FALSE PROPHET", desc: "Collect today's HIGH-VALUE TARGET bounty", objective: "hvt", count: 1, rewardCredits: 900, rewardRep: 38, offer: "The grid names a sinner each day. End them. The flock will remember." },
  res_pike: { id: "pike_watch", npc: "res_pike", name: "BLOCK WATCH", desc: "Purge 16 HSS units", objective: "kill", count: 16, rewardCredits: 440, rewardRep: 24, offer: "This block stays mine. Sixteen HSS and I owe you a favour." },
  res_tallow: { id: "tallow_meat", npc: "res_tallow", name: "HOT MEAT", desc: "Collect 5 data cores", objective: "collect", count: 5, rewardCredits: 300, rewardRep: 16, offer: "Kitchen needs cores for the burners. Five. Broth's free if you deliver." },
  res_wren: { id: "wren_parts", npc: "res_wren", name: "SPARE PARTS", desc: "Purge 10 HSS units", objective: "kill", count: 10, rewardCredits: 340, rewardRep: 18, offer: "Chrome doesn't grow on trees. Drop ten HSS and salvage what walks." },
  res_mercy: { id: "mercy_field", npc: "res_mercy", name: "FIELD TRIAGE", desc: "Purge 8 HSS units", objective: "kill", count: 8, rewardCredits: 280, rewardRep: 15, offer: "Fewer corpses on my floor if the streets are quieter. Eight HSS." },
  res_quill: { id: "quill_record", npc: "res_quill", name: "TRUE RECORD", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 820, rewardRep: 42, offer: "History needs a body count. Fell a world boss — I'll write it true." },
};

export function bountyForNpc(npcId: string): Bounty | undefined {
  return BOUNTIES[npcId];
}
export function bountyById(id: string): Bounty | undefined {
  return Object.values(BOUNTIES).find((b) => b.id === id);
}
