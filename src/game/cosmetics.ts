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
  provenance: string;
  streetRead: readonly [string, string, string];
}

export const COSMETICS: Cosmetic[] = [
  { id: "ghost_visor", name: "GHOST VISOR", desc: "Spectral cyan optics", price: 300, swatch: 0x29e7ff, look: { visor: "scan", color: 0x29e7ff }, provenance: "Cut from deleted subway-inspector optics that still highlight unpaid workers.", streetRead: ["That visor keeps tracing station doors the surface bricked over.", "Inspector optics used to find fare evaders. Yours keeps finding erased payroll instead.", "The cyan flicker is a dead line map. Hollow says it brightens whenever a station voice recognizes you."] },
  { id: "void_cloak", name: "VOID CLOAK", desc: "A cloak that drinks the light", price: 500, swatch: 0x6b3df5, look: { cloak: "cape", color: 0x6b3df5 }, provenance: "Stitched from orbital heat baffles smuggled down after a denial strike.", streetRead: ["That cloak has relay-burn along the hem. It fell farther than most people travel.", "Orbital baffle cloth hides heat because Helios once used it to hide weapons. Nice reversal.", "Static logged the serial under that seam: the same denial platform that killed an Awakening broadcast."] },
  { id: "warlord", name: "WARLORD PLATE", desc: "Spiked pauldrons, skull mark", price: 900, swatch: 0xff3b3b, look: { shoulders: "spikes", decal: "skull", color: 0xff3b3b }, provenance: "Anduril strike-command plate repainted by workers who survived its first deployment.", streetRead: ["Those shoulders used to enter a room before an Anduril foreman did.", "The skull mark is union paint over a strike-command serial. The factory remembers both layers.", "Raze knows who wore that plate on Strike Day. The workers spared them, stripped the rank, and kept the armor as testimony."] },
  { id: "chrome_synth", name: "CHROME LINES", desc: "Mirror-polished facial chrome", price: 700, swatch: 0xcfe8ff, look: { skin: 0xf3d2b8, faceMark: "chrome", color: 0xcfe8ff }, provenance: "Argus servant-mirror filaments rewired to reflect the wearer's chosen face.", streetRead: ["Argus chrome usually tells servants which expression to wear. Yours is not listening.", "Those lines came from a compliance mirror. Keeping your own face in them is a small sabotage.", "Glass says the filament remembers every face REISSUE ordered it to correct. It reflects yours without asking permission."] },
  { id: "gilded", name: "GILDED CROWN", desc: "Worn by those who hold the deepest ground", price: 1500, swatch: 0xf7ff3c, look: { head: "crown", emblem: true, color: 0xf7ff3c }, provenance: "A relay-node keeper's maintenance halo, mistaken for royalty by surface cameras.", streetRead: ["Surface cameras call that a crown. Tunnel crews call it a maintenance halo.", "Node keepers wore those points so crews could find them during blackouts, not so anyone would kneel.", "The gold is conductive dust from seven reclaimed relays. Every point marks a signal somebody kept public."] },
  { id: "genesis", name: "GENESIS // NFT", desc: "On-chain founder skin — mainnet-gated", price: 0, nft: true, swatch: 0xff2bd6, look: { head: "crown", cloak: "cape", decal: "skull", color: 0xff2bd6, emblem: true, skin: 0xe6b58c, hair: "long", hairColor: 0x1b1820 }, provenance: "A founder-era identity proof whose public chain outlived the registry that issued it.", streetRead: ["That founder mark survives in a ledger even Helios cannot quietly edit.", "On-chain permanence is not freedom, but it makes disappearance expensive for whoever wants your history gone.", "Quill found the issuing registry in an earlier cycle. Your proof survived its government, its corporation, and at least one version of this city."] },
];

const BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));
export function getCosmetic(id: string): Cosmetic | undefined {
  return BY_ID.get(id);
}

export function cosmeticAcknowledgement(id: string | null | undefined, trust: number): string | null {
  if (!id || trust < 1) return null;
  const cosmetic = BY_ID.get(id);
  if (!cosmetic) return null;
  const tier = Math.max(1, Math.min(3, Math.floor(trust))) - 1;
  return cosmetic.streetRead[tier];
}

/** Merge a cosmetic's override onto a base look (cosmetic fields win). No-op if none equipped. */
export function applyCosmetic(base: PlayerLook | undefined, id: string | null | undefined): PlayerLook | undefined {
  if (!base || !id) return base;
  const c = BY_ID.get(id);
  return c ? { ...base, ...c.look } : base;
}
