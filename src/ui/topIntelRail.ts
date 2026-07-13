export interface TopIntelRailInput {
  viewW: number;
  top: number;
  screenPad: number;
  statusRight: number;
  statusBottom: number;
  laneGap: number;
  fallbackGap: number;
  minTopWidth: number;
  maxWidth: number;
}

export interface TopIntelRailGeometry {
  x: number;
  y: number;
  w: number;
  topLane: boolean;
}

/**
 * Reserve a fixed top lane to the right of status. Only genuinely cramped layouts
 * fall back below it; phone landscape is intentionally treated as a wide layout.
 */
export function topIntelRailGeometry(input: TopIntelRailInput): TopIntelRailGeometry {
  const topX = input.statusRight + input.laneGap;
  const topAvailable = input.viewW - input.screenPad - topX;
  const topLane = topAvailable >= input.minTopWidth;
  const x = topLane ? topX : input.screenPad;
  const y = topLane ? input.top : input.statusBottom + input.fallbackGap;
  const available = Math.max(0, input.viewW - input.screenPad - x);
  return { x, y, w: Math.min(available, input.maxWidth), topLane };
}
