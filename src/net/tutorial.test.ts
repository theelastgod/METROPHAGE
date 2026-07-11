import { describe, expect, it } from "vitest";
import {
  TUTORIAL_STEPS_FULL,
  TUTORIAL_STEPS_QUICK,
  isTutorialTalkKind,
  tutorialReadyForPortal,
  tutorialStepAt,
  tutorialTotal,
} from "./tutorial";

describe("tutorial curricula", () => {
  it("quick drill teaches kit before first blood", () => {
    const kinds = TUTORIAL_STEPS_QUICK.map((s) => s.kind);
    expect(kinds.indexOf("kit")).toBeLessThan(kinds.indexOf("kill"));
    expect(kinds[0]).toBe("move");
    expect(kinds[kinds.length - 1]).toBe("portal");
    expect(kinds).toContain("chat");
    expect(kinds).toContain("panel");
  });

  it("full training has unique steps, core lessons, and a short systems tour", () => {
    const kinds = TUTORIAL_STEPS_FULL.map((s) => s.kind);
    expect(new Set(kinds).size).toBe(kinds.length); // no duplicates (was broken: double capture)
    for (const need of ["move", "fire", "kit", "kill", "pickup", "capture", "equip", "chat", "panel", "portal"] as const) {
      expect(kinds).toContain(need);
    }
    expect(kinds.indexOf("kit")).toBeLessThan(kinds.indexOf("kill"));
    expect(kinds.indexOf("chat")).toBeLessThan(kinds.indexOf("faction"));
    expect(kinds[kinds.length - 1]).toBe("portal");
    // Playable length — not 23 one-panel stops
    expect(TUTORIAL_STEPS_FULL.length).toBeLessThanOrEqual(16);
    const systems = TUTORIAL_STEPS_FULL.find((s) => s.kind === "panel")!;
    expect(systems.count).toBe(3);
  });

  it("weapon practice is short (3 swings) so the yard stays snappy", () => {
    const fire = TUTORIAL_STEPS_QUICK.find((s) => s.kind === "fire")!;
    expect(fire.count).toBe(3);
  });

  it("instructor talk clears main-path lessons so runners never soft-lock between trainers", () => {
    expect(isTutorialTalkKind("faction")).toBe(true);
    expect(isTutorialTalkKind("campaign")).toBe(true);
    expect(isTutorialTalkKind("move")).toBe(true);
    expect(isTutorialTalkKind("kill")).toBe(true);
    expect(isTutorialTalkKind("chat")).toBe(true);
    // craft is systems-court action-only (no dedicated quick-path instructor)
    expect(isTutorialTalkKind("craft")).toBe(false);
  });

  it("portal gate opens on the final step in both modes", () => {
    for (const mode of ["quick", "full"] as const) {
      const last = tutorialTotal(mode) - 1;
      expect(tutorialReadyForPortal(last, mode)).toBe(true);
      expect(tutorialReadyForPortal(last - 1, mode)).toBe(false);
      expect(tutorialStepAt(last, mode)?.kind).toBe("portal");
    }
  });
});
