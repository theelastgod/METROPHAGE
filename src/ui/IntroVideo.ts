// Full-screen Cloudflare Stream intro for the cold open.
//
// Autoplay strategy (muted is required by every major mobile browser):
//  1) Native <video playsinline muted autoplay> + HLS (best on iOS/Safari)
//  2) hls.js attach for Chromium/Firefox when native HLS is missing
//  3) Stream iframe last-resort on desktop only
//  4) Mobile: if still not playing within a short window, skip the video
//     entirely (text cold-open continues) — never trap phones on a black screen.

import { prefersMobileUx } from "../systems/Mobile";

const STREAM_CUSTOMER = "2swsyytnxr5altxg";
const STREAM_UID = "78916355232e5968ea12d04a08a74f5a";

export const INTRO_HLS_URL =
  `https://customer-${STREAM_CUSTOMER}.cloudflarestream.com/${STREAM_UID}/manifest/video.m3u8`;

export const INTRO_STREAM_IFRAME_URL =
  `https://customer-${STREAM_CUSTOMER}.cloudflarestream.com/${STREAM_UID}/iframe` +
  `?autoplay=true&muted=true&controls=false&preload=auto` +
  `&playsinline=true&letterboxColor=000000&primaryColor=00e5ff`;

const HLS_JS_SRC = "https://cdn.jsdelivr.net/npm/hls.js@1.5.18/dist/hls.min.js";
const STREAM_SDK_SRC = "https://embed.cloudflarestream.com/embed/sdk.latest.js";

/** Mobile must confirm playback quickly or we skip; desktop can wait longer for HLS. */
const PLAYING_DEADLINE_MS_MOBILE = 3200;
const PLAYING_DEADLINE_MS_DESKTOP = 10_000;
const HARD_CEILING_MS = 5 * 60_000;

type StreamPlayer = {
  addEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
  muted: boolean;
  play: () => Promise<void>;
  pause?: () => void;
};

type HlsInstance = {
  loadSource: (url: string) => void;
  attachMedia: (media: HTMLMediaElement) => void;
  destroy: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
};

type HlsCtor = {
  isSupported: () => boolean;
  Events: { MANIFEST_PARSED: string; ERROR: string };
  new (config?: Record<string, unknown>): HlsInstance;
};

declare global {
  interface Window {
    Stream?: (el: HTMLIFrameElement) => StreamPlayer;
    Hls?: HlsCtor;
  }
}

export interface IntroVideoHandle {
  dismiss: () => Promise<void>;
  done: () => boolean;
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (src.includes("hls.js") && window.Hls) {
        resolve();
        return;
      }
      if (src.includes("sdk.latest") && window.Stream) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`load failed: ${src}`)), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`load failed: ${src}`));
    document.head.appendChild(s);
  });
}

function canNativeHls(video: HTMLVideoElement): boolean {
  const t = video.canPlayType("application/vnd.apple.mpegurl");
  return t === "probably" || t === "maybe";
}

function forceMuted(video: HTMLVideoElement) {
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
  // Attribute form matters for iOS autoplay policy checks.
  video.setAttribute("muted", "");
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("x5-playsinline", "");
  video.setAttribute("x5-video-player-type", "h5");
  video.setAttribute("x5-video-player-fullscreen", "false");
}

/**
 * Mount the cold-open Stream intro. Always attempts muted autoplay.
 * On mobile, fails closed (skips video) if autoplay cannot start.
 */
export function playIntroVideo(opts: {
  onComplete: () => void;
  fadeMs?: number;
}): IntroVideoHandle {
  const fadeMs = opts.fadeMs ?? 700;
  const mobile = prefersMobileUx();
  let finished = false;
  let didPlay = false;
  let overlay: HTMLDivElement | null = null;
  let video: HTMLVideoElement | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let streamPlayer: StreamPlayer | null = null;
  let hls: HlsInstance | null = null;
  let playDeadline: number | undefined;
  let hardCeiling: number | undefined;
  let dismissPromise: Promise<void> | null = null;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      void dismiss();
    }
  };

  const onVis = () => {
    if (document.visibilityState === "visible" && !didPlay && !finished) tryPlayVideo();
  };

  const cleanupMedia = () => {
    try {
      hls?.destroy();
    } catch {
      /* ignore */
    }
    hls = null;
    try {
      streamPlayer?.pause?.();
    } catch {
      /* ignore */
    }
    streamPlayer = null;
    if (video) {
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        /* ignore */
      }
    }
    video = null;
    iframe = null;
  };

  const dismiss = (): Promise<void> => {
    if (dismissPromise) return dismissPromise;
    finished = true;
    if (playDeadline != null) window.clearTimeout(playDeadline);
    if (hardCeiling != null) window.clearTimeout(hardCeiling);
    playDeadline = undefined;
    hardCeiling = undefined;
    window.removeEventListener("keydown", onKey, true);
    document.removeEventListener("visibilitychange", onVis);

    dismissPromise = new Promise((resolve) => {
      const el = overlay;
      if (!el) {
        cleanupMedia();
        opts.onComplete();
        resolve();
        return;
      }
      el.classList.remove("mp-intro-show");
      el.classList.add("mp-intro-hide");
      el.setAttribute("aria-hidden", "true");
      cleanupMedia();
      window.setTimeout(() => {
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
        opts.onComplete();
        resolve();
      }, fadeMs + 40);
    });
    return dismissPromise;
  };

  const markPlaying = () => {
    if (didPlay) return;
    didPlay = true;
    if (playDeadline != null) {
      window.clearTimeout(playDeadline);
      playDeadline = undefined;
    }
  };

  const tryPlayVideo = () => {
    if (finished || !video) return;
    forceMuted(video);
    const p = video.play();
    if (p && typeof p.then === "function") {
      void p.then(markPlaying).catch(() => {
        if (finished || !video) return;
        forceMuted(video);
        void video
          .play()
          .then(markPlaying)
          .catch(() => {
            // Mobile browsers that block muted autoplay: skip the intro entirely.
            if (mobile && !didPlay) void dismiss();
          });
      });
    }
  };

  const wireVideoEvents = (v: HTMLVideoElement) => {
    v.addEventListener("playing", markPlaying);
    v.addEventListener("timeupdate", () => {
      if (v.currentTime > 0.05) markPlaying();
    });
    v.addEventListener("ended", () => {
      void dismiss();
    });
    v.addEventListener("error", () => {
      if (mobile) {
        void dismiss();
        return;
      }
      if (!didPlay && !iframe) mountIframeFallback();
    });
    v.addEventListener("loadedmetadata", tryPlayVideo);
    v.addEventListener("canplay", tryPlayVideo);
    v.addEventListener("loadeddata", tryPlayVideo);
  };

  const mountIframeFallback = () => {
    if (finished || !overlay || iframe) return;
    if (video?.parentNode) {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      video.parentNode.removeChild(video);
      video = null;
    }
    try {
      hls?.destroy();
    } catch {
      /* ignore */
    }
    hls = null;

    iframe = document.createElement("iframe");
    iframe.id = "mp-intro-player";
    iframe.src = INTRO_STREAM_IFRAME_URL;
    iframe.allow = "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture";
    iframe.setAttribute("allowfullscreen", "true");
    iframe.setAttribute("loading", "eager");
    iframe.style.pointerEvents = "none";
    overlay.insertBefore(iframe, overlay.firstChild);

    void loadScript(STREAM_SDK_SRC)
      .then(() => {
        if (finished || !iframe || typeof window.Stream !== "function") return;
        try {
          streamPlayer = window.Stream(iframe);
          streamPlayer.muted = true;
          streamPlayer.addEventListener("ended", () => void dismiss());
          streamPlayer.addEventListener("error", () => {
            if (!didPlay) void dismiss();
          });
          streamPlayer.addEventListener("playing", markPlaying);
          void streamPlayer.play().catch(() => {
            try {
              if (streamPlayer) {
                streamPlayer.muted = true;
                void streamPlayer.play().then(markPlaying);
              }
            } catch {
              if (mobile && !didPlay) void dismiss();
            }
          });
        } catch {
          if (mobile && !didPlay) void dismiss();
        }
      })
      .catch(() => {
        if (mobile && !didPlay) void dismiss();
      });
  };

  overlay = document.createElement("div");
  overlay.id = "mp-intro";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "METROPHAGE intro");

  video = document.createElement("video");
  video.id = "mp-intro-player";
  video.playsInline = true;
  video.autoplay = true;
  forceMuted(video);
  video.preload = "auto";
  video.controls = false;
  video.disablePictureInPicture = true;
  video.setAttribute("disablepictureinpicture", "");
  video.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
  video.style.pointerEvents = "none";
  wireVideoEvents(video);

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "mp-intro-skip";
  skipBtn.textContent = "SKIP ▸";
  skipBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void dismiss();
  });

  const hint = document.createElement("div");
  hint.className = "mp-intro-hint";
  hint.textContent = "Click to skip";

  overlay.appendChild(video);
  overlay.appendChild(skipBtn);
  overlay.appendChild(hint);

  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === skipBtn || skipBtn.contains(e.target as Node)) return;
    // First tap while blocked: retry muted play; if still dead, skip.
    if (!didPlay && video) {
      e.preventDefault();
      tryPlayVideo();
      window.setTimeout(() => {
        if (!didPlay && !finished) void dismiss();
      }, 350);
      return;
    }
    e.preventDefault();
    void dismiss();
  });

  window.addEventListener("keydown", onKey, true);
  document.addEventListener("visibilitychange", onVis);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay?.classList.add("mp-intro-show");
    });
  });

  if (canNativeHls(video)) {
    video.src = INTRO_HLS_URL;
    tryPlayVideo();
  } else {
    void loadScript(HLS_JS_SRC)
      .then(() => {
        if (finished || !video) return;
        const Hls = window.Hls;
        if (Hls && Hls.isSupported()) {
          hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            startLevel: -1,
            maxBufferLength: 20,
          });
          hls.loadSource(INTRO_HLS_URL);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => tryPlayVideo());
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            const d = data as { fatal?: boolean } | undefined;
            if (!d?.fatal || finished) return;
            try {
              hls?.destroy();
            } catch {
              /* ignore */
            }
            hls = null;
            if (mobile) void dismiss();
            else mountIframeFallback();
          });
          tryPlayVideo();
        } else if (mobile) {
          void dismiss();
        } else {
          mountIframeFallback();
        }
      })
      .catch(() => {
        if (finished) return;
        if (mobile) void dismiss();
        else mountIframeFallback();
      });
  }

  playDeadline = window.setTimeout(() => {
    if (!didPlay && !finished) void dismiss();
  }, mobile ? PLAYING_DEADLINE_MS_MOBILE : PLAYING_DEADLINE_MS_DESKTOP);

  hardCeiling = window.setTimeout(() => {
    if (!finished) void dismiss();
  }, HARD_CEILING_MS);

  return {
    dismiss,
    done: () => finished,
  };
}
