import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetThirdHourForTests,
  noteThirdWarCapture,
  noteThirdCellDeposit,
  noteThirdMarketList,
  noteThirdHomeVisit,
  thirdHourLine,
} from "./thirdHour";

beforeEach(() => {
  __resetThirdHourForTests();
});

describe("thirdHour", () => {
  it("null until prior done", () => {
    expect(thirdHourLine(false)).toBeNull();
  });

  it("walks through mid-game beats", () => {
    expect(thirdHourLine(true)).toMatch(/WAR|war|node/i);
    noteThirdWarCapture();
    expect(thirdHourLine(true)).toMatch(/Cell|deposit/i);
    noteThirdCellDeposit();
    expect(thirdHourLine(true)).toMatch(/Market/i);
    noteThirdMarketList();
    expect(thirdHourLine(true)).toMatch(/estate|ESTATES|guestbook/i);
    noteThirdHomeVisit();
    expect(thirdHourLine(true)).toBeNull();
  });
});
