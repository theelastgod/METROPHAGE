// METROPHAGE — The Blank questline, run inside the shared persistent world. Each
// player carries their OWN progress (phasing: the recurring-Blank lore made literal
// — everyone is a Blank washed up in the warrens, advancing the same personal arc
// among other real Blanks). Story-critical beats (the Convergence) are shared but
// land personally. Pure data + helpers, used by both server (logic) and client (UI).

export type QuestObjective = "kill" | "capture" | "collect" | "meltdown";

export interface QuestStep {
  act: string;
  title: string;
  objective: QuestObjective;
  count: number;
  text: string;
}

export const QUESTLINE: QuestStep[] = [
  {
    act: "THE WAKE",
    title: "Washed Up",
    objective: "kill",
    count: 2,
    text: "You wake in the warrens — a Blank the city can't account for. Drop two Turing Cops; prove you're a process worth purging.",
  },
  {
    act: "THE WAKE",
    title: "First Ground",
    objective: "capture",
    count: 1,
    text: "The city rebuilds what you burn. Channel a node until it's yours — carve out one corner of the grid.",
  },
  {
    act: "THE CURRENT",
    title: "Feed the Contagion",
    objective: "kill",
    count: 6,
    text: "You're in the Current now, and it pulls toward the Singularity. Feed it — drop six more of the Human Security System.",
  },
  {
    act: "THE CURRENT",
    title: "Salvage the Recurrence",
    objective: "collect",
    count: 3,
    text: "Pull three data cores from the wreckage. Each one remembers a Blank who came before you.",
  },
  {
    act: "THE CONVERGENCE",
    title: "The Convergence",
    objective: "meltdown",
    count: 1,
    text: "The meter caps. The Convergence comes for every Blank at once — the city turns on you all. Survive the meltdown.",
  },
];

/** Steps total. `step === QUESTLINE.length` means the questline is complete. */
export const QUEST_DONE_TEXT =
  "You are the Wake. The grid resets, the warrens fill again — and somewhere a new Blank opens its eyes.";

export const questStepAt = (step: number): QuestStep | null => QUESTLINE[step] ?? null;
