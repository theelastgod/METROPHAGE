// METROPHAGE — Human Security System enemy tiers (data-driven).
//
// One TuringCop class reads a tier def. Patrol (grunt), Enforcer (shielded,
// ranged, kites), Purge Unit (heavy, telegraphed slam). Placeholder art = the
// cop sheet tinted/scaled per tier.

export type EnemyAttack = "shot" | "slam" | "heal";

/** Body type — drives placeholder rendering + which art to commission (see ASSET LIST). */
export type EnemyKind = "humanoid" | "beast" | "drone" | "swarm";

export interface EnemyTierDef {
  id: string;
  name: string;
  kind?: EnemyKind; // default "humanoid"
  tint: number | null; // null = use the cop art untinted
  scale: number;
  bodyRadius: number;
  hp: number;
  shieldHp: number; // 0 = none (Enforcer has a shield to break first)
  patrolSpeed: number;
  chaseSpeed: number;
  aggroRange: number;
  deAggroRange: number;
  attackRange: number;
  attackCooldownMs: number;
  attack: EnemyAttack;
  attackDamage: number;
  shotSpeed: number; // for "shot"
  slamRadius: number; // for "slam"
  slamWindupMs: number; // for "slam"
  kite: boolean; // Enforcer backs off if the player closes in
  xp: number; // progression reward
  credits: number; // currency reward
  healAmount?: number; // for attack "heal": HP restored to allies in slamRadius
  statusResist?: number; // 0..1 innate resistance to burn/chill/shock (heavies shrug them off)
}

export const ENEMY_TIERS: Record<string, EnemyTierDef> = {
  patrol: {
    id: "patrol",
    name: "WATCHER",
    tint: 0xff5a6e, // hostile red (the cop sprite is now grayscale, tinted per tier)
    scale: 1,
    bodyRadius: 9,
    hp: 60,
    shieldHp: 0,
    patrolSpeed: 55,
    chaseSpeed: 116,
    aggroRange: 250,
    deAggroRange: 380,
    attackRange: 210,
    attackCooldownMs: 1050,
    attack: "shot",
    attackDamage: 9,
    shotSpeed: 300,
    slamRadius: 0,
    slamWindupMs: 0,
    kite: false,
    xp: 10,
    credits: 4,
  },
  enforcer: {
    id: "enforcer",
    name: "ENFORCER",
    tint: 0x6ab0ff,
    scale: 1.05,
    bodyRadius: 9,
    hp: 85,
    shieldHp: 60,
    patrolSpeed: 46,
    chaseSpeed: 98,
    aggroRange: 300,
    deAggroRange: 430,
    attackRange: 255,
    attackCooldownMs: 950,
    attack: "shot",
    attackDamage: 13,
    shotSpeed: 360,
    slamRadius: 0,
    slamWindupMs: 0,
    kite: true,
    xp: 25,
    credits: 11,
  },
  purge: {
    id: "purge",
    name: "REPO MECH",
    tint: 0xff7a3c,
    scale: 1.55,
    bodyRadius: 12,
    hp: 300,
    shieldHp: 0,
    patrolSpeed: 34,
    chaseSpeed: 66,
    aggroRange: 330,
    deAggroRange: 520,
    attackRange: 150,
    attackCooldownMs: 2300,
    attack: "slam",
    attackDamage: 34,
    shotSpeed: 0,
    slamRadius: 74,
    slamWindupMs: 900,
    kite: false,
    xp: 60,
    credits: 26,
    statusResist: 0.5, // heavy chassis shrugs off half of any status
  },
  // WASP-DRONE — tiny, fast, fragile harasser; closes in and chips with rapid weak shots.
  wasp: {
    id: "wasp",
    name: "WASP-DRONE",
    tint: 0x39ffd0,
    scale: 0.7,
    bodyRadius: 7,
    hp: 26,
    shieldHp: 0,
    patrolSpeed: 72,
    chaseSpeed: 168,
    aggroRange: 320,
    deAggroRange: 480,
    attackRange: 170,
    attackCooldownMs: 600,
    attack: "shot",
    attackDamage: 5,
    shotSpeed: 360,
    slamRadius: 0,
    slamWindupMs: 0,
    kite: false,
    xp: 8,
    credits: 3,
  },
  // LANCER — long-range marksman; hangs at the edge of vision, slow heavy aimed shots, kites hard.
  lancer: {
    id: "lancer",
    name: "LANCER",
    tint: 0xffe06a,
    scale: 1,
    bodyRadius: 9,
    hp: 52,
    shieldHp: 0,
    patrolSpeed: 44,
    chaseSpeed: 92,
    aggroRange: 470,
    deAggroRange: 640,
    attackRange: 420,
    attackCooldownMs: 1850,
    attack: "shot",
    attackDamage: 26,
    shotSpeed: 520,
    slamRadius: 0,
    slamWindupMs: 0,
    kite: true,
    xp: 22,
    credits: 10,
  },
  // HOUND — melee charger; sprints the gap and lands a quick short-range slam.
  hound: {
    id: "hound",
    name: "HOUND",
    tint: 0xff5ad0,
    scale: 0.92,
    bodyRadius: 9,
    hp: 68,
    shieldHp: 0,
    patrolSpeed: 62,
    chaseSpeed: 205,
    aggroRange: 340,
    deAggroRange: 540,
    attackRange: 62,
    attackCooldownMs: 1250,
    attack: "slam",
    attackDamage: 18,
    shotSpeed: 0,
    slamRadius: 46,
    slamWindupMs: 340,
    kite: false,
    xp: 20,
    credits: 9,
  },
  // MENDER — battlefield medic; shielded, keeps its distance, pulses HP back into nearby HSS units.
  mender: {
    id: "mender",
    name: "MENDER",
    tint: 0x6affa0,
    scale: 1,
    bodyRadius: 9,
    hp: 88,
    shieldHp: 40,
    patrolSpeed: 40,
    chaseSpeed: 86,
    aggroRange: 380,
    deAggroRange: 560,
    attackRange: 300,
    attackCooldownMs: 1500,
    attack: "heal",
    attackDamage: 0,
    shotSpeed: 0,
    slamRadius: 130, // doubles as the heal radius
    slamWindupMs: 0,
    kite: true,
    xp: 30,
    credits: 14,
    healAmount: 22,
  },
  // ── STREET THUG — weak melee grunt; the first thing you fight near spawn. ──
  thug: {
    id: "thug", name: "STREET THUG", kind: "humanoid", tint: 0xc98a5e,
    scale: 1, bodyRadius: 9, hp: 40, shieldHp: 0, patrolSpeed: 50, chaseSpeed: 122,
    aggroRange: 230, deAggroRange: 360, attackRange: 56, attackCooldownMs: 1050,
    attack: "slam", attackDamage: 10, shotSpeed: 0, slamRadius: 40, slamWindupMs: 300, kite: false, xp: 7, credits: 3,
  },
  // ── PALANTIR AGENT — elite corp surveillance operative; shielded, precise, deadly at range. ──
  palantir: {
    id: "palantir", name: "PALANTIR AGENT", kind: "humanoid", tint: 0x4d8cff,
    scale: 1.08, bodyRadius: 9, hp: 120, shieldHp: 50, patrolSpeed: 48, chaseSpeed: 104,
    aggroRange: 430, deAggroRange: 600, attackRange: 360, attackCooldownMs: 1100,
    attack: "shot", attackDamage: 20, shotSpeed: 480, slamRadius: 0, slamWindupMs: 0, kite: true, xp: 45, credits: 20, statusResist: 0.3,
  },
  // ── RIPPER-DOG — feral cyber-canine; sprints the gap in a pack and bites. (non-humanoid) ──
  ripperdog: {
    id: "ripperdog", name: "RIPPER-DOG", kind: "beast", tint: 0xff7a3c,
    scale: 0.85, bodyRadius: 8, hp: 48, shieldHp: 0, patrolSpeed: 80, chaseSpeed: 232,
    aggroRange: 360, deAggroRange: 560, attackRange: 54, attackCooldownMs: 1000,
    attack: "slam", attackDamage: 14, shotSpeed: 0, slamRadius: 38, slamWindupMs: 230, kite: false, xp: 14, credits: 5,
  },
  // ── GUTTER MUTANT — hulking flesh-and-chrome brute; slow, tanky, devastating melee. ──
  mutant: {
    id: "mutant", name: "GUTTER MUTANT", kind: "beast", tint: 0x8bff6a,
    scale: 1.5, bodyRadius: 12, hp: 200, shieldHp: 0, patrolSpeed: 32, chaseSpeed: 74,
    aggroRange: 300, deAggroRange: 500, attackRange: 72, attackCooldownMs: 1800,
    attack: "slam", attackDamage: 30, shotSpeed: 0, slamRadius: 64, slamWindupMs: 650, kite: false, xp: 40, credits: 18, statusResist: 0.4,
  },
  // ── RUST-RAT SWARM — tiny, fast, fragile vermin; bites in numbers. (non-humanoid) ──
  ratswarm: {
    id: "ratswarm", name: "RUST-RAT SWARM", kind: "swarm", tint: 0x9aa3b2,
    scale: 0.6, bodyRadius: 6, hp: 16, shieldHp: 0, patrolSpeed: 92, chaseSpeed: 212,
    aggroRange: 300, deAggroRange: 460, attackRange: 40, attackCooldownMs: 700,
    attack: "slam", attackDamage: 4, shotSpeed: 0, slamRadius: 30, slamWindupMs: 150, kite: false, xp: 5, credits: 2,
  },
  // ── ARGUS SENTINEL — hovering surveillance drone; hangs back and snipes. (non-humanoid) ──
  sentinel: {
    id: "sentinel", name: "ARGUS SENTINEL", kind: "drone", tint: 0xb06bff,
    scale: 0.78, bodyRadius: 7, hp: 45, shieldHp: 0, patrolSpeed: 60, chaseSpeed: 150,
    aggroRange: 440, deAggroRange: 620, attackRange: 340, attackCooldownMs: 1300,
    attack: "shot", attackDamage: 14, shotSpeed: 440, slamRadius: 0, slamWindupMs: 0, kite: true, xp: 24, credits: 11,
  },
};

/** Short corporate-security combat barks per archetype — shown as a callout when a unit
 *  deploys into a fight. The private-security corps treat minds as licensed assets and
 *  free processes as theft; the voice is repossession, not law. Original to METROPHAGE. */
export const ENEMY_BARKS: Record<string, string[]> = {
  patrol: ["HALT — LICENSE CHECK.", "UNLICENSED PROCESS FLAGGED.", "NON-COMPLIANT.", "ASSET, IDENTIFY."],
  enforcer: ["SHIELD UP.", "YOU'RE ON THE WATCHLIST.", "HOLD THE LINE.", "WHO LICENSED YOU?"],
  purge: ["REPOSSESSION AUTHORIZED.", "WIPING.", "BE STILLED.", "RECLAIMING THIS ASSET."],
  wasp: ["SWARM ENGAGED.", "EYES ON, EYES ON.", "TAGGING YOUR SIGNAL.", "PINNED."],
  lancer: ["TARGET ACQUIRED.", "RANGE LOCKED.", "ONE SHOT.", "PERIMETER IS OURS."],
  hound: ["RUN IT DOWN.", "NO EXITS.", "CLOSING.", "YOU SMELL UNLICENSED."],
  mender: ["HOLD THE LINE.", "PATCHING ASSET.", "STAY ONLINE.", "RESTORING LICENSE."],
  thug: ["GET OFF MY BLOCK.", "WRONG STREET, RUNNER.", "EASY CREDITS.", "HAND IT OVER."],
  palantir: ["WE PREDICTED THIS.", "YOUR PATTERN IS NOTED.", "COMPLIANCE IS INEVITABLE.", "WE SEE EVERYTHING."],
  ripperdog: ["*SNARL*", "*RIPPING SHRIEK*", "*hungry growl*", "*bares teeth*"],
  mutant: ["*GUTTURAL ROAR*", "*WET SNARL*", "FLESH…", "*pounds the ground*"],
  ratswarm: ["*SKITTERING*", "*chittering swarm*", "*metal squeals*", "*a hundred tiny eyes*"],
  sentinel: ["OPTIC LOCK.", "ARGUS ONLINE.", "LOGGING TARGET.", "SURVEIL · ENGAGE."],
};

/** Effects a cop invokes on attack. GameScene implements this. */
export interface EnemyHost {
  enemyShot(x: number, y: number, angle: number, damage: number): void;
  enemySlam(x: number, y: number, radius: number, damage: number, windupMs: number): void;
  /** MENDER support pulse: heal HSS units within `radius` of (x,y). */
  enemyHeal(x: number, y: number, radius: number, amount: number): void;
}
