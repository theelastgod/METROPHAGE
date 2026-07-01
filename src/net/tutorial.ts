// METROPHAGE — onboarding drill zone. Each player learns core mechanics in isolation
// before the one-way portal into the live city. Shared by client UI and the server.

export const TUTORIAL_ZONE = "tutorial";

export type TutorialMode = "quick" | "full";

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
  | "travel"
  | "panel"
  | "portal";

export interface TutorialStepDef {
  id: string;
  title: string;
  teach: string;
  hint: string;
  kind: TutorialKind;
  count: number;
}

/** Core loop only — combat, nodes, bag, chat, one systems taste, deploy. */
export const TUTORIAL_STEPS_QUICK: TutorialStepDef[] = [
  {
    id: "move",
    title: "MOVEMENT",
    teach: "You move through the grid with intent only — the server decides where you end up.",
    hint: "WASD or arrow keys",
    kind: "move",
    count: 1,
  },
  {
    id: "fire",
    title: "WEAPON",
    teach: "Your ARC-BLADE is melee from the start — hold the mouse toward a target and swing. The server validates range, arc, and rate.",
    hint: "Click / hold to slash",
    kind: "fire",
    count: 5,
  },
  {
    id: "kill",
    title: "COMBAT",
    teach: "That patrol unit is Human Security System — a Turing Cop. Drop it.",
    hint: "Shoot the red hostile",
    kind: "kill",
    count: 1,
  },
  {
    id: "pickup",
    title: "SALVAGE",
    teach: "Corpses leave salvage. Walk through drops to collect credits and data cores.",
    hint: "Walk over the glowing pickup",
    kind: "pickup",
    count: 1,
  },
  {
    id: "capture",
    title: "TERRITORY",
    teach: "Infection nodes are the city's nervous system. Stand on the node and channel until your cell owns it.",
    hint: "Stand on the violet node",
    kind: "capture",
    count: 1,
  },
  {
    id: "equip",
    title: "GEAR",
    teach: "Loot becomes loadout. Open your bag and equip a piece — stats are server-side.",
    hint: "Press I · click an item to equip",
    kind: "equip",
    count: 1,
  },
  {
    id: "chat",
    title: "UPLINK",
    teach: "Other free minds share this world. Press ENTER — your message appears in the area chat box and as a speech bubble above your character for everyone here.",
    hint: "Press ENTER · type a line",
    kind: "chat",
    count: 1,
  },
  {
    id: "panel",
    title: "SYSTEMS",
    teach: "The safehouse operatives front every system: J contracts · G forge · B vendor · K market · Y wardrobe.",
    hint: "Open any system panel once (J, G, B, …)",
    kind: "panel",
    count: 1,
  },
  {
    id: "portal",
    title: "DEPLOY",
    teach: "The live city waits through the portal. One way only — you cannot return to the drill yard.",
    hint: "Walk into the cyan portal (E)",
    kind: "portal",
    count: 1,
  },
];

/** Every major online system — one lesson each before deploy. */
export const TUTORIAL_STEPS_FULL: TutorialStepDef[] = [
  ...TUTORIAL_STEPS_QUICK.slice(0, 5),
  {
    id: "faction",
    title: "FACTION WAR",
    teach:
      "Your signature colour chose your CELL — one of four factions contesting the city. Capturing nodes scores your cell; the HUD tracks district control and the server-wide war tally.",
    hint: "Press SPACE to continue",
    kind: "faction",
    count: 1,
  },
  TUTORIAL_STEPS_QUICK[5],
  {
    id: "craft",
    title: "FORGE",
    teach: "The forge (G) sinks credits + cores into power: upgrade (+), reforge mods (↻), fuse two same-rarity items (✦), or salvage bag loot (✂). The server validates every craft.",
    hint: "Press G · upgrade, reforge, fuse, or salvage once (free in drill)",
    kind: "craft",
    count: 1,
  },
  {
    id: "vendor",
    title: "VENDOR",
    teach: "The quartermaster (B) sells heals and gear caches for credits. Higher reputation tiers unlock better stock — earned from contracts and jobs.",
    hint: "Press B · open the vendor",
    kind: "vendor",
    count: 1,
  },
  {
    id: "market",
    title: "MARKET",
    teach: "The fence (K) runs a cross-zone auction house. List bag items, bid on player listings, cancel your own — escrow is server-side in D1.",
    hint: "Press K · open the market",
    kind: "market",
    count: 1,
  },
  {
    id: "contracts",
    title: "CONTRACTS",
    teach: "The fixer (J) posts daily contracts — kill quotas, boss hunts, collection runs. Finish them for credits, cores, and vendor reputation.",
    hint: "Press J · open contracts",
    kind: "contracts",
    count: 1,
  },
  {
    id: "cosmetics",
    title: "WARDROBE",
    teach: "The tailor (Y) sells transmog — appearance only, zero combat power. Your look still relays to every other player in the world.",
    hint: "Press Y · open wardrobe",
    kind: "cosmetics",
    count: 1,
  },
  {
    id: "guild",
    title: "CELL",
    teach: "The organizer (C) fronts your guild — a persistent cell with shared bank, roster, ranks, and a level track. Invite free minds, pool resources, fight as a unit.",
    hint: "Press C · open cell panel",
    kind: "guild",
    count: 1,
  },
  {
    id: "board",
    title: "LEADERBOARDS",
    teach: "The board (L) tracks cross-zone achievements and lifetime stats — kills, bosses, deepest district, credits earned. Milestones pay out automatically.",
    hint: "Press L · open leaderboards",
    kind: "board",
    count: 1,
  },
  {
    id: "map",
    title: "NAVIGATION",
    teach: "The map (M) shows what you've seen. Fast travel only unlocks after you reach a zone on foot — deploy gate, transit operatives, or H from districts.",
    hint: "Press M · open the map",
    kind: "map",
    count: 1,
  },
  {
    id: "emote",
    title: "EMOTES",
    teach: "The emote wheel (V) sends gestures above your avatar or drops a world ping other players can see — useful for coordination without chat spam.",
    hint: "Press V · pick an emote or ping",
    kind: "emote",
    count: 1,
  },
  TUTORIAL_STEPS_QUICK[6],
  {
    id: "campaign",
    title: "CAMPAIGN",
    teach:
      "Your personal storyline runs in parallel with everyone else — accept beats from THE FIXER, talk to operatives, and progress a five-act arc persisted to your account.",
    hint: "Press SPACE to continue",
    kind: "campaign",
    count: 1,
  },
  {
    id: "pvp",
    title: "PVP ARENAS",
    teach: "PvP is only in THE CRUCIBLE — a marked arena in the southeast corner of combat districts, away from story beats. Chat, emotes, and trade work everywhere. The server enforces arena damage.",
    hint: "Press SPACE to continue",
    kind: "pvp",
    count: 1,
  },
  {
    id: "trade",
    title: "SECURE TRADE",
    teach: "Face-to-face trades use chat commands: /trade <name> · /offer <credits> <cores> · /confirm on both sides. Either party can /tcancel.",
    hint: "Press SPACE to continue",
    kind: "trade",
    count: 1,
  },
  {
    id: "travel",
    title: "TRAVEL",
    teach: "After tutorial you spawn in the conflict-free safehouse. Accept THE WAKE from THE FIXER, then use the DEPLOY GATE. Transit gates chain districts organically; M and number keys teleport only to zones you've walked into.",
    hint: "Press SPACE to continue",
    kind: "travel",
    count: 1,
  },
  TUTORIAL_STEPS_QUICK[8],
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