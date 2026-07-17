// Legacy device fallback for reprints witnessed before durable server memory shipped.
// Current deaths are also recorded authoritatively; presentation takes the larger count
// so an established browser does not appear to lose history during the transition.

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
