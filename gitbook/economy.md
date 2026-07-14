# The $METRO Economy

METROPHAGE has two currencies: off-chain **credits (₵)** that you earn and spend in the game, and a tradeable **$METRO (◈)** token on **Robinhood Chain**. The bridge between them is player-funded and deliberately honest about when it's open.

![The $METRO economy](.gitbook/assets/economy-flow.svg)

## Two currencies

* **Credits (₵)** — off-chain, **server-authoritative** in-game currency. You earn them by playing and spend them at the forge, market, vendors, and Crucible. **Playing is the only faucet.**
* **$METRO (◈)** — an on-chain **ERC-20** token on **Robinhood Chain** (an Ethereum L2) with real, tradeable value. Wallet is **MetaMask**, and sign-up is a free signature (no gas).

## The bridge, in one picture

You move value across the bridge in two directions, and a **player-funded pool** sits in the middle:

* **Deposit** — send $METRO, receive credits: **1 ◈ → 100 ₵**.
* **Withdraw (claim)** — cash credits out to $METRO: **125 ₵ → 1 ◈**.

The **\~20% spread** between deposit and withdraw stays in the pool. The pool **starts empty and is 100% player-funded** — it only holds what players have deposited. When it's empty or short, the game says exactly that: **"Check back later."** It is not a faucet, and it never pretends to be.

## The rules

| Rule             | Value                   |
| ---------------- | ----------------------- |
| Deposit rate     | **1 ◈ → 100 ₵**         |
| Withdraw rate    | **125 ₵ → 1 ◈**         |
| Minimum cash-out | **250 ₵** (2 ◈)         |
| Daily cap        | **50,000 ₵ per player** |
| Settlement       | Robinhood Chain (ERC-20)    |

## How claims stay safe

Cash-outs are **claims**, and the security model is strict:

* **Deposits cost only a little ETH gas**, paid through MetaMask — your $METRO goes straight into the player-funded pool.
* **Cash-outs are treasury-signed claims** settled on Robinhood Chain. The server checks your credits balance, daily cap, and the pool before the treasury ever signs, so a claim can't mint value that isn't there.
* **Mainnet stays disarmed** until counsel signs off; testnet rehearsal comes first, and server secrets are configured before the client mint so nobody can fabricate credits against an un-armed bridge.

> **In plain terms:** the on-chain layer is dormant until it's deliberately switched on, the pool only ever contains real player deposits, and no single wallet is trusted to hold the keys to the vault. Until then, the entire ₵ economy — earning, forging, trading, PvP — is fully live and playable off-chain.

## When the bridge is off

If you see **"$METRO · off-chain"** on login, that's expected: the token layer isn't armed yet. Nothing is broken — you can still earn credits, gear up, run contracts, and fight. The bridge simply arms later, when the mint goes live.
