// METROPHAGE — the music director. Crossfades a single looping bed per
// environment (menu, city, subway, dive, each district, meltdown…), reading the
// track table from musicTracks.ts. Lives at the GAME level (created once in
// BootScene, stored in the registry) so a bed keeps playing seamlessly across
// scene changes — e.g. Title → Customize → Prologue all share the "menu" bed.
//
// Fallback: if an environment's MP3 hasn't been generated yet, the director hands
// that environment back to the procedural Synth (Synth.setMusicEnabled), so there
// is always music. Generating the file later is a zero-code upgrade.
//
// Volume travels OUTSIDE the Synth graph (straight through Phaser's SoundManager),
// so we scale by the music × master sliders ourselves and re-apply on change.

import Phaser from "phaser";
import { getSettings } from "../systems/Settings";
import type Synth from "./Synth";
import { MUSIC_BY_ENV, type MusicEnv, districtEnv } from "./musicTracks";

const FADE_MS = 1400; // crossfade between environments
const DUCK_MS = 220; // quick duck under dialogue / VO
const DUCK_LEVEL = 0.4;

interface Fade {
  snd: Phaser.Sound.BaseSound;
  from: number;
  to: number;
  t0: number;
  dur: number;
  stopAtEnd: boolean;
}

export default class MusicDirector {
  /** Fetch the shared director (created in BootScene). */
  static for(scene: Phaser.Scene): MusicDirector | undefined {
    return scene.registry.get("music") as MusicDirector | undefined;
  }
  /** Map a campaign district id → its music environment. */
  static districtEnv = districtEnv;

  private mgr: Phaser.Sound.BaseSoundManager;
  private current?: Phaser.Sound.BaseSound;
  private currentEnv?: MusicEnv;
  private ducked = false;
  private fades: Fade[] = [];
  private raf?: number;
  private combatIntensity = 0;

  constructor(game: Phaser.Game) {
    this.mgr = game.sound;
  }

  /**
   * Crossfade to `env`'s looping bed. No-op if already on it. If the bed isn't
   * loaded (not generated yet) the procedural Synth covers this environment.
   * `scene` is only used for cache lookup + the optional Synth in the registry.
   */
  play(env: MusicEnv, scene: Phaser.Scene) {
    if (env === this.currentEnv) return; // already on (or transitioning to) this env
    this.currentEnv = env;
    const synth = scene.registry.get("synth") as Synth | undefined;

    if (!this.hasTrack(scene, env)) {
      this.fadeOutCurrent();
      synth?.setMusicEnabled(true); // procedural fallback covers this environment
      this.lazyLoad(env, scene); // …while the real bed streams in (menu ships in boot)
      return;
    }
    synth?.setMusicEnabled(false); // a real bed is taking over — mute procedural music
    this.startTrack(env);
  }

  /** Beds ship OUTSIDE the boot payload (menu excepted) to keep time-to-first-play
   *  short. First entry to an environment fetches its bed in the background; the
   *  procedural Synth covers the gap, then the real bed fades in when it lands. */
  private lazyLoading = new Set<MusicEnv>();

  private lazyLoad(env: MusicEnv, scene: Phaser.Scene) {
    const t = MUSIC_BY_ENV[env];
    if (!t?.url || this.lazyLoading.has(env) || scene.cache.audio.exists(t.key)) return;
    this.lazyLoading.add(env);
    scene.load.once(`filecomplete-audio-${t.key}`, () => {
      this.lazyLoading.delete(env);
      if (this.currentEnv === env && scene.cache.audio.exists(t.key)) {
        (scene.registry.get("synth") as Synth | undefined)?.setMusicEnabled(false);
        this.startTrack(env);
      }
    });
    // A zone change can shut the scene down mid-download — let the next scene retry.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.lazyLoading.delete(env));
    scene.load.audio(t.key, t.url);
    scene.load.start();
  }

  /** Live-apply the master/music sliders to the playing bed (options menu). */
  applyVolumes() {
    if (this.current && this.currentEnv) {
      this.fadeTo(this.current, this.target(this.currentEnv), 80, false);
    }
  }

  /** Duck the bed under dialogue / the meltdown VO so spoken lines read clearly. */
  duck(on: boolean) {
    if (this.ducked === on) return;
    this.ducked = on;
    if (this.current && this.currentEnv) {
      this.fadeTo(this.current, this.target(this.currentEnv), DUCK_MS, false);
    }
  }

  /** 0..1 combat heat — drives adaptive drum layer under authored beds via Synth. */
  setCombatIntensity(v: number, scene: Phaser.Scene) {
    this.combatIntensity = Math.max(0, Math.min(1, v));
    const synth = scene.registry.get("synth") as import("./Synth").default | undefined;
    synth?.setCombatLayer(this.combatIntensity);
  }

  /** Fade out and forget the current bed (e.g. returning to a procedural scene). */
  stop() {
    this.fadeOutCurrent();
    this.currentEnv = undefined;
  }

  // ---- internals ----

  private hasTrack(scene: Phaser.Scene, env: MusicEnv): boolean {
    const t = MUSIC_BY_ENV[env];
    return !!t && scene.cache.audio.exists(t.key);
  }

  private startTrack(env: MusicEnv) {
    const t = MUSIC_BY_ENV[env];
    const begin = () => {
      if (this.currentEnv !== env) return; // env changed before the audio unlocked
      this.fadeOutCurrent();
      const snd = this.mgr.add(t.key, { loop: true, volume: 0 });
      this.setVol(snd, 0); // belt-and-braces: never let a bed blare for a frame pre-fade
      snd.play();
      this.trimLoop(snd); // make the loop sample-accurate (strip codec padding)
      this.current = snd;
      this.fadeTo(snd, this.target(env), FADE_MS, false);
    };
    // Browsers block audio until a user gesture; Phaser fires UNLOCKED on the first.
    if (this.mgr.locked) this.mgr.once(Phaser.Sound.Events.UNLOCKED, begin);
    else begin();
  }

  /**
   * Trim leading/trailing codec padding from the loop region so the native loop is
   * sample-accurate (truly seamless) on any browser — with NO tempo drift (unlike a
   * crossfade loop). Compressed beds (AAC/MP3) decode with a few ms of silence at the
   * ends; we set the source's loopStart/loopEnd to the first/last real sample so the
   * loop wraps exactly on the composed boundary. WAV beds have no padding → no-op.
   */
  private trimLoop(snd: Phaser.Sound.BaseSound) {
    try {
      const s = snd as unknown as { audioBuffer?: AudioBuffer; source?: AudioBufferSourceNode };
      const buf = s.audioBuffer;
      const src = s.source;
      if (!buf || !src) return; // HTML5-audio fallback / not ready — Phaser's whole-buffer loop stands
      const sr = buf.sampleRate;
      const ch = buf.getChannelData(0);
      const n = ch.length;
      const thr = 0.003; // ~ -50 dB: silence, not music
      const maxPad = Math.floor(sr * 0.08); // only ever strip codec padding, never real music
      let lead = 0;
      while (lead < maxPad && Math.abs(ch[n > 1 ? lead : 0]) < thr) lead++;
      let trail = 0;
      while (trail < maxPad && Math.abs(ch[n - 1 - trail]) < thr) trail++;
      src.loopStart = lead / sr;
      src.loopEnd = (n - trail) / sr;
    } catch {
      /* leave Phaser's default whole-buffer loop in place */
    }
  }

  private target(env: MusicEnv): number {
    const s = getSettings();
    const g = MUSIC_BY_ENV[env]?.gain ?? 0.6;
    return g * s.music * s.master * (this.ducked ? DUCK_LEVEL : 1);
  }

  private fadeOutCurrent() {
    if (!this.current) return;
    this.fadeTo(this.current, 0, FADE_MS, true);
    this.current = undefined;
  }

  // Volume + fading run off requestAnimationFrame (not a scene tween) so they
  // survive scene shutdowns — the SoundManager and its sounds are game-global.

  private setVol(snd: Phaser.Sound.BaseSound, v: number) {
    const s = snd as unknown as { setVolume?: (n: number) => void; volume?: number };
    if (s.setVolume) s.setVolume(v);
    else s.volume = v;
  }

  private volOf(snd: Phaser.Sound.BaseSound): number {
    return (snd as unknown as { volume?: number }).volume ?? 0;
  }

  private fadeTo(snd: Phaser.Sound.BaseSound, to: number, dur: number, stopAtEnd: boolean) {
    this.fades = this.fades.filter((f) => f.snd !== snd); // supersede any fade on this sound
    this.fades.push({ snd, from: this.volOf(snd), to, t0: performance.now(), dur: Math.max(1, dur), stopAtEnd });
    if (this.raf == null) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    const now = performance.now();
    this.fades = this.fades.filter((f) => {
      const k = Math.min(1, (now - f.t0) / f.dur);
      this.setVol(f.snd, f.from + (f.to - f.from) * k);
      if (k >= 1) {
        if (f.stopAtEnd) {
          try {
            f.snd.stop();
            f.snd.destroy();
          } catch {
            /* already torn down */
          }
        }
        return false;
      }
      return true;
    });
    this.raf = this.fades.length ? requestAnimationFrame(this.tick) : undefined;
  };
}
