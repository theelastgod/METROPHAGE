// bs58 (pulled in transitively by @solana/web3.js) ships no types. Minimal typed shim
// for the two functions the wallet sign-in verifier uses.
declare module "bs58" {
  const bs58: {
    encode(buffer: Uint8Array | number[]): string;
    decode(str: string): Uint8Array;
  };
  export default bs58;
}
