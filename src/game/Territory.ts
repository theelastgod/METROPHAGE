import Phaser from "phaser";
import { TILE, TERRITORY, PURGE, NODE, COLORS } from "../config";
import InfectionNode from "../entities/InfectionNode";
import { NodeDef } from "./districts";

/**
 * Territory — a district's infection graph. Owns one InfectionNode per NodeDef,
 * channels them by proximity, and spreads contagion along `links`: an infected
 * node bleeds progress into its dormant neighbours, so infection crawls across the
 * district. Node 0 is the core (boss-guarded). Exposes held-count, "secured" (all
 * held), and the largest connected infected cluster (for the Singularity rate).
 */
export default class Territory {
  readonly nodes: InfectionNode[] = [];
  private links: number[][];
  private graph: Phaser.GameObjects.Graphics;
  private wasInfected: boolean[];
  private onInfect: (index: number) => void;
  private nextPurgeAt = 0;

  constructor(scene: Phaser.Scene, defs: NodeDef[], onInfect: (index: number) => void) {
    this.links = defs.map((d) => d.links);
    this.wasInfected = defs.map(() => false);
    this.onInfect = onInfect;
    this.graph = scene.add.graphics().setDepth(3); // links sit under the nodes
    for (const d of defs) {
      this.nodes.push(
        new InfectionNode(scene, d.tile[0] * TILE + TILE / 2, d.tile[1] * TILE + TILE / 2),
      );
    }
  }

  /** Lock/unlock the core node (boss districts). */
  setCoreLocked(v: boolean) {
    this.nodes[0]?.setLocked(v);
  }

  /** Revisiting an already-secured district: show every node held (no rewards). */
  restoreAllInfected() {
    this.nodes.forEach((n, i) => {
      n.restoreInfected();
      this.wasInfected[i] = true;
    });
  }

  /**
   * HSS push-back: on a Heat-shortened timer, re-secure one infected frontier node
   * (never the core, never one the player is channeling). Returns the purged index
   * or -1. The shrunk cluster ticks the Singularity slower — territory must be held.
   */
  tryPurge(now: number, heatNorm: number, player: Phaser.GameObjects.Components.Transform): number {
    if (this.nextPurgeAt === 0) {
      this.nextPurgeAt = now + PURGE.baseIntervalMs; // arm on first call
      return -1;
    }
    if (now < this.nextPurgeAt) return -1;
    this.nextPurgeAt = now + Phaser.Math.Linear(PURGE.baseIntervalMs, PURGE.minIntervalMs, heatNorm);

    const infected = this.nodes.map((n) => n.infected);
    const cand: number[] = [];
    for (let i = 1; i < this.nodes.length; i++) {
      if (!infected[i]) continue;
      const n = this.nodes[i];
      if (Phaser.Math.Distance.Between(player.x, player.y, n.x, n.y) <= NODE.channelRange + 30) {
        continue; // don't yank a node you're actively holding
      }
      if (this.links[i].some((j) => !infected[j])) cand.push(i); // frontier only
    }
    if (cand.length === 0) return -1;
    const pick = cand[Math.floor(Math.random() * cand.length)];
    this.nodes[pick].purge();
    this.wasInfected[pick] = false; // re-infection re-triggers the reward hook
    return pick;
  }

  update(player: Phaser.GameObjects.Components.Transform, dtMs: number) {
    const infected = this.nodes.map((n) => n.infected);
    this.nodes.forEach((n, i) => {
      let spread = 0;
      if (!infected[i]) {
        const liveNeighbors = this.links[i].reduce((c, j) => c + (infected[j] ? 1 : 0), 0);
        spread = liveNeighbors * TERRITORY.spreadPerNeighborSec * (dtMs / 1000);
      }
      const dist = Phaser.Math.Distance.Between(player.x, player.y, n.x, n.y);
      n.tick(dist, dtMs, spread);
      if (n.infected && !this.wasInfected[i]) {
        this.wasInfected[i] = true;
        this.onInfect(i);
      }
    });
    this.drawLinks();
  }

  private drawLinks() {
    const g = this.graph;
    g.clear();
    this.links.forEach((ls, i) => {
      for (const j of ls) {
        if (j <= i) continue; // each undirected edge once
        const a = this.nodes[i];
        const b = this.nodes[j];
        const both = a.infected && b.infected;
        g.lineStyle(both ? 3 : 1.5, both ? COLORS.nodeInfected : 0x2a2740, both ? 0.7 : 0.45);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    });
  }

  get infectedCount(): number {
    return this.nodes.reduce((c, n) => c + (n.infected ? 1 : 0), 0);
  }
  get total(): number {
    return this.nodes.length;
  }
  get secured(): boolean {
    return this.nodes.every((n) => n.infected);
  }

  /** Size of the largest connected cluster of infected nodes (via links). */
  get clusterSize(): number {
    const infected = this.nodes.map((n) => n.infected);
    const seen = new Array(this.nodes.length).fill(false);
    let best = 0;
    for (let s = 0; s < this.nodes.length; s++) {
      if (!infected[s] || seen[s]) continue;
      let size = 0;
      const stack = [s];
      while (stack.length) {
        const u = stack.pop()!;
        if (seen[u]) continue;
        seen[u] = true;
        size++;
        for (const v of this.links[u]) if (infected[v] && !seen[v]) stack.push(v);
      }
      best = Math.max(best, size);
    }
    return best;
  }

  destroy() {
    this.nodes.forEach((n) => n.destroy());
    this.graph.destroy();
  }
}
