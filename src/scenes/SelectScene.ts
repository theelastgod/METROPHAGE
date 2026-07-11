import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS, UI_SCALE, uiDim } from "../config";
import { classArtKey, playerKeyFor } from "../assets/manifest";
import { CLASSES, classIdFromLook } from "../game/classes";
import OptionsPanel from "../ui/OptionsPanel";
import { applyMenuNeon } from "../render/ensureNeon";
import type NeonPipeline from "../render/NeonPipeline";
import MusicDirector from "../audio/MusicDirector";
import { getSettings, updateSettings } from "../systems/Settings";
import { fadeInScene, transitionTo } from "../systems/transitions";
import { installMenuCameras, pinMenuUiLayer } from "../render/menuCameras";
import {
  drawMenuBackdrop,
  drawPreviewPedestal,
  MenuAtmosphere,
  MENU_FOOTER_Y,
  MENU_HEADER_Y,
  MENU_PAD,
  MENU_SUB_Y,
} from "../ui/menuChrome";
import { uiGap } from "../ui/spacing";
import { bodyFont, displayFont } from "../ui/typography";
import {
  connectedWallet,
  disconnectWallet,
  walletAvailable,
  restoreWalletSession,
  walletSessionSecret,
} from "../economy/wallet";
import {
  ensureWalletConnected,
  fetchWalletIdentity,
  signIdentityProof,
  type WalletIdentity,
} from "../economy/identity";
import { lookToCustomization, bakeCustomPlayer, PLAYER_CUSTOM_KEY, type Customization } from "../game/customization";
import WalletSignInPanel, { type WalletAction } from "../ui/WalletSignInPanel";
import { t } from "../i18n";
import {
  clearLocalRunner,
  hasLocalRunner,
  loadLocalRunner,
  writeLocalRunner,
} from "../systems/LocalRunner";
import { ensureGuestDeviceSecret } from "../net/NetClient";

type MenuPhase = "wallet" | "returning" | "create" | "guest_returning";

/**
 * Title screen — full-bleed layout.
 * Guest multiplayer: callsign + device secret → full server save, no wallet.
 * Wallet: optional permanent identity (MetaMask); returning players skip customize.
 */
export default class SelectScene extends Phaser.Scene {
  private hover = -1;
  private frames!: Phaser.GameObjects.Graphics;
  private cardRects: Array<{ x: number; y: number; w: number; h: number }> = [];
  private options!: OptionsPanel;
  private neon?: NeonPipeline;
  private phase: MenuPhase = "wallet";
  private identity: WalletIdentity | null = null;
  private walletPanel!: WalletSignInPanel;
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
    installMenuCameras(this);
    fadeInScene(this);
    MusicDirector.for(this)?.play("menu", this);
    this.applyNeon();
    drawMenuBackdrop(this);
    new MenuAtmosphere(this);

    const title = this.add
      .text(VIEW_W / 2, MENU_HEADER_Y, t("app.title"), displayFont(52, { color: "#ff2bd6", fontStyle: "bold" }))
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
      .text(VIEW_W / 2, MENU_SUB_Y, t("app.tagline"), bodyFont(13, { color: "#6b7184" }))
      .setOrigin(0.5);

    this.walletPanel = new WalletSignInPanel(this);
    this.walletLabel = this.add
      .text(MENU_PAD, uiDim(18), "", bodyFont(12, { color: "#5a6172" }))
      .setOrigin(0, 0);

    this.bodyText = this.add
      .text(VIEW_W / 2, VIEW_H * 0.42, "", bodyFont(18, {
        color: "#eafdff",
        align: "center",
        lineSpacing: uiGap("md"),
        wordWrap: { width: VIEW_W - MENU_PAD * 2 },
      }))
      .setOrigin(0.5)
      .setVisible(false);

    this.actionLayer = this.add.container(0, 0).setDepth(30);
    this.classLayer = this.add.container(0, 0).setVisible(false).setDepth(25);
    this.frames = this.add.graphics().setDepth(24).setScrollFactor(0);
    this.buildClassCards();

    this.options = new OptionsPanel(this, () => MusicDirector.for(this)?.applyVolumes());
    const optBtn = this.add
      .text(VIEW_W - MENU_PAD, uiDim(18), "⚙ OPTIONS", bodyFont(13, { color: "#9aa3b2" }))
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    optBtn.on("pointerover", () => optBtn.setColor("#eafdff"));
    optBtn.on("pointerout", () => optBtn.setColor("#9aa3b2"));
    optBtn.on("pointerdown", () => this.options.toggle());

    this.add
      .text(
        VIEW_W / 2,
        MENU_FOOTER_Y,
        "MetaMask = permanent wallet runner  ·  free play saves multiplayer on this device",
        bodyFont(11, { color: "#5a6172" }),
      )
      .setOrigin(0.5);

    this.addSocialLinks();

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

    void this.bootWalletGate();
    pinMenuUiLayer(this);
  }

  /** Restore MetaMask silently if present, else guest multiplayer continue / create. */
  private async bootWalletGate() {
    // Bounced back because the server rejected the guest login (callsign bound to
    // another device / missing device key / reserved) — recovery menu, not a loop.
    const guestErr = this.registry.get("guestAuthError") as string | undefined;
    if (guestErr) {
      this.registry.remove("guestAuthError");
      this.showGuestAuthError(guestErr);
      return;
    }
    await restoreWalletSession();
    if (connectedWallet()) {
      await this.refreshWalletState();
      return;
    }
    if (hasLocalRunner() || this.registry.get("customization")) {
      this.enterGuestReturning();
    } else if (this.registry.get("guestPlay") || this.registry.get("offlinePlay")) {
      this.enterGuestPlay();
    } else {
      await this.refreshWalletState();
    }
  }

  /** Server refused the guest identity — explain and offer ways forward. */
  private showGuestAuthError(reason: string) {
    this.phase = "wallet";
    this.syncWalletLabel(null);
    this.classLayer.setVisible(false);
    this.clearActionLayer();
    this.bodyText.setVisible(false);
    this.preview?.destroy();
    this.preview = undefined;
    const hasWallet = walletAvailable();
    const local = loadLocalRunner();
    // Re-sync secret from profile (fixes partial storage clears that reminted a key).
    if (local?.callsign) ensureGuestDeviceSecret(local.callsign);
    this.walletPanel.show({
      step: "connect",
      status: "error",
      statusText: "sign-in rejected",
      headline: "That callsign is locked",
      body:
        reason +
        (/[.!?]$/.test(reason.trim()) ? " " : ". ") +
        (hasWallet
          ? "Retry CONTINUE if this is your device, start a new runner, or link MetaMask for a permanent identity."
          : "Retry CONTINUE if this is your device, or start a new runner."),
      wallet: null,
      actions: this.walletActions([
        ...(local
          ? [
              {
                label: "↻ RETRY CONTINUE",
                sub: `reconnect as ${local.callsign} with this device key`,
                color: COLORS.neonCyan,
                primary: true as const,
                fn: () => this.enterGuestReturning(),
              },
            ]
          : []),
        {
          label: "◌ NEW RUNNER",
          sub: "new callsign · fresh multiplayer save on this device",
          color: local ? 0x9aa3b2 : COLORS.neonCyan,
          primary: !local,
          fn: () => this.startNewGuestRunner(),
        },
        ...(hasWallet
          ? [
              {
                label: "◈ SIGN IN WITH METAMASK",
                sub: "permanent wallet identity · works on every device",
                color: COLORS.neonGreen,
                primary: false as const,
                fn: () => void this.onMetaMaskSignUp(),
              },
            ]
          : []),
        {
          label: "▸ RETRY",
          sub: "try the same callsign again",
          color: 0x9aa3b2,
          primary: false,
          fn: () => this.enterGuestReturning(),
        },
      ]),
    });
  }

  private shortWallet(addr: string) {
    return addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
  }

  private syncWalletLabel(addr?: string | null) {
    const a = addr ?? connectedWallet();
    if (a) {
      this.walletLabel.setText(`◈ ${this.shortWallet(a)}`).setColor("#39ff88");
      return;
    }
    this.walletLabel.setText("◈ no wallet").setColor("#5a6172");
  }

  private clearActionLayer() {
    this.actionLayer.removeAll(true);
  }

  private walletActions(
    items: Array<{ label: string; sub: string; color: number; primary?: boolean; fn: () => void }>,
  ): WalletAction[] {
    return items.map((a) => ({ label: a.label, sub: a.sub, color: a.color, primary: a.primary, onClick: a.fn }));
  }

  private async refreshWalletState() {
    const addr = connectedWallet();
    this.syncWalletLabel(addr);
    if (!addr) {
      this.enterWalletDisconnected();
      return;
    }
    this.registry.set("walletAddress", addr);
    this.showConnectedPending(addr, "sign in to load your saved runner or begin one-time creation.", [
      {
        label: "◈ SIGN IN",
        sub: "one wallet message — no transaction fee",
        color: COLORS.neonGreen,
        fn: () => void this.verifyAndAdvance(addr),
      },
    ]);
  }

  private enterWalletDisconnected() {
    // Prefer CONTINUE when a guest runner already exists on this device.
    if (hasLocalRunner() || this.registry.get("customization")) {
      this.enterGuestReturning();
      return;
    }
    this.phase = "wallet";
    this.syncWalletLabel(null);
    this.classLayer.setVisible(false);
    this.preview?.destroy();
    this.preview = undefined;
    this.clearActionLayer();
    this.bodyText.setVisible(false);
    const hasWallet = walletAvailable();
    // Wallet is the key / recommended path; guest multiplayer remains available.
    this.walletPanel.show({
      step: "connect",
      status: hasWallet ? "ready" : "offline",
      statusText: hasWallet ? "MetaMask · Robinhood Chain · free sign-in" : "install MetaMask · or play free",
      headline: "Connect your wallet",
      body: hasWallet
        ? "Sign up with MetaMask on Robinhood Chain — free message, no gas. Your runner is permanently bound to your address across devices. Prefer no wallet? Play free with a device-locked multiplayer save."
        : "MetaMask is the permanent multiplayer identity for METROPHAGE. Install it to create a wallet-bound runner, or play free with a save locked to this device.",
      wallet: null,
      actions: this.walletActions([
        ...(hasWallet
          ? [
              {
                label: "◈ SIGN UP WITH METAMASK",
                sub: "recommended · Robinhood Chain · free message · permanent id",
                color: COLORS.neonGreen,
                primary: true as const,
                fn: () => void this.onMetaMaskSignUp(),
              },
              {
                label: "◢ PLAY FREE · NO WALLET",
                sub: "multiplayer save on this device · link wallet later",
                color: COLORS.neonCyan,
                primary: false as const,
                fn: () => this.enterGuestPlay(),
              },
            ]
          : [
              {
                label: "◈ GET METAMASK",
                sub: "recommended · metamask.io · then return to sign up",
                color: COLORS.neonGreen,
                primary: true as const,
                fn: () => window.open("https://metamask.io/download/", "_blank", "noopener"),
              },
              {
                label: "◢ PLAY FREE · NO WALLET",
                sub: "multiplayer save on this device · link MetaMask later",
                color: COLORS.neonCyan,
                primary: false as const,
                fn: () => this.enterGuestPlay(),
              },
            ]),
      ]),
    });
  }

  /** One-click MetaMask + Robinhood Chain connect + sign-in. */
  private async onMetaMaskSignUp() {
    this.walletPanel.show({
      step: "connect",
      status: "busy",
      statusText: "awaiting MetaMask · Robinhood Chain",
      headline: "Check MetaMask",
      body: "Approve connecting MetaMask. We'll switch you to Robinhood Chain (ETH L2) if needed, then you sign a free login message — no gas for sign-up.",
      wallet: connectedWallet(),
      actions: [],
      showDisconnect: true,
      onDisconnect: () => void this.onDisconnect(),
    });
    const addr = await ensureWalletConnected();
    if (!addr) {
      this.enterWalletDisconnected();
      return;
    }
    this.registry.set("walletAddress", addr);
    this.registry.set("offlinePlay", false);
    this.registry.set("guestPlay", false);
    // Auto-advance to sign — full sign-up without a second button press when possible.
    await this.verifyAndAdvance(addr);
  }

  /** Free multiplayer — no wallet. Server save bound to callsign + this device. */
  private enterGuestPlay() {
    this.registry.set("guestPlay", true);
    this.registry.remove("offlinePlay");
    this.registry.remove("walletAddress");
    this.registry.remove("walletProof");
    this.registry.remove("characterLocked");
    this.walletPanel.hide();
    this.enterCreate();
    const cardTop = this.cardRects[0]?.y ?? VIEW_H * 0.38;
    this.bodyText
      .setVisible(true)
      .setY(cardTop - uiGap("lg"))
      .setText(
        hasLocalRunner()
          ? "new runner replaces the multiplayer save on this device"
          : "pick a class · multiplayer progress saves online · no wallet",
      );
  }

  /**
   * Resume a guest multiplayer runner (no MetaMask).
   * Server reloads credits/inventory/campaign via callsign + device secret.
   */
  private enterGuestReturning() {
    const local = loadLocalRunner();
    let cust = this.registry.get("customization") as Customization | undefined;
    let classId = (this.registry.get("classId") as string | undefined) ?? undefined;

    if (local) {
      cust = local.customization;
      classId = local.classId;
    }
    if (!cust) {
      this.enterGuestPlay();
      return;
    }

    this.phase = "guest_returning";
    this.registry.set("guestPlay", true);
    this.registry.remove("offlinePlay");
    this.registry.remove("walletAddress");
    this.registry.set("customization", cust);
    this.registry.set(
      "classId",
      classId ?? CLASSES.find((c) => c.color === cust.color)?.id ?? CLASSES[0].id,
    );
    this.registry.set("characterLocked", true);
    // Reuse the profile's device secret (or restore mp_secret_* from it) — never mint a
    // replacement for an existing server-bound callsign or CONTINUE will be rejected.
    const deviceSecret = ensureGuestDeviceSecret(cust.callsign);
    writeLocalRunner({
      callsign: cust.callsign,
      classId: (this.registry.get("classId") as string) || "metrophage",
      customization: cust,
      lastZone: local?.lastZone,
      deviceSecret,
    });

    this.syncWalletLabel(null);
    this.classLayer.setVisible(false);
    this.clearActionLayer();
    this.bodyText.setVisible(false);
    this.walletPanel.hide();

    bakeCustomPlayer(this, cust);
    this.preview?.destroy();
    const previewY = VIEW_H * 0.26;
    drawPreviewPedestal(this, VIEW_W / 2, previewY + uiDim(42), 0x39ff88);
    this.preview = this.add
      .image(VIEW_W / 2, previewY, PLAYER_CUSTOM_KEY, 0)
      .setScale(5.5 * UI_SCALE);
    this.tweens.add({
      targets: this.preview,
      y: previewY - uiDim(4),
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    const hasWallet = walletAvailable();
    const drillLbl = () => (getSettings().tutorialMode === "full" ? "FULL TRAINING" : "QUICK");
    const resumeZone = local?.lastZone && local.lastZone !== "tutorial" ? local.lastZone : "safe";

    this.walletPanel.show({
      step: "play",
      status: "ready",
      statusText: "guest multiplayer · link wallet recommended",
      headline: `Welcome back, ${cust.callsign}`,
      body: "Your multiplayer save is on the server and locked to this device. CONTINUE loads it. Link MetaMask to bind this runner to your wallet permanently (portable across devices).",
      wallet: null,
      offsetY: 36,
      actions: this.walletActions([
        {
          label: "⊕ CONTINUE",
          sub:
            resumeZone === "safe"
              ? "live city · multiplayer save on this device"
              : `resume multiplayer · last zone ${resumeZone}`,
          color: COLORS.neonCyan,
          primary: true,
          fn: () => this.deployOnline(resumeZone),
        },
        ...(hasWallet
          ? [
              {
                label: "◈ LINK METAMASK",
                sub: "recommended · permanent wallet identity · merge progress",
                color: COLORS.neonGreen,
                primary: false as const,
                fn: () => void this.onMetaMaskSignUp(),
              },
            ]
          : [
              {
                label: "◈ GET METAMASK",
                sub: "recommended · permanent multiplayer identity",
                color: COLORS.neonGreen,
                primary: false as const,
                fn: () => window.open("https://metamask.io/download/", "_blank", "noopener"),
              },
            ]),
        {
          label: "◢ QUICK DRILL",
          sub: "core combat · skip to city anytime",
          color: 0xb06bff,
          primary: false,
          fn: () => this.deployOnline("tutorial", "quick"),
        },
        {
          label: "◢ FULL TRAINING",
          sub: `${drillLbl()} · every city system`,
          color: 0xb06bff,
          primary: false,
          fn: () => this.deployOnline("tutorial", "full"),
        },
        {
          label: "◌ NEW RUNNER",
          sub: "new callsign · new multiplayer save on this device",
          color: 0x9aa3b2,
          primary: false,
          fn: () => this.startNewGuestRunner(),
        },
      ]),
    });
  }

  /** Wipe guest profile and open class select. */
  private startNewGuestRunner() {
    clearLocalRunner();
    this.registry.remove("customization");
    this.registry.remove("classId");
    this.registry.remove("characterLocked");
    this.preview?.destroy();
    this.preview = undefined;
    this.enterGuestPlay();
  }

  /** Wallet is connected — prompt for sign-in and load/create branch. */
  private showConnectedPending(
    addr: string,
    body: string,
    actions: Array<{ label: string; sub: string; color: number; primary?: boolean; fn: () => void }>,
    opts?: { step?: "sign" | "play"; status?: "ready" | "busy" | "error"; statusText?: string; headline?: string },
  ) {
    this.phase = "wallet";
    this.syncWalletLabel(addr);
    this.classLayer.setVisible(false);
    this.preview?.destroy();
    this.preview = undefined;
    this.clearActionLayer();
    this.bodyText.setVisible(false);
    this.walletPanel.show({
      step: opts?.step ?? "sign",
      status: opts?.status ?? "ready",
      statusText: opts?.statusText ?? "wallet linked",
      headline: opts?.headline ?? "Prove ownership",
      body,
      wallet: addr,
      actions: this.walletActions(actions),
      showDisconnect: true,
      onDisconnect: () => void this.onDisconnect(),
    });
  }

  private async verifyAndAdvance(addr: string) {
    this.showConnectedPending(
      addr,
      "Approve the login message in MetaMask. This is a free signature — not a transaction. No gas, no $METRO.",
      [],
      {
        status: "busy",
        statusText: "awaiting MetaMask signature",
        headline: "Sign to create / resume",
      },
    );
    const proof = await signIdentityProof(addr);
    if (!proof) {
      this.showConnectedPending(
        addr,
        "Signature cancelled or MetaMask could not sign. Retry, or play multiplayer without a wallet.",
        [
          {
            label: "◈ RETRY SIGN UP",
            sub: "open MetaMask again",
            color: COLORS.neonGreen,
            fn: () => void this.verifyAndAdvance(addr),
          },
          {
            label: hasLocalRunner() ? "⊕ CONTINUE MULTIPLAYER" : "◢ PLAY MULTIPLAYER",
            sub: hasLocalRunner()
              ? "resume guest multiplayer save on this device"
              : "free multiplayer save — no wallet",
            color: COLORS.neonYellow,
            primary: false,
            fn: () => (hasLocalRunner() ? this.enterGuestReturning() : this.enterGuestPlay()),
          },
        ],
        { status: "error", statusText: "sign-in failed" },
      );
      return;
    }

    // Keep a fresh proof for OnlineScene WS login + bind device session (zone travel).
    this.registry.set("walletProof", proof);
    this.registry.set("walletAddress", proof.wallet);
    walletSessionSecret(proof.wallet);

    this.showConnectedPending(addr, "Verifying MetaMask identity with the game server…", [], {
      status: "busy",
      statusText: "verifying identity",
      headline: "One moment",
    });
    const result = await fetchWalletIdentity(proof);
    if (result.identity) {
      this.identity = result.identity;
      this.registry.set("walletAddress", result.identity.wallet);
      if (result.identity.locked && result.identity.look) {
        this.enterReturning();
        return;
      }
      // New MetaMask account — class + customize, then durable save on first online login.
      this.enterCreate();
      return;
    }

    if (result.error === "auth_failed") {
      this.showConnectedPending(
        addr,
        "Server rejected the signature. Use MetaMask on the same address, or update the client/server if you're on an old build.",
        [
          {
            label: "◈ RETRY SIGN UP",
            sub: "sign a fresh login message",
            color: COLORS.neonGreen,
            fn: () => void this.verifyAndAdvance(addr),
          },
          {
            label: hasLocalRunner() ? "⊕ CONTINUE MULTIPLAYER" : "◢ PLAY MULTIPLAYER",
            sub: hasLocalRunner()
              ? "resume guest multiplayer save on this device"
              : "free multiplayer save — no wallet",
            color: COLORS.neonYellow,
            primary: false,
            fn: () => (hasLocalRunner() ? this.enterGuestReturning() : this.enterGuestPlay()),
          },
        ],
        { status: "error", statusText: "auth failed" },
      );
      return;
    }

    const serverHint =
      result.error === "server_unreachable"
        ? "Game server unreachable. Retry MetaMask, or play multiplayer as a guest (saves when the server is up)."
        : (result.detail ?? "Could not reach the identity service.");
    this.showConnectedPending(
      addr,
      serverHint,
      [
        {
          label: "◈ RETRY",
          sub: "attempt MetaMask identity check again",
          color: COLORS.neonGreen,
          fn: () => void this.verifyAndAdvance(addr),
        },
        {
          label: hasLocalRunner() ? "⊕ CONTINUE MULTIPLAYER" : "◢ PLAY MULTIPLAYER",
          sub: "guest multiplayer save · no wallet required",
          color: COLORS.neonCyan,
          primary: false,
          fn: () => (hasLocalRunner() ? this.enterGuestReturning() : this.enterGuestPlay()),
        },
      ],
      { status: "error", statusText: "server unreachable" },
    );
  }

  private async onDisconnect() {
    await disconnectWallet();
    this.identity = null;
    this.registry.remove("walletAddress");
    this.registry.remove("characterLocked");
    await this.refreshWalletState();
  }

  private enterReturning() {
    this.phase = "returning";
    this.syncWalletLabel(this.identity?.wallet);
    this.classLayer.setVisible(false);
    this.clearActionLayer();
    this.walletPanel.hide();
    const id = this.identity!;
    const cust = lookToCustomization(id.look!, id.name ?? undefined);
    this.registry.set("customization", cust);
    this.registry.set("classId", classIdFromLook(id.look!));
    this.registry.set("walletAddress", id.wallet);
    this.registry.set("characterLocked", true);
    bakeCustomPlayer(this, cust);
    this.preview?.destroy();
    const previewY = VIEW_H * 0.26;
    drawPreviewPedestal(this, VIEW_W / 2, previewY + uiDim(42), 0x39ff88);
    this.preview = this.add
      .image(VIEW_W / 2, previewY, PLAYER_CUSTOM_KEY, 0)
      .setScale(5.5 * UI_SCALE);
    this.tweens.add({
      targets: this.preview,
      y: previewY - uiDim(4),
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    this.bodyText.setVisible(false);

    const drillLbl = () => (getSettings().tutorialMode === "full" ? "FULL TRAINING" : "QUICK");
    this.walletPanel.show({
      step: "play",
      status: "ready",
      statusText: "identity verified",
      headline: `Welcome back, ${cust.callsign}`,
      body: `Your body is locked to ${this.shortWallet(id.wallet)}. Deploy into the live city or run the drill yard first.`,
      wallet: id.wallet,
      offsetY: 36,
      actions: this.walletActions([
        {
          label: "⊕ ENTER WORLD",
          sub: "Metro City · shared with every runner online",
          color: COLORS.neonGreen,
          fn: () => this.deployOnline("safe"),
        },
        {
          label: "◢ QUICK DRILL",
          sub: "core combat tutorial · ~9 lessons",
          color: COLORS.neonCyan,
          primary: false,
          fn: () => this.deployOnline("tutorial", "quick"),
        },
        {
          label: "◢ FULL TRAINING",
          sub: `${drillLbl()} · every city system`,
          color: 0xb06bff,
          primary: false,
          fn: () => this.deployOnline("tutorial", "full"),
        },
      ]),
      showDisconnect: true,
      onDisconnect: () => void this.onDisconnect(),
    });
  }

  private enterCreate() {
    this.phase = "create";
    const wallet = this.identity?.wallet ?? connectedWallet() ?? undefined;
    this.syncWalletLabel(wallet ?? null);
    if (wallet) this.registry.set("walletAddress", wallet);
    else this.registry.remove("walletAddress");
    this.registry.set("characterLocked", false);
    this.clearActionLayer();
    this.walletPanel.hide();
    this.preview?.destroy();
    this.preview = undefined;
    this.classLayer.setVisible(true);
    const cardTop = this.cardRects[0]?.y ?? VIEW_H * 0.38;
    const guest = !wallet && (!!this.registry.get("guestPlay") || !!this.registry.get("offlinePlay"));
    this.bodyText
      .setVisible(true)
      .setY(cardTop - uiGap("lg"))
      .setText(
        guest
          ? "choose your class · multiplayer save · no wallet"
          : "choose your class · one-time wallet creation",
      );
    this.drawFrames();
  }

  private buildClassCards() {
    const n = CLASSES.length;
    const margin = MENU_PAD;
    const gap = uiGap("xl");
    const cardW = (VIEW_W - margin * 2 - gap * (n - 1)) / n;
    const cardH = uiDim(332);
    const cardY = Math.round(VIEW_H * 0.48 - cardH / 2);

    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x04030c, 0.97).fillRect(margin - uiGap("sm"), cardY - uiGap("md"), VIEW_W - margin * 2 + uiGap("lg"), cardH + uiGap("xl"));
    backdrop.lineStyle(uiDim(1), 0x1b2740, 0.55).strokeRect(margin - uiGap("sm"), cardY - uiGap("md"), VIEW_W - margin * 2 + uiGap("lg"), cardH + uiGap("xl"));
    this.classLayer.add(backdrop);

    CLASSES.forEach((c, i) => {
      const x = margin + i * (cardW + gap);
      this.cardRects.push({ x, y: cardY, w: cardW, h: cardH });
      const cx = x + cardW / 2;

      const card = this.add.container(0, 0);
      const bg = this.add.graphics();
      bg.fillStyle(0x0b0716, 1).fillRect(x, cardY, cardW, cardH);
      bg.fillStyle(0x12102a, 0.98).fillRect(x + uiGap("xs"), cardY + uiGap("xs"), cardW - uiGap("sm"), cardH - uiGap("sm"));
      bg.lineStyle(uiDim(2), c.color, 0.9).strokeRect(x, cardY, cardW, cardH);
      card.add(bg);
      if (this.textures.exists(classArtKey(c.id))) {
        // painted class art fills the card; a gradient into the panel colour keeps
        // the name/loadout text legible over it (art is pre-cropped to card aspect)
        const art = this.add.image(x + cardW / 2, cardY + cardH / 2, classArtKey(c.id));
        art.setDisplaySize(cardW - uiGap("sm"), cardH - uiGap("sm"));
        card.add(art);
        const fade = this.add.graphics();
        const fadeTop = cardY + uiDim(100);
        const solidTop = cardY + uiDim(210);
        fade.fillGradientStyle(0x0e0a1d, 0x0e0a1d, 0x0e0a1d, 0x0e0a1d, 0, 0, 0.95, 0.95);
        fade.fillRect(x + uiGap("xs"), fadeTop, cardW - uiGap("sm"), solidTop - fadeTop);
        fade.fillStyle(0x0e0a1d, 0.95).fillRect(x + uiGap("xs"), solidTop, cardW - uiGap("sm"), cardY + cardH - uiGap("xs") - solidTop);
        card.add(fade);
      } else {
        card.add(
          this.add
            .image(cx, cardY + uiDim(72), playerKeyFor(c.id), 0)
            .setScale(3.2 * UI_SCALE)
            .setTint(0xffffff)
            .setAlpha(1),
        );
      }
      card.add(
        this.add
          .text(cx, cardY + uiDim(152), c.name, displayFont(18, { color: c.hex, fontStyle: "bold" }))
          .setOrigin(0.5),
      );
      card.add(
        this.add
          .text(cx, cardY + uiDim(182), c.primaryName, bodyFont(13, { color: "#eafdff" }))
          .setOrigin(0.5),
      );
      card.add(
        this.add
          .text(x + uiGap("lg"), cardY + uiDim(208), c.primaryDesc, bodyFont(11, { color: "#9aa3b2", wordWrap: { width: cardW - uiGap("xl") } }))
          .setOrigin(0, 0),
      );
      card.add(
        this.add
          .text(x + uiGap("lg"), cardY + uiDim(262), `Q  ${c.ability.name}\nF  ${c.ultimate.name}`, bodyFont(10, { color: c.hex }))
          .setOrigin(0, 0),
      );
      card.add(
        this.add
          .text(cx, cardY + cardH - uiDim(20), `[ ${i + 1} ]`, displayFont(14, { color: c.hex }))
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
      card.setAlpha(0);
      card.y = uiDim(18);
      this.classLayer.add(card);
      this.tweens.add({
        targets: card,
        alpha: 1,
        y: 0,
        duration: 420,
        delay: i * 70,
        ease: "Back.out",
      });
    });
  }

  private deployOnline(zone: string, tutorialMode?: "quick" | "full") {
    if (this.options?.isOpen) return;
    if (tutorialMode) {
      updateSettings({ tutorialMode });
      this.registry.set("tutorialMode", tutorialMode);
    }
    transitionTo(
      this,
      "Online",
      { zone, tutorialMode: tutorialMode ?? getSettings().tutorialMode },
      { style: "deploy", accent: 0x39ff88 },
    );
  }

  private drawFrames() {
    const g = this.frames;
    g.clear();
    if (this.phase !== "create") return;
    this.cardRects.forEach((r, i) => {
      const c = CLASSES[i];
      const hovered = this.hover === i;
      if (!hovered) return;
      g.fillStyle(0x00e5ff, 0.08).fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(uiDim(3), c.color, 1).strokeRect(r.x - uiDim(2), r.y - uiDim(2), r.w + uiDim(4), r.h + uiDim(4));
    });
  }

  private applyNeon() {
    this.neon = applyMenuNeon(this, { heat: 0.1, tint: [1, 0.17, 0.84], tintAmt: 0.16 });
  }

  private select(i: number) {
    if (this.options?.isOpen || this.phase !== "create") return;
    this.registry.set("classId", CLASSES[i].id);
    transitionTo(this, "Customize", undefined, { style: "glitch", accent: CLASSES[i].color });
  }

  /**
   * Intro social row — X + Telegram brand marks (vector-drawn, no asset pack).
   * Opens in a new tab so the Phaser canvas keeps the session.
   */
  private addSocialLinks() {
    const iconR = uiDim(13);
    const rowY = VIEW_H - uiDim(18);
    // Bottom-left: sits under OPTIONS strip, clear of the centre footer blurb.
    let cursorX = MENU_PAD;

    const links: Array<{
      url: string;
      handle: string;
      paint: (g: Phaser.GameObjects.Graphics, r: number) => void;
    }> = [
      {
        url: "https://x.com/metrophage",
        handle: "x.com/metrophage",
        paint: (g, r) => {
          // Black disc + white X (current brand mark). Local origin = disc centre.
          g.fillStyle(0x0a0a0a, 0.95).fillCircle(0, 0, r);
          g.lineStyle(Math.max(2, r * 0.22), 0xffffff, 1);
          const s = r * 0.42;
          g.lineBetween(-s, -s, s, s);
          g.lineBetween(s, -s, -s, s);
          g.lineStyle(1, 0x6b7184, 0.65).strokeCircle(0, 0, r);
        },
      },
      {
        url: "https://t.me/metrophagefun",
        handle: "t.me/metrophagefun",
        paint: (g, r) => {
          // Telegram blue circle + paper-plane glyph.
          g.fillStyle(0x2aabee, 1).fillCircle(0, 0, r);
          g.fillStyle(0xffffff, 1);
          const s = r * 0.55;
          g.fillTriangle(-s * 0.85, -s * 0.2, s * 0.95, 0, -s * 0.85, s * 0.55);
          g.fillStyle(0x2aabee, 1);
          g.fillTriangle(-s * 0.3, s * 0.02, s * 0.2, 0, -s * 0.3, s * 0.32);
          g.lineStyle(1, 0x8ad4f8, 0.75).strokeCircle(0, 0, r);
        },
      },
    ];

    for (const link of links) {
      const icon = this.add.graphics();
      link.paint(icon, iconR);

      const label = this.add
        .text(iconR + uiDim(8), 0, link.handle, bodyFont(11, { color: "#7a8294" }))
        .setOrigin(0, 0.5);

      // Container origin at icon centre; hit zone covers icon + handle text.
      const hitW = iconR * 2 + uiDim(12) + label.width;
      const hitH = Math.max(iconR * 2 + uiDim(8), uiDim(28));
      const wrap = this.add
        .container(cursorX + iconR, rowY, [icon, label])
        .setDepth(40)
        .setScrollFactor(0);

      const hit = this.add
        .zone(label.width / 2, 0, hitW, hitH)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      wrap.add(hit);

      hit.on("pointerover", () => {
        this.tweens.add({ targets: wrap, scale: 1.06, duration: 90, ease: "Sine.out" });
        label.setColor("#eafdff");
      });
      hit.on("pointerout", () => {
        this.tweens.add({ targets: wrap, scale: 1, duration: 90, ease: "Sine.out" });
        label.setColor("#7a8294");
      });
      hit.on("pointerdown", () => {
        window.open(link.url, "_blank", "noopener,noreferrer");
      });

      cursorX += hitW + uiDim(18);
    }
  }
}