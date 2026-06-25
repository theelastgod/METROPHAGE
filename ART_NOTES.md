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
