import Phaser from "phaser";
import { COLORS } from "../config";
import { DISTRICTS } from "../game/districts";
import { BRIDGES } from "../game/bridges";
import { dailyDistrictMod } from "../game/districtMods";
import { zoneAccess, zoneNeedsWarning, zoneWarning, type ZoneAccess } from "../game/zoneAccess";
import { ESTATES_ZONE } from "../world/estates";
import { getSettings } from "../systems/Settings";
import Modal from "./Modal";
import { dimBackdrop, fitModalRect, uiDim, uiFont } from "./uiLayout";
import { bodyFont, fitTextToWidth } from "./typography";
import { addPanelGlow, animatePanelIn, drawScanlines, STUDIO } from "./studioChrome";
import ContextMenu, { type ContextAction } from "./ContextMenu";
import { prefersMobileUx } from "../systems/Mobile";

interface MapNode {
  zone: string;
  label: string;
  color: number;
  /** Section key for the list UI. */
  section: "spawn" | "hub" | "district" | "trail" | "dungeon" | "estates";
}

/** Visual positions for the world-graph strip (normalized 0–1). */
const HUB_INTERIORS: MapNode[] = [
  { zone: "clinic", label: "THE CLINIC", color: 0x39ff88, section: "hub" },
  { zone: "shop", label: "MARKET STALL", color: 0x00e5ff, section: "hub" },
  { zone: "bar", label: "THE FERAL CAT", color: 0xff79c6, section: "hub" },
  { zone: "den", label: "THE DEN", color: 0xff2bd6, section: "hub" },
];

const GRAPH_POS: Record<string, { gx: number; gy: number }> = {
  safe: { gx: 0.5, gy: 0.18 },
  clinic: { gx: 0.3, gy: 0.72 },
  shop: { gx: 0.42, gy: 0.72 },
  bar: { gx: 0.58, gy: 0.72 },
  den: { gx: 0.7, gy: 0.72 },
  subway: { gx: 0.18, gy: 0.42 },
  estates: { gx: 0.82, gy: 0.28 },
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
  ["safe", "estates"],
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

/** Dungeons sit near the top so always-available subway isn't buried under 15+ district rows. */
const SECTION_ORDER: Array<{ key: MapNode["section"]; title: string }> = [
  { key: "spawn", title: "CITY SPAWN" },
  { key: "dungeon", title: "DUNGEONS · TRANSIT" },
  { key: "hub", title: "HUB INTERIORS" },
  { key: "estates", title: "RESIDENTIAL" },
  { key: "district", title: "DISTRICTS" },
  { key: "trail", title: "WILDERNESS TRAILS" },
];

export default class OnlineMap extends Modal {
  onTravel?: (zone: string) => void;
  onWalkToZone?: (zone: string) => void;
  onExamine?: (text: string) => void;
  private contextMenu: ContextMenu;
  private nodes: MapNode[];
  private discovered = new Set<string>();
  private unlocked = new Set<string>();
  private current = "";

  constructor(scene: Phaser.Scene, contextMenu?: ContextMenu) {
    super(scene);
    this.contextMenu = contextMenu ?? new ContextMenu(scene);
    this.nodes = [
      // City spawn — always listed first; hub pad where new runners land.
      { zone: "safe", label: "METRO CITY · HUB PAD", color: 0x39ff88, section: "spawn" },
      ...HUB_INTERIORS,
      { zone: ESTATES_ZONE, label: "THE ESTATES", color: 0xc9a227, section: "estates" },
      ...DISTRICTS.flatMap((d, i) => {
        const out: MapNode[] = [{ zone: "d" + i, label: d.name, color: d.accent, section: "district" }];
        if (i < BRIDGES.length) {
          const bridge = BRIDGES[i];
          out.push({ zone: bridge.id, label: bridge.name, color: bridge.accent, section: "trail" });
        }
        return out;
      }),
      {
        zone: "subway",
        label: "SUBWAY STATION · THE UNDERLINE",
        color: 0xff3b6b,
        section: "dungeon",
      },
    ];
  }

  setState(discovered: string[], unlocked: string[], current: string) {
    this.discovered = new Set(discovered);
    this.unlocked = new Set(unlocked);
    this.current = current;
    this.pendingTravel = null; // a fresh open never carries an armed warning
    if (this.open) this.build();
  }

  toggle(discovered: string[], unlocked: string[], current: string) {
    if (!this.open) {
      this.open = true;
      this.setState(discovered, unlocked, current); // builds (open is set)
    } else {
      this.close();
    }
  }

  /** When true (operator account), every zone is known + fast-travel ready. */
  godMode = false;

  /**
   * Campaign standing, pulled at render time from the scene (the map has no
   * NetClient handle of its own). Drives story/level advisories only: travel is
   * never blocked, the runner just gets told what they're walking into.
   */
  standingProvider?: () => { completed: string[]; level: number };

  /** Zone armed by a first click on a warned route; a second click commits. */
  private pendingTravel: string | null = null;

  private access(zone: string): ZoneAccess {
    return zoneAccess(zone, this.standingProvider?.() ?? { completed: [], level: 1 });
  }

  /**
   * Fast-travel allowed once a zone is on your map (discovered / organic unlock).
   * City spawn (safe) and the subway station are always free routes.
   */
  private canFastTravel(zone: string): boolean {
    if (this.godMode) return true;
    // Free routes: hub pad, subway station, and hub service rooms once you've
    // touched the city (or are standing in any known zone). Cuts "walk via
    // deploy gate" dead-ends for clinic/shop/bar/den.
    if (zone === "safe" || zone === "subway") return true;
    if (HUB_INTERIORS.some((h) => h.zone === zone)) {
      return (
        this.discovered.has("safe") ||
        this.unlocked.has("safe") ||
        this.current === "safe" ||
        this.discovered.has(zone) ||
        this.unlocked.has(zone)
      );
    }
    return this.discovered.has(zone) || this.unlocked.has(zone);
  }

  private isKnown(zone: string) {
    if (this.godMode) return true;
    // City spawn + subway always show — transit anchors every runner can reach.
    if (zone === "safe" || zone === "subway") return true;
    // Hub interiors show as soon as the player has seen Metro City.
    if (
      HUB_INTERIORS.some((h) => h.zone === zone) &&
      (this.discovered.has("safe") || this.unlocked.has("safe") || this.current === "safe")
    ) {
      return true;
    }
    return this.discovered.has(zone) || zone === this.current;
  }

  private zoneBlurb(zone: string, label: string): string {
    if (zone === "safe") return "Metro City hub pad — city spawn for new runners and safe return.";
    if (zone === "clinic") return "The Clinic — patch wounds and recover between sorties.";
    if (zone === "shop") return "Market Stall — buy caches and vendor stock.";
    if (zone === "bar") return "The Feral Cat — drinks, rumours, and city flavour.";
    if (zone === "den") return "The Den — faction contacts and underground deals.";
    if (zone === "subway")
      return "Subway station · THE UNDERLINE — fast travel from the map. Surface exits unlock districts along the spine.";
    if (zone === ESTATES_ZONE) return "The Estates — residential street of purchasable homes.";
    const m = zone.match(/^d(\d+)$/);
    if (m) {
      const di = parseInt(m[1], 10);
      const d = DISTRICTS[di];
      const mod = dailyDistrictMod(di);
      return d
        ? `${d.name} — ${d.subtitle}. Threat ${d.threat}.${this.accessBlurb(zone)} Today: ${mod.name} (${mod.blurb}). ⚔ PvP: THE CRUCIBLE in the SE corner.`
        : label;
    }
    const w = zone.match(/^w(\d+)$/);
    if (w) {
      const b = BRIDGES[parseInt(w[1], 10)];
      return b ? `${b.name} — ${b.subtitle}. Wilderness trail · Threat ${b.threat}.${this.accessBlurb(zone)}` : label;
    }
    return label;
  }

  /** Campaign/level standing for a combat zone, as a trailing sentence. */
  private accessBlurb(zone: string): string {
    if (this.godMode) return "";
    const a = this.access(zone);
    if (!a.recLevel) return "";
    const band = ` Recommended LV ${a.recLevel[0]}–${a.recLevel[1]}.`;
    const warn = zoneWarning(a);
    return warn ? `${band} ${warn}` : band;
  }

  private doTravel(zone: string) {
    if (zone === this.current) return;
    if (!this.canFastTravel(zone)) {
      this.close();
      this.onWalkToZone?.(zone);
      return;
    }
    // Ahead of the story or under the band: say so once, then take them anyway
    // if they still want it. The city is theirs to get killed in.
    if (!this.godMode && this.pendingTravel !== zone && zoneNeedsWarning(this.access(zone))) {
      this.pendingTravel = zone;
      this.build();
      return;
    }
    this.pendingTravel = null;
    this.close();
    this.onTravel?.(zone);
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
          label: `TRAVEL — ${n.label}`,
          color: STUDIO.ready,
          onPick: () => this.doTravel(n.zone),
        });
      }
    }
    this.contextMenu.show(pointer.x, pointer.y, n.label, actions);
  }

  protected build() {
    this.clear();
    const scene = this.scene;
    const rs = getSettings().rsControls;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const D = 1700;
    const mobile = prefersMobileUx();
    // Design-space sizes only — fitModalRect / uiDim scale once. Passing already-
    // uiDim'd heights into modalRect double-scaled the panel past the viewport
    // so DUNGEONS (bottom section) hung completely off-screen.
    const rowDesign = mobile ? 52 : 44;
    const sectionDesign = mobile ? 28 : 24;
    const graphDesign = mobile ? 64 : 80;
    const headerDesign = 48;
    const footerDesign = 22;

    let listRows = 0;
    let sectionCount = 0;
    for (const sec of SECTION_ORDER) {
      const members = this.nodes.filter((n) => n.section === sec.key);
      if (!members.length) continue;
      sectionCount += 1;
      listRows += members.length;
    }
    // Natural content height in design px (not scaled).
    const naturalDesignH =
      headerDesign + graphDesign + sectionCount * sectionDesign + listRows * rowDesign + footerDesign + 16;
    // Clamp to the game canvas so the panel never exceeds the visible frame.
    const { x, y, w, h } = fitModalRect(mobile ? 340 : 600, Math.min(naturalDesignH, mobile ? 500 : 480), {
      marginDesign: mobile ? 6 : 16,
    });
    const rowH = uiDim(rowDesign);
    const cardH = uiDim(rowDesign - 6);
    const sectionH = uiDim(sectionDesign);
    const graphH = uiDim(graphDesign);

    add(dimBackdrop(scene, D, 0.66, () => this.close(), { x, y, w, h }));
    const glow = addPanelGlow(scene, x, y, w, h, 0x39ff88, 0.1);
    glow.setScrollFactor(0).setDepth(D);

    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), COLORS.neonCyan, 0.85).strokeRect(x, y, w, h);
    drawScanlines(g, x, y, w, h);

    const tx = (
      s: string,
      fx: number,
      fy: number,
      size: number,
      color: string,
      bold = false,
      origin = 0,
      maxWidth?: number,
    ) => {
      const t = add(
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
      if (maxWidth !== undefined) fitTextToWidth(t, maxWidth);
      return t;
    };

    const found = this.nodes.filter((n) => this.isKnown(n.zone)).length;
    const routes = this.nodes.filter((n) => this.canFastTravel(n.zone)).length;
    tx("◇ WORLD MAP", x + uiDim(22), y + uiDim(14), 17, STUDIO.ink, true);
    add(
      scene.add
        .text(
          x + uiDim(22),
          y + uiDim(32),
          rs ? "TRAVEL jumps · shift-walk via menu · right-click options" : "TRAVEL = fast travel to discovered places",
          bodyFont(10, { color: STUDIO.dim }),
        )
        .setScrollFactor(0)
        .setDepth(D + 3),
    );
    tx(
      `seen ${found}/${this.nodes.length}  ·  travel ${routes}  ·  M / ESC`,
      x + w - uiDim(20),
      y + uiDim(16),
      11,
      STUDIO.muted,
      false,
      1,
      w - uiDim(210),
    );

    const gx0 = x + uiDim(22);
    const gy0 = y + uiDim(50);
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
        this.doTravel(n.zone);
      });
    }

    // ── List with sections (clipped + scrollable inside the panel) ─────
    const listTop = gy0 + gh + uiDim(6);
    const listBottom = y + h - uiDim(18);
    const listClipH = Math.max(uiDim(80), listBottom - listTop);
    // Container for list content so we can mask + drag-scroll on overflow.
    const listRoot = add(scene.add.container(0, 0).setScrollFactor(0).setDepth(D + 3));
    const listG = scene.add.graphics().setScrollFactor(0);
    listRoot.add(listG);
    this.objs.push(listG);

    // Build list relative to 0 so scroll offset is clean; mask sits at listTop.
    let cy = 0;

    const addListText = (
      s: string,
      fx: number,
      fy: number,
      size: number,
      color: string,
      bold = false,
      originX = 0,
      maxWidth?: number,
    ) => {
      const t = scene.add
        .text(fx, fy, s, {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(size),
          color,
          fontStyle: bold ? "bold" : "normal",
        })
        .setOrigin(originX, 0)
        .setScrollFactor(0)
        .setDepth(D + 4);
      if (maxWidth !== undefined) fitTextToWidth(t, maxWidth);
      listRoot.add(t);
      this.objs.push(t);
      return t;
    };

    const travelBtnW = uiDim(88);
    const travelBtnH = uiDim(28);

    const listPadX = x + uiDim(18);
    const cardW = w - uiDim(36);

    for (const sec of SECTION_ORDER) {
      const members = this.nodes.filter((n) => n.section === sec.key);
      if (!members.length) continue;

      // Section header
      listG.fillStyle(0x0c1020, 0.95).fillRect(listPadX, cy, cardW, sectionH);
      listG.lineStyle(1, 0x1e2a44, 0.9).strokeRect(listPadX, cy, cardW, sectionH);
      addListText(`▸ ${sec.title}`, listPadX + uiDim(10), cy + uiDim(5), 11, "#00e5ff", true, 0, cardW - uiDim(20));
      cy += sectionH + uiDim(4);

      for (const n of members) {
        const known = this.isKnown(n.zone);
        const here = n.zone === this.current;
        const route = this.canFastTravel(n.zone);
        const acc = this.access(n.zone);
        const armed = this.pendingTravel === n.zone;
        const hex = "#" + (n.color & 0xffffff).toString(16).padStart(6, "0");
        const ry = cy;
        const cardX = listPadX;

        if (!known) {
          listG.fillStyle(0x050409, 0.95).fillRect(cardX, ry, cardW, cardH);
          listG.lineStyle(uiDim(1.4), 0x1a1726, 1).strokeRect(cardX, ry, cardW, cardH);
          addListText("■ ??? — undiscovered", cardX + uiDim(12), ry + uiDim(12), 13, "#3a3550", true, 0, cardW - uiDim(24));
          cy += rowH;
          continue;
        }

        listG.fillStyle(here ? 0x231a3a : sec.key === "spawn" ? 0x0a1a14 : 0x12102a, 0.95).fillRect(cardX, ry, cardW, cardH);
        listG
          .lineStyle(here ? uiDim(2) : uiDim(1.4), here ? COLORS.neonMagenta : n.color, 1)
          .strokeRect(cardX, ry, cardW, cardH);

        const textMax = cardW - travelBtnW - uiDim(28);
        // Districts/cuts carry their recommended band in the title line, so the
        // ladder reads at a glance without opening every row.
        const band = !this.godMode && acc.recLevel ? `  LV ${acc.recLevel[0]}–${acc.recLevel[1]}` : "";
        addListText(n.label + band, cardX + uiDim(12), ry + uiDim(6), 14, hex, true, 0, textMax);
        if (here) {
          addListText(
            sec.key === "spawn" ? "you are at city spawn" : "you are here",
            cardX + uiDim(12),
            ry + uiDim(24),
            10,
            "#ff79c6",
            false,
            0,
            textMax,
          );
        } else if (route) {
          const warn = this.godMode ? null : zoneWarning(acc);
          addListText(
            armed
              ? "click again to travel anyway"
              : (warn ??
                (sec.key === "spawn"
                  ? "return to hub pad · free travel"
                  : n.zone === "subway"
                    ? "subway station · free fast travel"
                    : "discovered · fast travel ready")),
            cardX + uiDim(12),
            ry + uiDim(24),
            10,
            armed ? "#ff2bd6" : warn ? (acc.story === "ahead" ? "#ff7a3c" : "#ffd166") : "#9aa3b2",
            false,
            0,
            textMax,
          );
        } else {
          addListText("seen — walk via deploy gate", cardX + uiDim(12), ry + uiDim(24), 10, "#ff7a3c", false, 0, textMax);
        }

        // Right-side action: HERE / TRAVEL / WALK
        const btnX = cardX + cardW - travelBtnW - uiDim(8);
        const btnY = ry + (cardH - travelBtnH) / 2;
        if (here) {
          listG.fillStyle(0x2a0a22, 0.95).fillRoundedRect(btnX, btnY, travelBtnW, travelBtnH, uiDim(6));
          listG.lineStyle(1.5, COLORS.neonMagenta, 0.9).strokeRoundedRect(btnX, btnY, travelBtnW, travelBtnH, uiDim(6));
          addListText("HERE", btnX + travelBtnW / 2, btnY + uiDim(7), 11, "#ff2bd6", true, 0.5);
        } else if (route) {
          listG.fillStyle(armed ? 0x2a0a22 : 0x0a1f18, 0.98).fillRoundedRect(btnX, btnY, travelBtnW, travelBtnH, uiDim(6));
          listG
            .lineStyle(1.5, armed ? COLORS.neonMagenta : 0x39ff88, 0.95)
            .strokeRoundedRect(btnX, btnY, travelBtnW, travelBtnH, uiDim(6));
          addListText(
            armed ? "ANYWAY" : "TRAVEL",
            btnX + travelBtnW / 2,
            btnY + uiDim(7),
            11,
            armed ? "#ff2bd6" : "#39ff88",
            true,
            0.5,
          );
          const btnZ = scene.add
            .zone(btnX, btnY, travelBtnW, travelBtnH)
            .setOrigin(0)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true })
            .setDepth(D + 6);
          listRoot.add(btnZ);
          this.objs.push(btnZ);
          btnZ.on("pointerover", () => {
            listG.fillStyle(armed ? 0x3d0f31 : 0x123828, 1).fillRoundedRect(btnX, btnY, travelBtnW, travelBtnH, uiDim(6));
            listG
              .lineStyle(2, armed ? 0xff79c6 : 0x7dffb0, 1)
              .strokeRoundedRect(btnX, btnY, travelBtnW, travelBtnH, uiDim(6));
          });
          btnZ.on("pointerout", () => {
            listG.fillStyle(armed ? 0x2a0a22 : 0x0a1f18, 0.98).fillRoundedRect(btnX, btnY, travelBtnW, travelBtnH, uiDim(6));
            listG
              .lineStyle(1.5, armed ? COLORS.neonMagenta : 0x39ff88, 0.95)
              .strokeRoundedRect(btnX, btnY, travelBtnW, travelBtnH, uiDim(6));
          });
          btnZ.on("pointerdown", (pointer: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
            ev.stopPropagation();
            if (pointer.rightButtonDown()) {
              this.zoneMenu(pointer, n);
              return;
            }
            this.doTravel(n.zone);
          });
        } else {
          listG.fillStyle(0x12180a, 0.95).fillRoundedRect(btnX, btnY, travelBtnW, travelBtnH, uiDim(6));
          listG.lineStyle(1.5, 0x6a8a40, 0.85).strokeRoundedRect(btnX, btnY, travelBtnW, travelBtnH, uiDim(6));
          addListText("WALK", btnX + travelBtnW / 2, btnY + uiDim(7), 11, "#b8e07a", true, 0.5);
          const btnZ = scene.add
            .zone(btnX, btnY, travelBtnW, travelBtnH)
            .setOrigin(0)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true })
            .setDepth(D + 6);
          listRoot.add(btnZ);
          this.objs.push(btnZ);
          btnZ.on("pointerdown", (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
            ev.stopPropagation();
            this.close();
            this.onWalkToZone?.(n.zone);
          });
        }

        // Row body click (not the button) — examine menu / travel
        const rowZ = scene.add
          .zone(cardX, ry, cardW - travelBtnW - uiDim(16), cardH)
          .setOrigin(0)
          .setScrollFactor(0)
          .setInteractive({ useHandCursor: true })
          .setDepth(D + 5);
        listRoot.add(rowZ);
        this.objs.push(rowZ);
        rowZ.on("pointerdown", (pointer: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
          if (pointer.rightButtonDown()) {
            ev.stopPropagation();
            this.zoneMenu(pointer, n);
            return;
          }
          if (here) {
            this.onExamine?.(this.zoneBlurb(n.zone, n.label));
            return;
          }
          // Left-click row (not TRAVEL btn) still travels when route open.
          if (route && !(pointer.event as MouseEvent | undefined)?.shiftKey) this.doTravel(n.zone);
          else {
            this.close();
            this.onWalkToZone?.(n.zone);
          }
        });

        cy += rowH;
      }
      cy += uiDim(2);
    }

    // Position list content under the graph; clip + scroll so every section stays reachable.
    const contentH = cy;
    listRoot.setY(listTop);
    const needsScroll = contentH > listClipH + 2;
    {
      const maskG = scene.make.graphics({ x: 0, y: 0 });
      maskG.fillStyle(0xffffff).fillRect(x + uiDim(10), listTop, w - uiDim(20), listClipH);
      listRoot.setMask(maskG.createGeometryMask());
      this.objs.push(maskG);

      let scrollY = 0;
      const maxScroll = Math.max(0, contentH - listClipH + uiDim(6));
      // Scroll track / thumb so overflow is obvious (DUNGEONS used to vanish off-frame).
      const trackX = x + w - uiDim(10);
      const trackW = uiDim(4);
      const trackG = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 7));
      const paintScroll = () => {
        trackG.clear();
        if (!needsScroll) return;
        trackG.fillStyle(0x1a2030, 0.9).fillRoundedRect(trackX, listTop, trackW, listClipH, 2);
        const thumbH = Math.max(uiDim(24), (listClipH * listClipH) / contentH);
        const t = maxScroll > 0 ? -scrollY / maxScroll : 0;
        const thumbY = listTop + t * (listClipH - thumbH);
        trackG.fillStyle(0x39ff88, 0.85).fillRoundedRect(trackX, thumbY, trackW, thumbH, 2);
      };
      const applyScroll = (dy: number) => {
        if (!needsScroll) return;
        scrollY = Phaser.Math.Clamp(scrollY + dy, -maxScroll, 0);
        listRoot.setY(listTop + scrollY);
        paintScroll();
      };
      paintScroll();

      const onWheel = (
        pointer: Phaser.Input.Pointer,
        _over: Phaser.GameObjects.GameObject[],
        _dx: number,
        dy: number,
      ) => {
        if (!this.open || !needsScroll) return;
        // Only when cursor is over the map panel list area.
        if (pointer.x < x || pointer.x > x + w || pointer.y < listTop || pointer.y > listTop + listClipH) return;
        applyScroll(-dy * 0.55);
      };
      scene.input.on("wheel", onWheel);
      // Touch / mouse drag on the list (not the TRAVEL button column).
      let dragging = false;
      let dragLast = 0;
      const onDown = (p: Phaser.Input.Pointer) => {
        if (!this.open || !needsScroll) return;
        if (p.x < x || p.x > x + w || p.y < listTop || p.y > listTop + listClipH) return;
        if (p.x > x + w - travelBtnW - uiDim(24)) return;
        dragging = true;
        dragLast = p.y;
      };
      const onMove = (p: Phaser.Input.Pointer) => {
        if (!dragging || !p.isDown) return;
        const d = p.y - dragLast;
        dragLast = p.y;
        applyScroll(d);
      };
      const onUp = () => {
        dragging = false;
      };
      scene.input.on("pointerdown", onDown);
      scene.input.on("pointermove", onMove);
      scene.input.on("pointerup", onUp);
      const detach = () => {
        scene.input.off("wheel", onWheel);
        scene.input.off("pointerdown", onDown);
        scene.input.off("pointermove", onMove);
        scene.input.off("pointerup", onUp);
      };
      // Clean up when panel rebuilds/closes (objs destroy doesn't auto-off scene listeners).
      listRoot.once("destroy", detach);

      if (needsScroll) {
        tx("scroll · wheel / drag", x + w / 2, y + h - uiDim(12), 9, "#5a6478", false, 0.5);
      }
    }

    animatePanelIn(scene, this.objs);
  }
}
