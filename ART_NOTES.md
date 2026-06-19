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
