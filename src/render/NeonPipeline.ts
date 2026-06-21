import Phaser from "phaser";
import { getSettings } from "../systems/Settings";

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
varying vec2 outTexCoord;

float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }

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

  // radial chromatic aberration, grows with heat + glitch
  float ca = (0.0012 + uHeat * 0.0065 + uGlitch * 0.012) * (0.4 + dist);
  float r = texture2D(uMainSampler, uv - dir * ca).r;
  float g = texture2D(uMainSampler, uv).g;
  float b = texture2D(uMainSampler, uv + dir * ca).b;
  vec3 col = vec3(r, g, b);

  // cheap bloom: bright-pass 3x3 with heat-scaled spread
  vec2 px = (1.0 / uResolution) * (1.5 + uHeat * 4.0 + uGlitch * 3.0);
  vec3 bloom = vec3(0.0);
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec3 s = texture2D(uMainSampler, uv + vec2(float(i), float(j)) * px).rgb;
      float bright = max(s.r, max(s.g, s.b));
      bloom += s * smoothstep(0.55, 1.0, bright);
    }
  }
  bloom /= 9.0;
  col += bloom * (0.7 + uHeat * 1.6 + uGlitch * 1.5);

  // saturation lift with heat
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.0 + uHeat * 0.7 + uGlitch * 0.6);

  // scanlines (subtle, stronger with heat)
  float scan = 0.93 + 0.07 * sin(uv.y * uResolution.y * 1.4 + uTime * 3.0);
  col *= mix(1.0, scan, 0.3 + uHeat * 0.3);

  // glitch static
  if (uGlitch > 0.001) {
    float nz = rand(uv * vec2(uTime * 0.7 + 1.0, uTime * 0.9 + 1.0));
    col += (nz - 0.5) * 0.18 * uGlitch;
  }

  // vignette
  col *= 1.0 - dist * dist * (0.22 + uHeat * 0.28);

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
  }
}
