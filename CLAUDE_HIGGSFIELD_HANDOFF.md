# METROPHAGE — Claude/Higgsfield 12-hour art-production handoff

You are taking over METROPHAGE, a browser-based top-down neon-noir cyberpunk action-RPG MMO. Work directly in `/Users/wendellphillips/METROPHAGE`. You have approximately 12 hours total. Allocate roughly 6–8 hours to browser-based Higgsfield generation/download/curation and the balance to integration, gameplay wiring, QA, and a progress-safe deployment.

Do not merely generate attractive files. Every accepted asset must be named predictably, downloaded into the repository, optimized, registered, placed in a location the player can reach, and verified in-game. Prefer a smaller set of strong, integrated assets over hundreds of unused files. The player’s first 2–3 hours are the top priority, then the subway, then later districts and marketing media.

## Absolute safety constraints

- This is a dirty shared checkout. Preserve all existing user work and never reset, clean, or mass-revert the tree.
- In particular, preserve connectivity/routing work in:
  - `src/net/NetClient.ts`
  - `src/net/connectionRouting.test.ts`
  - `server/src/index.ts`
  - `server/src/zoneRouting.ts`
  - `server/src/zoneRouting.test.ts`
- The server is authoritative. Client art/collision changes must match the server’s room/world geometry.
- Never change the Cloudflare D1 `database_id`, never delete the production D1 database, never issue an unscoped production player delete, and keep the Durable Object migration tag at `v1`.
- Deploy only through `npm run deploy:safe` after tests. Production client builds must use `wss://metrophage-server.wendellphillips.workers.dev/ws` and Pages branch `main`.
- Do not overwrite a good asset until the replacement has been visually inspected. Keep raw downloads under `tmp-art-backup/` and write processed assets to `public/assets/objects/`, `public/assets/ui/`, `public/assets/audio/`, or another existing appropriate asset folder.
- Never trust the word “Unlimited” from memory. Before each generation family, inspect the current model selector and the Generate button. Use only a model whose UI explicitly shows `Unlimited`, a free-generation allowance, or zero credit cost. Do not submit a credit-priced generation when the balance is zero.

## Account/model facts verified on 2026-07-15

The signed-in account is on the **Ultra Plan** and shows **0 ordinary credits left**. The image model selector explicitly marked these as Unlimited:

- **Nano Banana Pro** — Unlimited; strongest verified choice for reference-driven METROPHAGE game art and consistent variants. The UI also showed a free-generation allowance (120 remaining at the time of inspection).
- **Seedream 4.5** — Unlimited; use for difficult edits, coherent full-frame environments, and variants when it produces cleaner geometry.
- **Seedream 5.0 Lite** — Unlimited; use for rapid environment/prop exploration and broad batches.

Models visible but **not verified Unlimited** in that selector:

- Nano Banana 2
- Nano Banana 2 Lite
- GPT Image 2
- Seedream 5.0 Pro
- Higgsfield Soul 2.0 / Soul Cinema
- Recraft V4.1

Video warning: **Seedance 2.0 was not unlimited in the inspected UI**. At 8 seconds/1080p it displayed a substantial credit price even after a discount. The homepage advertised a referral offer for a temporary unlimited Seedance period, not an active entitlement. The user believes some video models are unlimited, so inspect the live video model selector and Generate button. Use video only when the exact chosen model currently shows Unlimited/free generations/zero charge. Candidate models worth checking include Seedance 2.0, Veo 3.1 Lite, Kling Turbo, WAN, Grok Imagine, and other fast tiers, but their names here are not proof of entitlement.

Audio warning: inspect Seed Audio 1.0 or any audio generator’s live cost before submitting. If no audio model is free/unlimited, build ambience and SFX only from already licensed repository material or defer them clearly; do not spend unavailable credits.

## Current completed generation batch

A large CLI-funded Higgsfield batch has already exhausted its paid credits (account remainder approximately 0.45). Do not regenerate these blindly:

- 232 new transparent cutouts: new business exteriors, early-city props, early landmarks/furniture/vendor/story props, and subway fixtures/debris/signals/maintenance/platform/horror props.
- 223 full-frame subway modules: 25 straight, 18 junction, 12 cross, 24 station, 40 curve, 39 service, 40 deep-station, and 25 track plates. `hf_subway_tile_service_40.png` failed and does not exist.
- Six distinct full-frame 576×576 interiors:
  - `hf_int_ripperdoc_room.png`
  - `hf_int_pawn_room.png`
  - `hf_int_arcade_room.png`
  - `hf_int_garage_room.png`
  - `hf_int_radio_room.png`
  - `hf_int_hotel_room.png`
- Unique new business exterior families for ripperdoc, pawn, arcade, garage, and radio, plus numerous district/building variants.
- The generation script is `tools/hf-world-expansion.mjs`; it is resumable but there are no CLI credits remaining. Do not run it against paid generation unless the account balance/entitlement changes.

The manifest has been adjusted to the actual 223 subway files: service count 39 and track count 25. Keep it aligned with disk; never reference the missing service-40 asset.

## Existing integration that must be completed and verified

- `src/assets/manifest.ts` registers the second-pass art and uses daily deterministic subsets to avoid loading hundreds of large images at once.
- `src/render/buildingSprites.ts` maps ripperdoc, pawn, arcade, garage, and radio to unique exteriors.
- `src/render/propScatter.ts` includes early-world props in district-biased pools.
- `src/render/wishlistArt.ts` integrates generated subway plates and props. The generated straight track’s native orientation is north/south, so the renderer uses a one-quarter-turn offset relative to the legacy art. Keep module images clipped/sized to exact server-carved geometry.
- `src/game/npcServices.ts`, `src/scenes/online/sceneConfig.ts`, `src/scenes/OnlineScene.ts`, and `server/src/world.ts` add a server-authoritative hotel rest service: cost 35, full heal, clears HEAT, 120-second cooldown. Also preserve the corrected noodle/ripperdoc service routing.
- `src/world/rooms.ts` now contains unique traced 18×18 plans for ripperdoc, pawn, arcade, garage, radio, and hotel. Validate collision connectivity and adjust only against the actual images.

## Production philosophy and reusable prompt grammar

Match the existing game, not generic cyberpunk concept art. Game assets need:

- Top-down orthographic or three-quarter top-down projection, consistent with the nearest repository reference.
- Neon-noir industrial realism with restrained cyan, magenta, and amber practical lighting.
- Strong silhouettes that remain readable at 32–96 rendered pixels.
- Worn, inhabited materials: grime, leaks, patched metal, cables, improvised repairs, stickers/signage shapes without legible generated text.
- No people in environment plates or prop cutouts.
- For cutouts: exactly one object or tight object cluster, centered, isolated on a flat black or white background, no floor scene, no border, no cast-shadow plane that prevents clean alpha extraction.
- For rooms: square full-frame orthographic interior, entrance centered on south wall, broad connected walkable lanes, fixtures against walls or in clear islands, no perspective horizon.
- For subway modules: square full-frame overhead plate, exact readable rail/platform geometry, broad traversal lane, seamless-looking edges, no people/creatures unless generating a separate enemy cutout.
- Avoid readable AI text. Add necessary signage in code or existing UI typography.

Always provide one or more existing reference images from the relevant asset family to Nano Banana Pro. Generate 2–4 candidates per high-value item only when the free allowance and time permit; accept one, archive alternates outside runtime folders, and move on.

## 6–8 hour practical generation checklist

### Phase 0 — 20 minutes: audit and queue

- [ ] Confirm current browser model entitlements and record free/unlimited badges in a timestamped note.
- [ ] Run a disk inventory so prompts do not duplicate existing `hf_*` files.
- [ ] Open representative references: one exterior, one room, one prop, one subway module, one enemy, and one UI frame.
- [ ] Create `tmp-art-backup/hf-web-<date>/raw/` and a TSV/Markdown queue with columns: key, category, model, prompt, reference, status, raw path, processed path, integrated location, QA result.
- [ ] Limit concurrent browser generations to what the UI reliably supports. Use resumable batches of 8–16, not one enormous opaque queue.

### Phase 1 — 90 minutes: first-hour district identity pack

Generate and integrate approximately 35–50 accepted cutouts, biased toward what a new player sees repeatedly:

- [ ] 6–8 spawn-plaza/navigation landmarks: transit map kiosk, broken civic clock, holographic district marker, checkpoint arch, memorial wall, public terminal, recognizable fountain/antenna variants.
- [ ] 8–10 market/street-life clusters: noodle carts, tarp stalls, battery vendor, illegal cyberware blanket, salvage table, water recycler, stacked delivery crates, courier locker.
- [ ] 6–8 residential/slum storytelling props: rooftop water tank, laundry rig, shrine, sleeping pod exterior, community heater, scavenged solar bank, barricaded doorway, tenant notice board without readable text.
- [ ] 6–8 industrial props: transformer, vent stack, cable spool cluster, coolant tank, generator, robotic pallet mover, hazard barrier, maintenance cage.
- [ ] 4–6 quest-readable hero props: stolen neural case, infected relay, courier dead-drop, gang tribute, evidence terminal, bounty target cache.
- [ ] 4–6 compact street micro-scenes that remain traversable and do not obscure doors.

Integration rules:

- Add manifest keys and district-biased scatter pools.
- Use deterministic selection from zone seed/day; never randomize server collision.
- Hero/quest props need authored fixed placements, not only scatter.
- Keep door approaches, spawn safety radii, combat lanes, and bridge portals clear.

### Phase 2 — 90 minutes: business interiors and interactions

The six newly generated rooms already cover ripperdoc, pawn, arcade, garage, radio, and hotel. Do not spend this phase remaking them unless visual QA proves one unusable. Instead generate approximately 24–36 furniture/interaction cutouts:

- [ ] Ripperdoc: surgical chair, scanner arm, implant cabinet, sterilizer, organ cooler, diagnostic holo.
- [ ] Pawn: appraisal scanner, locked display case, salvage bins, weapon rack, cash cage, counterfeit detector.
- [ ] Arcade: cabinet variants, prize wall, rhythm platform, neural VR chairs, token counter, repair bench.
- [ ] Garage: lift, engine block, tool wall, tire stack, welding station, drone repair cradle.
- [ ] Radio: mixing console, transmitter rack, isolation booth hardware, mic stand, archive reels, signal analyzer.
- [ ] Hotel: sleep pod open/closed variants, reception terminal, luggage cage, med dispenser, vending unit, privacy screen.

Gameplay/NPC checklist:

- [ ] Hotel clerk offers **Sleep — ₵35**, with authoritative debit, full heal, HEAT clear, and cooldown feedback.
- [ ] Ripperdoc offers healing and cyberware-flavored dialogue.
- [ ] Pawn broker buys/sells appropriate inventory and has authored lines.
- [ ] Garage NPC exposes forge/upgrade/repair-oriented service and dialogue.
- [ ] Arcade NPC exposes leaderboard/board interaction and local rumors.
- [ ] Radio NPC exposes contracts/news/rumor interaction.
- [ ] Each business has at least one keeper plus 1–3 flavor occupants with location-specific dialogue where the existing architecture supports occupants.
- [ ] All keeper/service interactions are reachable from the entrance and seats are on walkable connected tiles.
- [ ] Leaving any interior returns the player just outside the exact building door, not the area’s original spawn.

### Phase 3 — 90 minutes: subway density and storytelling

The subway already has 223 full-frame modules and 88 second-pass cutouts. Focus on missing *systems and authored identity*, not more interchangeable tunnel squares:

- [ ] 6–8 station identity landmarks: abandoned ticket shrine, flooded platform pump, sealed quarantine gate, signal control altar, scavenger camp, collapsed escalator, memorial platform, maintenance train nose.
- [ ] 8–12 wall/edge decals or prop cutouts: route-map frames without text, warning lights, cable bundles, ventilation fans, dripping pipe manifolds, emergency cabinets, signal repeaters.
- [ ] 6–8 traversal/story props: movable barricade look, broken turnstile, maintenance ladder, power junction, locked service hatch, ritual marker.
- [ ] 4–6 enemy lair/nest cutouts that do not bake enemies into the floor.
- [ ] 3–4 boss-arena hero props with clear collision silhouettes.
- [ ] 4 station palette/lighting identity overlays only if the renderer can tint/compose them cheaply.
- [ ] Author fixed station identities and small environmental stories so stations are recognizable, rather than choosing all art from a generic daily pool.
- [ ] Confirm every plate remains aligned to server-authored traversal and collision. Decorative art may never imply a walkable opening where the server has a wall.

### Phase 4 — 60 minutes: enemies, NPC portraits, and quest moments

Only do this after environment integration is healthy.

- [ ] 4–6 early enemy silhouette variants per most common faction, preserving the game’s sprite scale and facing/animation requirements.
- [ ] 6–10 high-value NPC portrait/bust images for dialogue panels: hotel clerk, ripperdoc, pawn broker, mechanic, arcade operator, radio host, early fixer, subway survivor, early antagonist, first boss.
- [ ] 4–6 illustrated quest cards/loading panels for major first-hour beats.
- [ ] Do not point manifest character entries at arbitrary stills. Characters/cops/NPCs use code-baked 32×32 four-facing/four-step animation from `src/assets/charart.ts`; update animation/origin handling if and only if animated sprite sheets are deliberately produced and tested.

### Phase 5 — 45 minutes: UI and loading art

- [ ] One sharp mobile-friendly title/loading splash with a protected text-safe region; add real title text in HTML/CSS, not generated text.
- [ ] 3–5 district loading cards for early areas.
- [ ] One subway loading card.
- [ ] 6 service icons: sleep, heal, pawn/trade, forge/repair, arcade/leaderboard, radio/contracts.
- [ ] 6–10 inventory/quest icons only where existing icon coverage is visibly weak.
- [ ] Validate at mobile portrait and landscape sizes; the Metro/Credits menu must remain on-screen in landscape.

### Phase 6 — optional 60–90 minutes: trailer and audio, only with verified free models

Trailer deliverable (30–45 seconds total):

- [ ] First create a 10–12 shot storyboard using still frames from actual game locations and accepted art.
- [ ] Shot list: rainy city establishing view; player at spawn; market detail; ripperdoc surgery; hotel sleep pod; arcade glow; garage sparks; radio booth; subway descent; tunnel threat; combat/boss beat; title/end card.
- [ ] Use 3–5 second clips, restrained camera motion, no invented photoreal protagonist face, no illegible generated title text.
- [ ] Prefer image-to-video with accepted location stills so the trailer represents the shipped game.
- [ ] Edit clips locally into 16:9 master plus optional 9:16 cutdown; normalize loudness and include actual gameplay footage where possible.
- [ ] Real METROPHAGE typography/end card must be composited after generation.

Audio deliverables if a model is explicitly free/unlimited:

- [ ] 3 seamless ambient beds: early-city rain/hum, indoor business murmur/machinery, subway drone/drips.
- [ ] 8–12 short SFX: door enter/exit, sleep confirmation, heal, trade, forge, arcade chirp, radio tuning, subway gate, signal alarm, quest pickup, boss sting.
- [ ] 2 short music cues: title/menu and subway tension, avoiding vocals/lyrics and any imitation of living artists.
- [ ] Export web-ready OGG/MP3 as appropriate, normalize conservatively, loop-test ambience, and lazy-load larger files.

## Integration and processing checklist

- [ ] Download originals at maximum practical resolution; never use browser screenshots as final assets.
- [ ] Preserve raw downloads in `tmp-art-backup/`.
- [ ] Use `sharp` or the existing processing approach for resize, alpha cleanup, trimming, padding, WebP/PNG choice, and metadata stripping.
- [ ] Inspect alpha edges on dark and light checkerboards. No white/black rectangular backgrounds on cutouts.
- [ ] Keep full-frame rooms/subway plates opaque; do not background-remove them.
- [ ] Check that files are genuinely sharp at rendered size. Reject over-smoothed, blurry, perspective-skewed, text-garbled, or duplicated outputs.
- [ ] Avoid loading the entire hundreds-file pack at startup. Use deterministic subsets, per-zone loading, or lazy asset packs.
- [ ] Every manifest key must point to an existing file, and every runtime file should either be used or intentionally archived outside public runtime folders.
- [ ] Update collisions only for fixed authored objects, and mirror them server-side when they affect movement.
- [ ] Test low-memory/mobile startup and scene transitions after adding large art.

## Engineering work that remains mandatory

- [ ] Finish/verify the unique `ROOM_PLANS` for ripperdoc, pawn, arcade, garage, radio, and hotel against their six actual images.
- [ ] Add focused tests for `NPC_SERVICES.rest`, `servicesForNpc("keep_hotel")`, and the new keeper menus.
- [ ] Verify hotel sleep when injured/with HEAT, insufficient funds, cooldown, and full-health/no-HEAT refusal.
- [ ] Verify leaving every building returns to the corresponding exterior door.
- [ ] Verify mobile landscape Metro/Credits menu containment and the slightly closer mobile camera without losing surroundings.
- [ ] Verify subway plate rotation, exact module bounds, traversal visibility, and no blocked central cross.
- [ ] Confirm daily art selection never requests `hf_subway_tile_service_40`.
- [ ] Confirm the existing connectivity and server zone-routing tests remain intact and passing.

## Test and deployment gate

Run, fix, and record:

```sh
npm run typecheck
(cd server && npm run typecheck)
npx vitest run
git diff --check
npm run ship:scrub
```

Also run focused room, venue-layout, spawn-safety, subway, city, manifest, building-sprite, NPC-service, connection-routing, and server zone-routing tests. Run the relevant local smoke/panel/mobile checks. Inspect representative new art in the actual game, not only as standalone files.

Only after all gates pass:

```sh
npm run deploy:safe
```

Verify both live endpoints and record the deployed Worker/Pages versions:

- Game: `https://metrophagev1.pages.dev`
- Server: `https://metrophage-server.wendellphillips.workers.dev`

## Definition of done

The task is done only when:

1. The best practical new art is downloaded, processed, registered, visibly integrated, and reachable in the first 2–3 gameplay hours.
2. New business interiors are distinct and have internal NPC interactions/services, especially hotel sleep/rest.
3. The subway is denser and has recognizable authored stations without lying about collision geometry.
4. Mobile landscape UI/camera and correct exterior-door return behavior still work.
5. No public asset is a blurry screenshot, opaque-background cutout, accidental duplicate, or unused manifest entry.
6. Shared networking/routing changes are preserved.
7. Tests/typechecks/scrub pass and the progress-safe deployment is healthy.
8. A final report lists: generated/accepted/rejected counts by category; exact unlimited models actually used; files added; gameplay locations touched; interaction changes; test results; live deployment identifiers; and any deferred items with reasons.

## Time-boxing rule

At hour 6, stop opening new asset categories. At hour 8, stop all generation except a single replacement for a clearly broken critical asset. Use the remaining time for processing, integration, collision/NPC work, tests, visual QA, and deployment. A shipped coherent art pass is the goal—not an unreviewed library dump.
