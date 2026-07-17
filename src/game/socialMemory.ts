// Bounded durable memory for authoritative party rescues.
// Totals capture a runner's social pattern without unbounded per-player pair records.

export const MAX_RESCUE_MEMORY = 9;
export const RESCUES_GIVEN_KEY = "social_rescues_given";
export const RESCUES_RECEIVED_KEY = "social_rescues_received";

export interface RescueMemory {
  given: number;
  received: number;
  tier: number;
  title: string;
  line: string;
}

export function rescueMemorySnapshot(stats: Record<string, number>): RescueMemory {
  const given = Math.max(0, Math.min(MAX_RESCUE_MEMORY, Math.floor(stats[RESCUES_GIVEN_KEY] ?? 0)));
  const received = Math.max(0, Math.min(MAX_RESCUE_MEMORY, Math.floor(stats[RESCUES_RECEIVED_KEY] ?? 0)));
  const total = given + received;
  if (total >= 7) return { given, received, tier: 3, title: "NO ONE LEFT", line: "Your record says survival is collective: you have carried runners up and allowed others to carry you." };
  if (total >= 3) return { given, received, tier: 2, title: "LINE KEEPER", line: "People on the line recognize a runner who treats a downed body as a promise, not abandoned loot." };
  if (total >= 1) return { given, received, tier: 1, title: "REBOOT WITNESS", line: "Somebody remembers the hand that restarted a heart—or the trust it took to accept one." };
  return { given, received, tier: 0, title: "UNTESTED LINK", line: "No party reboot has become part of your durable street record yet." };
}

export function rescueMemoryContactLine(stats: RescueMemory, trust: number): string | null {
  if (trust < 1 || stats.tier < 1) return null;
  if (stats.tier >= 3) return "Your rescue record runs both directions. Good. Martyrs are just people who never learned to let the crew reach them.";
  if (stats.given > stats.received) return "People say you stop for downed runners. Keep doing it after nobody is watching the party list.";
  if (stats.received > stats.given) return "You have been carried back onto your feet. That is not debt; it is proof somebody expects you in tomorrow's city.";
  return "You have rebooted and been rebooted. Mutual aid starts when nobody mistakes either side for weakness.";
}
