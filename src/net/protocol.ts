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

// client -> server
export type ClientMsg =
  | { t: "login"; name: string; faction?: number }
  | { t: "input"; seq: number; mx: number; my: number }
  | { t: "fire"; seq: number; aim: number }; // aim in radians; server validates rate

export interface PlayerSnap {
  id: string;
  x: number;
  y: number;
  ack: number;
  hp: number;
  dead: boolean;
  credits: number;
  xp: number;
  level: number;
  faction: number;
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
      factions: number[]; // global faction contribution scores (server-wide)
      control: number; // faction controlling THIS district (NEUTRAL if none)
    }
  | { t: "error"; message: string };
