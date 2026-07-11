// METROPHAGE — contracts (the content engine). Data-driven: a contract is data
// the scene consumes via the Contracts system. Types: eliminate / infect / hack /
// hold / deliver. A few authored intro contracts + generated repeatables.

export type ObjectiveType = "eliminate" | "infect" | "hack" | "hold" | "deliver";

export interface Objective {
  type: ObjectiveType;
  need: number; // kills / breaks / captures / seconds / 1 (reach)
  have: number;
  zone?: { x: number; y: number; r: number }; // assigned by the scene for hold/deliver
}

export interface ContractRewards {
  xp: number;
  currency: number;
  loot: number; // item count
  lootBoost: number; // rarity boost
}

export interface Contract {
  id: string;
  name: string;
  kind: ObjectiveType; // primary type (for display)
  difficulty: number; // 1..3
  authored: boolean;
  briefing?: string[]; // dialogue lines shown on accept
  objectives: Objective[];
  rewards: ContractRewards;
}

const obj = (type: ObjectiveType, need: number): Objective => ({ type, need, have: 0 });

/** Authored intro arc — play in order; each unlocks the next. */
export const AUTHORED: Contract[] = [
  {
    id: "arc_first_contact",
    name: "FIRST CONTACT",
    kind: "eliminate",
    difficulty: 1,
    authored: true,
    briefing: [
      "New blood. Let's see if you bite.",
      "Three Anduril enforcers are sweeping the plaza. Delete them.",
    ],
    objectives: [obj("eliminate", 3)],
    rewards: { xp: 60, currency: 40, loot: 1, lootBoost: 0 },
  },
  {
    id: "arc_city_veins",
    name: "CITY VEINS",
    kind: "infect",
    difficulty: 1,
    authored: true,
    briefing: [
      "The city runs on nodes. Take one and it starts to rot from inside.",
      "Channel the node down the street. Don't let them shake you off.",
    ],
    objectives: [obj("infect", 1)],
    rewards: { xp: 90, currency: 60, loot: 1, lootBoost: 0.5 },
  },
  {
    id: "arc_ice_breaker",
    name: "ICE BREAKER",
    kind: "hack",
    difficulty: 2,
    authored: true,
    briefing: [
      "Enforcers hide behind ICE shields. Crack them open.",
      "Break two Enforcer shields — WINTERMUTE does it fastest, but anyone can chip through.",
    ],
    objectives: [obj("hack", 2)],
    rewards: { xp: 120, currency: 90, loot: 2, lootBoost: 1 },
  },
];

const REPEATABLE: ObjectiveType[] = ["eliminate", "hack", "hold", "deliver"];
let genCount = 0;
const ri = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

const NAMES: Record<ObjectiveType, string[]> = {
  eliminate: ["SWEEP", "PURGE ORDER", "CULL"],
  hack: ["ICE PICK", "SHATTER", "COLD CALL"],
  hold: ["HOLD THE LINE", "ANCHOR", "STANDOFF"],
  deliver: ["DEAD DROP", "COURIER", "RUN IT"],
  infect: ["INFEST", "SPREAD", "VECTOR"],
};

/** Generate a repeatable contract scaled to player level. */
export function generateRepeatable(level: number): Contract {
  const kind = REPEATABLE[ri(0, REPEATABLE.length - 1)];
  const difficulty = ri(1, 3);
  const names = NAMES[kind];
  let need = 1;
  if (kind === "eliminate") need = 4 + difficulty * 2;
  else if (kind === "hack") need = 1 + difficulty;
  else if (kind === "hold") need = 8 + difficulty * 4; // seconds
  else if (kind === "deliver") need = 1;

  return {
    id: `gen_${++genCount}`,
    name: names[ri(0, names.length - 1)],
    kind,
    difficulty,
    authored: false,
    objectives: [obj(kind, need)],
    rewards: {
      xp: 30 + difficulty * 25 + level * 4,
      currency: 25 + difficulty * 20,
      loot: difficulty >= 3 ? 2 : 1,
      lootBoost: difficulty * 0.5,
    },
  };
}

/** Human-readable progress label for the active objective. */
export function objectiveLabel(o: Objective): string {
  switch (o.type) {
    case "eliminate":
      return `ELIMINATE ${o.have}/${o.need}`;
    case "hack":
      return `BREAK SHIELDS ${o.have}/${o.need}`;
    case "infect":
      return `INFECT NODE ${o.have}/${o.need}`;
    case "hold":
      return `HOLD ZONE ${Math.floor(o.have)}/${o.need}s`;
    case "deliver":
      return o.have >= o.need ? "DELIVERED" : "REACH THE MARKER";
  }
}
