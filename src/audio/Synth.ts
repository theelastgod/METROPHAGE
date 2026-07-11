// METROPHAGE — procedural darksynth + SFX via the Web Audio API. No audio files.
//
// A lookahead step sequencer drives a detuned-saw sub-bass and a reverb-washed
// minor-key triangle lead; intensity (0..1, fed from Heat) opens the bass filter,
// thickens the lead, and adds hats. One-shot SFX (shoot/hit/kill/infect/meltdown)
// share the same context. Everything is guarded so a missing/blocked AudioContext
// simply yields silence — never an error.

import { getSettings } from "../systems/Settings";
import SfxBank from "./SfxBank";

const A_MINOR_BASS = [33, 29, 36, 31]; // A1, F1, C2, G1 — brooding i-VI-III-VII
const MASTER_BASE = 0.26; // master ceiling before the user volume scales it
const LEAD_ARP = [57, 60, 64, 67, 69, 72]; // A minor pentatonic up

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export default class Synth {
  private ctx?: AudioContext;
  private master?: GainNode;
  private limiter?: DynamicsCompressorNode; // master limiter — no clipping when SFX stack
  private musicBus?: GainNode; // lead + bass + hats (scaled by settings.music)
  private musicDuck?: GainNode; // ducks music under dialogue
  private sfxBus?: GainNode; // one-shots (scaled by settings.sfx)
  private reverb?: ConvolverNode;
  private leadBus?: GainNode;
  private bassBus?: GainNode;
  private noiseBuf?: AudioBuffer;

  private started = false;
  private musicEnabled = true; // false = real ElevenLabs bed plays instead (SFX stay on)
  private intensity = 0;
  private bpm = 84;
  private step = 0;
  private nextNoteTime = 0;
  private timer?: number;
  private arp = 0;
  private sfxBank = new SfxBank();
  private combatLayer = 0;

  /** Call from a user-gesture handler (browsers block audio until then). */
  ensureStarted() {
    if (this.started) return;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.buildGraph();
      this.started = true;
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.scheduler(), 25);
      this.master!.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      this.master!.gain.linearRampToValueAtTime(
        MASTER_BASE * getSettings().master,
        this.ctx.currentTime + 2.5,
      );
    } catch {
      this.ctx = undefined; // audio unavailable; stay silent
    }
    this.ctx?.resume?.();
  }

  setIntensity(v: number) {
    this.intensity = clamp01(Math.max(v, this.combatLayer));
  }

  /** Adaptive music combat layer — drums/hats swell under authored beds. */
  setCombatLayer(v: number) {
    this.combatLayer = clamp01(v);
    this.intensity = clamp01(Math.max(this.intensity, this.combatLayer));
  }

  /** Enable/mute the procedural MUSIC layer (lead/bass/hats) without touching SFX.
   *  The MusicDirector mutes this when a real ElevenLabs bed is playing for the
   *  current environment, and re-enables it as the fallback when no bed exists.
   *  Safe to call before the audio graph is built (the flag is applied on start). */
  setMusicEnabled(on: boolean) {
    if (this.musicEnabled === on) return;
    this.musicEnabled = on;
    if (!this.ctx || !this.musicBus) return;
    this.musicBus.gain.setTargetAtTime(on ? getSettings().music : 0, this.ctx.currentTime, 0.12);
  }

  dispose() {
    if (this.timer) window.clearInterval(this.timer);
    this.ctx?.close?.();
  }

  // ---- graph ----

  private buildGraph() {
    const ctx = this.ctx!;
    const s = getSettings();
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    // Master limiter so stacked SFX never clip.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.08;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // Music (via a duck node) + SFX channels, scaled by the user volume settings.
    this.musicDuck = ctx.createGain();
    this.musicDuck.gain.value = 1;
    this.musicDuck.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicEnabled ? s.music : 0;
    this.musicBus.connect(this.musicDuck);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = s.sfx;
    this.sfxBus.connect(this.master);
    this.sfxBank.attach(ctx, this.sfxBus);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    this.reverb.connect(wet);
    wet.connect(this.musicBus);

    this.leadBus = ctx.createGain();
    this.leadBus.gain.value = 0.8;
    this.leadBus.connect(this.reverb);
    this.leadBus.connect(this.musicBus);

    this.bassBus = ctx.createGain();
    this.bassBus.gain.value = 0.55;
    this.bassBus.connect(this.musicBus);
  }

  /** Live-apply the current volume settings (called from the options menu). */
  applyVolumes() {
    if (!this.ctx) return;
    const s = getSettings();
    const t = this.ctx.currentTime;
    this.master?.gain.setTargetAtTime(MASTER_BASE * s.master, t, 0.05);
    this.musicBus?.gain.setTargetAtTime(this.musicEnabled ? s.music : 0, t, 0.05);
    this.sfxBus?.gain.setTargetAtTime(s.sfx, t, 0.05);
  }

  /** Duck the music under dialogue so spoken lines read clearly. */
  setDialogueDuck(on: boolean) {
    if (!this.ctx || !this.musicDuck) return;
    this.musicDuck.gain.setTargetAtTime(on ? 0.4 : 1, this.ctx.currentTime, 0.08);
  }

  private impulse(dur: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  private noise(): AudioBuffer {
    if (!this.noiseBuf) {
      const ctx = this.ctx!;
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    return this.noiseBuf;
  }

  // ---- sequencer ----

  private scheduler() {
    if (!this.ctx) return;
    const lookahead = 0.12;
    const sec16 = 60 / this.bpm / 4;
    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      this.scheduleStep(this.step, this.nextNoteTime, sec16);
      this.nextNoteTime += sec16;
      this.step = (this.step + 1) % 64; // 4 bars × 16
    }
  }

  private scheduleStep(step: number, t: number, sec16: number) {
    const bar = Math.floor(step / 16);
    const s = step % 16;

    if (s === 0 || s === 8) {
      this.playBass(midiToFreq(A_MINOR_BASS[bar % A_MINOR_BASS.length]), t, sec16 * 7);
    }

    const leadEvery = this.intensity > 0.5 ? 2 : 4;
    if (s % leadEvery === 0) {
      const note = LEAD_ARP[this.arp % LEAD_ARP.length];
      this.arp++;
      this.playLead(midiToFreq(note + 12), t);
    }

    if (this.intensity > 0.35 && s % 2 === 1) this.playHat(t);
  }

  private playBass(freq: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 240 + this.intensity * 460;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    lp.connect(g);
    g.connect(this.bassBus!);

    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = freq / 2;
    sub.connect(g);
    for (const detune of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    sub.start(t);
    sub.stop(t + dur + 0.05);
  }

  private playLead(freq: number, t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const g = ctx.createGain();
    const peak = 0.1 + this.intensity * 0.32;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g);
    g.connect(this.leadBus!);
    o.start(t);
    o.stop(t + 0.55);
  }

  private playHat(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05 * this.intensity, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.musicBus ?? this.master!);
    src.start(t);
    src.stop(t + 0.06);
  }

  // ---- one-shot SFX ----

  shoot() {
    this.sfxBank.play("shoot");
  }
  hit() {
    this.sfxBank.play("hit");
  }
  crit() {
    this.sfxBank.play("crit", { pitch: 1 + Math.random() * 0.08 });
  }
  footstep() {
    this.sfxBank.play("footstep", { pitch: 0.92 + Math.random() * 0.16, gain: 0.55 });
  }
  kill() {
    this.sfxBank.play("kill");
    this.burst(0.18, 0.1);
  }
  infect() {
    this.blip("triangle", 320, 940, 0.5, 0.07);
  }
  meltdown() {
    this.blip("sawtooth", 420, 38, 1.5, 0.18);
    this.burst(1.1, 0.13);
  }
  /** Item picked up — short bright tick. */
  pickup() {
    this.sfxBank.play("pickup");
  }
  /** Dash — quick downward woosh. */
  dash() {
    this.sfxBank.play("dash");
  }
  /** Class ability cast — a taut synth zap (Q/E, all classes). */
  cast() {
    this.blip("square", 700, 210, 0.16, 0.08);
  }
  /** Level up — rising two-note flourish. */
  levelUp() {
    this.sfxBank.play("levelUp");
  }
  /** Heat tier crossed — a rising power swell (bigger at the top tiers). */
  tierUp(tier: number) {
    const base = 300 + tier * 130;
    this.blip("sawtooth", base, base * 2.2, 0.2, 0.06 + tier * 0.01);
  }
  /** ICE core shattered — bright crack + glassy burst. */
  iceShatter() {
    this.blip("square", 1600, 240, 0.35, 0.12);
    this.burst(0.45, 0.12);
    this.delayed(60, () => this.blip("triangle", 2100, 900, 0.2, 0.07));
  }

  private delayed(ms: number, fn: () => void) {
    if (!this.ctx) return;
    window.setTimeout(fn, ms);
  }

  private blip(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
  ) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus ?? this.master ?? ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, gain: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus ?? this.master ?? ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
