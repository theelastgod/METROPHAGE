// Full-screen cold-open trailer (every site load; user can skip).
//
// Prefer progressive MP4 (`public/assets/video/intro.mp4`) — best autoplay.
// Fall back to Cloudflare Stream HLS / iframe if the local file fails.
// Soundtrack: try unmuted playback; if the browser blocks it, autoplay muted
// and offer TAP FOR SOUND (any click / key after that unmutes when possible).

import { prefersMobileUx } from "../systems/Mobile";

/** Same-origin progressive file (vite/public → /assets/video/intro.mp4). */
export const INTRO_MP4_URL = "/assets/video/intro.mp4";

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

/** Local MP4 should start almost immediately; keep mobile deadline tight. */
const PLAYING_DEADLINE_MS_MOBILE = 4000;
const PLAYING_DEADLINE_MS_DESKTOP = 12_000;
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

function applyMuted(video: HTMLVideoElement, muted: boolean) {
  video.muted = muted;
  video.defaultMuted = muted;
  if (muted) {
    video.volume = 0;
    video.setAttribute("muted", "");
  } else {
    video.volume = 1;
    video.removeAttribute("muted");
  }
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("x5-playsinline", "");
  video.setAttribute("x5-video-player-type", "h5");
  video.setAttribute("x5-video-player-fullscreen", "false");
}

/**
 * Mount the cold-open trailer. Prefers local progressive MP4 for autoplay.
 * Tries soundtrack; falls back to muted + TAP FOR SOUND when policy blocks audio.
 */
export function playIntroVideo(opts: {
  onComplete: () => void;
  fadeMs?: number;
}): IntroVideoHandle {
  const fadeMs = opts.fadeMs ?? 700;
  const mobile = prefersMobileUx();
  let finished = false;
  let didPlay = false;
  let soundOn = false;
  let usingFallback = false;
  let overlay: HTMLDivElement | null = null;
  let video: HTMLVideoElement | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let streamPlayer: StreamPlayer | null = null;
  let hls: HlsInstance | null = null;
  let playDeadline: number | undefined;
  let hardCeiling: number | undefined;
  let dismissPromise: Promise<void> | null = null;
  let soundBtn: HTMLButtonElement | null = null;
  let hint: HTMLDivElement | null = null;

  const setHint = (withSound: boolean) => {
    if (!hint) return;
    hint.textContent = withSound
      ? "ESC / SKIP · click to skip"
      : "ESC / SKIP · TAP FOR SOUND";
  };

  const setSoundButton = (show: boolean) => {
    if (!soundBtn) return;
    soundBtn.hidden = !show;
    soundBtn.setAttribute("aria-hidden", show ? "false" : "true");
  };

  const enableSound = () => {
    if (finished) return;
    if (video) {
      applyMuted(video, false);
      void video.play().then(() => {
        soundOn = true;
        setSoundButton(false);
        setHint(true);
      }).catch(() => {
        /* still blocked */
      });
    }
    if (streamPlayer) {
      try {
        streamPlayer.muted = false;
        void streamPlayer.play().then(() => {
          soundOn = true;
          setSoundButton(false);
          setHint(true);
        });
      } catch {
        /* ignore */
      }
    }
  };

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

  /**
   * Prefer soundtrack. If unmuted autoplay is blocked (common on first visit),
   * fall back to muted so the picture still starts, then offer TAP FOR SOUND.
   */
  const tryPlayVideo = () => {
    if (finished || !video) return;

    const playMuted = () => {
      if (finished || !video) return;
      applyMuted(video, true);
      soundOn = false;
      setSoundButton(true);
      setHint(false);
      void video
        .play()
        .then(markPlaying)
        .catch(() => {
          if (mobile && !didPlay) void dismiss();
        });
    };

    // Already playing with sound — leave it.
    if (didPlay && soundOn && !video.paused) return;

    applyMuted(video, false);
    const p = video.play();
    if (p && typeof p.then === "function") {
      void p
        .then(() => {
          soundOn = true;
          setSoundButton(false);
          setHint(true);
          markPlaying();
        })
        .catch(() => {
          // Unmuted blocked — picture still plays muted.
          playMuted();
        });
    } else {
      playMuted();
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
      if (finished || didPlay) return;
      // Local MP4 failed → Stream fallback (desktop + mobile try once).
      if (!usingFallback) {
        usingFallback = true;
        mountStreamFallback();
        return;
      }
      if (mobile) void dismiss();
      else if (!iframe) mountIframeFallback();
    });
    v.addEventListener("loadedmetadata", tryPlayVideo);
    v.addEventListener("canplay", tryPlayVideo);
    v.addEventListener("loadeddata", tryPlayVideo);
  };

  const mountStreamHls = () => {
    if (finished || !video) return;
    if (canNativeHls(video)) {
      video.src = INTRO_HLS_URL;
      tryPlayVideo();
      return;
    }
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
  };

  const mountStreamFallback = () => {
    if (finished || !video) return;
    try {
      hls?.destroy();
    } catch {
      /* ignore */
    }
    hls = null;
    try {
      video.removeAttribute("src");
      while (video.firstChild) video.removeChild(video.firstChild);
      video.load();
    } catch {
      /* ignore */
    }
    mountStreamHls();
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
    // Stream iframe is always muted for autoplay policy.
    soundOn = false;
    setSoundButton(false);
    setHint(true);

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
  overlay.setAttribute("aria-label", "METROPHAGE trailer");

  video = document.createElement("video");
  video.id = "mp-intro-player";
  video.playsInline = true;
  video.autoplay = true;
  applyMuted(video, false);
  video.preload = "auto";
  video.controls = false;
  video.disablePictureInPicture = true;
  video.setAttribute("disablepictureinpicture", "");
  video.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
  // Keep audio track; browsers may still force mute until a gesture.
  try {
    (video as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;
  } catch {
    /* ignore */
  }
  video.style.pointerEvents = "none";
  video.setAttribute("type", "video/mp4");
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

  soundBtn = document.createElement("button");
  soundBtn.type = "button";
  soundBtn.className = "mp-intro-sound";
  soundBtn.textContent = "♪ TAP FOR SOUND";
  soundBtn.hidden = true;
  soundBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    enableSound();
  });

  hint = document.createElement("div");
  hint.className = "mp-intro-hint";
  hint.textContent = "ESC / SKIP · loading…";

  overlay.appendChild(video);
  overlay.appendChild(skipBtn);
  overlay.appendChild(soundBtn);
  overlay.appendChild(hint);

  overlay.addEventListener("pointerdown", (e) => {
    const t = e.target as Node;
    if (t === skipBtn || skipBtn.contains(t)) return;
    if (soundBtn && (t === soundBtn || soundBtn.contains(t))) return;

    // First interaction: prefer unmuting if still silent, then allow skip on second click.
    if (!soundOn && didPlay && video && video.muted) {
      e.preventDefault();
      enableSound();
      return;
    }
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

  // Primary path: same-origin progressive MP4 (trailer with soundtrack when present).
  video.src = INTRO_MP4_URL;
  tryPlayVideo();

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
