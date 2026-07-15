/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_METRO_MINT?: string;
  readonly VITE_METRO_CLUSTER?: string;
  readonly VITE_METRO_RPC?: string;
  readonly VITE_METRO_SETTLEMENT?: string;
  readonly VITE_METRO_MAINNET_ARMED?: string;
  readonly VITE_METRO_CHAIN_ID?: string;
  /** Reown / WalletConnect Cloud project id (public client id). */
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}


