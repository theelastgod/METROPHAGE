# World depth roadmap

METROPHAGE already has broad MMO machinery. The depth pass therefore prioritizes
connections: the same authored fact should appear in dialogue, map intelligence,
server rules, progression, and consequences.

## Design pillars

1. **People before meters.** A system must name who needs it, who profits, and who
   pays when it fails.
2. **One source of truth.** Daily fiction and daily mechanics resolve from shared,
   deterministic data imported by both client and Worker.
3. **Authority stays server-side.** Clients may explain, predict, and render; only
   the Worker advances objectives or grants value.
4. **No disposable lore.** District history should recur through residents,
   operations, bosses, venues, fragments, and faction conflict.
5. **Consequences without lockout.** Choices change relationships and texture, but
   never permanently deny a player core combat or paid-for access.

## Batch 1 — living districts (implemented)

- Eight civic dossiers: former names, histories, power blocs, resident customs,
  landmarks, and hidden truths.
- Twenty-four rotating public operations tied to kills, captures, world bosses,
  and event survival.
- Per-player daily/district progress persisted through `player_stats`; no migration
  and no reset job required.
- Authoritative XP, credit, and reputation rewards on completion.
- Shared map summaries, arrival briefs, paid local rumours, and city-pulse calls.
- Four Cells reframed as political projects with origins, creeds, promises,
  methods, and explicit internal dangers.
- Territory arrival and control-change text turns faction colors into civic stakes.

## Batch 2 — relationships and local standing (implemented foundation)

- Meaningful NPC memory now hydrates from bounded `player_stats` keys rather than
  depending on browser storage. First meetings and completed jobs survive devices,
  zone travel, and Worker recycling.
- Named contacts progress STRANGER → KNOWN → TRUSTED → CONFIDANT; job counters cap
  at three so repeatable work cannot grow unbounded stat rows.
- Key allies and regional contacts have authored recognition, trust, and confession
  lines. Other residents use a tier-safe fallback ladder.
- Trusted rumor sellers reveal local power structures; confidants disclose the
  district truth normally kept buried. This is informational utility, not power.
- District standing is distinct from global reputation and rises through public
  operations, captures, bosses, event survival, and locally completed jobs.
- Standing is bounded at 200 and displayed as UNKNOWN / NEIGHBOR / ANCHOR / KEEPER
  in map dossiers and NPC talk panels.
- Both wallet and device-bound runners use the same server identity and relationship
  path. Browser-local talk memory remains only as an offline/cadence fallback.
- Campaign-choice reactions now persist through allies, districts, Cells, maps, and
  later-act echoes (Batch 12). Party-rescue memory and cosmetic acknowledgements now
  make two more authoritative social inputs durable and visible (Batch 13).

## Batch 3 — consequence chains (implemented foundation)

- Every completed public operation now advances a shared daily district aftermath,
  so one runner's contribution becomes visible to everyone in that district rather
  than ending at the personal reward toast.
- Aftermath progresses PUBLIC NEED → PUBLIC FOOTHOLD → CIVIC NETWORK → LOCAL
  UPRISING and caps at nine completions. A single reusable `world_meta` row per
  district encodes UTC day plus count, avoiding daily row growth and reset jobs.
- The D1 increment is atomic across horizontal zone shards. Each shard rehydrates
  and rebroadcasts changes during its existing meta sync, while streets and resident
  interiors receive a civic snapshot on arrival.
- Stage copy is derived from the active operation's authored outcome: supplies,
  witnesses, broadcasts, shelters, and reclaimed infrastructure remain specific to
  the place and the work players actually completed.
- World-event telegraphs now name the public operation being retaliated against.
  Collective preparation shortens the active danger window by 5/10/15% at the
  three success stages; event XP and currency rewards remain unchanged.
- Map dossiers show live shared aftermath, and trusted local rumor sellers report
  what the neighborhood did with the win. This provides information and texture,
  not private power or permanent content denial.
- World events now state and resolve a fair survival condition with authored failure
  (Batch 14); party reboots before resolution turn that condition into a real rescue
  situation. Weekly civic history now opens courier situations (Batch 16), while
  additional bounded counters can extend longer-lived public echoes later.

## Batch 4 — faction campaigns (implemented foundation)

- Each shared weekly Cell goal now resolves into four distinct political doctrines:
  sixteen authored campaigns covering patrols, bosses, territory, and treasuries.
- Every doctrine names an order, a civic definition of victory, and the internal
  contradiction the Cell risks reproducing. Ideology is allowed to criticize itself.
- Weekly war banners, district arrivals, city pulse, and control-change broadcasts
  surface the relevant doctrine. Holders explain what they believe they achieved;
  rivals answer in their own creed rather than with generic score hostility.
- Doctrine is presentation and interpretation only. The underlying shared target,
  capture bonus, class kit, loot odds, and economy remain identical across Cells.
- The weekly city chronicle now assembles authoritative war totals, boss deaths,
  civic aftermath, and Cell-goal claims into one bounded four-line edition. It is
  delivered on login, displayed on the city-center map, and refreshed after rare
  command-chassis deaths rather than inferred from client activity.

## Batch 5 — residents in motion (implemented foundation)

- Sixteen recurring residents—two per district—now follow deterministic six-hour
  shifts across streets, workplaces, public refuges, and tenements. Their current
  routes are visible in map dossiers, so movement adds discovery rather than guesswork.
- Every pair defines a resident / institution / resource conflict triangle: warrants
  versus blind routes, drone foremen versus fabricators, compliance versus lift access,
  manifests versus names, continuity archives versus station ghosts, spectrum licenses
  versus the Choir, mineral claims versus water, and the Kernel versus cycle records.
- Each district has a linked testimony chain. Speaking to the source in their actual
  scheduled zone grants one bounded `player_stats` clue; their counterpart then gives
  a new authored response. Clues persist across reconnects and devices via the existing
  relationship snapshot—no branching quest schema or unbounded conversation log.
- The Worker enforces source identity, district, and current schedule location before
  granting testimony. The client owns only cosmetic placement and presentation.
- Existing generic residents remain as fallback room population; scheduled signature
  cast members are excluded from those fallbacks to avoid appearing in two places.
- Field medics, couriers, and room keepers interpret live civic aftermath through
  their work; transit labels update when a district reaches a new
  aftermath stage, even when the civic snapshot arrives after scene construction.
- Counterpart conversations now corroborate the source clue instead of merely changing
  a bark. Confirmations persist independently and feed the bounded city casefile below.

## Batch 6 — campaign echoes (implemented foundation)

- All ten main acts now have authored callbacks in five contexts: the FIXER, story
  allies, district residents, recovered-memory annotations, and local civic change.
  Echo selection derives from authoritative completed quest ids, not localStorage.
- THE FIXER'S DEBT now contains the actual server-validated choice its quest comment
  promised. SPARE keeps a compromised witness; EXPOSE publishes the ledger. The choice
  advances exactly once, persists in campaign JSON, and rehydrates in the campaign wire
  state for later dialogue rather than existing only as a transient button.
- The campaign brief presents the choice as two explicit actions on desktop and mobile.
  Ordinary talk/engage packets cannot skip the judgment; replayed choice packets fail
  closed after one decision.
- Completed acts echo in the next FIXER offer, all four allies, the relevant district's
  recurring residents, map dossiers, arrivals, and newly recovered memory text. The
  FIXER judgment modifies debt-era echoes rather than collapsing back to one canon.
- After THE AWAKENING, completing repeatable public operations produces a local
  POST-AWAKENING consequence line. The MMO loops remain repeatable and rewards remain
  unchanged, but the fiction answers what waking people built with the opening.
- Post-Awakening jobs now grow from these civic hooks (Batch 10), and authoritative
  fragment-order interpretation now makes recovery sequence consequential (Batch 11).

## Batch 7 — weekly city chronicle (implemented foundation)

- One reusable `world_meta` row records the current week's command-chassis deaths;
  its fixed week/count encoding resets logically without producing unbounded rows.
- The Worker combines that ledger with the existing four-Cell war scores, eight
  district civic counters, and weekly Cell-goal progress. Missing pre-migration goal
  tables degrade to a truthful partial edition instead of blocking login.
- Every edition has exactly four beats—war, civic life, bosses, and collective Cell
  work—plus a headline selected from the strongest public aftermath. Equal war scores
  are described as unresolved rather than assigning a fictional winner.
- The city-center map carries the current edition, and connected runners receive a
  refreshed edition when a boss death changes the rarest shared fact. The chronicle
  interprets existing counters only; it grants no rewards and changes no balance.

## Batch 8 — convergent testimony casefile (implemented foundation)

- Each district testimony now has two server-validated steps: hear the source in their
  current scheduled zone, then find the named counterpart in that person's current
  scheduled zone. Only the Worker can grant either durable stat.
- Corroboration changes the district map from UNOPENED to LEAD RECORDED to CORROBORATED.
  The state survives reconnects and devices through the existing relationship snapshot.
- At 2, 4, and all 8 corroborated districts, the casefile unlocks authored cross-district
  synthesis and a follow-up fieldwork directive: shared training doctrine, erased human
  infrastructure, then the full reprint economy. Recurring residents begin speaking
  from the strongest unlocked synthesis instead of treating every district as isolated.
- Each counterpart also offers one corroboration-gated follow-up operation—eight jobs
  spanning HVTs, salvage, street pressure, and command chassis. They reuse authoritative
  bounty counters and ordinary reward bands; direct forged accepts fail server-side.
- Completing resident work raises contact trust and standing in that resident's home
  district even when the last objective happens inside a dive, interior, wilderness
  corridor, or another district. Neighborhood credit follows the promise, not the map
  tile where the final enemy happened to fall.
- City center shows the strongest casefile and its current objective alongside the
  weekly chronicle. The eight confirmations and three fixed thresholds are bounded;
  there is no transcript table, reward, combat modifier, or client-asserted completion.

## Batch 9 — systemic attribution audit (implemented foundation)

- Resident-job completion now attributes civic standing to the giver's authored home
  district, even when a dive, interior, wilderness corridor, or neighboring district
  contains the final objective. Contact trust and neighborhood recognition no longer
  disagree about whose promise the runner kept.
- A nearby party ally now shares kill/boss progress for their own campaign, contract,
  public operation, and contact job. The killer remains the sole recipient of base kill
  currency, XP, loot, HVT payout, and Cell-goal tally, preventing social progress from
  multiplying the core economy emit.
- Casefile payouts stay inside existing bounty reward bands and pass through the normal
  `grantEmit` policy. Boss follow-ups inherit the durable 24-hour per-job completion
  claim; no daily earn cap or withdrawal cap was introduced.

## Batch 10 — post-Awakening reconstruction (implemented foundation)

- Completing THE AWAKENING changes one recurring source resident's work in every
  district. Eight authored reconstruction jobs cover public routes, communal fabrication,
  patient names, navigator autonomy, station wages, public spectrum, clean water, and
  the first record the continuity engine did not choose.
- The server rejects direct job accepts until `continue_q` is present in the durable
  campaign completion set. Jobs reuse existing kill, core, HVT, and boss authorities;
  they neither trust client progress nor introduce another quest table.
- Completion records one bounded per-district reconstruction stat (cap 9) and resolves
  CREW → COMMON → INSTITUTION presentation stages. District maps, city center, and both
  recurring residents describe the material result, so campaign consequence persists
  beyond the reward toast.
- Reconstruction payouts use ordinary bounty bands and `grantEmit`; boss variants keep
  the durable 24-hour completion claim. The result changes civic interpretation and
  local standing, not combat stats, exchange rates, or withdrawal policy.

## Batch 11 — ordered memory synthesis (implemented foundation)

- The existing `players.fragments` array is now explicitly treated as an authoritative
  recovery sequence, not only an ownership set. Hydration removes unknown and duplicate
  ids while preserving the first valid occurrence; no migration or unbounded history
  table is required.
- Eight two-record syntheses—one per district—interpret the first recovered record as
  the runner's lens and the second as confirming or contradictory evidence. Reversing
  recovery order produces a different authored conclusion rather than cosmetic numbering.
- A newly completed combination is derived and announced by the Worker at the dive core.
  The additive fragment message carries only the syntheses unlocked by that recovery;
  clients cannot assert fragments, order, combinations, or rewards.
- The Memory Log now paginates all 17 records (the old fixed list clipped its final
  entries), displays authoritative recovery number, and attaches related syntheses.
  District maps, city center, and scheduled residents interpret the same ordered sequence.
- Synthesis is bounded to eight deterministic readings and grants no currency, XP,
  standing, combat effect, or bridge value. The underlying claim-once dive reward remains
  exactly where it was: the first authoritative recovery of an authored fragment.

## Batch 12 — persistent judgment politics (implemented foundation)

- The SPARE / EXPOSE flag now remains attached to every later campaign echo after
  THE FIXER'S DEBT. Previously the suffix disappeared as soon as a later completed act
  became the latest echo, contradicting the intended durable consequence.
- RIN, DOC, VEX, and MAREK have distinct reactions to mercy and publication once the
  player is a known contact. Eight districts describe different public handling of the
  witness or ledger, and all four Cells interpret the choice through their own doctrine.
- District map dossiers and recurring residents carry the local aftermath. District
  arrivals carry the player's Cell position, while FIXER, ally, fragment, and civic
  campaign callbacks retain the selected judgment through the end of the arc.
- All reactions derive from the existing server-authored campaign flag. They grant no
  trust, standing, reward, faction score, access, or power and never collapse the two
  choices into a mechanically optimal canon.

## Batch 13 — social memory and visible provenance (implemented foundation)

- Authoritative party revives now record bounded totals for rescues given and received.
  Combined history advances REBOOT WITNESS → LINE KEEPER → NO ONE LEFT at 1/3/7,
  capping both counters at nine without storing unbounded player-pair relationships.
- The rescuer and rescued runner receive their own durable update at the moment of the
  reboot. City center summarizes the record, and known contacts distinguish repeatedly
  lifting others, accepting help, and reciprocal mutual aid. No XP, credits, standing,
  trust, achievement, or combat modifier is attached.
- All six cosmetics now have setting provenance and three trust-sensitive street reads:
  deleted inspector optics, orbital baffles, strike-command armor, compliance mirrors,
  relay-keeper halos, and a founder proof that outlived its issuing registry.
- The wardrobe shows provenance, and known contacts occasionally recognize the equipped
  cosmetic from authoritative server wardrobe state. Appearance remains cosmetic-only.
- Durable resident dialogue now rotates deterministically across available casefile,
  judgment, memory, reconstruction, rescue, cosmetic, civic, campaign, and relationship
  contexts. Before this fix, the first persistent truthy layer could starve every lower
  layer forever; uncorroborated counterpart testimony alone remains urgent until confirmed.

## Batch 14 — explicit event failure and rescue (implemented foundation)

- Every dynamic world event now states the actual authoritative contract during its
  telegraph: remain alive through resolution; a party reboot before the timer ends counts.
  The HUD repeats SURVIVE TO RESOLUTION during the active window.
- Living runners retain the existing XP/currency payout. A runner still down at resolution
  receives one event-specific failure account and no payout, matching the rule the Worker
  already enforced instead of receiving the client's formerly misleading “payout issued.”
- Resolution broadcasts standing and downed counts as district aftermath. This turns the
  existing party revive into a legible rescue situation: rebooting someone before the end
  changes their result, and the reboot also enters the bounded social-memory record.
- Reward values, civic progress, event-duration preparation, and economy policy are
  unchanged. Failure removes no item, access, campaign progress, or future attempt.

## Batch 15 — weekly civic legacy (implemented foundation)

- The weekly chronicle no longer mistakes today's aftermath for the week's history.
  Eight fixed `world_meta` rows—one per district—encode guild week plus up to 999 public
  operation completions, resetting logically without weekly row creation or a reset job.
- Every authoritative public-operation completion writes the daily consequence ledger
  and the weekly historical ledger independently. A failure in either detached shared
  write cannot replay or duplicate the player's XP, currency, reputation, or standing.
- Chronicle synthesis now uses the weekly counts for its headline and civic beat and
  carries the eight-source vector in its server message. District map dossiers display
  their own WEEKLY LEGACY alongside today's mechanically active aftermath.
- Horizontal shards detect the fixed-row change during normal meta synchronization and
  refresh connected chronicle readers, including city center, without reconnecting.
  The weekly record is presentation/history only and does not extend event preparation
  beyond the daily aftermath or change any reward.

## Batch 16 — civic courier situations (implemented foundation)

- Four existing ambient contacts now turn the weekly public-work ledger into authored
  routes: a restored manifest reaches city center, an awakened runner's own account and
  mutual-aid medicine reach the Clinic, and a paper civic record reaches THE UNDERLINE.
- Each courier offer remains hidden until its source district records public work that
  week (Plaza note, Docks manifest, Undercity relay, or Kernel medicine). Work elsewhere
  cannot open an unrelated parcel. The Worker independently applies the same gate to
  direct bounty-id packets and persisted hydration, so presentation is never authority.
- Travel progress has no client completion packet. After an accepted job is durably
  saved, entering its authored destination zone is the sole objective event; reconnects
  retain the parcel and destination arrival is evaluated from the server's zone identity.
- Arrival payouts first claim the existing D1 per-player/per-job completion row with a
  24-hour conditional upsert. Adjacent arrival events, reconnects, and isolate eviction
  cannot duplicate the ₵220–₵360 ordinary bounty payout; registry failure restores the
  objective and pays nothing.
- Existing bounty ids were preserved so active rows remain compatible. The new routes
  add no table, no unbounded log, no combat power, and no new bridge rule; public work
  creates social circulation using the established bounty economy and trust machinery.

## Batch 17 — daily relay charters (implemented foundation)

- Territory captures now leave a public record after live nodes decay, a district empties,
  or its Durable Object restarts. One fixed `world_meta` row per district encodes UTC day,
  latest controlling Cell, and up to 99 charter changes; old days expire by interpretation
  without deletes, reset jobs, or a growing capture-history table.
- The record is explicitly historical. Live node ownership still decides district control,
  secure objectives, score, and snapshot color; a charter grants no passive buff, payout,
  fast-travel access, public-operation credit, or claim over an empty district.
- Every Cell writes a distinct civic use into captured relays: strike commons, block
  assemblies, witnessed archives, or plural warning/medicine/evacuation meshes. The daily
  public operation is named in the record, tying faction politics to local work rather than
  treating the node as an abstract colored ring.
- District arrivals receive the local relay ledger, district map dossiers retain it, and
  the city chronicle's war beat reports how many districts changed charter plus the day's
  most contested place. Horizontal shards detect row changes during normal meta sync.
- D1 updates controller and bounded flip count atomically across competing zone writers.
  A live territory smoke now proves node capture, score, control, and durable charter
  publication in the same authoritative path.

## Batch 18 — reachable regional cast (implemented foundation)

- The seven authored `REGIONAL_NPCS` were previously dead data: district population drew
  only scheduled residents and ambient citizens, so Porter, Tunnel Rat, Scrap Boss,
  Hawker, Preacher, Street Kid, and Arc Tech never appeared. Their dialogue, services,
  and existing bounty definitions were consequently unreachable in normal play.
- Every campaign district now has one stable regional anchor after its moving residents:
  Street Kid / Scrap Boss / Hawker / Porter / Tunnel Rat / Arc Tech / Preacher / Borne.
  The mapping is unique, data-tested, and leaves the two-person six-hour resident schedule
  intact; when those residents are street-side they occupy the first two arrival spots.
- Arc Tech's previously decorative `arcology_pass` hook is now a real shared bounty:
  GROUND THE SKY uses the authoritative core-collection counter to mirror the orbital
  license array onto district hardware. All eight anchors therefore expose actual work.
- BORNE is excluded from generic hub-room rotation while remaining in the complete NPC
  registry, preventing the same named courier from standing in the Kernel and a plaza
  residence simultaneously; the remaining hub roster still supplies 30 unique faces.
- BORNE's placement makes the fourth civic courier a real encounter rather than an id a
  client could only know from source data. Courier eligibility was tightened at the same
  seam: each route now requires weekly public work in its authored source district, not
  merely any operation anywhere in Metro City.
- Placement changes presentation and access to already-authored services only. It creates
  no spawn reward, passive effect, extra payout, duplicate NPC, or client-owned progress.

## Batch 19 — honest contested control (implemented foundation)

- Live district control formerly selected the lowest-index Cell whenever top node counts
  tied. A one-to-one relay split therefore appeared as METROPHAGE control, could satisfy
  secure campaign triggers, and generated holder doctrine despite no actual majority.
- A shared pure controller now requires exactly one node-count leader. No held nodes and
  every tied lead return neutral; unique majorities retain the existing score, snapshot,
  secure-objective, capture-broadcast, and daily-charter behavior.
- Arrival copy now calls neutral/tied ground “unsettled — no unique relay majority” rather
  than “unclaimed.” The daily relay ledger can still remember the last real majority while
  live simulation truthfully reports that the present contest has no controller.
- Tests cover empty, two-way, three-way, and unique-majority ownership. No reward rate,
  capture speed, decay, faction score, or player progress was added.

## Batch 20 — durable reprint witnesses (implemented foundation)

- Reprint recognition formerly lived only in `localStorage`. OLD MAREK forgot a runner
  on another browser, private mode returned zero, and the server had no social memory of
  the setting's central death-and-continuity event.
- Each authoritative death now advances one fixed `player_stats` counter capped at 25,
  the final authored threshold. The death packet updates the active client immediately;
  the relations snapshot hydrates the same count across devices, zones, reconnects, and
  Durable Object eviction. Death timing, location, inventory, PvP drops, and economy do
  not consult the counter.
- MAREK recognizes returns at 3 / 10 / 25 dynamically when spoken to, not only when his
  scene sprite was first constructed. All sixteen recurring residents gain three
  role/institution/resource-aware witness lines, rotated through the existing durable
  conversation cadence; city center displays the bounded social record.
- Existing device counts remain a compatibility fallback and presentation uses the larger
  value, avoiding an apparent memory wipe for veteran browsers. New authority never trusts
  that local value for persistence, rewards, stats, access, or combat.
- Pure tests cover cap/tier behavior and all 48 resident reactions. The live death smoke
  requires matching death-packet and relations counts whenever combat actually kills its
  fresh runner.

## Batch 21 — honest reprint memorial sink (implemented foundation)

- The ₵260 REPRINT CHIP formerly claimed to stamp grid insurance but persisted nothing,
  protected nothing, and could be repurchased indefinitely. It was a useful hard sink
  wrapped in a false system promise.
- The SKU is now REPRINT MEMORIAL and states its contract plainly: one voluntary public
  return stamp, social sink, no death protection. Purchases advance one fixed bounded
  `player_stats` row to 9; the server rejects a tenth before deducting credits. Existing
  vendor burn accounting, price, and unlimited earning/withdrawal policy are unchanged.
- Relations hydration carries the ledger across devices. MAREK and all sixteen recurring
  residents interpret it at 1 / 3 / 7 stamps, city center displays the count, and dialogue
  rotates through the existing durable cadence rather than becoming a permanent bark.
- Memorial registration grants no refund, payout, achievement, reputation, trust,
  standing, inventory protection, faster respawn, PvP credit protection, combat stat, or
  bridge advantage. It gives an intentional economy sink durable narrative provenance.
- Tests cover cap/tier behavior and all 51 MAREK/resident reactions; server validation
  derives the visible count from its own bounded stat after the successful burn.

## Batch 22 — truthful death and lockbox copy (implemented)

- City pulse still warned runners to spend credits or lose them to a “death tax,” despite
  the authoritative rule that PvE death never takes credits. It now names vendor burns
  as the sink and states that street reprints take no ₵; THE CRUCIBLE's separately
  documented 10% floor drop remains a player-transfer rule, not an economy burn.
- Lockbox UI and server confirmation implied stashed items alone survived death, while
  every death result explicitly keeps the carried bag. The lockbox now describes its real
  purpose—personal overflow and organization—and states that both sides survive reprint.
- Source comments and the remaining-fix economy ledger use the same accounting language.
  Tests prevent the obsolete “death tax” pulse or stash implication from returning.

## Batch 23 — authoritative professions and civic archives (implemented foundation)

- The five visible profession tracks formerly persisted in browser `localStorage` and
  inferred success from presentation: entering any door awarded Exploration, seeing an
  enemy vanish awarded Combat, clicking Buy awarded Trading before settlement, and plaza
  props granted unlimited Mining/Crafting. None was authoritative.
- Profession XP now occupies five fixed, capped `player_stats` rows and hydrates through
  one server snapshot. Combat belongs only to the validated killing blow; Exploration to
  the first organic unlock of a zone; Crafting to a completed non-drill forge mutation;
  and Trading to completed listings, purchases, sales, or direct swaps. Rejected intents
  and nearby observation award nothing.
- Three shared Metro City fixtures are now named civic archives: CASUALTY INDEX, TRANSIT
  GHOSTS, and EVICTION HASH. The client renders shared geometry while the Worker validates
  zone, life state, terminal id, and distance. Each archive stores one absolute cooldown
  timestamp in a fixed D1 row, reserves before its write, fails without consuming the
  record, and awards only profession XP—never credits, items, reputation, or combat power.
- Archive text exposes erased casualties, deleted transit routes, and ledger-converted
  homes. A five-minute durable rekey prevents reconnect farming; level 99 is a hard cap.
- Shared progression/cooldown helpers are DOM-free. Pure tests cover the curve, sanitizer,
  cap, fixed terminal identity, and clock rollback; the standalone `skills` smoke proves
  award, repeat rejection, wire hydration, and reconnect persistence against the Worker.

## Batch 24 — recoverable civic record (implemented foundation)

- Archive interactions no longer repeat one flavor sentence forever. CASUALTY INDEX,
  TRANSIT GHOSTS, and EVICTION HASH each expose four ordered records in fixed bounded
  `player_stats` rows: REISSUE casualty suppression, Clinic duplicate identities, Blank
  cohort evidence, erased neighborhoods, ghost payroll, witness trains, predictive
  evictions, converted holding cells, freight-coded families, and a common civic title.
- A successful, cooldown-protected terminal link advances at most one page and pushes an
  authoritative 0–12 archive snapshot. At 1 / 3 / 6 / 9 / 12 pages, the city synthesizes
  testimony into partial index, coordinated pattern, cross-index, public proof, and a
  common record tying medical, transit, and property systems to the same institutional
  theft. Completed terminals remain profession nodes but cannot grow lore rows forever.
- DOC, SUBWAY WARDEN, RIN, and the CITY CENTER clerk recognize relevant recovered pages
  through the existing rotating dialogue cadence. Metro City's map dossier shows page
  count and current synthesis across devices and reconnects.
- Recovery grants no additional credits, items, reputation, trust, standing, access,
  combat power, or bridge benefit. The same scan XP and five-minute rekey from Batch 23
  remain unchanged; this batch makes their repeated play reveal bounded setting evidence.
- Pure tests cover all twelve unique records, counter caps, synthesis, and character
  callbacks. The live `skills` smoke now proves page advance and reconnect persistence in
  addition to profession award and cooldown rejection.

## Batch 25 — durable conversation memory (implemented foundation)

- Repeated-contact dialogue formerly read a browser-only `npcMemory` cache. A third visit
  could produce “you keep showing up” on one device while another device—and the Worker—
  knew only that the contact had been met once. The unused local bounty-memory path also
  implied a second relationship authority that never received real completion events.
- Every validated contact conversation now advances the existing `rel_t_*` row up to a
  fixed cap of 12. Completed work remains independently bounded at three `rel_j_*` entries;
  talk spam cannot become a trusted or confidant relationship, counterfeit a kept promise,
  grant service quality, or trigger a reward.
- Relations snapshots expose both ledgers alongside the existing derived tier. Contact UI
  shows compact T/J counts, city center summarizes known/trusted people, conversations,
  and promises kept, and repeated-presence lines recognize 3 / 6 / 10 conversations across
  devices. Existing authored trust disclosures and rotating context retain priority.
- The client-side NPC memory file and all local writes are removed. Pure tests cover caps
  and cadence; the standalone `contacts` smoke proves three talks, zero forged jobs, tier
  separation, D1 flush, and reconnect hydration.

## Validation gates for every batch

- Root and Worker TypeScript checks.
- Focused pure-data tests for deterministic rotations and authored-data integrity.
- Full Vitest suite.
- Standalone smoke mode for every new authoritative message/reward path.
- Economy review for new emits and sinks; no daily earn cap and no withdrawal cap.
- `npm run ship:scrub` before any deploy.
