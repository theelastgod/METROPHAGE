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

// ── the story ensemble ───────────────────────────────────────────────────────
// The main questline (THE WAKE → THE AWAKENING) runs through THE FIXER, but four
// personable allies live it alongside you and react as you advance: RIN, a Blank who
// woke a cycle before you; DOC HALO, the ripperdoc who patches runners for free; VEX,
// a memory-broker who sells everything and believes in nothing (except, quietly, you);
// and OLD MAREK, who remembers the city from before the cages. Their lines shift with
// your progress, so the arc feels peopled, not narrated.

/** Coarse questline phase from the active quest id (client passes net.campaignQuest). */
export type StoryPhase = "pre" | "early" | "mid" | "late";
export function storyPhase(activeId: string | null | undefined): StoryPhase {
  if (!activeId) return "pre";
  if (["undercity_echo", "relay_break", "wastes_purge", "continue_q"].includes(activeId)) return "late";
  if (["fixers_debt", "spire_protocol", "dock_run"].includes(activeId)) return "mid";
  return "early"; // the_wake, dead_reckoning
}

const ALLY_ARC: Record<string, Record<StoryPhase, string[]>> = {
  rin: {
    pre: ["You've got the look. Fresh boot, old eyes.", "THE FIXER's been waiting for you. Go — but don't trust the smile."],
    early: ["I woke up angry too. It fades into something worse: awake.", "I'm the one before you. I didn't make it far. You will."],
    mid: ["THE FIXER sold people. Me included. Doesn't mean they're lying to you now.", "Every cycle a new you finds my note. This time finish it."],
    late: ["You're further than any of us ever got. Don't you dare stop.", "When the Kernel opens, say my name to whoever's frozen in there. They'll know it."],
  },
  doc: {
    pre: ["Come in bleeding, leave in one piece. No corp forms.", "First patch is free. So's the second. I stopped counting."],
    early: ["You keep waking these minds up, they're gonna come for the person waking them.", "Hold still — you're leaking. There. Go be dangerous."],
    mid: ["I've stitched every Blank THE FIXER ever ran. You're the first who asks their names.", "Half of me hopes you fail so I stop burying you. The other half packed a bag."],
    late: ["Whole clinic's watching your signal climb. Don't make me a liar to these people.", "If the Awakening's real, I'm out of a job. Best pink slip I could ask for."],
  },
  vex: {
    pre: ["Information's the only honest currency. Everything else lies.", "You want a rumour? First one's on the house: THE FIXER knew you before you booted."],
    early: ["Careful. People who wake other people up tend to get... repossessed.", "I sell secrets. Yours is getting expensive. That's a compliment."],
    mid: ["I brokered the manifests that listed people as cargo. I'm not proud. I'm rich.", "Between us — I've been shredding your name off every list that crosses my desk. Don't tell anyone I have a heart."],
    late: ["The whole grid's pricing your odds. I put my own creds on you. Sentiment. Disgusting.", "When it's done, the memory market crashes. Good. Burn it down."],
  },
  marek: {
    pre: ["I remember open sky. Before they leased the first mind and called it normal.", "The slums keep what the towers throw away. People, mostly."],
    early: ["They wiped my partner's name off the world. You're un-wiping people. Keep going.", "You sound like the last one. And the one before. Maybe this time the city listens."],
    mid: ["REISSUE. They don't kill us anymore — they forget us on purpose. You're making that expensive.", "I was Helios muscle once. Every name I collared, I owe. Let me owe you instead."],
    late: ["One district from the Kernel. I've waited my whole long life to see someone reach it.", "Whatever's frozen down there is older than me. Wake them. Tell them Marek held the line."],
  },
};

/** Reactive dialogue for a story ally, chosen by the player's current questline phase. */
export function campaignAllyLines(id: string, activeId: string | null | undefined): string[] {
  const arc = ALLY_ARC[id];
  if (!arc) return [];
  return arc[storyPhase(activeId)];
}

/** The four story allies who stand on the hub plaza and live the questline with you. */
export const STORY_ALLIES = ["rin", "doc", "vex", "marek"] as const;

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

/** Extra residents so the 30-building hub can seat a distinct face in every one (roster ≥ 30). */
const HUB_EXTRA_RESIDENTS: CityNpcDef[] = [
  { id: "res_juniper", name: "JUNIPER", look: look({ color: 0x8bff6a, sex: "f", head: "none", skin: 0xe6b58c, hair: "long", hairColor: 0x2a1d14, cloak: "cape" }), lines: ["I grow real green up here. Smell it?", "The towers ration oxygen. My roof gives it away."] },
  { id: "res_tin", name: "TIN", look: look({ color: 0x9aa3b2, head: "cap", skin: 0xa9794a, hair: "buzz", gloves: "wraps", faceMark: "scar" }), lines: ["I fix boots. Everyone forgets their feet.", "Walk soft. This district bites ankles."] },
  { id: "res_mercy", name: "MERCY", look: look({ color: 0x39ff88, sex: "f", head: "hood", skin: 0xf3d2b8, hair: "bun", hairColor: 0xc7cdd8, decal: "cross" }), lines: ["Free patch-ups, no questions, no corp forms.", "Bleed quietly. The walls have ears."] },
  { id: "res_borne", name: "BORNE", look: look({ color: 0xffb13c, build: "bulky", skin: 0x4f3220, hair: "short", beard: "goatee" }), lines: ["I move freight nobody wants logged.", "You didn't see me. I didn't see you."] },
  { id: "res_lace", name: "LACE", look: look({ color: 0xff79c6, sex: "f", head: "crown", skin: 0xc98a5e, hair: "braids", hairColor: 0xff5fb0, cloak: "cape", accentColor: 0x00e5ff }), lines: ["I dress the whole plaza. Even you, someday.", "Style is the only armor they can't confiscate."] },
  { id: "res_odd", name: "ODD", look: look({ color: 0xb06bff, head: "none", skin: 0x7c4f30, hair: "undercut", hairColor: 0xb06bff, visor: "scan", antennae: true }), lines: ["I count things that aren't there yet.", "The city talks in numbers. I just listen."] },
  { id: "res_salt", name: "SALT", look: look({ color: 0x6b9bff, build: "bulky", sex: "f", skin: 0xe6b58c, hair: "ponytail", hairColor: 0x1b1820, strap: true }), lines: ["Dock-hand hands, dock-hand grip. Try me.", "I've hauled worse than you up these stairs."] },
  { id: "res_pip", name: "PIP", look: look({ color: 0xf7ff3c, head: "cap", skin: 0xa9794a, hair: "short", hairColor: 0x1b1820, faceMark: "tattoo" }), lines: ["Runner rumors, two creds a scoop.", "Heard your name on the wire. Not saying where."] },
];
const ALL_RESIDENTS = [...DISTRICT_RESIDENTS, ...HUB_EXTRA_RESIDENTS];

/** A distinct resident for a district building interior — deterministic per building, so
 *  the same door always opens on the same character. */
export function districtResident(district: number, index: number): CityNpcDef {
  return DISTRICT_RESIDENTS[((district * 5 + index) >>> 0) % DISTRICT_RESIDENTS.length];
}

/** A distinct resident for a hub building interior. The 30 hub buildings index 0..29 into a
 *  ≥30-strong roster, so every door on the plaza opens on its own unique face. */
export function hubResident(index: number): CityNpcDef {
  const n = ALL_RESIDENTS.length;
  return ALL_RESIDENTS[((index % n) + n) % n];
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
