import Phaser from "phaser";
import { COLORS, VIEW_H, VIEW_W } from "../config";
import {
  IDENTITY_BTN_PRIMARY_KEY,
  IDENTITY_BTN_SECONDARY_KEY,
  IDENTITY_MARK_KEY,
  IDENTITY_PANEL_KEY,
} from "../assets/manifest";

import { drawPanelFrame, ensureButtonStrip, ensurePanelImage } from "./panelChrome";
import { dimBackdrop, uiDim, uiGap } from "./uiLayout";
import { bodyFont, displayFont } from "./typography";
import { addPanelGlow } from "./studioChrome";
import { prefersMobileUx } from "../systems/Mobile";

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
 * Desktop-first card proportions (narrower, tighter type) rather than tablet-wide.
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
    this.backdrop = dimBackdrop(scene, 26, 0.42);
    this.backdrop.setVisible(false);
    this.root = scene.add.container(0, 0).setDepth(28).setVisible(false).setAlpha(0).setScale(0.985);
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
      duration: 240,
      ease: "Cubic.out",
    });
  }

  hide() {
    this.visible = false;
    this.state = null;
    this.hoverBtn = -1;
    this.backdrop.setVisible(false);
    this.root.setVisible(false);
    this.root.setAlpha(0).setScale(0.985);
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
    this.pulse += dt * 0.0035;
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

  /** Card width — full-bleed sheet on phones, compact card on desktop. */
  private panelWidth() {
    if (prefersMobileUx()) {
      // Use nearly full landscape width with breathing room for thumbs / safe area.
      return Math.min(VIEW_W - uiDim(20), uiDim(520));
    }
    const max = Math.min(uiDim(400), VIEW_W - uiDim(72));
    return Math.max(uiDim(300), max);
  }

  private isMobile() {
    return prefersMobileUx();
  }

  private drawAnimOverlay() {
    const ag = this.animG;
    ag.clear();
    if (!this.state) return;

    if (this.state.status === "busy") {
      const { x, y } = this.frame;
      const statusY = y + uiDim(86);
      const r = uiDim(5) + Math.sin(this.pulse) * uiDim(1.2);
      ag.lineStyle(1, COLORS.neonYellow, 0.32 + Math.sin(this.pulse) * 0.12).strokeCircle(
        x + uiDim(22),
        statusY + uiDim(9),
        r,
      );
    }

    for (let i = 0; i < this.btnRects.length; i++) {
      const btn = this.btnRects[i];
      if (btn.act.primary ?? this.state.actions.indexOf(btn.act) === 0) {
        const pulse = 0.04 + Math.sin(this.pulse) * 0.02;
        ag.fillStyle(btn.act.color, pulse).fillRoundedRect(
          btn.x + uiDim(1),
          btn.y + uiDim(1),
          btn.w - uiDim(2),
          btn.h - uiDim(2),
          2,
        );
      }
      if (i === this.hoverBtn) {
        const inset = uiDim(1);
        ag.lineStyle(uiDim(1.5), btn.act.color, 0.95).strokeRoundedRect(
          btn.x + inset,
          btn.y + inset,
          btn.w - inset * 2,
          btn.h - inset * 2,
          2,
        );
      }
    }
  }

  private render(state: WalletPanelState) {
    this.hoverBtn = -1;
    this.clearDynamic();

    const mobile = this.isMobile();
    // Mobile: roomy thumb padding + bigger actions. Desktop: tight card.
    const pad = uiDim(mobile ? 14 : 18);
    const gap = uiGap(mobile ? "xs" : "sm");
    const w = this.panelWidth();
    const innerW = w - pad * 2;
    const wrapW = innerW - uiGap("xs");

    const measure = (text: string, style: Phaser.Types.GameObjects.Text.TextStyle) => {
      const t = this.scene.add.text(0, 0, text, style).setVisible(false);
      const h = t.height;
      const tw = t.width;
      t.destroy();
      return { h, w: tw };
    };

    const headlineStyle = displayFont(mobile ? 15 : 16, {
      color: "#eafdff",
      fontStyle: "bold",
      wordWrap: { width: wrapW },
    });
    // Shorter body copy on phones — less vertical bulk in the center.
    const bodyStyle = bodyFont(mobile ? 10 : 11, {
      color: "#8b93a5",
      wordWrap: { width: wrapW },
      lineSpacing: uiDim(mobile ? 2 : 3),
    });
    const headlineM = measure(state.headline || " ", headlineStyle);
    const bodyM = measure(state.body || " ", bodyStyle);

    // Mobile: finger-tall primary rows (~48–52 design px). Desktop: compact.
    let btnH = uiDim(mobile ? 50 : 44);
    const btnGap = uiDim(mobile ? 8 : 6);
    const n = state.actions.length;
    let actionH = n > 0 ? n * btnH + (n - 1) * btnGap : 0;

    const headerH = uiDim(mobile ? 32 : 40);
    const stepsH = uiDim(mobile ? 22 : 28);
    const statusH = uiDim(mobile ? 22 : 26);
    const contentPad = uiDim(mobile ? 6 : 10);
    const footerH = uiDim(mobile ? 20 : 28);
    const stackGaps = gap * 3;

    let contentBlock = contentPad + headlineM.h + uiDim(4) + bodyM.h + contentPad;
    // Cap body height on mobile so buttons always fit above the fold.
    if (mobile) {
      const maxBody = uiDim(52);
      if (bodyM.h > maxBody) {
        contentBlock = contentPad + headlineM.h + uiDim(4) + maxBody + contentPad;
      }
    }
    // Leave headroom for title/tagline above the card on mobile (top-aligned sheet).
    const maxPanel = mobile ? VIEW_H - uiDim(88) : VIEW_H - uiDim(32);
    let fixedChrome = headerH + stepsH + statusH + stackGaps + actionH + footerH + pad * 2;
    const maxContent = Math.max(uiDim(mobile ? 48 : 64), maxPanel - fixedChrome);
    if (contentBlock > maxContent) contentBlock = maxContent;

    let h = fixedChrome + contentBlock;
    if (h > maxPanel && n > 0) {
      const minBtn = uiDim(mobile ? 44 : 36);
      const shrinkPer = Math.ceil((h - maxPanel) / n);
      const squeezed = Math.max(minBtn, btnH - shrinkPer);
      fixedChrome -= (btnH - squeezed) * n;
      btnH = squeezed;
      actionH = n * btnH + (n - 1) * btnGap;
      h = fixedChrome + contentBlock;
    }
    if (h > maxPanel) h = maxPanel;

    let x = (VIEW_W - w) / 2;
    // Mobile: sit under the brand mark (upper third) — not dead-center clutter.
    // Desktop: classic vertical center.
    let y: number;
    if (mobile) {
      y = uiDim(72);
      if (state.offsetY) y += uiDim(state.offsetY) * 0.25;
      y = Math.max(uiDim(56), Math.min(y, VIEW_H - h - uiDim(12)));
    } else {
      y = (VIEW_H - h) / 2;
      if (state.offsetY) {
        y = Math.min(y + uiDim(state.offsetY) * 0.45, VIEW_H - h - uiDim(14));
      }
      y = Math.max(uiDim(10), Math.min(y, VIEW_H - h - uiDim(10)));
    }
    this.frame = { x, y, w, h };

    const g = this.g;
    g.clear();
    // Prefer dedicated identity-gate chrome; fall back to shared HUD panel frame.
    const identityPanel = this.scene.textures.exists(IDENTITY_PANEL_KEY);
    if (identityPanel) {
      this.panelArt = ensurePanelImage(
        this.scene,
        this.panelArt,
        x,
        y,
        w,
        h,
        IDENTITY_PANEL_KEY,
        this.root.depth,
        0xffffff,
        0.94,
        56,
      );
      if (this.panelArt) {
        this.root.addAt(this.panelArt, 0);
        // Dark glass so painted neon frame doesn't wash out type.
        g.fillStyle(0x04030c, 0.78).fillRect(x + uiDim(12), y + uiDim(12), w - uiDim(24), h - uiDim(24));
        g.fillStyle(COLORS.neonCyan, 0.04).fillRect(x + uiDim(14), y + uiDim(14), w - uiDim(28), uiDim(26));
      }
    } else {
      this.panelArt = drawPanelFrame(g, x, y, w, h, COLORS.neonCyan, this.scene, this.panelArt);
      if (this.panelArt) this.root.addAt(this.panelArt, 0);
    }
    this.glow?.destroy();
    const glowTint = state.status === "error" ? 0xff3b6b : state.status === "ready" ? 0x39ff88 : COLORS.neonCyan;
    this.glow = addPanelGlow(this.scene, x, y, w, h, glowTint, identityPanel ? 0.06 : 0.08);
    this.root.addAt(this.glow, 0);

    // Slim left accent rail (skip when identity panel already carries edge glow)
    if (!identityPanel) {
      g.fillStyle(COLORS.neonCyan, 0.65).fillRect(x + uiDim(3), y + uiDim(10), uiDim(2), h - uiDim(20));
    }

    // ── Header (compact brand band) ──
    let cy = y + uiDim(8);
    g.fillStyle(0x0c0818, identityPanel ? 0.55 : 0.88).fillRect(x + uiDim(6), cy, w - uiDim(12), headerH - uiDim(2));
    const hasMark = this.scene.textures.exists(IDENTITY_MARK_KEY);
    const markSize = uiDim(22);
    let titleX = x + pad;
    if (hasMark) {
      const mark = this.scene.add
        .image(x + pad + markSize / 2, cy + headerH / 2 - uiDim(1), IDENTITY_MARK_KEY)
        .setDisplaySize(markSize, markSize)
        .setAlpha(0.95);
      this.add(mark);
      titleX = x + pad + markSize + uiDim(8);
    }
    this.add(
      this.scene.add
        .text(titleX, cy + uiDim(7), "IDENTITY", displayFont(13, { color: "#00e5ff", fontStyle: "bold" }))
        .setOrigin(0, 0)
        .setShadow(0, 0, "#00e5ff", 2, true, true),
    );
    this.add(
      this.scene.add
        .text(x + w - pad, cy + uiDim(11), "SOL · MAINNET", bodyFont(9, { color: "#4e5568" }))
        .setOrigin(1, 0),
    );
    cy += headerH;
    g.lineStyle(1, COLORS.neonCyan, 0.28).lineBetween(x + pad, cy - uiDim(2), x + w - pad, cy - uiDim(2));

    // ── Steps as a thin rail + dots (not tablet pills) ──
    cy += uiDim(8);
    const stepY = cy;
    const stepW = innerW / STEP_LABELS.length;
    const cur = this.stepIndex(state.step);
    const railY = stepY + uiDim(6);
    g.lineStyle(1, 0x2a2440, 0.7);
    g.lineBetween(x + pad + stepW * 0.5, railY, x + w - pad - stepW * 0.5, railY);
    if (cur > 0) {
      g.lineStyle(1.5, COLORS.neonGreen, 0.7);
      g.lineBetween(x + pad + stepW * 0.5, railY, x + pad + stepW * (cur + 0.5), railY);
    }
    STEP_LABELS.forEach((s, i) => {
      const sx = x + pad + i * stepW + stepW / 2;
      const active = s.id === state.step;
      const done = cur > i;
      const accent = active ? 0x00e5ff : done ? 0x39ff88 : 0x3a4050;
      g.fillStyle(0x0a0e18, 1).fillCircle(sx, railY, uiDim(5));
      g.fillStyle(accent, active ? 0.95 : done ? 0.7 : 0.35).fillCircle(sx, railY, uiDim(3));
      if (active) {
        g.lineStyle(1, accent, 0.55).strokeCircle(sx, railY, uiDim(6));
      }
      this.add(
        this.scene.add
          .text(sx, railY + uiDim(10), s.label, bodyFont(8, {
            color: active ? "#c8d0dc" : done ? "#39ff88" : "#4a5260",
            fontStyle: active ? "bold" : "normal",
          }))
          .setOrigin(0.5, 0),
      );
    });
    cy += stepsH + gap;

    // ── Status row (slim) ──
    const statusY = cy;
    const dotColor = STATUS_COLOR[state.status];
    const statusMaxW = state.wallet ? innerW * 0.58 : innerW;
    let statusText = (state.statusText || "").toUpperCase();
    const statusM = measure(statusText, bodyFont(9, { fontStyle: "bold" }));
    if (statusM.w > statusMaxW - uiDim(32)) {
      const keep = Math.max(8, Math.floor(statusText.length * ((statusMaxW - uiDim(40)) / statusM.w)));
      statusText = statusText.slice(0, keep).trimEnd() + "…";
    }
    const statusTextM = measure(statusText, bodyFont(9, { fontStyle: "bold" }));
    const statusPillW = Math.min(statusMaxW, statusTextM.w + uiDim(28));
    g.fillStyle(0x0a1020, 0.85).fillRoundedRect(x + pad, statusY, statusPillW, uiDim(20), 3);
    g.lineStyle(1, parseInt(dotColor.slice(1), 16), 0.4).strokeRoundedRect(x + pad, statusY, statusPillW, uiDim(20), 3);
    g.fillStyle(parseInt(dotColor.slice(1), 16), 0.95).fillCircle(x + pad + uiDim(10), statusY + uiDim(10), uiDim(3));
    this.add(
      this.scene.add
        .text(x + pad + uiDim(18), statusY + uiDim(4), statusText, bodyFont(9, { color: dotColor, fontStyle: "bold" }))
        .setOrigin(0, 0),
    );

    if (state.wallet) {
      const chipLabel = `◈ ${this.short(state.wallet)}`;
      const chipW = Math.min(innerW * 0.38, uiDim(120));
      const chipX = x + w - pad - chipW;
      g.fillStyle(0x0a1830, 0.9).fillRoundedRect(chipX, statusY, chipW, uiDim(20), 3);
      g.lineStyle(1, COLORS.neonGreen, 0.55).strokeRoundedRect(chipX, statusY, chipW, uiDim(20), 3);
      this.add(
        this.scene.add
          .text(chipX + chipW / 2, statusY + uiDim(10), chipLabel, bodyFont(9, { color: "#39ff88", fontStyle: "bold" }))
          .setOrigin(0.5),
      );
    }
    cy += statusH + gap;

    // ── Content ──
    const contentTop = cy;
    const contentH = contentBlock;
    g.fillStyle(0x060412, 0.55).fillRoundedRect(x + pad, contentTop, innerW, contentH, 3);
    g.lineStyle(1, 0x1a2030, 0.5).strokeRoundedRect(x + pad, contentTop, innerW, contentH, 3);

    const stackH = headlineM.h + uiDim(6) + Math.min(bodyM.h, contentH - contentPad * 2 - headlineM.h - uiDim(6));
    const stackTop = contentTop + Math.max(contentPad, (contentH - stackH) / 2);
    const midX = x + w / 2;

    // Must match measure() styles above (mobile vs desktop) or height math is wrong.
    const headlineCentered = displayFont(mobile ? 15 : 16, {
      color: "#eafdff",
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: wrapW },
    });
    const bodyCentered = bodyFont(mobile ? 10 : 11, {
      color: "#8b93a5",
      align: "center",
      wordWrap: { width: wrapW },
      lineSpacing: uiDim(mobile ? 2 : 3),
    });

    this.add(
      this.scene.add
        .text(midX, stackTop, state.headline, headlineCentered)
        .setOrigin(0.5, 0),
    );

    const bodyY = stackTop + headlineM.h + uiDim(6);
    const bodyMaxH = contentTop + contentH - contentPad - bodyY;
    const bodyText = this.scene.add
      .text(midX, bodyY, state.body, bodyCentered)
      .setOrigin(0.5, 0);
    if (bodyMaxH <= uiDim(16)) {
      bodyText.setVisible(false);
    } else if (bodyText.height > bodyMaxH) {
      bodyText.setCrop(0, 0, wrapW + uiDim(4), bodyMaxH);
    }
    this.add(bodyText);
    cy = contentTop + contentH + gap;

    // ── Actions (compact rows; painted Higgsfield strips when loaded) ──
    const btnW = innerW;
    let ay = cy;
    for (const act of state.actions) {
      const bx = x + pad;
      const primary = act.primary ?? state.actions.indexOf(act) === 0;
      const btnKey = primary ? IDENTITY_BTN_PRIMARY_KEY : IDENTITY_BTN_SECONDARY_KEY;
      const paintedBtn = this.scene.textures.exists(btnKey);
      if (paintedBtn) {
        const strip = ensureButtonStrip(
          this.scene,
          null,
          bx,
          ay,
          btnW,
          btnH,
          btnKey,
          this.root.depth + 1,
          primary ? 0xffffff : act.color,
          primary ? 0.96 : 0.88,
        );
        if (strip) this.add(strip);
        // Soft readable plate under type when the strip is busy neon.
        g.fillStyle(0x04030c, primary ? 0.28 : 0.42).fillRoundedRect(
          bx + uiDim(2),
          ay + uiDim(2),
          btnW - uiDim(4),
          btnH - uiDim(4),
          2,
        );
      } else {
        const fill = primary ? act.color : 0x0a0814;
        const alpha = primary ? 0.2 : 0.92;
        g.fillStyle(fill, alpha).fillRoundedRect(bx, ay, btnW, btnH, 2);
        g.lineStyle(uiDim(primary ? 1.5 : 1), act.color, primary ? 0.9 : 0.38).strokeRoundedRect(
          bx + uiDim(0.5),
          ay + uiDim(0.5),
          btnW - uiDim(1),
          btnH - uiDim(1),
          2,
        );
        if (primary) {
          g.fillStyle(0xffffff, 0.06).fillRect(bx + uiDim(2), ay + uiDim(1), btnW - uiDim(4), uiDim(1));
        }
      }

      const twoLine = btnH >= uiDim(this.isMobile() ? 44 : 40);
      const label = this.scene.add
        .text(
          bx + uiDim(14),
          ay + (twoLine ? uiDim(this.isMobile() ? 16 : 14) : btnH / 2),
          act.label,
          displayFont(primary ? (this.isMobile() ? 13 : 12) : this.isMobile() ? 12 : 11, {
            color: primary ? "#f2f6ff" : this.hex(act.color),
            fontStyle: "bold",
          }),
        )
        .setOrigin(0, 0.5);
      const sub = this.scene.add
        .text(bx + uiDim(14), ay + uiDim(this.isMobile() ? 30 : 26), act.sub, bodyFont(this.isMobile() ? 10 : 9, {
          color: "#5c6474",
          wordWrap: { width: btnW - uiDim(40) },
        }))
        .setOrigin(0, 0)
        .setVisible(twoLine);
      if (sub.height > uiDim(14)) {
        sub.setCrop(0, 0, btnW - uiDim(40), uiDim(12));
      }
      const chev = this.scene.add
        .text(bx + btnW - uiDim(14), ay + btnH / 2, "›", displayFont(14, { color: this.hex(act.color) }))
        .setOrigin(0.5)
        .setAlpha(primary ? 0.95 : 0.55);
      this.add(label);
      this.add(sub);
      this.add(chev);

      const btnIdx = this.btnRects.length;
      this.btnRects.push({ x: bx, y: ay, w: btnW, h: btnH, act });
      const zone = this.scene.add.zone(bx, ay, btnW, btnH).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on("pointerover", () => {
        this.hoverBtn = btnIdx;
        label.setColor("#ffffff");
        chev.setScale(1.1).setAlpha(1);
        this.drawAnimOverlay();
      });
      zone.on("pointerout", () => {
        this.hoverBtn = -1;
        label.setColor(primary ? "#f2f6ff" : this.hex(act.color));
        chev.setScale(1).setAlpha(primary ? 0.95 : 0.55);
        this.drawAnimOverlay();
      });
      zone.on("pointerdown", act.onClick);
      this.add(zone);

      ay += btnH + btnGap;
    }
    cy = n > 0 ? ay - btnGap + gap : cy;

    // ── Footer ──
    const footerY = y + h - footerH;
    const squeezed = n > 0 && btnH < uiDim(40);
    if (!squeezed) {
      g.lineStyle(1, 0x1a2030, 0.45).lineBetween(x + pad, footerY, x + w - pad, footerY);
      this.add(
        this.scene.add
          .text(
            x + pad,
            footerY + uiDim(8),
            "PHANTOM  ·  SOLANA",
            bodyFont(8, { color: "#3d4454" }),
          )
          .setOrigin(0, 0),
      );
    }

    if (state.showDisconnect && state.onDisconnect) {
      const link = this.scene.add
        .text(x + w - pad, footerY + uiDim(8), "disconnect", bodyFont(8, { color: "#5a6172" }))
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true });
      link.on("pointerover", () => link.setColor("#ff3b6b"));
      link.on("pointerout", () => link.setColor("#5a6172"));
      link.on("pointerdown", state.onDisconnect);
      this.add(link);
    }

    this.drawAnimOverlay();
  }
}
