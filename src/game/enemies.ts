// METROPHAGE — Human Security System enemy tiers (data-driven).
//
// One TuringCop class reads a tier def. Patrol (grunt), Enforcer (shielded,
// ranged, kites), Purge Unit (heavy, telegraphed slam). Placeholder art = the
// cop sheet tinted/scaled per tier.

export type EnemyAttack = "shot" | "slam";

export interface EnemyTierDef {
  id: "patrol" | "enforcer" | "purge";
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
  },
};

/** Effects a cop invokes on attack. GameScene implements this. */
export interface EnemyHost {
  enemyShot(x: number, y: number, angle: number, damage: number): void;
  enemySlam(x: number, y: number, radius: number, damage: number, windupMs: number): void;
}
