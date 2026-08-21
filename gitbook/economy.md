# The $METRO Economy

METROPHAGE has two currencies: off-chain **credits (₵)** that you earn and spend in the game, and a tradeable **$METRO (◈)** ERC-20 token on **Robinhood Chain**. The bridge between them is player-funded and deliberately honest about when it's open.

![The $METRO economy](.gitbook/assets/economy-flow.svg)

## Two currencies

* **Credits (₵)** — off-chain, **server-authoritative** in-game currency. You earn them by playing and spend them at the forge, market, vendors, and Crucible. **Playing is the only faucet.**
* **$METRO (◈)** — an on-chain **ERC-20** token on **Robinhood Chain** (an Ethereum L2) with real, tradeable value. Wallet is **MetaMask, Phantom, or any WalletConnect wallet**, and sign-up is a free message signature (no gas). See [Robinhood Chain](robinhood.md) for network details.

## The bridge, in one picture

You move value across the bridge in two directions, and a **player-funded pool** sits in the middle:

* **Deposit** — send $METRO, receive credits: **1 ◈ → 100 ₵**.
* **Withdraw (claim)** — cash credits out to $METRO: **150 ₵ → 1 ◈**.

The **50 ₵ spread** between deposit and withdraw stays in the pool. The pool **starts empty and is 100% player-funded** — it only holds what players have deposited. When it's empty or short, the game says exactly that: **"Check back later."** It is not a faucet, and it never pretends to be.

## The rules

| Rule             | Value                     |
| ---------------- | ------------------------- |
| Deposit rate     | **1 ◈ → 100 ₵**           |
| Withdraw rate    | **150 ₵ → 1 ◈**           |
| Minimum cash-out | **300 ₵** (2 ◈)           |
| Settlement       | [Robinhood Chain](robinhood.md) (ERC-20) |

## How claims stay safe

Cash-outs are **claims**, and the security model is strict:

* **Deposits cost a little ETH gas**, paid through your wallet — your $METRO goes straight into the player-funded pool.
* **Cash-outs are treasury-signed ERC-20 transfers on Robinhood Chain.** The treasury pays ETH gas when funded; if it is empty, cash-outs stay closed until it is refilled.
* **The server checks your credits balance and the player-funded pool before signing**, so a claim cannot create value that is not there. There is no daily earn or withdrawal cap.
* **Mainnet stays disarmed** until counsel signs off; testnet rehearsal comes first, and server secrets are configured before the client mint so nobody can fabricate credits against an unarmed bridge.

> **In plain terms:** the on-chain layer is dormant until it's deliberately switched on, the pool only ever contains real player deposits, and no single wallet is trusted to hold the keys to the vault. Until then, the entire ₵ economy — earning, forging, trading, PvP — is fully live and playable off-chain.

## When the bridge is off

If you see **"$METRO · off-chain"** on login, that's expected: the token layer isn't armed yet. Nothing is broken — you can still earn credits, gear up, run contracts, and fight. The bridge simply arms later, when the mint goes live.
