// METROPHAGE — onboarding drill zone. Each player learns core mechanics in isolation
// before the one-way portal into the live city. Shared by client UI and the server.

export const TUTORIAL_ZONE = "tutorial";
/** Full-training yard uses a longer systems hallway (own DO / zone id). */
export const TUTORIAL_FULL_ZONE = "tutorial_full";

export type TutorialMode = "quick" | "full";

/** Zone id for a drill mode — full gets a longer hall so instructors aren't crammed. */
export function tutorialZoneForMode(mode: TutorialMode): string {
  return mode === "full" ? TUTORIAL_FULL_ZONE : TUTORIAL_ZONE;
}

export function isTutorialZone(z: string | null | undefined): boolean {
  return z === TUTORIAL_ZONE || z === TUTORIAL_FULL_ZONE;
}

export function tutorialModeFromZone(z: string | null | undefined): TutorialMode {
  return z === TUTORIAL_FULL_ZONE ? "full" : "quick";
}

export type TutorialKind =
  | "move"
  | "fire"
  | "kill"
  | "pickup"
  | "capture"
  | "faction"
  | "equip"
  | "craft"
  | "vendor"
  | "market"
  | "contracts"
  | "cosmetics"
  | "guild"
  | "board"
  | "map"
  | "emote"
  | "chat"
  | "campaign"
  | "pvp"
  | "trade"
  | "metro"
  | "travel"
  | "panel"
  | "kit"
  | "portal";

export interface TutorialStepDef {
  id: string;
  title: string;
  teach: string;
  hint: string;
  kind: TutorialKind;
  count: number;
}

/**
 * Lessons that clear by talking to the matching drill instructor (E) or SPACE.
 * Includes systems briefings AND the main path lessons that have an authored
 * instructor — talking used to only clear faction/campaign/pvp/trade/travel,
 * so runners walking instructor→instructor never advanced (stuck forever).
 * Combat actions (fire/kit/kill/pickup/capture) still also advance via the real
 * mechanic; either path works so nobody gets soft-locked.
 */
export const TUTORIAL_TALK_KINDS: readonly TutorialKind[] = [
  "move",
  "fire",
  "kit",
  "kill",
  "pickup",
  "capture",
  "equip",
  "chat",
  "panel",
  "faction",
  "campaign",
  "pvp",
  "trade",
  "metro",
  "travel",
] as const;

export function isTutorialTalkKind(kind: TutorialKind): boolean {
  return (TUTORIAL_TALK_KINDS as readonly string[]).includes(kind);
}

/** True when talking to the matching instructor should count as lesson progress. */
export function instructorClearsKind(kind: TutorialKind): boolean {
  return isTutorialTalkKind(kind);
}

// Named step defs — FULL and QUICK compose by reference so index drift never breaks curricula.
const MOVE: TutorialStepDef = {
  id: "move",
  title: "MOVEMENT",
  teach: "You move through the grid with intent only — the server decides where you end up.",
  hint: "WASD or arrow keys · walk a few tiles",
  kind: "move",
  count: 1,
};

const FIRE: TutorialStepDef = {
  id: "fire",
  title: "WEAPON",
  teach:
    "Your ARC-BLADE is melee from the start — aim with the mouse, then HOLD LEFT CLICK or HOLD F to swing. The server validates range, arc, and rate.",
  hint: "HOLD CLICK or F to slash · land 3 swings",
  kind: "fire",
  count: 3,
};

const KIT: TutorialStepDef = {
  id: "kit",
  title: "CLASS KIT",
  teach:
    "SPACE dashes — you are untouchable mid-blink. Q and E are your class abilities; the server owns every cooldown, so spam buys nothing. Learn the kit before you fight.",
  hint: "Dash (SPACE), then cast Q or E",
  kind: "kit",
  count: 2,
};

const KILL: TutorialStepDef = {
  id: "kill",
  title: "COMBAT",
  teach: "That patrol unit is Human Security System — a Turing Cop. Dash in, slash it down.",
  hint: "Drop the red hostile in the combat pit",
  kind: "kill",
  count: 1,
};

const PICKUP: TutorialStepDef = {
  id: "pickup",
  title: "SALVAGE",
  teach: "Corpses leave salvage. Walk through drops to collect credits and data cores.",
  hint: "Walk over the glowing pickup",
  kind: "pickup",
  count: 1,
};

const CAPTURE: TutorialStepDef = {
  id: "capture",
  title: "TERRITORY",
  teach: "Infection nodes are the city's nervous system. Stand on the node and channel until your cell owns it.",
  hint: "Stand on the violet node",
  kind: "capture",
  count: 1,
};

const EQUIP: TutorialStepDef = {
  id: "equip",
  title: "GEAR",
  teach: "Loot becomes loadout. Open your bag and equip a piece — stats are server-side.",
  hint: "Press I · click an item to equip",
  kind: "equip",
  count: 1,
};

const CHAT: TutorialStepDef = {
  id: "chat",
  title: "UPLINK",
  teach:
    "Other free minds share this world. Press ENTER — your message appears in the area chat box and as a speech bubble above your character for everyone here.",
  hint: "Press ENTER · type a line · send",
  kind: "chat",
  count: 1,
};

const PANEL: TutorialStepDef = {
  id: "panel",
  title: "SYSTEMS",
  teach:
    "The safehouse operatives front every system: J contracts · G forge · B vendor · K market · Y wardrobe. The floating ◈ $METRO button opens the bridge when a contract address is live.",
  hint: "Open any system panel once (J, G, B, …) · ◈ is the bridge",
  kind: "panel",
  count: 1,
};

const PORTAL: TutorialStepDef = {
  id: "portal",
  title: "DEPLOY",
  teach: "The live city waits through the portal. One way only — you cannot return to the drill yard.",
  hint: "Walk into the cyan portal (E)",
  kind: "portal",
  count: 1,
};

const FACTION: TutorialStepDef = {
  id: "faction",
  title: "FACTION WAR",
  teach:
    "Your signature colour chose your CELL — one of four factions contesting the city. Capturing nodes scores your cell; the HUD tracks district control and the server-wide war tally.",
  hint: "Talk to CELL LIAISON (E) · or SPACE",
  kind: "faction",
  count: 1,
};

const CAMPAIGN: TutorialStepDef = {
  id: "campaign",
  title: "CAMPAIGN",
  teach:
    "Your personal storyline runs in parallel with everyone else — accept beats from THE FIXER, talk to operatives, and progress a five-act arc persisted to your account.",
  hint: "Talk to STORY ARCHIVIST (E) · or SPACE",
  kind: "campaign",
  count: 1,
};

const PVP: TutorialStepDef = {
  id: "pvp",
  title: "PVP ARENAS",
  teach:
    "PvP is only in THE CRUCIBLE — a marked arena in the southeast corner of combat districts, away from story beats. Chat, emotes, and trade work everywhere. The server enforces arena damage.",
  hint: "Talk to ARENA MARSHAL (E) · or SPACE",
  kind: "pvp",
  count: 1,
};

const TRADE: TutorialStepDef = {
  id: "trade",
  title: "SECURE TRADE",
  teach:
    "Face-to-face trades use chat commands: /trade <name> · /offer <credits> <cores> · /confirm on both sides. Either party can /tcancel.",
  hint: "Talk to ESCROW AGENT (E) · or SPACE",
  kind: "trade",
  count: 1,
};

const METRO_BRIDGE: TutorialStepDef = {
  id: "metro",
  title: "$METRO BRIDGE",
  teach:
    "The ◈ $METRO bridge is a player-funded cash-out rail on Solana. Deposits add to the pool; withdrawals only pay while the pool can cover them — otherwise: Check back later.",
  hint: "Talk to BRIDGE BROKER (E) · or SPACE",
  kind: "metro",
  count: 1,
};

const TRAVEL: TutorialStepDef = {
  id: "travel",
  title: "TRAVEL",
  teach:
    "After tutorial you spawn in the conflict-free safehouse. Accept THE WAKE from THE FIXER, then use the DEPLOY GATE. Transit gates chain districts organically; M and number keys teleport only to zones you've walked into.",
  hint: "Talk to GATE OFFICER (E) · or SPACE",
  kind: "travel",
  count: 1,
};

/**
 * Core loop — walk the yard west→east:
 * move → practice swing → learn kit → first blood → salvage → node → bag → chat → one panel → deploy.
 * Kit sits before combat so new runners dash into the pit instead of discovering Space mid-fight.
 */
export const TUTORIAL_STEPS_QUICK: TutorialStepDef[] = [
  MOVE,
  FIRE,
  KIT,
  KILL,
  PICKUP,
  CAPTURE,
  EQUIP,
  CHAT,
  PANEL,
  PORTAL,
];

/** Full-mode systems taste — open any three city panels (not one each). */
const SYSTEMS_TASTE: TutorialStepDef = {
  id: "systems",
  title: "SYSTEMS TOUR",
  teach:
    "City services live on hotkeys: J contracts · G forge · B vendor · K market · Y wardrobe · C cell · L board · M map · V emotes. Open any three once — free practice in the drill.",
  hint: "Open 3 different panels (J/G/B/K/Y/C/L/M/V)",
  kind: "panel",
  count: 3,
};

/**
 * Full training, playable length (~16 lessons). Composed by named refs.
 * Panels collapse into one count-3 systems taste instead of ten open-once stops.
 */
export const TUTORIAL_STEPS_FULL: TutorialStepDef[] = [
  // Combat corridor
  MOVE,
  FIRE,
  KIT,
  KILL,
  PICKUP,
  CAPTURE,
  // Commissary
  EQUIP,
  CHAT,
  // Systems Court
  FACTION,
  SYSTEMS_TASTE,
  // Briefings (talk / SPACE)
  CAMPAIGN,
  PVP,
  TRADE,
  METRO_BRIDGE,
  TRAVEL,
  // Always last
  PORTAL,
];

export function tutorialSteps(mode: TutorialMode = "quick"): TutorialStepDef[] {
  return mode === "full" ? TUTORIAL_STEPS_FULL : TUTORIAL_STEPS_QUICK;
}

export function tutorialTotal(mode: TutorialMode = "quick"): number {
  return tutorialSteps(mode).length;
}

export function tutorialStepAt(step: number, mode: TutorialMode = "quick"): TutorialStepDef | null {
  return tutorialSteps(mode)[step] ?? null;
}

export function tutorialReadyForPortal(step: number, mode: TutorialMode = "quick"): boolean {
  return step >= tutorialTotal(mode) - 1;
}

/** @deprecated use tutorialTotal(mode) */
export const TUTORIAL_TOTAL = tutorialTotal("quick");
