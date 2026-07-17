// Weekly Cell doctrine: the existing shared goal becomes four different political
// projects. Pure presentation/data — doctrine never changes damage, payouts, or odds.

import { factionDef } from "./factions";
import { weeklyGuildGoal, type GuildGoalDef } from "./guildGoals";

export interface FactionCampaignDef {
  codename: string;
  order: string;
  victory: string;
  contradiction: string;
}

type GoalStat = GuildGoalDef["stat"];

const CAMPAIGNS: readonly Record<GoalStat, FactionCampaignDef>[] = [
  {
    kills: { codename: "OPEN SOURCE VIOLENCE", order: "Break HSS patrol logic and leave every exploit public.", victory: "The street inherits the breach, not the Cell.", contradiction: "A liberated weapon still remembers who it was aimed at." },
    bosses: { codename: "COPY THE KEYS", order: "Crack command chassis and distribute their authority signatures.", victory: "No command key remains unique enough to own a district.", contradiction: "Copied authority can become copied domination." },
    captures: { codename: "COMMON CARRIER", order: "Turn territory relays into infrastructure anyone can route through.", victory: "The grid serves whoever is present, not whoever holds title.", contradiction: "A commons imposed by force can still feel occupied." },
    deposits: { codename: "MONEY WITH NO MASTER", order: "Pool seized value into tools the neighborhood can duplicate.", victory: "The war chest dissolves into public capacity.", contradiction: "The Cell still decides when the public is ready." },
  },
  {
    kills: { codename: "MAKE OCCUPATION EXPENSIVE", order: "Bleed patrol strength away from homes, clinics, and picket lines.", victory: "A block gets one quiet night to govern itself.", contradiction: "A war that always needs one more battle never ends." },
    bosses: { codename: "NO MORE COMMAND POSTS", order: "Remove the chassis coordinating raids on neighborhood councils.", victory: "Orders stop at the district border.", contradiction: "Someone must still answer for what replaces command." },
    captures: { codename: "BLOCK BY BLOCK", order: "Hold relays long enough for resident councils to assume control.", victory: "Territory becomes a meeting, not a flag.", contradiction: "The Cell carries guns into a room meant for civilians." },
    deposits: { codename: "TENANT WAR CHEST", order: "Fund safe houses, strike kitchens, and emergency relocation.", victory: "Nobody bargains alone with an eviction squad.", contradiction: "Dependence on wartime money can make peace unaffordable." },
  },
  {
    kills: { codename: "LEAVE A RECORD", order: "Recover targeting logs before eliminating their HSS custodians.", victory: "Every missing person gains an evidentiary trail.", contradiction: "The archive keeps intimate pain long after justice arrives." },
    bosses: { codename: "HOSTILE DISCLOSURE", order: "Open command chassis and publish the orders inside them.", victory: "The city sees who signed the violence.", contradiction: "Exposure can endanger witnesses as easily as perpetrators." },
    captures: { codename: "PUBLIC TESTIMONY", order: "Convert surveillance relays into witnessed, tamper-evident archives.", victory: "Erasure becomes harder than denial.", contradiction: "A perfect witness is one camera away from a perfect jailer." },
    deposits: { codename: "WITNESS PROTECTION", order: "Finance dead drops, identity shelters, and redundant archives.", victory: "Evidence and its keepers survive together.", contradiction: "The Protocol chooses which truths receive protection." },
  },
  {
    kills: { codename: "NO ISOLATED LOSSES", order: "Hunt patrols that cut shelters away from the neighborhood mesh.", victory: "Every threatened block can call on the whole.", contradiction: "The collective may answer before a person asks." },
    bosses: { codename: "DISTRIBUTE THE HEAD", order: "Shatter command intelligence into harmless communal processes.", victory: "No single death can decapitate the network.", contradiction: "Distributed command can hide distributed blame." },
    captures: { codename: "MANY HANDS GRID", order: "Mesh relays so food, medicine, and warning routes survive any one loss.", victory: "Infrastructure learns mutual aid as its default route.", contradiction: "Resilience can become a reason nobody is allowed to leave." },
    deposits: { codename: "COMMON BODY", order: "Spread the treasury across care, repair, compute, and evacuation.", victory: "Need anywhere becomes responsibility everywhere.", contradiction: "A shared body must still respect private boundaries." },
  },
];

export function weeklyFactionCampaign(faction: number, now = Date.now()): FactionCampaignDef {
  const goal = weeklyGuildGoal(now);
  const i = Math.max(0, Math.min(CAMPAIGNS.length - 1, Math.floor(faction) || 0));
  return CAMPAIGNS[i][goal.stat];
}

export function factionCampaignBrief(faction: number, now = Date.now()): string {
  const cell = factionDef(faction);
  const campaign = weeklyFactionCampaign(faction, now);
  return `${cell.cellName} · ${campaign.codename}: ${campaign.order} ${campaign.victory}`;
}

export function factionCampaignReaction(viewerFaction: number, controller: number, districtName: string, now = Date.now()): string {
  const viewer = factionDef(viewerFaction);
  if (controller < 0) return `${viewer.cellName} sees an unanswered question in ${districtName}.`;
  const holder = factionDef(controller);
  const campaign = weeklyFactionCampaign(controller, now);
  if (viewerFaction === controller) return `${holder.cellName}: ${campaign.victory} Warning: ${campaign.contradiction}`;
  return `${holder.cellName} calls this ${campaign.codename}. ${viewer.cellName} answers: ${viewer.creed}`;
}
