# Live $METRO bridge — go-live checklist (Solana)

Single ordered checklist for turning on the player-funded cash-out bridge.
**Solana SPL is authoritative.** Mint is whatever CA pump.fun created. Follow **top to bottom**.

Related docs: `MAINNET_GO_LIVE.md`, `METRO_CHAIN_CHOICE.md`, `SHIPPING.md`.

---

## Invariants (never violate)

| Rule | Why |
|------|-----|
| **Server secrets before client mint** | Client mint without live settlement is dangerous |
| **Player-funded pool only** | Deposits fill cash-outs; empty pool = “Check back later.” |
| **Solana treasury** | base64 64-byte keypair; address is base58 |
| **Treasury pays SOL on cash-outs** | Keep a small SOL float for withdraw fees + ATA rent; deposits stay player-paid |
| **Worker always broadcasts** | Solana blockhash dies in ~90s; never hand a stale signed tx to the client |
| **Deposits credit at finalized** | `confirmed` can fork and double-grant |
| **`METRO_MAINNET_ARMED` is counsel-gated** | Real-value mainnet cannot arm by accident |
| **Mint is case-sensitive base58** | Never `.toLowerCase()` a pump.fun CA |

---

## Phase 0 — Preflight

```sh
cd server
npx wrangler whoami
curl -sS https://metrophage-server.wendellphillips.workers.dev/health
curl -sS https://metrophage-server.wendellphillips.workers.dev/metro/pool | jq '{settlement,family,treasury,treasuryChain,readyForCa}'
```

Expect: `settlement` sim or solana; `treasuryChain: "solana"` once the Solana secret is installed.

---

## Phase 1 — Solana treasury (before CA)

```sh
cd server
node scripts/mainnet-prepare.mjs
# → .mainnet-treasury.json + .solana-treasury.json (gitignored)
# Re-running without --replace reuses the existing secret (does not mint a new one).

node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \
  | npx wrangler secret put METRO_TREASURY_SECRET

npx wrangler deploy
curl -sS https://metrophage-server.wendellphillips.workers.dev/metro/pool \
  | jq '{treasury, treasuryChain, treasuryConfigured, readyForCa, family}'
```

- [ ] Solana treasury address recorded
- [ ] Secret on Worker (`METRO_TREASURY_SECRET` base64 64-byte keypair)
- [ ] **Do not** set `METRO_MINT` / `VITE_METRO_MINT` yet

---

## Phase 2 — Devnet rehearsal (recommended)

Create/use a throwaway SPL mint on Solana devnet, then:

```sh
cd server
npx wrangler secret put METRO_MINT          # base58 devnet mint
npx wrangler secret put METRO_RPC           # https://api.devnet.solana.com
# METRO_SETTLEMENT=solana already in wrangler.toml
# METRO_MAINNET_ARMED stays unset
npx wrangler d1 migrations apply metrophage --remote
npx wrangler deploy
```

Client:

```sh
VITE_METRO_MINT=<base58> \
VITE_METRO_CLUSTER=devnet \
VITE_METRO_RPC=https://api.devnet.solana.com \
VITE_METRO_SETTLEMENT=solana \
npm run deploy:client
```

Smoke: Phantom connect → Send SPL to treasury → wait **finalized** → Claim deposit → Withdraw (Worker broadcasts).

---

## Phase 3 — Mainnet mint CA (pump.fun)

Create `$METRO` on pump.fun (1B / 6dp). Put the mint CA into Worker secrets **before** baking the client.

```sh
cd server
npx wrangler secret put METRO_MINT          # base58, never lowercased
npx wrangler secret put METRO_RPC           # dedicated Helius/mainnet RPC
# fund treasury SOL, then treasury buys seed inventory on the curve
```

Counsel only: `METRO_MAINNET_ARMED=1` + `VITE_METRO_MAINNET_ARMED=1`.

Then client: `VITE_METRO_MINT=<same base58>` + `VITE_METRO_CLUSTER=mainnet-beta`.
`VITE_SERVER_URL` is **build-time**.
