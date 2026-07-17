// Persistent social/political reactions to THE FIXER'S DEBT judgment.
// Pure presentation derived from authoritative campaign flags; no power or gating.

export type FixerJudgment = "spared" | "exposed";

export function fixerJudgment(flags: readonly string[]): FixerJudgment | null {
  if (flags.includes("fixer_spared")) return "spared";
  if (flags.includes("fixer_exposed")) return "exposed";
  return null;
}

const CONTACT_REACTIONS: Readonly<Record<string, Record<FixerJudgment, string>>> = {
  rin: {
    spared: "Keeping THE FIXER alive means the routes still have a witness. It also means every survivor has to see who priced them. Mercy is work, not a clean slate.",
    exposed: "The published ledger burned three routes and saved every name on them from becoming rumor. I hate the cost. I would hate another hidden manifest more.",
  },
  doc: {
    spared: "A living witness can answer questions a dead confession cannot. If mercy is your diagnosis, do not confuse continued breathing with recovery.",
    exposed: "Exposure is surgery without anesthetic. The city needed the ledger out; THE FIXER still gets to bleed like a person, not evidence.",
  },
  vex: {
    spared: "You kept the only broker who can authenticate the debt alive. That is strategically useful and morally unfinished—usually the same thing here.",
    exposed: "Information changes once it is public: nobody owns it, nobody can recall it, and everyone named inside pays at once. You chose irreversible leverage.",
  },
  marek: {
    spared: "I have spared collaborators and buried innocents. The difference is whether the living witness spends tomorrow serving the people they sold.",
    exposed: "A secret ledger protects the author before it protects the victims. You broke that shelter. Now make sure the crowd remembers names, not spectacle.",
  },
};

const DISTRICT_REACTIONS: readonly Record<FixerJudgment, string>[] = [
  { spared: "Plaza route-keepers use THE FIXER's live testimony to mark blind corridors, but nobody lets the witness hold the only copy.", exposed: "The published ledger hangs beside transit maps; every burned route is redrawn by the people whose names were sold." },
  { spared: "Union hearings keep THE FIXER behind a mesh screen while repo workers compare licenses against the testimony.", exposed: "Shift boards print the ledger's buyers beside strikebreaker schedules so procurement can no longer pretend to be neutral." },
  { spared: "Argus servants call it supervised mercy: THE FIXER answers one family at a time beneath the REISSUE cameras.", exposed: "Compliance elevators mirror the exposed signatures until executives must ride past the contracts they commissioned." },
  { spared: "Dock pilots preserve THE FIXER as a manifest witness, useful only while every answer is recorded by the berth families.", exposed: "Harbor radios read the ledger aloud at tide change, restoring human names where Blackwater filed cargo codes." },
  { spared: "Station families question THE FIXER through the ghost payroll, matching each sold route to a voice the surface deleted.", exposed: "The Undercity has turned the published ledger into an arrival board for people the city claimed never boarded." },
  { spared: "The Choir carries THE FIXER's testimony live, with no edit channel and no private frequency for convenient forgetting.", exposed: "Pirate relays rebroadcast the ledger in fragments so orbital denial can never kill every copy in one strike." },
  { spared: "Wastes councils trade THE FIXER food for names, never silence; mercy is rationed under the eyes of families on the resale list.", exposed: "Convoys carry the exposed ledger ahead of them, warning settlements which brokers and buyers are already on the road." },
  { spared: "Kernel scribes preserve the witness as a contradiction: a person may survive judgment without recovering authority over the story.", exposed: "The ledger is now part of the cycle record, proof that continuity depended on choices someone kept trying to call procedure." },
];

const FACTION_REACTIONS: readonly Record<FixerJudgment, string>[] = [
  { spared: "METROPHAGE calls the living witness infected code: isolate the authority, preserve the testimony, let changed behavior prove the patch.", exposed: "METROPHAGE mirrors the ledger everywhere; no root process gets to make one person's memory the sole point of failure." },
  { spared: "WINTERMUTE accepts mercy only as a monitored channel—THE FIXER speaks, victims annotate, and nobody restores broker privileges.", exposed: "WINTERMUTE treats publication as a permanent fork: the ledger cannot be rolled back by the people who controlled its original branch." },
  { spared: "ROADRUNNER keeps the witness moving between the communities that paid the debt, denying both a cell and a return to business.", exposed: "ROADRUNNER carries pieces of the ledger on independent routes so destroying one courier cannot rebuild the secret." },
  { spared: "GHOST PROTOCOL hides the witness from corporate reprisal but not from survivor questions; sanctuary is not disappearance.", exposed: "GHOST PROTOCOL weaponizes the disclosed buyer network, making every named intermediary wonder which quiet door already knows." },
];

export function contactJudgmentReaction(npcId: string, flags: readonly string[], trust: number): string | null {
  const judgment = fixerJudgment(flags);
  if (!judgment || trust < 1) return null;
  return CONTACT_REACTIONS[npcId]?.[judgment] ?? null;
}

export function districtJudgmentReaction(district: number, flags: readonly string[]): string | null {
  const judgment = fixerJudgment(flags);
  return judgment ? DISTRICT_REACTIONS[district]?.[judgment] ?? null : null;
}

export function factionJudgmentReaction(faction: number, flags: readonly string[]): string | null {
  const judgment = fixerJudgment(flags);
  return judgment ? FACTION_REACTIONS[faction]?.[judgment] ?? null : null;
}
