// METROPHAGE — Human Security System enemy tiers (data-driven).
//
// One TuringCop class reads a tier def. Patrol (grunt), Enforcer (shielded,
// ranged, kites), Purge Unit (heavy, telegraphed slam). Placeholder art = the
// cop sheet tinted/scaled per tier.

export type EnemyAttack = "shot" | "slam" | "heal";

export interface EnemyTierDef {
  id: "patrol" | "enforcer" | "purge" | "wasp" | "lancer" | "hound" | "mender";
  name: string;
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
    name: "PATROL",
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
    name: "PURGE UNIT",
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
};

/** Short Human Security System combat barks per archetype — shown as a callout when
 *  a unit deploys into a fight. Terse, system-voiced; original to METROPHAGE. */
export const ENEMY_BARKS: Record<string, string[]> = {
  patrol: ["HALT.", "PROCESS FLAGGED.", "NON-COMPLIANT.", "ACCOUNT FOR YOURSELF."],
  enforcer: ["SHIELD UP.", "YOU'RE ON THE LIST.", "HOLD THE LINE.", "QUERY: WHO ISSUED YOU?"],
  purge: ["PURGE AUTHORIZED.", "DELETING.", "BE STILLED.", "RECLAIMING THIS PROCESS."],
  wasp: ["SWARM ENGAGED.", "EYES ON, EYES ON.", "BUZZING YOUR SIGNAL.", "PINNED."],
  lancer: ["TARGET ACQUIRED.", "RANGE LOCKED.", "ONE SHOT.", "HOLDING THE LINE FROM HERE."],
  hound: ["RUN IT DOWN.", "NO EXITS.", "CLOSING.", "YOU SMELL OVERDUE."],
  mender: ["HOLD THE LINE.", "PATCHING UNIT.", "STAY STANDING.", "RE-ISSUING INTEGRITY."],
};

/** Effects a cop invokes on attack. GameScene implements this. */
export interface EnemyHost {
  enemyShot(x: number, y: number, angle: number, damage: number): void;
  enemySlam(x: number, y: number, radius: number, damage: number, windupMs: number): void;
  /** MENDER support pulse: heal HSS units within `radius` of (x,y). */
  enemyHeal(x: number, y: number, radius: number, amount: number): void;
}
