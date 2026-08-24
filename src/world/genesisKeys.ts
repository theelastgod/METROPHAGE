// GENESIS KEYS / GKEY — 50 Metaplex deeds for THE ESTATES.
// Token n (1–50) opens plot n-1 (zone est{n-1}). Names match marketing/false-addresses/catalog.json.
// Shared by client + Worker; no DOM.

export const GENESIS_COLLECTION_NAME = "GENESIS KEYS";
export const GENESIS_COLLECTION_SYMBOL = "GKEY";
export const GENESIS_KEY_COUNT = 50;

export interface GenesisKeyDef {
  token: number; // 1..50
  plot: number; // 0..49
  zone: string; // est{plot}
  name: string;
  image: string; // stills only in v1
}

/** False Address titles. Index 0 = token 1. Do not reorder — token ids are the deed. */
export const GENESIS_KEY_NAMES: readonly string[] = [
  "THE PAUSE",
  "STATIC ROW",
  "HOLLOW LISTING",
  "FALSE FORWARD",
  "REDACTED KEY",
  "ECHO TENEMENT",
  "SPARK GAP",
  "NIGHT SHADE",
  "QUIET TITLE",
  "DEAD DROP",
  "GLASS LEASE",
  "BLACKOUT WALK",
  "SIGNAL LOFT",
  "TOLL HOUSE",
  "MIRROR UNIT",
  "LAST STOP",
  "NEON DOCKET",
  "COLD STORAGE",
  "GHOST PAD",
  "WIRE NEST",
  "SALT BOX",
  "FAULT LINE",
  "DRIFT ANNEX",
  "VOID RENTAL",
  "PAPER STREET",
  "LOW POWER",
  "CUTOUT FLAT",
  "HEX DOOR",
  "RAIN CACHE",
  "BLANK PLATE",
  "AFTER HOURS",
  "GRID SHADOW",
  "SOFT LOCK",
  "BURN NOTICE",
  "IRON CURTAIN",
  "SIDE CHANNEL",
  "WETWARE ROW",
  "NULL FLOOR",
  "PROXY HOUSE",
  "DUSK LEDGER",
  "SPLIT FEED",
  "ASH TENURE",
  "TRACE END",
  "KITE WALK",
  "RELAY BUNK",
  "MASKED LOT",
  "UNDER SCAN",
  "CHROME DEED",
  "ZERO LOT",
  "LAST ADDRESS",
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function genesisKeyByToken(token: number): GenesisKeyDef | undefined {
  if (!Number.isInteger(token) || token < 1 || token > GENESIS_KEY_COUNT) return undefined;
  const plot = token - 1;
  return {
    token,
    plot,
    zone: `est${plot}`,
    name: GENESIS_KEY_NAMES[plot] ?? `KEY ${pad2(token)}`,
    image: `marketing/false-addresses/cards/genesis-key-${pad2(token)}.png`,
  };
}

export function genesisKeyByPlot(plot: number): GenesisKeyDef | undefined {
  if (!Number.isInteger(plot) || plot < 0 || plot >= GENESIS_KEY_COUNT) return undefined;
  return genesisKeyByToken(plot + 1);
}

export function tokenFromEstateId(id: string): number | null {
  const m = /^est(\d+)$/.exec(id);
  if (!m) return null;
  const plot = parseInt(m[1], 10);
  if (plot < 0 || plot >= GENESIS_KEY_COUNT) return null;
  return plot + 1;
}

export function allGenesisKeys(): GenesisKeyDef[] {
  const out: GenesisKeyDef[] = [];
  for (let t = 1; t <= GENESIS_KEY_COUNT; t++) out.push(genesisKeyByToken(t)!);
  return out;
}

export type EstateDeedKind = "unminted" | "in_game" | "off_world" | "marketplace";

/** On-chain NFT owner is the deed. D1 is furniture + listing price + a cache. */
export function classifyEstateDeed(args: {
  mint: string | null | undefined;
  chainOwner: string | null | undefined;
  treasury: string | null | undefined;
  /** Wallet pubkey for the D1 owner when they are `w:<base58>`. */
  ownerWallet: string | null | undefined;
  marketplace: boolean;
}): EstateDeedKind {
  const mint = (args.mint || "").trim();
  if (!mint) return "unminted";
  if (args.marketplace) return "marketplace";
  const chain = (args.chainOwner || "").trim();
  if (!chain) return "in_game";
  const treas = (args.treasury || "").trim();
  const owner = (args.ownerWallet || "").trim();
  // Case-sensitive base58 — never fold.
  if (treas && chain === treas) return "in_game";
  if (owner && chain === owner) return "in_game";
  return "off_world";
}

export function walletPubkeyFromPlayerId(id: string | null | undefined): string | null {
  const s = (id || "").trim();
  if (!s.startsWith("w:") || s.length < 35) return null;
  return s.slice(2);
}

export function genesisKeyLabel(token: number): string {
  const k = genesisKeyByToken(token);
  if (!k) return `KEY ${pad2(token)}`;
  return `${k.name} · KEY ${pad2(token)}`;
}
