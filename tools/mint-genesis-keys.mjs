#!/usr/bin/env node
/**
 * Ops: pre-mint 50 GENESIS KEYS (GKEY) to the treasury. Token n → plot n-1 → est{n-1}.
 * Stills: marketing/false-addresses/cards/genesis-key-NN.png (animation_url later).
 *
 *   METRO_RPC=https://api.devnet.solana.com \
 *   METRO_TREASURY_SECRET=<base64 64-byte keypair> \
 *   METADATA_URI_BASE=https://…/false-addresses/metadata/ \
 *     node tools/mint-genesis-keys.mjs
 *
 * Writes marketing/false-addresses/mints.json and SQL to stamp estates.nft.
 * Does not run inside the Worker — Metaplex create is a one-shot CLI.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, AuthorityType, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, ComputeBudgetProgram } from "@solana/web3.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(root, "marketing/false-addresses/catalog.json");
const outPath = join(root, "marketing/false-addresses/mints.json");
const metaDir = join(root, "marketing/false-addresses/metadata");

const TOKEN_METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

function b64ToBytes(b64) {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

function u32le(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}
function u16le(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n & 0xffff, 0);
  return b;
}
function borshString(s) {
  const buf = Buffer.from(s, "utf8");
  return Buffer.concat([u32le(buf.length), buf]);
}
function pubkeyBytes(pk) {
  return Buffer.from(pk.toBytes());
}

/** CreateMetadataAccountV3 — 0% royalties, immutable. */
function createMetadataV3Ix(payer, mint, updateAuthority, name, symbol, uri, collectionMint, isCollection) {
  const metadata = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM,
  )[0];
  const data = [
    Buffer.from([33]), // CreateMetadataAccountV3
    borshString(name.slice(0, 32)),
    borshString(symbol.slice(0, 10)),
    borshString(uri.slice(0, 200)),
    u16le(0), // seller fee
    Buffer.from([1]), // some creators
    u32le(1),
    pubkeyBytes(updateAuthority),
    Buffer.from([1]), // verified
    Buffer.from([100]), // share
    collectionMint
      ? Buffer.concat([Buffer.from([1]), Buffer.from([0]), pubkeyBytes(collectionMint)])
      : Buffer.from([0]),
    Buffer.from([0]), // uses none
    Buffer.from([0]), // isMutable = false
    isCollection
      ? Buffer.concat([Buffer.from([1]), Buffer.from([0]), Buffer.alloc(8)]) // Some(V1 { size: 0 }) — sized collection
      : Buffer.from([0]),
  ];
  if (isCollection) data[data.length - 1].writeBigUInt64LE(50n, 1);
  return {
    metadata,
    keys: [
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: updateAuthority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: TOKEN_METADATA_PROGRAM,
    data: Buffer.concat(data),
  };
}

function createMasterEditionV3Ix(payer, mint, updateAuthority, metadata) {
  const edition = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM.toBuffer(), mint.toBuffer(), Buffer.from("edition")],
    TOKEN_METADATA_PROGRAM,
  )[0];
  return {
    keys: [
      { pubkey: edition, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: updateAuthority, isSigner: true, isWritable: false },
      { pubkey: updateAuthority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: TOKEN_METADATA_PROGRAM,
    data: Buffer.from([17, 1, 0, 0, 0, 0, 0, 0, 0, 0]), // CreateMasterEditionV3, Some(maxSupply=0)
  };
}

const dry = process.argv.includes("--dry-run");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
if (!catalog?.tokens || catalog.tokens.length !== 50) {
  console.error("catalog.json must list 50 tokens");
  process.exit(1);
}

mkdirSync(metaDir, { recursive: true });
const uriBase = (process.env.METADATA_URI_BASE || "https://metrophagev1.pages.dev/false-addresses/metadata/").replace(/\/?$/, "/");
for (const t of catalog.tokens) {
  const nn = String(t.token).padStart(2, "0");
  const json = {
    name: t.name,
    symbol: catalog.collection.symbol,
    description: `Genesis Key ${nn} — deed to ${t.zone} (${t.name}). Holding this NFT is owning the False Address.`,
    image: `${uriBase.replace(/metadata\/$/, "")}cards/genesis-key-${nn}.png`,
    animation_url: undefined,
    external_url: "https://metrophagev1.pages.dev",
    attributes: [
      { trait_type: "token", value: t.token },
      { trait_type: "plot", value: t.plot },
      { trait_type: "zone", value: t.zone },
    ],
    properties: { files: [{ uri: `genesis-key-${nn}.png`, type: "image/png" }], category: "image" },
  };
  writeFileSync(join(metaDir, `${nn}.json`), JSON.stringify(json, null, 2));
}

if (dry) {
  console.log(`Wrote ${catalog.tokens.length} metadata JSON files to ${metaDir} (--dry-run, no chain)`);
  process.exit(0);
}

const secret = process.env.METRO_TREASURY_SECRET || "";
if (!secret) {
  console.error("METRO_TREASURY_SECRET (base64 64-byte keypair) required unless --dry-run");
  process.exit(1);
}
const rpc = process.env.METRO_RPC || "https://api.devnet.solana.com";
const conn = new Connection(rpc, "confirmed");
const treasury = Keypair.fromSecretKey(b64ToBytes(secret));
console.log(`Treasury ${treasury.publicKey.toBase58()}  rpc=${rpc}`);

async function mintOne(name, symbol, uri, collectionMint, isCollection) {
  const mint = await createMint(conn, treasury, treasury.publicKey, treasury.publicKey, 0);
  const ata = await getOrCreateAssociatedTokenAccount(conn, treasury, mint, treasury.publicKey);
  await mintTo(conn, treasury, mint, ata.address, treasury, 1);
  await setAuthority(conn, treasury, mint, treasury.publicKey, AuthorityType.MintTokens, null);
  const mdIx = createMetadataV3Ix(treasury.publicKey, mint, treasury.publicKey, name, symbol, uri, collectionMint, isCollection);
  const edIx = createMasterEditionV3Ix(treasury.publicKey, mint, treasury.publicKey, mdIx.metadata);
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    { keys: mdIx.keys, programId: mdIx.programId, data: mdIx.data },
    { keys: edIx.keys, programId: edIx.programId, data: edIx.data },
  );
  try {
    await sendAndConfirmTransaction(conn, tx, [treasury], { commitment: "confirmed" });
  } catch (e) {
    console.warn(`metadata ix failed for ${name}: ${(e && e.message) || e} — SPL 1/1 still minted to treasury`);
  }
  return mint.toBase58();
}

const collectionUri = `${uriBase}collection.json`;
writeFileSync(
  join(metaDir, "collection.json"),
  JSON.stringify(
    {
      name: catalog.collection.name,
      symbol: catalog.collection.symbol,
      description: catalog.collection.description,
      seller_fee_basis_points: 0,
      image: `${uriBase.replace(/metadata\/$/, "")}cards/genesis-keys-sheet.png`,
    },
    null,
    2,
  ),
);

console.log("Minting collection NFT…");
const collectionMint = await mintOne(catalog.collection.name, catalog.collection.symbol, collectionUri, null, true);
const tokens = [];
for (const t of catalog.tokens) {
  const nn = String(t.token).padStart(2, "0");
  const uri = `${uriBase}${nn}.json`;
  process.stdout.write(`  token ${nn} ${t.name}… `);
  const mint = await mintOne(t.name, catalog.collection.symbol, uri, new PublicKey(collectionMint), false);
  console.log(mint);
  tokens.push({ ...t, mint });
}

const payload = {
  cluster: rpc,
  collection: { name: catalog.collection.name, symbol: catalog.collection.symbol, mint: collectionMint },
  treasury: treasury.publicKey.toBase58(),
  tokens,
  mintedAt: Date.now(),
};
writeFileSync(outPath, JSON.stringify(payload, null, 2));
const sqlLines = tokens.map((t) => `UPDATE estates SET nft = '${t.mint}', token = ${t.token} WHERE id = '${t.zone}';`);
writeFileSync(join(root, "marketing/false-addresses/stamp-estates.sql"), sqlLines.join("\n") + "\n");
console.log(`Wrote ${outPath}`);
console.log("Stamp D1 with marketing/false-addresses/stamp-estates.sql (wrangler d1 execute).");
