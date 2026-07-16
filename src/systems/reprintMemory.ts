// METROPHAGE — this device remembers how many times you've been reprinted.
// Flavour only, never authoritative: OLD MAREK's greeting warms up as the count
// climbs (he says he remembers people the city forgets — so he does).

const KEY = "mp_reprints_seen";

export function recordLocalReprint(): number {
  try {
    const n = (parseInt(localStorage.getItem(KEY) ?? "0", 10) || 0) + 1;
    localStorage.setItem(KEY, String(n));
    return n;
  } catch {
    return 0; // private mode — MAREK forgets, like everyone else
  }
}

export function localReprintCount(): number {
  try {
    return parseInt(localStorage.getItem(KEY) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}
