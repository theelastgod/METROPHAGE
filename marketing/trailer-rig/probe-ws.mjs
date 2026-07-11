// Probe the world ws handshake for a wallet: prints every server message + close code.
// Usage: node probe-ws.mjs [walletFile] [zone]
import { ed25519 } from "/Users/wendellphillips/METROPHAGE/server/node_modules/@noble/curves/ed25519.js";
import fs from "node:fs";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58encode(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      const x = digits[j] * 256 + carry;
      digits[j] = x % 58;
      carry = (x / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let s = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) s += B58[digits[i]];
  return s;
}

const file = process.argv[2] || "/Users/wendellphillips/METROPHAGE/marketing/trailer-rig/trailer-wallet-b.json";
const zone = process.argv[3] || "safe";
const j = JSON.parse(fs.readFileSync(file, "utf8"));
const priv = Uint8Array.from(j.priv);
const ts = Date.now();
const msg = `METROPHAGE login\nwallet: ${j.pub58}\nts: ${ts}`;
const sig = b58encode(ed25519.sign(new TextEncoder().encode(msg), priv));

const ws = new WebSocket(`ws://127.0.0.1:8787/ws?zone=${zone}`);
ws.onopen = () => {
  console.log("OPEN, sending login as", j.pub58.slice(0, 8));
  ws.send(JSON.stringify({ t: "login", name: "VESSEL", wallet: j.pub58, sig, ts }));
};
ws.onmessage = (e) => {
  const s = String(e.data);
  console.log("MSG:", s.slice(0, 220));
  if (s.includes('"welcome"') || s.includes('"joined"')) setTimeout(() => { ws.close(); process.exit(0); }, 1500);
};
ws.onclose = (e) => { console.log("CLOSE code=", e.code, "reason=", e.reason); process.exit(0); };
ws.onerror = () => console.log("ERROR");
setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 15000);
