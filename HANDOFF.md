# METROPHAGE — continuation brief

You are picking up work on **METROPHAGE**, a top-down neon-noir cyberpunk action-RPG MMO
in the browser. Phaser 3 + Vite + TypeScript client; **server-authoritative** world on
Cloudflare (Worker + per-zone Durable Objects at 20Hz + D1).

## 2026-07-16 (third pass) — guest login fixed, Phantom deeplinks, world redesign

- **`smoke:panels` is GREEN (desktop + mobile) for the first time.** The blocker was
  real and player-facing: `stillHere()` in `signInThenConnect` used `sys.isActive()`,
  which is false during `create()` — every fully-synchronous GUEST login returned
  before opening a socket. Prod guests could not join. Fixed (only SHUTDOWN/DESTROYED
  count as gone). This was also the mobile "black screen after tutorial".
- **Phantom mobile = deeplinks now** (`src/economy/phantomDeeplink.ts`): connect +
  signMessage round-trip through the Phantom APP; the game stays in the player's
  browser. The old `ul/browse` in-app-browser handoff remains only as a fallback.
  Physical-device QA still required (see MOBILE-QA).
- **World**: hub centre cleared (civic ring removed, furnished commons instead);
  every district plaza has an authored env-keyed centrepiece; districts gained
  noodle + ripperdoc venues. **Quests**: all keepers give real jobs; story allies
  escalate via `LATE_BOUNTIES` in the late act (phase passed client+server).
- **When running `panel-smoke`: NEVER edit source files while it runs** — vite HMR
  reloads the page mid-boot and the run reports a bogus "never connected".

## 2026-07-16 (second pass) — repo secured, boot wedge fixed, venues wired

- **Everything is committed and pushed** (`feat/hf-environment-art`; tag
  `deployed-20260716` = the tree production served while still uncommitted).
  Build stamps now append `+dirty` when the tree ≠ HEAD; `deploy:safe` stays
  progress-safe. Do not deploy from a dirty tree without expecting that suffix.
- **Boot wedge (was: "panel smoke never connected")**: Phaser dispatches queued
  loader files only from the scene UPDATE loop, which stops while
  `document.hidden` — a boot in a background tab froze forever after the first
  32 files (reproduced on production). Fixed by `src/systems/loaderPump.ts`
  (interval re-pump; installed in BootScene + OnlineScene). Probes now wait for
  `window.__bootDone` and a settled Select scene; `?skipIntro=1` skips ColdOpen.
- Expansion venues show their authored occupants (kind-keyed INTERIOR_PLAN was
  dead for `h{K}` zones); districts gained noodle + ripperdoc venues
  (`DISTRICT_VENUE_KINDS` is append-only — index K = kind K forever);
  hotel rest has unit + `smoke.mjs rest` E2E coverage; MAREK reacts to your
  reprint count; three orphan room images no longer load per venue entry.

## 2026-07-16 authorized reset + Solana/subway follow-through

- Player-facing wallet identity is Solana-only: intro chrome reads `SOL · MAINNET`
  and `PHANTOM · SOLANA`. Robinhood/EVM compatibility code is not a launch path.
- The sole god/operator wallet is
  `9Z9uZJXdnyTE7gkFfrepJ3BWDTNA3ZeteDkpgT6cxkve`; old EVM operators were removed.
- `tools/reset-live-world.sql` is the user's explicitly authorized one-time exception
  to the normal no-wipe rule. It clears players, progression, inventory-bearing rows,
  market/mail/guild state, and estate ownership/furniture. Bridge transaction ids remain
  for replay protection, with prior player and wallet identity redacted.
- UNDERLINE tunnels now consist of continuous overlapping authored art modules.
  `subwayTunnelArtModules()` drives both server collision footprints and client plates;
  fixtures, debris, lighting, and encounters are layered above that structure.
- Mobile wallet login is Phantom-first end to end. A phone without an injector opens the
  exact live URL in Phantom's in-app browser, then uses its Solana provider to connect and
  sign the free login message. It no longer falls through to the EVM/MetaMask deep link.
- Generated service icons now appear in NPC menus, and city/subway/hotel loading art is
  displayed during real deferred zone handoffs rather than merely being registered.

**Read `AGENTS.md` first** — it is the canonical engineering brief (deploy, smoke, economy,
art constraints). `CLAUDE.md` points at it. Non-negotiables from it:

- Shared sim/world code under `src/` is imported by `server/src/world.ts`. Nothing under
  `src/net|game|world` may touch DOM/Phaser globals.
- `TILESET_PX` must equal `TILE` (32).
- Never change `database_id`, never `d1 delete`, never unscoped `DELETE FROM players`.
  DO migration tag stays `v1`.
- `VITE_SERVER_URL` is **build-time**; production client must bake
  `wss://metrophage-server.wendellphillips.workers.dev/ws`. Pages deploys need `--branch=main`.
- Deploy with `npm run deploy:safe` (D1 fingerprint → additive migrate → Worker → client).
- Typecheck root and server **separately**: `npx tsc --noEmit` and `cd server && npx tsc --noEmit`.
- `export PATH="$HOME/.local/node/bin:$PATH"` before node/npm.

Treat the live build stamp and `git status` as authoritative; this branch may contain
verified work that is not deployed yet. The full test suite and both typechecks are the gate.

> **If you are touching $METRO / the chain layer, read §7 first — specifically the ⚠ price-oracle
> note.** Settlement is back on **Solana SPL**; Robinhood/ERC-20 is a dormant alternate. The
> rename was the easy half. A `0x`-shaped regex in `metroPrice.ts` silently pinned every bridge
> rate to the `$1` reference with no error surface, and that class of bug hides in files that
> look chain-agnostic. §7 also carries the two open tasks: the **GitBook** (commit to GitHub →
> GitSync publishes) and the **treasury secret** (human-only).

---

## 1. RESOLVED — black-building render path

**Symptom (user-reported, visually confirmed):** buildings in the city-center hub render as
**black rectangles** with no exterior art, and **no props are scattered on the ground
outside**. Districts are reportedly affected too.

**This is NOT an asset problem. Do not go looking for missing art.** That was chased at
length and disproved:

- `tools/art-probe.mjs` (real Chromium via Playwright) proves **261/262 object PNGs load in
  production**. The only absentee was `hf_building_den_c`, which has since been generated —
  coverage is now **262/262**.
- The boot diagnostic added to `src/scenes/BootScene.ts` prints
  `[boot] 211 hf_* textures loaded, 0 failed` on a live boot.
- `tools/hub-probe.mjs` confirms in-game that `textures.exists('hf_building_bar')` is **true**
  and the texture is 224×218.

**The actual evidence** (`node tools/hub-probe.mjs http://localhost:5199`):

```
zone                 safe
textures loaded      617
  hf_building_citycenter   203x224     ← texture present
  hf_building_bar          224x218     ← texture present
display list         641 {"TilemapLayer":1,"Graphics":195,"Image":145,"Text":176,...}
hf_ images in scene  0                 ← ZERO hf_ images ever created
flags                {"isCityHub":true,"interior":true,"worldW":3584,"worldH":2816}
image keys drawn     {"glow":51,"spark":48,"fx_muzzle":16,"fx_impact":12,"ui_frame":8,...}
```

Every image drawn is fx/UI. `isCityHub` is `true`, and 195 `Graphics` objects prove the
**procedural** façade path ran — so `selectBuildingSprite()` returned `undefined` for all 30
hub buildings even though the textures exist.

**Why that turns black:** `paintCityBuildingFacades` (`src/render/buildingFacades.ts`) only
pushes a rect into `hfRects` when it paints HF art. `OnlineScene` then passes the buildings
**not** in `hfRects` to `installRoofParallax` (`src/render/roofParallax.ts`), which draws a
dark roof cap at **depth 12** — above the façade (≈4.0). No art ⇒ dark slab.
Missing props share the root cause: `src/render/propScatter.ts:139` does
`filter(p => scene.textures.exists(p.key))` then `if (livePool.length === 0) return;`.

**Where to look, in order:**
1. `selectBuildingSprite()` in `src/render/buildingSprites.ts` — instrument its inputs
   (`kind`, `opts.districtId`, `opts.infected`, `variantSalt`) and its `exists` callback for a
   real hub building. It is Phaser-free and unit-tested (`buildingSprites.test.ts`), so you can
   reproduce in a vitest test with a fake `exists` that returns true.
2. Whether `paintCityBuildingFacades` is actually called with a non-empty
   `ONLINE_CITY.buildings` (30 expected) — see the `if (this.isCityHub)` block in
   `src/scenes/OnlineScene.ts` (~line 725).
3. `DIST_KIT` / `kitChain` in `buildingSprites.ts` — `DIST_KIT` is typed
   `Record<string, string | string[]>`, **not** a district-id union, so an unmapped/typo'd
   `b.env` silently yields `[]` with no compile error. `b.env` values seen in the hub include
   `undercity, arcology, docks, slum, market, industrial, corporate, residential`.
4. Note `flags.interior === true` for zone `safe`, and `worldW/H = 3584×2816` (112×88 tiles).
   Confirm that matches `ONLINE_CITY.grid`; an older comment in `terrainLayer.ts` claims the
   hub is 450×360, which may be stale — or may indicate the wrong grid is being built.

**Reproduce it:**
```sh
export PATH="$HOME/.local/node/bin:$PATH"
# dev server on 5199 (config already in .claude/launch.json; .env.local points it at the LIVE worker)
node node_modules/vite/bin/vite.js --host --port 5199
node tools/hub-probe.mjs http://localhost:5199      # dumps display list + writes tmp-art-backup/hub.png
node tools/art-probe.mjs https://metrophagev1.pages.dev   # asset-coverage probe
```
`window.__game` / `window.__enterCity` are **dev-only** (`import.meta.env.DEV` in
`src/main.ts:245`), so probes must run against a dev server, not the production build.

---

## 2. Architecture already changed — the art defines the room

`src/world/rooms.ts` (**new**) is now the single source of truth for interior rooms.

**The rule: the art is the room.** Each plan is traced from one `hf_int_*_room` texture —
the room's tile dimensions match the texture's aspect, and every fixture painted into it
(bar counter, clinic beds, shop aisles, booths) is mirrored as a `blocks` rect so you
physically collide with the furniture you can see.

Previously the floor was a **zone-hash** pick from 5 generic `VENUE_LAYOUTS` and the kind was
carried only by loose furniture sprites on seat tiles — so a dive bar and a clinic could get
the same 27×11 `hall` floor, and the ~1:1 room art was stretched to 2.45:1.

- `venueKindForZone(zone)` resolves the venue KIND from the zone string alone (pure,
  deterministic) — `d{N}i{K}` → `districtBuildingKind`, `h{K}` → `ONLINE_CITY.buildings[K].kind`,
  and the named hub venues (`bar`/`clinic`/`shop`/`den`) → that kind.
- `venueLayoutFor` / `buildVenueRoom` / `venueSpawnFor` / `spawnPointForTravel` live here.
  **Both client and server import them from `world/rooms`** — this is what keeps collision
  identical on both sides. `district.ts` retains only `hashVenueLayoutFor` (the fallback for
  kinds with no art). The rename was deliberate: a missed call site is a compile error rather
  than a silent client/server grid desync.
- Cycle constraint: `city.ts` imports `district.ts`, so `district.ts` **cannot** import
  `city.ts`. `rooms.ts` imports both. That's why `spawnPointForTravel` moved into `rooms.ts`.
- 8 kinds are art-traced: bar, clinic, shop, guild, den, home, citycenter, stadium.
  `hotel` has no art and correctly falls back. **est{K} player estates resolve no kind and
  stay bare on purpose** — players hand-decorate them (test locks this).
- Client draws it via `dressArtRoom()` (`src/render/wishlistArt.ts`) — full-bleed, opaque —
  and **skips** the procedural counter/rug pass and scattered furniture. Art rooms also opt
  out of the terrain polish passes in `createTerrainLayer` (the `interior` profile shades
  walls at depth 2.5 and pools ambient light *on top of* the art).

Invariants are enforced in `src/world/rooms.test.ts` + `venueLayouts.test.ts`: mat/spawn
walkable, seats walkable **and reachable**, **no sealed pockets**, fixtures inside the wall
ring, aspect tracks the art.

---

## 3. Other work already landed

- **Argus Spire / Orbital Relay spawn** — both shipped a `spawnTile` inside a building
  footprint; `buildGrid` filled the tower and `carve()` opened only a 5-tile plus-shape, so
  runners arrived **sealed in a pocket** (flood fill: region=5, plaza unreachable). Both south
  gates split into two pillars with a lane at x=19. Now ~8,500 tiles, plaza reachable.
  `spawnSafety.test.ts` gained a **reachability** test — the old tests only asserted "not a
  wall", which a sealed pocket passes.
- **Estates ₵3,800 → ₵60,000** (`src/world/estates.ts`). Grounded in live constants:
  ~300 kills/hr × `CREDITS_PER_KILL` 10 × daily mult × guild perk + bounties/dailies
  ≈ **₵8–12k/hr**, so the old price was ~20 minutes. No migration needed — unowned plots quote
  the constant (`e.owner ? e.price : ESTATE_BASE_PRICE`), never a stale D1 row.
- **Map/fast travel** — all locations now visible to everyone; fast travel gated on
  `unlocked` (organic arrival) only. It previously accepted `discovered || unlocked`, so the
  organic-only rule its own comments described was never enforced.
- **Drill instructors removed** from the city spawn (`spawnTrainingYard`).
- **Named hub rooms** (The Feral Cat/clinic/shop/den) now use their kind's art room. They ran
  on a 40×30 `buildSafehouse` grid dressed with a 20×13 plate — art in one quadrant,
  `INTERIOR_NPC_TILES` outside it. `buildSafehouse` is now **dead server-side**.
- **BootScene** reports load failures **in production** (was `if (import.meta.env.DEV)` —
  silent on the live site, which is why this class of bug went undiagnosed), and logs
  `[boot] N hf_* textures loaded, M failed`.

---

## 4. Higgsfield art pipeline — traps that cost real credits

Budget: **assume 600 credits** (~1.1/asset ⇒ ~545 assets). The full content plan is §6b.
CLI: `higgsfield` (authenticated). `tools/hf-sharpen-env.mjs <key>...` implements the
upscale pipeline; read its header. The generation plan is §4b.

**The blur problem:** source art is tiny and the world stretches it hard —
`hf_building_dist_core` is **141×224** but a district scenery block renders at
8×7 rect × `DISTRICT_SCALE` 3 = **768×672 (~5.4×)**, and `placeFullBuildingArt` /
`dressArtRoom` filter `LINEAR` on top. No render tweak fixes this; the pixels aren't there.

**Pipeline:** `bytedance_image_upscale --resolution 2k` → re-composite original alpha →
resize to 3× the **original** dimensions → save RGBA.

Four traps, each learned the hard way:
1. **Upscaling preserves composition; prompted image-to-image does NOT.** A `nano_banana_2`
   "restyle" of `hf_int_bar_room` invented an extra room and moved the bar — which would
   desync collision from the picture, because `rooms.ts` traces collision from these exact
   images. **Never regenerate room art with a prompt.** (Building *exteriors* are safe to
   generate freely — their collision comes from the footprint rect, not the art.)
2. **`bytedance_image_upscale` returns RGB and silently DROPS alpha.** The district kit is
   40.6% transparent; shipping a raw upscale would paint every building an opaque black
   rectangle — *manufacturing the exact bug in §1*. Always re-apply the original alpha mask.
3. **Do NOT palette-quantise.** It looked fine on a building (high-contrast neon on
   transparency) and **destroyed** the room art (full-bleed, subtle dark gradients): harsh
   banding + white speckle, visibly worse than the low-res original. Always eyeball a
   full-bleed asset, not just a cutout.
4. **Generated building art has no alpha** — run `image_background_remover`, then crop to the
   silhouette bbox and size to ~1.4× the on-screen footprint (a hub building renders ~320px).

Done: all 11 `hf_int_*_room` sharpened to 3× RGBA (e.g. bar 178×180 → 534×540, ~4.3 MB total
for 11). `hf_building_den_c` generated as a sibling den. Manifest coverage is 262/262.

---

## 4b. Generation plan — make the world feel big (see §6b for the content brief)

**GATE: do §1 first.** Every asset below renders through the same path that is currently
producing black buildings. Sharper, more plentiful art still renders black. Fixing §1 costs
0 credits and unblocks the entire spend. Do not generate ahead of it.

### The rule that decides how fast you can spend

Sort every asset by **whether the art structures collision**:

| Class | Collision comes from | Can you free-generate? |
|---|---|---|
| Building exteriors, district kits, env kits, estate façades | the footprint **rect** in the layout data | **YES** — art is pure skin |
| Props, decals, scatter, wilderness dressing | nothing (`InteriorProp` is documented non-colliding; `propScatter` never collides) | **YES** |
| Ground/floor plates, biome plates | the tile grid | **YES** |
| Estate furniture | `FURNITURE[].w/h` already declared in `estates.ts` | **YES** — art fills a known box |
| **Interior room art (`hf_int_*_room`)** | **the picture itself** (`rooms.ts` traces it) | **NO** — upscale only |

So ~90% of the budget can be spent on free-generation, in parallel, with no tracing.
The bottleneck for room variety is **hand-tracing a plan per image**, not credits — budget
roughly an hour of careful work per new room plan, and let `rooms.test.ts` enforce the
invariants (mat/spawn walkable, seats reachable, **no sealed pockets**, aspect tracks art).

### Priority order (each tier is independently shippable)

**T1 — Sharpen what exists · ~80 assets · ~88 cr · zero risk**
The single best credit-per-"feels real" ratio, because it fixes the *whole* world at once
and cannot desync anything. District kits are the worst (141px → 768px, ~5.4×).
`node tools/hf-sharpen-env.mjs <key>...` — already built and proven.
- 9 `hf_building_dist_*` + 9 `_b` + 9 `_inf` (27)
- 10 `hf_building_*` kinds + 14 variants (24)
- 5 `hf_int_layout_*`, 5 `HF_ENV_KIT_KEYS`, 3 `HF_ESTATE_KEYS`, 7 `HF_WILD_BIOME_KEYS` (20)
- ~9 remaining landmark/subway/dungeon plates

**T2 — Building variety · ~60 assets · ~66 cr · zero risk · biggest "big world" win**
Right now every bar on every block is the same picture, and each district has ONE kit.
`pickHfVariant(exists, base, salt, 3)` (`manifest.ts`) *already* hash-picks `base`/`_b`/`_c`
per building — the variants simply don't exist. Generating them needs **no code change
beyond adding keys** to `HF_BUILDING_VARIANT_KEYS` / `HF_DIST_BUILDING_VARIANT_KEYS`.
- `_b`/`_c` for every kind missing them (~6 kinds × 2 = 12)
- `_c` for all 9 district kits (9), and `_b`/`_c` for the 5 env kits (10)
- 2–3 fresh siblings per district kit so a street reads as a street, not a tiling (~27)
Recipe: `nano_banana_2 --image <sibling>.png` with the den_c prompt shape (see git log of
`hf_building_den_c`): *same projection/palette/framing, different mass and roofline.*
Then `image_background_remover` → crop to bbox → size ~1.4× the on-screen footprint.

**T3 — Ground density · ~70 assets · ~77 cr · zero risk**
This is what "the assets are gone from the ground" is really about once §1 is fixed:
the pool is thin. `propScatter.ts` has `PROPS`/`BIAS_KEYS` (`car`/`industrial`/`neon`/…);
`scatterWorldProps` takes `propBias` per district, so more props per bias = more identity.
- ~40 street props across the biases, ~20 wilderness (`HF_WILD_PROP_KEYS`), ~10 landmarks
- Hub density is deliberately low for perf (`0.003` vs district `0.006`, and the `city`
  terrain profile disables per-tile passes at 450×360) — add variety, not count.

**T4 — Subway as modules · ~30 assets · ~33 cr · needs layout work**
The explicit ask: tunnels/stations built *around* the art. `subway.ts` already carves
chambers "sized for hf_subway_ticket_hall + booth" and picks tunnel props by neighbour
count — but it is still art placed onto a procedurally carved grid. Invert it: author
tunnel/station **modules** whose tile footprint equals the art's, then tile them.
Straight/junction/cross/curve rails, platform ends, escalator halls, service bays.
`CORRIDOR_HALF = 2`, `STATION_HALF = 6` are the constants the art must land on.

**T5 — Estate furniture · 24 assets · ~26 cr · zero risk**
Footprints already declared; today they render as procedural glyph cards
(`render/furnitureArt.ts` returns false → glyph fallback). Directly serves the
hand-decorating pillar. **Pair with the free-furniture bug in §5** or it stays a non-sink.

**T6 — Interior variety · tracing-gated · ~20–40 cr**
Only *after* T1–T5. Each new room = 1 upscaled image + a hand-traced plan + tests.
Cheaper alternatives that need **no** new art and cannot desync:
- **Runtime tint** for contagion interiors (green wash on the existing room art) instead of
  `_inf` room images.
- **Per-district accent tint** on the same room art so a WASTES bar reads different from an
  ARGUS SPIRE bar, without a second traced plan.
Prefer these until the black-building fix is verified in-game.

### Budget

| Tier | Assets | Credits |
|---|---|---|
| T1 sharpen | ~80 | 88 |
| T2 building variety | ~60 | 66 |
| T3 ground density | ~70 | 77 |
| T4 subway modules | ~30 | 33 |
| T5 estate furniture | 24 | 26 |
| **subtotal** | **~264** | **~290** |
| retries @ ~10% (1 of 11 failed in the last batch) | | ~29 |
| **total** | | **~320** |

This tier list is the *existing* world. **§6b supersedes it with the full 600-credit plan**
(new building types, interiors, NPCs, oddities) — read that before spending.

### Non-negotiables when generating

1. Batch in the background and **eyeball every batch** — open the PNGs, don't trust the log.
   Both traps below passed automated checks and were only caught by looking.
2. Re-composite alpha after any upscale; run `image_background_remover` on anything
   generated fresh; never palette-quantise full-bleed art.
3. Size to ~1.4× the on-screen footprint, not to 2048. Bytes matter: the client queues
   ~600 files in one load. A room at 3× RGBA is ~400 KB; a raw 4× is ~600 KB for no gain.
4. Keep `tools/hf-sharpen-env.mjs`'s backup behaviour — originals land in `tmp-art-backup/`
   (gitignored) and are git-tracked, so `git checkout` always restores.
5. After each batch: `npx tsc --noEmit` (root **and** server), `npx vitest run`, then
   `node tools/art-probe.mjs <url>` to confirm coverage is still N/N with 0 failures.

---

## 5. Resolved hardening notes / worth monitoring

- **`npm run smoke:panels` is RED and was red before any of this work** (verified by stashing
  everything and running on a clean tree — identical failure). `page.goto` times out waiting
  for `domcontentloaded` on a heavy boot. `tools/art-probe.mjs` shows `waitUntil: "commit"`
  works. This means `npm run verify:ship` cannot pass as-is.
- **Resolved: boss-bounty faucet.** Every boss job now has a durable per-player 24-hour
  completion gate (`bounty_completions`). The conditional D1 claim must succeed before the
  reward is granted, so reconnects, zone races, and failed writes cannot duplicate payouts.
- **`enemies.ts` `EnemyTierDef.credits` is dead** — the server uses its own `ENEMY_ARCHES`.
  Anyone tuning the economy there will see no effect.
- **Resolved: free furniture/buffs.** The server prices the sanitized draft against the saved
  layout, durably charges positive catalogue value before persisting the layout, makes moves
  free, and gives no refund for removals. Failed ledger/estate writes restore state.
- **XP curve untouched, deliberately.** `levelForXp = 1 + xp/100` (`src/net/sim.ts`) is applied
  to stored XP on every load, so steepening it **retroactively de-levels every existing
  player** (a L20 wakes at L8 with less HP/damage). Needs a one-time grandfathering migration
  that credits existing players enough XP to hold their level. **Do not ship without it.**
- `HF_INT_ROOM_KEYS` were preloaded but never drawn before this work; `city.ts` `buildInterior`
  / `furnishInterior` / `interiorDims` are exported with **zero callers** (dead).

## 6. Still requested, not started

- **Subway built around its art.** `src/world/subway.ts` already carves station chambers
  "sized for hf_subway_ticket_hall + booth" and picks tunnel props by neighbour count — but
  it's still *art placed onto a procedurally carved grid*. The ask is the reverse: tunnel/
  station **modules** whose tile footprint equals the art's footprint, then tiled.
- **Re-trace the room plans against the now-legible art.** The traced fixtures in `rooms.ts`
  are approximate (done by eye at ~180px). User reports gaps too narrow to walk through and
  overlap between walls and art. At 534px this can finally be done accurately.
- **Every building/location/environment art-driven**, including outdoors; diversity variants
  per district (a bar in the WASTES ≠ one in ARGUS SPIRE).

---

## 6b. CONTENT BRIEF — make the world big, varied and alive

**Budget: assume 600 Higgsfield credits (~545 assets).** Take as long as you need — this is
a build-it-properly task, not a timeboxed one. Ship it in tiers, verifying each (typecheck
root **and** server, `npx vitest run`, `node tools/art-probe.mjs`, eyeball the PNGs) before
starting the next. **§1 still gates all of it: art renders black until that's fixed.**

### A. Many more building types, and no duplicates

**The measured problem** (`ONLINE_CITY.buildings`, 30 buildings, 11 kinds):

```
shop ×8   clinic ×6   den ×6   bar ×2   guild ×2
citycenter ×1  subway ×1  hotel ×1  home ×1  stadium ×1  hospital ×1
```

Eight identical shops and six identical clinics on one map is the single biggest reason the
city reads small and fake. Districts are better — `DISTRICT_VENUE_KINDS = ["shop","home",
"guild","den","bar"]` is one of each — but that's only **5 enterable venues per district**,
and the other four buildings are scenery force-kinded `"home"` for art
(`const kind: BuildingKind = venueKind ?? "home"` in `buildingFacades.ts`).

**The rule:** a kind should appear **at most once per district/hub**, unless it is a
deliberate singleton landmark (`LANDMARK_KINDS`). Where a duplicate exists today, replace it
with a *new* type. That means growing `BuildingKind` from 11 to roughly **26–30** so the hub's
30 slots are near-unique, and raising `DISTRICT_VENUE_COUNT` so districts have more to enter.

**Suggested new kinds** (finalise as you like — cyberpunk-town texture, Pokémon-town spirit):
`noodle` (counter bar), `ripperdoc` (cyberware, distinct from `clinic`), `pawn` (fence front),
`arcade`, `laundromat`, `shrine` (Church of the Signal), `garage` (chop shop), `radio`
(pirate broadcast), `printshop` (fabricator), `greenhouse` (hydroponics), `bathhouse`,
`archive` (data library), `foundry`, `barber` (cosmetics), `kennel` (drone kennel), `morgue`,
`exchange` ($METRO front), `tattoo`, `precinct`, `theatre` (holo-cinema).

**Per new kind, the full set:**
1. **Exterior art** `hf_building_<slug>.png` + `_b`/`_c` variants (free-generate — collision
   is the footprint rect, not the art). Add slugs to `HF_BUILDING_SLUGS` /
   `HF_BUILDING_VARIANT_KEYS` in `manifest.ts`.
2. **Interior art** `hf_int_<slug>_room.png` (add to `HF_INT_ROOM_KEYS`).
3. **A traced `ROOM_PLAN`** in `world/rooms.ts` — dimensions matching the art's aspect, every
   fixture in the picture mirrored as a `blocks` rect. `rooms.test.ts` enforces the invariants.
   **This is the slow part — the art must be generated FIRST, then traced.** ~1 hour each.
4. **`KIND_STYLE`** in `buildingFacades.ts` — a **full** `Record<BuildingKind, …>`, so adding a
   kind is a compile error until you fill it in. Good: let the compiler drive the checklist.
   Same for `BUILDING_SPRITE` / `BUILDING_INFECTED` (`Partial`, so those fail *silently* —
   check them by hand).
5. **Titles/colour:** `DISTRICT_VENUE_TITLE`, `HUB_INTERIOR_TITLE`, `HUB_DOOR_COLOR`.
6. **A keeper NPC + explicit dialogue + a service** — see (C).
7. Consider `HEAL_KINDS` / `LANDMARK_KINDS` membership.

Kind assignment for the hub happens in `buildCity(1337)` (`src/world/city.ts`) — that's where
the duplicates are minted. Make it deal kinds without repeats (and keep the seed stable: the
grid is shared client/server, and `ONLINE_CITY` is built at module load on both).

### B. Different designs per district / location

A NOODLE BAR in ARGUS SPIRE (corporate, cyan, glass) must not be the same picture as one in
THE WASTES (ash, rust, scavenged). Two mechanisms already exist — use them, don't invent:
- **Exteriors:** `DIST_KIT` + `kitChain` in `buildingSprites.ts` map an env/district id to a
  kit with a fallback chain. District ids: `downtown, stacks, spire, docks, undercity, relay,
  wastes, core/kernel`, plus env ids `market, park, corporate, arcology, slum, industrial,
  residential, helios`. ⚠ `DIST_KIT` is `Record<string, …>` not a union — a typo yields `[]`
  silently (a prime suspect in §1). Consider tightening it to a union while you're here.
- **Interiors:** prefer a **per-district accent tint** over the shared traced room art before
  spending credits on a second traced plan per district — same collision, different mood, zero
  desync risk. `districtEnv.ts` already carries per-district palettes.

### C. NPCs — more types, and WRITE THE ACTUAL LINES

**Do not leave placeholders.** Every NPC ships with real, authored dialogue.

The systems already exist and are richer than the content using them:
- `src/game/cityNpcs.ts` — `KEY_NPCS`, `CITIZENS`, `KEEPERS`, `AMBIENT_NPCS`, `REGIONAL_NPCS`,
  `ALL_NPCS`, `INTERIOR_PLAN` (kind → occupants), `keeperFor(kind)`.
- `src/game/npcServices.ts` — `NpcRole` already includes `medic, bartender, broker, vendor,
  fixer_guild, fence, courier, preacher, mechanic, cook, guard, artist`; services already
  include `heal_paid` (₵45), `heal_charity` (free, 180s CD), `meal`, `rumor`, `intel`, `train`,
  `bounty`, `sell_core`, `bless`, `cool_down`. `ROLE_SERVICES` maps role → services;
  `NPC_SERVICE_OVERRIDES` maps npc id → services. `CLIENT_OPEN_SERVICES` are UI-only; anything
  else round-trips to the server (`world.ts` ~5040–5110) — **new services need a server handler
  or they do nothing**.
- Story-reactive dialogue exists: `ALLY_ARC` × `storyPhase()` → `campaignAllyLines()`.

**The voice** (match it — terse, wry, two lines, world-weary; names in CAPS):
> RIN — *"Eyes open out there, runner." / "The city eats the careless."*
> DOC HALO — *"Stay patched up. I'm always here." / "Half this district owes me blood."*
> VEX — *"Information's the only real currency." / "Everything's for sale. Even you."*
> OLD MAREK — *"I remember when this was all open sky." / "The slums keep what the towers throw away."*

Write in that register. Examples of the standard to hit for new keepers:
> NOODLE BAR — **MAMA TSE** (`cook`): *"Broth's older than you are. Don't insult it." /
> "Eat. You look like a debt collector's afterthought."*
> RIPPERDOC — **SPLICE** (`medic`): *"Chrome's cheap. Nerves aren't." / "Hold still. Or don't —
> I bill the same either way."*
> SHRINE — **THE STATIC** (`preacher`): *"The Signal doesn't answer. It only repeats." /
> "Kneel or don't. The carrier wave isn't proud."*
> KENNEL — **WHISTLE** (`artist`): *"They're not pets. They're opinions with rotors." /
> "One bit me last week. I respect that."*

**Per new building kind, author:** a keeper (name, look, role, 2–4 `lines`), 1–2 flavour
residents for `INTERIOR_PLAN`, and district-specific variants where it earns it (a WASTES
barkeep ≠ a SPIRE barkeep). Also honour the **earlier, still-unfilled ask: place healers
throughout the world, including combat zones, in a way that fits the area** — the `medic` role
and both heal services already exist; they're just confined to the hub clinic.

### D. Specific interactions, and Pokémon-style world oddities

The ask is *fun*, not systems for their own sake. Hooks that already exist:
`worldEvents.ts` (₵16–33 payouts), `dailyDistrictMod` (`districtMods.ts` — daily
`creditMult` 0.9–1.5, `enemyHpMult`), `fragments.ts` (lore pickups), `cityPulse.ts`,
`achievements.ts`, `dailies.ts` (3/day, day-seeded).

Ideas in that spirit — each should be **authored, findable, and cheap to hit**:
- A vending machine that's eaten someone's chip: pay ₵5, it argues with you, occasionally pays
  out a rare core. (`rumor`-shaped service, new handler.)
- A stray drone in THE STACKS that follows you for a zone if you feed it a core.
- A barfly in every district bar who tells you *today's* `dailyDistrictMod` in-character
  before the HUD does.
- OLD MAREK remembers how many times you've died and changes his greeting past a threshold
  (stat already tracked — see `achievementsForStat`).
- A shrine that "blesses" you (existing `bless` service) with a 10-minute cosmetic aura and a
  wildly overstated claim about what it does.
- Fishing-shaped idle loop in the DOCKS: a hole in the pier, a timer, a loot table of junk with
  one genuinely good drop.
- A building that's always closed. Every district has one. The sign changes daily. It never
  opens. (Free, pure texture, and players will absolutely talk about it.)

Keep them **server-authoritative where they touch credits/XP** — anything paying out must have
a Worker handler, or it's client-trusted and free money.

### E. Where the 600 credits go

| Tier | What | Assets | Cr |
|---|---|---|---|
| T0 | **Fix §1 first** — nothing renders until then | 0 | 0 |
| T1 | Sharpen existing world art (§4b) | ~80 | 88 |
| T2 | New building **exteriors**: ~18 kinds × (base + `_b` + `_c`) | ~54 | 60 |
| T3 | New building **interiors**: ~18 × `hf_int_<slug>_room` | ~18 | 20 |
| T4 | Per-district kit variants so a street isn't a tiling | ~45 | 50 |
| T5 | Ground/prop density (§4b T3) | ~70 | 77 |
| T6 | Subway modules | ~30 | 33 |
| T7 | Estate furniture (24) + NPC portraits for new keepers (~20) | ~44 | 48 |
| T8 | Oddities/world-perk art (vending, drone, shrine, closed shop…) | ~25 | 28 |
| | **subtotal** | **~366** | **~404** |
| | retries @ ~10% (1 of 11 failed last batch) | | ~40 |
| | **total** | | **~444** |

Leaves ~155 of 600 for iteration, reruns and a second pass on whatever looks weakest in game.
**Order matters:** T2/T3 art must exist *before* the `ROOM_PLAN` tracing, and tracing is the
schedule driver (~1h/room × ~18), not the credits.

## 7. $METRO settlement is back on **Solana** — GitBook is the remaining task

The chain was switched **back to Solana SPL** (Phantom, base58 mint, `mainnet-beta`).
Robinhood Chain / ERC-20 / MetaMask is now a **dormant alternate** that stays in the tree
and is reachable only via `METRO_SETTLEMENT=robinhood` / `VITE_METRO_SETTLEMENT=robinhood`.
**Do not describe Robinhood as the launch path anywhere.**

Context you need: commit `9c0e1c5` had flipped the *code and config* to Robinhood but left
**most prose still saying Solana**, so the repo was self-contradictory. This work flipped the
code back, which resolved the contradiction rather than creating one.

### ⚠ The load-bearing part was the price oracle — not the renaming

**Read this before you touch the chain layer again.** Swapping the names/defaults was the
easy, visible half. The half that actually decided whether the economy worked was
`server/src/metroPrice.ts`, and it was **silently broken by the switch**:

- It gated on `/^0x[a-fA-F0-9]{40}$/` in **two** places (`fetchMarketUsd`, and again in
  `getMetroUsdPrice` *before* the fetch was even reached — fixing only one does nothing).
  A base58 SPL mint failed both, so the oracle returned `null`.
- **`null` is indistinguishable from "not listed yet."** So it degraded to the `$1` reference
  multiplier and stayed there **forever**, with no error, no warning, nothing in `/health`.
  Every bridge rate is `marketUsd / REFERENCE_USD` — so $METRO could trade at $40 and the
  bridge would keep paying out as if it were $1.
- It also `.toLowerCase()`d the mint (**base58 is case-sensitive** — that corrupts the
  address; only EVM hex may be folded) and had no `solana` GeckoTerminal network slug.

Fixed and regression-tested in `server/src/metroPrice.test.ts` (7 tests, **confirmed to fail
against the old gate** — not just written to pass). `chainIdOf()` now returns `null` on SPL,
and `sameMint()` compares per-family.

**The generalisable lesson:** this file *looked* chain-agnostic from the outside. The
0x-shaped assumption was buried in a regex inside a function nobody would list as
"chain code". If you touch settlement again, re-run this sweep:

```sh
grep -rnE '0x\[0-9a-fA-F\]|0x\[a-fA-F0-9\]|startsWith\("0x"\)|\.toLowerCase\(\)' \
  --include="*.ts" src/ server/src/ | grep -iE "mint|addr|wallet|treasury|claim|sig|secret"
```

Everything else that hit that sweep **was audited and is correct** — don't re-litigate:
`auth.ts` is genuinely family-aware (EVM secp256k1 / `0x` vs Solana ed25519 / base58, and it
folds case *only* inside the EVM branch, preserving base58 at `auth.ts:124`);
`wallet.ts:110` `sessionKeyFor` folds only when the address matches the EVM regex;
`claim.ts:30` and `erc20Deposit.ts` / `evm.ts` are EVM-only paths reached solely via the
dormant force. `index.ts:233` folds both sides symmetrically and is only a consistency check
on a client-supplied `player` — `verifyWalletLogin`'s signature is what authenticates.

### What is already done (code + config + docs, verified)

- Defaults: `settlementForce()` returns `solana` in `src/economy/chainProfile.ts` and
  `server/src/settlementFamily.ts`. `wrangler.toml` ships `METRO_SETTLEMENT="solana"`,
  `METRO_CLUSTER="mainnet-beta"`, Solana `METRO_RPC`, and **no `METRO_CHAIN_ID`**.
- **Client and server now agree exactly**, including a strict guard: a mint of the *wrong*
  family resolves to `off` (credits-only) rather than silently settling on the other chain.
  Covered by `server/src/settlementFamily.test.ts` (10 tests).
- **Mainnet is the target but is NOT armed.** `pickSettlement` falls back to `sim` unless
  `METRO_MAINNET_ARMED=1`, so an unset `METRO_RPC` can never move real value. Keep that gate.
- UI flips off `preferSolanaWallet()` / `solPrimary`; `walletChoiceList()` /
  `walletChoiceProse()` in `src/economy/wallet.ts` are the single source for wallet-name copy.
- Docs/marketing swept. `marketing/copy/metro-launch-pack.md` L309 is a **style rule** —
  it now reads "chain reference is Solana (SPL); do not say Robinhood/ERC-20/pump.fun".

### Economy: unchanged, and verified unchanged

`src/game/economyPolicy.ts` is chain-agnostic and was **not** retuned. Verified live:
total supply **1,000,000,000**; dev seed **1% = 10,000,000 $METRO** in the treasury;
rates **100 ₵ in / 150 ₵ out**; min withdraw **300 ₵**; **no daily earn cap, no daily
withdraw cap** (`BASE_DAILY_*` are `0` = unlimited). Do not "restore" any daily cap.

The constants were never the risk — the **price oracle** was, and that is the one real bug
this work found and fixed. See the ⚠ section above before changing anything here.

### ✓ GitBook updated — GitSync branch is authoritative

The remote `docs/gitbook` branch already contains the restored Solana copy and current
100-in / 150-out, unlimited-daily policy (`6355cf1`). Pull before future edits because
GitBook sync remains bidirectional.

GitBook is GitSync-bound to `docs/gitbook`; do not edit the web UI. For future changes,
use a clean worktree and fast-forward before editing:

```sh
git checkout docs/gitbook && git pull --ff-only origin docs/gitbook
# …make the edits below…
git add gitbook/ && git commit && git push origin docs/gitbook   # GitSync publishes
git checkout feat/hf-environment-art        # don't leave the tree on the docs branch
```

Current live `/metro/pool` reports the Solana treasury configured and `readyForCa: true`.
The remaining bridge gates are external by design: mint CA, devnet rehearsal, and counsel
approval before `METRO_MAINNET_ARMED=1`. Never weaken those gates in code.

## 8. Housekeeping

- `.env.local` (gitignored) points the dev client at the live worker; `.claude/launch.json`
  gained a `metrophage-probe` config on port 5199, plus a `metrophage-chain` config on 5177.
  All additive. **Another chat session shares this repo and holds ports 5188/5199** — don't
  fight it; take a fresh port.
- Original art backed up in `tmp-art-backup/` (also git-tracked, so `git checkout` restores).
- ~~Nothing is committed to git~~ **Resolved 2026-07-16:** the full expansion (~960 files)
  is committed on `feat/hf-environment-art` and pushed; tag `deployed-20260716` marks the
  tree production was serving. Keep committing before large changes.
