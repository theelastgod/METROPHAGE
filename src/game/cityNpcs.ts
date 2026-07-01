// METROPHAGE — the city's inhabitants. Each is a customized character (the same look
// system as players, so they're varied + on-style) with flavour dialogue. Quest-givers
// are tagged with `quest`; the quest system layers offer/advance/reward on top.

import type { PlayerLook } from "../net/protocol";

/** Fill a PlayerLook from a partial (sensible human defaults). */
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

export interface CityNpcDef {
  id: string;
  name: string;
  look: PlayerLook;
  lines: string[]; // shown when there's no quest business
  quest?: string; // quest id this NPC gives (quest system handles it)
}

/** Key NPCs — placed first, near the central plaza, in a fixed order. */
export const KEY_NPCS: CityNpcDef[] = [
  {
    id: "rin",
    name: "RIN",
    quest: "missing_shipment",
    look: look({ color: 0x00e5ff, skin: 0xe6b58c, hair: "short", hairColor: 0x2a1d14, cloak: "coat", strap: true }),
    lines: ["Eyes open out there, runner.", "The city eats the careless."],
  },
  {
    id: "doc",
    name: "DOC HALO",
    quest: "clinic_debt",
    look: look({ color: 0x39ff88, skin: 0x7c4f30, hair: "ponytail", hairColor: 0x1b1820, decal: "cross" }),
    lines: ["Stay patched up. I'm always here.", "Half this district owes me blood."],
  },
  {
    id: "vex",
    name: "VEX",
    quest: "word_street",
    look: look({ color: 0xff2bd6, head: "beret", skin: 0x4f3220, hair: "undercut", hairColor: 0x1b1820, faceMark: "tattoo", cloak: "coat" }),
    lines: ["Information's the only real currency.", "Everything's for sale. Even you."],
  },
  {
    id: "marek",
    name: "OLD MAREK",
    look: look({ color: 0xf7a23c, skin: 0x4f3220, hair: "long", hairColor: 0xc7cdd8, beard: "full" }),
    lines: ["I remember when this was all open sky.", "The slums keep what the towers throw away."],
  },
];

/** Ambient citizens — scattered across the remaining NPC spots for life. */
export const CITIZENS: CityNpcDef[] = [
  {
    id: "juno",
    name: "JUNO",
    look: look({ color: 0x9dff3c, skin: 0xc98a5e, hair: "spiky", hairColor: 0x9c3b22 }),
    lines: ["Courier work pays if your legs hold up.", "Saw a meltdown two cycles back. Never again."],
  },
  {
    id: "sable",
    name: "SABLE",
    look: look({ color: 0xff79c6, skin: 0xe6b58c, hair: "bun", hairColor: 0x1b1820, beard: "none" }),
    lines: ["The Feral Cat pours till the grid goes down.", "You look like you need a drink."],
  },
  {
    id: "kessler",
    name: "KESSLER",
    quest: "curfew",
    look: look({ color: 0x4d8cff, skin: 0xf3d2b8, hair: "buzz", hairColor: 0x4a2f1c, beard: "goatee", cloak: "coat" }),
    lines: ["Corp says the towers are safe. Corp lies.", "Keep your callsign off the open net."],
  },
  {
    id: "mira",
    name: "MIRA",
    quest: "the_quiet_one",
    look: look({ color: 0xc6ff3c, skin: 0xa9794a, hair: "braids", hairColor: 0x1b1820 }),
    lines: ["Market's hot today — watch your credits.", "Everything you need, someone's already selling."],
  },
  {
    id: "ghost",
    name: "GHOST",
    quest: "furniture",
    look: look({ color: 0xb06bff, head: "hood", skin: 0x7c4f30, hair: "short", hairColor: 0x1b1820, build: "slim", cloak: "coat" }),
    lines: ["…", "I wasn't here. You didn't see me."],
  },
];

/**
 * Which named NPCs live in which building KIND — so the city reads consistent with the
 * quests. Each inner array is ONE building's occupants; the nearest building of that kind
 * to the plaza gets the first group, the next gets the second, etc. SABLE tends the bar
 * (with JUNO drinking), DOC the clinic, the broker VEX a back room, shopkeeper RIN a
 * store, MIRA another, KESSLER the runners' guild, OLD MAREK a slum residence, and the
 * "quiet one" GHOST another back room.
 */
export const INTERIOR_PLAN: Record<string, string[][]> = {
  bar: [["sable", "juno"]],
  shop: [["rin"], ["mira"]],
  clinic: [["doc"]],
  den: [["vex", "ghost"]], // the broker + the quiet one share a back room (dens are rare)
  guild: [["kessler"]],
  home: [["marek"]],
};

/** Generic keepers staff interiors with no named resident, so no room is empty. */
const KEEPERS: Record<string, CityNpcDef> = {
  bar: { id: "keep_bar", name: "BARKEEP", look: look({ color: 0xff79c6, skin: 0xc98a5e, hair: "short", hairColor: 0x1b1820 }), lines: ["What'll it be, runner?", "Grid's flickered all night."] },
  shop: { id: "keep_shop", name: "CLERK", look: look({ color: 0x00e5ff, skin: 0xe6b58c, hair: "buzz", hairColor: 0x2a1d14 }), lines: ["Browse all you like. Touch nothing.", "Prices are firm."] },
  clinic: { id: "keep_clinic", name: "MEDIC", look: look({ color: 0x39ff88, skin: 0x7c4f30, hair: "ponytail", hairColor: 0x1b1820, decal: "cross" }), lines: ["Hold still, this'll sting.", "Don't bleed on my floor."] },
  guild: { id: "keep_guild", name: "QUARTERMASTER", look: look({ color: 0x4d8cff, skin: 0xf3d2b8, hair: "short", hairColor: 0x4a2f1c, cloak: "coat", beard: "stubble" }), lines: ["Contracts are on the board.", "The guild carries no deadweight."] },
  den: { id: "keep_den", name: "FENCE", look: look({ color: 0xff2bd6, head: "hood", skin: 0xa9794a, hair: "short", hairColor: 0x1b1820, cloak: "coat" }), lines: ["You didn't get it here.", "Cash only. No callsigns."] },
  home: { id: "keep_home", name: "RESIDENT", look: look({ color: 0xf7a23c, skin: 0xc98a5e, hair: "short", hairColor: 0x1b1820 }), lines: ["This is my place. Mind yourself.", "Quiet cycle. Let's keep it that way."] },
  hospital: { id: "keep_hospital", name: "TRAUMA DOC", look: look({ color: 0x39ff88, skin: 0xe6b58c, hair: "buzz", hairColor: 0x4a2f1c, decal: "cross" }), lines: ["Sit. I'll patch you whole.", "You walked in — that's the easy half."] },
  hotel: { id: "keep_hotel", name: "CONCIERGE", look: look({ color: 0xffb13c, skin: 0xc98a5e, hair: "short", hairColor: 0x1b1820, cloak: "coat" }), lines: ["Rest easy. The doors hold.", "A bed and a hot signal — best in the district."] },
  subway: { id: "keep_subway", name: "TRANSIT WARDEN", look: look({ color: 0x29e7ff, head: "cap", skin: 0x7c4f30, hair: "buzz", hairColor: 0x1b1820, cloak: "coat" }), lines: ["Mind the gap. And the things in it.", "Down the tunnels? Bring teeth."] },
  stadium: { id: "keep_stadium", name: "ARENA HERALD", look: look({ color: 0xff3b6b, head: "cap", skin: 0xf3d2b8, hair: "long", hairColor: 0x1b1820, beard: "goatee" }), lines: ["Blood or glory — the crowd doesn't care which.", "Step into the Crucible, free one."] },
  citycenter: { id: "keep_citycenter", name: "CIVIC AIDE", look: look({ color: 0x4d8cff, skin: 0xa9794a, hair: "bun", hairColor: 0x1b1820 }), lines: ["Welcome to the Civic Spire.", "Everything routes through here. Officially."] },
};

export function keeperFor(kind: string): CityNpcDef {
  return KEEPERS[kind] ?? KEEPERS.home;
}

/** Regional quest-givers scattered in the expanded city's outer districts. */
export const REGIONAL_NPCS: CityNpcDef[] = [
  {
    id: "porter",
    name: "CAPT. PORTER",
    quest: "dock_manifest",
    look: look({ color: 0x29e7ff, skin: 0x7c4f30, hair: "buzz", hairColor: 0x1b1820, cloak: "coat", beard: "stubble" }),
    lines: ["Freight don't lie. People do.", "The tide's turning — watch the manifests."],
  },
  {
    id: "tunnel_rat",
    name: "TUNNEL RAT",
    quest: "undercity_map",
    look: look({ color: 0xb06bff, skin: 0x4f3220, head: "hood", hair: "short", hairColor: 0x1b1820, build: "slim", cloak: "coat" }),
    lines: ["Down here's quieter. That's the point.", "The metro still routes. Just not for passengers."],
  },
  {
    id: "arc_tech",
    name: "ARC TECH",
    quest: "arcology_pass",
    look: look({ color: 0x6b9bff, skin: 0xf3d2b8, hair: "bun", hairColor: 0x1b1820, head: "cap", cloak: "coat" }),
    lines: ["Arc uplink nominal.", "Sky's licensed. Ground's… complicated."],
  },
  {
    id: "scrap_boss",
    name: "SCRAP BOSS",
    quest: "pipe_dream",
    look: look({ color: 0xffb13c, skin: 0xa9794a, build: "bulky", beard: "stubble", hair: "short", hairColor: 0x1b1820, cloak: "coat" }),
    lines: ["Everything out here has a price.", "Chrome or credits. Your pick."],
  },
  {
    id: "hawker",
    name: "HAWKER",
    quest: "hawker_debt",
    look: look({ color: 0xffb13c, skin: 0xe6b58c, hair: "buzz", hairColor: 0x4a2f1c }),
    lines: ["Cheap mods! Barely stolen!", "Best deals this side of the grid!"],
  },
  {
    id: "preacher",
    name: "PREACHER",
    quest: "preacher_warning",
    look: look({ color: 0xb06bff, skin: 0x4f3220, hair: "long", hairColor: 0xc7cdd8, beard: "full", cloak: "cape" }),
    lines: ["The Singularity comes for us all!", "Wake — before they wake you."],
  },
  {
    id: "street_kid",
    name: "STREET KID",
    quest: "kid_delivery",
    look: look({ color: 0x9dff3c, skin: 0xc98a5e, hair: "spiky", hairColor: 0x9c3b22, build: "slim" }),
    lines: ["You a runner? You LOOK like a runner.", "Bet I can outrun you."],
  },
];

/** Ambient citizens who fill the open streets (no quests). */
export const AMBIENT_NPCS: CityNpcDef[] = [
  { id: "amb_drifter", name: "DRIFTER", look: look({ color: 0x9aa3b2, skin: 0x7c4f30, hair: "long", hairColor: 0x1b1820, cloak: "coat" }), lines: ["Spare a credit?", "I've walked every block twice."] },
  { id: "amb_courier", name: "COURIER", look: look({ color: 0x9dff3c, skin: 0xc98a5e, hair: "ponytail", hairColor: 0x9c3b22 }), lines: ["Package for the plaza. Not for you.", "Legs still work. Grid still doesn't."] },
  { id: "amb_dockhand", name: "DOCKHAND", look: look({ color: 0x29e7ff, skin: 0x7c4f30, hair: "buzz", hairColor: 0x1b1820, beard: "stubble", cloak: "coat" }), lines: ["Manifest says empty. Eyes say otherwise.", "Tide's wrong tonight."] },
  { id: "amb_arc_clerk", name: "ARC CLERK", look: look({ color: 0x6b9bff, skin: 0xf3d2b8, hair: "bun", hairColor: 0x1b1820 }), lines: ["Uplink pass required beyond this block.", "Ground floor's still free. For now."] },
  { id: "amb_tech", name: "GRID TECH", look: look({ color: 0x29e7ff, skin: 0xe6b58c, hair: "buzz", hairColor: 0x1b1820, head: "cap", beard: "goatee", cloak: "coat" }), lines: ["Grid's holding. For now.", "You look like you could use a hot signal."] },
  { id: "amb_vendor", name: "NOODLE COOK", look: look({ color: 0xff7a18, skin: 0xa9794a, hair: "bun", hairColor: 0x1b1820 }), lines: ["Hot synth-noodles! Two credits!", "Eat. You look like static."] },
];

/** Stands by the plaza and sends you down into THE UNDERLINE (the subway dungeon). */
export const SUBWAY_WARDEN: CityNpcDef = {
  id: "subway_warden",
  name: "TRANSIT WARDEN",
  quest: "into_underline",
  look: look({ color: 0x29e7ff, head: "cap", skin: 0x7c4f30, hair: "buzz", hairColor: 0x1b1820, cloak: "coat", beard: "stubble" }),
  lines: ["Mind the gap. And the things in it.", "Down the tunnels? Bring teeth."],
};

export const ALL_NPCS: CityNpcDef[] = [...KEY_NPCS, ...CITIZENS, ...REGIONAL_NPCS, ...AMBIENT_NPCS, SUBWAY_WARDEN, ...Object.values(KEEPERS)];

export function npcDef(id: string): CityNpcDef | undefined {
  return ALL_NPCS.find((n) => n.id === id);
}
