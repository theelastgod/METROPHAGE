// Later consequences of completed campaign acts. These are presentation echoes of
// authoritative completed ids / flags; they never gate content or grant power.

export type CampaignEchoContext = "fixer" | "ally" | "resident" | "fragment";

export interface CampaignEchoDef {
  quest: string;
  district: number;
  fixer: string;
  ally: string;
  resident: string;
  fragment: string;
  civic: string;
}

export const CAMPAIGN_ECHOES: readonly CampaignEchoDef[] = [
  { quest: "the_wake", district: 0, fixer: "Your old voice is in the room now. I don't get to call you new again.", ally: "The plaza heard a Blank answer their own ghost and keep walking.", resident: "People are leaving notes for whoever wakes next.", fragment: "Your recovered voice makes this memory feel addressed, not archived.", civic: "Blind routes now carry wake-notes between market stalls." },
  { quest: "homestead", district: 0, fixer: "A door with your name changes the leverage. That's why I sent you.", ally: "Someone put a callsign on a door and REISSUE had to recognize an address.", resident: "Tenements are keeping spare nameplates for newly awakened runners.", fragment: "This memory now has somewhere physical to return to.", civic: "Residents are treating permanent shelter as anti-REISSUE infrastructure." },
  { quest: "dead_reckoning", district: 1, fixer: "Helios called you overdue. You answered by surviving the collector.", ally: "Repo schedules are circulating as warning lists instead of warrants.", resident: "The Stacks mark repossession crews before their shift begins.", fragment: "The queue number in this fragment matches a route you already broke.", civic: "Union spotters publish repo routes beside the shift board." },
  { quest: "fixers_debt", district: 2, fixer: "You know my price now. Whatever you chose, I work under your judgment.", ally: "Nobody in the crew mistakes THE FIXER's survival for innocence anymore.", resident: "Copies of the unsigned contract keep appearing in compliance elevators.", fragment: "THE FIXER's handwriting turns this record from rumor into testimony.", civic: "Debt ledgers are being annotated with the names of who signed and who refused." },
  { quest: "spire_protocol", district: 2, fixer: "REISSUE has a name now, and named machines can be sabotaged.", ally: "Clinics are teaching runners how to recognize a replacement before it finishes smiling.", resident: "Spire servants compare memories at shift change to catch quiet reprints.", fragment: "The protocol described here is no longer invisible to you.", civic: "Public mirrors carry REISSUE checks alongside executive dossiers." },
  { quest: "dock_run", district: 3, fixer: "Those manifests list people again. Cargo was always the lie.", ally: "Dock crews are reading recovered names over open harbor channels.", resident: "Pilots refuse containers whose navigation voice knows its own name.", fragment: "A manifest name from the docks recurs in this recovered memory.", civic: "Berth crews maintain a living registry of minds once declared freight." },
  { quest: "undercity_echo", district: 4, fixer: "The deleted transit staff remember every route the city buried.", ally: "Old station names are becoming meeting places aboveground.", resident: "Families ride dead platforms just to hear a missing relative announce arrival.", fragment: "A station voice underneath this memory now sounds like a person you freed.", civic: "Tunnel communes publish ghost payroll beside medicine routes." },
  { quest: "relay_break", district: 5, fixer: "The sky denied the signal and the street outlasted the weather.", ally: "Pirate stations rebroadcast Awakening testimony between official silences.", resident: "Antenna climbers paint every survived anomaly onto the dishes.", fragment: "This memory carries beyond the orbital denial layer now.", civic: "The Choir reserves one unlicensed band for newly awakened voices." },
  { quest: "wastes_purge", district: 6, fixer: "The ledger priced every mind. The Wastes answered with people it couldn't inventory.", ally: "Convoys are using the resale ledger to find captives before buyers do.", resident: "Scrap saints nail corporate valuations upside down over repaired wells.", fragment: "The price beside this memory has been crossed out by hand.", civic: "Settlement councils use seized valuation data to intercept human cargo." },
  { quest: "continue_q", district: 7, fixer: "You proved the cage can lose in public. Nothing I say gets to make that smaller.", ally: "Every runner who saw the Warden fall carries a different version of morning.", resident: "The Kernel district has started asking what waking people need after victory.", fragment: "This memory is no longer a warning from a failed timeline; it is history you changed.", civic: "Post-Awakening councils are converting breach routes into clinics, archives, and exits." },
];

export function latestCampaignEcho(completed: readonly string[]): CampaignEchoDef | null {
  for (let i = CAMPAIGN_ECHOES.length - 1; i >= 0; i--) if (completed.includes(CAMPAIGN_ECHOES[i].quest)) return CAMPAIGN_ECHOES[i];
  return null;
}

function judgmentSuffix(flags: readonly string[]): string {
  if (flags.includes("fixer_spared")) return " You kept THE FIXER alive as a witness; mercy did not erase the debt.";
  if (flags.includes("fixer_exposed")) return " You published THE FIXER's ledger; the city knows who paid for the route.";
  return "";
}

export function campaignEchoLine(context: CampaignEchoContext, completed: readonly string[], flags: readonly string[] = []): string | null {
  const echo = latestCampaignEcho(completed);
  return echo ? echo[context] + (completed.includes("fixers_debt") ? judgmentSuffix(flags) : "") : null;
}

export function districtCampaignEcho(district: number, completed: readonly string[], flags: readonly string[] = []): string | null {
  const options = CAMPAIGN_ECHOES.filter((e) => e.district === district && completed.includes(e.quest));
  const echo = options[options.length - 1];
  return echo ? echo.civic + (completed.includes("fixers_debt") ? judgmentSuffix(flags) : "") : null;
}
