import { describe, expect, it } from "vitest";
import {
  isSolanaPubkey,
  parseSolanaCluster,
  shortSolanaAddress,
  solanaChromeLabel,
  solanaExplorerTx,
  SOLANA_DEVNET,
} from "./solanaChain";

describe("Solana address + chrome", () => {
  const operator = "9Z9uZJXdnyTE7gkFfrepJ3BWDTNA3ZeteDkpgT6cxkve";

  it("accepts a 32-byte base58 pubkey and rejects 0x", () => {
    expect(isSolanaPubkey(operator)).toBe(true);
    expect(isSolanaPubkey("11111111111111111111111111111111")).toBe(true);
    expect(isSolanaPubkey("0x7bf8195c181fbb74d10aed7035c26eca18ea726d")).toBe(false);
    expect(isSolanaPubkey("w:" + operator)).toBe(false);
    expect(isSolanaPubkey("not-a-wallet")).toBe(false);
  });

  it("shortens live addresses as 4…4 and hides 0x", () => {
    expect(shortSolanaAddress(operator)).toBe("9Z9u…xkve");
    expect(shortSolanaAddress("w:" + operator)).toBe("9Z9u…xkve");
    expect(shortSolanaAddress("0x7bf8195c181fbb74d10aed7035c26eca18ea726d")).toBe("");
  });

  it("labels identity chrome as SOL · DEVNET|MAINNET", () => {
    expect(parseSolanaCluster("robinhood")).toBe("mainnet-beta");
    expect(parseSolanaCluster("robinhood-testnet")).toBe("devnet");
    expect(parseSolanaCluster("")).toBe("mainnet-beta");
    expect(parseSolanaCluster("mainnet-beta")).toBe("mainnet-beta");
    expect(solanaChromeLabel("devnet")).toBe("SOL · DEVNET");
    expect(solanaChromeLabel("mainnet-beta")).toBe("SOL · MAINNET");
  });

  it("builds explorer tx links with the cluster query", () => {
    expect(solanaExplorerTx(SOLANA_DEVNET, "Sig111")).toBe(
      "https://explorer.solana.com/tx/Sig111?cluster=devnet",
    );
  });
});
