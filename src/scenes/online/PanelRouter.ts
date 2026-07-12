import Phaser from "phaser";
import { uiDim } from "../../config";

/**
 * PanelRouter — owns "which overlay is open" for OnlineScene.
 *
 * First extraction of the OnlineScene decomposition (src/scenes/online/): the
 * scene registers each overlay once as an { open, close } pair; the router
 * answers anyOpen(), closes the top-most panel (the ESC path), and owns the
 * mobile floating ✕ button that appears whenever any overlay is up.
 *
 * Panels stay dumb: no panel knows about the router, the scene keeps thin
 * delegators, and registration order doubles as the close-priority order.
 */
export interface PanelEntry {
  /** True while this overlay is showing. */
  open: () => boolean;
  /** Dismiss it (must be idempotent). */
  close: () => void;
}

export default class PanelRouter {
  private scene: Phaser.Scene;
  private entries: PanelEntry[] = [];
  private closeBtn?: Phaser.GameObjects.Container;
  private closeShown = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Register an overlay. Registration order = close-priority order. */
  register(entry: PanelEntry): void {
    this.entries.push(entry);
  }

  /** True while any registered overlay is open (drives the mobile ✕). */
  anyOpen(): boolean {
    for (const e of this.entries) if (e.open()) return true;
    return false;
  }

  /** Close the top-most open overlay. Returns true if one closed. */
  closeTop(): boolean {
    for (const e of this.entries) {
      if (e.open()) {
        e.close();
        return true;
      }
    }
    return false;
  }

  /** True while the mobile ✕ is showing (exposed for the E2E probe). */
  closeButtonShown(): boolean {
    return this.closeShown;
  }

  /** Canvas position of the mobile ✕ (exposed for the E2E probe). */
  closeButtonXY(): { x: number; y: number } | null {
    return this.closeBtn ? { x: this.closeBtn.x, y: this.closeBtn.y } : null;
  }

  /** Floating red ✕ in the top-right — visible only while an overlay is open on touch. */
  buildMobileCloseButton(): void {
    const r = uiDim(19);
    const g = this.scene.add.graphics().setScrollFactor(0);
    g.fillStyle(0x140a1c, 0.94).fillCircle(0, 0, r);
    g.lineStyle(uiDim(2), 0xff4d6d, 0.95).strokeCircle(0, 0, r);
    const a = r * 0.42;
    g.lineStyle(uiDim(2.5), 0xffe0e6, 0.98);
    g.beginPath();
    g.moveTo(-a, -a);
    g.lineTo(a, a);
    g.strokePath();
    g.beginPath();
    g.moveTo(a, -a);
    g.lineTo(-a, a);
    g.strokePath();
    const hit = this.scene.add
      .zone(0, 0, r * 2 + uiDim(16), r * 2 + uiDim(16))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation?.();
      this.closeTop();
    });
    this.closeBtn = this.scene.add
      .container(this.scene.scale.width - uiDim(30), uiDim(30), [g, hit])
      .setScrollFactor(0)
      .setDepth(6000)
      .setVisible(false);
  }

  /** Show/hide the mobile ✕ to match overlay state — call once per frame (cheap). */
  syncMobileCloseButton(): void {
    if (!this.closeBtn) return;
    const show = this.anyOpen();
    if (show !== this.closeShown) {
      this.closeShown = show;
      this.closeBtn.setVisible(show);
    }
  }
}
