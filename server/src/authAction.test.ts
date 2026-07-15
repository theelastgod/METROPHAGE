import { describe, it, expect } from "vitest";
import { Wallet } from "ethers";
import { verifyWalletLogin, verifyWalletRetire } from "./auth";
import { loginMessage, retireMessage } from "../../src/net/protocol";

// A real signer — these are genuine secp256k1 signatures, not stubs.
const signer = Wallet.createRandom();
const ADDR = signer.address;

async function proofOver(text: string, ts: number) {
  return { wallet: ADDR, sig: await signer.signMessage(text), ts };
}

describe("wallet action scoping", () => {
  const now = Date.now();

  it("accepts a login signature for login", async () => {
    const p = await proofOver(loginMessage(ADDR, now), now);
    expect(verifyWalletLogin(p, now)).toBe("w:" + ADDR);
  });

  it("accepts a retire signature for retire", async () => {
    const p = await proofOver(retireMessage(ADDR, now), now);
    expect(verifyWalletRetire(p, now)).toBe("w:" + ADDR);
  });

  /**
   * The whole point. A login proof is reusable by design (~90s of zone hops) and
   * has ridden in URL query strings, so it lands in access logs. If retire took
   * one, anyone reading a log line inside the 2-minute freshness window could
   * permanently purge that player.
   */
  it("REFUSES to retire on a login signature", async () => {
    const login = await proofOver(loginMessage(ADDR, now), now);
    expect(verifyWalletLogin(login, now)).toBe("w:" + ADDR); // valid for login...
    expect(verifyWalletRetire(login, now)).toBeNull(); // ...but cannot destroy
  });

  it("does not let a retire signature act as a login", async () => {
    const retire = await proofOver(retireMessage(ADDR, now), now);
    expect(verifyWalletLogin(retire, now)).toBeNull();
  });

  it("still enforces freshness on the retire intent", async () => {
    const stale = now - 10 * 60_000;
    const p = await proofOver(retireMessage(ADDR, stale), stale);
    expect(verifyWalletRetire(p, now)).toBeNull();
  });

  it("rejects a retire signature from a different wallet", async () => {
    const other = Wallet.createRandom();
    const p = { wallet: other.address, sig: await signer.signMessage(retireMessage(other.address, now)), ts: now };
    expect(verifyWalletRetire(p, now)).toBeNull();
  });

  it("rejects junk without throwing", () => {
    for (const bad of [
      { wallet: "", sig: "", ts: now },
      { wallet: ADDR, sig: "0xdead", ts: now },
      { wallet: ADDR, sig: "", ts: NaN },
    ]) {
      expect(verifyWalletRetire(bad, now)).toBeNull();
      expect(verifyWalletLogin(bad, now)).toBeNull();
    }
  });

  it("the two messages are genuinely different text", () => {
    expect(retireMessage(ADDR, now)).not.toBe(loginMessage(ADDR, now));
    // The signer must be shown what they are actually approving.
    expect(retireMessage(ADDR, now).toLowerCase()).toContain("permanently delete");
  });
});
