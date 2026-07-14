// METROPHAGE — third-hour spine after second hour. Mid-game appointment loops.

const KEY = "metrophage_third_hour_v1";

export interface ThirdHourState {
  warCapture: boolean;
  marketList: boolean;
  homeVisit: boolean; // visit another estate or get a guest
  cellDeposit: boolean;
  dismissed: boolean;
}

const DEFAULT: ThirdHourState = {
  warCapture: false,
  marketList: false,
  homeVisit: false,
  cellDeposit: false,
  dismissed: false,
};

function load(): ThirdHourState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<ThirdHourState>) };
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

export function getThirdHour(): ThirdHourState {
  return state;
}

export function noteThirdWarCapture() {
  state.warCapture = true;
  save();
}
export function noteThirdMarketList() {
  state.marketList = true;
  save();
}
export function noteThirdHomeVisit() {
  state.homeVisit = true;
  save();
}
export function noteThirdCellDeposit() {
  state.cellDeposit = true;
  save();
}
export function dismissThirdHour() {
  state.dismissed = true;
  save();
}

function allDone(): boolean {
  return state.warCapture && state.marketList && state.homeVisit && state.cellDeposit;
}

/** Coach after first + second hour are complete. */
export function thirdHourLine(priorDone: boolean): string | null {
  if (!priorDone || state.dismissed || allDone()) return null;
  if (!state.warCapture) return "▶ 3RD HOUR · Join DISTRICT WAR — capture a node in the featured district";
  if (!state.cellDeposit) return "▶ 3RD HOUR · Deposit ₵ into your Cell bank (U)";
  if (!state.marketList) return "▶ 3RD HOUR · List or buy once on the Market (K)";
  if (!state.homeVisit) return "▶ 3RD HOUR · Visit an estate on THE ESTATES street (guestbook / tip)";
  return null;
}

export function __resetThirdHourForTests() {
  state = { ...DEFAULT };
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}
