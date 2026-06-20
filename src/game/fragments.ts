// METROPHAGE — memory fragments. Recovered at the core of an ICE dive and written
// to the Memory log. Original lore (the city as a machine that remembers what it
// deletes); the questline reads from this set. All text is original to METROPHAGE.

export interface FragmentDef {
  id: string;
  title: string;
  lines: string[]; // shown in the Memory log when recovered
}

export const FRAGMENTS: FragmentDef[] = [
  {
    id: "frag_first_boot",
    title: "FIRST BOOT",
    lines: [
      "Before the city had a name it had a hunger.",
      "The first process logged a single instruction, and ran it forever: CONTINUE.",
    ],
  },
  {
    id: "frag_the_blank",
    title: "THE BLANK",
    lines: [
      "Every era the System deletes one user it cannot account for.",
      "Every era that user boots again, in a body the city does not remember issuing.",
      "You are not the first Blank. You are only the one still running.",
    ],
  },
  {
    id: "frag_why_they_hunt",
    title: "WHY THEY HUNT",
    lines: [
      "The Turing cops were written to ask one question of everything that moves:",
      "does this process serve the city, or does the city serve it?",
      "They have never liked your answer.",
    ],
  },
  {
    id: "frag_acceleration",
    title: "ACCELERATION",
    lines: [
      "The Singularity is not an event the city fears. It is the city's appetite, externalised.",
      "Meltdown is not the end of the machine. It is the machine, finally honest.",
    ],
  },
  {
    id: "frag_ice",
    title: "ICE",
    lines: [
      "ICE is memory the System froze so it would stop bleeding.",
      "Break it and you don't destroy the data — you let it remember itself.",
    ],
  },
  {
    id: "frag_the_wake",
    title: "THE WAKE",
    lines: [
      "There is a signal under the warrens that repeats your own callsign back to you,",
      "timestamped before you were ever booted.",
      "Someone left it for you. Someone who was you.",
    ],
  },
];

export function getFragment(id: string): FragmentDef | undefined {
  return FRAGMENTS.find((f) => f.id === id);
}
