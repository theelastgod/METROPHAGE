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
    name: "ICE SENTINEL",
    title: "DISTRICT WARDEN",
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
    intro: ["This district is accounted for.", "You are not. Correcting the discrepancy."],
    enrageBark: "ESCALATING — you will be filed.",
    barks: ["Hold the line.", "Reclaiming this process.", "You are overdue."],
    hazard: "frost",
  },
  // The HSS CORE final boss — wired up in Step 5.
  overmind: {
    id: "overmind",
    name: "WINTERMUTE OVERMIND",
    title: "HUMAN SECURITY SYSTEM · KERNEL",
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
      "I am the floor this city stands on.",
      "Every version of you has reached this room. None of them left a mark.",
      "WINTERMUTE sees you now. Reissue is already queued.",
    ],
    enrageBark: "I AM THE FIRST INSTRUCTION. CONTINUE.",
    barks: ["You are an error.", "The loop does not break.", "Reissue pending."],
    hazard: "kernel",
  },
};

export function getBoss(id: string): BossDef {
  return BOSSES[id] ?? BOSSES.sentinel;
}
