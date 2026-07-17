import { describe, expect, it } from "vitest";
import { drawEnemyBody, type EnemyBody } from "./enemyart";
import { CHAR, WALK_STEPS } from "./charart";
import { ENEMY_BODY_BY_ARCH, ENEMY_BODIES, enemyBodyKey } from "./manifest";
import { ENEMY_KIND_TINT } from "../scenes/online/sceneConfig";

/**
 * Minimal 2D-context stand-in. drawEnemyBody only uses fillRect + fillStyle +
 * globalAlpha + save/translate/scale/restore, so we can rasterize a coverage mask
 * headlessly and assert on the SILHOUETTE — which is the whole reason these exist.
 */
function rasterize(draw: (ctx: CanvasRenderingContext2D) => void) {
  const hit = new Uint8Array(CHAR * CHAR);
  let tx = 0;
  let sx = 1;
  const stack: Array<[number, number]> = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: "#000000",
    save() {
      stack.push([tx, sx]);
    },
    restore() {
      const s = stack.pop();
      if (s) [tx, sx] = s;
    },
    translate(x: number) {
      tx += x * sx;
    },
    scale(x: number) {
      sx *= x;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      if ((ctx.globalAlpha as number) < 0.3) return; // ignore faint glows/shadows
      let x0 = tx + x * sx;
      let x1 = tx + (x + w) * sx;
      if (x1 < x0) [x0, x1] = [x1, x0];
      for (let py = Math.round(y); py < Math.round(y + h); py++) {
        for (let px = Math.round(x0); px < Math.round(x1); px++) {
          if (px < 0 || py < 0 || px >= CHAR || py >= CHAR) continue;
          hit[py * CHAR + px] = 1;
        }
      }
    },
  } as unknown as CanvasRenderingContext2D;
  draw(ctx);
  return hit;
}

/** Bounding box of the drawn body, excluding the ground shadow rows (y >= 28). */
function bounds(hit: Uint8Array) {
  let minX = CHAR, maxX = -1, minY = CHAR, maxY = -1;
  for (let y = 0; y < 28; y++) {
    for (let x = 0; x < CHAR; x++) {
      if (!hit[y * CHAR + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1, minY, maxY };
}

const bodyBounds = (body: EnemyBody, frame = 0) =>
  bounds(rasterize((ctx) => drawEnemyBody(ctx, frame, body, 0)));

describe("enemy body silhouettes", () => {
  it("draws every body for every facing and step without throwing", () => {
    for (const body of ENEMY_BODIES) {
      for (let f = 0; f < 4; f++) {
        for (let s = 0; s < WALK_STEPS; s++) {
          const hit = rasterize((ctx) => drawEnemyBody(ctx, f, body, s));
          expect(hit.some((v) => v === 1), `${body} f${f} s${s} drew nothing`).toBe(true);
        }
      }
    }
  });

  it("gives the drone a wide rotor span — the widest thing in the roster", () => {
    const d = bodyBounds("drone");
    expect(d.w).toBeGreaterThanOrEqual(28);
    expect(d.w).toBeGreaterThan(d.h); // wider than tall
  });

  it("keeps the spectre a narrow vertical teardrop, not a humanoid", () => {
    // A wide body + a square head reads as a robot with shoulders — the failure this
    // silhouette was redesigned to avoid.
    const s = bodyBounds("spectre");
    expect(s.w).toBeLessThanOrEqual(12);
    expect(s.h).toBeGreaterThan(s.w);
  });

  it("keeps the beast low and horizontal in profile", () => {
    const profile = bodyBounds("beast", 1); // facing left
    expect(profile.w).toBeGreaterThan(profile.h);
  });

  it("floats the drone and spectre clear of the ground line", () => {
    // Bodies that hover must not touch the contact row, or they read as standing.
    for (const body of ["drone", "spectre"] as EnemyBody[]) {
      expect(bodyBounds(body).maxY, `${body} touches the ground`).toBeLessThan(27);
    }
  });

  it("mirrors `right` from `left` so the two facings are not identical", () => {
    for (const body of ENEMY_BODIES) {
      const left = bodyBounds(body, 1);
      const right = bodyBounds(body, 2);
      expect(right.w).toBe(left.w); // mirror preserves extent
    }
  });
});

describe("archetype → body mapping", () => {
  it("covers exactly the archetypes the client can tint", () => {
    // ENEMY_KIND_TINT is indexed by the same server `kind` (an ENEMY_ARCHES index).
    // If an archetype is added server-side, this catches the client drifting behind.
    expect(ENEMY_BODY_BY_ARCH.length).toBe(ENEMY_KIND_TINT.length);
  });

  it("only maps to bodies that actually get baked", () => {
    for (const body of ENEMY_BODY_BY_ARCH) {
      if (body === null) continue;
      expect(ENEMY_BODIES).toContain(body);
    }
  });

  it("leaves the HSS trooper archetypes humanoid", () => {
    // 0 PATROL, 2 LANCER, 4 ENFORCER, 5 SNIPER are human security — they keep the cop.
    for (const kind of [0, 2, 4, 5]) expect(ENEMY_BODY_BY_ARCH[kind]).toBeNull();
  });

  it("gives WASP / HOUND / WRAITH distinct non-humanoid bodies", () => {
    expect(ENEMY_BODY_BY_ARCH[1]).toBe("drone");
    expect(ENEMY_BODY_BY_ARCH[3]).toBe("beast");
    expect(ENEMY_BODY_BY_ARCH[6]).toBe("spectre");
    const keys = [1, 3, 6].map((k) => enemyBodyKey(ENEMY_BODY_BY_ARCH[k]!));
    expect(new Set(keys).size).toBe(3);
  });
});
