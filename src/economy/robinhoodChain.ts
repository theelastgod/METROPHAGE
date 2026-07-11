// METROPHAGE — Robinhood Chain (Ethereum L2 / Arbitrum Orbit).
// Public mainnet launched 2026-07-01; testnet since 2026-02.
// Docs: https://docs.robinhood.com/chain/connecting/
//
// This is the preferred settlement network for $METRO (ERC-20) + MetaMask sign-up.
// Fully EVM-compatible — same personal_sign / ERC-20 paths as Ethereum, different chainId.

export interface RobinhoodNetworkDef {
  /** EIP-155 chain id (decimal). */
  chainId: number;
  /** 0x-prefixed hex chain id for wallet_addEthereumChain. */
  chainIdHex: string;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  /** Native gas token. */
  nativeCurrency: { name: string; symbol: string; decimals: number };
  /** True for public mainnet (counsel-gated for real-value $METRO). */
  isMainnet: boolean;
}

/** Robinhood Chain mainnet — chain ID 4663. */
export const ROBINHOOD_MAINNET: RobinhoodNetworkDef = {
  chainId: 4663,
  chainIdHex: "0x1237",
  name: "Robinhood Chain",
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: "https://robinhoodchain.blockscout.com",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  isMainnet: true,
};

/** Robinhood Chain testnet — chain ID 46630. Default for rehearsal. */
export const ROBINHOOD_TESTNET: RobinhoodNetworkDef = {
  chainId: 46630,
  chainIdHex: "0xb636",
  name: "Robinhood Chain Testnet",
  rpcUrl: "https://rpc.testnet.chain.robinhood.com",
  explorerUrl: "https://explorer.testnet.chain.robinhood.com",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  isMainnet: false,
};

export type RobinhoodCluster = "robinhood" | "robinhood-testnet";

export function robinhoodNetwork(cluster: RobinhoodCluster = "robinhood-testnet"): RobinhoodNetworkDef {
  return cluster === "robinhood" ? ROBINHOOD_MAINNET : ROBINHOOD_TESTNET;
}

/** wallet_addEthereumChain / wallet_switchEthereumChain params (MetaMask). */
export function walletAddEthereumChainParams(net: RobinhoodNetworkDef) {
  return {
    chainId: net.chainIdHex,
    chainName: net.name,
    nativeCurrency: net.nativeCurrency,
    rpcUrls: [net.rpcUrl],
    blockExplorerUrls: [net.explorerUrl],
  };
}

export function isRobinhoodChainId(id: number | string): boolean {
  const n = typeof id === "string" ? parseInt(id, id.startsWith("0x") ? 16 : 10) : id;
  return n === ROBINHOOD_MAINNET.chainId || n === ROBINHOOD_TESTNET.chainId;
}
