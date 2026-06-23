// METROPHAGE netcode protocol — the message contract shared by client and server.
// Movement/sim constants live in ./sim (the single source both sides simulate with).

import { NET_TICK_MS } from "./sim";

export { NET_TICK_MS };

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
  hair: string;
  hairColor: number;
  antennae: boolean;
  emblem: boolean;
  strap: boolean;
}

// client -> server
export type ClientMsg =
  | { t: "login"; name: string; faction?: number; look?: PlayerLook }
  | { t: "input"; seq: number; mx: number; my: number }
  | { t: "fire"; seq: number; aim: number } // aim in radians; server validates rate
  | { t: "chat"; ch: "zone" | "party" | "whisper"; to?: string; text: string }
  | { t: "party"; action: "invite" | "accept" | "leave"; to?: string }
  | { t: "mute"; to: string }
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
    }
  | { t: "chat"; from: string; faction: number; ch: string; text: string }
  | { t: "party"; members: string[] }
  | { t: "sys"; text: string }
  | { t: "story"; act: string; title: string; text: string; step: number; done: boolean }
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
