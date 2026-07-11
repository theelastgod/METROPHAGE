#!/usr/bin/env node
// METROPHAGE — OFFLINE music generator. No API, no network, no encoder: pure Node
// DSP renders a distinct cyberpunk bed per environment and writes seamless-looping
// WAV files into src/assets/music/, where the MusicDirector picks them up
// (resolved by import.meta.glob in src/audio/musicTracks.ts — any audio extension).
//
// This is the zero-dependency alternative to tools/gen-music.mjs (ElevenLabs). Beds
// are deterministic (seeded), so re-runs are stable. Drop-in upgrade later: a real
// ElevenLabs <stem>.mp3 wins over the generated <stem>.wav (see musicTracks order).
//
// Usage:
//   node tools/gen-music-local.mjs                 # all beds
//   node tools/gen-music-local.mjs menu dive core  # a subset (by env)
//   npm run gen:music:local

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "src/assets/music");
const SR = 32000; // sample rate (Hz) — 16 kHz nyquist is plenty for synthwave
const CH = 2; // stereo

// ── tiny DSP toolkit ────────────────────────────────────────────────────────
const TAU = Math.PI * 2;
const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  pent: [0, 3, 5, 7, 10],
};
// scale degree (0-based, can exceed length → octave up) → midi note above root
function degNote(root, scale, deg) {
  const n = scale.length;
  const oct = Math.floor(deg / n);
  return root + scale[((deg % n) + n) % n] + 12 * oct;
}
// triad (root/third/fifth) for a chord whose root is scale degree `d`
const triad = (root, scale, d) => [degNote(root, scale, d), degNote(root, scale, d + 2), degNote(root, scale, d + 4)];

function osc(type, ph) {
  switch (type) {
    case "sine":
      return Math.sin(ph);
    case "saw":
      return 1 - (ph / Math.PI) % 2; // -1..1 ramp
    case "square":
      return Math.sin(ph) >= 0 ? 1 : -1;
    case "tri":
      return (2 / Math.PI) * Math.asin(Math.sin(ph));
    default:
      return Math.sin(ph);
  }
}

// equal-power pan: pan -1..1 → [gainL, gainR]
const panGains = (pan) => {
  const a = ((pan + 1) / 2) * (Math.PI / 2);
  return [Math.cos(a), Math.sin(a)];
};

// Render one oscillator note (with unison detune) into the stereo buffer.
function note(buf, t0, dur, freq, { type = "saw", gain = 0.2, atk = 0.005, rel = 0.08, hold = 0.9, pan = 0, detune = 0, voices = 1 } = {}) {
  const start = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  const [gL, gR] = panGains(pan);
  const sustain = Math.floor(len * hold);
  const atkS = Math.max(1, Math.floor(atk * SR));
  const relS = Math.max(1, Math.floor(rel * SR));
  for (let v = 0; v < voices; v++) {
    const dt = voices > 1 ? (v / (voices - 1) - 0.5) * 2 * detune : 0; // cents spread
    const f = freq * Math.pow(2, dt / 1200);
    const dph = (TAU * f) / SR;
    const vpan = voices > 1 ? pan + (v / (voices - 1) - 0.5) * 0.6 : pan; // spread width
    const [vL, vR] = panGains(clamp(vpan, -1, 1));
    let ph = Math.random() * TAU;
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      if (idx < 0 || idx * CH + 1 >= buf.length) break;
      // amp envelope: linear attack, full, then release tail
      let env;
      if (i < atkS) env = i / atkS;
      else if (i < sustain) env = 1;
      else env = Math.max(0, 1 - (i - sustain) / relS);
      const s = osc(type, ph) * env * gain;
      buf[idx * CH] += s * (voices > 1 ? vL : gL);
      buf[idx * CH + 1] += s * (voices > 1 ? vR : gR);
      ph += dph;
      if (ph > TAU) ph -= TAU;
    }
  }
}

function kick(buf, t0, { gain = 0.9, f0 = 140, f1 = 46, dur = 0.16 } = {}) {
  const start = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx * CH + 1 >= buf.length) break;
    const k = i / len;
    const f = f1 + (f0 - f1) * Math.pow(1 - k, 3); // pitch drop
    ph += (TAU * f) / SR;
    const env = Math.pow(1 - k, 2.2);
    const s = Math.sin(ph) * env * gain;
    buf[idx * CH] += s;
    buf[idx * CH + 1] += s;
  }
}

function noiseHit(buf, t0, { gain = 0.3, dur = 0.05, hp = 0, lp = 1, pan = 0, decay = 2.5 } = {}) {
  const start = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  const [gL, gR] = panGains(pan);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx * CH + 1 >= buf.length) break;
    let n = Math.random() * 2 - 1;
    // crude one-pole highpass (hp 0..1) + lowpass (lp 0..1)
    if (hp > 0) {
      const v = n - prev;
      prev = n;
      n = v * hp + n * (1 - hp);
    }
    if (lp < 1) {
      prev = prev + (n - prev) * lp;
      n = prev;
    }
    const env = Math.pow(1 - i / len, decay);
    const s = n * env * gain;
    buf[idx * CH] += s * gL;
    buf[idx * CH + 1] += s * gR;
  }
}

// rising/falling siren sweep (meltdown flavour)
function siren(buf, t0, dur, { gain = 0.18, f0 = 220, f1 = 1100, type = "saw", pan = 0 } = {}) {
  const start = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  const [gL, gR] = panGains(pan);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx * CH + 1 >= buf.length) break;
    const k = i / len;
    const f = f0 * Math.pow(f1 / f0, k);
    ph += (TAU * f) / SR;
    if (ph > TAU) ph -= TAU;
    const env = Math.sin(Math.PI * k); // swell up then down
    const s = osc(type, ph) * env * gain;
    buf[idx * CH] += s * gL;
    buf[idx * CH + 1] += s * gR;
  }
}

// ── master FX (applied to the full buffer) ──────────────────────────────────
function lowpass(buf, cutoff) {
  if (cutoff >= 1) return;
  const a = cutoff;
  let l = 0, r = 0;
  for (let i = 0; i < buf.length; i += CH) {
    l += (buf[i] - l) * a;
    r += (buf[i + 1] - r) * a;
    buf[i] = l;
    buf[i + 1] = r;
  }
}

function pingPongDelay(buf, timeS, fb, mix) {
  if (mix <= 0) return;
  const d = Math.floor(timeS * SR);
  if (d < 1) return;
  for (let i = 0; i < buf.length; i += CH) {
    const jL = i - d * CH; // cross-feed: L reads delayed R, R reads delayed L
    if (jL >= 0) {
      const dl = buf[jL + 1] * fb;
      const dr = buf[jL] * fb;
      buf[i] += dl * mix;
      buf[i + 1] += dr * mix;
    }
  }
}

// Schroeder-ish reverb: parallel combs + series allpass, per channel.
function reverb(buf, mix) {
  if (mix <= 0) return;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491]; // sample delays
  const all = [556, 441, 341];
  for (let c = 0; c < CH; c++) {
    const dry = new Float64Array(buf.length / CH);
    for (let i = 0, k = 0; i < buf.length; i += CH, k++) dry[k] = buf[i + c];
    const wet = new Float64Array(dry.length);
    for (const cd of combs) {
      const len = cd + c * 23;
      const ring = new Float64Array(len);
      let p = 0;
      const fbk = 0.78;
      for (let k = 0; k < dry.length; k++) {
        const y = ring[p];
        ring[p] = dry[k] + y * fbk;
        wet[k] += y / combs.length;
        if (++p >= len) p = 0;
      }
    }
    for (const ad of all) {
      const len = ad + c * 13;
      const ring = new Float64Array(len);
      let p = 0;
      const g = 0.7;
      for (let k = 0; k < wet.length; k++) {
        const bufd = ring[p];
        const inp = wet[k];
        const y = -g * inp + bufd;
        ring[p] = inp + g * y;
        wet[k] = y;
        if (++p >= len) p = 0;
      }
    }
    for (let i = c, k = 0; i < buf.length; i += CH, k++) buf[i] = buf[i] * (1 - mix * 0.5) + wet[k] * mix;
  }
}

const softclip = (buf, drive) => {
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive) / Math.tanh(drive);
};

function normalize(buf, peak = 0.89) {
  let mx = 0;
  for (let i = 0; i < buf.length; i++) mx = Math.max(mx, Math.abs(buf[i]));
  if (mx < 1e-6) return;
  const g = peak / mx;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
}

// ── WAV (16-bit PCM) writer ─────────────────────────────────────────────────
function writeWav(file, buf) {
  const n = buf.length;
  const data = Buffer.alloc(44 + n * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + n * 2, 4);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(CH, 22);
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * CH * 2, 28);
  data.writeUInt16LE(CH * 2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = clamp(buf[i], -1, 1);
    data.writeInt16LE((s < 0 ? s * 32768 : s * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(file, data);
  return data.length;
}

// ── environment profiles ────────────────────────────────────────────────────
// root: midi root note. prog: chord roots as scale degrees. drums/fx tune the mood.
const A = 57; // A3
const PROFILES = {
  // THE WAKE THEME — the game's front-door anthem. A composed 16-bar motif in two
  // halves: the question (falls to a suspended B over the v chord) and the answer
  // (peaks a fourth higher, then walks home to a long tonic). Hummable on purpose.
  menu: { seed: 11, bpm: 82, bars: 16, root: A, scale: "minor", prog: [0, 5, 3, 4],
    bass: { type: "tri", gain: 0.22, oct: -1 }, pad: { type: "saw", gain: 0.11 },
    arp: { type: "tri", gain: 0.1, rate: 2, oct: 1 }, drums: { kick: 0.5, hat: 0.1, snare: 0 },
    theme: { type: "saw", gain: 0.17, notes: [
      // — the question (bars 1–8) —
      [4, 0, 3], [2, 3, 1], [0, 4, 3],
      [5, 8, 2], [4, 10, 1], [2, 11, 1], [4, 12, 4],
      [7, 16, 3], [8, 19, 1], [7, 20, 2], [5, 22, 2],
      [4, 24, 1.5], [2, 25.5, 1.5], [1, 27, 5],
      // — the answer (bars 9–16) —
      [7, 32, 3], [5, 35, 1], [4, 36, 3],
      [9, 40, 2], [8, 42, 1], [7, 43, 1], [8, 44, 4],
      [7, 48, 2], [5, 50, 2], [4, 52, 2], [2, 54, 2],
      [0, 56, 8],
    ] },
    fx: { cutoff: 0.5, delay: 0.5, delayFb: 0.34, delayMix: 0.28, rev: 0.32, drive: 1.2 } },

  city: { seed: 22, bpm: 96, bars: 16, root: A, scale: "dorian", prog: [0, 3, 4, 0],
    bass: { type: "saw", gain: 0.24, oct: -1 }, pad: { type: "saw", gain: 0.1 },
    arp: { type: "tri", gain: 0.14, rate: 2, oct: 1 }, drums: { kick: 0.6, hat: 0.18, snare: 0.0 },
    fx: { cutoff: 0.6, delay: 0.375, delayFb: 0.36, delayMix: 0.26, rev: 0.26, drive: 1.3 } },

  subway: { seed: 33, bpm: 110, bars: 16, root: A, scale: "minor", prog: [0, 0, 5, 5],
    bass: { type: "saw", gain: 0.28, oct: -1, off: true }, pad: { type: "saw", gain: 0.07 },
    arp: { type: "square", gain: 0.13, rate: 4, oct: 1 }, drums: { kick: 0.95, hat: 0.3, snare: 0.5 },
    fx: { cutoff: 0.72, delay: 0.273, delayFb: 0.3, delayMix: 0.2, rev: 0.16, drive: 1.5 } },

  dive: { seed: 44, bpm: 132, bars: 16, root: A + 2, scale: "phrygian", prog: [0, 1, 0, 6],
    bass: { type: "square", gain: 0.24, oct: -1 }, pad: { type: "saw", gain: 0.06 },
    arp: { type: "square", gain: 0.16, rate: 4, oct: 2, glitch: true }, drums: { kick: 0.9, hat: 0.42, snare: 0.5 },
    fx: { cutoff: 0.85, delay: 0.1875, delayFb: 0.42, delayMix: 0.3, rev: 0.14, drive: 2.0 } },

  online: { seed: 55, bpm: 118, bars: 16, root: A + 3, scale: "minor", prog: [0, 5, 6, 4],
    bass: { type: "saw", gain: 0.26, oct: -1 }, pad: { type: "saw", gain: 0.12 },
    arp: { type: "saw", gain: 0.14, rate: 2, oct: 1 }, lead: { type: "square", gain: 0.13 },
    drums: { kick: 0.95, hat: 0.34, snare: 0.55 },
    fx: { cutoff: 0.78, delay: 0.254, delayFb: 0.34, delayMix: 0.26, rev: 0.22, drive: 1.5 } },

  district_downtown: { seed: 66, bpm: 100, bars: 16, root: A, scale: "minor", prog: [0, 5, 2, 6],
    bass: { type: "saw", gain: 0.28, oct: -1 }, pad: { type: "saw", gain: 0.1 },
    arp: { type: "square", gain: 0.13, rate: 2, oct: 1 }, drums: { kick: 0.85, hat: 0.26, snare: 0.5 },
    fx: { cutoff: 0.66, delay: 0.3, delayFb: 0.34, delayMix: 0.26, rev: 0.24, drive: 1.6 } },

  district_stacks: { seed: 77, bpm: 108, bars: 16, root: A - 2, scale: "phrygian", prog: [0, 0, 1, 0],
    bass: { type: "square", gain: 0.32, oct: -1 }, pad: { type: "saw", gain: 0.08 },
    arp: { type: "square", gain: 0.1, rate: 2, oct: 1 }, drums: { kick: 0.95, hat: 0.4, snare: 0.6, metal: true },
    fx: { cutoff: 0.6, delay: 0.222, delayFb: 0.3, delayMix: 0.18, rev: 0.18, drive: 2.2 } },

  district_spire: { seed: 88, bpm: 104, bars: 16, root: A + 5, scale: "minor", prog: [0, 4, 5, 3],
    bass: { type: "tri", gain: 0.22, oct: -1 }, pad: { type: "tri", gain: 0.12 },
    arp: { type: "sine", gain: 0.16, rate: 4, oct: 2 }, drums: { kick: 0.6, hat: 0.3, snare: 0.4 },
    fx: { cutoff: 0.9, delay: 0.288, delayFb: 0.4, delayMix: 0.32, rev: 0.34, drive: 1.2 } },

  district_core: { seed: 99, bpm: 118, bars: 16, root: A - 2, scale: "harmonic", prog: [0, 6, 5, 0],
    bass: { type: "saw", gain: 0.32, oct: -1 }, pad: { type: "saw", gain: 0.12 },
    arp: { type: "saw", gain: 0.15, rate: 4, oct: 1 }, lead: { type: "saw", gain: 0.14 },
    drums: { kick: 1.0, hat: 0.42, snare: 0.7 },
    fx: { cutoff: 0.74, delay: 0.254, delayFb: 0.34, delayMix: 0.24, rev: 0.26, drive: 2.0 } },

  meltdown: { seed: 100, bpm: 86, bars: 10, root: A - 2, scale: "phrygian", prog: [0, 1, 0, 1],
    bass: { type: "saw", gain: 0.3, oct: -1 }, pad: { type: "saw", gain: 0.14 },
    arp: { type: "square", gain: 0.1, rate: 2, oct: 1 }, drums: { kick: 1.0, hat: 0.2, snare: 0.6 },
    fx: { cutoff: 0.7, delay: 0.35, delayFb: 0.4, delayMix: 0.3, rev: 0.4, drive: 2.4 }, siren: true },
};

// ── compose one bed: render 3 loops, keep the middle (seamless steady-state FX) ──
function compose(p) {
  const scale = SCALES[p.scale];
  const beat = 60 / p.bpm;
  const bar = beat * 4;
  const loop = p.bars * bar;
  const total = loop * 3 + 1.5; // 3 loops + reverb guard
  const buf = new Float64Array(Math.ceil(total * SR) * CH);
  const rnd = mulberry32(p.seed);

  for (let rep = 0; rep < 3; rep++) {
    const base = rep * loop;
    for (let b = 0; b < p.bars; b++) {
      const t = base + b * bar;
      const deg = p.prog[b % p.prog.length];
      const ch = triad(p.root, scale, deg);

      // PAD — sustained chord, wide
      if (p.pad) for (let k = 0; k < ch.length; k++)
        note(buf, t, bar * 0.98, midiToFreq(ch[k]), { type: p.pad.type, gain: p.pad.gain, atk: 0.25, rel: 0.6, hold: 0.75, pan: (k - 1) * 0.5, voices: 2, detune: 8 });

      // BASS — root, per-beat (offbeat option for driving feel)
      if (p.bass) {
        const broot = p.root + scale[((deg % 7) + 7) % 7] + 12 * (p.bass.oct || -1);
        for (let bt = 0; bt < 4; bt++) {
          const off = p.bass.off ? beat * 0.5 : 0;
          note(buf, t + bt * beat + off, beat * (p.bass.off ? 0.45 : 0.8), midiToFreq(broot), { type: p.bass.type, gain: p.bass.gain, atk: 0.005, rel: 0.06, hold: 0.7, voices: 2, detune: 10 });
          if (p.bass.type !== "tri") note(buf, t + bt * beat + off, beat * 0.6, midiToFreq(broot - 12), { type: "sine", gain: p.bass.gain * 0.6, atk: 0.005, rel: 0.06, hold: 0.7 });
        }
      }

      // ARP — chord tones cycling, rate notes per beat
      if (p.arp) {
        const step = beat / p.arp.rate;
        const steps = 4 * p.arp.rate;
        for (let s = 0; s < steps; s++) {
          if (p.arp.glitch && rnd() < 0.18) continue; // dropouts = digital glitch
          const tone = ch[s % ch.length] + 12 * (p.arp.oct || 1) + (s % (ch.length * 2) >= ch.length ? 12 : 0);
          const jit = p.arp.glitch ? (rnd() < 0.15 ? 12 : 0) : 0;
          note(buf, t + s * step, step * 0.9, midiToFreq(tone + jit), { type: p.arp.type, gain: p.arp.gain, atk: 0.003, rel: 0.05, hold: 0.5, pan: (s % 2 ? 0.35 : -0.35) });
        }
      }

      // THEME — an AUTHORED motif spanning the whole loop, in absolute beats.
      // notes: [scaleDegree, startBeat, lengthBeats, octave?]. This is the layer
      // that makes a bed a THEME — a hummable line instead of texture. Placed on
      // bar 0 only (the note times cover all bars themselves).
      if (p.theme && b === 0) {
        for (const [dg, startB, lenB, oct = 1] of p.theme.notes) {
          note(buf, t + startB * beat, lenB * beat * 0.94, midiToFreq(degNote(p.root, scale, dg) + 12 * oct), {
            type: p.theme.type || "saw",
            gain: p.theme.gain ?? 0.16,
            atk: 0.02,
            rel: 0.34,
            hold: 0.82,
            voices: 2,
            detune: 7,
            pan: 0.08,
          });
          // a whisper of the same line an octave down thickens it without mud
          note(buf, t + startB * beat, lenB * beat * 0.94, midiToFreq(degNote(p.root, scale, dg)), {
            type: "tri",
            gain: (p.theme.gain ?? 0.16) * 0.35,
            atk: 0.03,
            rel: 0.3,
            hold: 0.8,
            pan: -0.1,
          });
        }
      }

      // LEAD — a simple motif on bars 2 & 4 of the phrase (anthemic envs)
      if (p.lead && b % 2 === 1) {
        const motif = [0, 2, 4, 2, 5, 4];
        for (let m = 0; m < motif.length; m++)
          note(buf, t + m * (beat / 2), beat * 0.45, midiToFreq(degNote(p.root, scale, deg + motif[m]) + 12), { type: p.lead.type, gain: p.lead.gain, atk: 0.01, rel: 0.12, hold: 0.6, pan: 0.1 });
      }

      // DRUMS
      const d = p.drums || {};
      for (let bt = 0; bt < 4; bt++) {
        if (d.kick) kick(buf, t + bt * beat, { gain: 0.9 * d.kick });
        if (d.snare && (bt === 1 || bt === 3)) noiseHit(buf, t + bt * beat, { gain: 0.34 * d.snare, dur: 0.14, hp: 0.6, decay: 3, pan: 0 });
        if (d.hat) for (let h = 0; h < 2; h++) {
          if (h === 0 && bt % 2 === 0 && d.kick > 0.8) continue;
          noiseHit(buf, t + bt * beat + h * beat * 0.5, { gain: 0.12 * d.hat * (h ? 1 : 0.7), dur: d.metal ? 0.09 : 0.04, hp: 0.85, decay: d.metal ? 1.5 : 3, pan: 0.2 });
        }
        if (d.metal && bt === 2) noiseHit(buf, t + bt * beat, { gain: 0.16, dur: 0.18, hp: 0.4, lp: 0.5, decay: 1.6, pan: -0.3 }); // clang
      }
    }
    // meltdown sirens, once per loop, sweeping across the stereo field
    if (p.siren) {
      siren(buf, base + bar * 0.5, loop * 0.4, { gain: 0.16, f0: 180, f1: 900, pan: -0.6 });
      siren(buf, base + loop * 0.5, loop * 0.45, { gain: 0.14, f0: 1200, f1: 220, type: "square", pan: 0.6 });
    }
  }

  // master chain
  lowpass(buf, p.fx.cutoff);
  pingPongDelay(buf, p.fx.delay, p.fx.delayFb, p.fx.delayMix);
  reverb(buf, p.fx.rev);
  softclip(buf, p.fx.drive);

  // extract the MIDDLE loop (FX already in steady state → seamless)
  const loopN = Math.floor(loop * SR) * CH;
  const out = buf.slice(loopN, loopN * 2);
  normalize(out, 0.9);
  return out;
}

// Compress WAV → AAC .m4a (≈7× smaller, faster decode) when macOS afconvert is
// available; otherwise keep the universal WAV. Pass --wav to force WAV.
const KEEP_WAV = process.argv.includes("--wav");
const canM4a = () => {
  if (KEEP_WAV) return false;
  try {
    execFileSync("afconvert", ["-h"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
function toM4a(wav) {
  const m4a = wav.replace(/\.wav$/, ".m4a");
  fs.rmSync(m4a, { force: true });
  execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "128000", wav, m4a], { stdio: "ignore" });
  fs.rmSync(wav);
  return m4a;
}

// ── main ────────────────────────────────────────────────────────────────────
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const envs = Object.keys(PROFILES).filter((e) => !only.length || only.includes(e));
fs.mkdirSync(OUT_DIR, { recursive: true });
const compress = canM4a();
console.log(
  `♪ METROPHAGE offline music — ${envs.length} bed(s) @ ${SR / 1000}kHz stereo, ` +
    `${compress ? "AAC .m4a" : "WAV"} → src/assets/music/\n`,
);
let total = 0;
for (const env of envs) {
  const p = PROFILES[env];
  process.stdout.write(`• ${env.padEnd(18)} ${p.bpm} BPM ${p.scale.padEnd(8)} … `);
  const t0 = Date.now();
  const out = compose(p);
  let file = writeWav(path.join(OUT_DIR, env + ".wav"), out) && path.join(OUT_DIR, env + ".wav");
  if (compress) file = toM4a(file);
  const bytes = fs.statSync(file).size;
  total += bytes;
  console.log(`${(bytes / 1024 / 1024).toFixed(2)} MB  (${Date.now() - t0} ms)`);
}
console.log(`\nDone — ${envs.length} beds, ${(total / 1024 / 1024).toFixed(1)} MB total.`);
