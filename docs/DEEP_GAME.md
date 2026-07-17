# Deep game systems (ex-mint)

Shipped without mint / CA work.

## Progression
- **First session** (`firstSession.ts`): FIXER → deploy → kill → HEAT → contracts → bounty → gear
- **Second hour** (`secondHour.ts`): finish bounty, vendor, forge, node, boss tease
- **Third hour** (`thirdHour.ts`): District War capture, Cell deposit, Market, estate guestbook tip
- **District War** (`districtWar.ts`): weekly focus district, capture bonus + double faction score

## Combat identity
- **Per-boss raid scripts** (`raid.ts` + `raidScriptFor`)
- **Signature boss loot** (`bossLoot.ts`) guaranteed on world-boss kill
- **Named uniques** (`namedLoot.ts`) on high-rarity drops
- Boss intro shows phase name

## City identity
- **District mods** expanded (`districtMods.ts`) — acid rain, drone swarm, etc.
- **World events** expanded (`worldEvents.ts`) — heat spike, repo siren, market glitch
- Contagion bloom day: bonus core chance
- **Living districts** (`districtLife.ts`) — eight civic dossiers, 24 rotating public
  operations, local landmarks/power blocs/hidden truths, district-specific paid
  rumours, map dossiers, and server-authoritative daily contribution rewards.
- **Cells as factions** (`factions.ts`) — the four classes now have political origins,
  creeds, promises, methods, and internal fears. Arrival/capture messaging translates
  territory state into an in-world outcome instead of showing only a color and score.
- **Weekly Cell doctrines** (`factionCampaigns.ts`) — the same server goal becomes
  four authored political projects, each with its own order, victory condition, and
  contradiction. War banners, city pulse, arrivals, and captures carry doctrine;
  mechanics and rewards remain faction-neutral.

## Content
- Side quests after THE WAKE: STREET DEBTS, NODE WAR, GHOST SHEET
- **Memory journal** (N): fragment codex (`OnlineJournal.ts`)
  - all 17 entries are paginated; authoritative recovery order unlocks eight
    order-sensitive district syntheses surfaced in the journal, maps, and residents
- **Durable contact trust** (`relationships.ts`): met / trusted / confidant tiers
  persist in `player_stats`, survive devices and zone travel, unlock authored
  disclosures, and improve paid local-intel quality without adding combat power.
- **District standing**: public operations, captures, bosses, events, and local jobs
  build bounded civic recognition (UNKNOWN → NEIGHBOR → ANCHOR → KEEPER), visible
  in map dossiers and NPC conversations.
- **Shared civic aftermath**: completed public operations advance a bounded daily
  district state (NEED → FOOTHOLD → NETWORK → UPRISING) shared through D1 across
  zone shards. Arrivals, maps, trusted rumours, and event telegraphs reflect the
  outcome; preparation trims event danger windows up to 15% without reducing rewards.
- **Residents in motion** (`residentLife.ts`): two recurring people per district
  rotate through street, workplace, refuge, and home shifts. Map dossiers expose their
  route; server-validated source conversations persist a bounded clue that changes the
  paired resident's testimony across reconnects and devices. Finding that counterpart
  in their own scheduled zone corroborates the clue; 2/4/8 confirmed districts unlock
  a bounded casefile, authored synthesis, and follow-up fieldwork directives. Eight
  corroboration-gated resident jobs turn those conflicts back into authoritative combat,
  salvage, HVT, and boss loops without adding a parallel quest schema.
- **Campaign echoes** (`campaignEchoes.ts`): all ten main acts recur through FIXER
  briefs, allies, residents, memory annotations, arrivals, maps, and civic outcomes.
  THE FIXER'S DEBT now has a durable server-side SPARE / EXPOSE judgment; post-Awakening
  public operations describe what residents build without changing repeatable rewards.
  The judgment remains present after later acts and produces authored reactions from
  four trusted allies, eight districts, and all four political Cells.
- **Post-Awakening reconstruction** (`reconstruction.ts`): the final act unlocks one
  authored resident operation per district. Completed work persists as bounded
  CREW / COMMON / INSTITUTION progress and changes maps plus resident dialogue; the
  Worker gates campaign eligibility and all objective progress.
- **Weekly city chronicle** (`cityChronicle.ts`): the Worker synthesizes bounded shared
  war, civic, boss, and Cell-goal ledgers into a four-beat public edition shown at the
  city center. Eight fixed weekly civic rows preserve public work across daily resets;
  boss deaths and civic changes refresh it live. The edition interprets history without
  adding rewards or client-owned truth.
- **Civic courier situations** (`bounties.ts`): public work recorded anywhere in the
  weekly ledger opens four low-value delivery routes through existing contacts. Routes
  persist across zones, complete only when the Worker places the runner in the authored
  destination, and use a durable 24-hour per-job claim before payout.
- **Daily relay charters** (`territoryLegacy.ts`): every district reuses one bounded row
  to remember today's latest Cell controller and number of node-control changes. Each Cell
  gives the relay a distinct civic doctrine shown in arrivals, maps, and the chronicle;
  live node state alone still determines control, scoring, objectives, and payouts.
  Live control requires a unique node-count leader; tied relays remain unsettled instead
  of being silently awarded by faction array order.
- **Regional anchors** (`cityNpcs.ts`): all eight districts now place one stable authored
  contact after any scheduled residents, exposing regional dialogue and jobs that formerly
  existed only as unused data. Civic couriers require weekly work in their own source
  district, then retain server-owned travel and settlement rules.

## Social / economy UX
- Market filters: ALL / ₵ / ◈ / WEP / ARM / RARE
- Cell weekly goals: D1 tallies, 50%/complete toasts, claim pays **all** members (live + mailbox)
- Nearby party allies share narrative, contract, public-operation, and contact-job kill
  progress; base kill currency, XP, loot, HVT payout, and Cell tally stay with the killer.
- Share cards: Options → opt-in; fires only on your boss kill credit
- Home furniture buffs (regen / HEAT / shield / move) while owner is home
- Contacts (`/c`), pin, dossier (L)
- Party rescues persist as bounded mutual-aid memory; known contacts also recognize the
  setting provenance of equipped cosmetics without granting appearance-based power.
- Authoritative deaths advance a bounded reprint-memory stat (3 / 10 / 25 witness tiers).
  MAREK, recurring residents, and city center retain it across devices; the browser-local
  counter remains only a veteran-history fallback and grants no mechanical benefit.
- Build stamp toast on welcome; reconnect/offline banners + guild re-hydrate
- City chatter + ambient runners when solo
- Systems hint after 2nd hour (N / U / K / L / J / O)

## Keys
| Key | Panel |
|-----|--------|
| N | Memory journal |
| L | Dossier / leaderboards |
| J | Quest log |
| C | Daily contracts |
| K | Market |
| U | Cell |
| M | Map |
