import Phaser from "phaser";
import type { TerrainProfile } from "./terrainLayer";

const hash = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
};

const numberedKey = (prefix: string, index: number) =>
  `${prefix}_${String((index % 16) + 1).padStart(2, "0")}`;

export interface GeneratedGroundOpts {
  profile: TerrainProfile;
  zone: string;
  worldW: number;
  worldH: number;
  districtId?: string;
  infected?: boolean;
  citySpawn?: { x: number; y: number };
  /** Art-traced rooms already contain their own complete floor plate. */
  artRoom?: boolean;
}

/**
 * Paint low-alpha generated ground identity without touching the authoritative tile grid.
 * The tilemap remains visible and owns every collision decision; these are visual skins.
 */
export function paintGeneratedGroundArt(scene: Phaser.Scene, opts: GeneratedGroundOpts): void {
  const seed = hash(opts.zone);
  const addRepeat = (key: string, alpha: number) => {
    if (!scene.textures.exists(key)) return;
    scene.add.tileSprite(opts.worldW / 2, opts.worldH / 2, opts.worldW, opts.worldH, key)
      .setDepth(0.12)
      .setAlpha(alpha);
  };

  if (opts.profile === "city") {
    addRepeat(numberedKey("hf_ground_city_tile", seed), 0.2);
    // The old full-screen spawn plate painted a magenta quadrant over the civic
    // square and fought the authoritative paving. The compact plaza now gets its
    // identity from its clean tile bands and physical fountain/street furniture.
    return;
  }

  if (opts.profile === "district" && opts.districtId) {
    addRepeat(`hf_ground_${opts.districtId}`, 0.3);
    // Contagion/recovery art changes the same geometry over time without desyncing it.
    const phaseOffset = opts.infected ? 8 : 0;
    addRepeat(numberedKey("hf_ground_progress_tile", seed + phaseOffset), opts.infected ? 0.18 : 0.08);
    return;
  }

  if (opts.profile === "subway" || opts.profile === "dungeon") {
    addRepeat(numberedKey("hf_ground_subway_tile", seed), 0.22);
    return;
  }

  if (opts.profile === "wilderness") {
    addRepeat(numberedKey("hf_ground_wilderness_tile", seed), 0.26);
    return;
  }

  if (opts.profile === "interior" && !opts.artRoom) {
    addRepeat(numberedKey("hf_ground_interior_tile", seed), 0.2);
  }
}
