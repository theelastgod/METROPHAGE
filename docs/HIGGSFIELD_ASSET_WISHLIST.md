# Higgsfield asset wishlist — METROPHAGE (expansive / ideal-world)

Style bible: **top-down orthographic neon-noir cyberpunk**, pure black `#000` background for keying, cyan / magenta / amber / violet accents. Readable silhouette at 32–160px game size.

Generator: `node tools/higgsfield-wishlist-gen.mjs`  
Wire-in: `src/assets/manifest.ts`, `src/render/wishlistArt.ts`, `propScatter.ts`, `buildingFacades.ts`, `world/subway.ts`, `world/city.ts` interiors, `OnlineScene`.

**Multivariants:** every structural asset should ship as `_a` (primary), `_b`, `_c` (slight material / damage / neon color shifts) so districts and rooms never look copy-pasted.

---

## Priority order (generate in this order)

### P0 — Play-visible structure (ship first)

| # | Bucket | Why |
|---|--------|-----|
| 1 | **Subway enter zones** — station apron, ticket hall, escalator mouth, platform plate variants | Player drops into UNDERLINE constantly; geometry must match art |
| 2 | **Landmark hub buildings** multivariants (bar/clinic/shop/guild/subway/stadium/citycenter) | Hub identity + no clone blocks |
| 3 | **District exterior kits** multivariants (core/stacks/spire/docks/under/relay/wastes/kernel/sprawl) | Each campaign district reads unique |
| 4 | **Venue interiors by kind** — bar / clinic / shop / guild / den / home room anchors + furniture variants | Every enterable building should feel authored |
| 5 | **Wilderness corridor props** — bridge, rust, ash, salt | Bridge zones between districts |
| 6 | **ICE vault / dungeon** — core pedestal, guardian nest, ice crystal, server rack | Dive interiors |

### P1 — District identity depth

| # | Bucket |
|---|--------|
| 7 | 4 signature street props **per** district (2 already exist; add 2 more + infected) |
| 8 | Contagion-damaged façades for spire / wastes / relay |
| 9 | District-tinted interior wall trim / floor decal plates |
| 10 | Estate house exteriors (3 variants) + backyard props |

### P2 — Atmosphere & systems polish

| # | Bucket |
|---|--------|
| 11 | Weather plates (ash, salt snow, ember, static rain sheet) |
| 12 | Combat VFX tokens (dash afterimage, bullet spark, infection fog edge) |
| 13 | Economy medallions ($METRO earn/burn/empty pool) |
| 14 | Minimap glyphs + faction crest plates |
| 15 | Full 4-facing combat sheets for subway monsters (replace scenic dens) |
| 16 | Ambient civilian sheets (8 district looks) |

### P3 — Nice-to-have / marketing adjacent

| # | Bucket |
|---|--------|
| 17 | Boss arena floor plates per district |
| 18 | Seasonal / event skins |
| 19 | Cinematic key-art stills (not in-game sprites) |

---

## Ideal-world catalogue (by location type)

### A. Locations — THE UNDERLINE (subway dungeon)

| ID pattern | Variants | Notes |
|---|---|---|
| `hf_subway_platform_{hub,mid,deep}` | `_b` `_c` | Center of station carve |
| `hf_subway_ticket_hall` | `_b` | North of platform; booth lives here |
| `hf_subway_escalator_mouth` | `_b` | Exit shaft / surface link |
| `hf_subway_apron` | `_b` | Floor plate under platform art |
| `hf_subway_track_bay` | `_b` | Dead train sits on this |
| `hf_subway_tunnel_{straight,junction,cross}` | `_b` | Corridor decals |
| `hf_subway_booth` / `exit` / `signal` / `gore` | `_b` | Furniture-scale |
| `hf_subway_train_dead` | `_b` `_c` | Scenic wrecks |
| `hf_subway_ghost_train` | — | Ambient |
| Enemy dens | `_b` | Scenic only until combat sheets |

### B. Buildings — hub landmarks + district kits

| Kind | Primary | Variants | Infected |
|---|---|---|---|
| bar, clinic, shop, guild, hotel, home, den, subway, stadium, citycenter | `hf_building_*` | `_b` `_c` | `hf_building_inf_*` |
| District kits | `hf_building_dist_{core,sprawl,undercity,docks,helios,stacks,spire,wastes,relay}` | `_b` `_c` | optional |
| Estate homes | `hf_building_estate_{a,b,c}` | — | — |

### C. Building interiors (structure + furniture)

| Venue | Structural anchors | Furniture pack |
|---|---|---|
| **Bar** | counter L, stage, booth cluster | stools, bottles, neon lamp × variants |
| **Clinic** | ward beds row, med counter | beds, cabinets, plant |
| **Shop** | shelf aisles, register island | shelves, crates, terminal |
| **Guild** | war table center, rack wall | war table, lockers, board |
| **Den** | crate nest, terminal desk | crates, terminals, sofa |
| **Home / hotel** | bed + rug + living | sofa, plant, lamp, bed |
| **Hospital** | multi-bed ward | beds, cross, cabinet |
| **Subway interior** (surface station room) | turnstile row, bench, track strip | matches UNDERLINE palette |
| **Stadium lobby** | barrier ring, scoreboard | crucible plate, banners |
| **Citycenter lobby** | fountain pad, directory | fountain, benches |

### D. Wilderness (bridges `wN`)

| Asset | Role |
|---|---|
| `hf_wild_bridge_span` | Mid-bridge structure |
| `hf_wild_guardrail` | Edge prop |
| `hf_wild_ash_pile` / `salt_crust` / `rust_car` | Floor clutter |
| `hf_wild_sign_post` | Zone flavor |
| `hf_wild_relay_pylon` | Data-bridge accent |

### E. Dungeon / ICE vault (`vN`)

| Asset | Role |
|---|---|
| `hf_dungeon_core_pedestal` | Objective |
| `hf_dungeon_ice_crystal` | Hazard décor |
| `hf_dungeon_server_rack` | Side rooms |
| `hf_dungeon_guardian_nest` | Spawn flavor |
| `hf_dungeon_cable_curtain` | Corridor dress |
| `hf_dungeon_floor_hex` | Floor decal |

### F. District street language (each district)

Existing 2 props + add:

| District | Extra props (ideal) |
|---|---|
| Plaza / d0 | confiscation booth, holo ticket tower |
| Stacks / d1 | conveyor stub, hazmat locker |
| Spire / d2 | valet pad, glass canopy |
| Docks / d3 | crane base, fish market stall |
| Undercity / d4 | shrine candle ring, flooded stair |
| Relay / d5 | uplink dish, toll gate |
| Wastes / d6 | rad barrel stack, junk throne |
| Kernel / d7 | black ice pillar, freeze field plate |

### G. Hub plaza

| Asset | Role |
|---|---|
| fountain, crucible, subway kiosk | already shipped |
| `hf_landmark_civic_spire_pad` | under citycenter |
| `hf_hub_bench` / `planter` variants | plaza furniture |

---

## Holistic tier — identity gaps (2026-07-14)

A full survey of every static environment against the shipped keys found gaps the
catalogue above never had *keys* for — zones that render, but borrow another zone's art or
run pure-procedural. These are ranked by how many player-visible surfaces they fix.

**Cost reality:** MCP/CLI generation bills credits at **~1.1 credits/asset** (`low`) to
**~2** (`medium`). The Higgsfield "365-day / 7-day UNLIMITED" nano-banana offer is
**web-only and purchase-gated** (`Buy until: July 14`) — it does **not** make
`higgsfield-wishlist-gen.mjs` free. Budget batches against real credits.

| # | Bucket | Gap it closes | Assets |
|---|--------|---------------|--------|
| H1 | **Env-identity kits** | `market`, `park`, `corporate`, `arcology` aliased to core/sprawl/docks; `kernel` shared `downtown`'s kit, so THE KERNEL looked like PALANTIR PLAZA | 5 |
| H2 | **`hf_int_citycenter_room`** | `FURN_BY_KIND` had a citycenter set but `INT_ROOM` had no plate — the CIVIC SPIRE lobby had furniture on a bare floor | 1 |
| H3 | **THE ESTATES** | Zone had **no `hf_` namespace at all** — 20 plot facades + home interiors were pure `Graphics` | 4 |
| H4 | **Per-biome wilderness plates** | All 7 `WildernessBiome`s shared one `hf_wild_bridge_span` | 7 |

**Not generated — no call site.** Safehouse and tutorial plates were scoped, then cut:
there is no literal `safehouse` zone (`isSafehouseSizedInterior` covers
clinic/bar/den/shop/vault, which already have plates) and the tutorial zone renders as a
district-like world, not a room. Both keys would have been dead. Add the art only if a
real room-shaped zone appears for them.

## Contagion set (2026-07-14) — 19 assets

Infected façades are **live gameplay**, not decoration: `OnlineScene` flips them on for
`undercity`, `wastes`, or any district at `contagion >= 14`. Two bugs made an outbreak
read wrong, both now fixed.

**1. The infected art was isometric.** The original 6 `hf_building_inf_*` were sliced from
one generic **isometric** 6-cell sheet (`art-source/higgsfield/sheet_buildings_infected.png`,
via `higgsfield-expand-build.mjs`) while the whole world is top-down — and the cells were
mapped to kinds arbitrarily, so `hf_building_inf_home` was a *power plant*. At
contagion ≥14 a top-down home visibly became an isometric factory. All 6 regenerated
per-kind, top-down, plus `hotel` / `subway` / `stadium` / `citycenter`, which had no
infected art at all and stayed pristine mid-outbreak.

> **Rule: infected art swaps in for the clean sprite on the same footprint, so it must
> share that sprite's projection AND subject.** Never slice a generic sheet across kinds.

**2. Scenery blocks never went infected.** `BUILDING_INFECTED` is keyed by *kind*, but
scenery renders from the **district kit** — which had no diseased variant, so most of an
outbreak district stayed clean. Added `hf_building_dist_{slug}_inf` for all 9 kits.

Worse, scenery is passed `kind = venueKind ?? "home"`, so the old kind-first branch
returned `hf_building_inf_home` for *every* infected scenery block — a house façade
stamped across the district, violating the file's own "scenery = district kit only" rule.
Selection now branches on `preferDistrictKit`: scenery resolves kit-only (falling through
to the **clean** kit rather than a wrong subject), venues resolve kind-first then kit.

That precedence is load-bearing and fails silently, so it moved out of Phaser into
`src/render/buildingSprites.ts` — pure tables + `selectBuildingSprite(exists, kind, opts)`,
covered by `buildingSprites.test.ts` (10 tests). `buildingFacades.ts` is now a thin
Phaser adapter over it.

```sh
bun tools/higgsfield-wishlist-gen.mjs --only contagion   # 19 assets, ~38 credits
```

### Wiring shipped with this tier

- `DIST_KIT` is now a **preference chain** (`string | string[]`): a zone's own kit first,
  its historically-borrowed kit second. A zone whose dedicated kit is not generated yet
  keeps showing district art instead of regressing to a procedural facade.
- `INT_ROOM` gained `citycenter`, `estate`, `safehouse`, `tutorial`.
- `HF_ENV_KIT_KEYS` / `HF_ESTATE_KEYS` / `HF_WILD_BIOME_KEYS` registered in `manifest.ts`.

### Pipeline fix — room plates

`keyBlack` keyed *every* near-black pixel, punching holes through room plates whose floor
is legitimately dark (bar plate measured **5.5% interior holes**). Room plates now use
`kind: "plate"` → `keyBorderBlack`, a border flood-fill that only keys black **connected to
the edge**. Bar 5.5%→3.0%, clinic 6.0%→**0.1%**. Re-keying is free (`--process` reuses
cached raws), so pipeline changes cost nothing to re-apply.

```sh
bun tools/higgsfield-wishlist-gen.mjs --only holistic       # H1–H5
bun tools/higgsfield-wishlist-gen.mjs --ids a,b,c           # explicit, value-ordered
bun tools/higgsfield-wishlist-gen.mjs --process --ids a,b   # re-key, 0 credits
```

> `node` is not on PATH in this environment; use `bun` (sharp works under it).

---

## Generation batches

| Batch | Tag | Est. credits (low prop / med building) |
|---|---|---|
| **P0a** subway structure + variants | `expanse` | ~25–40 |
| **P0b** building multivariants | `expanse` | ~40–60 |
| **P0c** interior anchors + furn variants | `expanse` | ~30–45 |
| **P0d** wilderness + dungeon | `expanse` | ~20–30 |
| **P1** district extras | `expanse` | ~20–40 |

```sh
node tools/higgsfield-wishlist-gen.mjs --only expanse   # new ideal-world batch
node tools/higgsfield-wishlist-gen.mjs --process        # re-key only
node tools/higgsfield-wishlist-gen.mjs --dry            # list jobs
```

---

## Wire + world wrap checklist

- [x] Prior priority wishlist generated (58 assets, 2026-07-15)
- [x] Expansive priority catalogue (this doc) + P0–P3 order
- [x] Expanse jobs in `tools/higgsfield-wishlist-gen.mjs` (`--only expanse`, ~84 assets)
- [x] P0 expanse generate + process *(resume with same command — skips existing raw)*
- [x] Manifest keys for all new IDs + variants (`pickHfVariant`)
- [x] Holistic tier H1–H5 authored (`--only holistic`, 19 assets) + wired
- [x] Building facades hash-pick multivariants per footprint
- [x] Subway station tile carve sized to platform + ticket hall + exit + track bay
- [x] `buildInterior` room shapes per kind (bar L-counter, clinic ward, subway turnstile, …)
- [x] Venue + hub interiors dressed with HF room plates + furn packs
- [x] Wilderness / dive HF dressers wired from OnlineScene

### Resume generation

```sh
# Continues where left off (skips raw files already present)
node tools/higgsfield-wishlist-gen.mjs --only expanse

# If only processing needed after gen
node tools/higgsfield-wishlist-gen.mjs --only expanse --process
```

### Coverage truth (2026-07-14)

The wiring landed ahead of the art: **142 jobs declared, 69 had no PNG on disk** — the
world booted with holes where code already expected art. `BootScene` swallows the 404s and
every dresser gates on `scene.textures.exists`, so this degraded silently rather than
crashing, which is why it went unnoticed. Worst-hit before this pass:

| Environment | Was |
|---|---|
| Interior room plates | **0/9** — every venue entry had a bare floor |
| Wilderness / bridges | **0/8** — 7 biomes, no HF art |
| ICE vault / dungeon | **0/7** — core loop fully procedural |
| Hub plaza furniture | 0/4 — the bench/planter ring rendered nothing |
| Building `_b`/`_c` variants | 0/22 — every bar on the map was the same bar |
| District signature clutter | 16/24 — one prop missing per theme |

**Verify coverage before trusting a checkbox:**

```sh
bun tools/higgsfield-wishlist-gen.mjs --dry | grep '→' \
  | sed -E 's/^[a-z]+ [^ ]+ → //' \
  | while read -r p; do [ -f "public/assets/$p" ] || echo "MISSING $p"; done
```

*Last updated: 2026-07-14 — holistic tier + gap batch generated; keying fixed for plates*
