// METROPHAGE — local NPC memory (client-only). Remembers who you helped so
// dialogue can change without a server friends graph.

const KEY = "metrophage_npc_memory_v1";

export interface NpcMemoryEntry {
  bountyDone?: number;
  talked?: number;
  lastLine?: string;
}

function load(): Record<string, NpcMemoryEntry> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, NpcMemoryEntry>;
  } catch {
    return {};
  }
}

function save(m: Record<string, NpcMemoryEntry>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* private */
  }
}

let cache = load();

export function noteNpcTalk(npcId: string) {
  const e = cache[npcId] ?? {};
  e.talked = (e.talked ?? 0) + 1;
  cache[npcId] = e;
  save(cache);
}

export function noteNpcBountyDone(npcId: string) {
  const e = cache[npcId] ?? {};
  e.bountyDone = (e.bountyDone ?? 0) + 1;
  e.lastLine = "You came back. The job still stands if the streets do.";
  cache[npcId] = e;
  save(cache);
}

export function npcMemoryLine(npcId: string, displayName?: string): string | null {
  const e = cache[npcId];
  if (!e) return null;
  const who = displayName ?? npcId;
  if ((e.bountyDone ?? 0) > 0) {
    return `${who}: You already bled for me once. I don't forget.`;
  }
  if ((e.talked ?? 0) >= 3) {
    return `${who}: You keep showing up. That's either loyalty or a bad habit.`;
  }
  return null;
}

export function getNpcMemory(npcId: string): NpcMemoryEntry | undefined {
  return cache[npcId];
}
