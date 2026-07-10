#!/usr/bin/env node
// Deploy a fixed-supply $METRO ERC-20 on Robinhood Chain (testnet default).
//
// Requires: Node 18+, private key with RH testnet ETH for gas.
//
//   RH_DEPLOY_KEY=0x… node server/scripts/deploy-metro-erc20.mjs
//   RH_CHAIN=mainnet RH_DEPLOY_KEY=0x… node server/scripts/deploy-metro-erc20.mjs
//
// Uses only public RPC + raw eth_sendTransaction via ethers (server dep).

import { Wallet, ContractFactory, JsonRpcProvider, parseUnits } from "ethers";

const CHAIN = (process.env.RH_CHAIN || "testnet").toLowerCase();
const isMain = CHAIN === "mainnet" || CHAIN === "4663";
const RPC = process.env.RH_RPC || (isMain ? "https://rpc.mainnet.chain.robinhood.com" : "https://rpc.testnet.chain.robinhood.com");
const CHAIN_ID = isMain ? 4663 : 46630;
const KEY = process.env.RH_DEPLOY_KEY || process.env.METRO_TREASURY_SECRET;
const SUPPLY = process.env.METRO_SUPPLY || "1000000000"; // 1B human units
const DECIMALS = Number(process.env.METRO_DECIMALS || "18");
const NAME = process.env.METRO_NAME || "METROPHAGE";
const SYMBOL = process.env.METRO_SYMBOL || "METRO";

// Minimal fixed-supply ERC-20 (OpenZeppelin-style flattened, mint only in constructor).
const SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract MetroToken {
  string public name;
  string public symbol;
  uint8 public immutable decimals;
  uint256 public totalSupply;
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;
  event Transfer(address indexed from, address indexed to, uint256 value);
  event Approval(address indexed owner, address indexed spender, uint256 value);
  constructor(string memory n, string memory s, uint8 d, uint256 supply) {
    name = n; symbol = s; decimals = d;
    totalSupply = supply;
    balanceOf[msg.sender] = supply;
    emit Transfer(address(0), msg.sender, supply);
  }
  function transfer(address to, uint256 v) external returns (bool) {
    require(balanceOf[msg.sender] >= v, "bal");
    balanceOf[msg.sender] -= v; balanceOf[to] += v;
    emit Transfer(msg.sender, to, v); return true;
  }
  function approve(address s, uint256 v) external returns (bool) {
    allowance[msg.sender][s] = v; emit Approval(msg.sender, s, v); return true;
  }
  function transferFrom(address f, address t, uint256 v) external returns (bool) {
    require(balanceOf[f] >= v, "bal");
    uint256 a = allowance[f][msg.sender];
    require(a >= v, "allow");
    if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
    balanceOf[f] -= v; balanceOf[t] += v;
    emit Transfer(f, t, v); return true;
  }
}
`;

// Precompiled bytecode for the contract above is large to embed; instead we use
// solc if present, else instruct the user. For zero-dep deploy we ship a minimal
// creation bytecode template — actually without solc we can't easily deploy.
// Practical path: print forge/cast commands + optional dynamic import of solc.

async function main() {
  if (!KEY) {
    console.error("Set RH_DEPLOY_KEY=0x… (or METRO_TREASURY_SECRET)");
    process.exit(1);
  }
  console.log("Robinhood Chain deploy");
  console.log("  network:", isMain ? "mainnet" : "testnet", "chainId", CHAIN_ID);
  console.log("  rpc:", RPC);
  console.log("  name/symbol:", NAME, SYMBOL);
  console.log("  supply:", SUPPLY, "decimals:", DECIMALS);

  const provider = new JsonRpcProvider(RPC, CHAIN_ID);
  const wallet = new Wallet(KEY, provider);
  console.log("  deployer:", wallet.address);
  const bal = await provider.getBalance(wallet.address);
  console.log("  ETH balance:", bal.toString());
  if (bal === 0n) {
    console.error("Deployer has 0 ETH — fund on Robinhood Chain first.");
    process.exit(1);
  }

  // Prefer solc-js if available
  let solc;
  try {
    solc = (await import("solc")).default;
  } catch {
    console.log(`
solc not installed. Deploy with Foundry instead:

  forge create --rpc-url ${RPC} --private-key $RH_DEPLOY_KEY \\
    --chain-id ${CHAIN_ID} \\
    src/MetroToken.sol:MetroToken \\
    --constructor-args "${NAME}" "${SYMBOL}" ${DECIMALS} ${SUPPLY}e${DECIMALS}

Or: npm i solc --no-save && re-run this script.
`);
    // Write a sol file for forge users
    const fs = await import("node:fs");
    const path = new URL("../../contracts/MetroToken.sol", import.meta.url);
    fs.mkdirSync(new URL("../../contracts", import.meta.url), { recursive: true });
    fs.writeFileSync(path, SOURCE.replace("MetroToken", "MetroToken"));
    console.log("Wrote contracts/MetroToken.sol for forge.");
    process.exit(0);
  }

  const input = {
    language: "Solidity",
    sources: { "MetroToken.sol": { content: SOURCE } },
    settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const art = out.contracts?.["MetroToken.sol"]?.MetroToken;
  if (!art?.evm?.bytecode?.object) {
    console.error("compile failed", JSON.stringify(out.errors || out, null, 2));
    process.exit(1);
  }
  const factory = new ContractFactory(art.abi, "0x" + art.evm.bytecode.object, wallet);
  const supply = parseUnits(SUPPLY, DECIMALS);
  console.log("Deploying…");
  const contract = await factory.deploy(NAME, SYMBOL, DECIMALS, supply);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log("\n✓ $METRO deployed:", addr);
  console.log("\nNext:");
  console.log(`  npx wrangler secret put METRO_MINT          # ${addr}`);
  console.log(`  npx wrangler secret put METRO_TREASURY_SECRET  # same key if treasury = deployer`);
  console.log(`  npx wrangler secret put METRO_RPC           # ${RPC}`);
  console.log(`  npx wrangler secret put METRO_CHAIN_ID      # ${CHAIN_ID}`);
  console.log(`  VITE_METRO_MINT=${addr} VITE_METRO_CLUSTER=${isMain ? "robinhood" : "robinhood-testnet"} …`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
