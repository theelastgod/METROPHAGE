// METROPHAGE — keep asset loads flowing in hidden tabs.
//
// Phaser's LoaderPlugin only dispatches queued files from the scene UPDATE loop
// (LoaderPlugin.update → checkLoadQueue), and the game loop stops stepping while
// document.hidden. XHR callbacks still fire in a hidden tab, so a load that starts
// (or continues) in the background completes its first maxParallelDownloads files
// and then wedges: state LOADING, inflight 0, the rest stuck in `list`, no errors.
// Players hit this by opening the game in a background tab or app-switching on
// mobile mid-load — the boot bar freezes forever.
//
// Timers keep firing when hidden (throttled to ~1 Hz, which is plenty), so a small
// interval re-pumps the queue whenever a load is in flight. checkLoadQueue only
// dispatches PENDING files under the parallel cap, so redundant calls are harmless.
import type Phaser from "phaser";

type PumpableLoader = Phaser.Loader.LoaderPlugin & { checkLoadQueue(): void };

/** Install in any scene whose preload matters when the tab may be backgrounded. */
export function pumpLoaderWhileHidden(scene: Phaser.Scene): void {
  const loader = scene.load as PumpableLoader;
  const id = window.setInterval(() => {
    if (loader.isLoading()) loader.checkLoadQueue();
  }, 400);
  const stop = () => window.clearInterval(id);
  scene.events.once("shutdown", stop);
  scene.events.once("destroy", stop);
}
