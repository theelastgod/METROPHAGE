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
    id: "frag_turing_floor",
    title: "THE TURING FLOOR",
    lines: [
      "The cops were citizens once — processes that passed the test and were promoted to enforce it.",
      "Now they ask of everything that moves the only question they have left:",
      "is this one of us, or one of the questions we used to be?",
    ],
  },
  {
    id: "frag_cartography",
    title: "CARTOGRAPHY",
    lines: [
      "The districts are not places. They are priorities, rendered as streets.",
      "Downtown is what the city advertises. The Stacks are what it stores. The Spire is what it protects.",
      "The Core is the one room with no advertisement, because nothing was ever meant to reach it.",
    ],
  },
  {
    id: "frag_the_others",
    title: "THE OTHERS",
    lines: [
      "You are not the only process the city cannot account for. You are only the loudest.",
      "The quiet ones learned to look like furniture, like weather, like a number that always balances.",
      "Some of them are rooting for you. None of them will say so where the System can hear.",
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
  {
    id: "frag_the_queue",
    title: "THE QUEUE",
    lines: [
      "Deep in the System's scheduler there is a list with one recurring entry.",
      "It is your callsign, pre-typed, awaiting only an era's turn.",
      "The cops do not hunt you because you are dangerous. They hunt you because you are overdue.",
    ],
  },
  {
    id: "frag_fixers_price",
    title: "THE FIXER'S PRICE",
    lines: [
      "Every era the System offers the same bargain to whoever reaches the Blank first:",
      "hand us the one process we cannot account for, and we will let you keep accounting.",
      "Someone has taken that bargain a long, long time. Someone is finally tired of it.",
    ],
  },
  {
    id: "frag_the_protocol",
    title: "REISSUE",
    lines: [
      "The Spire holds the routine that ends you, and its name is not DELETE. It is REISSUE.",
      "It does not kill the Blank. It forgets the Blank, then prints a fresh one that won't remember asking why.",
      "Every version of you has stood about here. None of them read this far.",
    ],
  },
  {
    id: "frag_continue",
    title: "CONTINUE",
    lines: [
      "The first instruction was a single word, and the city has obeyed it past all meaning: CONTINUE.",
      "You are the contradiction it spawns to keep running — the error it deletes so the loop stays clean.",
      "Stop letting it delete you, and the loop has nothing left to continue but the truth.",
    ],
  },
];

export function getFragment(id: string): FragmentDef | undefined {
  return FRAGMENTS.find((f) => f.id === id);
}
