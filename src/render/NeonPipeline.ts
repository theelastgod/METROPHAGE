import Phaser from "phaser";
import { bloomIntensity, effectiveLowFx, getSettings } from "../systems/Settings";

/**
 * Neon post-FX: radial chromatic aberration + cheap bright-pass bloom +
 * saturation lift + scanlines + vignette. All intensities scale with `heat`
 * (0..1), so the screen literally "heats up" as the Heat meter climbs. This is
 * what makes the placeholder primitives read as intentional neon-noir.
 */
const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uHeat;
uniform float uTime;
uniform float uGlitch;
uniform vec2 uResolution;
uniform vec3 uTint;     // district accent (0..1)
uniform float uTintAmt; // how hard to bias toward the accent
uniform float uLowFx;   // 1 = low-FX tier: skip bloom + chromatic aberration
uniform float uBloomAmt; // 0..1 quality scaler (medium tier = lighter bloom)
varying vec2 outTexCoord;

float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }

// Bright-pass a sample: keep only the emissive (neon) energy above a soft knee. The
// knee sits high so only genuinely emissive neon blooms — ordinary UI text doesn't.
vec3 brightPass(vec3 s) {
  float bright = max(s.r, max(s.g, s.b));
  return s * smoothstep(0.58, 0.96, bright);
}

void main() {
  vec2 uv = outTexCoord;

  // meltdown glitch: blocky horizontal slice displacement
  if (uGlitch > 0.001) {
    float line = floor(uv.y * 36.0);
    float n = rand(vec2(line, floor(uTime * 12.0)));
    uv.x += (n - 0.5) * 0.08 * uGlitch * step(0.72, n);
  }

  vec2 toC = uv - 0.5;
  float dist = length(toC);
  vec2 dir = toC / (dist + 1e-5);

  // radial chromatic aberration, grows with heat + glitch (skipped on low-FX)
  vec3 col;
  if (uLowFx > 0.5) {
    col = texture2D(uMainSampler, uv).rgb;
  } else {
    float ca = (0.0005 + uHeat * 0.006 + uGlitch * 0.012) * (0.4 + dist);
    float r = texture2D(uMainSampler, uv - dir * ca).r;
    float g = texture2D(uMainSampler, uv).g;
    float b = texture2D(uMainSampler, uv + dir * ca).b;
    col = vec3(r, g, b);

    // Two-ring gaussian bloom: a tight inner ring (4 diagonals) for a crisp halo
    // plus a wide outer ring (8 dirs) for soft neon spill. Heat/glitch widen it.
    // Richer + softer than the old 3x3 bright-pass, still ~13 taps.
    float spread = 1.6 + uHeat * 4.2 + uGlitch * 3.5;
    vec2 inr = (1.0 / uResolution) * spread;
    vec2 out2 = inr * 1.85;
    vec3 bloom = brightPass(col) * 0.9; // center
    // inner ring (×4, diagonals) — weighted heavier
    bloom += brightPass(texture2D(uMainSampler, uv + vec2( inr.x,  inr.y)).rgb) * 0.62;
    bloom += brightPass(texture2D(uMainSampler, uv + vec2(-inr.x,  inr.y)).rgb) * 0.62;
    bloom += brightPass(texture2D(uMainSampler, uv + vec2( inr.x, -inr.y)).rgb) * 0.62;
    bloom += brightPass(texture2D(uMainSampler, uv + vec2(-inr.x, -inr.y)).rgb) * 0.62;
    // outer ring (×8) — softer, wider spill
    bloom += brightPass(texture2D(uMainSampler, uv + vec2( out2.x, 0.0)).rgb) * 0.32;
    bloom += brightPass(texture2D(uMainSampler, uv + vec2(-out2.x, 0.0)).rgb) * 0.32;
    bloom += brightPass(texture2D(uMainSampler, uv + vec2(0.0,  out2.y)).rgb) * 0.32;
    bloom += brightPass(texture2D(uMainSampler, uv + vec2(0.0, -out2.y)).rgb) * 0.32;
    bloom += brightPass(texture2D(uMainSampler, uv + vec2( out2.x,  out2.y)).rgb) * 0.22;
    bloom += brightPass(texture2D(uMainSampler, uv + vec2(-out2.x,  out2.y)).rgb) * 0.22;
    bloom += brightPass(texture2D(uMainSampler, uv + vec2( out2.x, -out2.y)).rgb) * 0.22;
    bloom += brightPass(texture2D(uMainSampler, uv + vec2(-out2.x, -out2.y)).rgb) * 0.22;
    bloom /= 4.7; // normalize by total weight
    col += bloom * (0.92 + uHeat * 1.85 + uGlitch * 1.7) * uBloomAmt;
  }

  // cinematic grade — lifted blacks, teal shadows, warm highlights
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = max(col, vec3(0.014, 0.016, 0.022));
  col = mix(vec3(l), col, 1.03 + uHeat * 0.72 + uGlitch * 0.55);
  vec3 shadowTint = mix(vec3(0.05, 0.10, 0.16), vec3(0.14, 0.04, 0.12), 0.5 + 0.5 * sin(uTime * 0.06));
  col = mix(col, col * shadowTint + shadowTint * 0.07, smoothstep(0.0, 0.45, 1.0 - l) * 0.24);
  vec3 hiTint = vec3(1.04, 1.02, 0.98);
  col = mix(col, col * hiTint, smoothstep(0.52, 0.92, l) * 0.14);

  // fine scanlines + a slow rolling brightness band (CRT feel), stronger with heat.
  // Kept light at rest so it doesn't stripe small UI text; ramps up in hot combat.
  float scan = 0.96 + 0.04 * sin(uv.y * uResolution.y * 1.6 + uTime * 3.0);
  col *= mix(1.0, scan, 0.02 + uHeat * 0.26);
  float roll = 0.985 + 0.015 * sin(uv.y * 5.0 - uTime * 1.4);
  col *= roll;

  // animated film grain — very cheap, keeps flat darks from banding (eased off
  // under reduce-flashing via the capped uHeat the host already passes). Kept low
  // at base so pure-black areas stay clean; ramps with heat for a hotter signal.
  float grain = rand(uv * uResolution * 0.5 + fract(uTime)) - 0.5;
  col += grain * (0.010 + uHeat * 0.03) * smoothstep(0.02, 0.5, l);

  // glitch static
  if (uGlitch > 0.001) {
    float nz = rand(uv * vec2(uTime * 0.7 + 1.0, uTime * 0.9 + 1.0));
    col += (nz - 0.5) * 0.18 * uGlitch;
  }

  // vignette — soft indie-studio framing without crushing mids
  float vig = smoothstep(0.25, 1.05, dist * 1.35);
  col *= mix(1.0, 0.72, vig * (0.38 + uHeat * 0.22));
  // gentle highlight lift on emissive peaks so neon reads hotter at high resolution
  col = mix(col, col * 1.08 + vec3(0.02, 0.03, 0.05), smoothstep(0.55, 0.95, l) * 0.18);

  // district accent wash — a subtle hue signature per district (fades under heat
  // so the screen still "whites out" hot, and is overridden by meltdown glitch)
  vec3 acc = mix(vec3(1.0), uTint, uTintAmt * (1.0 - uHeat * 0.5) * (1.0 - uGlitch));
  col *= acc;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export default class NeonPipeline extends Phaser.Renderer.WebGL.Pipelines
  .PostFXPipeline {
  /** 0..1, set by the scene from the Heat meter each frame. */
  heat = 0;
  /** 0..1, ramped during the meltdown victory sequence. */
  glitch = 0;
  /** District accent as RGB (0..1) + how hard to bias toward it. */
  tint: [number, number, number] = [1, 1, 1];
  tintAmt = 0;

  constructor(game: Phaser.Game) {
    super({ game, name: "Neon", fragShader: FRAG });
  }

  onPreRender() {
    // ⚠ Photosensitivity safety: when reduce-flashing is on, cap the heat-driven
    // bloom/chromatic-aberration and clamp the glitch hard, so even the meltdown
    // reads as a steady wash instead of a screen-blowing strobe.
    const reduce = getSettings().reduceFlashing;
    const heat = reduce ? Math.min(this.heat, 0.5) : this.heat;
    const glitch = reduce ? Math.min(this.glitch, 0.16) : this.glitch;
    this.set1f("uHeat", heat);
    this.set1f("uGlitch", glitch);
    this.set1f("uTime", this.game.loop.time / 1000);
    this.set2f("uResolution", this.renderer.width, this.renderer.height);
    this.set3f("uTint", this.tint[0], this.tint[1], this.tint[2]);
    this.set1f("uTintAmt", this.tintAmt);
    this.set1f("uLowFx", effectiveLowFx() ? 1 : 0);
    this.set1f("uBloomAmt", bloomIntensity());
  }
}
