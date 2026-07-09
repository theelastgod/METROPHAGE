import Phaser from "phaser";
import { COLORS } from "../config";
import { DISTRICTS } from "../game/districts";
import { BRIDGES } from "../game/bridges";
import { getSettings } from "../systems/Settings";
import { dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";
import { bodyFont } from "./typography";
import { addPanelGlow, animatePanelIn, drawScanlines, STUDIO } from "./studioChrome";
import ContextMenu, { type ContextAction } from "./ContextMenu";

interface MapNode {
  zone: string;
  label: string;
  color: number;
}

/** Visual positions for the world-graph strip (normalized 0–1). */
const HUB_INTERIORS: MapNode[] = [
  { zone: "clinic", label: "THE CLINIC", color: 0x39ff88 },
  { zone: "shop", label: "MARKET STALL", color: 0x00e5ff },
  { zone: "bar", label: "THE FERAL CAT", color: 0xff79c6 },
  { zone: "den", label: "THE DEN", color: 0xff2bd6 },
];

const GRAPH_POS: Record<string, { gx: number; gy: number }> = {
  safe: { gx: 0.5, gy: 0.18 },
  clinic: { gx: 0.3, gy: 0.72 },
  shop: { gx: 0.42, gy: 0.72 },
  bar: { gx: 0.58, gy: 0.72 },
  den: { gx: 0.7, gy: 0.72 },
  subway: { gx: 0.18, gy: 0.42 },
  d0: { gx: 0.38, gy: 0.42 },
  d1: { gx: 0.5, gy: 0.42 },
  d2: { gx: 0.62, gy: 0.42 },
  d3: { gx: 0.74, gy: 0.42 },
  d4: { gx: 0.38, gy: 0.55 },
  d5: { gx: 0.5, gy: 0.55 },
  d6: { gx: 0.62, gy: 0.55 },
  d7: { gx: 0.74, gy: 0.55 },
  w0: { gx: 0.44, gy: 0.42 },
  w1: { gx: 0.56, gy: 0.42 },
  w2: { gx: 0.68, gy: 0.42 },
  w3: { gx: 0.44, gy: 0.55 },
  w4: { gx: 0.56, gy: 0.55 },
  w5: { gx: 0.68, gy: 0.55 },
  w6: { gx: 0.62, gy: 0.62 },
};

const GRAPH_EDGES: Array<[string, string]> = [
  ["safe", "d0"],
  ["safe", "subway"],
  ["safe", "clinic"],
  ["safe", "shop"],
  ["safe", "bar"],
  ["safe", "den"],
  ["d0", "w0"],
  ["w0", "d1"],
  ["d1", "w1"],
  ["w1", "d2"],
  ["d2", "w2"],
  ["w2", "d3"],
  ["d3", "w3"],
  ["w3", "d4"],
  ["d4", "w4"],
  ["w4", "d5"],
  ["d5", "w5"],
  ["w5", "d6"],
  ["d6", "w6"],
  ["w6", "d7"],
];

export default class OnlineMap {
  open = false;
  onTravel?: (zone: string) => void;
  onWalkToZone?: (zone: string) => void;
  onExamine?: (text: string) => void;
  private scene: Phaser.Scene;
  private contextMenu: ContextMenu;
  private nodes: MapNode[];
  private discovered = new Set<string>();
  private unlocked = new Set<string>();
  private current = "";
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, contextMenu?: ContextMenu) {
    this.scene = scene;
    this.contextMenu = contextMenu ?? new ContextMenu(scene);
    this.nodes = [
      { zone: "safe", label: "METRO CITY", color: 0x39ff88 },
      ...HUB_INTERIORS,
      ...DISTRICTS.flatMap((d, i) => {
        const out: MapNode[] = [{ zone: "d" + i, label: d.name, color: d.accent }];
        if (i < BRIDGES.length) {
          const bridge = BRIDGES[i];
          out.push({ zone: bridge.id, label: bridge.name, color: bridge.accent });
        }
        return out;
      }),
      { zone: "subway", label: "THE UNDERLINE", color: 0xff3b6b },
    ];
  }

  setState(discovered: string[], unlocked: string[], current: string) {
    this.discovered = new Set(discovered);
    this.unlocked = new Set(unlocked);
    this.current = current;
    if (this.open) this.build();
  }

  toggle(discovered: string[], unlocked: string[], current: string) {
    this.open = !this.open;
    if (this.open) {
      this.setState(discovered, unlocked, current);
      this.build();
    } else this.clear();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.clear();
  }

  private clear() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }

  private canFastTravel(zone: string): boolean {
    return zone === "safe" || this.unlocked.has(zone);
  }

  private isKnown(zone: string) {
    return this.discovered.has(zone) || zone === this.current;
  }

  private zoneBlurb(zone: string, label: string): string {
    if (zone === "safe") return "Metro City — the neon hub. Deploy gates, markets, and safe harbours.";
    if (zone === "clinic") return "The Clinic — patch wounds and recover between sorties.";
    if (zone === "shop") return "Market Stall — buy caches and vendor stock.";
    if (zone === "bar") return "The Feral Cat — drinks, rumours, and city flavour.";
    if (zone === "den") return "The Den — faction contacts and underground deals.";
    if (zone === "subway") return "The Underline — a combat dungeon beneath the grid.";
    const m = zone.match(/^d(\d+)$/);
    if (m) {
      const d = DISTRICTS[parseInt(m[1], 10)];
      return d ? `${d.name} — ${d.subtitle}. Threat ${d.threat}. ⚔ PvP: THE CRUCIBLE in the SE corner.` : label;
    }
    const w = zone.match(/^w(\d+)$/);
    if (w) {
      const b = BRIDGES[parseInt(w[1], 10)];
      return b ? `${b.name} — ${b.subtitle}. Wilderness trail · Threat ${b.threat}.` : label;
    }
    return label;
  }

  private zoneMenu(pointer: Phaser.Input.Pointer, n: MapNode) {
    const here = n.zone === this.current;
    const route = this.canFastTravel(n.zone);
    const actions: ContextAction[] = [
      {
        label: "Examine",
        color: "#c8c8c8",
        onPick: () => this.onExamine?.(this.zoneBlurb(n.zone, n.label)),
      },
    ];
    if (!here) {
      actions.push({
        label: `Walk to ${n.label}`,
        onPick: () => {
          this.close();
          this.onWalkToZone?.(n.zone);
        },
      });
      if (route) {
        actions.push({
          label: `Fast-travel ${n.label}`,
          color: STUDIO.ready,
          onPick: () => {
            this.close();
            this.onTravel?.(n.zone);
          },
        });
      }
    }
    this.contextMenu.show(pointer.x, pointer.y, n.label, actions);
  }

  private rowClick(n: MapNode, pointer?: Phaser.Input.Pointer) {
    const here = n.zone === this.current;
    if (here) return;
    const forceWalk = (pointer?.event as MouseEvent | undefined)?.shiftKey ?? false;
    const route = this.canFastTravel(n.zone);
    this.close();
    if (route && !forceWalk) {
      this.onTravel?.(n.zone);
      return;
    }
    this.onWalkToZone?.(n.zone);
  }

  private build() {
    this.clear();
    const scene = this.scene;
    const rs = getSettings().rsControls;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const D = 1700;
    const rowH = uiDim(52);
    const cardH = uiDim(44);
    const graphH = uiDim(88);
    const { x, y, w, h } = modalRect(580, 116 + graphH + this.nodes.length * 52);

    add(dimBackdrop(scene, D, 0.66));
    const glow = addPanelGlow(scene, x, y, w, h, 0x39ff88, 0.1);
    glow.setScrollFactor(0).setDepth(D);

    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), COLORS.neonCyan, 0.85).strokeRect(x, y, w, h);
    drawScanlines(g, x, y, w, h);

    const tx = (s: string, fx: number, fy: number, size: number, color: string, bold = false, origin = 0) =>
      add(
        scene.add
          .text(fx, fy, s, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(size),
            color,
            fontStyle: bold ? "bold" : "normal",
          })
          .setOrigin(origin, 0)
          .setScrollFactor(0)
          .setDepth(D + 3),
      );

    const found = this.nodes.filter((n) => this.isKnown(n.zone)).length;
    const routes = this.nodes.filter((n) => this.canFastTravel(n.zone)).length;
    tx("◇ WORLD MAP", x + uiDim(22), y + uiDim(16), 17, STUDIO.ink, true);
    add(
      scene.add
        .text(x + uiDim(22), y + uiDim(34), rs ? "click travel · shift+click walk · right-click menu" : "fast travel unlocked routes", bodyFont(10, { color: STUDIO.dim }))
        .setScrollFactor(0)
        .setDepth(D + 3),
    );
    tx(`seen ${found}/${this.nodes.length}  ·  routes ${routes}  ·  M / ESC`, x + w - uiDim(20), y + uiDim(18), 11, STUDIO.muted, false, 1);

    const gx0 = x + uiDim(22);
    const gy0 = y + uiDim(52);
    const gw = w - uiDim(44);
    const gh = graphH - uiDim(12);
    g.fillStyle(0x06050f, 0.92).fillRect(gx0, gy0, gw, gh);
    g.lineStyle(1, 0x1a2440, 0.9).strokeRect(gx0, gy0, gw, gh);

    const nodePx = (zone: string) => {
      const p = GRAPH_POS[zone];
      if (!p) return null;
      return { x: gx0 + p.gx * gw, y: gy0 + p.gy * gh };
    };

    g.lineStyle(1, 0x2a3558, 0.55);
    for (const [a, b] of GRAPH_EDGES) {
      const pa = nodePx(a);
      const pb = nodePx(b);
      if (!pa || !pb) continue;
      if (!this.isKnown(a) && !this.isKnown(b)) continue;
      g.beginPath();
      g.moveTo(pa.x, pa.y);
      g.lineTo(pb.x, pb.y);
      g.strokePath();
    }

    for (const n of this.nodes) {
      const p = nodePx(n.zone);
      if (!p || !this.isKnown(n.zone)) continue;
      const here = n.zone === this.current;
      const r = here ? uiDim(7) : uiDim(5);
      g.fillStyle(here ? COLORS.neonMagenta : n.color, here ? 1 : 0.85).fillCircle(p.x, p.y, r);
      if (here) g.lineStyle(2, 0xffffff, 0.7).strokeCircle(p.x, p.y, r + uiDim(2));

      const dotZ = add(
        scene.add
          .zone(p.x - uiDim(10), p.y - uiDim(10), uiDim(20), uiDim(20))
          .setOrigin(0)
          .setScrollFactor(0)
          .setInteractive({ useHandCursor: true })
          .setDepth(D + 5),
      );
      dotZ.on("pointerdown", (pointer: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        if (pointer.rightButtonDown()) {
          ev.stopPropagation();
          this.zoneMenu(pointer, n);
          return;
        }
        if (!pointer.rightButtonDown()) this.rowClick(n, pointer);
      });
    }

    const listY = gy0 + gh + uiDim(8);
    this.nodes.forEach((n, i) => {
      const ry = listY + i * rowH;
      const known = this.isKnown(n.zone);
      const here = n.zone === this.current;
      const route = this.canFastTravel(n.zone);
      const hex = "#" + (n.color & 0xffffff).toString(16).padStart(6, "0");
      if (!known) {
        g.fillStyle(0x050409, 0.95).fillRect(x + uiDim(18), ry, w - uiDim(36), cardH);
        g.lineStyle(uiDim(1.4), 0x1a1726, 1).strokeRect(x + uiDim(18), ry, w - uiDim(36), cardH);
        tx("■ ??? — undiscovered", x + uiDim(32), ry + uiDim(14), 14, "#3a3550", true);
        return;
      }
      g.fillStyle(here ? 0x231a3a : 0x12102a, 0.95).fillRect(x + uiDim(18), ry, w - uiDim(36), cardH);
      g.lineStyle(here ? uiDim(2) : uiDim(1.4), here ? COLORS.neonMagenta : n.color, 1).strokeRect(x + uiDim(18), ry, w - uiDim(36), cardH);
      tx(n.label, x + uiDim(32), ry + uiDim(8), 15, hex, true);
      if (here) {
        tx("you are here", x + uiDim(32), ry + uiDim(27), 10, "#ff79c6");
        tx("◉ HERE", x + w - uiDim(32), ry + uiDim(14), 13, "#ff2bd6", true, 1);
      } else if (!route) {
        tx("seen — walk via deploy gate / transit", x + uiDim(32), ry + uiDim(27), 10, "#ff7a3c");
        tx("◇ WALK", x + w - uiDim(32), ry + uiDim(14), 12, "#39ff88", true, 1);
      } else {
        tx(rs ? "click row — fast travel" : "fast travel unlocked", x + uiDim(32), ry + uiDim(27), 10, "#9aa3b2");
        tx("▸ GO", x + w - uiDim(32), ry + uiDim(14), 12, "#cfe8ff", true, 1);
      }

      const rowZ = add(
        scene.add
          .zone(x + uiDim(18), ry, w - uiDim(36), cardH)
          .setOrigin(0)
          .setScrollFactor(0)
          .setInteractive({ useHandCursor: true })
          .setDepth(D + 4),
      );
      rowZ.on("pointerdown", (pointer: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        if (pointer.rightButtonDown()) {
          ev.stopPropagation();
          this.zoneMenu(pointer, n);
          return;
        }
        if (!pointer.rightButtonDown()) this.rowClick(n, pointer);
      });
    });

    animatePanelIn(scene, this.objs);
  }

  destroy() {
    this.clear();
  }
}