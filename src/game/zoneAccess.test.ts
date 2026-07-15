import { describe, it, expect } from "vitest";
import { zoneAccess, zoneNeedsWarning, zoneWarning, openDistricts } from "./zoneAccess";
import { DISTRICT_PROGRESSION } from "./progression";
import { QUESTS, hasFlagFromCompleted, questSettingFlag } from "./quests";

/** Every act completed up to (not including) `stop`, in questline order. */
function completedThrough(...ids: string[]): string[] {
  return ids;
}

const FRESH = { completed: [] as string[], level: 1 };

describe("hasFlagFromCompleted", () => {
  it("reads a flag off the quest that sets it", () => {
    expect(hasFlagFromCompleted("wake_done", ["the_wake"])).toBe(true);
    expect(hasFlagFromCompleted("wake_done", [])).toBe(false);
  });

  it("treats a flag no quest sets as held, so edge data can't lock content", () => {
    expect(questSettingFlag("no_such_flag")).toBeUndefined();
    expect(hasFlagFromCompleted("no_such_flag", [])).toBe(true);
  });
});

describe("zoneAccess — story gating", () => {
  it("opens d0 to a brand-new runner", () => {
    const a = zoneAccess("d0", FRESH);
    expect(a.story).toBe("open");
    expect(a.actId).toBe("the_wake");
    expect(a.requiredQuestId).toBeNull();
  });

  it("holds every later district ahead of a fresh runner", () => {
    for (let i = 1; i < DISTRICT_PROGRESSION.length; i++) {
      expect(zoneAccess(`d${i}`, FRESH).story).toBe("ahead");
    }
  });

  it("names the act that must come first", () => {
    const a = zoneAccess("d7", FRESH);
    expect(a.actId).toBe("continue_q");
    expect(a.requiredQuestId).toBe("wastes_purge");
    expect(a.requiredQuestName).toBe("OUTER RING");
  });

  // The ladder the player actually walks. Pinned so reordering the questline
  // or the district table fails here rather than silently in the live world.
  const LADDER: Array<[string, string | null]> = [
    ["d0", null],
    ["d1", "homestead"],
    ["d2", "dead_reckoning"],
    ["d3", "spire_protocol"],
    ["d4", "dock_run"],
    ["d5", "undercity_echo"],
    ["d6", "relay_break"],
    ["d7", "wastes_purge"],
  ];

  it.each(LADDER)("%s unlocks after %s", (zone, prereq) => {
    expect(zoneAccess(zone, FRESH).requiredQuestId).toBe(prereq);
  });

  it("opens a district once its prerequisite act is completed", () => {
    for (const [zone, prereq] of LADDER) {
      if (!prereq) continue;
      const standing = { completed: completedThrough(prereq), level: 1 };
      expect(zoneAccess(zone, standing).story).toBe("open");
    }
  });

  it("walks the frontier forward one act at a time", () => {
    expect(openDistricts(FRESH)).toEqual([0]);
    expect(openDistricts({ completed: ["homestead"], level: 1 })).toEqual([0, 1]);
    expect(openDistricts({ completed: ["homestead", "dead_reckoning"], level: 1 })).toEqual([0, 1, 2]);
  });

  it("opens the whole city once every act is done", () => {
    const all = QUESTS.map((q) => q.id);
    expect(openDistricts({ completed: all, level: 40 })).toEqual(
      DISTRICT_PROGRESSION.map((p) => p.district),
    );
  });

  it("ignores side quests when opening districts", () => {
    // STREET DEBTS chain sets flags, but gates no district.
    const side = { completed: ["street_debts", "node_war", "ghost_sheet"], level: 1 };
    expect(openDistricts(side)).toEqual([0]);
  });
});

describe("zoneAccess — non-combat zones", () => {
  it.each(["safe", "subway", "clinic", "shop", "bar", "den", "estates"])(
    "leaves %s open and unscaled",
    (zone) => {
      const a = zoneAccess(zone, FRESH);
      expect(a.story).toBe("open");
      expect(a.district).toBeNull();
      expect(a.recLevel).toBeNull();
      expect(zoneNeedsWarning(a)).toBe(false);
    },
  );
});

describe("zoneAccess — wilderness cuts", () => {
  it("belongs to the district behind it, so the earned frontier stays roamable", () => {
    // w0 sits between d0 and d1; clearing nothing still leaves it open like d0.
    expect(zoneAccess("w0", FRESH).story).toBe("open");
    expect(zoneAccess("w0", FRESH).district).toBe(0);
  });

  it("blends its level band toward the harder end", () => {
    const w0 = zoneAccess("w0", FRESH);
    const d0 = zoneAccess("d0", FRESH);
    const d1 = zoneAccess("d1", FRESH);
    expect(w0.recLevel).toEqual([d0.recLevel![0], d1.recLevel![1]]);
  });

  it("holds a deep cut ahead of story like the district behind it", () => {
    expect(zoneAccess("w5", FRESH).story).toBe("ahead");
  });
});

describe("level advisory", () => {
  it("never gates on its own — story open plus low level is still open", () => {
    const a = zoneAccess("d0", { completed: [], level: 1 });
    expect(a.story).toBe("open");
  });

  it("reports the gap below the recommended band", () => {
    const a = zoneAccess("d7", { completed: QUESTS.map((q) => q.id), level: 10 });
    expect(a.recLevel![0]).toBe(22);
    expect(a.levelGap).toBe(12);
    expect(zoneNeedsWarning(a)).toBe(true);
    expect(zoneWarning(a)).toContain("LV 22–32");
    expect(zoneWarning(a)).toContain("You are LV 10");
  });

  it("goes quiet once the player is in band", () => {
    const a = zoneAccess("d7", { completed: QUESTS.map((q) => q.id), level: 25 });
    expect(a.levelGap).toBe(0);
    expect(zoneNeedsWarning(a)).toBe(false);
    expect(zoneWarning(a)).toBeNull();
  });

  it("leads with story over level when both apply", () => {
    const a = zoneAccess("d7", FRESH);
    expect(a.story).toBe("ahead");
    expect(a.levelGap).toBeGreaterThan(0);
    expect(zoneWarning(a)).toContain("OUTER RING");
  });
});

describe("data integrity", () => {
  it("maps every district to a real act", () => {
    for (const p of DISTRICT_PROGRESSION) {
      expect(QUESTS.find((q) => q.id === p.campaignQuest), `d${p.district} → ${p.campaignQuest}`).toBeDefined();
    }
  });

  it("resolves a prerequisite act for every gated district", () => {
    for (const p of DISTRICT_PROGRESSION) {
      const a = zoneAccess(`d${p.district}`, FRESH);
      if (a.story === "ahead") expect(a.requiredQuestId, `d${p.district}`).toBeTruthy();
    }
  });

  it("never leaves a district permanently unreachable", () => {
    const all = QUESTS.map((q) => q.id);
    for (const p of DISTRICT_PROGRESSION) {
      expect(zoneAccess(`d${p.district}`, { completed: all, level: 40 }).story).toBe("open");
    }
  });
});
