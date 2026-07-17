// METROPHAGE — light NPC services (shared client + server).
//
// Design: most citizens just talk. A smaller set has *one* useful extra
// (patch, meal, tip, fence a core, job). No mini-shops on every face.

export type NpcServiceId =
  | "chat"
  | "bounty"
  | "fish"
  | "heal_paid"
  | "heal_charity"
  | "meal"
  | "rest"
  | "cool_down"
  | "rumor"
  | "intel"
  | "train"
  | "buy_core"
  | "sell_core"
  | "bless"
  | "open_vendor"
  | "open_forge"
  | "open_market"
  | "open_guild"
  | "open_contracts"
  | "open_stash"
  | "open_board"
  | "open_cosmetics";

/** Client-only actions (no server round-trip). */
export const CLIENT_OPEN_SERVICES: ReadonlySet<NpcServiceId> = new Set([
  "open_vendor",
  "open_forge",
  "open_market",
  "open_guild",
  "open_contracts",
  "open_stash",
  "open_board",
  "open_cosmetics",
  "chat",
]);

export type NpcRole =
  | "ally"
  | "medic"
  | "bartender"
  | "broker"
  | "vendor"
  | "fixer_guild"
  | "fence"
  | "courier"
  | "preacher"
  | "mechanic"
  | "cook"
  | "guard"
  | "artist"
  | "scribe"
  | "scrapper"
  | "resident"
  | "transit"
  | "ambient";

export interface NpcServiceDef {
  id: NpcServiceId;
  label: string;
  hint: string;
  cost: number;
  coresCost?: number;
  cooldownSec: number;
  color: string;
}

/** Premium service-menu icon keyed to the generated Higgsfield icon pack. */
export function serviceIconKey(id: NpcServiceId): string {
  const icon: Partial<Record<NpcServiceId, string>> = {
    bounty: "bounty",
    heal_paid: "heal",
    heal_charity: "heal",
    meal: "credits",
    rest: "sleep",
    cool_down: "heat",
    rumor: "district_marker",
    intel: "neural_implant",
    train: "weapon_upgrade",
    buy_core: "credits",
    sell_core: "pawn",
    bless: "armor",
    open_vendor: "pawn",
    open_forge: "repair",
    open_market: "credits",
    open_guild: "district_marker",
    open_contracts: "radio_contract",
    open_stash: "armor",
    open_board: "leaderboard",
    open_cosmetics: "armor",
  };
  return `hf_service_${icon[id] ?? "quest_pickup"}`;
}

/** Street services — costs are sinks vs kill emit (CREDITS_PER_KILL). */
export const NPC_SERVICES: Record<NpcServiceId, NpcServiceDef> = {
  chat: { id: "chat", label: "Talk", hint: "just talk", cost: 0, cooldownSec: 0, color: "#9aa3b2" },
  bounty: { id: "bounty", label: "Job", hint: "work for them", cost: 0, cooldownSec: 0, color: "#d4c45a" },
  // Docks pier line — flavour faucet, tightly cooldowned; most casts catch a story.
  fish: { id: "fish", label: "Fish", hint: "cast a line off the pier", cost: 0, cooldownSec: 45, color: "#6ab0ff" },
  heal_paid: { id: "heal_paid", label: "Patch", hint: "₵45 · full heal", cost: 45, cooldownSec: 15, color: "#5fd49a" },
  heal_charity: { id: "heal_charity", label: "Free patch", hint: "partial heal · cooldown", cost: 0, cooldownSec: 180, color: "#7abf98" },
  meal: { id: "meal", label: "Eat", hint: "₵18 · small heal", cost: 18, cooldownSec: 40, color: "#c49a5a" },
  rest: { id: "rest", label: "Sleep", hint: "₵35 · full heal + clear HEAT", cost: 35, cooldownSec: 120, color: "#d88ac8" },
  cool_down: { id: "cool_down", label: "Vent", hint: "₵20 · clear HEAT", cost: 20, cooldownSec: 45, color: "#5aa8b8" },
  rumor: { id: "rumor", label: "Tip", hint: "₵22 · a street tip", cost: 22, cooldownSec: 90, color: "#a87898" },
  intel: { id: "intel", label: "Intel", hint: "₵50 · a deeper tip", cost: 50, cooldownSec: 150, color: "#b06898" },
  train: { id: "train", label: "Spar", hint: "₵55 · a little XP", cost: 55, cooldownSec: 300, color: "#6a8ab8" },
  buy_core: { id: "buy_core", label: "Buy core", hint: "₵110 · +1 core", cost: 110, cooldownSec: 20, color: "#5a98b0" },
  sell_core: { id: "sell_core", label: "Fence core", hint: "−1 core · +₵22", cost: 0, coresCost: 1, cooldownSec: 10, color: "#b07060" },
  bless: { id: "bless", label: "Blessing", hint: "brief cover · long CD", cost: 0, cooldownSec: 360, color: "#8870b0" },
  open_vendor: { id: "open_vendor", label: "Stall", hint: "vendor stock", cost: 0, cooldownSec: 0, color: "#5aa8b8" },
  open_forge: { id: "open_forge", label: "Forge", hint: "workbench", cost: 0, cooldownSec: 0, color: "#b06898" },
  open_market: { id: "open_market", label: "Market", hint: "auction board", cost: 0, cooldownSec: 0, color: "#a89850" },
  open_guild: { id: "open_guild", label: "Cell", hint: "cell board", cost: 0, cooldownSec: 0, color: "#6a8ab8" },
  open_contracts: { id: "open_contracts", label: "Contracts", hint: "daily board", cost: 0, cooldownSec: 0, color: "#5fd49a" },
  open_stash: { id: "open_stash", label: "Stash", hint: "lockbox", cost: 0, cooldownSec: 0, color: "#8a9098" },
  open_board: { id: "open_board", label: "Board", hint: "records", cost: 0, cooldownSec: 0, color: "#70a8a8" },
  open_cosmetics: { id: "open_cosmetics", label: "Wardrobe", hint: "skins", cost: 0, cooldownSec: 0, color: "#a87898" },
};

/**
 * Role defaults — usually just chat. Signature extras are sparse.
 * (Overrides below beat these when set.)
 */
const ROLE_SERVICES: Record<NpcRole, NpcServiceId[]> = {
  ally: ["chat", "bounty"],
  medic: ["chat", "heal_charity"],
  bartender: ["chat", "meal"],
  broker: ["chat", "rumor"],
  vendor: ["chat"],
  fixer_guild: ["chat", "bounty"],
  fence: ["chat", "sell_core"],
  courier: ["chat"],
  preacher: ["chat", "bless"],
  mechanic: ["chat", "cool_down"],
  cook: ["chat", "meal"],
  guard: ["chat"],
  artist: ["chat"],
  scribe: ["chat", "rumor"],
  scrapper: ["chat"],
  resident: ["chat"],
  transit: ["chat"],
  ambient: ["chat"],
};

/**
 * Explicit menus — kept short (talk + at most 1–2 extras).
 * Variety comes from *who* does what, not from long lists.
 */
const NPC_SERVICE_OVERRIDES: Record<string, NpcServiceId[]> = {
  // Story allies — room systems + soft extras
  rin: ["chat", "open_vendor", "bounty"],
  doc: ["chat", "heal_charity", "heal_paid", "bounty"],
  vex: ["chat", "open_market", "rumor", "bounty"],
  marek: ["chat", "bounty"],
  // Hub cast
  juno: ["chat", "bounty"],
  sable: ["chat", "meal", "open_contracts", "bounty"],
  kessler: ["chat", "open_guild", "bounty"],
  mira: ["chat", "open_vendor", "bounty"],
  ghost: ["chat", "sell_core", "open_market", "bounty"],
  // Regional — light
  porter: ["chat", "bounty", "rumor", "fish"],
  tunnel_rat: ["chat", "bounty", "cool_down"],
  arc_tech: ["chat", "cool_down", "bounty"],
  scrap_boss: ["chat", "bounty", "sell_core"],
  hawker: ["chat", "bounty", "rumor"],
  preacher: ["chat", "bless", "bounty"],
  street_kid: ["chat", "bounty", "rumor"],
  subway_warden: ["chat", "bounty", "rumor"],
  // Ambient streets — mostly just chat; a few have a quiet extra
  amb_drifter: ["chat"],
  amb_courier: ["chat", "bounty"],
  amb_dockhand: ["chat"],
  amb_arc_clerk: ["chat", "rumor"],
  amb_tech: ["chat", "cool_down", "bounty"],
  amb_vendor: ["chat", "meal", "bounty"],
  // Field triage is deliberately charity-only: useful during a run, but the long
  // server cooldown prevents a combat district from replacing the paid clinic sink.
  field_medic_patch: ["chat", "heal_charity"],
  field_medic_suture: ["chat", "heal_charity"],
  field_medic_gauze: ["chat", "heal_charity"],
  field_medic_needle: ["chat", "heal_charity"],
  // Keepers — job matching the room (open_* opens the real system panel)
  keep_bar: ["chat", "meal", "open_contracts", "bounty"],
  keep_noodle: ["chat", "meal", "bounty"],
  keep_ripperdoc: ["chat", "heal_charity", "heal_paid", "bounty"],
  keep_pawn: ["chat", "open_vendor", "rumor", "bounty"],
  keep_arcade: ["chat", "open_board", "rumor", "bounty"],
  keep_garage: ["chat", "open_forge", "cool_down", "bounty"],
  keep_radio: ["chat", "open_contracts", "rumor", "bounty"],
  keep_shop: ["chat", "open_vendor", "rumor"],
  keep_clinic: ["chat", "heal_charity", "heal_paid", "bounty"],
  keep_guild: ["chat", "open_guild", "open_forge", "bounty"],
  keep_den: ["chat", "open_market", "sell_core"],
  keep_home: ["chat", "open_stash"],
  keep_hospital: ["chat", "heal_paid", "heal_charity"],
  keep_hotel: ["chat", "rest", "bounty"],
  keep_subway: ["chat", "rumor"], // enter UNDERLINE via door / CONDUCTOR service on client
  keep_stadium: ["chat", "open_board", "bounty"],
  keep_citycenter: ["chat", "open_board", "rumor", "bounty"],
  // Residents — rotate single specialties (not full kits)
  res_nix: ["chat", "rumor", "bounty"],
  res_solenne: ["chat", "bounty"],
  res_raze: ["chat", "bounty"],
  res_moth: ["chat", "rumor", "bounty"],
  res_dash: ["chat", "bounty"],
  res_cinder: ["chat", "cool_down", "bounty"],
  res_echo: ["chat", "bounty"],
  res_tallow: ["chat", "meal", "bounty"],
  res_wren: ["chat", "cool_down", "bounty"],
  res_pike: ["chat", "bounty"],
  res_hollow: ["chat", "bless", "bounty"],
  res_ferro: ["chat"],
  res_static: ["chat", "bounty"],
  res_rook: ["chat", "rumor"],
  res_plume: ["chat"],
  res_grist: ["chat", "meal"],
  res_velvet: ["chat", "meal", "bounty"],
  res_coil: ["chat", "cool_down", "bounty"],
  res_ash: ["chat", "bounty"],
  res_brick: ["chat", "bounty"],
  res_sparrow: ["chat", "sell_core"],
  res_lumen: ["chat"],
  res_quill: ["chat", "bounty", "rumor"],
  res_glass: ["chat", "rumor", "bounty"],
  res_juniper: ["chat"],
  res_tin: ["chat", "cool_down"],
  res_mercy: ["chat", "heal_charity", "bounty"],
  res_borne: ["chat", "bounty"],
  res_lace: ["chat"],
  res_odd: ["chat"],
  res_salt: ["chat", "bounty"],
  res_pip: ["chat", "rumor"],
};

/** Role tags for quiet headers. */
export const NPC_ROLES: Record<string, NpcRole> = {
  rin: "ally",
  doc: "medic",
  vex: "broker",
  marek: "ally",
  juno: "courier",
  sable: "bartender",
  kessler: "fixer_guild",
  mira: "vendor",
  ghost: "fence",
  porter: "courier",
  tunnel_rat: "scrapper",
  arc_tech: "mechanic",
  scrap_boss: "scrapper",
  hawker: "vendor",
  preacher: "preacher",
  street_kid: "courier",
  subway_warden: "transit",
  amb_drifter: "ambient",
  amb_courier: "courier",
  amb_dockhand: "ambient",
  amb_arc_clerk: "scribe",
  amb_tech: "mechanic",
  amb_vendor: "cook",
  field_medic_patch: "medic",
  field_medic_suture: "medic",
  field_medic_gauze: "medic",
  field_medic_needle: "medic",
  keep_bar: "bartender",
  keep_shop: "vendor",
  keep_clinic: "medic",
  keep_guild: "fixer_guild",
  keep_den: "fence",
  keep_home: "resident",
  keep_hospital: "medic",
  keep_hotel: "bartender",
  keep_subway: "transit",
  keep_stadium: "guard",
  keep_citycenter: "scribe",
  res_nix: "fence",
  res_solenne: "guard",
  res_raze: "guard",
  res_moth: "broker",
  res_dash: "courier",
  res_cinder: "mechanic",
  res_echo: "artist",
  res_tallow: "cook",
  res_wren: "mechanic",
  res_pike: "guard",
  res_hollow: "preacher",
  res_ferro: "mechanic",
  res_static: "artist",
  res_rook: "scribe",
  res_plume: "vendor",
  res_grist: "cook",
  res_velvet: "bartender",
  res_coil: "mechanic",
  res_ash: "resident",
  res_brick: "resident",
  res_sparrow: "fence",
  res_lumen: "artist",
  res_quill: "scribe",
  res_glass: "broker",
  res_juniper: "cook",
  res_tin: "mechanic",
  res_mercy: "medic",
  res_borne: "courier",
  res_lace: "artist",
  res_odd: "preacher",
  res_salt: "guard",
  res_pip: "courier",
};

const ROLE_LABEL: Record<NpcRole, string> = {
  ally: "ally",
  medic: "medic",
  bartender: "bar",
  broker: "broker",
  vendor: "vendor",
  fixer_guild: "guild",
  fence: "fence",
  courier: "courier",
  preacher: "preacher",
  mechanic: "mech",
  cook: "cook",
  guard: "guard",
  artist: "artist",
  scribe: "scribe",
  scrapper: "scrap",
  resident: "local",
  transit: "transit",
  ambient: "citizen",
};

export function npcRole(npcId: string | undefined | null): NpcRole {
  if (!npcId) return "ambient";
  return NPC_ROLES[npcId] ?? (npcId.startsWith("keep_") ? "resident" : npcId.startsWith("res_") ? "resident" : "ambient");
}

export function npcRoleLabel(npcId: string | undefined | null): string {
  return ROLE_LABEL[npcRole(npcId)];
}

/** Services this NPC offers (chat first, de-duped). Most return only `chat`. */
export function servicesForNpc(npcId: string | undefined | null, hasBounty = true): NpcServiceId[] {
  if (!npcId) return ["chat"];
  const raw = NPC_SERVICE_OVERRIDES[npcId] ?? ROLE_SERVICES[npcRole(npcId)] ?? ["chat"];
  const out: NpcServiceId[] = [];
  const seen = new Set<NpcServiceId>();
  for (const id of ["chat" as NpcServiceId, ...raw]) {
    if (!NPC_SERVICES[id] || seen.has(id)) continue;
    if (id === "bounty" && !hasBounty) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length ? out : ["chat"];
}

/** True when the NPC has more than flavour talk (show a small menu). */
export function npcHasMenu(npcId: string | undefined | null, hasBounty = false): boolean {
  const s = servicesForNpc(npcId, hasBounty);
  return s.some((id) => id !== "chat");
}

export const RUMOR_TIPS: string[] = [
  "East gates get busy after dark.",
  "Bosses drop cores — leave bag space.",
  "THE CRUCIBLE is $METRO only.",
  "Plaza tunnels go under. Bring a weapon.",
  "Auction fees add up. List less junk.",
  "Cell bank deposits raise guild XP.",
  "Furniture stays. Bag loot doesn't.",
  "Vent HEAT before a long dive.",
  "Contracts flip on the UTC day.",
  "Wayfarer camps on the bridges talk free.",
  "Black-ICE needs a little rep first.",
  "Fences lowball cores. Still better than zero.",
];

export const INTEL_TIPS: string[] = [
  "Check your objective before you deploy.",
  "Auction mail lands when you browse the board.",
  "Arena pots are $METRO, never credits.",
  "Dive fragments are once per core.",
  "Don't dual-tab the same wallet mid-travel.",
];

export function npcServiceXp(service: NpcServiceId, level: number): number {
  const lv = Math.max(1, Math.floor(level) || 1);
  switch (service) {
    case "rumor":
      return 3 + Math.min(5, lv);
    case "intel":
      return 8 + Math.min(12, lv);
    case "train":
      return 12 + Math.min(24, lv * 2);
    default:
      return 0;
  }
}

export const SELL_CORE_PAYOUT = 22;
export const HEAL_PAID_COST = NPC_SERVICES.heal_paid.cost;
export const HEAL_CHARITY_FRAC = 0.4;
export const MEAL_HEAL_FRAC = 0.22;
export const MEAL_HEAT_DUMP = 20;
/** ~2s at 20Hz */
export const BLESS_IFRAME_TICKS = 40;
