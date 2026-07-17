// Weekly city chronicle assembled from authoritative shared counters.

import { DISTRICTS } from "./districts";
import { factionDef } from "./factions";
import { currentDistrictWar } from "./districtWar";
import { weeklyGuildGoal } from "./guildGoals";
import type { TerritoryLegacy } from "./territoryLegacy";

export const CHRONICLE_BOSS_KEY = "chronicle_bosses";
export const CHRONICLE_BOSS_CAP = 9_999;
export const CHRONICLE_CIVIC_CAP = 999;
const WEEK_FACTOR = 10_000;
const CIVIC_WEEK_FACTOR = 1_000;

export function chronicleCivicKey(district: number): string {
  return `chronicle_civic_d${Math.max(0, Math.floor(district) || 0)}`;
}

export function encodeChronicleCivic(week: number, count: number): number {
  return Math.max(0, Math.floor(week)) * CIVIC_WEEK_FACTOR
    + Math.max(0, Math.min(CHRONICLE_CIVIC_CAP, Math.floor(count) || 0));
}

export function decodeChronicleCivic(value: number | undefined, week: number): number {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  return Math.floor(n / CIVIC_WEEK_FACTOR) === Math.floor(week)
    ? Math.min(CHRONICLE_CIVIC_CAP, n % CIVIC_WEEK_FACTOR)
    : 0;
}

export interface CityChronicleInput {
  now?: number;
  warScores: readonly number[];
  civicMomentum: readonly number[];
  bossKills: number;
  cellGoalsClaimed: number;
  cellGoalProgress: number;
  territory?: readonly TerritoryLegacy[];
}

export interface CityChronicle {
  week: number;
  headline: string;
  lines: string[];
  /** Weekly public-operation completions by district, in district index order. */
  civic: number[];
  /** Today's last relay charter and flip count by district. */
  territory: TerritoryLegacy[];
}

export function encodeChronicleBosses(week: number, count: number): number {
  return Math.max(0, Math.floor(week)) * WEEK_FACTOR + Math.max(0, Math.min(CHRONICLE_BOSS_CAP, Math.floor(count) || 0));
}

export function decodeChronicleBosses(value: number | undefined, week: number): number {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  return Math.floor(n / WEEK_FACTOR) === Math.floor(week) ? Math.min(CHRONICLE_BOSS_CAP, n % WEEK_FACTOR) : 0;
}

export function buildCityChronicle(input: CityChronicleInput): CityChronicle {
  const now = input.now ?? Date.now();
  const war = currentDistrictWar(now);
  const goal = weeklyGuildGoal(now);
  const warScores = [0, 1, 2, 3].map((i) => Math.max(0, Math.floor(input.warScores[i] ?? 0)));
  const leader = warScores.reduce((best, score, i) => score > warScores[best] ? i : best, 0);
  const contested = warScores.some((score) => score !== warScores[0]);
  const civic = Array.from({ length: DISTRICTS.length }, (_, i) => Math.max(0, Math.floor(input.civicMomentum[i] ?? 0)));
  const civicLeader = civic.reduce((best, score, i) => score > civic[best] ? i : best, 0);
  const civicTotal = civic.reduce((a, b) => a + b, 0);
  const territory = Array.from({ length: DISTRICTS.length }, (_, district) => {
    const record = input.territory?.[district];
    const controller = Number(record?.controller);
    return {
      district,
      controller: Number.isFinite(controller) && controller >= 0 && controller < 4 ? Math.floor(controller) : -1,
      flips: Math.max(0, Math.min(99, Math.floor(record?.flips ?? 0))),
    };
  });
  const activeTerritory = territory.filter((record) => record.controller >= 0 && record.flips > 0);
  const contestedDistrict = activeTerritory.reduce<TerritoryLegacy | null>((best, record) =>
    !best || record.flips > best.flips ? record : best, null);
  const bossKills = Math.max(0, Math.floor(input.bossKills) || 0);
  const claimed = Math.max(0, Math.floor(input.cellGoalsClaimed) || 0);
  const progress = Math.max(0, Math.floor(input.cellGoalProgress) || 0);
  const holder = factionDef(leader);
  const focus = DISTRICTS[war.focusDistrict]?.name ?? `District ${war.focusDistrict}`;
  const civicPlace = DISTRICTS[civicLeader]?.name ?? `District ${civicLeader}`;
  return {
    week: war.week,
    civic,
    territory,
    headline: civicTotal > 0
      ? `${civicPlace} turns survival into public memory`
      : `${focus} waits for the first move`,
    lines: [
      (contested
        ? `${holder.cellName} leads ${war.name} at ${warScores[leader]} marks; ${warScores.join(" / ")} across the four Cells.`
        : `${war.name} remains level at ${warScores[0]} marks per Cell. No doctrine owns the week yet.`)
        + (contestedDistrict
          ? ` Today's relay ledger records ${activeTerritory.length} active ${activeTerritory.length === 1 ? "district" : "districts"}; ${DISTRICTS[contestedDistrict.district]?.name ?? `District ${contestedDistrict.district}`} changed charter ${contestedDistrict.flips} ${contestedDistrict.flips === 1 ? "time" : "times"}.`
          : " No district relay has changed charter today."),
      civicTotal > 0
        ? `${civicTotal} public-operation completions are recorded this week; ${civicPlace} carries the strongest weekly legacy at ${civic[civicLeader]}.`
        : "No public operation has entered the weekly civic ledger yet; every district is still reporting public need.",
      bossKills > 0
        ? `${bossKills} command ${bossKills === 1 ? "chassis has" : "chassis have"} fallen and reformed since the weekly ledger opened.`
        : "No command chassis has been confirmed down this week.",
      claimed > 0
        ? `${claimed} ${claimed === 1 ? "Cell has" : "Cells have"} completed ${goal.name}; the city ledger records ${progress} total contributions.`
        : `${goal.name} is unfinished across the registered Cells; ${progress} contributions are on record.`,
    ],
  };
}
