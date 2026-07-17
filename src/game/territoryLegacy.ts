// Bounded daily memory for territory changes. Live node ownership remains the combat
// authority; this ledger only lets the city remember who most recently rewrote a
// district's relays and how contested the rewrite was after the nodes decay or reboot.

import { dayIndex } from "./districtMods";
import { DISTRICTS } from "./districts";
import { factionDef } from "./factions";
import { dailyDistrictOperation } from "./districtLife";
import { residentProfile } from "./residentLife";

export const TERRITORY_FLIP_CAP = 99;
const TERRITORY_DAY_FACTOR = 1_000;
const TERRITORY_FACTION_FACTOR = 100;

export interface TerritoryLegacy {
  district: number;
  controller: number;
  flips: number;
}

/** Live district control requires a unique node-count leader. No participants and a
 * tied lead both remain neutral; array order must never award a political outcome. */
export function territoryController(owners: readonly number[], factionCount = 4): number {
  const count = Math.max(1, Math.floor(factionCount) || 4);
  const totals = Array(count).fill(0) as number[];
  for (const owner of owners) if (Number.isInteger(owner) && owner >= 0 && owner < count) totals[owner]++;
  const max = Math.max(...totals);
  if (max <= 0) return -1;
  const leaders = totals.reduce<number[]>((out, total, faction) => {
    if (total === max) out.push(faction);
    return out;
  }, []);
  return leaders.length === 1 ? leaders[0] : -1;
}

export const TERRITORY_CHARTERS = [
  "routes the relays as a strike commons: copies first, ownership never",
  "hands the relay keys toward rotating block assemblies under armed protection",
  "mirrors every relay change into a witnessed archive the city cannot quietly edit",
  "meshes warning, medicine, and evacuation paths so no single relay becomes a throat",
] as const;

export function territoryLegacyKey(district: number): string {
  return `territory_daily_d${Math.max(0, Math.floor(district) || 0)}`;
}

export function encodeTerritoryLegacy(day: number, controller: number, flips: number): number {
  const d = Math.max(0, Math.floor(day) || 0);
  const f = Math.max(0, Math.min(3, Math.floor(controller) || 0));
  const n = Math.max(1, Math.min(TERRITORY_FLIP_CAP, Math.floor(flips) || 1));
  return d * TERRITORY_DAY_FACTOR + (f + 1) * TERRITORY_FACTION_FACTOR + n;
}

export function decodeTerritoryLegacy(value: number | undefined, district: number, day = dayIndex()): TerritoryLegacy {
  const encoded = Math.max(0, Math.floor(Number(value) || 0));
  const expectedDay = Math.max(0, Math.floor(day) || 0);
  if (Math.floor(encoded / TERRITORY_DAY_FACTOR) !== expectedDay) return { district, controller: -1, flips: 0 };
  const withinDay = encoded % TERRITORY_DAY_FACTOR;
  const controller = Math.floor(withinDay / TERRITORY_FACTION_FACTOR) - 1;
  const flips = Math.min(TERRITORY_FLIP_CAP, withinDay % TERRITORY_FACTION_FACTOR);
  if (controller < 0 || controller > 3 || flips < 1) return { district, controller: -1, flips: 0 };
  return { district, controller, flips };
}

export function territoryLegacyLine(record: TerritoryLegacy, day = dayIndex()): string {
  const place = DISTRICTS[record.district]?.name ?? `District ${record.district}`;
  if (record.controller < 0 || record.flips < 1) return `${place} has no relay charter recorded today.`;
  const cell = factionDef(record.controller);
  const operation = dailyDistrictOperation(record.district, day);
  const contest = record.flips === 1 ? "one charter change" : `${record.flips} charter changes`;
  return `${place} records ${contest}; ${cell.cellName} wrote the latest during ${operation.name} and ${TERRITORY_CHARTERS[record.controller]}.`;
}

/** Recurring residents judge the charter through their own institution/resource conflict.
 * This is dialogue only: the record never changes trust, access, or territory authority. */
export function residentTerritoryLegacyLine(npcId: string, record: TerritoryLegacy): string | null {
  const resident = residentProfile(npcId);
  if (!resident || resident.district !== record.district || record.controller < 0 || record.flips < 1) return null;
  const cell = factionDef(record.controller);
  const lines = [
    `${cell.cellName} copied ${resident.resource} into the relay commons. I'm checking who consented before “free” becomes another seizure.`,
    `${cell.cellName} handed relay keys toward the block assemblies. ${resident.institution} is already sending people who claim to represent us.`,
    `${cell.cellName} archived every relay change beside ${resident.institution}. Proof helps; I still want to know which witnesses the cameras exposed.`,
    `${cell.cellName} meshed ${resident.resource} into the district routes. A collective worthy of the name must leave every person an exit.`,
  ];
  return lines[record.controller];
}
