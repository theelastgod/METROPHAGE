// METROPHAGE — THE UNDERLINE: underground transit dungeon mirroring the surface map.
//
// Design:
//  • Stations sit on a 2D graph (not a linear west→east spine) matching campaign
//    districts + wilderness bridges in different directions from METRO CITY.
//  • Tunnels branch N/S/E/W so travel feels like exploring a metro map, not a hallway.
//  • Drop in at the station matching where you entered; exits organic-unlock zones.
//  • Threat follows the campaign spine: tunnels toward higher districts (dN) are
//    harder — rookies stay near HUB / d0; veterans push wastes/kernel lines.
// Pure data — shared by client render + server sim (zone "subway").

import { TILE, PLAYER } from "../config";
import { DISTRICTS } from "../game/districts";
import { BRIDGES } from "../game/bridges";
import {
  campaignThreatForZone,
  subwayScaleFromThreat,
  subwayTierFromCampaignThreat,
  tunnelCampaignThreat,
} from "../game/progression";
import { TILE_INNER_FLOOR, TILE_INNER_WALL, TILE_CROSSWALK, isWall, type TileGrid } from "./district";
import { resolveOpenSpawn } from "../net/sim";

/** Target seconds of continuous walking hub → deepest leaf along the longest path. */
export const SUBWAY_END_TO_END_SEC = 90;

/** Approximate tile length of the longest path (for threat / tests). */
export const SUBWAY_SPINE_TILES = Math.round((PLAYER.speed * SUBWAY_END_TO_END_SEC) / TILE);

const PAD = 18;
const CORRIDOR_HALF = 2;
/** Platform half-height — sized so HF platform/apron (~160px) + ticket hall/exit fit walkably. */
const STATION_HALF = 6;
/** North ticket-hall offset (tiles from station center). */
const TICKET_HALL_DY = 10;
/** South escalator/exit offset. */
const EXIT_DY = 10;
/** East track-bay offset for dead-train placement. */
const TRACK_BAY_DX = 9;

/** Art module placed on subway geometry. Pure data: both server collision and client
 * rendering consume these descriptors, so a tunnel plate can never float over rock. */
export interface SubwayArtModule {
  id: string;
  key: "hf_subway_tunnel_straight" | "hf_subway_tunnel_junction" | "hf_subway_tunnel_cross";
  tx: number;
  ty: number;
  /** Walkable footprint in tiles, centered on tx/ty. */
  w: number;
  h: number;
  /** Quarter turns clockwise; renderer converts this to radians. */
  quarterTurns: 0 | 1 | 2 | 3;
}

export interface SubwayStation {
  id: string;
  zone: string;
  label: string;
  short: string;
  accent: number;
  /** Tile x of station center. */
  tx: number;
  /** Tile y of station center. */
  ty: number;
  /** Graph distance from hub (layout / pathing). */
  depth: number;
  /**
   * Campaign combat rung 0..7 — drives garrison power (plaza soft → kernel hard).
   * Independent of pure geometry so a short tunnel to d7 is still deadly.
   */
  campaignThreat: number;
  major: boolean;
}

/**
 * Surface-inspired layout in abstract grid cells (not linear W→E).
 * Cell size in tiles; stations land at cell centers after PAD.
 *
 *            SPIRE(d2)
 *               |
 *  STACKS(d1)— HUB — PLAZA(d0) — DOCKS(d3)
 *               |  \              |
 *         UNDERCITY  RELAY(d5)   |
 *            (d4)      \         |
 *                       WASTES(d6)— KERNEL(d7)
 *
 * Bridges sit between their flanking districts.
 */
function layoutStations(): SubwayStation[] {
  // Cell pitch: large enough that longest path ≈ SUBWAY_SPINE_TILES
  const CELL = Math.max(22, Math.round(SUBWAY_SPINE_TILES / 7));

  type Node = {
    zone: string;
    label: string;
    short: string;
    accent: number;
    major: boolean;
    cx: number;
    cy: number;
  };

  const hub: Node = {
    zone: "safe",
    label: "METRO CITY · HUB",
    short: "HUB",
    accent: 0x39ff88,
    major: true,
    cx: 0,
    cy: 0,
  };

  // District cells relative to hub (map directions)
  const distPos: Array<{ i: number; cx: number; cy: number }> = [
    { i: 0, cx: 2, cy: 0 }, // PLAZA — east of hub
    { i: 1, cx: -2, cy: 0 }, // STACKS — west
    { i: 2, cx: 0, cy: -2 }, // SPIRE — north
    { i: 3, cx: 4, cy: 0 }, // DOCKS — far east
    { i: 4, cx: -1, cy: 2 }, // UNDERCITY — southwest
    { i: 5, cx: 2, cy: 2 }, // RELAY — southeast
    { i: 6, cx: 3, cy: 3 }, // WASTES — deep SE
    { i: 7, cx: 5, cy: 3 }, // KERNEL — far SE tip
  ];

  const nodes: Node[] = [hub];
  for (const p of distPos) {
    const d = DISTRICTS[p.i];
    if (!d) continue;
    nodes.push({
      zone: `d${p.i}`,
      label: d.name.toUpperCase(),
      short: `D${p.i}`,
      accent: d.accent,
      major: true,
      cx: p.cx,
      cy: p.cy,
    });
  }

  // Bridges — midpoints between consecutive campaign districts when coords known
  for (let i = 0; i < BRIDGES.length; i++) {
    const b = BRIDGES[i];
    const a = distPos.find((p) => p.i === i);
    const c = distPos.find((p) => p.i === i + 1);
    const cx = a && c ? (a.cx + c.cx) / 2 : i + 0.5;
    const cy = a && c ? (a.cy + c.cy) / 2 + (i % 2 === 0 ? 0.6 : -0.6) : 1;
    nodes.push({
      zone: b.id,
      label: b.name.toUpperCase(),
      short: b.id.toUpperCase(),
      accent: b.accent,
      major: false,
      cx,
      cy,
    });
  }

  // Normalize to positive tile coords
  let minX = Infinity;
  let minY = Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.cx);
    minY = Math.min(minY, n.cy);
  }

  // Graph depth from hub (layout) + campaign threat for combat scaling
  const hubNode = nodes[0];
  return nodes.map((n) => {
    const depth = Math.round(Math.hypot(n.cx - hubNode.cx, n.cy - hubNode.cy) * 1.4);
    return {
      id: n.zone,
      zone: n.zone,
      label: n.label,
      short: n.short,
      accent: n.accent,
      tx: PAD + Math.round((n.cx - minX) * CELL) + 6,
      ty: PAD + Math.round((n.cy - minY) * CELL) + 6,
      depth,
      campaignThreat: campaignThreatForZone(n.zone),
      major: n.major,
    };
  });
}

export const SUBWAY_STATIONS: SubwayStation[] = layoutStations();

function boundsFromStations() {
  let maxX = 0;
  let maxY = 0;
  for (const s of SUBWAY_STATIONS) {
    maxX = Math.max(maxX, s.tx);
    maxY = Math.max(maxY, s.ty);
  }
  return {
    w: maxX + PAD + 14,
    h: maxY + PAD + 14,
  };
}

const _bounds = boundsFromStations();
export const SUBWAY_W = _bounds.w;
export const SUBWAY_H = _bounds.h;
/** Hub station Y — used by older callers; prefer station.ty. */
export const SUBWAY_MID_Y = SUBWAY_STATIONS.find((s) => s.zone === "safe")?.ty ?? Math.floor(SUBWAY_H / 2);

/**
 * Threat tier for garrison kinds / dressing.
 * Argument is **campaign threat** (0..7+) — subwayEnemyPosts stores that in `depth`.
 * For stations, prefer {@link subwayStationTier}.
 */
export function subwayThreatTier(campaignThreat: number): 0 | 1 | 2 | 3 {
  return subwayTierFromCampaignThreat(campaignThreat);
}

/** Tier from a station's campaign rung (surface district order). */
export function subwayStationTier(st: SubwayStation): 0 | 1 | 2 | 3 {
  return subwayTierFromCampaignThreat(st.campaignThreat ?? campaignThreatForZone(st.zone));
}

export const SUBWAY_TIER_KINDS: Record<0 | 1 | 2 | 3, number[]> = {
  // Soft hub/plaza lines — teach movement, almost no elites
  0: [0, 0, 1, 0, 0],
  // Mid campaign (stacks→docks)
  1: [0, 2, 1, 3, 0, 1],
  // Deep mid (undercity→relay)
  2: [2, 3, 4, 5, 3, 4],
  // Kernel lines — full bestiary
  3: [4, 5, 6, 4, 6, 5, 6],
};

export { subwayScaleFromThreat, tunnelCampaignThreat, campaignThreatForZone };

export function subwayStationByZone(zone: string | null | undefined): SubwayStation {
  if (!zone) return SUBWAY_STATIONS[0];
  const hit = SUBWAY_STATIONS.find((s) => s.zone === zone || s.id === zone);
  if (hit) return hit;
  const dm = /^d(\d+)/.exec(zone);
  if (dm) {
    const id = `d${dm[1]}`;
    return SUBWAY_STATIONS.find((s) => s.zone === id) ?? SUBWAY_STATIONS[0];
  }
  const wm = /^w(\d+)/.exec(zone);
  if (wm) {
    const id = `w${wm[1]}`;
    return SUBWAY_STATIONS.find((s) => s.zone === id) ?? SUBWAY_STATIONS[0];
  }
  if (zone === "estates" || zone === "clinic" || zone === "shop" || zone === "bar" || zone === "den" || zone === "vault") {
    return SUBWAY_STATIONS[0];
  }
  return SUBWAY_STATIONS[0];
}

export function subwaySpawnForEntry(from?: string | null): { x: number; y: number } {
  const st = subwayStationByZone(from);
  return {
    x: st.tx * TILE + TILE / 2,
    y: st.ty * TILE + TILE / 2,
  };
}

export const SUBWAY_SPAWN = subwaySpawnForEntry("safe");

function carveRect(g: TileGrid, x0: number, y0: number, x1: number, y1: number, tile: number) {
  const h = g.length;
  const w = g[0]?.length ?? 0;
  for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
      g[y][x] = tile;
    }
  }
}

function tunnelPolyline(ax: number, ay: number, bx: number, by: number): Array<[number, number]> {
  const midX = Math.round((ax + bx) / 2);
  const midY = Math.round((ay + by) / 2);
  const jog = ((ax + ay + bx + by) & 1) === 0 ? 3 : -3;
  return [
    [ax, ay],
    [midX, ay],
    [midX, midY + jog],
    [midX, by],
    [bx, by],
  ];
}

/** Orthogonal tunnel with slight mid-offset so routes aren't dead-straight. */
function carveTunnel(g: TileGrid, ax: number, ay: number, bx: number, by: number, half = CORRIDOR_HALF) {
  // L-shaped + mid dogleg so the network reads as real metro tunnels.
  const midX = Math.round((ax + bx) / 2);
  const midY = Math.round((ay + by) / 2);
  const jog = ((ax + ay + bx + by) & 1) === 0 ? 3 : -3;

  // A → horizontal to mid, vertical jog, then to B
  carveRect(g, Math.min(ax, midX), ay - half, Math.max(ax, midX), ay + half, TILE_INNER_FLOOR);
  carveRect(g, midX - half, Math.min(ay, midY + jog), midX + half, Math.max(ay, midY + jog), TILE_INNER_FLOOR);
  carveRect(g, midX - half, Math.min(midY + jog, by), midX + half, Math.max(midY + jog, by), TILE_INNER_FLOOR);
  carveRect(g, Math.min(midX, bx), by - half, Math.max(midX, bx), by + half, TILE_INNER_FLOOR);
  // Center track stripe
  carveRect(g, Math.min(ax, midX), ay, Math.max(ax, midX), ay, TILE_CROSSWALK);
  carveRect(g, midX, Math.min(ay, by), midX, Math.max(ay, by), TILE_CROSSWALK);
  carveRect(g, Math.min(midX, bx), by, Math.max(midX, bx), by, TILE_CROSSWALK);
}

/**
 * Neighbor pairs to tunnel — multi-direction metro graph (not a single spine).
 * Soft spokes from hub to early districts; hard laterals connect deep campaign zones.
 */
function stationEdges(): Array<[SubwayStation, SubwayStation]> {
  const byZone = new Map(SUBWAY_STATIONS.map((s) => [s.zone, s]));
  const edges: Array<[string, string]> = [
    // Hub spokes — rookies can board to any early district direction
    ["safe", "d0"], // east → plaza
    ["safe", "d1"], // west → stacks
    ["safe", "d2"], // north → spire
    ["safe", "d4"], // SW → undercity (slightly riskier early shortcut)
    // Cross-links (numerous destinations)
    ["d0", "d3"], // plaza → docks
    ["d0", "d5"], // plaza → relay (SE)
    ["d0", "d2"], // plaza ↔ spire ring
    ["d1", "d4"], // stacks → undercity
    ["d1", "d2"], // stacks ↔ spire
    ["d2", "d5"], // spire → relay (long SE cut)
    ["d3", "d5"], // docks → relay
    ["d3", "d6"], // docks → wastes (hard coastal line)
    ["d4", "d5"], // undercity → relay
    ["d4", "d6"], // undercity deep cut toward wastes
    ["d5", "d6"], // relay → wastes
    ["d5", "d7"], // relay → kernel (hard)
    ["d6", "d7"], // wastes → kernel tip
  ];
  // Bridges to flanking districts when present
  for (let i = 0; i < BRIDGES.length; i++) {
    const b = BRIDGES[i];
    edges.push([`d${i}`, b.id]);
    if (i + 1 < DISTRICTS.length) edges.push([b.id, `d${i + 1}`]);
  }
  const out: Array<[SubwayStation, SubwayStation]> = [];
  const seen = new Set<string>();
  for (const [a, b] of edges) {
    const sa = byZone.get(a);
    const sb = byZone.get(b);
    if (!sa || !sb) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([sa, sb]);
  }
  return out;
}

/**
 * Tunnel art tiled continuously along the authored dogleg paths. These modules are
 * the subway map's structural units: buildSubway carves their exact footprints and
 * the client renders the matching plates before adding fixtures and encounters.
 */
export function subwayTunnelArtModules(): SubwayArtModule[] {
  const modules = new Map<string, SubwayArtModule>();
  for (const [a, b] of stationEdges()) {
    const pts = tunnelPolyline(a.tx, a.ty, b.tx, b.ty);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const vertical = x0 === x1;
      const len = Math.abs((vertical ? y1 - y0 : x1 - x0));
      // A straight plate covers seven tiles along its rail axis. Six-tile spacing
      // overlaps adjacent edges slightly, producing a continuous authored tunnel
      // instead of occasional decorative stickers floating over generic corridors.
      const count = Math.max(1, Math.ceil(len / 6) - 1);
      for (let n = 1; n <= count; n++) {
        const t = n / (count + 1);
        const tx = Math.round(x0 + (x1 - x0) * t);
        const ty = Math.round(y0 + (y1 - y0) * t);
        const id = `straight:${tx}:${ty}:${vertical ? 1 : 0}`;
        modules.set(id, {
          id,
          key: "hf_subway_tunnel_straight",
          tx,
          ty,
          w: vertical ? 5 : 7,
          h: vertical ? 7 : 5,
          quarterTurns: vertical ? 1 : 0,
        });
      }
      if (i < pts.length - 2) {
        const [tx, ty] = pts[i + 1];
        const id = `junction:${tx}:${ty}`;
        modules.set(id, {
          id,
          key: modules.has(id) ? "hf_subway_tunnel_cross" : "hf_subway_tunnel_junction",
          tx,
          ty,
          w: 7,
          h: 7,
          quarterTurns: 0,
        });
      }
    }
  }
  return [...modules.values()];
}

/**
 * Build the full UNDERLINE grid: branching tunnels between district stations
 * in map-accurate directions (not a single east-west spine).
 */
export function buildSubway(): TileGrid {
  const g: TileGrid = [];
  for (let y = 0; y < SUBWAY_H; y++) {
    const row: number[] = [];
    for (let x = 0; x < SUBWAY_W; x++) row.push(TILE_INNER_WALL);
    g.push(row);
  }

  // Connect station anchors first, then make every art plate footprint explicitly
  // walkable. The module pass is authoritative for the visible tunnel shape.
  for (const [a, b] of stationEdges()) {
    carveTunnel(g, a.tx, a.ty, b.tx, b.ty);
  }

  // The art module footprint is authoritative too: give every rendered plate a walkable
  // tile box even where two doglegs overlap or rounding moves a plate by one tile.
  for (const m of subwayTunnelArtModules()) {
    const hw = Math.floor(m.w / 2);
    const hh = Math.floor(m.h / 2);
    carveRect(g, m.tx - hw, m.ty - hh, m.tx + hw, m.ty + hh, TILE_INNER_FLOOR);
    // Preserve the rail stripe through the module center.
    if (m.quarterTurns % 2 === 1) carveRect(g, m.tx, m.ty - hh, m.tx, m.ty + hh, TILE_CROSSWALK);
    else carveRect(g, m.tx - hw, m.ty, m.tx + hw, m.ty, TILE_CROSSWALK);
  }

  // Stations carved around HF structure: platform apron, ticket hall (N), exit (S), track bay (E).
  for (const st of SUBWAY_STATIONS) {
    // Main platform / apron — slightly wider than the art plate so players walk around props.
    carveRect(g, st.tx - 7, st.ty - STATION_HALF, st.tx + 7, st.ty + STATION_HALF, TILE_INNER_FLOOR);
    carveRect(g, st.tx - 3, st.ty - 1, st.tx + 3, st.ty + 1, TILE_CROSSWALK);
    if (st.major) {
      // Cardinal corridors
      carveRect(g, st.tx - 2, st.ty - (TICKET_HALL_DY + 4), st.tx + 2, st.ty, TILE_INNER_FLOOR);
      carveRect(g, st.tx - 2, st.ty, st.tx + 2, st.ty + (EXIT_DY + 4), TILE_INNER_FLOOR);
      carveRect(g, st.tx - (TRACK_BAY_DX + 4), st.ty - 2, st.tx, st.ty + 2, TILE_INNER_FLOOR);
      carveRect(g, st.tx, st.ty - 2, st.tx + (TRACK_BAY_DX + 4), st.ty + 2, TILE_INNER_FLOOR);
      // Ticket hall chamber (north) — sized for hf_subway_ticket_hall + booth
      carveRect(
        g,
        st.tx - 6,
        st.ty - (TICKET_HALL_DY + 3),
        st.tx + 6,
        st.ty - (TICKET_HALL_DY - 3),
        TILE_INNER_FLOOR,
      );
      // Escalator / exit chamber (south) — sized for escalator mouth + exit prop
      carveRect(
        g,
        st.tx - 5,
        st.ty + (EXIT_DY - 3),
        st.tx + 5,
        st.ty + (EXIT_DY + 4),
        TILE_INNER_FLOOR,
      );
      // Track bay (east) — dead train rests on walkable apron, not in solid rock
      carveRect(
        g,
        st.tx + (TRACK_BAY_DX - 3),
        st.ty - 4,
        st.tx + (TRACK_BAY_DX + 5),
        st.ty + 4,
        TILE_INNER_FLOOR,
      );
    }
  }

  // Secondary loop segments between nearby majors (ring lines)
  const majors = SUBWAY_STATIONS.filter((s) => s.major);
  for (let i = 0; i < majors.length; i++) {
    for (let j = i + 1; j < majors.length; j++) {
      const a = majors[i];
      const b = majors[j];
      const dist = Math.hypot(a.tx - b.tx, a.ty - b.ty);
      if (dist < 55 && dist > 20 && (i + j) % 3 === 0) {
        carveTunnel(g, a.tx, a.ty, b.tx, b.ty, 1);
      }
    }
  }

  return g;
}

/**
 * Sample posts along the same L-dogleg path carveTunnel uses (straight-line
 * midpoints land in solid rock between stations).
 */
function tunnelPathSamples(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  steps = 6,
): Array<{ tx: number; ty: number; t: number }> {
  const pts = tunnelPolyline(ax, ay, bx, by);
  // Segment lengths
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segs.push(len);
    total += len;
  }
  if (total < 1) return [{ tx: ax, ty: ay, t: 0 }];
  const out: Array<{ tx: number; ty: number; t: number }> = [];
  for (let s = 1; s < steps; s++) {
    let dist = (total * s) / steps;
    let i = 0;
    while (i < segs.length && dist > segs[i]) {
      dist -= segs[i];
      i++;
    }
    if (i >= segs.length) i = segs.length - 1;
    const len = segs[i] || 1;
    const u = dist / len;
    const x0 = pts[i][0];
    const y0 = pts[i][1];
    const x1 = pts[i + 1][0];
    const y1 = pts[i + 1][1];
    out.push({
      tx: Math.round(x0 + (x1 - x0) * u),
      ty: Math.round(y0 + (y1 - y0) * u),
      t: s / steps,
    });
  }
  return out;
}

/**
 * Enemy posts: `depth` field stores **campaign threat** (0..7+) for scaling —
 * not pure graph distance. Tunnels toward higher districts are denser + harder.
 */
/** Radius (tiles) around hub boarding kept clear — just the platform you arrive on. */
export const HUB_BOARDING_PAD = 6;

export function subwayEnemyPosts(): Array<{ tx: number; ty: number; depth: number }> {
  const posts: Array<{ tx: number; ty: number; depth: number }> = [];
  const hub = SUBWAY_STATIONS.find((s) => s.zone === "safe") ?? SUBWAY_STATIONS[0];
  const seen = new Set<string>();
  const push = (tx: number, ty: number, campaignThreat: number) => {
    const key = `${tx},${ty}`;
    if (seen.has(key)) return;
    seen.add(key);
    // Boarding pad — you must never materialise inside a fight. This used to be 16
    // tiles, which swallowed the hub's own station guards AND every tunnel post on the
    // approach, leaving the station you actually arrive at completely dead. Keep it to
    // the platform you land on; the rest of the station is fair game at tier 0.
    if (Math.hypot(tx - hub.tx, ty - hub.ty) < HUB_BOARDING_PAD) return;
    posts.push({ tx, ty, depth: campaignThreat });
  };

  // Tunnel samples — density scales with destination hardness.
  // Each sample can stack up to three posts, so the multipliers compound: a kernel line
  // was 11 steps x3 = 33 bodies per edge and the whole line read as a wall of enemies.
  // Thinned by ~a third — the soft->lethal SHAPE is what matters, not the raw count.
  for (const [a, b] of stationEdges()) {
    const hard = Math.max(a.campaignThreat ?? 0, b.campaignThreat ?? 0);
    // Soft lines (hub↔plaza/stacks): fewer posts. Kernel lines: denser.
    const steps = hard < 1.5 ? 4 : hard < 3.5 ? 5 : hard < 5.5 ? 7 : 8;
    for (const p of tunnelPathSamples(a.tx, a.ty, b.tx, b.ty, steps)) {
      const threat = tunnelCampaignThreat(a.zone, b.zone, p.t);
      push(p.tx, p.ty, threat);
      // Side post only on mid+ lines (keeps early corridors readable)
      if (threat >= 2.5) push(p.tx + 1, p.ty, threat);
      // Third body only on the deepest lines — this is what tripled the kernel run
      if (threat >= 5) push(p.tx, p.ty + (p.tx % 2 === 0 ? 1 : -1), threat);
    }
  }

  // Station guards — campaign threat of that station's surface district
  for (const st of SUBWAY_STATIONS) {
    const ct = st.campaignThreat ?? campaignThreatForZone(st.zone);
    const tier = subwayStationTier(st);
    // The hub is the one station you ARRIVE at rather than fight into, so it gets no
    // guards hugging the platform (those sit inside the boarding pad anyway) — only the
    // far ends below. campaignThreat 0 => tier 0 => SUBWAY_TIER_KINDS[0], patrols and a
    // wasp: the softest rung of the same progression every other station uses.
    const boarding = st.zone === "safe";
    if (!boarding) {
      push(st.tx - 4, st.ty, ct);
      push(st.tx + 4, st.ty, ct);
      push(st.tx, st.ty - 3, ct);
      push(st.tx, st.ty + 3, ct);
    }
    // Platform ends / track bay. The hub joins in at tier 0 so its station isn't dead.
    if (st.major && (tier >= 1 || boarding)) {
      push(st.tx - 1, st.ty - 8, ct);
      push(st.tx + 1, st.ty + 8, ct);
      push(st.tx - 8, st.ty, ct);
      push(st.tx + 8, st.ty, ct); // track bay — dead-train dens
    }
    if (st.major && tier >= 2) {
      push(st.tx, st.ty - 12, ct + 0.4);
      push(st.tx, st.ty + 12, ct + 0.4);
      push(st.tx - 3, st.ty - 12, ct);
      push(st.tx + 3, st.ty + 12, ct);
    }
    if (st.major && tier >= 3) {
      // Extra dens on kernel-grade stations
      push(st.tx + 9, st.ty - 2, ct + 0.5);
      push(st.tx + 9, st.ty + 2, ct + 0.5);
    }
  }

  return posts;
}

/** Boss sits in the deep station's east spur (always carved for majors). */
export function subwayBossTile(): { tx: number; ty: number } {
  let best = SUBWAY_STATIONS[0];
  for (const st of SUBWAY_STATIONS) {
    if (st.depth > best.depth) best = st;
  }
  // East spur of deepest major: open floor out to st.tx+12
  return { tx: best.tx + (best.major ? 9 : 4), ty: best.ty };
}

/** Snap subway entry to a free tile centre (player radius + escape route). */
export function resolveSubwayOpen(grid: TileGrid, x: number, y: number): { x: number; y: number } {
  const open = resolveOpenSpawn(grid, { x, y });
  // If the preferred was garbage OOB and search failed, land at hub station pad.
  const tx = Math.floor(open.x / TILE);
  const ty = Math.floor(open.y / TILE);
  if (grid[ty]?.[tx] === undefined || isWall(grid[ty][tx])) {
    return resolveOpenSpawn(grid, SUBWAY_SPAWN);
  }
  return open;
}
