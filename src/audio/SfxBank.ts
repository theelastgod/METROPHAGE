import { getSettings } from "../systems/Settings";

type SfxName =
  | "shoot"
  | "hit"
  | "crit"
  | "kill"
  | "pickup"
  | "dash"
  | "levelUp"
  | "ui"
  | "footstep"
  | "cast"
  | "heat"
  | "core"
  | "ult";

/** Map logical SFX names → Seed Audio files under /assets/sfx/ (when present). */
const SAMPLE_URL: Partial<Record<SfxName, string>> = {
  hit: "assets/sfx/sfx_hit.wav",
  cast: "assets/sfx/sfx_cast.wav",
  heat: "assets/sfx/sfx_heat.wav",
  pickup: "assets/sfx/sfx_pickup.wav",
  ui: "assets/sfx/sfx_ui_blip.wav",
  core: "assets/sfx/sfx_core.wav",
  dash: "assets/sfx/sfx_dash.wav",
  ult: "assets/sfx/sfx_ult.wav",
};

/** Procedural one-shot SFX bank — cached AudioBuffers, routed through the sfx bus.
 *  When Seed Audio samples are available they replace the procedural tones. */
export default class SfxBank {
  private ctx?: AudioContext;
  private bus?: GainNode;
  private buffers = new Map<SfxName, AudioBuffer>();
  private samplesLoading = false;

  attach(ctx: AudioContext, sfxBus: GainNode) {
    this.ctx = ctx;
    this.bus = sfxBus;
    this.bakeAll();
    void this.loadSamples();
  }

  play(name: SfxName, opts?: { pitch?: number; gain?: number }) {
    if (!this.ctx || !this.bus) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    const vol = getSettings().sfx * getSettings().master * (opts?.gain ?? 1);
    g.gain.value = vol;
    src.playbackRate.value = opts?.pitch ?? 1;
    src.connect(g);
    g.connect(this.bus);
    src.start();
  }

  private bakeAll() {
    const ctx = this.ctx!;
    this.buffers.set("shoot", this.tone(ctx, 0.06, 880, 2200, "square", 0.35));
    this.buffers.set("hit", this.noise(ctx, 0.08, 800, 0.5));
    this.buffers.set("crit", this.tone(ctx, 0.1, 920, 1800, "square", 0.42));
    this.buffers.set("kill", this.tone(ctx, 0.14, 180, 60, "sawtooth", 0.45));
    this.buffers.set("pickup", this.tone(ctx, 0.1, 520, 1040, "triangle", 0.3));
    this.buffers.set("dash", this.noise(ctx, 0.05, 2400, 0.25));
    this.buffers.set("levelUp", this.tone(ctx, 0.18, 330, 660, "triangle", 0.4));
    this.buffers.set("ui", this.tone(ctx, 0.04, 1200, 1800, "sine", 0.2));
    this.buffers.set("footstep", this.noise(ctx, 0.03, 400, 0.15));
    // Procedural stand-ins until Seed Audio samples load
    this.buffers.set("cast", this.tone(ctx, 0.12, 700, 210, "square", 0.28));
    this.buffers.set("heat", this.tone(ctx, 0.2, 300, 900, "sawtooth", 0.22));
    this.buffers.set("core", this.tone(ctx, 0.12, 880, 1760, "triangle", 0.3));
    this.buffers.set("ult", this.noise(ctx, 0.18, 400, 0.55));
  }

  /** Prefer authored Seed Audio clips when the files are present. */
  private async loadSamples() {
    if (!this.ctx || this.samplesLoading) return;
    this.samplesLoading = true;
    const ctx = this.ctx;
    await Promise.all(
      (Object.entries(SAMPLE_URL) as [SfxName, string][]).map(async ([name, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const ab = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(ab.slice(0));
          this.buffers.set(name, buf);
        } catch {
          /* keep procedural fallback */
        }
      }),
    );
  }

  private tone(
    ctx: AudioContext,
    dur: number,
    f0: number,
    f1: number,
    type: OscillatorType,
    peak: number,
  ): AudioBuffer {
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t * 18) * peak;
      const f = f0 + (f1 - f0) * (t / dur);
      const phase = (2 * Math.PI * f * t) % (2 * Math.PI);
      const s =
        type === "square"
          ? Math.sign(Math.sin(phase))
          : type === "sawtooth"
            ? 2 * (phase / (2 * Math.PI) - 0.5)
            : type === "triangle"
              ? 2 * Math.abs(2 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5))) - 1
              : Math.sin(phase);
      data[i] = s * env;
    }
    return buf;
  }

  private noise(ctx: AudioContext, dur: number, cutoff: number, peak: number): AudioBuffer {
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t * 22) * peak;
      const white = Math.random() * 2 - 1;
      last = last * (cutoff / (cutoff + ctx.sampleRate)) + white * (ctx.sampleRate / (cutoff + ctx.sampleRate));
      data[i] = last * env;
    }
    return buf;
  }
}
