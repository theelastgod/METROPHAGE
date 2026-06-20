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
  action?: string; // fire when the lines finish (terminal)
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
};
