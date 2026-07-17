// Metro City's recoverable civic archive. Page counters live in player_stats;
// this module is shared, bounded, and DOM/Phaser-free.

export interface CivicArchiveRecord {
  title: string;
  text: string;
}

export const CIVIC_ARCHIVES: readonly (readonly CivicArchiveRecord[])[] = [
  [
    { title: "INTAKE 04-771", text: "Twenty-three strike casualties entered REISSUE. The public roll lists four injuries and no names." },
    { title: "MERCY OVERRIDE", text: "Clinic staff hid seven waking minds under duplicate bloodwork. DOC signed every duplicate in violet ink." },
    { title: "BLANK COHORT ONE", text: "The first cohort retained a shared pause before false answers. HSS classified the pause as a manufacturing defect." },
    { title: "UNCLAIMED RETURN", text: "One body returned without a purchaser, employer, or family record. MAREK wrote DAUGHTER where the owner field should be." },
  ],
  [
    { title: "PLATFORM NULL", text: "A station served six erased neighborhoods for nine years after Transit removed it from the route map." },
    { title: "GHOST PAYROLL", text: "Terminated workers kept maintaining the line because payroll ended before their minds received the order." },
    { title: "ARRIVAL VOICES", text: "The announcement system learned buried street names from sleeping passengers and began restoring them at night." },
    { title: "LAST PUBLIC TRAIN", text: "The final unsponsored service carried witnesses, not commuters. SUBWAY WARDEN logged every voice that came back." },
  ],
  [
    { title: "PARCEL 8-C", text: "An occupied block became twelve delinquent assets when Palantir priced a protest as future structural damage." },
    { title: "KITCHEN EXCEPTION", text: "SABLE converted a holding cell into a bar before Blackwater could auction its booking desk." },
    { title: "PAPER RESIDENTS", text: "RIN's manifests list families as cargo because freight records survive audits that erase tenants." },
    { title: "COMMON TITLE", text: "Eight districts filed the same impossible owner: EVERYONE STILL HERE. The registry has failed to reject it." },
  ],
] as const;

export const CIVIC_ARCHIVE_PAGE_CAP = CIVIC_ARCHIVES[0].length;

export const civicArchivePageKey = (node: number): string => `archive_terminal_${Math.max(0, Math.floor(node))}_pages`;

export function civicArchiveSnapshot(stats: Record<string, number>): number[] {
  return CIVIC_ARCHIVES.map((records, node) =>
    Math.min(records.length, Math.max(0, Math.floor(stats[civicArchivePageKey(node)] ?? 0))),
  );
}

export function civicArchiveRecord(node: number, page: number): CivicArchiveRecord | null {
  return CIVIC_ARCHIVES[node]?.[page] ?? null;
}

export function civicArchiveSynthesis(pages: readonly number[]): string {
  const total = pages.reduce((sum, n) => sum + Math.max(0, Math.floor(n) || 0), 0);
  if (total >= 12) return "COMMON RECORD · casualty, transit, and property ledgers all describe the same theft: institutions converting people into ownable rows.";
  if (total >= 9) return "PUBLIC PROOF · three separate civic systems share names the official city insists never coexisted.";
  if (total >= 6) return "CROSS-INDEX · erased patients and ghost workers recur under different asset numbers.";
  if (total >= 3) return "PATTERN FOUND · deletion was coordinated policy, not damaged data.";
  return total > 0 ? "PARTIAL INDEX · one recovered record is testimony, not yet proof." : "SEALED INDEX · scan the three plaza terminals to recover the city's deleted record.";
}

export function civicArchiveContactLine(npcId: string, pages: readonly number[]): string | null {
  const total = pages.reduce((sum, n) => sum + Math.max(0, Math.floor(n) || 0), 0);
  if (total < 3) return null;
  if (npcId === "keep_citycenter") return total >= 12
    ? "The public terminal keeps rejecting EVERYONE STILL HERE as an owner. I keep submitting it."
    : "Those archive fragments were deleted in three departments at the same minute. That is a signature.";
  if (npcId === "doc" && (pages[0] ?? 0) >= 2) return "Violet ink meant the patient woke before the paperwork did. You found my copies.";
  if (npcId === "subway_warden" && (pages[1] ?? 0) >= 2) return "Ghost payroll is still payroll. The line owes them wages and names.";
  if (npcId === "rin" && (pages[2] ?? 0) >= 3) return "Freight survives audits. People don't. Now you know why my manifests lie.";
  return null;
}
