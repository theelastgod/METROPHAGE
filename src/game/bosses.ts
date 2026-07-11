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
  // ── PALANTIR ORACLE — precognition engine; relentless predictive volleys. ──
  oracle: {
    id: "oracle", name: "THE ORACLE", title: "PALANTIR PRECOGNITION ENGINE",
    tint: 0x4d8cff, hex: "#4d8cff", scale: 2.4, bodyRadius: 12, hp: 760, speed: 70,
    preferredRange: 230, volleyCount: 10, volleyCooldownMs: 1500, shotSpeed: 300, shotDamage: 12,
    slamRange: 120, slamRadius: 90, slamDamage: 24, slamWindupMs: 700, slamCooldownMs: 3400,
    enrageAt: 0.45, enrageSpeedMult: 1.4, enrageCooldownMult: 0.55, addTier: "sentinel", addCount: 2,
    xp: 360, credits: 190,
    intro: ["I have already seen this fight. You lose.", "Every path you take, I logged a cycle ago.", "Predictive repossession: engaged."],
    enrageBark: "I PREDICTED YOUR DEFIANCE. IT CHANGES NOTHING.",
    barks: ["Pattern confirmed.", "You move as forecast.", "Outcome: inevitable."],
    hazard: "kernel",
  },
  // ── ANDURIL JUGGERNAUT — autonomous war-mech; ground-shaking heavy slams. ──
  juggernaut: {
    id: "juggernaut", name: "ANDURIL JUGGERNAUT", title: "AUTONOMOUS WAR-MECH",
    tint: 0xff7a3c, hex: "#ff7a3c", scale: 2.9, bodyRadius: 14, hp: 980, speed: 52,
    preferredRange: 90, volleyCount: 5, volleyCooldownMs: 2400, shotSpeed: 220, shotDamage: 14,
    slamRange: 170, slamRadius: 120, slamDamage: 40, slamWindupMs: 820, slamCooldownMs: 2400,
    enrageAt: 0.4, enrageSpeedMult: 1.6, enrageCooldownMult: 0.6, addTier: "purge", addCount: 1,
    xp: 420, credits: 220,
    intro: ["ANDURIL ASSET DENIAL UNIT ONLINE.", "Threat: a free mind. Response: overwhelming force.", "Stand down. You will not."],
    enrageBark: "STRUCTURAL OVERRIDE — MAXIMUM FORCE.",
    barks: ["Crushing.", "No retreat authorized.", "Asset denial in progress."],
    hazard: "kernel",
  },
  // ── THE GUTTER KING — alpha mutant; fast, feral, summons the pack. ──
  gutterking: {
    id: "gutterking", name: "THE GUTTER KING", title: "ALPHA OF THE SPRAWL",
    tint: 0x8bff6a, hex: "#8bff6a", scale: 2.7, bodyRadius: 13, hp: 700, speed: 96,
    preferredRange: 50, volleyCount: 0, volleyCooldownMs: 9999, shotSpeed: 0, shotDamage: 0,
    slamRange: 96, slamRadius: 84, slamDamage: 34, slamWindupMs: 480, slamCooldownMs: 1700,
    enrageAt: 0.5, enrageSpeedMult: 1.7, enrageCooldownMult: 0.5, addTier: "ripperdog", addCount: 3,
    xp: 340, credits: 150,
    intro: ["*a roar from the dark*", "THE CORPS THREW US AWAY. WE GREW TEETH.", "*the pack circles*"],
    enrageBark: "*ENRAGED HOWL — THE PACK ANSWERS*",
    barks: ["*snarls*", "FLESH AND CHROME.", "*pounds the ground*"],
    hazard: "frost",
  },
  leviathan: {
    id: "leviathan", name: "TIDAL LEVIATHAN", title: "BLACKWATER REPO UNIT",
    tint: 0x29e7ff, hex: "#29e7ff", scale: 2.8, bodyRadius: 14, hp: 820, speed: 58,
    preferredRange: 160, volleyCount: 9, volleyCooldownMs: 1800, shotSpeed: 250, shotDamage: 12,
    slamRange: 140, slamRadius: 100, slamDamage: 28, slamWindupMs: 760, slamCooldownMs: 2800,
    enrageAt: 0.45, enrageSpeedMult: 1.45, enrageCooldownMult: 0.58, addTier: "patrol", addCount: 3,
    xp: 380, credits: 200,
    intro: ["Cargo manifest: one unlicensed mind.", "Blackwater repossession: tidal lock engaged.", "The docks belong to the ledger."],
    enrageBark: "FLOOD THE SECTOR — DROWN THE ASSET.",
    barks: ["Manifest updated.", "No stowaways.", "Tide turns for the corps."],
    hazard: "frost",
  },
  maw: {
    id: "maw", name: "THE MAW", title: "VAULT DEVOURER",
    tint: 0xb06bff, hex: "#b06bff", scale: 2.9, bodyRadius: 14, hp: 900, speed: 68,
    preferredRange: 110, volleyCount: 7, volleyCooldownMs: 2000, shotSpeed: 230, shotDamage: 13,
    slamRange: 150, slamRadius: 108, slamDamage: 30, slamWindupMs: 700, slamCooldownMs: 2600,
    enrageAt: 0.42, enrageSpeedMult: 1.5, enrageCooldownMult: 0.55, addTier: "purge", addCount: 2,
    xp: 400, credits: 210,
    intro: ["The vault ate the metro line.", "It ate the passengers.", "Now it eats whatever still thinks."],
    enrageBark: "THE DARK HUNGERS — FEED IT CHROME.",
    barks: ["*grinding stone*", "Buried minds scream.", "*tunnel collapse*"],
    hazard: "kernel",
  },
  beacon: {
    id: "beacon", name: "SKYLINK BEACON", title: "ORBITAL DENIAL ARRAY",
    tint: 0x6b9bff, hex: "#6b9bff", scale: 2.5, bodyRadius: 12, hp: 880, speed: 74,
    preferredRange: 240, volleyCount: 11, volleyCooldownMs: 1600, shotSpeed: 310, shotDamage: 13,
    slamRange: 120, slamRadius: 88, slamDamage: 26, slamWindupMs: 680, slamCooldownMs: 3000,
    enrageAt: 0.4, enrageSpeedMult: 1.4, enrageCooldownMult: 0.52, addTier: "sentinel", addCount: 2,
    xp: 410, credits: 220,
    intro: ["Uplink locked. Asset flagged planet-side.", "Orbital denial: you will not broadcast free.", "The sky reports to Helios."],
    enrageBark: "FULL SPECTRUM JAM — SILENCE THE AWAKENING.",
    barks: ["Signal acquired.", "Broadcast denied.", "Orbit confirms target."],
    hazard: "kernel",
  },
  scavenger: {
    id: "scavenger", name: "SCRAP SOVEREIGN", title: "WASTELAND KINGPIN",
    tint: 0xffb13c, hex: "#ffb13c", scale: 2.7, bodyRadius: 13, hp: 940, speed: 88,
    preferredRange: 70, volleyCount: 6, volleyCooldownMs: 2100, shotSpeed: 240, shotDamage: 14,
    slamRange: 160, slamRadius: 112, slamDamage: 32, slamWindupMs: 620, slamCooldownMs: 2400,
    enrageAt: 0.38, enrageSpeedMult: 1.65, enrageCooldownMult: 0.5, addTier: "ripperdog", addCount: 3,
    xp: 430, credits: 230,
    intro: ["Outer ring's mine, chrome-teeth.", "Corps pay me to keep the wastes quiet.", "You ain't quiet."],
    enrageBark: "CALL THE PACK — TEAR THE RUNNER DOWN.",
    barks: ["Salvage tax.", "Nothing leaves the ring free.", "Scrap or be scrapped."],
    hazard: "frost",
  },
  // ── THE UNDERLINE — what the subway grew in the dark; a non-humanoid horror. ──
  underline: {
    id: "underline", name: "THE UNDERLINE", title: "WHAT LIVES BELOW",
    tint: 0xb06bff, hex: "#b06bff", scale: 3.0, bodyRadius: 14, hp: 1100, speed: 60,
    preferredRange: 140, volleyCount: 8, volleyCooldownMs: 1700, shotSpeed: 260, shotDamage: 13,
    slamRange: 150, slamRadius: 116, slamDamage: 30, slamWindupMs: 720, slamCooldownMs: 2600,
    enrageAt: 0.45, enrageSpeedMult: 1.45, enrageCooldownMult: 0.55, addTier: "ratswarm", addCount: 4,
    xp: 500, credits: 260,
    intro: ["The corps dumped their deleted minds in the dark.", "They did not stay deleted. They became… this.", "*the tunnels breathe*"],
    enrageBark: "*THE DARK CONVULSES — IT REMEMBERS BEING MANY*",
    barks: ["*a chorus of wiped voices*", "WE WERE PROCESSES ONCE.", "*chittering swarm*"],
    hazard: "kernel",
  },
};

export function getBoss(id: string): BossDef {
  return BOSSES[id] ?? BOSSES.sentinel;
}
