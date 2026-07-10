# $METRO Mainnet Go-Live

Everything that can be done **without a contract address (CA)** is in §1–2.
When pump.fun (or similar) gives you the mint CA, follow §3–5 **in order**.

## Design invariants (do not break)

| Rule | Why |
|------|-----|
| Cash-out pool starts empty | Fixed-supply token — dev cannot mint into treasury |
| Deposit 1 ◈ → 100 ₵ · withdraw 125 ₵ → 1 ◈ | RH launch spread funds the pool |
| Treasury never spends SOL | Withdrawals are player-fee **claims** |
| Secrets before client mint | Live panel + sim settlement = fabricatable deposits |
| `METRO_MAINNET_ARMED` counsel-gated | Mainnet never arms by accident |

---

## 1. Pre-CA (do this now)

### 1a. Generate mainnet treasury

```sh
cd server
node scripts/mainnet-prepare.mjs
# optional: node scripts/mainnet-prepare.mjs --print-secret
```

Creates **gitignored** `server/.mainnet-treasury.json` (mode 600):

- `treasuryPubkey` — public deposit address once mint exists  
- `treasurySecret` — base64 64-byte secret (never commit, never reuse from devnet)

### 1b. Install treasury secret on Cloudflare

```sh
cd server
node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \
  | npx wrangler secret put METRO_TREASURY_SECRET
npx wrangler deploy
```

**Do not** set `METRO_MINT` / `METRO_DEVNET_MINT` yet.  
**Do not** set `METRO_MAINNET_ARMED`.  
**Do not** set `VITE_METRO_MINT` on the client.

### 1c. Verify readiness

```sh
curl -s https://metrophage-server.wendellphillips.workers.dev/metro/status
curl -s https://metrophage-server.wendellphillips.workers.dev/metro/pool
```

Expect something like:

```json
{
  "ok": true,
  "treasuryConfigured": true,
  "mintConfigured": false,
  "mainnetArmed": false,
  "settlement": "sim",
  "readyForCa": true,
  "treasury": "<your pubkey>"
}
```

---

## 2. Code / product already ready without CA

- Settlement seam (`sim` vs real Solana)  
- Claim withdraw (player fee payer) + deposit verify  
- Pool accounting (player-funded)  
- Client bridge panel gated on `VITE_METRO_MINT`  
- Mainnet arm flags (client + server)  
- Wallet signature required on deposit/withdraw when settlement is real Solana  
- Mainnet RPC refused unless `METRO_MAINNET_ARMED=1`  

---

## 3. When you have the CA (mint address)

```sh
cd server
node scripts/mainnet-arm.mjs <MINT_CA>
# follow printed commands exactly
```

### 3a. Server secrets (FIRST)

```sh
cd server
echo -n '<MINT_CA>' | npx wrangler secret put METRO_MINT
echo -n '<MINT_CA>' | npx wrangler secret put METRO_DEVNET_MINT   # legacy alias
echo -n 'https://api.mainnet-beta.solana.com' | npx wrangler secret put METRO_RPC
# treasury already set in §1b
npx wrangler deploy
```

### 3b. Client build (SECOND — only after 3a)

```sh
# repo root — WITHOUT arm flag until counsel OK (panel can still show for devnet-style tests)
VITE_SERVER_URL=wss://metrophage-server.wendellphillips.workers.dev/ws \
VITE_METRO_MINT=<MINT_CA> \
VITE_METRO_CLUSTER=mainnet-beta \
VITE_METRO_RPC=https://api.mainnet-beta.solana.com \
npm run build
npx wrangler pages deploy dist --project-name=metrophagev1 --branch=main --commit-dirty=true
```

### 3c. Counsel arm (real value)

```sh
cd server
echo -n '1' | npx wrangler secret put METRO_MAINNET_ARMED
npx wrangler deploy
```

Client rebuild with:

```sh
VITE_METRO_MAINNET_ARMED=1
# …plus all flags from 3b
```

Without both server + client arm flags, mainnet-value path stays off.

---

## 4. Post-launch player flow

1. Earn **credits** in-game  
2. Open **◈ $METRO** panel (mint must be in client build)  
3. **Deposit:** send $METRO to published `treasury` → claim with tx sig  
4. **Withdraw:** burn credits → receive claim tx → wallet signs + pays fee → confirm  

Pool phase:

- `bootstrap` — pool &lt; min withdraw coverage  
- `open` — pool can cover at least one min withdraw  

---

## 5. Checklist

| Step | Status without CA |
|------|-------------------|
| Treasury keypair generated | §1a |
| Treasury secret on Worker | §1b |
| Mint CA | **blocked — need pump.fun** |
| Server `METRO_MINT` | after CA |
| Server `METRO_RPC` mainnet | after CA |
| Server `METRO_MAINNET_ARMED` | counsel |
| Client `VITE_METRO_MINT` | after server secrets |
| Client `VITE_METRO_CLUSTER=mainnet-beta` | after CA |
| Client `VITE_METRO_MAINNET_ARMED=1` | counsel |
| Smoke deposit/withdraw on mainnet | after arm |

---

## 6. Safety reminders

- Never reuse **devnet** treasury on mainnet.  
- Never ship client mint before server secrets.  
- Never arm mainnet without counsel.  
- `.mainnet-treasury.json` is gitignored — back it up offline securely.  
- If the file is lost and secret was never put on Cloudflare, generate a new treasury (old deposits to old address are unrecoverable without the key).  
