// METROPHAGE — graphics-quality tier → backing-buffer resolution.
// Client-only (reads Settings, which reads localStorage/navigator); kept out of
// config.ts so the shared constants stay importable by the Workers server.

import { setRenderResolution } from "../config";
import { effectiveGraphicsQuality } from "../systems/Settings";

const TIER_RESOLUTION: Record<"low" | "medium" | "high", { w: number; h: number }> = {
  low: { w: 1280, h: 720 },
  medium: { w: 1920, h: 1080 },
  high: { w: 2560, h: 1440 },
};

/** Apply graphics-quality tier to the backing buffer before Phaser.Game init. */
export function applyRenderTier(): void {
  const { w, h } = TIER_RESOLUTION[effectiveGraphicsQuality()];
  setRenderResolution(w, h);
}

// Run at import time: several UI modules capture uiDim()-derived constants at module
// scope (e.g. hotbar cell sizes, menu pads), and module bodies evaluate before any code
// in main.ts. Importing this module first in main.ts guarantees the backing resolution
// is final before those constants are computed — otherwise every non-high tier renders
// its chrome at 2560×1440 sizes inside a smaller buffer.
applyRenderTier();
