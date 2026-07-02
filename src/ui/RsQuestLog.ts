import Phaser from "phaser";
import { getQuest } from "../game/quests";
import { FRAGMENTS } from "../game/fragments";
import { drawPanelFrame } from "./panelChrome";
import { dimBackdrop, modalRect, uiDim } from "./uiLayout";
import { bodyFont, displayFont } from "./typography";
import { addPanelGlow, animatePanelIn, drawScanlines, STUDIO } from "./studioChrome";

interface ContractRow {
  id: string;
  name: string;
  objective: string;
  count: number;
  progress: number;
  done: boolean;
}

interface BountyRow {
  name: string;
  count: number;
  progress: number;
}

export interface QuestLogState {
  campaignId: string | null;
  campaignStage: number;
  campaignProgress: number;
  campaignObjective: string;
  contracts: ContractRow[];
  bounty: BountyRow | null;
  /** Recovered memory-fragment ids (ICE-dive rewards). */
  fragments: string[];
}

/** RuneScape-style quest journal — campaign steps, dailies, bounty with checkmarks. */
export default class RsQuestLog {
  open = false;
  private scene: Phaser.Scene;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private state: QuestLogState = {
    campaignId: null,
    campaignStage: 0,
    campaignProgress: 0,
    campaignObjective: "",
    contracts: [],
    bounty: null,
    fragments: [],
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setState(s: QuestLogState) {
    this.state = s;
    if (this.open) this.build();
  }

  toggle(state?: QuestLogState) {
    if (state) this.state = state;
    this.open = !this.open;
    if (this.open) this.build();
    else this.clear();
  }

  close() {
    this.open = false;
    this.clear();
  }

  private clear() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }

  private build() {
    this.clear();
    const scene = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => {
      this.objs.push(o);
      return o;
    };
    const D = 1760;
    const { x, y, w, h } = modalRect(520, 460);
    add(dimBackdrop(scene, D, 0.66));
    const glow = addPanelGlow(scene, x, y, w, h, 0xb06bff, 0.09);
    glow.setScrollFactor(0).setDepth(D);
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    drawPanelFrame(g, x, y, w, h);
    drawScanlines(g, x, y, w, h, 0xb06bff, 0.02);

    add(
      scene.add
        .text(x + uiDim(22), y + uiDim(14), "◆ QUEST LOG", displayFont(17, { color: "#b06bff", fontStyle: "bold" }))
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
    add(
      scene.add
        .text(x + w - uiDim(22), y + uiDim(16), "J / ESC close", bodyFont(10, { color: STUDIO.dim }))
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(D + 2),
    );

    let ry = y + uiDim(48);
    const q = this.state.campaignId ? getQuest(this.state.campaignId) : null;
    add(
      scene.add
        .text(x + uiDim(22), ry, "CAMPAIGN", bodyFont(11, { color: "#f7ff3c", fontStyle: "bold" }))
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
    ry += uiDim(22);

    if (q) {
      add(
        scene.add
          .text(x + uiDim(22), ry, q.name, displayFont(14, { color: "#eafdff", fontStyle: "bold" }))
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      ry += uiDim(22);
      q.stages.forEach((st, i) => {
        const done = i < this.state.campaignStage;
        const active = i === this.state.campaignStage;
        const mark = done ? "✓" : active ? "►" : "○";
        const color = done ? STUDIO.ready : active ? "#f7ff3c" : STUDIO.dim;
        let line = `${mark} ${st.objective}`;
        if (active && st.on.type !== "talk" && st.on.count) {
          line += `  (${this.state.campaignProgress}/${st.on.count})`;
        }
        add(
          scene.add
            .text(x + uiDim(28), ry, line, bodyFont(11, { color, wordWrap: { width: w - uiDim(56) } }))
            .setScrollFactor(0)
            .setDepth(D + 2),
        );
        ry += uiDim(18);
      });
      if (this.state.campaignObjective) {
        add(
          scene.add
            .text(x + uiDim(28), ry, this.state.campaignObjective, bodyFont(10, { color: STUDIO.muted, wordWrap: { width: w - uiDim(56) } }))
            .setScrollFactor(0)
            .setDepth(D + 2),
        );
        ry += uiDim(24);
      }
    } else {
      add(
        scene.add
          .text(x + uiDim(28), ry, "○ Talk to THE FIXER on the plaza to begin your arc", bodyFont(11, { color: STUDIO.dim }))
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      ry += uiDim(28);
    }

    ry += uiDim(8);
    g.lineStyle(1, 0x2a2440, 0.8).lineBetween(x + uiDim(18), ry, x + w - uiDim(18), ry);
    ry += uiDim(12);
    add(
      scene.add
        .text(x + uiDim(22), ry, "DAILY CONTRACTS", bodyFont(11, { color: "#00e5ff", fontStyle: "bold" }))
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
    ry += uiDim(20);

    const contracts = this.state.contracts;
    if (contracts.length === 0) {
      add(
        scene.add.text(x + uiDim(28), ry, "no contracts loaded", bodyFont(11, { color: STUDIO.dim })).setScrollFactor(0).setDepth(D + 2),
      );
      ry += uiDim(20);
    } else {
      for (const c of contracts.slice(0, 5)) {
        const mark = c.done ? "✓" : "►";
        const color = c.done ? STUDIO.ready : "#eafdff";
        add(
          scene.add
            .text(
              x + uiDim(28),
              ry,
              `${mark} ${c.name} — ${c.objective}  (${Math.min(c.progress, c.count)}/${c.count})`,
              bodyFont(10, { color, wordWrap: { width: w - uiDim(56) } }),
            )
            .setScrollFactor(0)
            .setDepth(D + 2),
        );
        ry += uiDim(17);
      }
    }

    if (this.state.bounty) {
      ry += uiDim(8);
      g.lineStyle(1, 0x2a2440, 0.8).lineBetween(x + uiDim(18), ry, x + w - uiDim(18), ry);
      ry += uiDim(12);
      const b = this.state.bounty;
      add(
        scene.add
          .text(x + uiDim(22), ry, "BOUNTY", bodyFont(11, { color: STUDIO.metro, fontStyle: "bold" }))
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      ry += uiDim(18);
      add(
        scene.add
          .text(x + uiDim(28), ry, `► ${b.name}  (${Math.min(b.progress, b.count)}/${b.count})`, bodyFont(11, { color: STUDIO.metro }))
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      ry += uiDim(18);
    }

    // MEMORY — recovered fragments (ICE-dive rewards); the rest stay encrypted
    ry += uiDim(8);
    g.lineStyle(1, 0x2a2440, 0.8).lineBetween(x + uiDim(18), ry, x + w - uiDim(18), ry);
    ry += uiDim(12);
    const frags = this.state.fragments;
    add(
      scene.add
        .text(x + uiDim(22), ry, `MEMORY  ${frags.length} / ${FRAGMENTS.length}`, bodyFont(11, { color: "#9fe8ff", fontStyle: "bold" }))
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
    ry += uiDim(18);
    const known = FRAGMENTS.filter((f) => frags.includes(f.id))
      .map((f) => f.title)
      .slice(0, 4);
    add(
      scene.add
        .text(
          x + uiDim(28),
          ry,
          known.length ? known.join("  ·  ") : "○ dive an ICE SHAFT in any district to recover what they froze",
          bodyFont(10, { color: known.length ? "#eafdff" : STUDIO.dim, wordWrap: { width: w - uiDim(56) } }),
        )
        .setScrollFactor(0)
        .setDepth(D + 2),
    );

    animatePanelIn(scene, this.objs);
  }
}