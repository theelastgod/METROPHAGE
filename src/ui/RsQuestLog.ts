import Phaser from "phaser";
import { QUESTS, getQuest } from "../game/quests";
import { BOUNTIES } from "../game/bounties";
import { FRAGMENTS } from "../game/fragments";
import Modal from "./Modal";
import { closeHint, dimBackdrop, modalRect, uiDim } from "./uiLayout";
import { bodyFont, displayFont, fitTextToWidth } from "./typography";
import { STUDIO } from "./studioChrome";

interface ContractRow {
  id: string;
  name: string;
  objective: string;
  count: number;
  progress: number;
  done: boolean;
}

interface BountyRow {
  id?: string;
  name: string;
  count: number;
  progress: number;
}

export interface QuestLogState {
  campaignId: string | null;
  campaignStage: number;
  campaignProgress: number;
  campaignObjective: string;
  /** Main story quests already finished. */
  campaignCompleted: string[];
  contracts: ContractRow[];
  bounty: BountyRow | null;
  fragments: string[];
}

/**
 * Quest journal — main story, side jobs, completed.
 * No giant glow orb (was misread as a "ball" taking the screen).
 */
export default class RsQuestLog extends Modal {
  private state: QuestLogState = {
    campaignId: null,
    campaignStage: 0,
    campaignProgress: 0,
    campaignObjective: "",
    campaignCompleted: [],
    contracts: [],
    bounty: null,
    fragments: [],
  };

  setState(s: QuestLogState) {
    this.state = s;
    if (this.open) this.build();
  }

  toggle(state?: QuestLogState) {
    if (state) this.state = state;
    this.toggleOpen();
  }

  protected build() {
    this.clear();
    const scene = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const D = 1760;
    const { x, y, w, h } = modalRect(540, 500);
    add(dimBackdrop(scene, D, 0.7, () => this.close(), { x, y, w, h }));

    // Solid frame only — no oversized ADD glow (that rendered as a giant ball).
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), 0xb06bff, 0.9).strokeRect(x, y, w, h);
    g.fillStyle(0xb06bff, 0.1).fillRect(x, y, w, uiDim(40));
    g.lineStyle(1, 0xffffff, 0.06).strokeRect(x + uiDim(3), y + uiDim(3), w - uiDim(6), h - uiDim(6));

    add(
      scene.add
        .text(x + uiDim(18), y + uiDim(12), "◆ QUEST LOG", displayFont(16, { color: "#d0a0ff", fontStyle: "bold" }))
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
    add(
      scene.add
        .text(x + w - uiDim(16), y + uiDim(14), closeHint("J / ESC"), bodyFont(10, { color: STUDIO.dim }))
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(D + 2),
    );

    let ry = y + uiDim(50);
    const left = x + uiDim(18);
    const innerW = w - uiDim(36);
    const line = (label: string, color: string, size = 11, bold = false) => {
      const t = add(
        scene.add
          .text(left, ry, label, bodyFont(size, { color, fontStyle: bold ? "bold" : "normal", wordWrap: { width: innerW } }))
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      ry += Math.max(uiDim(16), t.height + uiDim(2));
      return t;
    };
    const section = (title: string, accent: string) => {
      ry += uiDim(4);
      g.lineStyle(1, 0x2a2440, 0.85).lineBetween(left, ry, x + w - uiDim(18), ry);
      ry += uiDim(8);
      line(title, accent, 11, true);
      ry += uiDim(2);
    };

    // ── MAIN QUEST (story arc) ──────────────────────────────────────────────
    section("MAIN QUEST", "#f7ff3c");
    const completed = new Set(this.state.campaignCompleted ?? []);
    const activeId = this.state.campaignId;
    let anyMain = false;
    for (const q of QUESTS) {
      const done = completed.has(q.id);
      const active = activeId === q.id;
      // requiresFlag is a flag name — prior quests set it via setsFlag on complete.
      const isLocked = !done && !active && !!q.requiresFlag && !hasFlagFromCompleted(q.requiresFlag, completed);
      let mark = "○";
      let color = STUDIO.dim;
      let detail = "";
      if (done) {
        mark = "✓";
        color = STUDIO.ready;
        detail = "complete";
      } else if (active) {
        mark = "►";
        color = "#f7ff3c";
        const st = q.stages[this.state.campaignStage];
        if (st) {
          const n = st.on.count ?? 1;
          const prog = st.on.type === "talk" ? "" : ` ${this.state.campaignProgress}/${n}`;
          detail = `${st.objective}${prog}`;
        } else detail = this.state.campaignObjective || "in progress";
      } else if (isLocked) {
        mark = "◌";
        color = "#3a3550";
        detail = "locked";
      } else {
        mark = "○";
        color = "#9aa3b2";
        detail = "talk to THE FIXER";
      }
      anyMain = true;
      const row = add(
        scene.add
          .text(left, ry, `${mark} ${q.name}`, bodyFont(12, { color, fontStyle: active || done ? "bold" : "normal" }))
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      fitTextToWidth(row, innerW * 0.55, { minScale: 0.75 });
      add(
        scene.add
          .text(x + w - uiDim(18), ry, detail, bodyFont(10, { color: active ? "#eafdff" : color }))
          .setOrigin(1, 0)
          .setScrollFactor(0)
          .setDepth(D + 2),
      );
      ry += uiDim(18);
      if (active && q.stages.length) {
        // Compact stage checklist under active only
        for (let i = 0; i < q.stages.length; i++) {
          const st = q.stages[i];
          const stDone = i < this.state.campaignStage;
          const stAct = i === this.state.campaignStage;
          const m = stDone ? "  ✓" : stAct ? "  ►" : "  ·";
          const c = stDone ? STUDIO.ready : stAct ? "#c8d0dc" : "#4a4558";
          line(`${m} ${st.objective}`, c, 10);
        }
      }
      if (ry > y + h - uiDim(120)) break;
    }
    if (!anyMain) line("No story data", STUDIO.dim);

    // ── SIDE QUESTS (dailies + bounty + open NPC jobs) ─────────────────────
    section("SIDE QUESTS", "#00e5ff");
    let sideCount = 0;
    if (this.state.bounty) {
      const b = this.state.bounty;
      line(`► ${b.name}  (${Math.min(b.progress, b.count)}/${b.count})`, STUDIO.metro, 11, true);
      sideCount++;
    }
    for (const c of this.state.contracts) {
      if (c.done) continue;
      line(`► ${c.name} — ${c.objective}  (${Math.min(c.progress, c.count)}/${c.count})`, "#eafdff", 10);
      sideCount++;
    }
    // Available NPC bounties (not currently active)
    const activeBountyName = this.state.bounty?.name;
    for (const b of Object.values(BOUNTIES)) {
      if (activeBountyName && b.name === activeBountyName) continue;
      if (ry > y + h - uiDim(90)) break;
      line(`○ ${b.name} — talk to ${b.npc.toUpperCase()}`, STUDIO.dim, 10);
      sideCount++;
    }
    if (sideCount === 0) line("No side jobs right now", STUDIO.dim);

    // ── COMPLETED ──────────────────────────────────────────────────────────
    section("COMPLETED", STUDIO.ready);
    let doneN = 0;
    for (const id of this.state.campaignCompleted ?? []) {
      const q = getQuest(id);
      line(`✓ ${q?.name ?? id}`, STUDIO.ready, 11);
      doneN++;
    }
    for (const c of this.state.contracts.filter((c) => c.done)) {
      line(`✓ ${c.name} (daily)`, "#6ecf9a", 10);
      doneN++;
    }
    const frags = this.state.fragments ?? [];
    if (frags.length) {
      const titles = FRAGMENTS.filter((f) => frags.includes(f.id))
        .map((f) => f.title)
        .slice(0, 6);
      line(`✓ Memories ${frags.length}/${FRAGMENTS.length}${titles.length ? " · " + titles.join(", ") : ""}`, "#9fe8ff", 10);
      doneN++;
    }
    if (doneN === 0) line("Nothing finished yet", STUDIO.dim);

    // Footer hint
    ry = Math.max(ry, y + h - uiDim(28));
    add(
      scene.add
        .text(x + w / 2, y + h - uiDim(14), "Main = FIXER story · Side = dailies & NPC bounties", bodyFont(9, { color: STUDIO.dim }))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(D + 2),
    );
  }
}

/** Map campaign flag → previous quest that sets it (for lock display). */
function hasFlagFromCompleted(flag: string, completed: Set<string>): boolean {
  for (const q of QUESTS) {
    if (q.setsFlag === flag && completed.has(q.id)) return true;
  }
  // If no prior quest sets it, treat as unlocked (edge data).
  return !QUESTS.some((q) => q.setsFlag === flag);
}
