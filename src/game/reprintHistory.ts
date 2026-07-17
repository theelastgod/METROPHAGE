// Durable, bounded memory of player reprints. The stat is social/narrative only:
// death rules, respawn timing, inventory, and economy never read it.

import { residentProfile } from "./residentLife";

export const REPRINT_MEMORY_KEY = "reprints_seen";
export const MAX_REPRINT_MEMORY = 25;
export const REPRINT_STAMP_KEY = "reprint_memorial_stamps";
export const MAX_REPRINT_STAMPS = 9;

export function reprintMemoryCount(stats: Record<string, number>): number {
  return Math.max(0, Math.min(MAX_REPRINT_MEMORY, Math.floor(stats[REPRINT_MEMORY_KEY] ?? 0)));
}

export function reprintMemoryTier(count: number): 0 | 1 | 2 | 3 {
  const n = Math.max(0, Math.floor(count) || 0);
  return n >= 25 ? 3 : n >= 10 ? 2 : n >= 3 ? 1 : 0;
}

export function nextReprintMemory(count: number): number {
  return Math.min(MAX_REPRINT_MEMORY, Math.max(0, Math.floor(count) || 0) + 1);
}

export function reprintStampCount(stats: Record<string, number>): number {
  return Math.max(0, Math.min(MAX_REPRINT_STAMPS, Math.floor(stats[REPRINT_STAMP_KEY] ?? 0)));
}

export function reprintStampTier(count: number): 0 | 1 | 2 | 3 {
  const n = Math.max(0, Math.floor(count) || 0);
  return n >= 7 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
}

export function reprintMemorialLine(npcId: string, count: number): string | null {
  const tier = reprintStampTier(count);
  if (tier === 0) return null;
  if (npcId === "marek") {
    if (tier === 1) return "You paid the city to record one return voluntarily. Strange way to make a receipt tell the truth.";
    if (tier === 2) return "Three memorial stamps. Bureaucracy calls them purchases; I read them as names you refused to let become serial numbers.";
    return "Seven memorial stamps and the ledger finally looks less like insurance than testimony. Keep the receipts. Systems hate paper they cannot reinterpret.";
  }
  const resident = residentProfile(npcId);
  if (!resident) return null;
  if (tier === 1) return `I saw your memorial stamp beside ${resident.resource}. At least this receipt admits a reprinted life belongs to someone.`;
  if (tier === 2) return `${count} memorial stamps make a pattern ${resident.institution} cannot call an accounting error. We keep copies here.`;
  return `Your memorial ledger is public now. If ${resident.institution} disputes one of those returns, this district will answer with every receipt.`;
}

export function residentReprintWitnessLine(npcId: string, count: number): string | null {
  const resident = residentProfile(npcId);
  const tier = reprintMemoryTier(count);
  if (!resident || tier === 0) return null;
  if (tier === 1) return `I've seen your callsign come back three times. ${resident.institution} calls that continuity; people here call it surviving the machine.`;
  if (tier === 2) return `Ten remembered reprints, and you still ask about ${resident.resource}. Most systems would call the copies interchangeable. I don't.`;
  return `Twenty-five returns is where the counter stops, not where you did. If ${resident.institution} says the latest body owns the life, I will testify otherwise.`;
}
