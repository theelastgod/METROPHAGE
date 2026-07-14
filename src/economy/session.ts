// METROPHAGE — tiny bridge so the (DOM) $METRO panel can learn the current online
// player id without coupling to OnlineScene. NetClient sets it on welcome (login) and
// clears it on socket close; the panel reads it to talk to the server bridge
// (/metro/account…) and to fire its one-time login toast.

let onlinePlayerId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

export function setOnlinePlayer(id: string | null): void {
  const next = id || null;
  if (next === onlinePlayerId) return;
  onlinePlayerId = next;
  for (const fn of listeners) {
    try {
      fn(onlinePlayerId);
    } catch {
      /* a bad listener must never break the net loop */
    }
  }
}

export function getOnlinePlayer(): string | null {
  return onlinePlayerId;
}

/** Subscribe to login/logout transitions. Returns an unsubscribe fn. */
export function onOnlinePlayerChange(fn: (id: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
