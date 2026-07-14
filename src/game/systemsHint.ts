// METROPHAGE — one-shot systems discoverability strip after first/second hour.

const KEY = "metrophage_systems_hint_v1";
let dismissed = false;
try {
  dismissed = localStorage.getItem(KEY) === "1";
} catch {
  dismissed = false;
}

export function systemsHintLine(firstAndSecondDone: boolean): string | null {
  if (!firstAndSecondDone || dismissed) return null;
  return "▶ SYSTEMS · N journal · U cell goals · K market · L boards · J quests · O options";
}

export function dismissSystemsHint() {
  dismissed = true;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* in-memory only */
  }
}

/** Test-only. */
export function __resetSystemsHintForTests() {
  dismissed = false;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

/** City chatter for solo presence — pure cosmetic, no gameplay effect. */
const CHATTER = [
  "metro chatter · runners trading cores on the market",
  "metro chatter · a cell just flipped a node in the stacks",
  "metro chatter · HSS commander spotted — gold banner",
  "metro chatter · FIXER still has jobs on the board",
  "metro chatter · estate sales ticking in the residential grid",
  "metro chatter · forge heat rising — someone fused gear",
  "metro chatter · contagion bloom rumor on the wire",
  "metro chatter · subway garrison still hot",
];

export function cityChatterLine(seed: number): string {
  return CHATTER[((seed % CHATTER.length) + CHATTER.length) % CHATTER.length];
}
