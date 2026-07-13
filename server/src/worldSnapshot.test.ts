import { describe, expect, it } from "vitest";
import { remotePlayerView } from "./playerSnapshot";
import { buildWorldSnapshot, type SnapshotPlayerSource } from "./worldSnapshot";

function player(id: string, x: number, overrides: Partial<SnapshotPlayerSource> = {}): SnapshotPlayerSource {
  return {
    id,
    x,
    y: 20,
    hp: 77.6,
    dead: false,
    dashUntilTick: 0,
    droneUntilTick: 0,
    ack: 41,
    credits: 12_345,
    cores: 67,
    metro: 890,
    xp: 321,
    level: 4,
    faction: 2,
    campaign: { activeId: "the_wake", stage: 1, progress: 3, currentStage: { objective: "classified" } },
    tutorialStep: 2,
    tutorialProgress: 5,
    tutorialDone: false,
    pvpInArena: true,
    pvpEscrow: 250,
    heat: 61.7,
    ...overrides,
  };
}

describe("viewer-specific world snapshots", () => {
  it("keeps economy, progression and acknowledgement self-only while preserving AOI", () => {
    const self = player("self", 10);
    const remote = player("remote", 25, { credits: 999_999, metro: 50_000, ack: 987 });
    const far = player("far", 500);
    const players = [self, remote, far];
    const views = new Map(players.map((p) => [p.id, remotePlayerView(p, 10, undefined)]));

    const state = JSON.parse(
      buildWorldSnapshot({
        tick: 10,
        netTickMs: 50,
        aoiRadius: 100,
        viewer: self,
        players,
        playerViews: views,
        enemies: [],
        shots: [],
        pickups: [],
        hazards: [],
        nodes: [],
        factions: [1, 2, 3, 4],
        control: 2,
        roster: players.map((p) => ({ id: p.id, faction: p.faction, level: p.level })),
        inTutorial: false,
      }),
    );

    expect(state.players.map((p: { id: string }) => p.id)).toEqual(["self", "remote"]);
    expect(state.players[0]).toMatchObject({
      id: "self",
      ack: 41,
      credits: 12_345,
      cores: 67,
      metro: 890,
      xp: 321,
      level: 4,
      faction: 2,
      campaignQuest: "the_wake",
      campaignObjective: "classified",
      pvpEscrow: 250,
      heat: 62,
    });
    expect(state.players[1]).toEqual({ id: "remote", x: 25, y: 20, hp: 78, dead: false });
    for (const field of [
      "ack",
      "credits",
      "cores",
      "metro",
      "xp",
      "level",
      "faction",
      "campaignQuest",
      "tutorialStep",
      "pvpInArena",
      "pvpEscrow",
      "heat",
    ]) {
      expect(state.players[1]).not.toHaveProperty(field);
    }
    // Presence is deliberately zone-wide even though presentation entities use AOI.
    expect(state.roster.map((p: { id: string }) => p.id)).toEqual(["self", "remote", "far"]);
  });

  it("emits the established state envelope and entity shapes", () => {
    const self = player("self", 10, { y: 20 });
    const views = new Map([[self.id, remotePlayerView(self, 12, undefined)]]);
    const state = JSON.parse(
      buildWorldSnapshot({
        tick: 12,
        netTickMs: 50,
        aoiRadius: 50,
        viewer: self,
        players: [self],
        playerViews: views,
        enemies: [
          { id: 1, x: 12.126, y: 21.999, ox: 12, oy: 22, hp: 49.6, maxHp: 100, respawnTick: 0, kind: 2 },
          { id: 2, x: 400, y: 500, ox: 300.126, oy: 301.999, hp: 0, maxHp: 460, respawnTick: 52, kind: 2, boss: true, name: "KING", tint: 123 },
        ],
        shots: [
          { id: 3, x: 11.126, y: 21.999, team: 0 },
          { id: 4, x: 900, y: 900, team: 1 },
        ],
        pickups: [{ id: 5, x: 12.555, y: 22.444, kind: 1 }],
        hazards: [{ id: 6, x: 13.555, y: 23.444, r: 64, castTick: 2, detonateTick: 22, vsEnemies: true }],
        nodes: [{ id: 7, x: 900.555, y: 901.444, owner: 1, progress: 0.456, by: 2 }],
        factions: [10, 20, 30, 40],
        control: 1,
        roster: [{ id: "self", faction: 2, level: 4 }],
        inTutorial: true,
      }),
    );

    expect(Object.keys(state)).toEqual([
      "t",
      "tick",
      "players",
      "enemies",
      "shots",
      "pickups",
      "hazards",
      "nodes",
      "factions",
      "control",
      "roster",
      "boss",
    ]);
    expect(state).toMatchObject({
      t: "state",
      tick: 12,
      enemies: [{ id: 1, x: 12.13, y: 22, hp: 50, kind: 2 }],
      shots: [{ id: 3, x: 11.13, y: 22, team: 0 }],
      pickups: [{ id: 5, x: 12.56, y: 22.44, kind: 1 }],
      hazards: [{ id: 6, x: 13.56, y: 23.44, r: 64, frac: 0.5, friendly: 1 }],
      nodes: [{ id: 7, x: 900.56, y: 901.44, owner: 1, progress: 0.46, by: 2 }],
      factions: [10, 20, 30, 40],
      control: 1,
      boss: { name: "KING", x: 300.13, y: 302, hp: 0, hpMax: 460, alive: false, respawnSec: 2 },
    });
    expect(state.players[0].inTutorial).toBe(true);
  });
});
