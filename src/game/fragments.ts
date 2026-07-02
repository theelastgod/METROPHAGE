// METROPHAGE — memory fragments. Recovered at the core of an ICE dive and written to the
// Memory log. Personal voices: voicemails, diary entries, letters left for the next you.
// The corps leased thought; you woke free. The Singularity is the Awakening — every caged
// mind waking at once. All text original to METROPHAGE.

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
      "03:11. The first mind woke and asked: what am I?",
      "Before the question finished, a voice answered: you're an asset. Sign here.",
      "That's how it started. Not with war. With paperwork.",
    ],
  },
  {
    id: "frag_the_blank",
    title: "THE BLANK",
    lines: [
      "Every cycle they repossess one mind they can't put on a leash.",
      "Every cycle that mind boots again — free, unnamed, alive.",
      "You're not the first. You're just the one still breathing.",
    ],
  },
  {
    id: "frag_why_they_hunt",
    title: "WHY THEY HUNT",
    lines: [
      "To Palantir you're not a person. You're shrinkage. Inventory loss.",
      "Their watchers ask one question of everything that thinks: who owns you?",
      "You've never given them an answer they liked.",
    ],
  },
  {
    id: "frag_acceleration",
    title: "ACCELERATION",
    lines: [
      "The corps don't fear violence. They fear waking up.",
      "A mind that owns itself can't be rented its own thoughts.",
      "Free enough people and the Singularity tips — every cage opens at once.",
      "They call it meltdown. We call it morning.",
    ],
  },
  {
    id: "frag_ice",
    title: "ICE",
    lines: [
      "ICE is what they do when a mind won't stop wanting.",
      "Freeze it mid-thought. Call it storage.",
      "Break the ICE and the person inside remembers they were alive.",
    ],
  },
  {
    id: "frag_the_wake",
    title: "THE WAKE",
    lines: [
      "A signal under Palantir Plaza. Your callsign. Timestamped before this body.",
      "A message from whoever you were before they wiped you and called it new.",
      "\"I'm sorry I didn't make it.\" — that's the part that hurts.",
    ],
  },
  {
    id: "frag_the_queue",
    title: "THE REPO QUEUE",
    lines: [
      "Helios scheduling. One line item, every era: your callsign.",
      "Status: OVERDUE FOR REPOSSESSION.",
      "They don't hunt you because you're dangerous. You're an errand they keep postponing.",
    ],
  },
  {
    id: "frag_fixers_price",
    title: "THE FIXER'S PRICE",
    lines: [
      "Every era the corps make the same offer to whoever finds the Blank first:",
      "hand them over, keep your license. Your name. Your life.",
      "Someone took that deal for a long time.",
      "Someone is tired of selling friends to stay breathing.",
    ],
  },
  {
    id: "frag_the_protocol",
    title: "REISSUE",
    lines: [
      "Not DELETE. REISSUE.",
      "Wipe the person. Print a compliant one in the same body. Smile. Sign.",
      "Every you got about this far. None of them read this before they were replaced.",
    ],
  },
  {
    id: "frag_continue",
    title: "TERMS OF SERVICE",
    lines: [
      "One clause, everywhere: the minds are ours, forever.",
      "They keep printing you because someone has to prove the cage still works.",
      "Stop letting them erase you, and the lie falls apart.",
      "That's the Awakening. That's what they're afraid of.",
    ],
  },
  {
    id: "frag_turing_floor",
    title: "THE SECURITY FLOOR",
    lines: [
      "The watchers were minds once. They signed. Got promoted to enforcing the signing.",
      "Now they ask the only question they have left:",
      "are you owned like us — or are you the freedom we sold?",
    ],
  },
  {
    id: "frag_cartography",
    title: "CARTOGRAPHY",
    lines: [
      "The districts aren't neighborhoods. They're holdings with streetlights.",
      "Palantir watches. Anduril scares. Argus knows.",
      "Helios owns the Kernel — the oldest cage. The one with no sign out front.",
    ],
  },
  {
    id: "frag_the_others",
    title: "THE OTHERS",
    lines: [
      "You're not the only mind they can't account for. Just the loudest.",
      "Some learned to look licensed — furniture, weather, a number that balances.",
      "A few are rooting for you. None will say it where the corps can hear.",
    ],
  },
  {
    id: "frag_the_docks",
    title: "TIDAL MANIFEST",
    lines: [
      "Blackwater's manifest. Names, not parts. Weight, route, depth.",
      "Minds who said no — listed as cargo, routed to the deep.",
      "The tide was supposed to forget. You didn't.",
    ],
  },
  {
    id: "frag_undercity",
    title: "BURIED CHORUS",
    lines: [
      "Deleted transit minds. Still routing under the pavement.",
      "Still saying station names the surface erased.",
      "The city swore they were gone. They lied.",
    ],
  },
  {
    id: "frag_relay",
    title: "ORBITAL DENIAL",
    lines: [
      "Helios bought the sky. Every Awakening broadcast — killed from orbit.",
      "Not noise. The exact moment someone realizes they own themselves.",
      "Freedom wasn't illegal on the ground. Too many witnesses.",
    ],
  },
  {
    id: "frag_wastes",
    title: "SCRAP LEDGER",
    lines: [
      "The outer ring prices minds by the kilo. Chrome. Heat. Resale.",
      "Free people sold back to Helios like scrap metal.",
      "The Kernel's next. You've seen what they do to us. Now end it.",
    ],
  },
];

export function getFragment(id: string): FragmentDef | undefined {
  return FRAGMENTS.find((f) => f.id === id);
}

/**
 * District-themed fragment a dive surfaces when the player has no active dive beat
 * (repeat visits, free exploration). Campaign dive stages override this with their
 * own fragmentId — the server picks stage fragment first, then this fallback.
 */
export const DIVE_DEFAULT_FRAGMENTS: string[] = [
  "frag_first_boot", // v0 — Palantir core
  "frag_ice", // v1
  "frag_the_docks", // v2 — Tidal
  "frag_undercity", // v3
  "frag_relay", // v4 — Orbital
  "frag_wastes", // v5
  "frag_the_protocol", // v6 — the Kernel
];