# METROPHAGE — Art Notes (Phase 0)

This slice ships with **zero binary art**. Everything you see is generated at boot
as neon-lit primitives (`src/assets/textures.ts`). The structure below lets real
art replace placeholders **with no changes to gameplay/render code**.

## How art swapping works

1. Drop a file into `public/assets/<category>/` (served at `/assets/...`).
2. Point the matching entry's `file` at it in `src/assets/manifest.ts`:
   ```ts
   { key: "tileset", file: "assets/tilesets/city.png", frameWidth: 32, frameHeight: 32 }
   ```
3. That's it. `BootScene` loads any entry with a `file`; `generatePlaceholders()`
   only fills in entries still set to `file: null`. All code references the stable
   logical `key` (`"tileset"`, `"player"`, …), never a path.

## Categories

| Folder                    | Use                                              | View       |
| ------------------------- | ------------------------------------------------ | ---------- |
| `assets/tilesets/`        | Top-down district tiles (floor/wall/plaza/lane)  | top-down   |
| `assets/sprites/`         | Top-down characters, enemies, projectiles        | top-down   |
| `assets/portraits/`       | Dialogue-box portraits                            | bust/face  |
| `assets/ui/`              | HUD panels, skill frames, gun icons              | flat UI    |

## Tileset contract

The tileset is a horizontal strip of 32×32 tiles indexed to match the grid codes
in `src/world/district.ts`:

| Index | Tile   | Collides |
| ----- | ------ | -------- |
| 0     | floor  | no       |
| 1     | wall   | **yes**  |
| 2     | plaza  | no       |
| 3     | lane   | no       |

Keep this order (or update `district.ts` tile constants + `setCollision`).

## Asset-source rules (Phase 0)

- **Placeholders / world art:** original procedural primitives, or CC0 top-down
  packs (e.g. LimeZu modern/cyberpunk, Mana Seed character bases). Top-down only.
- **From the supplied asset folder:** only the **UI pieces** (HUD panels, skill
  frames, gun icons) are usable — they're perspective-neutral. The character
  sheets and backgrounds in it are **side-on** and must NOT be used for top-down
  gameplay. `Present_image2` is a **color/vibe reference only**.
- **No copyrighted assets, characters, logos, or music.** Original or CC0 only.

## `asset-drop/` packs — chroma-key slicing pipeline

Large AI-generated tile/object **atlases** land in `asset-drop/<CATEGORY>/` (gitignored
staging, like `art-source/`). They are flat **RGB with no alpha** — each object sits on a
solid painted background — so the alpha-based `atlas-slice.mjs` can't cut them. Two
sibling dev tools handle this (run with the project node, `~/.local/node/bin/node`):

- `tools/atlas-key-slice.mjs "<atlas>" <outDir> [minArea] [dilate] [keyTol]` — keys the
  background colour (sampled from the corners) to transparency, flood-fills the remaining
  pixels into connected components, exports each as a clean trimmed RGBA sprite. Use for
  objects on a plain background that are **well separated** (e.g. `DECORATIONS`).
- `tools/grid-key-slice.mjs "<atlas>" <outDir> <cols> <rows> [inset] [keyTol]` — cuts a
  regular grid, keys + trims each cell. Use when objects **touch** or sit on painted
  grid-lines so flood-fill would merge them (e.g. `INTERACTIVE OBJECTS`, `WALLS`, terrain).

Curate the montage (`asset-tool.mjs montage <dir> <out> <cols> <cell>`), then downscale
the picks to game scale into `public/assets/objects/` and wire keys in `manifest.ts`.

### What's integrated vs. held (and why)

| Drop category        | Decision | Notes |
| -------------------- | -------- | ----- |
| `DECORATIONS`        | **Integrated** → `deco_01…14` | Isometric crates/containers, keyed clean. Scattered as non-colliding **cargo decals** against city buildings (`CityScene.drawDecorations`) + replace the procedural interior crate (`spawnInteriorProp`). Keyed via `decals` in `manifest.ts`. |
| `INTERACTIVE OBJECTS`| **Integrated** → `obj_01…12` | File (2) is clean **isometric** machines (file 1 is messier front-view — not used). Curated 12 → building-interior set-dressing: `spawnInteriorProp` renders them for the `rack` / `locker` / `terminal` kinds (per-kind seed varies the shared pool; terminal keeps its interactive cyan glow). Keyed via `interior` in `manifest.ts`. |
| `WALLS`              | Held | Side-on facade units — the city renders buildings as **top-down roof tiles**, so side-on walls don't fit the gameplay view. |
| `GROUNDS` `FLOORS` `PATHS` `CORNERS` `EDGES` `ELEVATION` | **Integrated** → `tileset` (+ variants) | Real-art 8×4 tileset `public/assets/tilesets/metrophage_tiles.png` assembled by `tools/tileset-gen.mjs`, preserving the exact index→tile/collision contract (`src/world/district.ts`). Cells **0–17** are the canonical tiles; field tiles (floor/road/plaza/…) are centre-cropped uniform swatches from the kitbash `GROUNDS`/`PATHS`/`FLOORS` sheets, framed roof/wall tiles from `ELEVATION`/`CORNERS`/`EDGES`. Cells **18–31** hold same-surface **variants** of the most-repeated tiles. **Diversity pass:** `src/render/tileVariants.ts` `applyTileVariants(layer)` (called in all 5 tilemap scenes after `createLayer`, before `setCollision`) rewrites each tile's *render* index to a deterministic variant (`TILE_VARIANTS`/`variantOf` in district.ts) — render-only, so collision/gameplay still key off the canonical grid index. Roof-variant cells (25–29) are in `COLLIDING_TILES` so varied building tops still block; the 3 action scenes collide on `TILE_VARIANTS[TILE_WALL]`. **Crispness:** stored at **64px cells** (`config.TILESET_PX`) and sliced at that size by `addTilesetImage` in all 5 scenes; the world grid stays 32px so Phaser downscales each tile at render (sharper than pre-downscaling). **Revert to procedural** = `tilesets` entry `file=null` in `manifest.ts` **and** `TILESET_PX=32` (the procedural bake is 256×128/32px). |

> Licensing: asset-drop packs are the project owner's responsibility per their source terms.
> Only curated, processed sprites are committed (raw `asset-drop/` stays gitignored).

## UI assets integrated (from the user-supplied pack)

The perspective-neutral UI pieces from the supplied `PixelWhale_SF_Project` pack
are promoted into `public/assets/ui/` with clean names (raw pack staged, gitignored,
in `art-source/`). These are wired into the HUD/dialogue box at Step 7:

| File(s)                       | Use                                  |
| ----------------------------- | ------------------------------------ |
| `gun_01.png … gun_06.png`     | Weapon icons (HUD weapon slot)       |
| `skill_01.png … skill_08.png` | Skill/ability icons                  |
| `skill_frame.png`             | Skill slot frame                     |
| `ui_panel_01.png … _12.png`   | HUD panels / dialogue-box frames     |

`Ui_08` in the pack is a full HUD+dialogue mockup (hex avatar frame, diamond skill
row, banner-headed message box) — the layout reference for Step 7. The pack's
**side-on** character sheets, parallax backgrounds (`Background/`,
`background_tileset/`), `tilesets/`, and most `Object/` props are **NOT used** for
top-down gameplay. `image/Present_image2.png` = color/vibe reference only.

> Licensing: these UI assets come from the user-supplied pack; rights/licensing are
> the project owner's responsibility per that pack's terms.

## Audio

- **Required loop:** procedural darksynth via Web Audio API (Step 9) — no files.
- **Procedural SFX:** shoot / hit / kill / infect / meltdown one-shots, same
  Web Audio context (`src/audio/Synth.ts`).
- **VO stinger (ElevenLabs):** `public/assets/audio/meltdown_vo.mp3` is generated
  **at build time** by `tools/gen-vo.sh` (reads the key from gitignored `.env`; the
  key never ships to the browser). It plays on the meltdown and is fully optional —
  the procedural meltdown sting plays regardless, and the game runs fine if the mp3
  is absent (load is guarded). Re-generate with `bash tools/gen-vo.sh`.

### Environment music beds (ElevenLabs)

Each environment gets its own looping bed, crossfaded by the **MusicDirector**
(`src/audio/MusicDirector.ts`, one game-level instance created in `BootScene`). A bed
plays on top of the procedural SFX; the procedural *music* layer
(`Synth.setMusicEnabled`) is muted while a real bed plays and re-enabled as the
fallback when a bed is missing — so **there is always music** and adding a bed is a
zero-code upgrade.

| env                 | file (`src/assets/music/`) | where it plays                         |
| ------------------- | -------------------------- | -------------------------------------- |
| `menu`              | `menu.mp3`                 | title / customize / prologue           |
| `city`              | `city.mp3`                 | overworld hub (`CityScene`)            |
| `subway`            | `subway.mp3`               | inter-district transit (`SubwayScene`) |
| `dive`              | `dive.mp3`                 | ICE dive — cyberspace (`DiveScene`)    |
| `online`            | `online.mp3`               | multiplayer safehouse hub + interiors  |
| `district_downtown` | `downtown.mp3`             | Palantir Plaza (magenta, rain)         |
| `district_stacks`   | `stacks.mp3`               | Anduril Yards (yellow, smog)           |
| `district_spire`    | `spire.mp3`                | Argus Spire (cyan, surveillance)       |
| `district_core`     | `core.mp3`                 | The Kernel (red, embers, final)        |
| `meltdown`          | `meltdown.mp3`             | city-meltdown climax                    |

- **Online zones reuse beds:** in `OnlineScene`, district zones (`d0`–`d3`) play their
  matching `district_*` bed, the subway dungeon plays `subway`, and the safehouse hub +
  building interiors play `online`. So the multiplayer city sounds like its single-player
  counterpart, zone for zone.
- **Generate:** `npm run gen:music` (all missing beds) or `node tools/gen-music.mjs
  --force` (regenerate). Subset: `node tools/gen-music.mjs menu dive core`. Reads the
  key from `$ELEVENLABS_API_KEY` or gitignored `.env`; the key never ships to the
  browser. Prompts (one tuned per environment) live in `tools/gen-music.mjs`.
- **Detection:** beds live in `src/assets/music/` (not `public/`) so `import.meta.glob`
  in `src/audio/musicTracks.ts` resolves the URL of every bed that **actually exists** —
  missing beds simply aren't referenced (no 404 / mis-decode), and each falls back to
  the procedural Synth. Drop a generated mp3 in and reload; it auto-registers.
- **Mix:** per-bed `gain` in `musicTracks.ts`, then scaled live by the master + music
  sliders (Options menu) and ducked under dialogue / the meltdown VO.
- **No copyrighted music** — these are AI-generated originals (see line 49).

## Higgsfield generation pipeline (presentation art)

Presentation-layer art (key art, menu backdrop, dialogue portraits, class cards) is
AI-generated via Higgsfield (nano-banana-pro, 4K) and rebuilt for shipping by
`tools/higgsfield-art-build.mjs` from raw generations staged in `art-source/higgsfield/`
(gitignored, like the other art-source inputs). Regenerate → re-drop → re-run the tool.

| Raw input                  | Shipped output | Used by |
| -------------------------- | -------------- | ------- |
| `keyart_title.png` (16:9)  | `public/og.png` + `landing/og.png` (1200×630) | social cards (`index.html` + landing og meta) |
| `menu_bg.png` (16:9, textless) | `public/assets/ui/menu_bg.jpg` + `landing/hero.jpg` | `drawMenuBackdrop` (menuChrome) · landing `.cityart` |
| `sheet_cast.png` (4×3 grid)| `portraits/cast_sheet.jpg` + `painted_fixer/player.jpg` | named story cast (frame map in `src/game/portraits.ts`) |
| `sheet_keepers.png`        | `portraits/keepers_sheet.jpg` | venue keepers (`keep_*` + porter). Raw sheet has baked-in labels — the tool's deeper top inset crops them. |
| `sheet_residents.png`      | `portraits/residents_sheet.jpg` | drawn residents 1:1 + hash fallback for everyone else (sex-matched pools) |
| `sheet_classes.png` (2×2)  | `ui/classart_{id}.jpg` | SelectScene class cards (card-aspect crop + in-scene legibility gradient) |

Portrait sheets ship as **12-frame 256px spritesheets** (row-major). `portraitFor(id, sex)`
resolves any NPC id to a stable `{key, frame}`; the OnlineScene speech bubble docks the
painted bust chip beside the text, and the legacy SP DialogueBox keys off the same sheets.
Grid slicing cuts on exact grid fractions with a safety inset — nano-banana's gutters are
regular enough that no gutter detection is needed.

## Higgsfield HUD / UI kit + prop sprites (desktop + mobile)

Second Higgsfield pass (4 × nano-banana-pro 2K sheets, ~8 credits) for in-game HUD chrome
and world props. Rebuild with:

```sh
node tools/higgsfield-hud-build.mjs
```

| Raw input | Shipped | Used by |
| --------- | ------- | ------- |
| `sheet_hud_chrome.png` (3×3) | `ui/hud_panel.png`, `skill_frame.png`, `btn_ring.png` | OnlineScene status/tracker NineSlice panels; hotbar frames; mobile action rings |
| `sheet_ability_icons.png` | `ui/ability_*.png` ×8 | MobileControls Q/E/R/dash/ATK icons |
| `sheet_weapon_icons.png` | `ui/gun_hf_01…06.png` (+ `gun_01.png`) | HUD weapon slot (`UI_GUN_KEY`) |
| `sheet_props.png` | `objects/hf_prop_01…12.png` | `propScatter` street density pool |

`manifest.ts` points `UI_FRAME_KEY` / `UI_GUN_KEY` / `UI_PANEL_KEY` / `UI_BTN_RING_KEY` at real
files; procedural bakers in `textures.ts` only fill keys still missing after load. The
painted HUD panel is applied via `ensureHudPanelImage` (Phaser NineSlice) so desktop wide
panels and compact mobile sizes share one art source without stretch artifacts. Mobile
action pads tint the circular ring + ability icons for thumb readability.

## Higgsfield expand pack (bosses / interact NPCs / district+infected / icons / audio)

Third pass — drop raw sheets into `art-source/higgsfield/`, audio into
`art-source/higgsfield/audio/`, then:

```sh
node tools/higgsfield-expand-build.mjs
```

| Raw input | Shipped | Used by |
| --------- | ------- | ------- |
| `sheet_bosses.png` (3×3) | `portraits/bosses_sheet.jpg` + `portraits/bosses/*.jpg` | Boss title-card splash (`portraitForBoss`) |
| `sheet_npc_interact.png` (4×3) | `portraits/interact_sheet.jpg` + `portraits/interact/*.jpg` | npcServices cast dialogue faces |
| `sheet_buildings_district.png` (3×2) | `objects/hf_building_dist_*.png` | District combat façades (NEON CORE / SPRAWL / UNDERCITY / …) |
| `sheet_buildings_infected.png` (3×2) | `objects/hf_building_inf_*.png` | High-contagion / undercity damaged exteriors |
| `sheet_icons_expand.png` (4×4) | `ui/ability_hf_*`, `loot_*`, `crest_*` | Ability icons (promoted over older keys), loot, faction crests |
| `audio/sfx_*.wav` | `public/assets/sfx/` | `SfxBank` sample overrides (hit/cast/heat/pickup/ui/core/dash/ult) |
| `audio/amb_*.wav` | `src/assets/music/` + `public/assets/music/` | District ambient beds (`musicTracks` amb_neon_core / sprawl / undercity) |
| `audio/stinger_boss.wav` | music + stinger key | Boss intro sting in OnlineScene |

**Soul Character:** train with `higgsfield soul-id create --name METRO_FIXER --soul-2 --image …`
using refs in `art-source/higgsfield/soul_fixer/` (cast crops). Requires credits; use
`--soul-id` with `text2image_soul_v2` for identity-consistent promo art.
