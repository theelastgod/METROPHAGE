// METROPHAGE — first-session coach. Pure local progress so the hub always has a
// "what next" line even before the server campaign loads. Complements campaignHud.

const KEY = "metrophage_first_session_v3";

export type FirstStep =
  | "meet_fixer" // talk to THE FIXER / accept THE WAKE
  | "deploy" // leave hub via deploy gate
  | "combat" // kill at least one HSS unit
  | "heat" // learned HEAT / ultimate once
  | "return" // back to hub (optional)
  | "done";

export interface FirstSessionState {
  step: FirstStep;
  kills: number;
  talkedFixer: boolean;
  deployed: boolean;
  heatCoached: boolean;
  dismissed: boolean; // player hid the coach
}

const DEFAULT: FirstSessionState = {
  step: "meet_fixer",
  kills: 0,
  talkedFixer: false,
  deployed: false,
  heatCoached: false,
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
    if (state.kills >= 1) state.step = state.heatCoached ? "return" : "heat";
  }
  if (state.kills >= 3 && state.heatCoached) state.step = "done";
  save();
}

/** HEAT meter hit the ult threshold once — teach R once, then release the coach. */
export function noteHeatCoached() {
  if (state.heatCoached) return;
  state.heatCoached = true;
  if (state.step === "heat" || state.step === "combat") {
    state.step = state.kills >= 1 ? "return" : "combat";
  }
  if (state.kills >= 3) state.step = "done";
  save();
}

export function noteReturnedToHub() {
  if (state.step === "return" || state.kills >= 1) state.step = "done";
  save();
}

/**
 * Soft first-session funnel: only the *very first* hub moment locks secondary
 * panels (before talking to THE FIXER). Once they've met the FIXER *or* deployed
 * out of the hub, market/forge/guild/etc. unlock — players were bouncing off the
 * hard lock after already accepting THE WAKE.
 */
/** Operator override — set from NetClient.godMode so first-hour gates never brick admins. */
let godUnlock = false;
export function setGodSessionUnlock(on: boolean) {
  godUnlock = on;
  if (on) {
    state.talkedFixer = true;
    if (state.step === "meet_fixer") state.step = "deploy";
    save();
  }
}

/**
 * Optional server-side progress (campaign already running) unlocks systems even if
 * localStorage was wiped mid-session.
 */
let campaignUnlocked = false;
export function noteCampaignProgress(hasActiveOrCompleted: boolean) {
  if (hasActiveOrCompleted) {
    campaignUnlocked = true;
    if (!state.talkedFixer) {
      state.talkedFixer = true;
      if (state.step === "meet_fixer") state.step = "deploy";
      save();
    }
  }
}

export function firstHourSystemsLocked(): boolean {
  if (godUnlock || campaignUnlocked) return false;
  // Unlock after FIXER talk OR after leaving the hub (deploy) — never gate forever.
  if (state.talkedFixer || state.deployed) return false;
  if (state.step !== "meet_fixer") return false;
  return true;
}

/** One-line coach copy for the HUD strip. */
export function firstSessionLine(): string | null {
  if (state.dismissed || state.step === "done") return null;
  switch (state.step) {
    case "meet_fixer":
      return "▶ Talk to THE FIXER (green light / E) — start THE WAKE · then deploy south";
    case "deploy":
      return "▶ DEPLOY south through the gate — enter a combat district";
    case "combat":
      return "▶ ATTACK: hold LEFT CLICK or hold F · aim with mouse · SPACE dash · drop an HSS unit";
    case "heat":
      return "▶ HEAT builds on hits — at orange, press R for your ultimate";
    case "return":
      return "▶ H or map back to METRO CITY when ready · gear up · repeat";
    default:
      return null;
  }
}

/** Core loop always-on reminder (after first session or alongside coach). */
export function coreLoopLine(): string {
  return "LOOP · FIXER → DEPLOY → KILL / NODES → GEAR → REPEAT";
}
