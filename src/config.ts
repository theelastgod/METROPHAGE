// METROPHAGE — global constants.
// Kept as plain data so game logic stays independent of Phaser/render code.

export const TILE = 32;

/** District grid dimensions, in tiles. */
export const GRID_W = 40;
export const GRID_H = 30;

export const WORLD_W = GRID_W * TILE;
export const WORLD_H = GRID_H * TILE;

/**
 * Logical render size. The canvas scales to fit the window (Phaser.Scale.FIT).
 * Kept small (and the camera at zoom 1) for a close "field view" feel via upscale,
 * AND so scroll-fixed UI isn't displaced by camera zoom.
 */
export const VIEW_W = 720;
export const VIEW_H = 405;

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
