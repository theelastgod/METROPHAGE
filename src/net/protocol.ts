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
  | { t: "chat"; ch: "zone" | "party" | "whisper"; to?: string; text: string }
  | { t: "party"; action: "invite" | "accept" | "leave"; to?: string }
  | { t: "mute"; to: string }
  | { t: "equip"; itemId: string } // equip an inventory item into its slot
  | { t: "unequip"; slot: string }
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
  questStep: number; // index into QUESTLINE (=== length when complete)
  questProgress: number; // count toward the current step's objective
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
  | { t: "story"; act: string; title: string; text: string; step: number; done: boolean }
  | { t: "inv"; items: Item[] } // the owning client's full inventory (login + on change)
  | { t: "equipped"; items: Item[]; maxHp: number } // owning client's equipped gear + derived max HP
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
  | { t: "error"; message: string };
