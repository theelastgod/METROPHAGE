# METROPHAGE — continuation brief

You are picking up work on **METROPHAGE**, a top-down neon-noir cyberpunk action-RPG MMO
in the browser. Phaser 3 + Vite + TypeScript client; **server-authoritative** world on
Cloudflare (Worker + per-zone Durable Objects at 20Hz + D1).

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

Everything below is already **committed to the working tree and deployed live**.
309 tests pass (`npx vitest run`), both typechecks clean.

---

## 1. THE OPEN BUG — start here

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

Budget remaining: **~177 credits** (~1.1/asset). CLI: `higgsfield` (authenticated).
`tools/hf-sharpen-env.mjs <key>...` implements the pipeline; read its header.

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
for 11). `hf_building_den_c` generated as a sibling den.

**Queue, in blur-severity order** (only after §1 is fixed — sharper art still renders black):
district kits + `_b` + `_inf` (27, the ~5.4× offenders) → building kinds + variants (24) →
layout plates / env kits / estates / wild biomes (20) ≈ 78 credits. Then estate furniture
sprites (24) — footprints are already declared in the `FURNITURE` catalogue in `estates.ts`,
so they carry no collision risk.

---

## 5. Known-broken / worth fixing

- **`npm run smoke:panels` is RED and was red before any of this work** (verified by stashing
  everything and running on a clean tree — identical failure). `page.goto` times out waiting
  for `domcontentloaded` on a heavy boot. `tools/art-probe.mjs` shows `waitUntil: "commit"`
  works. This means `npm run verify:ship` cannot pass as-is.
- **Repeatable boss bounties are unbounded.** `bounties.ts` `marek_grudge` pays **₵900 for one
  boss kill**, no cooldown, 30s respawn, TTK 3–6s ⇒ **~₵80k/hr**, which reduces the new ₵60k
  estate to under an hour. The HVT path was explicitly hardened against farming
  (`world.ts`: "no farmable 25× loop"); this one wasn't.
- **`enemies.ts` `EnemyTierDef.credits` is dead** — the server uses its own `ENEMY_ARCHES`.
  Anyone tuning the economy there will see no effect.
- **Furniture placement is free.** `FurnitureKind.price` is commented "credits to place (a
  light sink)" but **no code path ever debits credits** — the server `furnish` handler
  validates and persists without touching `p.credits`. Any owner can instantly place 40 free
  pieces and take the maxed buff stack. Must be fixed server-side (diff draft vs saved), not
  in the client editor.
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

## 7. Housekeeping

- `.env.local` (gitignored) points the dev client at the live worker; `.claude/launch.json`
  gained a `metrophage-probe` config on port 5199. Both additive. **Another chat session
  shares this repo and holds port 5188** — don't fight it.
- Original art backed up in `tmp-art-backup/` (also git-tracked, so `git checkout` restores).
- Nothing is committed to git — the working tree holds ~31 changed files. **Commit before
  further large changes.**
