import Phaser from "phaser";
import { COLORS, VIEW_H, VIEW_W } from "../config";

import { drawPanelFrame } from "./panelChrome";
import { dimBackdrop, panelPad, uiDim, uiGap } from "./uiLayout";
import { bodyFont, displayFont } from "./typography";
import { addPanelGlow } from "./studioChrome";

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

/**
 * Centered identity gate — wallet connect + sign-in for the title screen.
 * Layout is a single top-down stack so headline/body/actions never overlap.
 */
export default class WalletSignInPanel {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private animG: Phaser.GameObjects.Graphics;
  private glow?: Phaser.GameObjects.Image;
  private panelArt: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image | null = null;
  private backdrop: Phaser.GameObjects.Container;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private frame = { x: 0, y: 0, w: 0, h: 0 };
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
    this.backdrop.setVisible(true);
    this.root.setVisible(true);
    this.render(state);
    this.scene.tweens.add({
      targets: this.root,
      alpha: 1,
      scale: 1,
      duration: 280,
      ease: "Cubic.out",
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
    if (this.panelArt) {
      this.panelArt.setVisible(false);
    }
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

  private panelWidth() {
    const max = Math.min(uiDim(560), VIEW_W - uiDim(48));
    return Math.max(uiDim(320), max);
  }

  private drawAnimOverlay() {
    const ag = this.animG;
    ag.clear();
    if (!this.state) return;

    if (this.state.status === "busy") {
      const { x, y } = this.frame;
      const statusY = y + uiDim(108);
      const r = uiDim(7) + Math.sin(this.pulse) * uiDim(1.5);
      ag.lineStyle(1, COLORS.neonYellow, 0.35 + Math.sin(this.pulse) * 0.15).strokeCircle(x + uiDim(28), statusY + uiDim(10), r);
    }

    for (let i = 0; i < this.btnRects.length; i++) {
      const btn = this.btnRects[i];
      if (btn.act.primary ?? this.state.actions.indexOf(btn.act) === 0) {
        const pulse = 0.05 + Math.sin(this.pulse) * 0.025;
        ag.fillStyle(btn.act.color, pulse).fillRoundedRect(btn.x + uiDim(2), btn.y + uiDim(2), btn.w - uiDim(4), btn.h - uiDim(4), 3);
      }
      if (i === this.hoverBtn) {
        const inset = uiDim(2);
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

    const pad = panelPad();
    const gap = uiGap("md");
    const w = this.panelWidth();
    const innerW = w - pad * 2;
    const wrapW = innerW - uiGap("sm");

    // ── Measure content first so the frame height fits text (no clipping/overlap) ──
    const measure = (text: string, style: Phaser.Types.GameObjects.Text.TextStyle) => {
      const t = this.scene.add.text(0, 0, text, style).setVisible(false);
      const h = t.height;
      const tw = t.width;
      t.destroy();
      return { h, w: tw };
    };

    const headlineStyle = displayFont(20, {
      color: "#eafdff",
      fontStyle: "bold",
      wordWrap: { width: wrapW },
    });
    const bodyStyle = bodyFont(13, {
      color: "#9aa3b2",
      wordWrap: { width: wrapW },
      lineSpacing: uiDim(4),
    });
    const headlineM = measure(state.headline || " ", headlineStyle);
    const bodyM = measure(state.body || " ", bodyStyle);

    let btnH = uiDim(56);
    const btnGap = uiGap("sm");
    const n = state.actions.length;
    let actionH = n > 0 ? n * btnH + (n - 1) * btnGap : 0;

    // Vertical budget (design-stack):
    // header 52 · steps 40 · status 36 · content gap · headline · body · actions · footer 36
    const headerH = uiDim(52);
    const stepsH = uiDim(40);
    const statusH = uiDim(36);
    const contentPad = uiGap("lg");
    const footerH = uiDim(36);
    const stackGaps = gap * 4; // between major sections

    let contentBlock =
      contentPad + headlineM.h + uiGap("sm") + bodyM.h + contentPad;
    // Cap body-driven growth so the panel stays on screen with many actions.
    const maxPanel = VIEW_H - uiDim(24);
    let fixedChrome =
      headerH + stepsH + statusH + stackGaps + actionH + footerH + pad * 2;
    const maxContent = Math.max(uiDim(80), maxPanel - fixedChrome);
    if (contentBlock > maxContent) contentBlock = maxContent;

    let h = fixedChrome + contentBlock;
    // Many actions (guest CONTINUE = 5) can outgrow the view on their own — clamping h
    // alone let the button stack march past the frame and off-screen. Shrink the
    // buttons to fit before clamping.
    if (h > maxPanel && n > 0) {
      const minBtn = uiDim(42);
      const shrinkPer = Math.ceil((h - maxPanel) / n);
      const squeezed = Math.max(minBtn, btnH - shrinkPer);
      fixedChrome -= (btnH - squeezed) * n;
      btnH = squeezed;
      actionH = n * btnH + (n - 1) * btnGap;
      h = fixedChrome + contentBlock;
    }
    if (h > maxPanel) h = maxPanel;

    // Dead-center the modal on screen; only nudge down when a runner preview sits above.
    let x = (VIEW_W - w) / 2;
    let y = (VIEW_H - h) / 2;
    if (state.offsetY) {
      // Keep the panel optically centered under the preview instead of shoving it to the bottom.
      y = Math.min(y + uiDim(state.offsetY) * 0.55, VIEW_H - h - uiDim(12));
    }
    y = Math.max(uiDim(8), Math.min(y, VIEW_H - h - uiDim(8)));
    this.frame = { x, y, w, h };

    const g = this.g;
    g.clear();
    // Painted Higgsfield panel art when loaded; procedural chrome otherwise.
    this.panelArt = drawPanelFrame(g, x, y, w, h, COLORS.neonCyan, this.scene, this.panelArt);
    if (this.panelArt) {
      // Keep art behind text/buttons in the modal stack.
      this.root.addAt(this.panelArt, 0);
      this.panelArt.setDepth?.(this.root.depth);
    }
    this.glow?.destroy();
    const glowTint = state.status === "error" ? 0xff3b6b : state.status === "ready" ? 0x39ff88 : COLORS.neonCyan;
    this.glow = addPanelGlow(this.scene, x, y, w, h, glowTint, 0.1);
    this.root.addAt(this.glow, 0);

    // Left accent
    g.fillStyle(COLORS.neonCyan, 0.55).fillRect(x + uiDim(4), y + uiDim(12), uiDim(3), h - uiDim(24));

    // ── Header ──
    let cy = y + uiDim(10);
    g.fillStyle(0x120a24, 0.94).fillRect(x + uiGap("sm"), cy, w - uiGap("lg"), headerH - uiDim(4));
    this.add(
      this.scene.add
        .text(x + pad, cy + uiDim(8), "◢ METROPHAGE", displayFont(18, { color: "#00e5ff", fontStyle: "bold" }))
        .setOrigin(0, 0)
        .setShadow(0, 0, "#00e5ff", 3, true, true),
    );
    this.add(
      this.scene.add
        .text(x + w - pad, cy + uiDim(14), "ROBINHOOD · ETH L2", bodyFont(10, { color: "#6b7184" }))
        .setOrigin(1, 0),
    );
    cy += headerH;
    g.lineStyle(1, COLORS.neonCyan, 0.35).lineBetween(x + pad, cy - uiDim(4), x + w - pad, cy - uiDim(4));

    // ── Steps ──
    cy += uiGap("sm");
    const stepY = cy;
    const stepW = innerW / STEP_LABELS.length;
    const cur = this.stepIndex(state.step);
    g.lineStyle(2, 0x2a2440, 0.75);
    g.lineBetween(x + pad + stepW * 0.5, stepY + uiDim(14), x + w - pad - stepW * 0.5, stepY + uiDim(14));
    if (cur > 0) {
      g.lineStyle(2, COLORS.neonGreen, 0.65);
      g.lineBetween(x + pad + stepW * 0.5, stepY + uiDim(14), x + pad + stepW * (cur + 0.5), stepY + uiDim(14));
    }
    STEP_LABELS.forEach((s, i) => {
      const sx = x + pad + i * stepW;
      const boxW = stepW - uiGap("sm");
      const active = s.id === state.step;
      const done = cur > i;
      const accent = active ? 0x00e5ff : done ? 0x39ff88 : 0x2a2440;
      g.fillStyle(accent, active ? 0.22 : done ? 0.12 : 0.06).fillRoundedRect(sx, stepY, boxW, uiDim(30), 4);
      g.lineStyle(1, accent, active ? 0.95 : 0.45).strokeRoundedRect(sx, stepY, boxW, uiDim(30), 4);
      const prefix = done ? "✓" : `${i + 1}`;
      this.add(
        this.scene.add
          .text(
            sx + boxW / 2,
            stepY + uiDim(7),
            `${prefix} ${s.label}`,
            bodyFont(10, { color: active ? "#eafdff" : done ? "#39ff88" : "#5a6172", fontStyle: active ? "bold" : "normal" }),
          )
          .setOrigin(0.5, 0),
      );
    });
    cy += stepsH + gap;

    // ── Status row ──
    const statusY = cy;
    const dotColor = STATUS_COLOR[state.status];
    // Fit the pill to the text (capped) — a fixed pill was cropping copy mid-word.
    const statusMaxW = state.wallet ? innerW * 0.55 : innerW;
    const statusM = measure((state.statusText || "").toUpperCase(), bodyFont(11, { fontStyle: "bold" }));
    let statusText = (state.statusText || "").toUpperCase();
    if (statusM.w > statusMaxW - uiDim(40)) {
      // Ellipsize instead of hard-cropping mid-glyph.
      const keep = Math.max(8, Math.floor(statusText.length * ((statusMaxW - uiDim(48)) / statusM.w)));
      statusText = statusText.slice(0, keep).trimEnd() + "…";
    }
    const statusTextM = measure(statusText, bodyFont(11, { fontStyle: "bold" }));
    const statusPillW = Math.min(statusMaxW, statusTextM.w + uiDim(40));
    g.fillStyle(0x0a1020, 0.9).fillRoundedRect(x + pad, statusY, statusPillW, uiDim(28), 6);
    g.lineStyle(1, parseInt(dotColor.slice(1), 16), 0.5).strokeRoundedRect(x + pad, statusY, statusPillW, uiDim(28), 6);
    g.fillStyle(parseInt(dotColor.slice(1), 16), 0.95).fillCircle(x + pad + uiDim(14), statusY + uiDim(14), uiDim(4));
    this.add(
      this.scene.add
        .text(x + pad + uiDim(26), statusY + uiDim(6), statusText, bodyFont(11, { color: dotColor, fontStyle: "bold" }))
        .setOrigin(0, 0),
    );

    if (state.wallet) {
      const chipLabel = `◈ ${this.short(state.wallet)}`;
      const chipW = Math.min(innerW * 0.4, uiDim(160));
      const chipX = x + w - pad - chipW;
      g.fillStyle(0x0a1830, 0.92).fillRoundedRect(chipX, statusY, chipW, uiDim(28), 6);
      g.lineStyle(1, COLORS.neonGreen, 0.7).strokeRoundedRect(chipX, statusY, chipW, uiDim(28), 6);
      this.add(
        this.scene.add
          .text(chipX + chipW / 2, statusY + uiDim(14), chipLabel, bodyFont(11, { color: "#39ff88", fontStyle: "bold" }))
          .setOrigin(0.5),
      );
    }
    cy += statusH + gap;

    // ── Content (headline + body) — centered in the middle of the panel ──
    const contentTop = cy;
    const contentH = contentBlock;
    g.fillStyle(0x08061a, 0.5).fillRoundedRect(x + pad, contentTop, innerW, contentH, 6);
    g.lineStyle(1, 0x1b2740, 0.55).strokeRoundedRect(x + pad, contentTop, innerW, contentH, 6);

    // Stack headline + body as a unit, then center that unit inside the box.
    const stackH = headlineM.h + uiGap("sm") + Math.min(bodyM.h, contentH - contentPad * 2 - headlineM.h - uiGap("sm"));
    const stackTop = contentTop + Math.max(contentPad, (contentH - stackH) / 2);
    const midX = x + w / 2;

    const headlineCentered = displayFont(20, {
      color: "#eafdff",
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: wrapW },
    });
    const bodyCentered = bodyFont(13, {
      color: "#9aa3b2",
      align: "center",
      wordWrap: { width: wrapW },
      lineSpacing: uiDim(4),
    });

    this.add(
      this.scene.add
        .text(midX, stackTop, state.headline, headlineCentered)
        .setOrigin(0.5, 0),
    );

    const bodyY = stackTop + headlineM.h + uiGap("sm");
    const bodyMaxH = contentTop + contentH - contentPad - bodyY;
    const bodyText = this.scene.add
      .text(midX, bodyY, state.body, bodyCentered)
      .setOrigin(0.5, 0);
    if (bodyMaxH <= uiDim(20)) {
      // No room in a squeezed panel — hiding beats spilling over the action buttons.
      bodyText.setVisible(false);
    } else if (bodyText.height > bodyMaxH) {
      // Crop from top of the text object; origin is center-x so crop x is still 0-based.
      bodyText.setCrop(0, 0, wrapW + uiDim(4), bodyMaxH);
    }
    this.add(bodyText);
    cy = contentTop + contentH + gap;

    // ── Actions ──
    const btnW = innerW;
    let ay = cy;
    for (const act of state.actions) {
      const bx = x + pad;
      const primary = act.primary ?? state.actions.indexOf(act) === 0;
      const fill = primary ? act.color : 0x0e0c1c;
      const alpha = primary ? 0.28 : 0.9;
      g.fillStyle(fill, alpha).fillRoundedRect(bx, ay, btnW, btnH, 4);
      g.lineStyle(uiDim(primary ? 2 : 1), act.color, primary ? 0.95 : 0.5).strokeRoundedRect(
        bx + uiDim(1),
        ay + uiDim(1),
        btnW - uiDim(2),
        btnH - uiDim(2),
        4,
      );

      // Two clean lines: label + sub — sub drops out when the stack was squeezed short.
      const twoLine = btnH >= uiDim(50);
      const label = this.scene.add
        .text(bx + uiGap("lg"), ay + (twoLine ? uiDim(17) : btnH / 2), act.label, displayFont(primary ? 15 : 14, {
          color: primary ? "#eafdff" : this.hex(act.color),
          fontStyle: "bold",
        }))
        .setOrigin(0, 0.5);
      const sub = this.scene.add
        .text(bx + uiGap("lg"), ay + uiDim(32), act.sub, bodyFont(10, {
          color: "#7a8295",
          wordWrap: { width: btnW - uiDim(48) },
        }))
        .setOrigin(0, 0)
        .setVisible(twoLine);
      // Single-line sub: crop if it wraps past the button.
      if (sub.height > uiDim(16)) {
        sub.setCrop(0, 0, btnW - uiDim(48), uiDim(14));
      }
      const chev = this.scene.add
        .text(bx + btnW - uiDim(18), ay + btnH / 2, "▸", displayFont(16, { color: this.hex(act.color) }))
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
        chev.setScale(1.12);
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
    cy = n > 0 ? ay - btnGap + gap : cy;

    // ── Footer ── (decorative — drop it when the action stack was squeezed to fit,
    // or the rule/text lands on top of the last button)
    const footerY = y + h - footerH;
    const squeezed = n > 0 && btnH < uiDim(50);
    if (!squeezed) {
      g.lineStyle(1, 0x1b2740, 0.5).lineBetween(x + pad, footerY, x + w - pad, footerY);
      this.add(
        this.scene.add
          .text(x + pad, footerY + uiDim(10), "METAMASK · ROBINHOOD CHAIN", bodyFont(10, { color: "#4a5266" }))
          .setOrigin(0, 0),
      );
    }

    if (state.showDisconnect && state.onDisconnect) {
      const link = this.scene.add
        .text(x + w - pad, footerY + uiDim(10), "disconnect", bodyFont(10, { color: "#6b7184" }))
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
