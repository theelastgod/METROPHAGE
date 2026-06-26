// METROPHAGE netcode protocol — the message contract shared by client and server.
// Movement/sim constants live in ./sim (the single source both sides simulate with).

import { NET_TICK_MS } from "./sim";
import type { Item } from "../game/items";

export { NET_TICK_MS };
export type { Item };

/** One buffered local input the client keeps until the server acks its seq. */
export interface InputCmd {
  seq: number;
  mx: number;
  my: number;
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
  skin: number; // -1 = SYNTH (cyber), else a human skin tone
  sex: string; // "f" | "m" — human body type
  hair: string;
  hairColor: number;
  beard: string;
  antennae: boolean;
  emblem: boolean;
  strap: boolean;
}

/**
 * The exact message a client signs with its Solana wallet to prove identity at login.
 * Shared by the client (signs) and the server (verifies) so the bytes always match.
 * The timestamp bounds replay; the server additionally checks freshness.
 */
export function loginMessage(wallet: string, ts: number): string {
  return `METROPHAGE login\nwallet: ${wallet}\nts: ${ts}`;
}

// client -> server
export type ClientMsg =
  // login: a signed wallet (wallet+sig+ts) is a durable identity; without one the
  // server falls back to a guest id derived from the callsign (dev / no-wallet play).
  | { t: "login"; name: string; faction?: number; look?: PlayerLook; wallet?: string; sig?: string; ts?: number }
  | { t: "input"; seq: number; mx: number; my: number }
  | { t: "fire"; seq: number; aim: number } // aim in radians; server validates rate
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
  | { t: "party"; action: "invite" | "accept" | "leave"; to?: string }
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
  | { t: "tutorial"; action: "skip" | "graduate" | "progress" | "mode"; kind?: string; mode?: "quick" | "full" }
  | { t: "buy"; sku: string } // vendor purchase (heal / gear cache), priced + validated server-side
  | { t: "emote"; kind: number; ping: boolean; x: number; y: number } // emote (above avatar) or world ping
  | {
      t: "trade";
      action: "request" | "accept" | "offer" | "confirm" | "cancel";
      to?: string;
      credits?: number;
      cores?: number;
    };

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
      sing: number; // shared server-wide Singularity meter (0..SING_MAX)
      meltdown: boolean;
      season: number; // current era — increments each time a meltdown resets the world
      factions: number[]; // global faction contribution scores (server-wide)
      control: number; // faction controlling THIS district (NEUTRAL if none)
      roster: RosterEntry[]; // presence — everyone in this zone
      // zone-wide world-boss status (not AOI-culled) so any player can locate it:
      boss?: { name: string; x: number; y: number; hp: number; hpMax: number; alive: boolean; respawnSec: number };
    }
  | { t: "chat"; from: string; faction: number; ch: string; text: string }
  | { t: "party"; members: string[] }
  | { t: "sys"; text: string }
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
  | { t: "inv"; items: Item[] } // the owning client's full inventory (login + on change)
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
  | { t: "discovered"; zones: string[] }
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
