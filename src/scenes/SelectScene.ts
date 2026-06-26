import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS, UI_SCALE, uiDim, uiFont } from "../config";
import { playerKeyFor } from "../assets/manifest";
import { CLASSES } from "../game/classes";
import OptionsPanel from "../ui/OptionsPanel";
import NeonPipeline from "../render/NeonPipeline";
import MusicDirector from "../audio/MusicDirector";
import { getSettings, updateSettings } from "../systems/Settings";
import { drawMenuBackdrop, MENU_FOOTER_Y, MENU_HEADER_Y, MENU_PAD, MENU_SUB_Y } from "../ui/menuChrome";
import {
  connectWallet,
  connectedWallet,
  disconnectWallet,
  walletAvailable,
} from "../economy/wallet";
import { fetchWalletIdentity, signIdentityProof, type WalletIdentity } from "../economy/identity";
import { lookToCustomization, bakeCustomPlayer, PLAYER_CUSTOM_KEY } from "../game/customization";

type MenuPhase = "wallet" | "returning" | "create";

/**
 * Title screen — full-bleed layout. Wallet connect is required; character creation is
 * one-time per wallet address (checked server-side). Returning players skip customize.
 */
export default class SelectScene extends Phaser.Scene {
  private hover = -1;
  private frames!: Phaser.GameObjects.Graphics;
  private cardRects: Array<{ x: number; y: number; w: number; h: number }> = [];
  private options!: OptionsPanel;
  private neon?: NeonPipeline;
  private phase: MenuPhase = "wallet";
  private identity: WalletIdentity | null = null;
  private walletLabel!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private actionLayer!: Phaser.GameObjects.Container;
  private classLayer!: Phaser.GameObjects.Container;
  private preview?: Phaser.GameObjects.Image;

  constructor() {
    super("Select");
  }

  create() {
    const boot = document.getElementById("boot");
    if (boot) boot.remove();

    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    this.cameras.main.fadeIn(500, 2, 2, 8);
    MusicDirector.for(this)?.play("menu", this);
    this.applyNeon();
    drawMenuBackdrop(this);

    const title = this.add
      .text(VIEW_W / 2, MENU_HEADER_Y, "METROPHAGE", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(52),
        color: "#ff2bd6",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#00e5ff", 8, true, true)
      .setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, scale: { from: 1.4, to: 1 }, duration: 700, ease: "Back.out" });
    this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: () => {
        if (!this.neon) return;
        this.neon.glitch = 0.24;
        this.tweens.add({ targets: this.neon, glitch: 0, duration: 300 });
        this.tweens.add({ targets: title, x: VIEW_W / 2 + uiDim(3), duration: 60, yoyo: true });
      },
    });

    this.add
      .text(VIEW_W / 2, MENU_SUB_Y, "neon-noir cyberpunk · one body per wallet · shared world", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(14),
        color: "#6b7184",
      })
      .setOrigin(0.5);

    this.walletLabel = this.add
      .text(MENU_PAD, uiDim(18), "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(12),
        color: "#39ff88",
      })
      .setOrigin(0, 0);

    this.bodyText = this.add
      .text(VIEW_W / 2, VIEW_H * 0.42, "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(18),
        color: "#eafdff",
        align: "center",
        lineSpacing: uiDim(10),
        wordWrap: { width: VIEW_W - MENU_PAD * 2 },
      })
      .setOrigin(0.5);

    this.actionLayer = this.add.container(0, 0);
    this.classLayer = this.add.container(0, 0).setVisible(false);
    this.frames = this.add.graphics();
    this.buildClassCards();

    this.options = new OptionsPanel(this, () => MusicDirector.for(this)?.applyVolumes());
    const optBtn = this.add
      .text(VIEW_W - MENU_PAD, uiDim(18), "⚙ OPTIONS", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(13),
        color: "#9aa3b2",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    optBtn.on("pointerover", () => optBtn.setColor("#eafdff"));
    optBtn.on("pointerout", () => optBtn.setColor("#9aa3b2"));
    optBtn.on("pointerdown", () => this.options.toggle());

    this.add
      .text(VIEW_W / 2, MENU_FOOTER_Y, "connect your wallet to begin  ·  character creation is permanent", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(12),
        color: "#f7ff3c",
      })
      .setOrigin(0.5);

    this.input.keyboard?.on("keydown", (e: KeyboardEvent) => {
      if (e.key === "o" || e.key === "O") {
        this.options.toggle();
        return;
      }
      if (e.key === "Escape") {
        this.options.close();
        return;
      }
      if (this.options.isOpen || this.phase !== "create") return;
      const k = parseInt(e.key, 10);
      if (k >= 1 && k <= CLASSES.length) this.select(k - 1);
    });

    void this.refreshWalletState();
  }

  private shortWallet(addr: string) {
    return addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
  }

  private clearActionLayer() {
    this.actionLayer.removeAll(true);
  }

  private addAction(y: number, label: string, sub: string, color: string, onPick: () => void) {
    const t = this.add
      .text(VIEW_W / 2, y, label, {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(22),
        color,
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    t.setShadow(0, 0, color, 6, true, true);
    const s = this.add
      .text(VIEW_W / 2, y + uiDim(28), sub, {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(13),
        color: "#9aa3b2",
        align: "center",
        wordWrap: { width: VIEW_W - MENU_PAD * 2 },
      })
      .setOrigin(0.5);
    t.on("pointerover", () => t.setScale(1.06));
    t.on("pointerout", () => t.setScale(1));
    t.on("pointerdown", onPick);
    this.actionLayer.add([t, s]);
  }

  private async refreshWalletState() {
    const addr = connectedWallet();
    if (addr) {
      this.walletLabel.setText(`◈ ${this.shortWallet(addr)}`);
      this.bodyText.setText("verifying wallet identity…");
      const proof = await signIdentityProof();
      if (proof) {
        this.identity = await fetchWalletIdentity(proof);
        if (this.identity?.locked && this.identity.look) {
          this.enterReturning();
          return;
        }
        if (this.identity) {
          this.enterCreate();
          return;
        }
      }
      this.bodyText.setText("could not verify wallet — try reconnecting");
    } else {
      this.walletLabel.setText("◈ no wallet");
    }
    this.enterWallet();
  }

  private enterWallet() {
    this.phase = "wallet";
    this.classLayer.setVisible(false);
    this.preview?.destroy();
    this.preview = undefined;
    this.clearActionLayer();
    this.bodyText.setText(
      walletAvailable()
        ? "Connect your Solana wallet.\nYour cyberian is created once and bound to this address forever."
        : "No wallet extension detected.\nInstall Phantom, Backpack, or Solflare to play.",
    );
    if (walletAvailable()) {
      this.addAction(VIEW_H * 0.52, "◈ CONNECT WALLET", "sign in to load or create your character", "#39ff88", () => void this.onConnectWallet());
    }
  }

  private async onConnectWallet() {
    this.bodyText.setText("waiting for wallet approval…");
    const addr = await connectWallet();
    if (!addr) {
      this.bodyText.setText("wallet connect cancelled");
      return;
    }
    await this.refreshWalletState();
  }

  private enterReturning() {
    this.phase = "returning";
    this.classLayer.setVisible(false);
    this.clearActionLayer();
    const id = this.identity!;
    const cust = lookToCustomization(id.look!, id.name ?? undefined);
    this.registry.set("customization", cust);
    this.registry.set("walletAddress", id.wallet);
    this.registry.set("characterLocked", true);
    bakeCustomPlayer(this, cust);
    this.preview?.destroy();
    this.preview = this.add
      .image(VIEW_W / 2, VIEW_H * 0.36, PLAYER_CUSTOM_KEY, 0)
      .setScale(5.5 * UI_SCALE);

    this.bodyText.setText(
      `welcome back, ${cust.callsign}\n\nyour body is locked to wallet ${this.shortWallet(id.wallet)}`,
    );

    const drillLbl = () => `drill: ${getSettings().tutorialMode === "full" ? "FULL TRAINING" : "QUICK"}`;
    this.addAction(VIEW_H * 0.54, "⊕ ENTER WORLD", "deploy into the live city", "#39ff88", () => this.deployOnline("safe"));
    this.addAction(VIEW_H * 0.64, "◢ QUICK DRILL", "core combat tutorial · ~9 lessons", "#00e5ff", () => this.deployOnline("tutorial", "quick"));
    this.addAction(VIEW_H * 0.74, "◢ FULL TRAINING", drillLbl() + " · every system", "#b06bff", () => this.deployOnline("tutorial", "full"));
    const disc = this.add
      .text(VIEW_W / 2, VIEW_H * 0.86, "disconnect wallet", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(11),
        color: "#6b7184",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    disc.on("pointerdown", async () => {
      await disconnectWallet();
      this.identity = null;
      this.registry.remove("characterLocked");
      await this.refreshWalletState();
    });
    this.actionLayer.add(disc);
  }

  private enterCreate() {
    this.phase = "create";
    this.registry.set("walletAddress", this.identity?.wallet ?? connectedWallet());
    this.registry.set("characterLocked", false);
    this.clearActionLayer();
    this.preview?.destroy();
    this.preview = undefined;
    this.classLayer.setVisible(true);
    this.bodyText.setText("choose your cyberian class\none-time creation — customize next, then deploy");
    this.drawFrames();
  }

  private buildClassCards() {
    const n = CLASSES.length;
    const margin = MENU_PAD;
    const gap = uiDim(20);
    const cardW = (VIEW_W - margin * 2 - gap * (n - 1)) / n;
    const cardH = uiDim(320);
    const cardY = Math.round(VIEW_H * 0.48 - cardH / 2);

    CLASSES.forEach((c, i) => {
      const x = margin + i * (cardW + gap);
      this.cardRects.push({ x, y: cardY, w: cardW, h: cardH });
      const cx = x + cardW / 2;

      const card = this.add.container(0, 0);
      card.add(this.add.image(cx, cardY + uiDim(72), playerKeyFor(c.id), 0).setScale(3.2 * UI_SCALE).setTint(c.color));
      card.add(
        this.add
          .text(cx, cardY + uiDim(148), c.name, { fontFamily: "Courier New, monospace", fontSize: uiFont(18), color: c.hex, fontStyle: "bold" })
          .setOrigin(0.5),
      );
      card.add(
        this.add
          .text(cx, cardY + uiDim(176), c.primaryName, { fontFamily: "Courier New, monospace", fontSize: uiFont(13), color: "#eafdff" })
          .setOrigin(0.5),
      );
      card.add(
        this.add
          .text(x + uiDim(14), cardY + uiDim(200), c.primaryDesc, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(11),
            color: "#9aa3b2",
            wordWrap: { width: cardW - uiDim(28) },
          })
          .setOrigin(0, 0),
      );
      card.add(
        this.add
          .text(x + uiDim(14), cardY + uiDim(252), `Q  ${c.ability.name}\nF  ${c.ultimate.name}`, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(10),
            color: c.hex,
            lineSpacing: uiDim(4),
          })
          .setOrigin(0, 0),
      );
      card.add(
        this.add
          .text(cx, cardY + cardH - uiDim(20), `[ ${i + 1} ]`, { fontFamily: "Courier New, monospace", fontSize: uiFont(14), color: c.hex })
          .setOrigin(0.5),
      );

      const zone = this.add
        .zone(x, cardY, cardW, cardH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerover", () => {
        this.hover = i;
        this.drawFrames();
      });
      zone.on("pointerout", () => {
        this.hover = -1;
        this.drawFrames();
      });
      zone.on("pointerdown", () => this.select(i));
      card.add(zone);
      this.classLayer.add(card);
    });
  }

  private deployOnline(zone: string, tutorialMode?: "quick" | "full") {
    if (this.options?.isOpen) return;
    if (tutorialMode) {
      updateSettings({ tutorialMode });
      this.registry.set("tutorialMode", tutorialMode);
    }
    this.cameras.main.fadeOut(250, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () =>
      this.scene.start("Online", { zone, tutorialMode: tutorialMode ?? getSettings().tutorialMode }),
    );
  }

  private drawFrames() {
    const g = this.frames;
    g.clear();
    if (this.phase !== "create") return;
    this.cardRects.forEach((r, i) => {
      const c = CLASSES[i];
      const hovered = this.hover === i;
      g.fillStyle(hovered ? 0x141026 : 0x0b0716, hovered ? 0.95 : 0.82);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(uiDim(hovered ? 3 : 2), c.color, hovered ? 1 : 0.7);
      g.strokeRect(r.x, r.y, r.w, r.h);
    });
  }

  private applyNeon() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon");
    this.neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline;
    if (this.neon) {
      this.neon.heat = 0.1;
      this.neon.tint = [1, 0.17, 0.84];
      this.neon.tintAmt = 0.16;
    }
  }

  private select(i: number) {
    if (this.options?.isOpen || this.phase !== "create") return;
    this.registry.set("classId", CLASSES[i].id);
    this.cameras.main.fadeOut(300, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Customize"));
  }
}