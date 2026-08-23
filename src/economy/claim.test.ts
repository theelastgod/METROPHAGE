import { describe, expect, it } from "vitest";
import { submitClaim } from "./claim";

describe("submitClaim", () => {
  it("accepts Worker-broadcast solana-sent signatures", async () => {
    const r = await submitClaim("solana-sent:5abcSig");
    expect(r).toEqual({ ok: true, sig: "5abcSig" });
  });

  it("refuses a client-held signed payload", async () => {
    const r = await submitClaim("AQID");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Worker broadcasts/);
  });

  it("still accepts the sim harness prefix", async () => {
    const r = await submitClaim("devnet-sim-claim:x");
    expect(r.ok).toBe(true);
    expect(r.sig).toMatch(/^sim:/);
  });
});
