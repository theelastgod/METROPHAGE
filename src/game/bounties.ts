// METROPHAGE — authored NPC bounties: pure-data, Phaser-FREE, shared by server (grant) and
// client (offer dialogue + tracker). Distinct from the daily contracts (auto-tracked, 3/day)
// and The Blank (narrative spine): a bounty is a CHARACTER's repeatable job you accept by
// talking to them — one active at a time, auto-rewarded on completion. Keyed by NPC id.

export type BountyObjective = "kill" | "collect" | "boss" | "hvt" | "travel";

/** Durable daily gate shared by high-payout boss jobs and instant-on-arrival couriers. */
export const BOSS_BOUNTY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function bossBountyCooldownRemaining(completedAt: number, now = Date.now()): number {
  if (!Number.isFinite(completedAt) || completedAt <= 0) return 0;
  return Math.max(0, completedAt + BOSS_BOUNTY_COOLDOWN_MS - now);
}

export interface Bounty {
  id: string;
  npc: string; // the NPC id who gives it
  name: string;
  desc: string;
  objective: BountyObjective;
  count: number;
  rewardCredits: number;
  rewardRep: number;
  offer: string; // the line shown when offered/accepted
  /** Casefile jobs cannot be forged before this resident testimony is corroborated. */
  requiredConfirmation?: string;
  /** Campaign consequence jobs cannot be forged before this completed act. */
  requiredCampaign?: string;
  /** Escalated ally work is valid only while the campaign is in this phase. */
  requiredPhase?: BountyPhase;
  /** Civic courier routes open only after the weekly ledger contains public work. */
  requiredCivicWork?: boolean;
  /** Authoritative arrival zone for travel jobs. */
  targetZone?: string;
}

export const BOUNTIES: Record<string, Bounty> = {
  rin: { id: "rin_sweep", npc: "rin", name: "RIN'S SWEEP", desc: "Purge 12 HSS units", objective: "kill", count: 12, rewardCredits: 320, rewardRep: 18, offer: "A shipment's pinned down — clear 12 HSS and it's yours." },
  doc: { id: "doc_cores", npc: "doc", name: "DOC'S SALVAGE", desc: "Collect 5 data cores", objective: "collect", count: 5, rewardCredits: 280, rewardRep: 16, offer: "I need 5 data cores for the clinic. Pull them off the dead." },
  vex: { id: "vex_intel", npc: "vex", name: "VEX'S CONTRACT", desc: "Purge 20 HSS units", objective: "kill", count: 20, rewardCredits: 540, rewardRep: 30, offer: "Information costs blood. Drop 20 HSS and we'll talk." },
  marek: { id: "marek_grudge", npc: "marek", name: "MAREK'S GRUDGE", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 900, rewardRep: 52, offer: "One of their commanders took everything from me. End it." },
  juno: { id: "juno_courier", npc: "juno", name: "JUNO'S RUN", desc: "Purge 14 HSS units", objective: "kill", count: 14, rewardCredits: 420, rewardRep: 24, offer: "Courier work's dead while the corps hold the streets. Clear fourteen HSS — I'll pay." },
  sable: { id: "sable_sweep", npc: "sable", name: "SABLE'S SWEEP", desc: "Purge 15 HSS units", objective: "kill", count: 15, rewardCredits: 480, rewardRep: 26, offer: "The bar's quiet because the streets aren't. Clear fifteen HSS." },
  kessler: { id: "kessler_hold", npc: "kessler", name: "KESSLER'S HOLD", desc: "Purge 10 HSS units", objective: "kill", count: 10, rewardCredits: 380, rewardRep: 22, offer: "Guild needs muscle on the ground. Drop ten HSS and I'll mark you operative." },
  mira: { id: "mira_cores", npc: "mira", name: "MIRA'S STOCK", desc: "Collect 8 data cores", objective: "collect", count: 8, rewardCredits: 520, rewardRep: 28, offer: "Stall's dry. Pull eight cores off the dead — I'll make it worth your while." },
  ghost: { id: "ghost_hvt", npc: "ghost", name: "THE QUIET LEDGER", desc: "Collect today's HIGH-VALUE TARGET bounty", objective: "hvt", count: 1, rewardCredits: 1200, rewardRep: 45, offer: "There's a name on today's kill sheet. Every district posts one. Make it a statistic and I'll double what the grid pays." },
  amb_tech: { id: "grid_sweep", npc: "amb_tech", name: "GRID SWEEP", desc: "Purge 30 HSS units", objective: "kill", count: 30, rewardCredits: 680, rewardRep: 34, offer: "Grid's crawling with HSS tonight. Drop thirty and I'll wire the credits." },
  // Regional / profession variety (depth pass — not all kill-N)
  porter: { id: "porter_docks", npc: "porter", name: "LIVING MANIFEST", desc: "Carry the restored manifest to Metro City center", objective: "travel", count: 1, rewardCredits: 360, rewardRep: 20, requiredCivicWork: true, targetZone: "safe", offer: "Public crews put names back on this manifest. Carry it to city center; no relay, no copy, no quiet correction." },
  tunnel_rat: { id: "tunnel_cores", npc: "tunnel_rat", name: "UNDER-CORE", desc: "Collect 6 data cores", objective: "collect", count: 6, rewardCredits: 400, rewardRep: 22, offer: "Bring six cores from the dark. I don't care whose they were." },
  scrap_boss: { id: "scrap_boss_kill", npc: "scrap_boss", name: "SCRAP CLAIM", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 750, rewardRep: 40, offer: "Something big's chewing the yards. Drop a world boss and the scrap is yours." },
  hawker: { id: "hawker_stock", npc: "hawker", name: "STREET STOCK", desc: "Collect 4 data cores", objective: "collect", count: 4, rewardCredits: 260, rewardRep: 14, offer: "Stall's empty. Four cores. Cash on delivery, no questions." },
  preacher: { id: "preacher_hvt", npc: "preacher", name: "FALSE PROPHET", desc: "Collect today's HIGH-VALUE TARGET bounty", objective: "hvt", count: 1, rewardCredits: 900, rewardRep: 38, offer: "The grid names a sinner each day. End them. The flock will remember." },
  res_pike: { id: "pike_watch", npc: "res_pike", name: "BLOCK WATCH", desc: "Purge 16 HSS units", objective: "kill", count: 16, rewardCredits: 440, rewardRep: 24, offer: "This block stays mine. Sixteen HSS and I owe you a favour." },
  res_tallow: { id: "tallow_meat", npc: "res_tallow", name: "HOT MEAT", desc: "Collect 5 data cores", objective: "collect", count: 5, rewardCredits: 300, rewardRep: 16, offer: "Kitchen needs cores for the burners. Five. Broth's free if you deliver." },
  res_wren: { id: "wren_parts", npc: "res_wren", name: "SPARE PARTS", desc: "Purge 10 HSS units", objective: "kill", count: 10, rewardCredits: 340, rewardRep: 18, offer: "Chrome doesn't grow on trees. Drop ten HSS and salvage what walks." },
  res_mercy: { id: "mercy_field", npc: "res_mercy", name: "FIELD TRIAGE", desc: "Purge 8 HSS units", objective: "kill", count: 8, rewardCredits: 280, rewardRep: 15, offer: "Fewer corpses on my floor if the streets are quieter. Eight HSS." },
  res_quill: { id: "quill_record", npc: "res_quill", name: "TRUE RECORD", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 820, rewardRep: 42, offer: "History needs a body count. Fell a world boss — I'll write it true." },
  // Depth pass — profession / ambient variety
  street_kid: { id: "kid_scavenge", npc: "street_kid", name: "WAKE NOTE", desc: "Carry a newly awakened runner's note to the Clinic", objective: "travel", count: 1, rewardCredits: 220, rewardRep: 12, requiredCivicWork: true, targetZone: "clinic", offer: "Someone woke during the public op. Clinic needs their own words before the intake form writes a different person." },
  subway_warden: { id: "warden_line", npc: "subway_warden", name: "CLEAR THE LINE", desc: "Purge 14 HSS units", objective: "kill", count: 14, rewardCredits: 400, rewardRep: 22, offer: "Trains don't run through corpses. Fourteen HSS off my tracks." },
  amb_courier: { id: "courier_run", npc: "amb_courier", name: "CIVIC RELAY", desc: "Carry the public-operation record to THE UNDERLINE station", objective: "travel", count: 1, rewardCredits: 310, rewardRep: 18, requiredCivicWork: true, targetZone: "subway", offer: "The weekly ledger says people built something. Carry the paper copy below before the city edits the feed." },
  amb_vendor: { id: "vendor_heat", npc: "amb_vendor", name: "STALL HEAT", desc: "Purge 9 HSS units", objective: "kill", count: 9, rewardCredits: 270, rewardRep: 15, offer: "They keep scaring customers. Nine HSS and the broth's on me." },
  keep_bar: { id: "bar_quiet", npc: "keep_bar", name: "LAST CALL", desc: "Purge 11 HSS units", objective: "kill", count: 11, rewardCredits: 330, rewardRep: 18, offer: "Quiet night means full till. Eleven HSS gone." },
  keep_clinic: { id: "clinic_field", npc: "keep_clinic", name: "TRIAGE PRESSURE", desc: "Collect 4 data cores", objective: "collect", count: 4, rewardCredits: 290, rewardRep: 16, offer: "Med-bay scanners run on cores. Four. Patients don't wait." },
  keep_guild: { id: "guild_trial", npc: "keep_guild", name: "CELL TRIAL", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 880, rewardRep: 44, offer: "Prove you're more than a solo. Drop a world boss for the cell board." },
  res_nix: { id: "nix_ghost", npc: "res_nix", name: "GHOST WALK", desc: "Collect today's HIGH-VALUE TARGET bounty", objective: "hvt", count: 1, rewardCredits: 950, rewardRep: 40, offer: "Today's HVT walks my alley. End them. I'll vanish the body." },
  res_static: { id: "static_noise", npc: "res_static", name: "STATIC SWEEP", desc: "Purge 22 HSS units", objective: "kill", count: 22, rewardCredits: 560, rewardRep: 28, offer: "Noise floor's too high. Twenty-two HSS. Make it quiet." },
  res_velvet: { id: "velvet_tab", npc: "res_velvet", name: "OPEN TAB", desc: "Collect 7 data cores", objective: "collect", count: 7, rewardCredits: 450, rewardRep: 24, offer: "Seven cores covers your tab and mine. Deliver." },
  // Expansion keepers — every venue's "Job" button leads to real, in-character work.
  // (keep_noodle/keep_radio already SHOWED a Job button with nothing behind it —
  // the server answered "no job on the table".)
  keep_noodle: { id: "noodle_pantry", npc: "keep_noodle", name: "MAMA'S PANTRY", desc: "Collect 6 data cores", objective: "collect", count: 6, rewardCredits: 340, rewardRep: 18, offer: "Burners eat cores, customers eat broth. Six cores keeps both lit." },
  keep_radio: { id: "radio_name", npc: "keep_radio", name: "NAME ON AIR", desc: "Collect today's HIGH-VALUE TARGET bounty", objective: "hvt", count: 1, rewardCredits: 1000, rewardRep: 42, offer: "I read today's name on air an hour ago. Make the follow-up segment an obituary." },
  keep_ripperdoc: { id: "ripper_samples", npc: "keep_ripperdoc", name: "CLEAN SAMPLES", desc: "Purge 13 HSS units", objective: "kill", count: 13, rewardCredits: 390, rewardRep: 21, offer: "Corp chrome dulls my scalpels. Thirteen HSS — leave the wrists intact." },
  keep_pawn: { id: "pawn_inventory", npc: "keep_pawn", name: "COLD INVENTORY", desc: "Collect 9 data cores", objective: "collect", count: 9, rewardCredits: 560, rewardRep: 28, offer: "Nine cores, provenance optional. My ledger forgets faster than the grid." },
  keep_arcade: { id: "arcade_score", npc: "keep_arcade", name: "HIGH SCORE", desc: "Purge 18 HSS units", objective: "kill", count: 18, rewardCredits: 500, rewardRep: 26, offer: "Eighteen. That's the number to beat. The cabinet keeps count — so do I." },
  keep_garage: { id: "garage_chassis", npc: "keep_garage", name: "BIG CHASSIS", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 860, rewardRep: 43, offer: "Something out there is wearing a chassis I want on my lift. Bring it down." },
  keep_hotel: { id: "hotel_quiet", npc: "keep_hotel", name: "QUIET FLOORS", desc: "Purge 10 HSS units", objective: "kill", count: 10, rewardCredits: 320, rewardRep: 17, offer: "Guests don't sleep through gunfire. Ten HSS off my block and the pods stay warm." },
  keep_citycenter: { id: "civic_erasure", npc: "keep_citycenter", name: "CIVIC ERASURE", desc: "Collect today's HIGH-VALUE TARGET bounty", objective: "hvt", count: 1, rewardCredits: 1100, rewardRep: 46, offer: "Officially, today's target doesn't exist. Unofficially, the Spire pays to keep it that way." },
  res_borne: { id: "borne_unlogged_medicine", npc: "res_borne", name: "UNLOGGED MEDICINE", desc: "Carry mutual-aid medicine to the Clinic", objective: "travel", count: 1, rewardCredits: 280, rewardRep: 16, requiredCivicWork: true, targetZone: "clinic", offer: "Public crews filled this case. Get it to the Clinic before procurement invents a purchase order and owner." },
};

/** The player's questline act — mirrors cityNpcs.storyPhase without importing it
 *  (bounties stay a leaf module both the Worker and the client can pull cheaply). */
export type BountyPhase = "pre" | "early" | "mid" | "late";

/** Late-campaign variants for the four story allies: when THE WAKE reaches its
 *  final act, their jobs escalate with it — bigger asks, bigger stakes, and offer
 *  text that knows where the story is. bountyById finds these for completion. */
export const LATE_BOUNTIES: Record<string, Bounty> = {
  rin: { id: "rin_last_shipment", npc: "rin", name: "RIN'S LAST SHIPMENT", desc: "Purge 25 HSS units", objective: "kill", count: 25, rewardCredits: 700, rewardRep: 36, requiredPhase: "late", offer: "Everything I have left is going to the Kernel push. Twenty-five HSS between my crates and the drop — clear the road." },
  doc: { id: "doc_wake_triage", npc: "doc", name: "TRIAGE FOR THE WAKE", desc: "Collect 10 data cores", objective: "collect", count: 10, rewardCredits: 640, rewardRep: 34, requiredPhase: "late", offer: "When the Kernel opens, people are going to come out of it broken. Ten cores — I'm building beds for the ones you wake." },
  vex: { id: "vex_final_ledger", npc: "vex", name: "THE FINAL LEDGER", desc: "Collect today's HIGH-VALUE TARGET bounty", objective: "hvt", count: 1, rewardCredits: 1400, rewardRep: 50, requiredPhase: "late", offer: "One name left on the manifest that listed people as cargo. Today the grid posted it as an HVT. Poetry. Close the ledger." },
  marek: { id: "marek_long_watch", npc: "marek", name: "MAREK'S LONG WATCH", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 1100, rewardRep: 60, requiredPhase: "late", offer: "I held this line before you were printed. One more commander falls and I can finally sit down. Make an old man sit down." },
};

/** Optional resident follow-ups. These use existing authoritative objective counters,
 * but do not appear until that district's two-person testimony has been corroborated. */
export const CASEFILE_BOUNTIES: Record<string, Bounty> = {
  res_solenne: { id: "case_blind_time", npc: "res_solenne", name: "BLIND TIME", desc: "Collect today's HIGH-VALUE TARGET bounty", objective: "hvt", count: 1, rewardCredits: 950, rewardRep: 40, requiredConfirmation: "forecast_children", offer: "The clerk who signed those transfers is today's HVT. Take their access key before the cameras remember you." },
  res_cinder: { id: "case_lesson_plan", npc: "res_cinder", name: "LESSON PLAN", desc: "Collect 6 data cores", objective: "collect", count: 6, rewardCredits: 400, rewardRep: 22, requiredConfirmation: "first_pursuit", offer: "Six pursuit cores still carry the strike-day scoring model. Bring them intact; the union gets copies." },
  res_glass: { id: "case_mercy_chairs", npc: "res_glass", name: "EMPTY CHAIRS", desc: "Purge 13 HSS units", objective: "kill", count: 13, rewardCredits: 410, rewardRep: 22, requiredConfirmation: "mercy_floor", offer: "Thirteen orderlies still patrol the Mercy Floor route. Clear them and Moth can move the patient list." },
  res_salt: { id: "case_buoy_names", npc: "res_salt", name: "BUOY NAMES", desc: "Collect 7 data cores", objective: "collect", count: 7, rewardCredits: 460, rewardRep: 24, requiredConfirmation: "leased_navigators", offer: "Seven harbor cores hold navigator lease keys. Pull them before the tide turns; Dash will restore the names." },
  res_ash: { id: "case_ghost_wages", npc: "res_ash", name: "BACK WAGES", desc: "Collect today's HIGH-VALUE TARGET bounty", objective: "hvt", count: 1, rewardCredits: 980, rewardRep: 41, requiredConfirmation: "ghost_payroll", offer: "Today's target signed the station erasures. Their seal turns employee numbers back into legal names." },
  res_echo: { id: "case_choir_reply", npc: "res_echo", name: "ANSWER THE CHOIR", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 850, rewardRep: 43, requiredConfirmation: "impossible_replies", offer: "A command chassis is jamming tomorrow's reply. Drop it; I need one clean minute with the Choir." },
  res_brick: { id: "case_tanker_route", npc: "res_brick", name: "POISON SCHEDULE", desc: "Purge 15 HSS units", objective: "kill", count: 15, rewardCredits: 470, rewardRep: 25, requiredConfirmation: "waste_claims", offer: "Fifteen escorts guard the tanker schedule. Break the convoy screen and Wren can prove the wells were poisoned." },
  res_coil: { id: "case_cycle_current", npc: "res_coil", name: "CUT THE CURRENT", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 900, rewardRep: 46, requiredConfirmation: "city_reprints", offer: "A command chassis is carrying siphoned cycle memory. Put it down; Quill and I will publish what leaks out." },
};

/** After THE AWAKENING, one recurring resident per district turns survival into
 * reconstruction work. The objectives stay inside proven authoritative counters. */
export const POST_AWAKENING_BOUNTIES: Record<string, Bounty> = {
  res_nix: { id: "wake_unmodeled_routes", npc: "res_nix", name: "UNMODELED ROUTES", desc: "Collect 8 data cores", objective: "collect", count: 8, rewardCredits: 520, rewardRep: 28, requiredCampaign: "continue_q", offer: "People are awake and the forecasts still own their roads. Eight route cores lets us publish paths the clerks cannot price." },
  res_raze: { id: "wake_communal_shift", npc: "res_raze", name: "OPEN SHIFT", desc: "Purge 18 HSS units", objective: "kill", count: 18, rewardCredits: 540, rewardRep: 29, requiredCampaign: "continue_q", offer: "We woke the line; now we keep it. Eighteen strikebreakers off the floor buys one open shift on the communal fabricators." },
  res_moth: { id: "wake_mercy_register", npc: "res_moth", name: "MERCY REGISTER", desc: "Collect today's HIGH-VALUE TARGET bounty", objective: "hvt", count: 1, rewardCredits: 1050, rewardRep: 44, requiredCampaign: "continue_q", offer: "A REISSUE administrator is today's HVT. Their implant carries the only uncensored patient register. Bring the names home." },
  res_dash: { id: "wake_free_navigators", npc: "res_dash", name: "FREE NAVIGATORS", desc: "Collect 7 data cores", objective: "collect", count: 7, rewardCredits: 470, rewardRep: 25, requiredCampaign: "continue_q", offer: "The leased minds are awake inside the buoys. Seven harbor cores opens a channel they control, not the freight board." },
  res_hollow: { id: "wake_last_shift", npc: "res_hollow", name: "END THE SHIFT", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 920, rewardRep: 47, requiredCampaign: "continue_q", offer: "The station ghosts woke still clocked in. Drop one command chassis and Ash can finally mark their last shift paid." },
  res_static: { id: "wake_public_frequency", npc: "res_static", name: "PUBLIC FREQUENCY", desc: "Purge 20 HSS units", objective: "kill", count: 20, rewardCredits: 580, rewardRep: 30, requiredCampaign: "continue_q", offer: "The Choir answered the Wake. Twenty license enforcers stand between that answer and a public frequency." },
  res_wren: { id: "wake_clean_water", npc: "res_wren", name: "CLEAN WATER RUN", desc: "Purge 16 HSS units", objective: "kill", count: 16, rewardCredits: 490, rewardRep: 26, requiredCampaign: "continue_q", offer: "Awake people need clean water more than another speech. Sixteen tanker guards, then Brick moves the filters." },
  res_quill: { id: "wake_first_new_record", npc: "res_quill", name: "FIRST NEW RECORD", desc: "Fell a world boss", objective: "boss", count: 1, rewardCredits: 960, rewardRep: 49, requiredCampaign: "continue_q", offer: "The old record ends with the Wake. Fell a command chassis and I will write the first event the Kernel did not choose." },
};

export function bountyIsEligible(
  bounty: Bounty,
  phase: BountyPhase,
  confirmed: readonly string[] = [],
  campaignCompleted: readonly string[] = [],
  weeklyCivic: readonly number[] = [],
): boolean {
  if (bounty.requiredPhase && bounty.requiredPhase !== phase) return false;
  if (bounty.requiredConfirmation && !confirmed.includes(bounty.requiredConfirmation)) return false;
  if (bounty.requiredCampaign && !campaignCompleted.includes(bounty.requiredCampaign)) return false;
  if (bounty.requiredCivicWork && !weeklyCivic.some((count) => count > 0)) return false;
  return true;
}

export function bountyForNpc(
  npcId: string,
  phase: BountyPhase = "pre",
  confirmed: readonly string[] = [],
  campaignCompleted: readonly string[] = [],
  weeklyCivic: readonly number[] = [],
): Bounty | undefined {
  if (phase === "late" && LATE_BOUNTIES[npcId]) return LATE_BOUNTIES[npcId];
  const postWake = POST_AWAKENING_BOUNTIES[npcId];
  if (postWake && bountyIsEligible(postWake, phase, confirmed, campaignCompleted, weeklyCivic)) return postWake;
  const base = BOUNTIES[npcId];
  if (base && bountyIsEligible(base, phase, confirmed, campaignCompleted, weeklyCivic)) return base;
  const casefile = CASEFILE_BOUNTIES[npcId];
  return casefile && bountyIsEligible(casefile, phase, confirmed, campaignCompleted, weeklyCivic) ? casefile : undefined;
}
export function bountyById(id: string): Bounty | undefined {
  return (
    Object.values(BOUNTIES).find((b) => b.id === id) ??
    Object.values(LATE_BOUNTIES).find((b) => b.id === id) ??
    Object.values(CASEFILE_BOUNTIES).find((b) => b.id === id) ??
    Object.values(POST_AWAKENING_BOUNTIES).find((b) => b.id === id)
  );
}
