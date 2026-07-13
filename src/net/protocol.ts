// METROPHAGE netcode protocol — the message contract shared by client and server.
// Movement/sim constants live in ./sim (the single source both sides simulate with).

import { NET_TICK_MS } from "./sim";
import type { Item } from "../game/items";

export { NET_TICK_MS };
export type { Item };

/**
 * Wire-format version. Bump when ClientMsg/ServerMsg shapes break backwards
 * compatibility. Server stamps it on welcome; client warns on mismatch so a
 * stale Pages cache against a new Worker is obvious (hard refresh), not silent.
 */
export const PROTOCOL_VERSION = 4;

/** One buffered local input the client keeps until the server acks its seq. */
export interface InputCmd {
  seq: number;
  mx: number;
  my: number;
  /** Client-side only: this tick was mid-dash — prediction + reconciliation replay
   *  must move at dash speed along the dash vector, mirroring the server's sim. */
  dashX?: number;
  dashY?: number;
}

/** Compact player appearance (no callsign) — sent on login, relayed in snapshots so
 *  everyone renders everyone else's customization. Enums are strings; the receiver
 *  sanitizes before baking. Colour is applied as an in-scene tint. */
export interface PlayerLook {
  color: number;
  build: string;
  head: string;
  visor: string;
  shoulders: string;
  decal: string;
  cloak: string;
  skin: number; // human skin tone (legacy -1 repaired client-side to a default)
  sex: string; // "f" | "m" — human body type
  hair: string;
  hairColor: number;
  beard: string;
  faceMark: string;
  eyeColor: number;
  gloves: string;
  legGear: string;
  accentColor: number;
  antennae: boolean;
  emblem: boolean;
  strap: boolean;
}

/**
 * The exact message a client signs with MetaMask (personal_sign) or a Solana wallet
 * at login / identity. Client and server must use the same string; server checks ts freshness.
 */
export function loginMessage(wallet: string, ts: number): string {
  return `METROPHAGE login\nwallet: ${wallet}\nts: ${ts}`;
}

// client -> server
export type ClientMsg =
  // login: a signed wallet (wallet+sig+ts) is a durable identity; without one the
  // server falls back to a guest id derived from the callsign (dev / no-wallet play).
  | {
      t: "login";
      name: string;
      faction?: number;
      look?: PlayerLook;
      wallet?: string;
      sig?: string;
      ts?: number;
      /** organic = walked/deployed in; fast = map/teleport (fog only, no fast-travel unlock). */
      arrival?: "organic" | "fast";
      /** Zone the runner travelled from — sets trail-gate spawn on wilderness corridors. */
      from?: string;
      /** Class id (metrophage/k-guerilla/wintermute/swarm) — selects the signature ability. */
      classId?: string;
      /** Guest-identity device secret — generated client-side, bound to the callsign on
       *  first login, required to log in as that callsign thereafter (wallet sig bypasses). */
      secret?: string;
      /**
       * Wallet device session — bound after the first successful MetaMask signature.
       * Lets zone travel re-auth without another personal_sign popup.
       */
      session?: string;
    }
  | { t: "inv_move"; from: number; to: number }
  | { t: "stash"; action: "deposit" | "withdraw"; itemId: string } // TENEMENT lockbox — move an item bag↔stash
  /** Graceful leave — server flushes durable state then replies `bye` (zone travel). */
  | { t: "leave" }
  | { t: "input"; seq: number; mx: number; my: number }
  | { t: "fire"; seq: number; aim: number } // aim in radians; server validates rate
  | { t: "dash"; seq: number; dx: number; dy: number } // burst move; server validates cooldown + grants i-frames
  | { t: "ability"; seq: number; aim: number } // class signature (Q); server validates cooldown + resolves the effect
  | { t: "ability2"; seq: number; aim: number } // class secondary (E); server validates cooldown + resolves the effect
  | { t: "ult"; seq: number; aim: number } // class ultimate (R); server gates on HEAT and spends it
  | { t: "chat"; ch: "zone" | "party" | "whisper" | "guild"; to?: string; text: string }
  // guilds ("Cells") — server validates rank/balance + owns the shared bank (cross-zone, D1)
  | {
      t: "guild";
      action: "create" | "invite" | "accept" | "leave" | "promote" | "demote" | "kick" | "deposit" | "withdraw" | "info";
      name?: string;
      tag?: string;
      to?: string;
      credits?: number;
      cores?: number;
    }
  | { t: "party"; action: "invite" | "accept" | "leave" | "revive"; to?: string }
  | { t: "mute"; to: string }
  | { t: "equip"; itemId: string } // equip an inventory item into its slot
  | { t: "unequip"; slot: string }
  // gear forge — server validates legality + deducts credits/cores (itemId2 = fuse partner)
  | { t: "craft"; action: "upgrade" | "reforge" | "salvage" | "fuse"; itemId: string; itemId2?: string }
  // auction house — server escrows the item + settles atomically (cross-zone, D1)
  | { t: "market"; action: "list" | "cancel" | "buy" | "browse"; id?: number; itemId?: string; price?: number; currency?: "credits" | "metro" }
  // cosmetics / transmog — appearance overrides (zero power); NFT tier gated server-side
  | { t: "cosmetic"; action: "buy" | "equip" | "unequip" | "list"; id?: string }
  // authored NPC bounties — accept a quest-giver's repeatable job (server validates + grants)
  | { t: "bounty"; action: "accept"; id: string }
  // personal campaign — accept a quest from THE FIXER or resolve a talk beat
  | { t: "quest"; action: "accept"; id?: string }
  | { t: "quest"; action: "talk" }
  /** Unified FIXER interact: accept next offer, resolve talk beat, or re-send current story. */
  | { t: "quest"; action: "engage" }
  | { t: "tutorial"; action: "skip" | "graduate" | "progress" | "mode"; kind?: string; mode?: "quick" | "full"; n?: number }
  | { t: "buy"; sku: string } // vendor purchase (heal / gear cache), priced + validated server-side
  | { t: "emote"; kind: number; ping: boolean; x: number; y: number } // emote (above avatar) or world ping
  // player housing (THE ESTATES) — buy/resell/furnish/sign an est{K} home; server owns ownership in D1
  | { t: "estate"; action: "buy" | "list" | "unlist" | "furnish" | "sign"; price?: number; furniture?: EstateFurniture[] }
  | {
      t: "trade";
      action: "request" | "accept" | "offer" | "confirm" | "cancel";
      to?: string;
      credits?: number;
      cores?: number;
    };

/** A placed furniture item in a home (mirrors world/estates FurniturePiece). */
export interface EstateFurniture {
  k: string;
  x: number;
  y: number;
}

export interface TradeOffer {
  credits: number;
  cores: number;
}

export interface RosterEntry {
  id: string;
  faction: number;
  level: number;
}

export interface PlayerSnap {
  id: string;
  x: number;
  y: number;
  ack: number;
  hp: number;
  dead: boolean;
  credits: number;
  cores: number;
  metro: number;
  xp: number;
  level: number;
  faction: number;
  /** Personal campaign — only meaningful on the local player; omitted for remotes when null. */
  campaignQuest: string | null;
  campaignStage: number;
  campaignProgress: number;
  campaignObjective: string;
  tutorialStep: number;
  tutorialProgress: number;
  tutorialDone: boolean;
  inTutorial: boolean;
  look?: PlayerLook; // appearance, so remotes render this player's customization
  /** In THE CRUCIBLE with an active $METRO buy-in. */
  pvpInArena?: boolean;
  /** Mid-dash this snapshot — clients render the burst (trail/afterimage). */
  dash?: 1;
  /** Escort active (drones/minions) — clients render the orbiting companions. */
  escort?: 1;
  /** HEAT 0–100 (own player only) — the risk meter that fuels the ultimate. */
  heat?: number;
  /** Buy-in + elimination loot (local player only). */
  pvpEscrow?: number;
}
export interface EnemySnap {
  id: number;
  x: number;
  y: number;
  hp: number;
  kind: number; // HSS archetype: 0 patrol · 1 wasp · 2 lancer · 3 hound
  // world boss (a named, tougher enemy that respawns) — extra render data:
  boss?: boolean;
  name?: string;
  tint?: number; // boss accent colour (corp identity)
  hpMax?: number; // full HP, for the boss health bar
  hvt?: boolean; // today's HIGH-VALUE TARGET — gold label + hunt callout
}
export interface ShotSnap {
  id: number;
  x: number;
  y: number;
  team: 0 | 1; // 0 = player shot, 1 = enemy shot
}
export interface PickupSnap {
  id: number;
  x: number;
  y: number;
  kind: number; // PICKUP_CREDIT | PICKUP_CORE
}
export interface HazardSnap {
  id: number;
  x: number;
  y: number;
  r: number; // radius (world px)
  frac: number; // 0 = just telegraphed, 1 = detonating (telegraph fill)
  /** Player-owned strike (K-GUERILLA airstrike) — renders friendly, hits enemies. */
  friendly?: 1;
}
export interface NodeSnap {
  id: number;
  x: number;
  y: number;
  owner: number; // faction index, or NEUTRAL (-1)
  progress: number; // 0..1 capture progress
  by: number; // faction currently channelling (NEUTRAL if none)
}

// server -> client
export type ServerMsg =
  | {
      t: "welcome";
      id: string;
      x: number;
      y: number;
      tickMs: number;
      world: { w: number; h: number };
      faction: number;
      /** Server protocol version — client compares to PROTOCOL_VERSION. */
      protocol?: number;
      look?: PlayerLook;
      lookLocked?: boolean;
      fragments?: string[]; // memory fragments this player has recovered (dive rewards)
      /** Operator account — invulnerable, full map, unrestricted access. */
      god?: boolean;
    }
  | {
      t: "state";
      tick: number;
      players: PlayerSnap[];
      enemies: EnemySnap[];
      shots: ShotSnap[];
      pickups: PickupSnap[];
      hazards: HazardSnap[]; // telegraphed boss AoE zones (raid mechanics)
      nodes: NodeSnap[];
      factions: number[]; // global faction contribution scores (server-wide)
      control: number; // faction controlling THIS district (NEUTRAL if none)
      roster: RosterEntry[]; // presence — everyone in this zone
      // zone-wide world-boss status (not AOI-culled) so any player can locate it:
      boss?: { name: string; x: number; y: number; hp: number; hpMax: number; alive: boolean; respawnSec: number };
    }
  | { t: "chat"; from: string; faction: number; ch: string; text: string; x?: number; y?: number }
  | { t: "party"; members: string[] }
  | { t: "sys"; text: string }
  /** Kit/dash outcome — client rolls back optimistic CDs when ok:false. */
  | { t: "kit_ack"; slot: "dash" | "q" | "e" | "r"; ok: boolean; cdMs?: number }
  /** Server finished durable flush on disconnect (zone travel can open the next socket). */
  | { t: "bye" }
  | { t: "emote"; from: string; kind: number; ping: boolean; x: number; y: number } // relayed emote/ping
  | {
      t: "story";
      quest: string;
      stage: string;
      title: string;
      text: string;
      journal: string;
      objective: string;
      done: boolean;
    }
  /** Full campaign journal for the quest log (main + completed). */
  | {
      t: "campaign";
      activeId: string | null;
      stage: number;
      progress: number;
      objective: string;
      completed: string[];
    }
  // a memory fragment recovered at an ICE-dive core (new=false when already held)
  | { t: "fragment"; id: string; title: string; lines: string[]; isNew: boolean }
  // dynamic world event phase change in this district (telegraph -> active -> end)
  | { t: "event"; id: string; name: string; tagline: string; hex: string; phase: "telegraph" | "active" | "end"; seconds: number }
  | { t: "inv"; items: Item[] } // the owning client's full inventory (login + on change)
  | { t: "stashv"; items: Item[] } // owning client's personal stash (login + on change)
  // player housing — the current estate's ownership + furniture + visitor book (sent on entering an est{K} home + on change)
  | {
      t: "estate";
      id: string;
      owner: string | null;
      ownerName: string | null;
      mine: boolean;
      forSale: boolean;
      price: number;
      furniture: EstateFurniture[];
      guests: { n: string; at: number; s: string }[];
    }
  // player housing — the whole street's ownership at a glance (sent on entering THE ESTATES)
  | { t: "estates_dir"; list: { i: number; owner: string | null; name: string | null; forSale: boolean; price: number; furn: number; guests: number }[] }
  | { t: "equipped"; items: Item[]; maxHp: number } // owning client's equipped gear + derived max HP
  | { t: "achv"; ids: string[] } // full unlocked achievement set (sent on login)
  | { t: "ach"; id: string; name: string; reward: number } // a freshly-unlocked achievement
  // daily contracts + reputation — pushed on login + whenever progress changes
  | {
      t: "contracts";
      day: number;
      rep: number;
      repTier: number;
      list: Array<{
        id: string;
        name: string;
        desc: string;
        objective: string;
        count: number;
        progress: number;
        done: boolean;
        rewardCredits: number;
        rewardRep: number;
      }>;
    }
  // auction house — open listings (browse result), refreshed on any market change
  | {
      t: "market";
      listings: Array<{ id: number; seller: string; sellerName: string; item: Item; price: number; currency: string }>;
    }
  // cosmetics — owned set + the equipped transmog (sent on login + on change)
  | { t: "cosmetics"; owned: string[]; equipped: string | null }
  // authored NPC bounty — the player's active job (or null), sent on login + on change
  | { t: "bounty"; active: { id: string; name: string; desc: string; objective: string; count: number; progress: number } | null }
  // map discovery — the set of zones this account has arrived at (drives fast travel), on login
  | { t: "discovered"; zones: string[]; unlocked: string[] }
  // guild ("Cell") state — full summary + roster, or "none" when not in a cell
  | {
      t: "guild";
      state: "info" | "none";
      guild?: {
        id: number;
        name: string;
        tag: string;
        level: number;
        xp: number;
        bankCredits: number;
        bankCores: number;
        rank: string;
        members: Array<{ id: string; rank: string }>;
      };
    }
  | {
      t: "trade";
      state: "open" | "update" | "done" | "cancelled";
      with?: string;
      youOffer?: TradeOffer;
      theyOffer?: TradeOffer;
      youConfirm?: boolean;
      theyConfirm?: boolean;
      text?: string;
    }
  | {
      t: "tutorial";
      step: number;
      total: number;
      mode: "quick" | "full";
      title: string;
      teach: string;
      hint: string;
      objective: string;
      progress: number;
      count: number;
      portalOpen: boolean;
    }
  | { t: "redirect"; zone: string; text: string }
  | { t: "error"; message: string };
