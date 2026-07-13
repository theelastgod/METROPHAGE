// METROPHAGE — THE DRILL YARD layout: a linear training facility west→east.
// Each chamber has one authored instructor who explains a single mechanic.
// Shared by client render (signage + NPCs) and server spawn positions.

import type { PlayerLook } from "../net/protocol";
import type { TutorialKind, TutorialMode } from "../net/tutorial";
import { TILE } from "../config";

// Floor tile indices (must match world/district.ts). Inlined here to avoid a circular
// import: district.ts imports this module for chamber geometry.
const FLOOR = {
  plaza: 3,
  sidewalk: 1,
  lane: 2,
  market: 10,
  grate: 11,
  neon: 13,
  dirt: 14,
  inner: 16,
} as const;

/** Pixel centre of a tile. */
export const tpx = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

export const TUTORIAL_SPAWN_TILE: [number, number] = [5, 15];
export const TUTORIAL_COP_TILE: [number, number] = [16, 15];
export const TUTORIAL_NODE_TILE: [number, number] = [24, 15];
export const TUTORIAL_PORTAL_TILE: [number, number] = [36, 15];

export const TUTORIAL_SPAWN = tpx(...TUTORIAL_SPAWN_TILE);
export const TUTORIAL_PORTAL = tpx(...TUTORIAL_PORTAL_TILE);
export const TUTORIAL_PORTAL_RADIUS = 80;

export interface TutorialChamber {
  id: string;
  title: string;
  subtitle: string;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  floor: number;
  accent: number;
  labelTile: [number, number];
}

/** West→east chambers along the main corridor (y ≈ 15). */
export const TUTORIAL_CHAMBERS: TutorialChamber[] = [
  { id: "briefing", title: "◢ BRIEFING", subtitle: "intent & movement", x1: 4, x2: 7, y1: 5, y2: 25, floor: FLOOR.plaza, accent: 0x39ff88, labelTile: [5, 7] },
  { id: "range", title: "◢ FIRING RANGE", subtitle: "melee practice", x1: 9, x2: 12, y1: 5, y2: 25, floor: FLOOR.grate, accent: 0xff7a18, labelTile: [10, 7] },
  { id: "combat", title: "◢ COMBAT PIT", subtitle: "kit · then kill", x1: 14, x2: 17, y1: 5, y2: 25, floor: FLOOR.dirt, accent: 0xff3b6b, labelTile: [15, 7] },
  { id: "salvage", title: "◢ SALVAGE BAY", subtitle: "collect drops", x1: 19, x2: 21, y1: 5, y2: 25, floor: FLOOR.market, accent: 0xf7ff3c, labelTile: [20, 7] },
  { id: "node", title: "◢ NODE VAULT", subtitle: "capture territory", x1: 23, x2: 25, y1: 5, y2: 25, floor: FLOOR.neon, accent: 0xb06bff, labelTile: [24, 7] },
  { id: "commissary", title: "◢ COMMISSARY", subtitle: "gear & uplink", x1: 27, x2: 29, y1: 5, y2: 25, floor: FLOOR.inner, accent: 0x00e5ff, labelTile: [28, 7] },
  { id: "systems", title: "◢ SYSTEMS COURT", subtitle: "city services", x1: 31, x2: 35, y1: 5, y2: 25, floor: FLOOR.sidewalk, accent: 0x6b9bff, labelTile: [33, 7] },
  { id: "deploy", title: "◢ DEPLOY GATE", subtitle: "one way · live city", x1: 36, x2: 36, y1: 10, y2: 20, floor: FLOOR.lane, accent: 0x29e7ff, labelTile: [36, 9] },
];

/** Vertical wall columns between chambers — doorway on the main corridor (y 14–16). */
export const TUTORIAL_DIVIDERS = [8, 13, 18, 22, 26, 30, 35];

function look(p: Partial<PlayerLook>): PlayerLook {
  return {
    color: 0x00e5ff,
    build: "normal",
    head: "cap",
    visor: "band",
    shoulders: "none",
    decal: "none",
    cloak: "none",
    skin: 0xc98a5e,
    sex: "m",
    hair: "short",
    hairColor: 0x4a2f1c,
    beard: "none",
    faceMark: "none",
    eyeColor: 0x1a1020,
    gloves: "none",
    legGear: "none",
    accentColor: 0xff2bd6,
    antennae: false,
    emblem: false,
    strap: false,
    ...p,
  };
}

export interface TutorialInstructor {
  id: string;
  name: string;
  tag: string;
  chamber: string;
  kind: TutorialKind;
  tile: [number, number];
  color: number;
  look: PlayerLook;
  /** Spoken when the player presses E — first line is the core lesson. */
  lines: string[];
  /** Shown in full training only (quick path uses a subset). */
  fullOnly?: boolean;
}

/** Instructors on the main training path (quick drill + shared anchors). */
export const TUTORIAL_INSTRUCTORS: TutorialInstructor[] = [
  {
    id: "vex",
    name: "SERGEANT VEX",
    tag: "MOVEMENT",
    chamber: "briefing",
    kind: "move",
    tile: [5, 12],
    color: 0x39ff88,
    look: look({ color: 0x39ff88, head: "cap", skin: 0xc98a5e, hair: "buzz", hairColor: 0x1b1820, beard: "stubble", cloak: "coat" }),
    lines: [
      "Welcome to the Drill Yard, runner. Walk with intent — WASD or arrows.",
      "The server simulates every step. You send intent; it decides where you land.",
      "Move a few tiles east when you're ready for the firing range.",
    ],
  },
  {
    id: "kor",
    name: "RANGE MASTER KOR",
    tag: "WEAPON",
    chamber: "range",
    kind: "fire",
    tile: [10, 12],
    color: 0xff7a18,
    look: look({ color: 0xff7a18, head: "cap", gloves: "wraps", skin: 0x7c4f30, hair: "buzz", hairColor: 0x1b1820, beard: "stubble", cloak: "coat" }),
    lines: [
      "This is my lane. Aim with the mouse — HOLD CLICK or HOLD F to swing.",
      "Melee range, arc, and rate are server-checked. Spam doesn't cheat cooldowns.",
      "Land three swings, then walk east for the class kit before the pit fight.",
    ],
  },
  {
    id: "rex",
    name: "DRILL REX",
    tag: "CLASS KIT",
    chamber: "combat",
    kind: "kit",
    tile: [15, 18],
    color: 0xffb347,
    look: look({ color: 0xffb347, build: "normal", head: "cap", gloves: "wraps", skin: 0xc98a5e, hair: "buzz", hairColor: 0x1b1820, beard: "stubble", cloak: "coat", strap: true }),
    lines: [
      "Kit first, then blood. SPACE dashes — invulnerable mid-blink.",
      "Q and E are your class abilities. The server owns every cooldown.",
      "Dash once, cast Q or E once, then face the patrol with Warden Six.",
    ],
  },
  {
    id: "six",
    name: "WARDEN SIX",
    tag: "COMBAT",
    chamber: "combat",
    kind: "kill",
    tile: [15, 12],
    color: 0xff3b6b,
    look: look({ color: 0xff3b6b, build: "normal", head: "cap", skin: 0x4f3220, hair: "buzz", hairColor: 0x1b1820, beard: "stubble", cloak: "coat", strap: true }),
    lines: [
      "Human Security System — a Turing Cop. It patrols for unlicensed minds.",
      "Dash in, slash it down. Salvage spawns where it falls.",
      "Aim at it — HOLD CLICK or HOLD F. Close range only.",
    ],
  },
  {
    id: "jyn",
    name: "SCRAPPER JYN",
    tag: "SALVAGE",
    chamber: "salvage",
    kind: "pickup",
    tile: [20, 12],
    color: 0xf7ff3c,
    look: look({ color: 0xf7ff3c, head: "hood", cloak: "coat", strap: true, skin: 0x7c4f30, hair: "braids", hairColor: 0x4a2f1c }),
    lines: [
      "Corpses leave salvage — credits and data cores.",
      "Walk through the glowing pickup. No button, just overlap.",
      "The node vault is east. Your cell needs territory.",
    ],
  },
  {
    id: "ora",
    name: "HANDLER ORA",
    tag: "TERRITORY",
    chamber: "node",
    kind: "capture",
    tile: [24, 12],
    color: 0xb06bff,
    look: look({ color: 0xb06bff, head: "beret", sex: "f", skin: 0xe6b58c, hair: "long", hairColor: 0x1b1820, faceMark: "tattoo", cloak: "coat" }),
    lines: [
      "Infection nodes are the city's nervous system.",
      "Stand on the violet ring and channel until your CELL owns it.",
      "Commissary is next — gear up and open the uplink.",
    ],
  },
  {
    id: "zen",
    name: "ARMORER ZEN",
    tag: "GEAR",
    chamber: "commissary",
    kind: "equip",
    tile: [28, 11],
    color: 0xff2bd6,
    look: look({ color: 0xff2bd6, sex: "f", gloves: "wraps", skin: 0xe6b58c, hair: "undercut", hairColor: 0x1b1820, cloak: "coat" }),
    lines: [
      "Loot becomes loadout. Press I for your bag.",
      "Click an item to equip — stats are server-side.",
      "Uplink booth is south in this wing.",
    ],
  },
  {
    id: "pax",
    name: "RELAY PAX",
    tag: "UPLINK",
    chamber: "commissary",
    kind: "chat",
    tile: [28, 19],
    color: 0x00e5ff,
    look: look({ color: 0x00e5ff, head: "cap", skin: 0xa9794a, hair: "ponytail", hairColor: 0x1b1820, cloak: "coat" }),
    lines: [
      "Other free minds share this world in real time.",
      "Press ENTER, type a line, ENTER again — zone chat reaches your district.",
      "Systems Court is east. One panel opens every city service.",
    ],
  },
  {
    id: "nex",
    name: "DIRECTOR NEX",
    tag: "SYSTEMS",
    chamber: "systems",
    kind: "panel",
    tile: [33, 15],
    color: 0x6b9bff,
    look: look({ color: 0x6b9bff, head: "beret", cloak: "coat", skin: 0x4f3220, hair: "long", hairColor: 0xc7cdd8, beard: "stubble" }),
    lines: [
      "The live city runs on panels: J contracts · G forge · B vendor · K market · Y wardrobe.",
      "Open any one panel once — that's your systems taste.",
      "The floating ◈ $METRO button is the bridge when a contract address is live. When every lesson is green, the deploy gate opens east.",
    ],
  },
];

/** Extra instructors for FULL training — seated in Systems Court. Talk (E) clears briefing lessons. */
export const TUTORIAL_INSTRUCTORS_FULL: TutorialInstructor[] = [
  {
    id: "cell",
    name: "CELL LIAISON",
    tag: "FACTIONS",
    chamber: "systems",
    kind: "faction",
    tile: [32, 10],
    color: 0xff79c6,
    fullOnly: true,
    look: look({ color: 0xff79c6, head: "beret", sex: "f", skin: 0xe6b58c, hair: "short", hairColor: 0x1b1820, cloak: "coat" }),
    lines: [
      "Your signature colour chose your CELL — one of four factions.",
      "Capturing nodes scores your cell. The war tally is server-wide.",
      "Lesson logged. Open the forge next (G) when you're ready.",
    ],
  },
  {
    id: "forge",
    name: "FORGE TECH",
    tag: "FORGE",
    chamber: "systems",
    kind: "craft",
    tile: [34, 10],
    color: 0xff2bd6,
    fullOnly: true,
    look: look({ color: 0xff2bd6, sex: "f", gloves: "wraps", skin: 0xc98a5e, hair: "undercut", hairColor: 0x1b1820, cloak: "coat" }),
    lines: ["Press G — upgrade, reforge, fuse, or salvage. Free in the drill.", "The server validates every craft."],
  },
  {
    id: "qm",
    name: "QUARTERMASTER",
    tag: "VENDOR",
    chamber: "systems",
    kind: "vendor",
    tile: [32, 13],
    color: 0xf7ff3c,
    fullOnly: true,
    look: look({ color: 0xf7ff3c, head: "cap", strap: true, skin: 0xc98a5e, hair: "short", beard: "stubble", cloak: "coat" }),
    lines: ["Press B — the quartermaster sells heals and gear caches.", "Reputation tiers unlock better stock."],
  },
  {
    id: "fence",
    name: "THE FENCE",
    tag: "MARKET",
    chamber: "systems",
    kind: "market",
    tile: [34, 13],
    color: 0xff7a18,
    fullOnly: true,
    look: look({ color: 0xff7a18, head: "hood", cloak: "coat", skin: 0x7c4f30 }),
    lines: ["Press K — cross-zone auction house.", "List items, bid, cancel — escrow is server-side."],
  },
  {
    id: "fixer",
    name: "THE FIXER",
    tag: "CONTRACTS",
    chamber: "systems",
    kind: "contracts",
    tile: [32, 16],
    color: 0x39ff88,
    fullOnly: true,
    look: look({ color: 0x39ff88, head: "hood", skin: 0x4f3220, hair: "long", hairColor: 0xc7cdd8, cloak: "coat" }),
    lines: ["Press J — daily contracts: kills, bosses, collection runs.", "Credits, cores, and vendor rep on completion."],
  },
  {
    id: "tailor",
    name: "THE TAILOR",
    tag: "WARDROBE",
    chamber: "systems",
    kind: "cosmetics",
    tile: [34, 16],
    color: 0xff5fa2,
    fullOnly: true,
    look: look({ color: 0xff5fa2, head: "beret", skin: 0xf3d2b8, hair: "bun", hairColor: 0xff5fb0 }),
    lines: ["Press Y — transmog only, zero combat power.", "Your look still relays to every player."],
  },
  {
    id: "org",
    name: "ORGANIZER",
    tag: "CELL GUILD",
    chamber: "systems",
    kind: "guild",
    tile: [32, 19],
    color: 0x4d8cff,
    fullOnly: true,
    look: look({ color: 0x4d8cff, head: "cap", skin: 0xf3d2b8, hair: "short", hairColor: 0x4a2f1c, cloak: "coat" }),
    lines: ["Press C — your persistent guild: shared bank, roster, ranks.", "Invite free minds and pool resources."],
  },
  {
    id: "arch",
    name: "ARCHIVIST",
    tag: "BOARD",
    chamber: "systems",
    kind: "board",
    tile: [34, 19],
    color: 0x00e5ff,
    fullOnly: true,
    look: look({ color: 0x00e5ff, head: "beret", skin: 0xa9794a, hair: "bun", hairColor: 0x1b1820 }),
    lines: ["Press L — achievements and cross-zone leaderboards.", "Milestones pay out automatically."],
  },
  {
    id: "nav",
    name: "NAVIGATOR",
    tag: "MAP",
    chamber: "systems",
    kind: "map",
    tile: [32, 22],
    color: 0x2cf5c8,
    fullOnly: true,
    look: look({ color: 0x2cf5c8, head: "cap", skin: 0xa9794a, hair: "dreads" }),
    lines: ["Press M — discovered zones and fast travel.", "Black tiles are unknown until you arrive."],
  },
  {
    id: "mime",
    name: "SIGNALLER",
    tag: "EMOTES",
    chamber: "systems",
    kind: "emote",
    tile: [34, 22],
    color: 0xc04bff,
    fullOnly: true,
    look: look({ color: 0xc04bff, head: "cap", skin: 0x7c4f30, hair: "spiky", hairColor: 0x1b1820, cloak: "coat" }),
    lines: ["Press V — emote wheel: gestures above your avatar or world pings.", "Coordination without chat spam."],
  },
  {
    id: "arc",
    name: "STORY ARCHIVIST",
    tag: "CAMPAIGN",
    chamber: "systems",
    kind: "campaign",
    tile: [31, 11],
    color: 0xeafdff,
    fullOnly: true,
    look: look({ color: 0xeafdff, cloak: "cape", skin: 0x4f3220, hair: "long", beard: "full", hairColor: 0xc7cdd8 }),
    lines: [
      "Your personal campaign runs parallel to everyone else's.",
      "THE FIXER posts beats — persisted to your account.",
      "Talk to me (or SPACE) when you've got it — then the arena marshal.",
    ],
  },
  {
    id: "arena",
    name: "ARENA MARSHAL",
    tag: "PVP",
    chamber: "systems",
    kind: "pvp",
    tile: [35, 11],
    color: 0xff3b6b,
    fullOnly: true,
    look: look({ color: 0xff3b6b, build: "normal", head: "cap", skin: 0xc98a5e, hair: "short", hairColor: 0x1b1820, beard: "stubble", cloak: "coat" }),
    lines: [
      "PvP only in THE CRUCIBLE — southeast arena, away from story.",
      "Chat and emotes work everywhere. The server enforces arena damage.",
      "Lesson logged. Escrow agent is south if you need secure trades.",
    ],
  },
  {
    id: "trade",
    name: "ESCROW AGENT",
    tag: "TRADE",
    chamber: "systems",
    kind: "trade",
    tile: [35, 22],
    color: 0x9dff3c,
    fullOnly: true,
    look: look({ color: 0x9dff3c, gloves: "wraps", strap: true, skin: 0x7c4f30 }),
    lines: [
      "/trade <name> · /offer · /confirm on both sides. /tcancel to abort.",
      "Face-to-face secure trades — never hand items in open chat.",
      "Lesson logged. Bridge broker covers $METRO before you travel.",
    ],
  },
  {
    id: "metro",
    name: "BRIDGE BROKER",
    tag: "$METRO",
    chamber: "systems",
    kind: "metro",
    tile: [33, 19],
    color: 0xff2bd6,
    fullOnly: true,
    look: look({ color: 0xff2bd6, head: "hood", cloak: "coat", gloves: "wraps", skin: 0xa9794a, hair: "undercut", hairColor: 0x0f1020, visor: "mono", accentColor: 0x00e5ff }),
    lines: [
      "The ◈ $METRO button opens the bridge panel when the contract address is live.",
      "Deposits fill the player-funded pool. Cash-outs only open when the pool and treasury gas can cover them.",
      "Server secrets go live before the client ever shows the CA — that lock keeps fake deposits out. Gate officer covers travel next.",
    ],
  },
  {
    id: "port",
    name: "GATE OFFICER",
    tag: "TRAVEL",
    chamber: "systems",
    kind: "travel",
    tile: [33, 22],
    color: 0x8fe9ff,
    fullOnly: true,
    look: look({ color: 0x8fe9ff, head: "cap", cloak: "coat", legGear: "greaves", skin: 0xe6b58c, hair: "buzz", hairColor: 0x1b1820 }),
    lines: [
      "After drill you land in the safehouse. Fixer, then DEPLOY GATE.",
      "H recalls home. M only fast-travels zones you've walked into.",
      "Lesson logged. East gate is live when every drill is green.",
    ],
  },
];

export function tutorialInstructorsFor(mode: TutorialMode): TutorialInstructor[] {
  if (mode === "full") return [...TUTORIAL_INSTRUCTORS, ...TUTORIAL_INSTRUCTORS_FULL];
  return TUTORIAL_INSTRUCTORS;
}

export function instructorForStep(kind: TutorialKind, mode: TutorialMode): TutorialInstructor | undefined {
  return tutorialInstructorsFor(mode).find((i) => i.kind === kind);
}

export function chamberForKind(kind: TutorialKind): TutorialChamber | undefined {
  const inst = TUTORIAL_INSTRUCTORS.find((i) => i.kind === kind) ?? TUTORIAL_INSTRUCTORS_FULL.find((i) => i.kind === kind);
  if (!inst) {
    if (kind === "portal") return TUTORIAL_CHAMBERS.find((c) => c.id === "deploy");
    if (kind === "kit") return TUTORIAL_CHAMBERS.find((c) => c.id === "combat");
    return undefined;
  }
  return TUTORIAL_CHAMBERS.find((c) => c.id === inst.chamber);
}

/** Chamber accent colour for the active lesson (HUD arrow). */
export function chamberAccentForKind(kind: TutorialKind): number {
  return chamberForKind(kind)?.accent ?? 0x29e7ff;
}
