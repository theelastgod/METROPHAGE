import { describe, expect, it } from "vitest";
import { toBigIntBE, toBigIntLE, toBufferBE, toBufferLE } from "bigint-buffer";

describe("bounded bigint-buffer override", () => {
  it("preserves Solana layout conversions", () => {
    expect(toBufferBE(0x1234n, 2)).toEqual(Buffer.from([0x12, 0x34]));
    expect(toBufferLE(0x1234n, 2)).toEqual(Buffer.from([0x34, 0x12]));
    expect(toBigIntBE(Buffer.from([0x12, 0x34]))).toBe(0x1234n);
    expect(toBigIntLE(Buffer.from([0x34, 0x12]))).toBe(0x1234n);
  });

  it("rejects overflow instead of passing unsafe widths to native code", () => {
    expect(() => toBufferBE(0x1_0000n, 2)).toThrow(RangeError);
    expect(() => toBigIntLE(Buffer.alloc(1_048_577))).toThrow(RangeError);
  });
});
