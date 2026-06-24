// METROPHAGE — the city's inhabitants. Each is a customized character (the same look
// system as players, so they're varied + on-style) with flavour dialogue. Quest-givers
// are tagged with `quest`; the quest system layers offer/advance/reward on top.

import type { PlayerLook } from "../net/protocol";

/** Fill a PlayerLook from a partial (sensible cyber defaults). */
function look(p: Partial<PlayerLook>): PlayerLook {
  return {
    color: 0x00e5ff,
    build: "normal",
    head: "helmet",
    visor: "band",
    shoulders: "none",
    decal: "none",
    cloak: "none",
    skin: -1,
    sex: "m",
    hair: "none",
    hairColor: 0x4a2f1c,
    beard: "none",
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
    look: look({ color: 0xff2bd6, head: "crown", visor: "scan", shoulders: "spikes" }),
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
    look: look({ color: 0xb06bff, visor: "single", antennae: true, build: "slim" }),
    lines: ["…", "I wasn't here. You didn't see me."],
  },
];

export const ALL_NPCS: CityNpcDef[] = [...KEY_NPCS, ...CITIZENS];

export function npcDef(id: string): CityNpcDef | undefined {
  return ALL_NPCS.find((n) => n.id === id);
}
