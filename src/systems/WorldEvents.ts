import { WORLD_EVENTS, WorldEventDef } from "../game/worldEvents";
import { WORLD_EVENT } from "../config";

/** GameScene implements this — the scheduler drives the phases, the host the FX. */
export interface WorldEventHost {
  heatNorm(): number;
  contagionNorm(): number;
  onEventTelegraph(def: WorldEventDef): void;
  onEventStart(def: WorldEventDef): void;
  onEventTick(def: WorldEventDef, dtMs: number): void;
  onEventEnd(def: WorldEventDef): void;
}

type Phase = "idle" | "telegraph" | "active";

/**
 * WorldEvents — schedules dynamic district events: idle → telegraph (warning) →
 * active (effect runs) → reward → idle. Picks weighted among events eligible for
 * the current Heat. Pure timing/state; the host runs the actual effects + payout.
 * Transient per district run (not persisted); call reset() on (re)entry.
 */
export default class WorldEvents {
  private host: WorldEventHost;
  private phase: Phase = "idle";
  private current?: WorldEventDef;
  private phaseUntil = 0;
  private nextAt = 0;

  constructor(host: WorldEventHost) {
    this.host = host;
  }

  reset(now: number) {
    this.phase = "idle";
    this.current = undefined;
    this.nextAt = now + WORLD_EVENT.firstDelayMs;
  }

  /** The active event id (or null) — for the HUD banner + effect gating. */
  get active(): WorldEventDef | null {
    return this.phase === "active" ? this.current ?? null : null;
  }
  get telegraphing(): WorldEventDef | null {
    return this.phase === "telegraph" ? this.current ?? null : null;
  }
  /** Seconds left in the current phase (telegraph or active). */
  secondsLeft(now: number): number {
    return Math.max(0, Math.ceil((this.phaseUntil - now) / 1000));
  }

  update(now: number, dtMs: number) {
    switch (this.phase) {
      case "idle":
        if (now >= this.nextAt) this.beginTelegraph(now);
        break;
      case "telegraph":
        if (now >= this.phaseUntil) this.beginActive(now);
        break;
      case "active":
        this.host.onEventTick(this.current!, dtMs);
        if (now >= this.phaseUntil) this.end(now);
        break;
    }
  }

  private pick(): WorldEventDef {
    const heat = this.host.heatNorm();
    const eligible = WORLD_EVENTS.filter((e) => heat >= e.minHeatNorm);
    const pool = eligible.length ? eligible : WORLD_EVENTS;
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) return e;
    }
    return pool[pool.length - 1];
  }

  private beginTelegraph(now: number) {
    this.current = this.pick();
    this.phase = "telegraph";
    this.phaseUntil = now + this.current.telegraphMs;
    this.host.onEventTelegraph(this.current);
  }

  private beginActive(now: number) {
    this.phase = "active";
    this.phaseUntil = now + this.current!.durationMs;
    this.host.onEventStart(this.current!);
  }

  private end(now: number) {
    this.host.onEventEnd(this.current!);
    this.phase = "idle";
    this.current = undefined;
    const span = WORLD_EVENT.intervalMaxMs - WORLD_EVENT.intervalMinMs;
    this.nextAt = now + WORLD_EVENT.intervalMinMs + Math.random() * span;
  }
}
