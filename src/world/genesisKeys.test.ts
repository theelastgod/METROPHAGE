import { describe, expect, it } from "vitest";
import {
  allGenesisKeys,
  classifyEstateDeed,
  GENESIS_COLLECTION_SYMBOL,
  GENESIS_KEY_COUNT,
  GENESIS_KEY_NAMES,
  genesisKeyByPlot,
  genesisKeyByToken,
  tokenFromEstateId,
  walletPubkeyFromPlayerId,
} from "./genesisKeys";

describe("Genesis Keys catalog", () => {
  it("maps token n to plot n-1 / est{n-1} for all 50 keys", () => {
    expect(GENESIS_KEY_NAMES).toHaveLength(GENESIS_KEY_COUNT);
    expect(GENESIS_COLLECTION_SYMBOL).toBe("GKEY");
    const keys = allGenesisKeys();
    expect(keys).toHaveLength(50);
    expect(keys[0]).toMatchObject({ token: 1, plot: 0, zone: "est0", name: "THE PAUSE" });
    expect(keys[49]).toMatchObject({ token: 50, plot: 49, zone: "est49" });
    expect(new Set(keys.map((k) => k.name)).size).toBe(50);
    expect(genesisKeyByPlot(0)?.token).toBe(1);
    expect(genesisKeyByToken(12)?.zone).toBe("est11");
    expect(tokenFromEstateId("est0")).toBe(1);
    expect(tokenFromEstateId("est49")).toBe(50);
    expect(tokenFromEstateId("est50")).toBeNull();
  });

  it("classifies treasury / owner as in-game and foreign wallets as off-world", () => {
    const treasury = "9Z9uZJXdnyTE7gkFfrepJ3BWDTNA3ZeteDkpgT6cxkve";
    const player = "So11111111111111111111111111111111111111112";
    const mint = "11111111111111111111111111111111";
    expect(classifyEstateDeed({ mint, chainOwner: treasury, treasury, ownerWallet: player, marketplace: false })).toBe("in_game");
    expect(classifyEstateDeed({ mint, chainOwner: player, treasury, ownerWallet: player, marketplace: false })).toBe("in_game");
    expect(classifyEstateDeed({ mint, chainOwner: player, treasury, ownerWallet: "other", marketplace: false })).toBe("off_world");
    expect(classifyEstateDeed({ mint, chainOwner: player, treasury, ownerWallet: player, marketplace: true })).toBe("marketplace");
    expect(classifyEstateDeed({ mint: null, chainOwner: null, treasury, ownerWallet: player, marketplace: false })).toBe("unminted");
    expect(walletPubkeyFromPlayerId(`w:${player}`)).toBe(player);
    expect(walletPubkeyFromPlayerId("g:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBeNull();
  });
});
