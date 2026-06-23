// METROPHAGE — tiny bridge so the (DOM) $METRO panel can learn the current online
// player id without coupling to OnlineScene. OnlineScene sets it on login and clears
// it on shutdown; the panel reads it to talk to the server bridge (/metro/account…).

let onlinePlayerId: string | null = null;

export function setOnlinePlayer(id: string | null): void {
  onlinePlayerId = id || null;
}

export function getOnlinePlayer(): string | null {
  return onlinePlayerId;
}
