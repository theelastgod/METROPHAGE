import Phaser from "phaser";

/** Same-origin H.264 copy of the 12-second deployment teaser. */
export const DEPLOY_TEASER_URL = "/assets/video/deploy-teaser.mp4";

const LOAD_TIMEOUT_MS = 8_000;
const PLAYBACK_CEILING_MS = 18_000;
const FADE_MS = 320;

/**
 * Play the deployment teaser before starting OnlineScene.
 *
 * This deliberately has no skip control: selecting a world/tutorial deployment
 * commits to the full clip. Media failures fail open so a bad cache or unsupported
 * browser can never strand a runner on the title screen.
 */
export function playDeployTeaser(scene: Phaser.Scene, onComplete: () => void): void {
  if (typeof document === "undefined") {
    onComplete();
    return;
  }

  const stale = document.getElementById("mp-deploy-teaser");
  if (stale) return;

  let finished = false;
  let started = false;
  let loadTimer: number | undefined;
  let ceilingTimer: number | undefined;

  const overlay = document.createElement("div");
  overlay.id = "mp-deploy-teaser";
  overlay.className = "mp-video-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Entering the METROPHAGE world");

  const video = document.createElement("video");
  video.playsInline = true;
  video.autoplay = true;
  video.preload = "auto";
  video.controls = false;
  video.disablePictureInPicture = true;
  video.setAttribute("disablepictureinpicture", "");
  video.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("type", "video/mp4");
  video.src = DEPLOY_TEASER_URL;
  try {
    (video as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;
  } catch {
    /* optional browser API */
  }

  const finish = () => {
    if (finished) return;
    finished = true;
    if (loadTimer != null) window.clearTimeout(loadTimer);
    if (ceilingTimer != null) window.clearTimeout(ceilingTimer);
    video.pause();
    overlay.classList.remove("mp-video-overlay-show");
    overlay.classList.add("mp-video-overlay-hide");
    window.setTimeout(() => {
      overlay.remove();
      try {
        scene.sound.resumeAll();
      } catch {
        /* scene may already be shutting down */
      }
      if (scene.sys.isActive()) onComplete();
    }, FADE_MS + 40);
  };

  const markStarted = () => {
    if (started) return;
    started = true;
    if (loadTimer != null) window.clearTimeout(loadTimer);
    ceilingTimer = window.setTimeout(finish, PLAYBACK_CEILING_MS);
  };

  const tryPlay = () => {
    if (finished) return;
    video.muted = false;
    video.defaultMuted = false;
    video.volume = 1;
    const attempt = video.play();
    if (!attempt || typeof attempt.catch !== "function") return;
    void attempt.catch(() => {
      // Autoplay policies can still reject despite the button gesture. Preserve
      // the visual transition muted rather than skipping the teaser entirely.
      if (finished) return;
      video.muted = true;
      video.defaultMuted = true;
      void video.play().catch(finish);
    });
  };

  video.addEventListener("playing", markStarted);
  video.addEventListener("timeupdate", () => {
    if (video.currentTime > 0.05) markStarted();
  });
  video.addEventListener("ended", finish);
  video.addEventListener("error", finish);
  video.addEventListener("loadeddata", tryPlay);
  video.addEventListener("canplay", tryPlay);

  overlay.appendChild(video);
  document.body.appendChild(overlay);
  try {
    scene.sound.pauseAll();
  } catch {
    /* DOM video can still play without Phaser audio */
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add("mp-video-overlay-show"));
  });
  tryPlay();
  loadTimer = window.setTimeout(finish, LOAD_TIMEOUT_MS);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (!finished) {
      finished = true;
      if (loadTimer != null) window.clearTimeout(loadTimer);
      if (ceilingTimer != null) window.clearTimeout(ceilingTimer);
      video.pause();
      overlay.remove();
      try {
        scene.sound.resumeAll();
      } catch {
        /* game is being destroyed */
      }
    }
  });
}
