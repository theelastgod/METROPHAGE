import { describe, expect, it } from "vitest";
import {
  canRebalanceZone,
  doName,
  hardCapFor,
  isShardableZone,
  maxInstancesFor,
  parseDoName,
  parseInstParam,
  pickInstance,
  softCapFor,
} from "./zoneRouting";

describe("canRebalanceZone — never reject a player with nowhere to go", () => {
  // A DO that rejects on a zone it cannot shard sends the player to a front door
  // that routes them straight back — a closed door dressed as a rebalance.
  it.each(["w0", "w6", "tutorial", "estates", "d0i2", "h4", "vault"])(
    "refuses to rebalance non-shardable %s",
    (zone) => {
      expect(maxInstancesFor(zone)).toBe(1);
      expect(canRebalanceZone(zone)).toBe(false);
    },
  );

  it("allows rebalance on hot zones that really do shard", () => {
    for (const zone of ["safe", "subway", "d0", "d7"]) {
      expect(canRebalanceZone(zone)).toBe(true);
    }
  });

  it("refuses when sharding is configured down to a single instance", () => {
    // METRO_MAX_INSTANCES=1 makes even d0 a one-slice zone — bouncing is a loop.
    const env = { METRO_MAX_INSTANCES: "1" };
    expect(maxInstancesFor("d0", env)).toBe(1);
    expect(canRebalanceZone("d0", env)).toBe(false);
    expect(canRebalanceZone("safe", env)).toBe(false);
  });

  it("agrees with maxInstancesFor for every zone shape", () => {
    for (const zone of ["safe", "subway", "d0", "d7", "w0", "estates", "d0i2", "tutorial"]) {
      expect(canRebalanceZone(zone), zone).toBe(maxInstancesFor(zone) > 1);
    }
  });
});

describe("pickInstance — a failed probe is not an empty room", () => {
  it("never routes into an errored instance while a healthy one exists", () => {
    // The bug: error rows report players:0, score best, and win the sort — so one
    // timed-out probe drains every joiner into an instance that may be full.
    const loads = [
      { inst: 0, players: 30, tickMsAvg: 5 },
      { inst: 1, players: 0, tickMsAvg: 0, error: true },
      { inst: 2, players: 12, tickMsAvg: 5 },
    ];
    expect(pickInstance(loads, { softCap: 40, hardCap: 48, maxInst: 3 })).toBe(2);
  });

  it("prefers a busy known room over an unknown one", () => {
    const loads = [
      { inst: 0, players: 47, tickMsAvg: 9 },
      { inst: 1, players: 0, tickMsAvg: 0, error: true },
    ];
    // 47 is over soft (40) but under hard (48) — still better than flying blind.
    expect(pickInstance(loads, { softCap: 40, hardCap: 48, maxInst: 2 })).toBe(0);
  });

  it("falls back to errored instances when nothing answered", () => {
    const loads = [
      { inst: 0, players: 0, tickMsAvg: 0, error: true },
      { inst: 1, players: 0, tickMsAvg: 0, error: true },
    ];
    // A blind pick still beats no pick — must return a valid instance, not throw.
    expect([0, 1]).toContain(pickInstance(loads, { softCap: 40, hardCap: 48, maxInst: 2 }));
  });

  it("still treats a genuinely cold room as empty", () => {
    // Unprobed instances are padded as cold — that must keep working.
    const loads = [{ inst: 0, players: 39, tickMsAvg: 9 }];
    expect(pickInstance(loads, { softCap: 40, hardCap: 48, maxInst: 3 })).toBe(1);
  });
});

describe("zoneRouting", () => {
  it("doName keeps instance 0 as legacy zone id", () => {
    expect(doName("safe", 0)).toBe("safe");
    expect(doName("d0", 0)).toBe("d0");
    expect(doName("d0", 1)).toBe("d0#1");
    expect(doName("safe", 3)).toBe("safe#3");
  });

  it("parseDoName round-trips", () => {
    expect(parseDoName("d0")).toEqual({ zone: "d0", inst: 0 });
    expect(parseDoName("d0#2")).toEqual({ zone: "d0", inst: 2 });
    expect(parseDoName("safe#1")).toEqual({ zone: "safe", inst: 1 });
  });

  it("only shards hot zones", () => {
    expect(isShardableZone("safe")).toBe(true);
    expect(isShardableZone("d3")).toBe(true);
    expect(isShardableZone("subway")).toBe(true);
    expect(isShardableZone("d0i2")).toBe(false);
    expect(isShardableZone("h4")).toBe(false);
    expect(isShardableZone("estates")).toBe(false);
    expect(isShardableZone("v0")).toBe(false);
  });

  it("maxInstances is 1 for non-shardable", () => {
    expect(maxInstancesFor("h0", { METRO_MAX_INSTANCES: "8" })).toBe(1);
    expect(maxInstancesFor("d0", { METRO_MAX_INSTANCES: "8" })).toBe(8);
    expect(maxInstancesFor("d0", {})).toBe(4);
  });

  it("softCap uses hub cap for safe", () => {
    expect(softCapFor("safe", { METRO_HUB_CAP: "32" })).toBe(32);
    expect(softCapFor("d0", { METRO_INSTANCE_CAP: "25" })).toBe(25);
    expect(hardCapFor("d0", { METRO_INSTANCE_CAP: "25" })).toBe(33);
  });

  it("pickInstance honors sticky under hard cap", () => {
    const loads = [
      { inst: 0, players: 40 },
      { inst: 1, players: 5 },
      { inst: 2, players: 0 },
    ];
    expect(pickInstance(loads, { sticky: 1, softCap: 40, hardCap: 48, maxInst: 3 })).toBe(1);
  });

  it("pickInstance abandons sticky when hard-full", () => {
    const loads = [
      { inst: 0, players: 10 },
      { inst: 1, players: 50 },
    ];
    expect(pickInstance(loads, { sticky: 1, softCap: 40, hardCap: 48, maxInst: 2 })).toBe(0);
  });

  it("pickInstance fills under soft cap first (least loaded)", () => {
    const loads = [
      { inst: 0, players: 30 },
      { inst: 1, players: 12 },
      { inst: 2, players: 45 },
    ];
    expect(pickInstance(loads, { softCap: 40, hardCap: 48, maxInst: 3 })).toBe(1);
  });

  it("pickInstance spills to least loaded when all soft-full", () => {
    const loads = [
      { inst: 0, players: 44 },
      { inst: 1, players: 41 },
      { inst: 2, players: 47 },
    ];
    expect(pickInstance(loads, { softCap: 40, hardCap: 48, maxInst: 3 })).toBe(1);
  });

  it("parseInstParam rejects junk", () => {
    expect(parseInstParam(null)).toBeUndefined();
    expect(parseInstParam("")).toBeUndefined();
    expect(parseInstParam("2")).toBe(2);
    expect(parseInstParam("-1")).toBeUndefined();
    expect(parseInstParam("nope")).toBeUndefined();
  });
});
