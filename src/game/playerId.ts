/** Canonical player ids. Never derived from a callsign. */

const GUEST_UUID =
  /^g:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUEST_HEX32 = /^g:[0-9a-f]{32}$/i;

export function isGuestPlayerId(id: string): boolean {
  const s = (id || "").trim();
  return GUEST_UUID.test(s) || GUEST_HEX32.test(s);
}

export function isWalletPlayerId(id: string): boolean {
  return (id || "").startsWith("w:") && id.length > 3;
}

export function mintGuestId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
          const n = (Math.random() * 16) | 0;
          const v = ch === "x" ? n : (n & 0x3) | 0x8;
          return v.toString(16);
        });
  return "g:" + uuid;
}
