import Phaser from "phaser";

/**
 * Modal — shared plumbing for the full-screen online overlays (shop, forge,
 * market, stash, contracts, board, guild, cosmetics, skills, quest log, map).
 *
 * Every overlay used to hand-roll the same ~15 lines (open flag, object
 * collector, toggle/close/clear/destroy) and they drifted — the tap-outside
 * work had to touch 13 files. Panels now extend this and keep only:
 *
 *   - a public toggle(...state) that stores its state then calls toggleOpen()
 *   - build(), which pushes every created GameObject through this.objs
 *
 * Conventions preserved from the hand-rolled originals: build() is called on
 * every open (fresh objects each time, no visibility juggling), clear()
 * destroys everything, close() is idempotent. Override clear() for panels
 * that hold extra references (call super.clear() first).
 */
export default abstract class Modal {
  /** True while the overlay is showing (the PanelRouter reads this). */
  open = false;
  protected scene: Phaser.Scene;
  protected objs: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Render the overlay. Called on open; must route created objects into this.objs. */
  protected abstract build(): void;

  /** Flip open state — subclasses' public toggle(...) stores state, then calls this. */
  protected toggleOpen(): void {
    this.open = !this.open;
    if (this.open) this.build();
    else this.clear();
  }

  /** Destroy every tracked object. Override (and call super) for extra refs. */
  protected clear(): void {
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }

  /** Dismiss the overlay (idempotent — the ESC path and PanelRouter call this). */
  close(): void {
    if (!this.open) return;
    this.open = false;
    this.clear();
  }

  destroy(): void {
    this.clear();
  }
}
