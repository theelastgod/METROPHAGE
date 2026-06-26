// METROPHAGE — onboarding drill zone. Each player learns core mechanics in isolation
// before the one-way portal into the live city. Shared by client UI and the server.

export const TUTORIAL_ZONE = "tutorial";

export type TutorialKind =
  | "move"
  | "fire"
  | "kill"
  | "pickup"
  | "capture"
  | "equip"
  | "chat"
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

/** Ordered lessons — one major mechanic each, before the final deploy portal. */
export const TUTORIAL_STEPS: TutorialStepDef[] = [
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
    teach: "Hold the mouse where you want to shoot. Every bolt is aimed intent — the server validates rate and hit.",
    hint: "Click / hold to fire",
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
    teach: "Other free minds share this world. Zone chat reaches everyone in your district.",
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

export const TUTORIAL_TOTAL = TUTORIAL_STEPS.length;

export function tutorialStepAt(step: number): TutorialStepDef | null {
  return TUTORIAL_STEPS[step] ?? null;
}

export function tutorialReadyForPortal(step: number): boolean {
  return step >= TUTORIAL_STEPS.length - 1;
}