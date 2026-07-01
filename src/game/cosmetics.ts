// METROPHAGE — cosmetics / transmog: pure-data catalog, Phaser-FREE, shared by server
// (authoritative ownership + equip) and client (wardrobe + local avatar). A cosmetic ONLY
// overrides PlayerLook fields — it has ZERO power effect, so balance stays clean. Cosmetics
// are owned per identity (wallet account); NFT-tier skins are gated behind the SAME
// METRO_MAINNET_ARMED + counsel constraint as the rest of the $METRO bridge (off by default).

import type { PlayerLook } from "../net/protocol";

export interface Cosmetic {
  id: string;
  name: string;
  desc: string;
  price: number; // credits cost (0 = not credit-buyable)
  nft?: boolean; // on-chain NFT skin — acquirable only when the $METRO mainnet bridge is ARMED
  swatch: number; // panel accent colour
  look: Partial<PlayerLook>; // the appearance override (look fields ONLY — never stats)
}

export const COSMETICS: Cosmetic[] = [
  { id: "ghost_visor", name: "GHOST VISOR", desc: "Spectral cyan optics", price: 300, swatch: 0x29e7ff, look: { visor: "scan", color: 0x29e7ff } },
  { id: "void_cloak", name: "VOID CLOAK", desc: "A cloak that drinks the light", price: 500, swatch: 0x6b3df5, look: { cloak: "cape", color: 0x6b3df5 } },
  { id: "warlord", name: "WARLORD PLATE", desc: "Spiked pauldrons, skull mark", price: 900, swatch: 0xff3b3b, look: { shoulders: "spikes", decal: "skull", color: 0xff3b3b } },
  { id: "chrome_synth", name: "CHROME LINES", desc: "Mirror-polished facial chrome", price: 700, swatch: 0xcfe8ff, look: { skin: 0xf3d2b8, faceMark: "chrome", color: 0xcfe8ff } },
  { id: "gilded", name: "GILDED CROWN", desc: "Worn by those who hold the deepest ground", price: 1500, swatch: 0xf7ff3c, look: { head: "crown", emblem: true, color: 0xf7ff3c } },
  { id: "genesis", name: "GENESIS // NFT", desc: "On-chain founder skin — mainnet-gated", price: 0, nft: true, swatch: 0xff2bd6, look: { head: "crown", cloak: "cape", decal: "skull", color: 0xff2bd6, emblem: true, skin: 0xe6b58c, hair: "long", hairColor: 0x1b1820 } },
];

const BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));
export function getCosmetic(id: string): Cosmetic | undefined {
  return BY_ID.get(id);
}

/** Merge a cosmetic's override onto a base look (cosmetic fields win). No-op if none equipped. */
export function applyCosmetic(base: PlayerLook | undefined, id: string | null | undefined): PlayerLook | undefined {
  if (!base || !id) return base;
  const c = BY_ID.get(id);
  return c ? { ...base, ...c.look } : base;
}
