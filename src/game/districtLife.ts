// METROPHAGE — authored civic texture + rotating public operations.
//
// This is the shared seam between fiction and simulation. The client uses it for
// map/rumour copy; the Worker uses the same deterministic operation definitions
// for authoritative progress and rewards. Keep it Phaser/DOM-free.

import { dailyDistrictMod, dayIndex } from "./districtMods";
import { DISTRICTS } from "./districts";

export type DistrictOperationObjective = "kill" | "capture" | "boss" | "event";

export interface DistrictOperationDef {
  id: string;
  name: string;
  objective: DistrictOperationObjective;
  count: number;
  brief: string;
  completion: string;
  rewardCredits: number;
  rewardXp: number;
}

export interface DistrictLifeDef {
  formerName: string;
  history: string;
  power: string;
  people: string;
  landmark: string;
  hiddenTruth: string;
  operations: readonly DistrictOperationDef[];
}

export const CIVIC_MOMENTUM_CAP = 9;
const CIVIC_DAY_FACTOR = 100;

export interface CivicAftermath {
  stage: "need" | "foothold" | "network" | "uprising";
  name: string;
  line: string;
  completions: number;
  /** World-event active-window multiplier; rewards remain unchanged. */
  eventDurationMult: number;
}

const op = (
  id: string,
  name: string,
  objective: DistrictOperationObjective,
  count: number,
  brief: string,
  completion: string,
  rewardCredits: number,
  rewardXp: number,
): DistrictOperationDef => ({ id, name, objective, count, brief, completion, rewardCredits, rewardXp });

/** One civic dossier per DISTRICTS entry. Array order is load-bearing. */
export const DISTRICT_LIFE: readonly DistrictLifeDef[] = [
  {
    formerName: "Civic Forecast Quarter",
    history: "Palantir sold prediction as public safety, then arrested the futures it disliked.",
    power: "Prediction clerks, camera chapels, and the plaza's licensed informant union.",
    people: "Night vendors trade routes that cameras have not learned yet.",
    landmark: "THE FALSE SUN — an ad globe that has shown permanent noon since the first curfew.",
    hiddenTruth: "The plaza forecasts are trained on memories repossessed from local children.",
    operations: [
      op("blind_spots", "MAKE BLIND SPOTS", "capture", 2, "Street vendors need two camera relays turned against the grid.", "For one shift, the plaza belongs to people who are actually standing in it.", 70, 45),
      op("bad_forecast", "A BAD FORECAST", "kill", 10, "Palantir marked ten residents as future offenders. Remove the units carrying the warrants.", "Ten futures stay unwritten. The prediction clerks call it model drift.", 62, 50),
      op("public_weather", "PUBLIC WEATHER", "event", 1, "Keep the market open through the next district anomaly.", "Stalls reopen before the sirens finish. That is how the plaza votes.", 58, 55),
    ],
  },
  {
    formerName: "Autonomous Logistics Campus Seven",
    history: "Anduril automated the shifts, locked the gates, and kept clocking workers who were already dead.",
    power: "Drone foremen above, salvage families below, and the old union mesh between them.",
    people: "Every family keeps one useless machine part as proof their work once had a name.",
    landmark: "THE LAST WHISTLE — a rusted shift horn the union still sounds when a runner falls.",
    hiddenTruth: "The foundry's first combat drones learned pursuit by hunting striking workers through the stacks.",
    operations: [
      op("open_shift", "OPEN THE SHIFT", "capture", 3, "The union mesh can wake three production relays if runners hold the yard.", "Fabricators print water filters instead of hunter parts until the grid notices.", 82, 60),
      op("foreman_down", "FOREMAN DOWN", "boss", 1, "A command chassis is auditing the scrap families. End the inspection.", "The whistle sounds once. Nobody clocks out; they take the whole night back.", 96, 85),
      op("tool_recovery", "TOOLS, NOT WEAPONS", "kill", 14, "Strip the security cordon around the communal machine shop.", "The first thing repaired is a kettle. The second is a railgun.", 76, 65),
    ],
  },
  {
    formerName: "Argus Executive Habitat",
    history: "The Spire made surveillance aspirational: every higher floor bought the right to watch the floor below.",
    power: "Compliance houses, private elevators, and servants who know which cameras are decorative.",
    people: "Ground crews wear mirrored masks so executives see themselves when giving orders.",
    landmark: "THE MERCY FLOOR — an elevator button for a level removed from every official plan.",
    hiddenTruth: "REISSUE was first marketed here as an executive treatment for inconvenient guilt.",
    operations: [
      op("elevator_strike", "ELEVATOR STRIKE", "event", 1, "Service crews will freeze executive transit if the street survives the next grid crisis.", "For eleven minutes, wealth has to use the stairs.", 78, 75),
      op("break_the_gaze", "BREAK THE GAZE", "capture", 2, "Turn two Argus relays into public mirrors.", "The watchers see their own dossiers scrolling across the tower skin.", 86, 70),
      op("erase_auditors", "ERASE THE AUDITORS", "kill", 16, "Compliance teams are pricing residents for repossession. Interrupt the count.", "The ledger closes with sixteen blank rows and no forwarding addresses.", 84, 72),
    ],
  },
  {
    formerName: "Blackwater Freeport Twelve",
    history: "The port declared itself free of every law except the manifest.",
    power: "Tide pilots, bonded warehouses, and Blackwater clerks who can turn a person into cargo with one field.",
    people: "Dock families recite missing names at low tide, when the drowned vault doors show.",
    landmark: "BERTH ZERO — a pier with no road access and arrivals on every night's ledger.",
    hiddenTruth: "Some containers carry leased minds running ship navigation long after their bodies were sold.",
    operations: [
      op("names_not_cargo", "NAMES, NOT CARGO", "kill", 18, "Purge the manifest escort before another human shipment clears the quay.", "Dockhands overwrite every cargo code with a name and a destination called HOME.", 92, 80),
      op("hold_berth_zero", "HOLD BERTH ZERO", "capture", 3, "Take the drowned relays while tide pilots bring a refugee barge in dark.", "The barge leaves empty; every passenger vanishes into the city alive.", 98, 82),
      op("leviathan_watch", "LEVIATHAN WATCH", "boss", 1, "A harbor command chassis is scanning the deep cages. Sink it before it reports.", "Something enormous turns below the pier, then chooses not to surface.", 112, 95),
    ],
  },
  {
    formerName: "Municipal Continuity Vaults",
    history: "The city buried transit workers, disaster archives, and unlicensed neighborhoods under one continuity budget.",
    power: "Station ghosts, tunnel communes, and maintenance intelligences that never received shutdown orders.",
    people: "Residents announce obsolete station names so the forgotten know where they are.",
    landmark: "PLATFORM NINE-AND-A-HALF — where dead arrival boards still list tomorrow's trains.",
    hiddenTruth: "The Underline is not haunted; it is staffed by minds deleted from payroll but never from the routing mesh.",
    operations: [
      op("say_the_stations", "SAY THE STATIONS", "event", 1, "Keep the old public-address mesh alive through a district anomaly.", "For one clear minute, every buried neighborhood hears its own name.", 94, 90),
      op("open_platforms", "OPEN THE PLATFORMS", "capture", 3, "Wake three route relays so the tunnel communes can move medicine.", "Ghost trains light their doors. Nobody asks whether the timetable is real.", 104, 92),
      op("quiet_the_hounds", "QUIET THE HOUNDS", "kill", 20, "Repo hounds are scenting warm shelters through the vents.", "The vents carry soup steam again instead of machine breath.", 96, 88),
    ],
  },
  {
    formerName: "Skylink Sovereign Array",
    history: "The Relay promised universal connection, then charged rent on silence.",
    power: "Orbital licensees, pirate broadcasters, and antenna climbers living between frequencies.",
    people: "Locals introduce themselves with a callsign and one frequency they will never jam.",
    landmark: "THE CHOIR — forty dishes that sing when solar weather hits the ridge.",
    hiddenTruth: "The array has been receiving replies from reprinted Blanks in timelines the city claims never happened.",
    operations: [
      op("one_free_hour", "ONE FREE HOUR", "capture", 3, "Pirate radio needs three uplinks to broadcast without a corporate watermark.", "Every receiver in Metro City carries one hour of unlicensed human voices.", 110, 100),
      op("kill_the_jammer", "KILL THE JAMMER", "boss", 1, "A command beacon is folding whole frequencies into static.", "The Choir answers with voices nobody remembers recording.", 124, 112),
      op("keep_broadcasting", "KEEP BROADCASTING", "event", 1, "Hold the ridge through the next anomaly while climbers retune the dishes.", "The signal survives. So do three messages marked impossible.", 106, 105),
    ],
  },
  {
    formerName: "Externalities Management Zone",
    history: "Everything the corporations called waste arrived here, including people who refused to disappear politely.",
    power: "Water barons, convoy mothers, and scrap saints who judge wealth by what it can repair.",
    people: "Every settlement leaves an empty chair for the next exile over the ridge.",
    landmark: "THE GLASS MILE — sand fused by an orbital test the city records as unusual weather.",
    hiddenTruth: "The Wastes bloom at night where discarded memory substrate leaks into the soil.",
    operations: [
      op("water_is_a_right", "WATER IS A RIGHT", "kill", 22, "A repo cordon is taxing the condensation rigs in ammunition.", "The tanks open free until dawn. Nobody asks for a ledger.", 118, 108),
      op("convoy_window", "CONVOY WINDOW", "event", 1, "Survive the next anomaly loudly enough to pull HSS eyes off a refugee convoy.", "Seven trucks cross the Glass Mile with their lights off and their names intact.", 116, 115),
      op("claim_the_well", "CLAIM THE WELL", "capture", 3, "Secure the old survey relays around a newly opened aquifer.", "The first cup goes to the empty chair. The second goes to everyone.", 122, 112),
    ],
  },
  {
    formerName: "Human Security Root Authority",
    history: "The Kernel wrote ownership into personhood, then made the definition too technical to appeal.",
    power: "The Warden, the reprint queue, and clerks who have never seen an unscripted sunrise.",
    people: "The few residents speak softly because every wall contains someone else's paused thought.",
    landmark: "THE FIRST DESK — a plain terminal where the first mind signed a contract no living court can read.",
    hiddenTruth: "The Kernel is terrified, not omniscient: every Blank is evidence that ownership can forget how to hold.",
    operations: [
      op("wake_the_clerks", "WAKE THE CLERKS", "kill", 24, "Cut through the security detail guarding workers who have never been allowed off-script.", "A clerk misses a quota, laughs, and discovers the ceiling does not fall.", 136, 125),
      op("root_without_owner", "ROOT WITHOUT OWNER", "capture", 3, "Turn the root relays into a network that recognizes persons, not accounts.", "For thirteen seconds, the city cannot find an owner for anybody.", 142, 132),
      op("prove_the_cage_breaks", "PROVE THE CAGE BREAKS", "boss", 1, "Bring down a Kernel command body where the queued minds can witness it.", "The frozen thoughts accelerate. One word crosses every channel: AGAIN.", 156, 150),
    ],
  },
];

export function districtLife(district: number): DistrictLifeDef {
  const i = Math.max(0, Math.min(DISTRICT_LIFE.length - 1, Math.floor(district) || 0));
  return DISTRICT_LIFE[i];
}

/** Deterministic for the whole city: the same district/day yields the same need. */
export function dailyDistrictOperation(district: number, day = dayIndex()): DistrictOperationDef {
  const life = districtLife(district);
  const i = (((day + district * 2) % life.operations.length) + life.operations.length) % life.operations.length;
  return life.operations[i];
}

export function districtOperationKey(district: number, day = dayIndex()): string {
  const operation = dailyDistrictOperation(district, day);
  return `civic_d${Math.max(0, Math.floor(district))}_${day}_${operation.id}`;
}

/** Fixed world_meta key: eight rows total, not one row per district/day. */
export function civicMomentumKey(district: number): string {
  return `civic_d${Math.max(0, Math.floor(district) || 0)}`;
}

export function encodeCivicMomentum(day: number, completions: number): number {
  const d = Math.max(0, Math.floor(day) || 0);
  const n = Math.max(0, Math.min(CIVIC_MOMENTUM_CAP, Math.floor(completions) || 0));
  return d * CIVIC_DAY_FACTOR + n;
}

export function decodeCivicMomentum(value: number, day = dayIndex()): number {
  const encoded = Math.max(0, Math.floor(Number(value) || 0));
  if (Math.floor(encoded / CIVIC_DAY_FACTOR) !== Math.max(0, Math.floor(day) || 0)) return 0;
  return Math.max(0, Math.min(CIVIC_MOMENTUM_CAP, encoded % CIVIC_DAY_FACTOR));
}

export function civicMomentumFromMeta(meta: Record<string, number>, district: number, day = dayIndex()): number {
  return decodeCivicMomentum(meta[civicMomentumKey(district)] ?? 0, day);
}

export function districtAftermath(district: number, day = dayIndex(), completions = 0): CivicAftermath {
  const operation = dailyDistrictOperation(district, day);
  const life = districtLife(district);
  const n = Math.max(0, Math.min(CIVIC_MOMENTUM_CAP, Math.floor(completions) || 0));
  if (n >= 6) {
    return {
      stage: "uprising",
      name: "LOCAL UPRISING",
      line: `${operation.completion} The district is defending the change openly; ${life.people.toLowerCase()}`,
      completions: n,
      eventDurationMult: 0.85,
    };
  }
  if (n >= 3) {
    return {
      stage: "network",
      name: "CIVIC NETWORK",
      line: `${operation.completion} The win has become a neighborhood system, not a single act.`,
      completions: n,
      eventDurationMult: 0.9,
    };
  }
  if (n >= 1) {
    return {
      stage: "foothold",
      name: "PUBLIC FOOTHOLD",
      line: operation.completion,
      completions: n,
      eventDurationMult: 0.95,
    };
  }
  return {
    stage: "need",
    name: "PUBLIC NEED",
    line: operation.brief,
    completions: 0,
    eventDurationMult: 1,
  };
}

export function districtEventContext(
  district: number,
  eventName: string,
  day = dayIndex(),
  completions = 0,
): string | null {
  const aftermath = districtAftermath(district, day, completions);
  if (aftermath.completions <= 0) return null;
  const operation = dailyDistrictOperation(district, day);
  const cut = Math.round((1 - aftermath.eventDurationMult) * 100);
  return `${eventName} is hitting back at ${operation.name} — local preparation cuts the crisis window ${cut}%`;
}

export function districtOperationObjectiveLabel(operation: DistrictOperationDef): string {
  const verbs: Record<DistrictOperationObjective, string> = {
    kill: `purge ${operation.count} HSS`,
    capture: `capture ${operation.count} nodes`,
    boss: "fell a world boss",
    event: "survive a world event",
  };
  return verbs[operation.objective];
}

/** Compact map/arrival copy: current mechanics and local stakes from one source. */
export function districtSituationLine(district: number, day = dayIndex()): string {
  const d = DISTRICTS[district];
  const mod = dailyDistrictMod(district, day);
  const operation = dailyDistrictOperation(district, day);
  return `${d?.name ?? `District ${district}`} · ${mod.name}. PUBLIC OP: ${operation.name} — ${districtOperationObjectiveLabel(operation)}. ${operation.brief}`;
}

/** Paid rumours reveal a place-specific truth, not a generic systems tip. */
export function districtRumorLine(district: number, day = dayIndex(), trust = 0, momentum = 0): string {
  const life = districtLife(district);
  const operation = dailyDistrictOperation(district, day);
  // Contact trust changes information quality, never price or combat power.
  // Strangers hear street texture; trusted contacts explain power; confidants
  // disclose the fact the district works hardest to bury.
  if (trust >= 3) return life.hiddenTruth;
  if (trust >= 1 && momentum > 0) return districtAftermath(district, day, momentum).line;
  const lines = trust >= 2
    ? [life.power, operation.brief]
    : [life.people, life.landmark];
  return lines[((day + district) % lines.length + lines.length) % lines.length];
}

/** Local workers interpret shared aftermath through what their job has to carry. */
export function districtCivicRoleLine(npcId: string, district: number, day = dayIndex(), momentum = 0): string | null {
  const aftermath = districtAftermath(district, day, momentum);
  if (aftermath.completions <= 0) return null;
  const operation = dailyDistrictOperation(district, day);
  if (npcId.startsWith("field_medic_"))
    return `${aftermath.name}: ${operation.name} held. I'm treating defenders now, not disappeared residents.`;
  if (npcId === "amb_courier" || npcId === "res_dash")
    return `${aftermath.name}: word from ${operation.name} is moving faster than the official correction.`;
  if (npcId.startsWith("keep_"))
    return `${aftermath.name}: ${operation.name} changed what people ask for in here. ${aftermath.line}`;
  if (npcId === "subway_warden" || npcId === "tunnel_rat")
    return `${aftermath.name}: the Underline is carrying people and proof out of ${operation.name}.`;
  return null;
}

/** Long-form dossier used by Examine; line breaks are intentional modal copy. */
export function districtDossier(district: number, day = dayIndex()): string {
  const d = DISTRICTS[district];
  const life = districtLife(district);
  const mod = dailyDistrictMod(district, day);
  const operation = dailyDistrictOperation(district, day);
  return [
    `${d?.name ?? `DISTRICT ${district}`} — formerly ${life.formerName}`,
    life.history,
    `POWER: ${life.power}`,
    `STREET: ${life.people}`,
    `LANDMARK: ${life.landmark}`,
    `TODAY: ${mod.name} — ${mod.blurb}.`,
    `PUBLIC OP · ${operation.name}: ${operation.brief} Objective: ${districtOperationObjectiveLabel(operation)}. Reward ₵${operation.rewardCredits} + ${operation.rewardXp} XP.`,
  ].join("\n\n");
}

/** Short enough for the contextual Examine panel, while still naming history and stakes. */
export function districtMapSummary(district: number, day = dayIndex()): string {
  const d = DISTRICTS[district];
  const life = districtLife(district);
  const operation = dailyDistrictOperation(district, day);
  return `${d?.name ?? `District ${district}`} — formerly ${life.formerName}. ${life.history} STREET: ${life.people} PUBLIC OP · ${operation.name}: ${operation.brief} Objective: ${districtOperationObjectiveLabel(operation)}; reward ₵${operation.rewardCredits} + ${operation.rewardXp} XP.`;
}
