import { describe, expect, it } from "vitest";
import {
  CIVIC_ARCHIVES,
  civicArchiveContactLine,
  civicArchivePageKey,
  civicArchiveRecord,
  civicArchiveSnapshot,
  civicArchiveSynthesis,
} from "./civicArchives";

describe("recoverable civic archive", () => {
  it("has three complete four-page ledgers", () => {
    expect(CIVIC_ARCHIVES).toHaveLength(3);
    expect(CIVIC_ARCHIVES.every((records) => records.length === 4)).toBe(true);
    expect(new Set(CIVIC_ARCHIVES.flat().map((record) => record.title)).size).toBe(12);
  });

  it("bounds durable page counters", () => {
    expect(civicArchiveSnapshot({ archive_terminal_0_pages: 99, archive_terminal_1_pages: -2, archive_terminal_2_pages: 2.9 })).toEqual([4, 0, 2]);
    expect(civicArchivePageKey(2)).toBe("archive_terminal_2_pages");
    expect(civicArchiveRecord(1, 3)?.title).toBe("LAST PUBLIC TRAIN");
    expect(civicArchiveRecord(7, 0)).toBeNull();
  });

  it("synthesizes progress and contact recognition", () => {
    expect(civicArchiveSynthesis([0, 0, 0])).toContain("SEALED");
    expect(civicArchiveSynthesis([4, 4, 4])).toContain("COMMON RECORD");
    expect(civicArchiveContactLine("doc", [2, 1, 0])).toContain("Violet ink");
    expect(civicArchiveContactLine("rin", [0, 0, 3])).toContain("manifests");
  });
});
