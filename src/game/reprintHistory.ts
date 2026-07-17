// Durable, bounded memory of player reprints. The stat is social/narrative only:
// death rules, respawn timing, inventory, and economy never read it.

import { residentProfile } from "./residentLife";

export const REPRINT_MEMORY_KEY = "reprints_seen";
export const MAX_REPRINT_MEMORY = 25;

export function reprintMemoryCount(stats: Record<string, number>): number {
  return Math.max(0, Math.min(MAX_REPRINT_MEMORY, Math.floor(stats[REPRINT_MEMORY_KEY] ?? 0)));
}

export function reprintMemoryTier(count: number): 0 | 1 | 2 | 3 {
  const n = Math.max(0, Math.floor(count) || 0);
  return n >= 25 ? 3 : n >= 10 ? 2 : n >= 3 ? 1 : 0;
}

export function residentReprintWitnessLine(npcId: string, count: number): string | null {
  const resident = residentProfile(npcId);
  const tier = reprintMemoryTier(count);
  if (!resident || tier === 0) return null;
  if (tier === 1) return `I've seen your callsign come back three times. ${resident.institution} calls that continuity; people here call it surviving the machine.`;
  if (tier === 2) return `Ten remembered reprints, and you still ask about ${resident.resource}. Most systems would call the copies interchangeable. I don't.`;
  return `Twenty-five returns is where the counter stops, not where you did. If ${resident.institution} says the latest body owns the life, I will testify otherwise.`;
}
