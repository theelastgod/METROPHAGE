// METROPHAGE — second-hour beats (client coach + flags). Complements firstSession
// after THE WAKE loop is learned: vendor, forge, bounty complete, node, boss tease.

const KEY = "metrophage_second_hour_v1";

export type SecondBeat =
  | "buy_cache"
  | "forge_once"
  | "finish_bounty"
  | "capture_node"
  | "touch_boss"
  | "done";

export interface SecondHourState {
  buyCache: boolean;
  forgeOnce: boolean;
  finishBounty: boolean;
  captureNode: boolean;
  touchBoss: boolean;
  dismissed: boolean;
}

const DEFAULT: SecondHourState = {
  buyCache: false,
  forgeOnce: false,
  finishBounty: false,
  captureNode: false,
  touchBoss: false,
  dismissed: false,
};

function load(): SecondHourState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<SecondHourState>) };
  } catch {
    return { ...DEFAULT };
  }
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* */
  }
}

export function getSecondHour(): SecondHourState {
  return state;
}

export function noteSecondBuyCache() {
  state.buyCache = true;
  save();
}
export function noteSecondForge() {
  state.forgeOnce = true;
  save();
}
export function noteSecondBountyDone() {
  state.finishBounty = true;
  save();
}
export function noteSecondCapture() {
  state.captureNode = true;
  save();
}
export function noteSecondBossTouch() {
  state.touchBoss = true;
  save();
}
export function dismissSecondHour() {
  state.dismissed = true;
  save();
}

/** Test-only: clear second-hour progress. */
export function __resetSecondHourForTests() {
  state = { ...DEFAULT };
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

function allDone(): boolean {
  return (
    state.buyCache &&
    state.forgeOnce &&
    state.finishBounty &&
    state.captureNode &&
    state.touchBoss
  );
}

/** One-line coach after first-session is done. */
export function secondHourLine(firstSessionDone: boolean): string | null {
  if (!firstSessionDone || state.dismissed || allDone()) return null;
  if (!state.finishBounty) return "▶ 2ND HOUR · Accept an NPC Job (E → Job) and finish it";
  if (!state.buyCache) return "▶ 2ND HOUR · Buy a SALVAGE CACHE at a vendor (B / stall)";
  if (!state.forgeOnce) return "▶ 2ND HOUR · Open FORGE (G) — upgrade or salvage once";
  if (!state.captureNode) return "▶ 2ND HOUR · Stand on a territory NODE until it flips (stand in the ring)";
  if (!state.touchBoss) return "▶ 2ND HOUR · Hunt a world boss (gold banner) — even a touch counts";
  return null;
}
