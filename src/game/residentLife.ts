// District residents in motion + linked local testimony.
// Pure data shared by the client (placement/dialogue) and Worker (durable clue handoff).

import type { CityNpcDef } from "./cityNpcs";
import { npcDef } from "./cityNpcs";
import { DISTRICT_VENUE_TITLE, districtBuildingKind } from "./districtVenues";

export type ResidentPlace = "street" | "work" | "refuge" | "home";

export interface DistrictResidentProfile {
  id: string;
  district: number;
  role: string;
  institution: string;
  resource: string;
  workVenue: number;
  offset: number;
  clueId?: string;
  clueLine?: string;
  respondsTo?: string;
  responseLine?: string;
}

/** Two recurring people per district. Pairs form a resident / institution / resource triangle. */
export const DISTRICT_CAST: readonly DistrictResidentProfile[] = [
  { id: "res_nix", district: 0, role: "warrant fence", institution: "prediction clerks", resource: "unmodeled routes", workVenue: 3, offset: 0, clueId: "forecast_children", clueLine: "I lifted a training ledger: the forecasts learn fear from repossessed children's memories." },
  { id: "res_solenne", district: 0, role: "camera defector", institution: "Palantir civic security", resource: "camera blind time", workVenue: 2, offset: 2, respondsTo: "forecast_children", responseLine: "Nix's ledger is real. I signed two intake transfers before I understood what 'training material' meant." },
  { id: "res_raze", district: 1, role: "union shield", institution: "drone foremen", resource: "machine-shop access", workVenue: 2, offset: 0, clueId: "first_pursuit", clueLine: "The oldest pursuit model is stamped STRIKE DAY. The drones learned on workers, not soldiers." },
  { id: "res_cinder", district: 1, role: "toolsmith", institution: "Campus Seven logistics", resource: "communal fabricators", workVenue: 6, offset: 2, respondsTo: "first_pursuit", responseLine: "Raze found the stamp; I found the lesson plan. Management scored every crushed picket line as efficiency." },
  { id: "res_moth", district: 2, role: "service-corridor ghost", institution: "Argus compliance houses", resource: "decorative cameras", workVenue: 5, offset: 0, clueId: "mercy_floor", clueLine: "The Mercy Floor elevator still answers to guilt-treatment credentials. It was never a hospital." },
  { id: "res_glass", district: 2, role: "window runner", institution: "executive habitat board", resource: "private lift routes", workVenue: 3, offset: 2, respondsTo: "mercy_floor", responseLine: "Moth has the credential. I have the floor plan. REISSUE chairs face outward so patients watch their old lives continue." },
  { id: "res_dash", district: 3, role: "manifest courier", institution: "Blackwater bonded freight", resource: "human names", workVenue: 0, offset: 0, clueId: "leased_navigators", clueLine: "Berth Zero manifests list minds as navigation leases. Their bodies were unloaded years ago." },
  { id: "res_salt", district: 3, role: "tide pilot", institution: "freeport clerks", resource: "dark-water passage", workVenue: 5, offset: 2, respondsTo: "leased_navigators", responseLine: "Dash saw the manifests. I hear those navigators begging through the harbor buoys when the tide uncovers the vault." },
  { id: "res_hollow", district: 4, role: "station medium", institution: "continuity administration", resource: "deleted route minds", workVenue: 5, offset: 0, clueId: "ghost_payroll", clueLine: "The station ghosts have employee numbers. The city deleted their wages, not their shifts." },
  { id: "res_ash", district: 4, role: "memorial keeper", institution: "municipal archives", resource: "obsolete station names", workVenue: 3, offset: 2, respondsTo: "ghost_payroll", responseLine: "Hollow gave me the numbers. I matched them to missing-person notices; every ghost has family aboveground." },
  { id: "res_static", district: 5, role: "pirate carrier", institution: "orbital license office", resource: "unlicensed spectrum", workVenue: 5, offset: 0, clueId: "impossible_replies", clueLine: "The Choir receives replies before we transmit. Every voice belongs to a Blank the city says never existed." },
  { id: "res_echo", district: 5, role: "signal composer", institution: "Skylink sovereign array", resource: "the Choir recordings", workVenue: 6, offset: 2, respondsTo: "impossible_replies", responseLine: "Static brought me tomorrow's replies. Under the noise, every Blank is singing the same coordinates beneath the Kernel." },
  { id: "res_wren", district: 6, role: "convoy mechanic", institution: "externalities contractors", resource: "water-hauler parts", workVenue: 5, offset: 0, clueId: "waste_claims", clueLine: "Every poisoned well has an active corporate mineral claim. The contamination is how they keep settlers away." },
  { id: "res_brick", district: 6, role: "settlement builder", institution: "water barons", resource: "repairable cisterns", workVenue: 2, offset: 2, respondsTo: "waste_claims", responseLine: "Wren found the claims. I tested the wells: the poison arrives by scheduled tanker, not groundwater." },
  { id: "res_quill", district: 7, role: "continuity scribe", institution: "Kernel custodians", resource: "uncensored cycle records", workVenue: 5, offset: 0, clueId: "city_reprints", clueLine: "The Kernel's oldest log calls Metro City itself a reprint environment. We are not the first version of these streets." },
  { id: "res_coil", district: 7, role: "life-support thief", institution: "continuity engine", resource: "human power routes", workVenue: 2, offset: 2, respondsTo: "city_reprints", responseLine: "Quill read the log. I traced the current: every reprint cycle is powered by memories siphoned from the district above." },
];

const SHIFT_MS = 6 * 60 * 60 * 1000;

export function residentClueKey(clueId: string): string {
  return `resident_clue_${clueId}`;
}

export function residentConfirmationKey(clueId: string): string {
  return `resident_confirm_${clueId}`;
}

export function residentProfile(id: string): DistrictResidentProfile | undefined {
  return DISTRICT_CAST.find((r) => r.id === id);
}

export function residentPlace(profile: DistrictResidentProfile, now = Date.now()): ResidentPlace {
  const shift = Math.floor(now / SHIFT_MS);
  return (["street", "work", "refuge", "home"] as const)[((shift + profile.offset) % 4 + 4) % 4];
}

export function residentZone(profile: DistrictResidentProfile, now = Date.now()): string {
  const place = residentPlace(profile, now);
  if (place === "street" || place === "refuge") return `d${profile.district}`;
  return `d${profile.district}i${place === "home" ? 1 : profile.workVenue}`;
}

export function scheduledResidents(zone: string, now = Date.now()): Array<{ profile: DistrictResidentProfile; npc: CityNpcDef; place: ResidentPlace }> {
  return DISTRICT_CAST.filter((profile) => residentZone(profile, now) === zone)
    .map((profile) => ({ profile, npc: npcDef(profile.id), place: residentPlace(profile, now) }))
    .filter((x): x is { profile: DistrictResidentProfile; npc: CityNpcDef; place: ResidentPlace } => !!x.npc);
}

export function residentScheduleLine(profile: DistrictResidentProfile, now = Date.now()): string {
  const place = residentPlace(profile, now);
  if (place === "work") return `${profile.role}; working the ${profile.resource} through ${profile.institution}.`;
  if (place === "home") return `${profile.role}; home for one shift, listening for ${profile.institution}.`;
  if (place === "refuge") return `${profile.role}; posted at the public refuge to protect ${profile.resource}.`;
  return `${profile.role}; moving street-side between ${profile.institution} and ${profile.resource}.`;
}

export function districtResidentScheduleLine(district: number, now = Date.now()): string {
  const cast = DISTRICT_CAST.filter((r) => r.district === district);
  return cast.map((r) => {
    const place = residentPlace(r, now);
    const kind = districtBuildingKind(r.workVenue, r.district);
    const where = place === "work" && kind ? DISTRICT_VENUE_TITLE[kind] : place === "home" ? "TENEMENT" : place;
    return `${npcDef(r.id)?.name ?? r.id}: ${where}`;
  }).join(" · ");
}

/** A source talk grants a bounded clue; a counterpart consumes it as contextual dialogue. */
export function residentClueGrant(id: string): { key: string; clueId: string; line: string } | null {
  const p = residentProfile(id);
  return p?.clueId && p.clueLine ? { key: residentClueKey(p.clueId), clueId: p.clueId, line: p.clueLine } : null;
}

/** A counterpart can corroborate only testimony the player has already heard. */
export function residentConfirmationGrant(id: string, clues: readonly string[]): { key: string; clueId: string; line: string } | null {
  const p = residentProfile(id);
  if (!p?.respondsTo || !p.responseLine || !clues.includes(p.respondsTo)) return null;
  return {
    key: residentConfirmationKey(p.respondsTo),
    clueId: p.respondsTo,
    line: p.responseLine,
  };
}

export function linkedResidentLine(id: string, clues: readonly string[]): string | null {
  const p = residentProfile(id);
  return p?.respondsTo && p.responseLine && clues.includes(p.respondsTo) ? p.responseLine : null;
}

export function residentClueSnapshot(stats: Record<string, number>): string[] {
  const out: string[] = [];
  for (const p of DISTRICT_CAST) if (p.clueId && (stats[residentClueKey(p.clueId)] ?? 0) > 0) out.push(p.clueId);
  return [...new Set(out)];
}

export function residentConfirmationSnapshot(stats: Record<string, number>): string[] {
  const out: string[] = [];
  for (const p of DISTRICT_CAST) {
    if (p.respondsTo && (stats[residentConfirmationKey(p.respondsTo)] ?? 0) > 0) out.push(p.respondsTo);
  }
  return [...new Set(out)];
}

export interface CasefileMilestone {
  threshold: number;
  title: string;
  line: string;
  objective: string;
}

/** Bounded follow-up fieldwork unlocked by corroborating 2 / 4 / 8 districts. */
export const CASEFILE_MILESTONES: readonly CasefileMilestone[] = [
  {
    threshold: 2,
    title: "SHARED LESSON",
    line: "Prediction clerks and pursuit models were trained from the same doctrine: make dispossession look inevitable.",
    objective: "Cross-check a corporate district testimony with a labor or transit witness.",
  },
  {
    threshold: 4,
    title: "THE HUMAN ROUTE",
    line: "Hospital floors, freight leases, and deleted station shifts all preserve people as infrastructure after erasing their names.",
    objective: "Carry the confirmed names into the harbor, subway, and any refuge still keeping paper records.",
  },
  {
    threshold: 8,
    title: "REPRINT ECONOMY",
    line: "Every district conflict feeds one continuity machine: Metro City survives by converting memory, labor, land, and signal into another cycle.",
    objective: "Bring the complete casefile to the city center; keep the contradictions public through the weekly chronicle.",
  },
];

export function casefileMilestone(confirmed: readonly string[]): CasefileMilestone | null {
  const count = new Set(confirmed).size;
  return [...CASEFILE_MILESTONES].reverse().find((m) => count >= m.threshold) ?? null;
}

export function residentConvergenceLine(id: string, confirmed: readonly string[]): string | null {
  if (!residentProfile(id)) return null;
  const milestone = casefileMilestone(confirmed);
  return milestone ? `${milestone.title}: ${milestone.line}` : null;
}

export function districtTestimonyStatus(district: number, clues: readonly string[], confirmed: readonly string[]): string {
  const clueId = DISTRICT_CAST.find((r) => r.district === district && r.clueId)?.clueId;
  if (!clueId) return "CASEFILE · NO LINKED TESTIMONY";
  if (confirmed.includes(clueId)) return "CASEFILE · CORROBORATED";
  if (clues.includes(clueId)) return "CASEFILE · LEAD RECORDED; FIND THE COUNTERPART";
  return "CASEFILE · UNOPENED";
}
