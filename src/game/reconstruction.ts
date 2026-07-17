// Post-Awakening district reconstruction. Bounded personal proof that campaign
// consequence work was completed; shared sim/economy numbers remain unchanged.

import { DISTRICTS } from "./districts";

export const MAX_RECONSTRUCTION = 9;

const RESULTS: readonly string[] = [
  "Blind-time kiosks now publish routes the prediction clerks cannot quietly repossess.",
  "A communal fabrication shift is producing repair parts before Campus Seven quotas.",
  "The Mercy Register is matching REISSUE numbers to names, homes, and living witnesses.",
  "Freed navigator minds now choose one harbor channel and refuse bonded-freight commands.",
  "Station families are posting last-shift notices where continuity payroll deleted wages.",
  "The public frequency carries Choir replies without an orbital license or delay filter.",
  "Settlers are testing tanker seals in public before water enters the district cisterns.",
  "Quill's new record logs events the continuity engine did not predict or authorize.",
];

export function reconstructionKey(district: number): string {
  return `wake_reconstruction_d${Math.max(0, Math.floor(district))}`;
}

export function reconstructionSnapshot(stats: Record<string, number>): number[] {
  return DISTRICTS.map((_, district) => Math.max(0, Math.min(MAX_RECONSTRUCTION, Math.floor(stats[reconstructionKey(district)] ?? 0))));
}

export function districtReconstruction(district: number, completions: number): { stage: string; line: string } | null {
  const count = Math.max(0, Math.min(MAX_RECONSTRUCTION, Math.floor(completions) || 0));
  const line = RESULTS[district];
  if (!line || count < 1) return null;
  const stage = count >= 6 ? "INSTITUTION" : count >= 3 ? "COMMON" : "CREW";
  return { stage, line };
}
