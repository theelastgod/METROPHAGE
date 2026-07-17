// METROPHAGE — async city pulse lines (solo density without fake players).
// Pure data; server can push similar sys lines; client rotates for HUD.

import { currentDistrictWar } from "./districtWar";
import { weeklyGuildGoal } from "./guildGoals";
import { dailyDistrictOperation, districtOperationObjectiveLabel } from "./districtLife";
import { factionCampaignBrief } from "./factionCampaigns";

/** Static pulse pool + live war/goal injection. */
export function cityPulseLines(now = Date.now()): string[] {
  const war = currentDistrictWar(now);
  const goal = weeklyGuildGoal(now);
  const operation = dailyDistrictOperation(war.focusDistrict, Math.floor(now / 86_400_000));
  return [
    `pulse · ${war.name} is live — ${war.blurb}`,
    `pulse · ${operation.name} in the war district — ${districtOperationObjectiveLabel(operation)}`,
    `pulse · Cell goal this week: ${goal.name} (${goal.desc})`,
    ...[0, 1, 2, 3].map((f) => `pulse · ${factionCampaignBrief(f, now)}`),
    "pulse · vendor prices are hard sinks; street reprints never take ₵",
    "pulse · forge upgrades burn cores + credits; salvage is for cores, not profit",
    "pulse · THE ESTATES · tip a guestbook to leave a mark",
    "pulse · world bosses reform — signature loot only once per kill credit",
    "pulse · Map (M) · Cell (U) · Market (K) · Journal (N)",
    "pulse · HEAT fuels ultimates — stay cold only if you're running",
    "pulse · deeper districts pay more but HSS scales hard",
    "pulse · TENEMENT lockboxes organize overflow; your carried bag also survives reprint",
  ];
}

export function cityPulseAt(seed: number, now = Date.now()): string {
  const lines = cityPulseLines(now);
  return lines[((seed % lines.length) + lines.length) % lines.length];
}
