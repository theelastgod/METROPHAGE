import type { RemotePlayerSource, RemotePlayerView } from "./playerSnapshot";

export interface SnapshotPlayerSource extends RemotePlayerSource {
  ack: number;
  credits: number;
  cores: number;
  metro: number;
  xp: number;
  level: number;
  faction: number;
  campaign: {
    activeId: string | null;
    stage: number;
    progress: number;
    readonly currentStage: { objective: string } | null;
  };
  tutorialStep: number;
  tutorialProgress: number;
  tutorialDone: boolean;
  pvpInArena: boolean;
  pvpEscrow: number;
  heat: number;
}

export interface SnapshotEnemySource {
  id: number;
  x: number;
  y: number;
  ox: number;
  oy: number;
  hp: number;
  maxHp: number;
  respawnTick: number;
  kind: number;
  boss?: boolean;
  hvt?: boolean;
  name?: string;
  tint?: number;
}

export interface SnapshotShotSource {
  id: number;
  x: number;
  y: number;
  team: 0 | 1;
}

export interface SnapshotPickupSource {
  id: number;
  x: number;
  y: number;
  kind: number;
}

export interface SnapshotHazardSource {
  id: number;
  x: number;
  y: number;
  r: number;
  castTick: number;
  detonateTick: number;
  vsEnemies?: boolean;
}

export interface SnapshotNodeSource {
  id: number;
  x: number;
  y: number;
  owner: number;
  progress: number;
  by: number;
}

export interface SnapshotRosterEntry {
  id: string;
  faction: number;
  level: number;
}

export interface WorldSnapshotInput {
  tick: number;
  netTickMs: number;
  aoiRadius: number;
  viewer: Pick<SnapshotPlayerSource, "id" | "x" | "y">;
  players: Iterable<SnapshotPlayerSource>;
  playerViews: ReadonlyMap<string, RemotePlayerView>;
  enemies: Iterable<SnapshotEnemySource>;
  shots: Iterable<SnapshotShotSource>;
  pickups: Iterable<SnapshotPickupSource>;
  hazards: Iterable<SnapshotHazardSource>;
  nodes: Iterable<SnapshotNodeSource>;
  factions: number[];
  control: number;
  roster: SnapshotRosterEntry[];
  inTutorial: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Build one viewer-specific state frame. This function is deliberately detached
 * from WorldDO so AOI filtering and self-only fields can be tested without a
 * Durable Object runtime or a live socket.
 */
export function buildWorldSnapshot(input: WorldSnapshotInput): string {
  const {
    tick,
    netTickMs,
    aoiRadius,
    viewer,
    playerViews,
    factions,
    control,
    roster,
    inTutorial,
  } = input;
  const radius2 = aoiRadius * aoiRadius;
  const near = (x: number, y: number) => {
    const dx = viewer.x - x;
    const dy = viewer.y - y;
    return dx * dx + dy * dy <= radius2;
  };

  const players = [];
  for (const p of input.players) {
    if (p.id !== viewer.id && !near(p.x, p.y)) continue;
    const common = playerViews.get(p.id);
    if (!common) continue;
    if (p.id !== viewer.id) {
      // Remote clients receive presentation only. Currency, progression,
      // campaign state and input acknowledgement are always self-only.
      players.push(common);
      continue;
    }
    players.push({
      ...common,
      ack: p.ack,
      credits: p.credits,
      cores: p.cores,
      metro: p.metro,
      xp: p.xp,
      level: p.level,
      faction: p.faction,
      campaignQuest: p.campaign.activeId,
      campaignStage: p.campaign.stage,
      campaignProgress: p.campaign.progress,
      campaignObjective: p.campaign.currentStage?.objective ?? "",
      tutorialStep: p.tutorialStep,
      tutorialProgress: p.tutorialProgress,
      tutorialDone: p.tutorialDone,
      inTutorial,
      pvpInArena: p.pvpInArena,
      pvpEscrow: p.pvpEscrow,
      heat: Math.round(p.heat),
    });
  }

  const enemies = [];
  // Boss status is zone-wide rather than AOI-filtered so clients can locate the
  // encounter and see its reform countdown from anywhere in the district.
  let boss:
    | { name: string; x: number; y: number; hp: number; hpMax: number; alive: boolean; respawnSec: number }
    | undefined;
  for (const e of input.enemies) {
    if (e.boss && !boss) {
      const alive = e.hp > 0;
      boss = {
        name: e.name ?? "BOSS",
        x: round2(alive ? e.x : e.ox),
        y: round2(alive ? e.y : e.oy),
        hp: Math.max(0, Math.round(e.hp)),
        hpMax: Math.round(e.maxHp),
        alive,
        respawnSec: alive ? 0 : Math.max(0, Math.ceil(((e.respawnTick - tick) * netTickMs) / 1000)),
      };
    }
    if (e.hp > 0 && near(e.x, e.y)) {
      enemies.push({
        id: e.id,
        x: round2(e.x),
        y: round2(e.y),
        hp: Math.round(e.hp),
        kind: e.kind,
        ...(e.boss
          ? { boss: true, name: e.name, tint: e.tint, hpMax: Math.round(e.maxHp) }
          : e.hvt
            ? { name: e.name, tint: e.tint, hvt: true, hpMax: Math.round(e.maxHp) }
            : e.name && e.tint
              ? { name: e.name, tint: e.tint }
              : {}),
      });
    }
  }

  const shots = [];
  for (const s of input.shots) {
    if (near(s.x, s.y)) shots.push({ id: s.id, x: round2(s.x), y: round2(s.y), team: s.team });
  }

  const pickups = [];
  for (const pu of input.pickups) {
    if (near(pu.x, pu.y)) pickups.push({ id: pu.id, x: round2(pu.x), y: round2(pu.y), kind: pu.kind });
  }

  const hazards = [];
  for (const hz of input.hazards) {
    if (!near(hz.x, hz.y)) continue;
    hazards.push({
      id: hz.id,
      x: round2(hz.x),
      y: round2(hz.y),
      r: hz.r,
      frac: round2(Math.max(0, Math.min(1, (tick - hz.castTick) / Math.max(1, hz.detonateTick - hz.castTick)))),
      ...(hz.vsEnemies ? { friendly: 1 as const } : {}),
    });
  }

  const nodes = [];
  for (const n of input.nodes) {
    nodes.push({ id: n.id, x: round2(n.x), y: round2(n.y), owner: n.owner, progress: round2(n.progress), by: n.by });
  }

  return JSON.stringify({
    t: "state",
    tick,
    players,
    enemies,
    shots,
    pickups,
    hazards,
    nodes,
    factions,
    control,
    roster,
    boss,
  });
}
