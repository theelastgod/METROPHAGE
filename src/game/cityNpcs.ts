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

/** Distinct named residents that inhabit district building interiors — every enterable
 *  building gets its own character so walking inside meets a unique face, not a clone. */
export const DISTRICT_RESIDENTS: CityNpcDef[] = [
  { id: "res_nix", name: "NIX", look: look({ color: 0x29e7ff, head: "hood", skin: 0x7c4f30, hair: "undercut", hairColor: 0x1b1820, faceMark: "tattoo", cloak: "coat" }), lines: ["I sell what the towers won't admit they lost.", "Names cost extra."] },
  { id: "res_solenne", name: "SOLENNE", look: look({ color: 0xff79c6, sex: "f", head: "beret", skin: 0xf3d2b8, hair: "bun", hairColor: 0x1b1820, cloak: "coat", accentColor: 0x00e5ff }), lines: ["I ran corp security for nine years. Ask me anything.", "Everyone in here is running from a spreadsheet."] },
  { id: "res_raze", name: "RAZE", look: look({ color: 0xff3b6b, build: "bulky", skin: 0x4f3220, hair: "buzz", beard: "stubble", faceMark: "scar", strap: true }), lines: ["Muscle's cheap. Loyalty isn't.", "You paying, or just breathing my air?"] },
  { id: "res_moth", name: "MOTH", look: look({ color: 0x9dff3c, sex: "f", skin: 0xe6b58c, hair: "braids", hairColor: 0x9dff3c, visor: "scan", antennae: true }), lines: ["I live behind the ICE. It's quieter there.", "Don't touch the terminal. It bites."] },
  { id: "res_dash", name: "DASH", look: look({ color: 0xf7ff3c, head: "cap", skin: 0xa9794a, hair: "short", legGear: "boots", strap: true }), lines: ["Fastest legs in the district. Payload's my business.", "Ten minutes, cross-town, no questions."] },
  { id: "res_cinder", name: "CINDER", look: look({ color: 0xff5a3c, skin: 0xc98a5e, hair: "mohawk", hairColor: 0xff5a3c, gloves: "wraps", faceMark: "scar" }), lines: ["Everything burns eventually. I just help it along.", "Stand back from the workbench."] },
  { id: "res_echo", name: "ECHO", look: look({ color: 0xb06bff, sex: "f", head: "none", skin: 0x7c4f30, hair: "long", hairColor: 0xb06bff, accentColor: 0x00e5ff }), lines: ["I press the city's noise into songs.", "Stay for the set. It's free. The drinks aren't."] },
  { id: "res_tallow", name: "TALLOW", look: look({ color: 0xffb13c, build: "bulky", skin: 0x4f3220, hair: "short", beard: "full", gloves: "wraps" }), lines: ["Hot broth, real protein. Mostly.", "Sit. Eat. Don't ask what's in it."] },
  { id: "res_wren", name: "WREN", look: look({ color: 0x8bff6a, sex: "f", head: "cap", skin: 0xe6b58c, hair: "ponytail", hairColor: 0x2a1d14, gloves: "wraps" }), lines: ["If it has moving parts, I can fix it or break it.", "Chrome's only as good as its mechanic."] },
  { id: "res_pike", name: "PIKE", look: look({ color: 0x4d8cff, build: "bulky", skin: 0x7c4f30, hair: "buzz", beard: "goatee", shoulders: "spikes", strap: true }), lines: ["This block's under my watch. Behave.", "Trouble walks in, trouble limps out."] },
  { id: "res_hollow", name: "HOLLOW", look: look({ color: 0xb06bff, head: "hood", skin: 0xa9794a, hair: "short", hairColor: 0xc7cdd8, faceMark: "tattoo" }), lines: ["I've seen how it ends. Doesn't help.", "The Blank's already inside you. You just haven't noticed."] },
  { id: "res_ferro", name: "FERRO", look: look({ color: 0xff2bd6, build: "bulky", sex: "f", skin: 0x4f3220, hair: "undercut", hairColor: 0x1b1820, gloves: "wraps", accentColor: 0x00e5ff }), lines: ["I forge what the corps won't license.", "Bring cores. Leave your doubts outside."] },
  { id: "res_static", name: "STATIC", look: look({ color: 0x00e5ff, head: "none", skin: 0xe6b58c, hair: "mohawk", hairColor: 0x00e5ff, visor: "band", antennae: true }), lines: ["Loudest signal in the sprawl, baby.", "You feel that bass? That's your heart syncing up."] },
  { id: "res_rook", name: "ROOK", look: look({ color: 0x6b9bff, head: "beret", skin: 0xf3d2b8, hair: "short", hairColor: 0x4a2f1c, cloak: "coat", beard: "stubble" }), lines: ["Every move you make, someone's already countered.", "Sit. Play a round. Learn something."] },
  { id: "res_plume", name: "PLUME", look: look({ color: 0xff79c6, sex: "f", head: "crown", skin: 0xc98a5e, hair: "long", hairColor: 0xff5fb0, decal: "skull" }), lines: ["Chems, scents, moods — I bottle all three.", "One breath and you'll forgive the whole city."] },
  { id: "res_grist", name: "GRIST", look: look({ color: 0xf7a23c, build: "bulky", skin: 0x4f3220, hair: "short", hairColor: 0xc7cdd8, beard: "full" }), lines: ["Real grain, ground here. Rare as gold now.", "The towers eat paste. Down here we eat bread."] },
  { id: "res_velvet", name: "VELVET", look: look({ color: 0xff2bd6, sex: "f", head: "none", skin: 0x7c4f30, hair: "bun", hairColor: 0x1b1820, cloak: "cape", accentColor: 0xff79c6 }), lines: ["First one's watered. You'll thank me.", "Everyone tells the bar the truth eventually."] },
  { id: "res_coil", name: "COIL", look: look({ color: 0x9dff3c, head: "cap", skin: 0xa9794a, hair: "buzz", gloves: "wraps", faceMark: "scar" }), lines: ["I keep this block's lights on. Mostly by theft.", "Don't touch that junction unless you like dancing."] },
  { id: "res_ash", name: "ASH", look: look({ color: 0x9aa3b2, sex: "f", head: "hood", skin: 0xf3d2b8, hair: "long", hairColor: 0xc7cdd8 }), lines: ["I keep his room the way he left it.", "The district forgets. I don't."] },
  { id: "res_brick", name: "BRICK", look: look({ color: 0xffb13c, build: "bulky", skin: 0x4f3220, hair: "buzz", beard: "full", gloves: "wraps", shoulders: "pads" }), lines: ["I built half these walls. Poured the rest.", "Nothing in this district stands without me."] },
  { id: "res_sparrow", name: "SPARROW", look: look({ color: 0xff5ad0, sex: "f", head: "hood", skin: 0xe6b58c, hair: "short", hairColor: 0x1b1820, strap: true, legGear: "boots" }), lines: ["Light fingers, lighter conscience.", "Check your pockets before you leave. Just kidding. Mostly."] },
  { id: "res_lumen", name: "LUMEN", look: look({ color: 0x29e7ff, sex: "f", head: "none", skin: 0xa9794a, hair: "braids", hairColor: 0x29e7ff, antennae: true, accentColor: 0xff2bd6 }), lines: ["I paint with the city's own glow.", "Neon's the only honest colour left."] },
  { id: "res_quill", name: "QUILL", look: look({ color: 0xf7ff3c, head: "beret", skin: 0x7c4f30, hair: "short", hairColor: 0x1b1820, cloak: "coat" }), lines: ["Someone has to write down what really happened.", "The feeds lie. My ink doesn't."] },
  { id: "res_glass", name: "GLASS", look: look({ color: 0x6b9bff, skin: 0xe6b58c, hair: "undercut", hairColor: 0x6b9bff, visor: "scan", gloves: "wraps" }), lines: ["I move windows. Don't ask which way.", "Whole tower's transparent if you know the right pane."] },
];

/** A distinct resident for a district building interior — deterministic per building, so
 *  the same door always opens on the same character. */
export function districtResident(district: number, index: number): CityNpcDef {
  return DISTRICT_RESIDENTS[((district * 5 + index) >>> 0) % DISTRICT_RESIDENTS.length];
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
