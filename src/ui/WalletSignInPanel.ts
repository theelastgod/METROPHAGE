import Phaser from "phaser";
import { COLORS } from "../config";

import { drawPanelFrame } from "./panelChrome";
import { dimBackdrop, modalRect, panelPad, uiDim, uiGap } from "./uiLayout";
import { bodyFont, displayFont } from "./typography";
import { addPanelGlow, drawScanlines as studioScanlines } from "./studioChrome";

export type WalletStep = "connect" | "sign" | "play";

export interface WalletAction {
  label: string;
  sub: string;
  color: number;
  primary?: boolean;
  onClick: () => void;
}

export interface WalletPanelState {
  step: WalletStep;
  status: "offline" | "ready" | "busy" | "error";
  statusText: string;
  headline: string;
  body: string;
  wallet?: string | null;
  actions: WalletAction[];
  showDisconnect?: boolean;
  onDisconnect?: () => void;
  /** Nudge panel down (design px) when a character preview sits above it. */
  offsetY?: number;
}

const STATUS_COLOR: Record<WalletPanelState["status"], string> = {
  offline: "#6b7184",
  ready: "#39ff88",
  busy: "#f7ff3c",
  error: "#ff3b6b",
};

const STEP_LABELS: Array<{ id: WalletStep; label: string }> = [
  { id: "connect", label: "CONNECT" },
  { id: "sign", label: "SIGN" },
  { id: "play", label: "ENTER" },
];

function panelHeight(actionCount: number) {
  if (actionCount === 0) return 340;
  const base = actionCount <= 1 ? 420 : 320;
  const perBtn = 64;
  return base + actionCount * perBtn;
}

/**
 * Centered identity gate — wallet connect + sign-in for the title screen.
 */
export default class WalletSignInPanel {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private animG: Phaser.GameObjects.Graphics;
  private glow?: Phaser.GameObjects.Image;
  private backdrop: Phaser.GameObjects.Container;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private frame = modalRect(580, panelHeight(1));
  private visible = false;
  private pulse = 0;
  private state: WalletPanelState | null = null;
  private btnRects: Array<{ x: number; y: number; w: number; h: number; act: WalletAction }> = [];
  private hoverBtn = -1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.backdrop = dimBackdrop(scene, 26, 0.48);
    this.backdrop.setVisible(false);
    this.root = scene.add.container(0, 0).setDepth(28).setVisible(false).setAlpha(0).setScale(0.97);
    this.g = scene.add.graphics();
    this.animG = scene.add.graphics();
    this.root.add([this.g, this.animG]);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    });
  }

  show(state: WalletPanelState) {
    this.visible = true;
    this.state = state;
    this.frame = modalRect(580, panelHeight(Math.max(1, state.actions.length)));
    if (state.offsetY) this.frame.y += uiDim(state.offsetY);
    this.backdrop.setVisible(true);
    this.root.setVisible(true);
    this.render(state);
    this.scene.tweens.add({
      targets: this.root,
      alpha: 1,
      scale: 1,
      duration: 320,
      ease: "Back.out",
    });
  }

  hide() {
    this.visible = false;
    this.state = null;
    this.hoverBtn = -1;
    this.backdrop.setVisible(false);
    this.root.setVisible(false);
    this.root.setAlpha(0).setScale(0.97);
    this.glow?.destroy();
    this.glow = undefined;
    this.clearDynamic();
  }

  private hex(c: number) {
    return "#" + c.toString(16).padStart(6, "0");
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.backdrop.destroy();
    this.root.destroy(true);
  }

  private tick(_t: number, dt: number) {
    if (!this.visible || !this.state) return;
    this.pulse += dt * 0.004;
    this.drawAnimOverlay();
  }

  private clearDynamic() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.btnRects = [];
    this.animG.clear();
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    this.root.add(o);
    return o;
  }

  private short(addr: string) {
    return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
  }

  private stepIndex(step: WalletStep) {
    return STEP_LABELS.findIndex((s) => s.id === step);
  }

  private drawScanlines(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
    g.fillStyle(0x00e5ff, 0.025);
    for (let ly = y; ly < y + h; ly += uiDim(4)) {
      g.fillRect(x, ly, w, 1);
    }
  }

  private drawAnimOverlay() {
    const ag = this.animG;
    ag.clear();
    if (!this.state) return;
    const { x, y } = this.frame;

    if (this.state.status === "busy") {
      const statusY = y + uiDim(118);
      const r = uiDim(8) + Math.sin(this.pulse) * uiDim(2);
      ag.lineStyle(1, COLORS.neonYellow, 0.35 + Math.sin(this.pulse) * 0.15).strokeCircle(x + uiDim(30), statusY + uiDim(8), r);
      ag.lineStyle(1, COLORS.neonYellow, 0.15).strokeCircle(x + uiDim(30), statusY + uiDim(8), r + uiDim(6));
    }

    for (let i = 0; i < this.btnRects.length; i++) {
      const btn = this.btnRects[i];
      if (btn.act.primary ?? this.state.actions.indexOf(btn.act) === 0) {
        const pulse = 0.06 + Math.sin(this.pulse) * 0.03;
        ag.fillStyle(btn.act.color, pulse).fillRoundedRect(btn.x + uiDim(2), btn.y + uiDim(2), btn.w - uiDim(4), btn.h - uiDim(4), 3);
      }
      if (i === this.hoverBtn) {
        const inset = uiDim(3);
        ag.lineStyle(uiDim(2), btn.act.color, 1).strokeRoundedRect(
          btn.x + inset,
          btn.y + inset,
          btn.w - inset * 2,
          btn.h - inset * 2,
          4,
        );
      }
    }
  }

  private render(state: WalletPanelState) {
    this.hoverBtn = -1;
    this.clearDynamic();
    const { x, y, w, h } = this.frame;
    const g = this.g;
    g.clear();

    drawPanelFrame(g, x, y, w, h);
    this.glow?.destroy();
    const glowTint = state.status === "error" ? 0xff3b6b : state.status === "ready" ? 0x39ff88 : COLORS.neonCyan;
    this.glow = addPanelGlow(this.scene, x, y, w, h, glowTint, 0.12);
    this.root.addAt(this.glow, 0);
    studioScanlines(g, x + panelPad(), y + uiDim(64), w - panelPad() * 2, h - uiDim(88));

    // left accent rail
    g.fillStyle(COLORS.neonCyan, 0.55).fillRect(x + uiDim(4), y + uiDim(14), uiDim(3), h - uiDim(28));

    // header band
    g.fillStyle(0x120a24, 0.94).fillRect(x + uiGap("md"), y + uiGap("xs"), w - uiGap("lg"), uiDim(58));
    g.lineStyle(1, COLORS.neonCyan, 0.4).lineBetween(x + panelPad(), y + uiDim(62), x + w - panelPad(), y + uiDim(62));

    this.add(
      this.scene.add
        .text(x + panelPad(), y + uiGap("md"), "◢ METROPHAGE", displayFont(20, { color: "#00e5ff", fontStyle: "bold" }))
        .setOrigin(0, 0)
        .setShadow(0, 0, "#00e5ff", 4, true, true),
    );
    this.add(
      this.scene.add
        .text(x + w - panelPad(), y + uiGap("lg"), "SOLANA · $METRO", bodyFont(11, { color: "#6b7184" }))
        .setOrigin(1, 0),
    );

    // step rail with progress connector
    const stepY = y + uiDim(80);
    const railPad = panelPad();
    const stepW = (w - railPad * 2) / STEP_LABELS.length;
    const cur = this.stepIndex(state.step);

    g.lineStyle(2, 0x2a2440, 0.8);
    g.lineBetween(x + railPad + stepW * 0.5, stepY + uiDim(14), x + w - railPad - stepW * 0.5, stepY + uiDim(14));
    if (cur > 0) {
      const progEnd = x + railPad + stepW * (cur + 0.5);
      g.lineStyle(2, COLORS.neonGreen, 0.65);
      g.lineBetween(x + railPad + stepW * 0.5, stepY + uiDim(14), progEnd, stepY + uiDim(14));
    }

    STEP_LABELS.forEach((s, i) => {
      const sx = x + railPad + i * stepW;
      const boxW = stepW - uiGap("md");
      const active = s.id === state.step;
      const done = cur > i;
      const accent = active ? 0x00e5ff : done ? 0x39ff88 : 0x2a2440;
      g.fillStyle(accent, active ? 0.28 : done ? 0.14 : 0.08).fillRoundedRect(sx, stepY, boxW, uiDim(34), 4);
      g.lineStyle(1, accent, active ? 1 : 0.5).strokeRoundedRect(sx, stepY, boxW, uiDim(34), 4);
      const prefix = done ? "✓" : `${i + 1}`;
      this.add(
        this.scene.add
          .text(sx + boxW / 2, stepY + uiGap("sm"), `${prefix} ${s.label}`, bodyFont(10, { color: active ? "#eafdff" : done ? "#39ff88" : "#5a6172", fontStyle: active ? "bold" : "normal" }))
          .setOrigin(0.5, 0),
      );
    });

    // status pill
    const statusY = y + uiDim(128);
    const dotColor = STATUS_COLOR[state.status];
    const pillW = uiDim(200);
    g.fillStyle(0x0a1020, 0.85).fillRoundedRect(x + uiDim(22), statusY - uiDim(4), pillW, uiDim(28), 6);
    g.lineStyle(1, parseInt(dotColor.slice(1), 16), 0.55).strokeRoundedRect(x + uiDim(22), statusY - uiDim(4), pillW, uiDim(28), 6);
    g.fillStyle(parseInt(dotColor.slice(1), 16), 0.95).fillCircle(x + uiDim(38), statusY + uiDim(10), uiDim(4));
    this.add(
      this.scene.add
        .text(x + uiDim(50), statusY + uiDim(2), state.statusText.toUpperCase(), bodyFont(11, { color: dotColor, fontStyle: "bold" }))
        .setOrigin(0, 0),
    );

    if (state.wallet) {
      const chipW = uiDim(172);
      const chipX = x + w - uiDim(22) - chipW;
      g.fillStyle(0x0a1830, 0.92).fillRoundedRect(chipX, statusY - uiDim(4), chipW, uiDim(28), 6);
      g.lineStyle(1, COLORS.neonGreen, 0.75).strokeRoundedRect(chipX, statusY - uiDim(4), chipW, uiDim(28), 6);
      this.add(
        this.scene.add
          .text(chipX + chipW / 2, statusY + uiDim(10), `◈ ${this.short(state.wallet)}`, bodyFont(11, { color: "#39ff88", fontStyle: "bold" }))
          .setOrigin(0.5),
      );
    }

    const btnH = uiDim(54);
    const btnGap = uiGap("md");
    const footerH = uiDim(44);
    const actionBlockH = state.actions.length * btnH + Math.max(0, state.actions.length - 1) * btnGap;
    const actionTop = y + h - footerH - uiGap("lg") - actionBlockH;

    const contentY = y + uiDim(168);
    const contentBottom = state.actions.length > 0 ? actionTop - uiGap("xl") : y + h - footerH - uiGap("lg");
    const contentH = Math.max(uiDim(72), contentBottom - contentY);
    const compact = state.actions.length === 0;

    if (!compact) {
      g.fillStyle(0x08061a, 0.55).fillRoundedRect(x + panelPad(), contentY, w - panelPad() * 2, contentH, 6);
      g.lineStyle(1, 0x1b2740, 0.6).strokeRoundedRect(x + panelPad(), contentY, w - panelPad() * 2, contentH, 6);
      this.drawScanlines(g, x + panelPad() + uiGap("xs"), contentY + uiGap("xs"), w - panelPad() * 2 - uiGap("sm"), contentH - uiGap("sm"));
    }

    const headlineY = contentY + uiGap("md");
    const bodyY = headlineY + uiDim(40);
    this.add(
      this.scene.add
        .text(x + panelPad() + uiGap("sm"), headlineY, state.headline, displayFont(compact ? 22 : 24, { color: "#eafdff", fontStyle: "bold", wordWrap: { width: w - panelPad() * 2 - uiGap("lg") } }))
        .setOrigin(0, 0),
    );
    const bodyText = this.scene.add
      .text(x + panelPad() + uiGap("sm"), bodyY, state.body, bodyFont(14, { color: "#9aa3b2", wordWrap: { width: w - panelPad() * 2 - uiGap("lg") } }))
      .setOrigin(0, 0);
    this.add(bodyText);

    if (compact) {
      const tipY = bodyY + uiDim(72);
      this.add(
        this.scene.add
          .text(x + w / 2, tipY, "Install Phantom, Backpack, or Solflare\nThen refresh this page", bodyFont(12, { color: "#5a6172", align: "center" }))
          .setOrigin(0.5, 0),
      );
    }

    // security strip — sits just above the action block; decorative, so it yields
    // (hides) when the wrapped body copy runs long instead of overlapping it
    if (state.actions.length > 0) {
      const stripY = actionTop - uiDim(30);
      if (bodyText.y + bodyText.height + uiGap("sm") <= stripY) {
        g.fillStyle(0x0e1830, 0.5).fillRect(x + panelPad(), stripY, w - panelPad() * 2, uiDim(22));
        g.lineStyle(1, COLORS.neonCyan, 0.25).lineBetween(x + panelPad(), stripY, x + w - panelPad(), stripY);
        this.add(
          this.scene.add
            .text(x + w / 2, stripY + uiGap("sm"), "NO TX FEE  ·  READ-ONLY CONNECT  ·  ONE RUNNER PER WALLET", bodyFont(9, { color: "#4a5266" }))
            .setOrigin(0.5, 0),
        );
      }
    }

    // actions — anchored above footer
    const btnW = w - panelPad() * 2;
    let ay = actionTop;
    for (const act of state.actions) {
      const bx = x + panelPad();
      const primary = act.primary ?? state.actions.indexOf(act) === 0;
      const fill = primary ? act.color : 0x0e0c1c;
      const alpha = primary ? 0.32 : 0.88;
      const rim = uiDim(2);
      g.fillStyle(fill, alpha).fillRoundedRect(bx, ay, btnW, btnH, 4);
      g.lineStyle(uiDim(primary ? 2 : 1), act.color, primary ? 0.95 : 0.5).strokeRoundedRect(
        bx + rim,
        ay + rim,
        btnW - rim * 2,
        btnH - rim * 2,
        4,
      );

      const label = this.scene.add
        .text(bx + uiGap("lg"), ay + uiGap("md"), act.label, displayFont(primary ? 17 : 15, { color: primary ? "#eafdff" : this.hex(act.color), fontStyle: "bold" }))
        .setOrigin(0, 0);
      const sub = this.scene.add
        .text(bx + uiGap("lg"), ay + uiDim(32), act.sub, bodyFont(10, { color: "#7a8295", wordWrap: { width: btnW - uiGap("section") } }))
        .setOrigin(0, 0);
      const chev = this.scene.add
        .text(bx + btnW - uiDim(16), ay + btnH / 2, "▸", displayFont(18, { color: this.hex(act.color) }))
        .setOrigin(0.5);
      this.add(label);
      this.add(sub);
      this.add(chev);

      const btnIdx = this.btnRects.length;
      this.btnRects.push({ x: bx, y: ay, w: btnW, h: btnH, act });
      const zone = this.scene.add.zone(bx, ay, btnW, btnH).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on("pointerover", () => {
        this.hoverBtn = btnIdx;
        label.setColor("#ffffff");
        chev.setScale(1.15);
        this.drawAnimOverlay();
      });
      zone.on("pointerout", () => {
        this.hoverBtn = -1;
        label.setColor(primary ? "#eafdff" : this.hex(act.color));
        chev.setScale(1);
        this.drawAnimOverlay();
      });
      zone.on("pointerdown", act.onClick);
      this.add(zone);

      ay += btnH + btnGap;
    }

    // supported wallets + disconnect
    this.add(
      this.scene.add
        .text(x + panelPad(), y + h - uiDim(38), "METAMASK  ·  RABBY  ·  COINBASE  ·  PHANTOM", bodyFont(10, { color: "#4a5266" }))
        .setOrigin(0, 0),
    );

    if (state.showDisconnect && state.onDisconnect) {
      const link = this.scene.add
        .text(x + w - uiDim(24), y + h - uiDim(34), "disconnect wallet", bodyFont(10, { color: "#6b7184" }))
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true });
      link.on("pointerover", () => link.setColor("#ff3b6b"));
      link.on("pointerout", () => link.setColor("#6b7184"));
      link.on("pointerdown", state.onDisconnect);
      this.add(link);
    }

    this.drawAnimOverlay();
  }
}