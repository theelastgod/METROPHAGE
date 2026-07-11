// METROPHAGE — global constants.
// Kept as plain data so game logic stays independent of Phaser/render code.
// Also imported by the Workers server (server/src/world.ts) — nothing here may
// touch DOM globals or client-only modules; render-tier selection lives in
// render/renderTier.ts and feeds back through setRenderResolution().

export const TILE = 32;

/**
 * Source cell size of the real-art tileset PNG (public/assets/tilesets/metrophage_tiles.png).
 * MUST equal `TILE`: the renderer is pixelArt (NEAREST filtering), so any downscale at draw
 * time samples a shifting texel lattice as the camera scrolls — the floor visibly shimmers
 * and "flashes" while moving. The high-res 96px sheet is kept at metrophage_tiles@96.png and
 * baked to 32px offline (per-cell Lanczos, no cross-tile bleed) — better quality than any
 * runtime minification, 8.5× smaller download, and rock-stable under scroll.
 */
export const TILESET_PX = 32;

/** The tileset is real authored art (not the procedural fallback) — polish passes use the
 *  subtler alpha/detail branches. Was inferred from TILESET_PX > TILE before the 1:1 bake. */
export const TILESET_REAL_ART = true;

/** Base grid for tutorial / subway / small interiors (tiles). */
export const GRID_W = 40;
export const GRID_H = 30;

/** Combat districts + wilderness bridges: scale authored 40×30 layouts for MMO density. */
export const DISTRICT_SCALE = 3;
export const DISTRICT_GRID_W = GRID_W * DISTRICT_SCALE;
export const DISTRICT_GRID_H = GRID_H * DISTRICT_SCALE;

/** Online hub city scale. Base is now a compact 112×88 (see city.ts) — a walkable town of
 *  ~30 buildings around the plaza — so the multiplier is 1×. */
export const CITY_SCALE = 1;

/** Legacy default world size (district-scale); prefer gridDims() for per-zone bounds. */
export const WORLD_W = DISTRICT_GRID_W * TILE;
export const WORLD_H = DISTRICT_GRID_H * TILE;

/**
 * Render/backing resolution. The canvas scales to fit the window (Phaser.Scale.FIT),
 * so this IS the fidelity ceiling — below the window size Phaser nearest-neighbour
 * upscales it (blocky). Supersampled from the 960×540 design size up to 2560×1440
 * (RENDER_SCALE) for a crisp neon-noir image at modern window sizes.
 *
 * Framing is preserved, not changed: each world camera zooms by RENDER_SCALE (see
 * render/cameras.ts → installUiCamera), so the world is still authored/played in the
 * 960×540 logical space but drawn into the bigger buffer. Screen-space UI
 * (scrollFactor 0) rides a separate zoom-1 UI camera, so it stays put + escapes the
 * world post-FX. The UI anchors to these constants / `scale.width`, so it re-layouts
 * cleanly at the new size.
 */
/** Original logical design size — the world + UI are still authored at this scale. */
export const DESIGN_W = 960;
export const DESIGN_H = 540;
/** Backing buffer (exact integers — these are the real canvas dimensions). */
export let VIEW_W = 2560;
export let VIEW_H = 1440;
/**
 * Supersample factor: each world camera zooms by this to keep the 960×540 framing.
 * Derived from HEIGHT, not width, so a wider-than-16:9 backing buffer (phones —
 * see render/renderTier.ts) preserves the vertical framing and simply reveals more
 * world horizontally, rather than over-zooming and cropping top/bottom. For every
 * 16:9 tier VIEW_H/DESIGN_H === VIEW_W/DESIGN_W, so desktop is unchanged.
 */
export let RENDER_SCALE = VIEW_H / DESIGN_H; // 8/3 at 16:9
/** Screen-space UI scale — keeps typography/layout proportional at higher backing resolution. */
export let UI_SCALE = RENDER_SCALE;

/** Set the backing buffer before Phaser.Game init (called by render/renderTier.ts). */
export function setRenderResolution(w: number, h: number): void {
  VIEW_W = w;
  VIEW_H = h;
  RENDER_SCALE = VIEW_H / DESIGN_H;
  UI_SCALE = RENDER_SCALE;
}
/** Scale a design-space pixel dimension to the current backing buffer. */
export const uiDim = (px: number) => Math.round(px * UI_SCALE);
/** Scale a design-space font size for Phaser text styles. */
export const uiFont = (px: number) => `${uiDim(px)}px`;

/** Player tuning. */
export const PLAYER = {
  speed: 200, // px/sec
  maxHp: 100,
  fireRateMs: 170, // min gap between shots (hold to auto-fire)
  dashSpeed: 640,
  dashDurationMs: 150,
  dashIframeMs: 260, // i-frames outlast the dash slightly
  dashCooldownMs: 600,
  hitIframeMs: 650, // mercy invulnerability after taking a hit
} as const;

/** Turing Cop (Human Security System) tuning. */
export const COP = {
  hp: 75,
  patrolSpeed: 55,
  chaseSpeed: 116,
  aggroRange: 250, // start chasing within this
  deAggroRange: 380, // give up beyond this
  attackRange: 210, // open fire within this
  attackCooldownMs: 1050,
  patrolRadius: 110, // wander radius around spawn
} as const;

/** HEAT — risk/reward meter that also drives the post-processing intensity. */
export const HEAT = {
  max: 100,
  perDamage: 0.5, // heat gained per point of damage dealt
  perKill: 12, // bonus on a cop kill
  decayPerSec: 12, // passive cooldown rate
  decayDelayMs: 1500, // grace after last gain before decay starts
  tierStep: 25, // tiers at 0 / 25 / 50 / 75 / 100
  // escalating buffs per tier: damage, move speed, ability charge rate
  tiers: [
    { dmg: 1.0, spd: 1.0, ability: 1.0 },
    { dmg: 1.12, spd: 1.05, ability: 1.2 },
    { dmg: 1.28, spd: 1.1, ability: 1.45 },
    { dmg: 1.5, spd: 1.18, ability: 1.8 },
    { dmg: 1.7, spd: 1.26, ability: 2.2 },
  ],
  ultThreshold: 50, // heat needed to cast an ultimate
  ultHeatCost: 30, // heat spent per ultimate
} as const;

/** OVERDRIVE — manual meltdown burst at HEAT 100. */
export const OVERDRIVE = {
  durationMs: 6000,
  damageMult: 2.2,
  speedMult: 1.45,
  abilityRate: 6, // near-instant ability cooldowns ("ability spam")
  purgeCops: 5, // System purge wave focused on the player afterward
} as const;

/** Heat-scaled spawn pressure for the Human Security System. */
export const SPAWN = {
  maxEnemies: 12, // cap so high Heat pressures without overwhelming
  baseIntervalMs: 4600, // at heat 0
  minIntervalMs: 1500, // at heat 100
  ringMin: 240, // spawn this far from the player...
  ringMax: 400, // ...up to here (focuses pressure on the player)
  enforcerHeat: 30, // enforcers start appearing past this heat
  purgeHeat: 60, // purge units past this heat
} as const;

/** WINTERMUTE beam shield-break multiplier. */
export const BEAM_SHIELD_MULT = 3;

/** Critical-hit damage multiplier (crit chance comes from skills/gear: ModBag.critPct). */
export const CRIT_MULT = 1.85;

/** Player shield pool (from gear): absorbs before HP, regenerates when safe. */
export const SHIELD = {
  regenDelayMs: 2500, // no-damage time before regen begins
  regenPerSec: 9,
} as const;

/** Ally minions (WINTERMUTE drones / SWARM minions). */
export const MINION = {
  speed: 150,
  meleeRange: 26,
  attackCooldownMs: 480,
  aggroRange: 360,
} as const;

/** Infection node — channel by proximity to capture it. */
export const NODE = {
  channelRange: 74, // stand within this to channel
  channelTimeMs: 2200, // time to fully infect
  channelDecayMs: 1500, // progress bleed-off when you step away
} as const;

/** Territory — multi-node districts; contagion spreads along the node graph. */
export const TERRITORY = {
  spreadPerNeighborSec: 0.1, // an infected node fills a neighbour this fast (per link)
} as const;

/** HSS purge — rivals re-secure infected frontier nodes; faster under Heat. */
export const PURGE = {
  baseIntervalMs: 14000, // calm city: a node is re-secured roughly this often
  minIntervalMs: 6000, // at max Heat the System pushes back this hard
} as const;

/** Dynamic world events — telegraphed per-district phenomena. */
export const WORLD_EVENT = {
  firstDelayMs: 18000, // grace before the first event of a district run
  intervalMinMs: 26000, // gap between events
  intervalMaxMs: 42000,
  outbreakSpreadPerSec: 0.2, // contagion-outbreak: passive infect rate on dormant nodes
} as const;

/** SINGULARITY — the save-wide meltdown meter, fed by all activity. */
export const SINGULARITY = {
  perKill: 0.18, // each Human Security System unit destroyed
  perNode: 1.5, // each territory node infected
  clusterPerSec: 0.12, // per held node in the largest connected cluster, per second
} as const;

/** Friendly NPC. */
export const NPC = {
  interactRange: 70, // press E within this to talk
} as const;

/** Ambient wandering crowd (idle <-> wander FSM, no combat). */
export const AGENT = {
  count: 6,
  speed: 42,
  wanderRadius: 104,
  idleMinMs: 700,
  idleMaxMs: 2400,
  wanderMaxMs: 3200,
} as const;

/** Neon tints so the crowd reads as varied citizens. */
export const AGENT_TINTS = [
  0x00e5ff, 0xff2bd6, 0xf7ff3c, 0x39ff88, 0xb06bff, 0xff8a3c,
] as const;

/** Cop projectile tuning (reuses the bullet texture, tinted hostile). */
export const ENEMY_BULLET = {
  speed: 300,
  lifetimeMs: 1700,
  radius: 4,
  damage: 10,
  maxActive: 48,
  tint: 0xff3b6b,
} as const;

/** Projectile weapon tuning. */
export const BULLET = {
  speed: 580,
  lifetimeMs: 900,
  radius: 4,
  damage: 25,
  maxActive: 64,
} as const;

/**
 * Neon-noir palette: hyper-saturated emissives over near-black.
 * Numeric (0xRRGGBB) for Phaser, hex strings for CSS/text where needed.
 */
export const COLORS = {
  bgVoid: 0x04020a,
  street: 0x0b0716,
  streetLine: 0x1b1140,
  wall: 0x140c2a,
  wallEdge: 0x00e5ff, // cyan emissive trim
  plaza: 0x120a24,
  plazaGlow: 0xff2bd6, // magenta
  neonMagenta: 0xff2bd6,
  neonCyan: 0x00e5ff,
  neonYellow: 0xf7ff3c,
  neonGreen: 0x39ff88,
  player: 0x00e5ff,
  playerCore: 0xeafdff,
  bullet: 0xf7ff3c, // electric-yellow bolt
  bulletGlow: 0xff2bd6,
  spark: 0xffffff,
  enemy: 0xff3b6b, // Turing Cop hot-red
  enemyEdge: 0xff8a3c, // orange trim
  enemyCore: 0xffe08a,
  hurt: 0xff2d2d,
  node: 0x8a5cff, // dormant infection node (violet)
  nodeInfected: 0x39ff88, // captured (neon green)
  singularity: 0x39ff88,
  npc: 0x9dff3c, // friendly contact (lime)
  hp: 0x39ff88,
  hpLow: 0xff2d2d,
} as const;
