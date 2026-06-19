import Phaser from "phaser";

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
uniform vec2 uResolution;
varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  vec2 toC = uv - 0.5;
  float dist = length(toC);
  vec2 dir = toC / (dist + 1e-5);

  // radial chromatic aberration, grows with heat + distance from center
  float ca = (0.0012 + uHeat * 0.0065) * (0.4 + dist);
  float r = texture2D(uMainSampler, uv - dir * ca).r;
  float g = texture2D(uMainSampler, uv).g;
  float b = texture2D(uMainSampler, uv + dir * ca).b;
  vec3 col = vec3(r, g, b);

  // cheap bloom: bright-pass 3x3 with heat-scaled spread
  vec2 px = (1.0 / uResolution) * (1.5 + uHeat * 4.0);
  vec3 bloom = vec3(0.0);
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec3 s = texture2D(uMainSampler, uv + vec2(float(i), float(j)) * px).rgb;
      float bright = max(s.r, max(s.g, s.b));
      bloom += s * smoothstep(0.55, 1.0, bright);
    }
  }
  bloom /= 9.0;
  col += bloom * (0.7 + uHeat * 1.6);

  // saturation lift with heat
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.0 + uHeat * 0.7);

  // scanlines (subtle, stronger with heat)
  float scan = 0.93 + 0.07 * sin(uv.y * uResolution.y * 1.4 + uTime * 3.0);
  col *= mix(1.0, scan, 0.3 + uHeat * 0.3);

  // vignette
  col *= 1.0 - dist * dist * (0.22 + uHeat * 0.28);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export default class NeonPipeline extends Phaser.Renderer.WebGL.Pipelines
  .PostFXPipeline {
  /** 0..1, set by the scene from the Heat meter each frame. */
  heat = 0;

  constructor(game: Phaser.Game) {
    super({ game, name: "Neon", fragShader: FRAG });
  }

  onPreRender() {
    this.set1f("uHeat", this.heat);
    this.set1f("uTime", this.game.loop.time / 1000);
    this.set2f("uResolution", this.renderer.width, this.renderer.height);
  }
}
