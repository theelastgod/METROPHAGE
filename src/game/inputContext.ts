// METROPHAGE — contextual input ownership. Extracted so OnlineScene key routing
// stays testable without pulling the full scene (P2 modularization step).

export type InputZone = "hub" | "home" | "combat" | "tutorial" | "interior";

export interface KeyContext {
  zone: InputZone;
  /** Own estate interior — F/B/G are furnish/buy/guestbook, not shop/forge. */
  inOwnHome: boolean;
  /** Visitor in an estate (guest book, not furnish). */
  inHomeAsGuest: boolean;
  /** First-hour funnel: secondary systems locked until FIXER talk. */
  systemsLocked: boolean;
  /** Drill yard — always action controls. */
  isTutorial: boolean;
}

/** Which global system keys are blocked by first-hour lock (map/chat always open). */
export function isSystemHotkey(key: string): boolean {
  const k = key.toLowerCase();
  return k === "b" || k === "g" || k === "k" || k === "j" || k === "y" || k === "c" || k === "l";
}

/** Home-context keys that must win over global shop/forge/guild. */
export function homeOwnsKey(ctx: KeyContext, key: string): boolean {
  if (!ctx.inOwnHome && !ctx.inHomeAsGuest) return false;
  const k = key.toLowerCase();
  if (k === "f") return ctx.inOwnHome;
  if (k === "b") return true; // buy (guest) or list context
  if (k === "g") return true; // guestbook or guild — home wins
  return false;
}

export function allowSystemPanel(ctx: KeyContext): boolean {
  if (ctx.isTutorial) return true;
  return !ctx.systemsLocked;
}
