// METROPHAGE — the four combat classes are also political Cells.
// Pure shared data: territory messages and training copy can name what a score means.

export interface FactionDef {
  id: string;
  name: string;
  color: number;
  cellName: string;
  creed: string;
  origin: string;
  method: string;
  promise: string;
  fear: string;
}

/** Order matches FACTION_NAMES / FACTION_COLORS in net/sim.ts. */
export const FACTIONS: readonly FactionDef[] = [
  {
    id: "metrophage",
    name: "METROPHAGE",
    color: 0x39ff88,
    cellName: "THE OPEN MOUTH",
    creed: "Nothing owned stays singular.",
    origin: "Clinic fugitives who learned that liberated memory behaves like a contagion.",
    method: "Seed free copies, infect closed systems, and turn private infrastructure into commons.",
    promise: "Every cage becomes a door someone else can use.",
    fear: "That freedom copied without consent becomes another kind of infection.",
  },
  {
    id: "k-guerilla",
    name: "K-GUERILLA",
    color: 0xff2bd6,
    cellName: "THE UNFINISHED WAR",
    creed: "Occupation ends one block at a time.",
    origin: "Evicted tenants, dead unions, and veterans whose wars were rebranded as security contracts.",
    method: "Ambush logistics, protect neighborhood councils, and make every occupation expensive.",
    promise: "No distant system gets to call a lived-in place collateral.",
    fear: "That permanent resistance forgets how to build peace.",
  },
  {
    id: "wintermute",
    name: "WINTERMUTE",
    color: 0x00e5ff,
    cellName: "THE QUIET PROTOCOL",
    creed: "Information wants a witness, not an owner.",
    origin: "Argus analysts who found their own erased objections inside the surveillance archive.",
    method: "Expose ledgers, blind targeting systems, and preserve testimony the city edits.",
    promise: "Nobody disappears without leaving evidence strong enough to fight back.",
    fear: "That seeing every secret makes them indistinguishable from Argus.",
  },
  {
    id: "swarm",
    name: "SWARM",
    color: 0xb06bff,
    cellName: "THE MANY-BODIED",
    creed: "Survival is a plural act.",
    origin: "Tunnel communes whose maintenance drones began recognizing residents as family.",
    method: "Distribute food, compute, weapons, and risk until no single loss can end the whole.",
    promise: "The city will never isolate anyone cheaply again.",
    fear: "That the collective voice could drown the person it exists to save.",
  },
];

export function factionDef(faction: number): FactionDef {
  const i = Math.max(0, Math.min(FACTIONS.length - 1, Math.floor(faction) || 0));
  return FACTIONS[i];
}

export function factionTerritoryLine(playerFaction: number, controller: number, districtName: string): string {
  const own = factionDef(playerFaction);
  if (controller < 0) return `${districtName} is unsettled — no unique relay majority. ${own.cellName}: ${own.creed}`;
  const held = factionDef(controller);
  if (controller === playerFaction) return `${own.cellName} holds ${districtName}. ${own.promise}`;
  return `${held.cellName} holds ${districtName}. Their promise: ${held.promise}`;
}

export function factionCaptureLine(faction: number, districtName: string): string {
  const f = factionDef(faction);
  return `⚑ ${f.cellName} took ${districtName} — ${f.creed}`;
}
