// METROPHAGE — friends-lite: recent runners you've seen or pinned (local only).
// No server friends graph — durable social lives on guild/party; this is a
// personal contact sheet so Whisper / invite don't require re-finding someone.

const KEY = "metrophage_recent_players_v1";
const MAX = 24;

export interface RecentPlayer {
  id: string;
  name: string;
  pinned?: boolean;
  lastSeen: number;
}

function load(): RecentPlayer[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as RecentPlayer[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(list: RecentPlayer[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* private mode */
  }
}

let cache = load();

export function listRecentPlayers(): RecentPlayer[] {
  return [...cache].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.lastSeen - a.lastSeen;
  });
}

/** Note a runner from the zone roster / chat / context menu. */
export function noteRecentPlayer(id: string, name: string) {
  if (!id || id.length > 48) return;
  const label = (name || id).trim().slice(0, 24) || id;
  const now = Date.now();
  const i = cache.findIndex((p) => p.id === id);
  if (i >= 0) {
    cache[i] = { ...cache[i], name: label, lastSeen: now };
  } else {
    cache.unshift({ id, name: label, lastSeen: now });
  }
  // de-dupe by id, keep pinned first
  const seen = new Set<string>();
  cache = cache.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  save(cache);
}

export function pinRecentPlayer(id: string, pinned = true) {
  const p = cache.find((x) => x.id === id);
  if (!p) return;
  p.pinned = pinned;
  p.lastSeen = Date.now();
  save(cache);
}

export function clearRecentPlayers() {
  cache = cache.filter((p) => p.pinned);
  save(cache);
}
