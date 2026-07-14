// METROPHAGE — first-session coach. Pure local progress so the hub always has a
// "what next" line even before the server campaign loads. Complements campaignHud.

const KEY = "metrophage_first_session_v4";

export type FirstStep =
  | "meet_fixer" // talk to THE FIXER / accept THE WAKE
  | "deploy" // leave hub via deploy gate
  | "combat" // kill at least one HSS unit
  | "heat" // learned HEAT / ultimate once
  | "contracts" // open daily contracts once
  | "bounty" // accept an NPC bounty once
  | "gear" // open bag / vendor once
  | "return" // back to hub (optional)
  | "done";

export interface FirstSessionState {
  step: FirstStep;
  kills: number;
  talkedFixer: boolean;
  deployed: boolean;
  heatCoached: boolean;
  openedContracts: boolean;
  acceptedBounty: boolean;
  openedGear: boolean;
  dismissed: boolean; // player hid the coach
}

const DEFAULT: FirstSessionState = {
  step: "meet_fixer",
  kills: 0,
  talkedFixer: false,
  deployed: false,
  heatCoached: false,
  openedContracts: false,
  acceptedBounty: false,
  openedGear: false,
  dismissed: false,
};

function load(): FirstSessionState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // migrate v3 if present
      const legacy = localStorage.getItem("metrophage_first_session_v3");
      if (legacy) {
        const p = JSON.parse(legacy) as Partial<FirstSessionState>;
        return { ...DEFAULT, ...p };
      }
      return { ...DEFAULT };
    }
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

function advanceAfterCombatLoop() {
  // After first kill + heat, funnel into systems that create sinks and depth.
  if (!state.openedContracts) {
    state.step = "contracts";
    return;
  }
  if (!state.acceptedBounty) {
    state.step = "bounty";
    return;
  }
  if (!state.openedGear) {
    state.step = "gear";
    return;
  }
  state.step = state.deployed ? "return" : "deploy";
  if (state.kills >= 3 && state.openedContracts && state.openedGear) state.step = "done";
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
    if (state.kills >= 1) state.step = state.heatCoached ? "contracts" : "heat";
  }
  if (state.kills >= 1 && state.heatCoached && state.step === "heat") advanceAfterCombatLoop();
  if (state.kills >= 5 && state.openedContracts && state.openedGear) state.step = "done";
  save();
}

/** HEAT meter hit the ult threshold once — teach R once, then systems funnel. */
export function noteHeatCoached() {
  if (state.heatCoached) return;
  state.heatCoached = true;
  if (state.step === "heat" || state.step === "combat") {
    advanceAfterCombatLoop();
  }
  save();
}

export function noteOpenedContracts() {
  state.openedContracts = true;
  if (state.step === "contracts") advanceAfterCombatLoop();
  save();
}

export function noteAcceptedBounty() {
  state.acceptedBounty = true;
  if (state.step === "bounty") advanceAfterCombatLoop();
  save();
}

export function noteOpenedGear() {
  state.openedGear = true;
  if (state.step === "gear") advanceAfterCombatLoop();
  if (state.kills >= 2 && state.openedContracts) state.step = "done";
  save();
}

export function noteReturnedToHub() {
  if (state.step === "return" || state.kills >= 1) {
    if (!state.openedContracts) state.step = "contracts";
    else if (!state.openedGear) state.step = "gear";
    else state.step = "done";
  }
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
    case "contracts":
      return "▶ Press J — claim a daily CONTRACT (reliable ₵ + rep)";
    case "bounty":
      return "▶ Talk to a named NPC (Rin, Doc, Vex…) — accept their BOUNTY job";
    case "gear":
      return "▶ Open BAG (I) or a vendor stall — equip loot, spend ₵ on caches";
    case "return":
      return "▶ H or map back to METRO CITY when ready · gear up · repeat";
    default:
      return null;
  }
}

/** Core loop always-on reminder (after first session or alongside coach). */
export function coreLoopLine(): string {
  return "LOOP · FIXER → DEPLOY → KILL / NODES → GEAR / CONTRACTS → REPEAT";
}
