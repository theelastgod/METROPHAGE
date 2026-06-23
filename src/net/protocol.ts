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
  | { t: "login"; name: string }
  | { t: "input"; seq: number; mx: number; my: number };

// server -> client
export type ServerMsg =
  | {
      t: "welcome";
      id: string;
      x: number;
      y: number;
      tickMs: number;
      world: { w: number; h: number };
    }
  | { t: "state"; tick: number; players: Array<{ id: string; x: number; y: number; ack: number }> }
  | { t: "error"; message: string };
