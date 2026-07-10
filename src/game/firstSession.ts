// METROPHAGE — first-session coach. Pure local progress so the hub always has a
// "what next" line even before the server campaign loads. Complements campaignHud.

const KEY = "metrophage_first_session_v2";

export type FirstStep =
  | "meet_fixer" // talk to THE FIXER / accept THE WAKE
  | "deploy" // leave hub via deploy gate
  | "combat" // kill at least one HSS unit
  | "return" // back to hub (optional)
  | "done";

export interface FirstSessionState {
  step: FirstStep;
  kills: number;
  talkedFixer: boolean;
  deployed: boolean;
  dismissed: boolean; // player hid the coach
}

const DEFAULT: FirstSessionState = {
  step: "meet_fixer",
  kills: 0,
  talkedFixer: false,
  deployed: false,
  dismissed: false,
};

function load(): FirstSessionState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<FirstSessionState>) };
  } catch {
    return { ...DEFAULT };
  }
}

let state: FirstSessionState = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
}

export function getFirstSession(): FirstSessionState {
  return state;
}

export function resetFirstSession() {
  state = { ...DEFAULT };
  save();
}

export function dismissFirstSession() {
  state.dismissed = true;
  save();
}

export function noteTalkedFixer() {
  state.talkedFixer = true;
  if (state.step === "meet_fixer") state.step = "deploy";
  save();
}

export function noteDeployed() {
  state.deployed = true;
  if (state.step === "meet_fixer" || state.step === "deploy") state.step = "combat";
  save();
}

export function noteKill() {
  state.kills++;
  if (state.step === "combat" || state.step === "deploy") {
    if (state.kills >= 1) state.step = "return";
  }
  if (state.kills >= 3) state.step = "done";
  save();
}

export function noteReturnedToHub() {
  if (state.step === "return" || state.kills >= 1) state.step = "done";
  save();
}

/** One-line coach copy for the HUD strip. */
export function firstSessionLine(): string | null {
  if (state.dismissed || state.step === "done") return null;
  switch (state.step) {
    case "meet_fixer":
      return "▶ GO TO THE FIXER (green light) — accept THE WAKE";
    case "deploy":
      return "▶ DEPLOY south through the gate — enter a combat district";
    case "combat":
      return "▶ FIGHT HSS units — clear the street";
    case "return":
      return "▶ H or map back to METRO CITY when ready";
    default:
      return null;
  }
}

/** Core loop always-on reminder (after first session or alongside coach). */
export function coreLoopLine(): string {
  return "LOOP · FIXER → DEPLOY → KILL / NODES → GEAR → REPEAT";
}
