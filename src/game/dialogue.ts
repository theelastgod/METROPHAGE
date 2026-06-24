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
  // "The Wake" — offered by the FIXER.
  wake_offer: {
    start: "intro",
    nodes: {
      intro: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Sit down, cyberian. There's a signal under this plaza older than the plaza.",
          "It pings on your callsign. Yours. Timestamped before the city ever issued you a body.",
        ],
        choices: [
          { text: "Whose signal is it?", goto: "explain" },
          { text: "What do you need me to do?", goto: "ask" },
        ],
      },
      explain: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "The thing nobody lives long enough to ask. The System deletes one user an era. One Blank.",
          "I think the last one left you a message. Spread your infection through the plaza and it'll surface.",
        ],
        choices: [
          { text: "I'll do it. [Accept]", action: "accept" },
          { text: "Not now.", goto: "decline" },
        ],
      },
      ask: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: ["Infect the plaza's nodes. The contagion will shake the signal loose from the ICE."],
        choices: [
          { text: "Consider it done. [Accept]", action: "accept" },
          { text: "Not now.", goto: "decline" },
        ],
      },
      decline: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: ["Suit yourself. The signal's not going anywhere. Neither are the cops."],
      },
    },
  },

  // "The Wake" — final beat after the fragment is pulled.
  wake_final: {
    start: "reveal",
    nodes: {
      reveal: {
        speaker: "// MEMORY",
        portrait: "player",
        lines: [
          "The fragment decodes into a voice — yours, slowed and frozen in ICE.",
          "\"If you're hearing this, the city rebuilt what we burned. Again. Don't let it tell you you're new.\"",
        ],
        then: "fixer",
      },
      fixer: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: ["You went quiet. So you heard it. The wake of the last you."],
        choices: [
          { text: "Then I burn it all the way down this time.", action: "complete" },
          { text: "How many of me have there been?", goto: "count" },
        ],
      },
      count: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Enough that the System keeps a deletion queue with your name already typed.",
          "Make this run the one it can't undo.",
        ],
        choices: [{ text: "I will. [Finish]", action: "complete" }],
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
          "You heard the last you. Good. Now hear this: it didn't go quietly.",
          "Before the System caught it, it scattered itself across the district. Caches. Notes. A trail.",
        ],
        choices: [
          { text: "And the cops are erasing it.", goto: "race" },
          { text: "Why would it leave a trail?", goto: "why" },
        ],
      },
      race: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: ["Pulling it apart node by node as we speak. Put them down and get to the cache before they do."],
        choices: [
          { text: "Then I'm already late. [Accept]", action: "accept" },
          { text: "Not yet.", goto: "decline" },
        ],
      },
      why: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Because it knew it was running out of era. You leave a trail for the next one when you can't be the one who finishes.",
          "It left it for you. Cut the cops off it and dive the cache.",
        ],
        choices: [
          { text: "Show me where. [Accept]", action: "accept" },
          { text: "Not yet.", goto: "decline" },
        ],
      },
      decline: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: ["Clock's the System's, not mine. But it's ticking on your name."],
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
          "The cache decompresses into a single stolen file: the System's own scheduler.",
          "One entry recurs, era after era, already typed and waiting. Your callsign. Status: OVERDUE.",
        ],
        then: "fixer",
      },
      fixer: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "So now you know why they swarm you and not the rest of us. You're not a threat to them.",
          "You're a chore they keep forgetting to finish.",
        ],
        choices: [
          { text: "Then I'll be unforgettable. [Finish]", action: "complete" },
          { text: "How are YOU not on that list?", goto: "suspicion" },
        ],
      },
      suspicion: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "...That's a good question. Ask it again when you've got more than a hunch.",
          "Go. The trail's cold and your name isn't.",
        ],
        choices: [{ text: "Count on it. [Finish]", action: "complete" }],
      },
    },
  },

  // ── ACT III — THE FIXER'S DEBT (spare / expose) ───────────────────────────
  debt_offer: {
    start: "intro",
    nodes: {
      intro: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "You looked at me sideways last time and you were right to.",
          "There's something I want to tell you somewhere the System can't subpoena it. My old safehouse. Push your contagion until your signal reaches it.",
        ],
        choices: [
          { text: "What's at the safehouse?", goto: "what" },
          { text: "Fine. I'm listening. [Accept]", action: "accept" },
        ],
      },
      what: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Me. The version of me I keep behind ICE so I don't have to look at it.",
          "Spread far enough to reach it and you can look for both of us.",
        ],
        choices: [
          { text: "Open it up. [Accept]", action: "accept" },
          { text: "Maybe I don't want to know.", goto: "decline" },
        ],
      },
      decline: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: ["Smart. Wrong, but smart. The offer keeps."],
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
          "The vault opens on a contract, re-signed every era by the same hand. The FIXER's.",
          "The terms are four words wide: deliver the Blank, keep accounting.",
          "There is a delivery log. It is long. The most recent entry is unsigned, and it is you.",
        ],
        then: "confess",
      },
      confess: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Every era the System finds whoever reaches the Blank first and offers them the same deal. Sell you, and keep my ledger, my body, my name.",
          "I took it. Era after era. You're not the first runner I walked to the door.",
          "But I didn't sign this one. I brought you here instead. Make of that what you want.",
        ],
        choices: [
          { text: "We both kept running. Keep your secret.", goto: "spare" },
          { text: "The System should know what you are.", goto: "expose" },
        ],
      },
      spare: {
        speaker: "// SYSTEM",
        portrait: "player",
        lines: [
          "You close the ledger without reading the rest of the names.",
          "\"You didn't sign it. That's the whole difference, and it's enough. Help me finish, and we erase the deal for good.\"",
          "The FIXER exhales like a process that just unblocked.",
        ],
        choices: [{ text: "Together, then. [Finish]", action: "complete:fixer_spared" }],
      },
      expose: {
        speaker: "// SYSTEM",
        portrait: "player",
        lines: [
          "You copy the ledger to an open channel. Somewhere, a Turing cop reprioritises.",
          "\"You sold every one of us to stay an accountant. Now the System knows its accountant can be sold too.\"",
          "The FIXER doesn't argue. They just nod, like they typed this ending themselves a long time ago.",
        ],
        choices: [{ text: "We're done here. [Finish]", action: "complete:fixer_exposed" }],
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
          "The thing that ends you isn't a gun in the Core. It's a routine in the Spire, and it's worse than a gun.",
          "Take a district off the System whole — all the way to extraction. That backpressure forces the Spire's uplink open.",
        ],
        choices: [
          { text: "Worse than a gun how?", goto: "worse" },
          { text: "Consider the district mine. [Accept]", action: "accept" },
        ],
      },
      worse: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "A gun would kill you. This thing doesn't bother. It just forgets you and prints the next you over the warm spot.",
          "Crack the Spire and dive the vault before it recompiles. I want to know its name.",
        ],
        choices: [
          { text: "It'll have one by the time I'm done. [Accept]", action: "accept" },
          { text: "Later.", goto: "decline" },
        ],
      },
      decline: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: ["The Spire's patient. It's had eras of practice. We don't have that long."],
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
          "The protocol unfolds. You expected DELETE. You were giving the System too much honesty.",
          "It is called REISSUE. It does not end the Blank — it forgets the Blank, then instantiates a fresh one over the same address, scrubbed of the question.",
          "There is a comment in the source, eras old: // do not let it read this far.",
        ],
        then: "fixer",
      },
      fixer: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "REISSUE. So it never killed you. It just kept changing the subject.",
          "Every you got exactly this far and got rewritten before the next thought. You're already further than all of them.",
        ],
        choices: [
          { text: "Then the next thought is mine. [Finish]", action: "complete" },
          { text: "What happens if I reach the Core first?", goto: "core" },
        ],
      },
      core: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "Then for once the routine runs late. You take the Core, the Singularity tips, and the city has to be honest about what it is.",
          "Meltdown isn't dying. It's the machine stopping the lie. Go write the thought it can't reissue.",
        ],
        choices: [{ text: "I'm going. [Finish]", action: "complete" }],
      },
    },
  },

  // ── ACT V — CONTINUE (remembers the Act III choice) ───────────────────────
  continue_offer: {
    start: "intro",
    nodes: {
      intro: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "This is the last door, cyberian. The spine. Past it, the Overmind, then the Core.",
          "Everything the System has left routes through here. It will spend all of it to keep you out.",
        ],
        choices: [
          { text: "Let it spend. [Accept]", action: "accept" },
          { text: "And after the Core?", goto: "after" },
        ],
      },
      after: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "After the Core there's no after that the city has ever let one of us see. That's the point. Reach it. Read it. Decide.",
          "Burn a path down the spine and pull whatever's frozen at the bottom.",
        ],
        choices: [{ text: "Down the spine. [Accept]", action: "accept" }],
      },
    },
  },
  continue_final: {
    start: "router",
    nodes: {
      // Route through the FIXER's fate from Act III, then converge on the same choice.
      router: {
        speaker: "// MEMORY",
        portrait: "player",
        lines: [
          "The oldest ICE in the city cracks, and the first instruction thaws into one word:",
          "CONTINUE. Logged before the city had a name, obeyed past all meaning ever since.",
          "You understand it now. You are the contradiction it spawns to keep running — the error it deletes so the loop stays clean.",
        ],
        branch: [
          { flag: "fixer_spared", goto: "with_fixer" },
          { flag: "fixer_exposed", goto: "alone" },
        ],
        then: "with_fixer", // fallback (a flag is always set by Act III)
      },
      with_fixer: {
        speaker: "FIXER",
        portrait: "fixer",
        lines: [
          "You kept my secret, so I'll keep my word: I'm on the channel with you to the end. No ledger this time.",
          "When you take the Core, the Singularity tips and the loop has nothing left to continue but the truth. That's not me dying. That's me finally telling it.",
        ],
        choices: [
          { text: "Then we end CONTINUE. [Finish]", action: "complete" },
          { text: "What if a new me boots anyway?", goto: "doubt" },
        ],
      },
      alone: {
        speaker: "// SYSTEM",
        portrait: "player",
        lines: [
          "The FIXER's channel is gone — sold to the System the way they sold everyone else, the way you decided they should be.",
          "You stand at the spine alone, which is the only way every version of you was ever really going to stand here.",
          "No one left to keep accounting. No one left to make the bargain. Just the loop, and the error it can't reissue if the error refuses to forget.",
        ],
        choices: [
          { text: "Then I end CONTINUE myself. [Finish]", action: "complete" },
          { text: "What if a new me boots anyway?", goto: "doubt" },
        ],
      },
      doubt: {
        speaker: "// MEMORY",
        portrait: "player",
        lines: [
          "Maybe one does. Maybe the city prints another you over the warm spot and calls it new.",
          "But this you read all the way to the bottom of the oldest ICE. This you knows the word.",
          "Leave it where the next one will find it, the way the last one left the Wake for you. The loop only continues while we agree to forget.",
        ],
        choices: [{ text: "Take the Core. Break the loop. [Finish]", action: "complete" }],
      },
    },
  },
};
