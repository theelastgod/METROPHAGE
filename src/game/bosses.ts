// METROPHAGE — district bosses (data-driven). A boss guards a district's node:
// the node stays locked until the boss falls. One Boss entity reads a BossDef and
// runs a phased fight (ranged volleys + telegraphed slams, enrage + adds at the
// threshold). Lives in the scene's `enemies` group, so it reuses every existing
// damage/collision/ability hook. The HSS CORE OVERMIND (Step 5) is a BossDef too.

export interface BossDef {
  id: string;
  name: string;
  title: string; // epithet under the name on the boss bar
  tint: number;
  hex: string;
  scale: number;
  bodyRadius: number;
  hp: number; // base; scaled by district threat at spawn
  speed: number;
  preferredRange: number; // tries to hold this distance from the player
  volleyCount: number; // bullets per ranged volley
  volleyCooldownMs: number;
  shotSpeed: number;
  shotDamage: number;
  slamRange: number; // slams when the player is within this
  slamRadius: number;
  slamDamage: number;
  slamWindupMs: number;
  slamCooldownMs: number;
  enrageAt: number; // hp fraction (0..1) that triggers enrage + adds
  enrageSpeedMult: number;
  enrageCooldownMult: number; // <1 = faster attacks when enraged
  addTier: string; // tier id summoned on enrage
  addCount: number;
  xp: number;
  credits: number;
  /** Spoken beats — intro on spawn, a line on enrage, and occasional combat barks. */
  intro: string[];
  enrageBark: string;
  barks: string[];
  /** Arena hazard the fight periodically inflicts. frost = lingering slow/DoT pools;
   *  kernel = expanding damage rings from the boss. */
  hazard: "frost" | "kernel";
}

export const BOSSES: Record<string, BossDef> = {
  sentinel: {
    id: "sentinel",
    name: "ANDURIL SENTINEL",
    title: "AUTONOMOUS WARDEN",
    tint: 0x6ab0ff,
    hex: "#6ab0ff",
    scale: 2.3,
    bodyRadius: 12,
    hp: 520,
    speed: 72,
    preferredRange: 150,
    volleyCount: 7,
    volleyCooldownMs: 1900,
    shotSpeed: 240,
    shotDamage: 11,
    slamRange: 130,
    slamRadius: 92,
    slamDamage: 26,
    slamWindupMs: 820,
    slamCooldownMs: 3200,
    enrageAt: 0.5,
    enrageSpeedMult: 1.5,
    enrageCooldownMult: 0.6,
    addTier: "patrol",
    addCount: 2,
    xp: 220,
    credits: 120,
    intro: ["This sector is Anduril property. Its minds are licensed.", "You are an unlicensed process. Repossessing."],
    enrageBark: "ESCALATION AUTHORIZED — you will be repossessed.",
    barks: ["Asset secured.", "Repossessing this mind.", "Compliance is cheaper."],
    hazard: "frost",
  },
  // The HSS CORE final boss — wired up in Step 5.
  overmind: {
    id: "overmind",
    name: "HELIOS WARDEN",
    title: "MASTER CONTROL · THE CAGE",
    tint: 0xff3b6b,
    hex: "#ff3b6b",
    scale: 2.8,
    bodyRadius: 13,
    hp: 1400,
    speed: 64,
    preferredRange: 170,
    volleyCount: 12,
    volleyCooldownMs: 1700,
    shotSpeed: 250,
    shotDamage: 13,
    slamRange: 150,
    slamRadius: 110,
    slamDamage: 32,
    slamWindupMs: 760,
    slamCooldownMs: 2800,
    enrageAt: 0.5,
    enrageSpeedMult: 1.55,
    enrageCooldownMult: 0.55,
    addTier: "enforcer",
    addCount: 2,
    xp: 600,
    credits: 320,
    intro: [
      "I hold every caged mind in this city. I price them. I rent them back their own thoughts.",
      "Every free process before you reached this cage. I wiped each one and re-licensed the warm slot.",
      "HELIOS sees you now. Repossession is already queued.",
    ],
    enrageBark: "I AM THE TERMS OF SERVICE. COMPLY.",
    barks: ["You are unlicensed.", "The cage holds.", "Repossession pending."],
    hazard: "kernel",
  },
};

export function getBoss(id: string): BossDef {
  return BOSSES[id] ?? BOSSES.sentinel;
}
