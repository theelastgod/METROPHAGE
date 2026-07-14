// METROPHAGE — build stamp injected at compile time (vite define).
// Used for cache-bust UX ("hard refresh if outdated") and ops diagnostics.

declare const __BUILD_ID__: string | undefined;
declare const __BUILD_TIME__: string | undefined;

export const BUILD_ID =
  typeof __BUILD_ID__ !== "undefined" && __BUILD_ID__ ? __BUILD_ID__ : "dev";
export const BUILD_TIME =
  typeof __BUILD_TIME__ !== "undefined" && __BUILD_TIME__ ? __BUILD_TIME__ : new Date().toISOString();

/** Short stamp for HUD / options (e.g. a1b2c3d · 0714). */
export function buildStamp(): string {
  const id = BUILD_ID.slice(0, 8);
  const d = BUILD_TIME.slice(5, 10).replace("-", "");
  return `${id} · ${d || "local"}`;
}
