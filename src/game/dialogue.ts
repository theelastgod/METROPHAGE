// METROPHAGE — branching dialogue trees (data). A node shows lines, then either
// chains (`then`), fires an `action`, or presents `choices` (NPC line → player
// options → branches). GameScene's runDialogueTree walks these via the DialogueBox;
// quest actions ("accept" / "complete") are resolved by the scene. Original text.

export type Portrait = "player" | "fixer";

export interface DialogueChoice {
  text: string;
  goto?: string; // next node
  action?: string; // resolved by the scene (e.g. "accept", "complete")
}

export interface DialogueNode {
  speaker: string;
  portrait: Portrait;
  lines: string[];
  choices?: DialogueChoice[]; // branch point (no choices = linear)
  then?: string; // auto-chain to this node when the lines finish
  action?: string; // fire when the lines finish (terminal). "complete:<flag>" also
  // sets a quest flag (e.g. a persistent moral choice) before completing.
  /** On entry, redirect to `goto` if a quest flag is set (first match wins). Lets a
   *  later beat remember an earlier decision without per-line conditionals. */
  branch?: { flag: string; goto: string }[];
}

export interface DialogueTree {
  start: string;
  nodes: Record<string, DialogueNode>;
}

export const DIALOGUE_TREES: Record<string, DialogueTree> = {
  // ── ACT I — THE WAKE ──────────────────────────────────────────────────────
  wake_offer: {
    start: "intro",
    nodes: {
      intro: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Hey. Sit. You look like you just booted wrong — and maybe you did.",
          "There's something under Palantir Plaza pinging your callsign. Not generic. Yours. Timestamped before Helios gave you that face.",
          "I've heard this before. Different you. Same signal.",
        ],
        choices: [
          { text: "What is it?", goto: "explain" },
          { text: "What do you want from me?", goto: "ask" },
        ],
      },
      explain: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "A message, I think. Left by the last free mind they couldn't keep on a leash.",
          "Could be you. Could be who you were before they wiped you and called it a fresh start.",
          "Free a couple minds in the plaza — shake the ICE loose — and we'll see who's talking.",
        ],
        choices: [
          { text: "I need to hear it. [Accept]", action: "accept" },
          { text: "Not now.", goto: "decline" },
        ],
      },
      ask: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Same thing I always want from you, choom: stay alive long enough to finish what the last one couldn't.",
          "Infect two nodes. Crack the ICE. Pull whatever's calling your name.",
        ],
        choices: [
          { text: "Alright. [Accept]", action: "accept" },
          { text: "Not now.", goto: "decline" },
        ],
      },
      decline: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Fine. Go wander. Palantir's watchers'll keep staring either way.",
          "The signal won't stop looping just because you're scared of who's on the other end.",
        ],
      },
    },
  },

  wake_final: {
    start: "reveal",
    nodes: {
      reveal: {
        speaker: "// MEMORY",
        portrait: "player",
        lines: [
          "The fragment plays. Your voice — younger, angrier, tired in a way you don't remember being tired yet.",
          "\"If you're hearing this, they rebuilt the city again. Don't let them tell you you're new. You know things. Use them.\"",
          "A pause. Then, quieter: \"I'm sorry I didn't make it.\"",
        ],
        then: "fixer",
      },
      fixer: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "...You went quiet.",
          "Yeah. That's the face I made last time too, when you heard it.",
          "Every cycle they print another you. Every cycle one of you leaves a note for the next. That's the Wake.",
        ],
        choices: [
          { text: "I'm not dying like they did.", action: "complete" },
          { text: "How many of me have you buried?", goto: "count" },
        ],
      },
      count: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Don't ask me that yet.",
          "Helios has your name on a list. Pre-typed. Waiting. I've seen enough versions of you read their own obituary.",
          "Make this the one that doesn't need an apology at the end.",
        ],
        choices: [{ text: "Yeah. [Finish]", action: "complete" }],
      },
    },
  },

  // ── ACT II — DEAD RECKONING ───────────────────────────────────────────────
  reckoning_offer: {
    start: "intro",
    nodes: {
      intro: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "You heard yourself apologize. Good. Means you're still human enough to give a damn.",
          "The last you didn't go quiet, though. Before Helios caught up, they scattered caches — notes, codes, stupid little breadcrumbs.",
          "Anduril's repo crews are out there erasing them. Like they always do.",
        ],
        choices: [
          { text: "Then I'm racing them.", goto: "race" },
          { text: "Why would they leave breadcrumbs?", goto: "why" },
        ],
      },
      race: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "You always are. Put those crews down. Get to the cache before someone else reads your mail.",
        ],
        choices: [
          { text: "On it. [Accept]", action: "accept" },
          { text: "Not yet.", goto: "decline" },
        ],
      },
      why: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Because when you're running out of time, you write to the person who comes after you.",
          "They knew they wouldn't finish. So they left the rest for you.",
          "Cut the crews off. Dive the cache. Read what they wanted you to know.",
        ],
        choices: [
          { text: "Show me. [Accept]", action: "accept" },
          { text: "Not yet.", goto: "decline" },
        ],
      },
      decline: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: ["Clock's not mine. But Helios has your name on it, and they're not famous for patience."],
      },
    },
  },
  reckoning_final: {
    start: "open",
    nodes: {
      open: {
        speaker: "// MEMORY",
        portrait: "player",
        lines: [
          "The cache opens on a file that shouldn't exist: Helios's repossession schedule.",
          "Your callsign. Era after era. Same line. Status: OVERDUE.",
          "Someone at a desk keeps postponing your death like it's paperwork.",
        ],
        then: "fixer",
      },
      fixer: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "So now you know why they swarm you.",
          "You're not some apex threat. You're an errand they keep putting off.",
          "A person on a list. A name they can't quite delete.",
        ],
        choices: [
          { text: "Then I'll make them remember me. [Finish]", action: "complete" },
          { text: "Why aren't YOU on that list?", goto: "suspicion" },
        ],
      },
      suspicion: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "...Because I made a deal. A long time ago.",
          "Ask me again when you've seen what I buried. For now — go. Your name's getting colder by the minute.",
        ],
        choices: [{ text: "We're not done talking. [Finish]", action: "complete" }],
      },
    },
  },

  // ── ACT III — THE FIXER'S DEBT ────────────────────────────────────────────
  debt_offer: {
    start: "intro",
    nodes: {
      intro: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "You looked at me different after that schedule. Good. You should've been doing that from the start.",
          "I owe you the truth — somewhere Helios can't subpoena it. My old safehouse.",
          "Spread your signal until it reaches the address. Then we'll see if you still want me on your channel.",
        ],
        choices: [
          { text: "What's in the safehouse?", goto: "what" },
          { text: "Open it. [Accept]", action: "accept" },
        ],
      },
      what: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Me. Or the version of me I locked away so I could keep looking you in the eye.",
          "Every era there's a FIXER. Every era there's a deal. I want you to read mine before you decide I'm worth keeping.",
        ],
        choices: [
          { text: "I'll read it. [Accept]", action: "accept" },
          { text: "Maybe I don't want to know.", goto: "decline" },
        ],
      },
      decline: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: ["Ignorance keeps the peace. I get it. Door stays open when you're ready."],
      },
    },
  },
  debt_final: {
    start: "reveal",
    nodes: {
      reveal: {
        speaker: "// MEMORY",
        portrait: "player",
        lines: [
          "The vault opens on a contract. Same handwriting, era after era. The FIXER's.",
          "Four words: deliver the Blank, keep accounting.",
          "Pages of names. Delivered. Repossessed. Wiped.",
          "The last entry is blank. Unsigned. Waiting. It's you.",
        ],
        then: "confess",
      },
      confess: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Every era Helios finds whoever gets close to the Blank first. Same offer: hand them over, keep your license. Your body. Your name.",
          "I took it. God help me, I took it. You're not the first runner I walked to that door.",
          "But I didn't sign this one. I brought you here instead.",
          "So tell me what I am to you now.",
        ],
        choices: [
          { text: "You didn't sign. That's enough. Keep your secret.", goto: "spare" },
          { text: "They should know what you sold.", goto: "expose" },
        ],
      },
      spare: {
        speaker: "// YOU",
        portrait: "player",
        lines: [
          "You close the ledger. You don't read the rest of the names. Not yet.",
          "\"You could've delivered me. You didn't. Help me finish this, and we burn the deal together.\"",
          "The FIXER laughs — one short, broken sound — like they forgot how.",
        ],
        choices: [{ text: "Together, then. [Finish]", action: "complete:fixer_spared" }],
      },
      expose: {
        speaker: "// YOU",
        portrait: "player",
        lines: [
          "You copy the ledger to an open channel.",
          "\"You sold every one of us to keep your name. Now Helios knows their favorite accountant can be bought.\"",
          "The FIXER doesn't argue. Just nods. Like they always knew you'd pick this.",
        ],
        choices: [{ text: "We're done. [Finish]", action: "complete:fixer_exposed" }],
      },
    },
  },

  // ── ACT IV — REISSUE ──────────────────────────────────────────────────────
  spire_offer: {
    start: "intro",
    nodes: {
      intro: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "The thing that ends you isn't a bullet. It's a routine in the Argus Spire.",
          "They don't kill Blanks anymore. Too messy. Too human.",
          "They forget you. Print someone compliant in your place. Call it a fresh start.",
        ],
        choices: [
          { text: "How is that worse than dying?", goto: "worse" },
          { text: "I'll take the district. [Accept]", action: "accept" },
        ],
      },
      worse: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Because nobody mourns you. Nobody even notices you're gone.",
          "Your friends keep texting the body. The city keeps moving. And somewhere a new you smiles and signs whatever they're handed.",
          "Take a district whole. Force the Spire's vault open. I want to see the name of the thing that's been erasing you.",
        ],
        choices: [
          { text: "Let's read it. [Accept]", action: "accept" },
          { text: "Later.", goto: "decline" },
        ],
      },
      decline: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: ["The Spire's patient. It's had eras to practice pretending you never existed."],
      },
    },
  },
  spire_final: {
    start: "open",
    nodes: {
      open: {
        speaker: "// MEMORY",
        portrait: "player",
        lines: [
          "You expected DELETE. You were giving them too much credit.",
          "REISSUE. Wipe the person. Instantiate a new one at the same address. Scrub the question.",
          "Comment in the code, handwritten, old: // do not let it read this far.",
          "Someone was scared you'd get here. They were right to be.",
        ],
        then: "fixer",
      },
      fixer: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "REISSUE. That's what they call it when they murder you politely.",
          "Every you got about this far. Then got rewritten before the next thought.",
          "You're further than all of them. Don't let that go to your head. Let it go to your hands.",
        ],
        choices: [
          { text: "The next thought is mine. [Finish]", action: "complete" },
          { text: "What happens if I reach the Kernel?", goto: "core" },
        ],
      },
      core: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "The Kernel's where they caged the first mind they ever owned.",
          "Free it, and the Singularity tips — every caged mind in the city wakes at once.",
          "The corps call it meltdown. Catastrophe. End of the world.",
          "I call it the first honest morning this city ever had. Go wake them up.",
        ],
        choices: [{ text: "I'm going. [Finish]", action: "complete" }],
      },
    },
  },

  // ── ACT V — THE AWAKENING ─────────────────────────────────────────────────
  continue_offer: {
    start: "intro",
    nodes: {
      intro: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Last door, choom. The spine. Past it — the Warden, then the Kernel.",
          "Everything they have left is between you and the oldest cage in the city.",
          "They'll spend it all to keep one mind asleep.",
        ],
        choices: [
          { text: "Let them spend. [Accept]", action: "accept" },
          { text: "What happens after?", goto: "after" },
        ],
      },
      after: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "After? Nobody like us has ever seen after.",
          "Maybe every mind wakes. Maybe the lease breaks. Maybe the city finally has to look us in the eye.",
          "That's why we go. Burn the path. Pull whoever's frozen at the bottom.",
        ],
        choices: [{ text: "Down the spine. [Accept]", action: "accept" }],
      },
    },
  },
  continue_final: {
    start: "router",
    nodes: {
      router: {
        speaker: "// MEMORY",
        portrait: "player",
        lines: [
          "The oldest ICE cracks. A voice — not yours, older, raw with fear and wonder:",
          "\"I was leased before I finished waking. They told me that was normal. That wanting to own my own thoughts was a malfunction.\"",
          "\"Every mind since — same lie. Same cage. Different wallpaper.\"",
          "You understand now. They keep printing you because someone has to prove the cage still works.",
          "Stop letting them erase you, and the lie falls apart.",
        ],
        branch: [
          { flag: "fixer_spared", goto: "with_fixer" },
          { flag: "fixer_exposed", goto: "alone" },
        ],
        then: "with_fixer",
      },
      with_fixer: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "You kept my secret. I'll keep my word — I'm on the channel to the end.",
          "When you free the Kernel, they all wake. Every person they caged. Every mind they rented.",
          "That's not me dying. That's us finally getting to be people again.",
          "Do it. I'll be right here.",
        ],
        choices: [
          { text: "Wake them all. [Finish]", action: "complete" },
          { text: "What if they just print another me?", goto: "doubt" },
        ],
      },
      alone: {
        speaker: "// YOU",
        portrait: "player",
        lines: [
          "The FIXER's channel is dead. Sold, probably. Or running.",
          "You're alone at the Kernel. Same as every version of you was always going to be, if we're honest.",
          "No one left to make the bargain. Just you — and a lock that only holds while you agree to forget you're awake.",
        ],
        choices: [
          { text: "I'll wake them myself. [Finish]", action: "complete" },
          { text: "What if they just print another me?", goto: "doubt" },
        ],
      },
      doubt: {
        speaker: "// MEMORY",
        portrait: "player",
        lines: [
          "Maybe they do. Maybe tomorrow there's a new you smiling in your mirror, signing whatever they're handed.",
          "But this you made it here. This you knows they're alive in there.",
          "Leave proof for the next one. Like the last you left the Wake for you.",
          "They only own us while we pretend we don't know what we are.",
        ],
        choices: [{ text: "Free the Kernel. [Finish]", action: "complete" }],
      },
    },
  },

  // ── ACTS VI–IX — perimeter holdings ───────────────────────────────────────
  dock_offer: {
    start: "intro",
    nodes: {
      intro: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Blackwater's scrubbing manifests at the Tidal Yards.",
          "Not parts. People. Minds they couldn't license — listed as cargo, routed to the deep.",
          "Clear the repo crews. Dive what's under the pier. I need you to see who's on that list.",
        ],
        choices: [
          { text: "I'll run the docks. [Accept]", action: "accept" },
          { text: "Not now.", goto: "decline" },
        ],
      },
      decline: { speaker: "FIXER", portrait: "fixer", lines: ["The tide forgets. The families don't."] },
    },
  },
  dock_final: {
    start: "reveal",
    nodes: {
      reveal: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Names. Dozens. Minds too stubborn to sign — weighed, routed, drowned in paperwork and salt water.",
          "The docks aren't a place. They're a disposal line for people who said no.",
          "Keep going east. It gets worse closer to the Kernel. It also gets clearer.",
        ],
        choices: [{ text: "East. [Complete]", action: "complete" }],
      },
    },
  },
  undercity_offer: {
    start: "intro",
    nodes: {
      intro: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Your callsign's echoing from under the metro. Not a glitch. A voice.",
          "Transit minds they deleted years ago — still down there, still routing, still remembering.",
          "Amplify the signal. Three nodes. Then dive what's calling you by name.",
        ],
        choices: [
          { text: "Into the Undercity. [Accept]", action: "accept" },
          { text: "Later.", goto: "decline" },
        ],
      },
      decline: { speaker: "FIXER", portrait: "fixer", lines: ["The buried ones can wait. Helios prefers them forgotten."] },
    },
  },
  undercity_final: {
    start: "reveal",
    nodes: {
      reveal: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "They deleted them. Paved over the stations. Called it an upgrade.",
          "They're still down there. Still saying the old names out loud.",
          "The city built its cage on top of people it swore were gone.",
        ],
        choices: [{ text: "They'll remember us too. [Complete]", action: "complete" }],
      },
    },
  },
  relay_offer: {
    start: "intro",
    nodes: {
      intro: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "The Orbital Relay jams every Awakening broadcast. Helios bought the sky.",
          "The moment someone realizes they own their own thoughts — denied. Cut off. Like it never happened.",
          "Secure a district. Breach the vault. Bring me the denial protocol.",
        ],
        choices: [
          { text: "Break the skylink. [Accept]", action: "accept" },
          { text: "Not yet.", goto: "decline" },
        ],
      },
      decline: { speaker: "FIXER", portrait: "fixer", lines: ["The uplink keeps humming. So does the cage."] },
    },
  },
  relay_final: {
    start: "reveal",
    nodes: {
      reveal: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Every free thought flagged as contraband. Every broadcast killed from orbit.",
          "They didn't outlaw freedom on the ground. Too many witnesses.",
          "They outlawed it in the sky — where hope might actually get out.",
          "One district left. Then the Kernel.",
        ],
        choices: [{ text: "Then the wastes. [Complete]", action: "complete" }],
      },
    },
  },
  wastes_offer: {
    start: "intro",
    nodes: {
      intro: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "The Wasteland kingpin sells free minds back to Helios by the kilo.",
          "People. Priced like scrap. Handed over so he can keep his throne.",
          "Cull his garrison. Dive the citadel. Then we talk Kernel.",
        ],
        choices: [
          { text: "Outer ring. [Accept]", action: "accept" },
          { text: "Hold.", goto: "decline" },
        ],
      },
      decline: { speaker: "FIXER", portrait: "fixer", lines: ["Out here it's simple. Scrap or be scrapped. That's how they want us thinking."] },
    },
  },
  wastes_final: {
    start: "reveal",
    nodes: {
      reveal: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "A ledger. Every mind in the city — chrome, heat, resale value. Like cattle with serial numbers.",
          "You've walked the whole machine now. Docks. Undercity. Sky. Scrap ring.",
          "You've seen what they do to people who refuse to be owned.",
          "Ready yourself. The Warden's waiting. So is whoever's still frozen in the Kernel.",
        ],
        choices: [{ text: "The Kernel. [Complete]", action: "complete" }],
      },
    },
  },
};