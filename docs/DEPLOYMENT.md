# Deploying Terreno

Terreno runs on **Base mainnet** as a [Nimiq Pay](https://nimiq.dev/mini-apps/)
mini app. Nimiq Pay injects a standard `window.ethereum`, so wagmi/viem and the
Solidity contracts work unchanged; Base is one of the EVM chains it exposes
(Ethereum, Polygon, Arbitrum One, Optimism, Base, BNB Smart Chain, Ethereum
Sepolia).

## Current state

| | |
|---|---|
| World proxy | [`0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79`](https://basescan.org/address/0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79) |
| World implementation | [`0x30cda206a42Cadcc42540553926e701d04C0b107`](https://basescan.org/address/0x30cda206a42Cadcc42540553926e701d04C0b107) |
| Deployed | block 50404393 |
| Accepted token | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals) |
| Continents | not deployed — each on the undeployed sentinel |

## Deploying a map

1. Fund a deployer with ETH on Base. The world map cost **0.00002144 ETH**
   (4,287,691 gas over two transactions).

2. Copy `apps/contracts/base.env.example` to `apps/contracts/.env`. Foundry
   auto-loads `.env` from the project root — no `source` needed, and `export`
   prefixes and `$VAR` interpolation both work.

   The signing key does **not** go in that file. It gets sourced, `cat`'d,
   backed up and screen-shared. Use an encrypted keystore
   (`cast wallet import <name> --interactive`) or `--ledger`.

3. Dry-run first — without `--broadcast` nothing is sent:

   ```sh
   cd apps/contracts
   forge script script/Deploy.s.sol --rpc-url base --sender <deployer-address>
   ```

   A successful dry run proves more than it looks: `initialize()` reads
   `decimals()` on every address in `ACCEPTED_TOKENS`, so it validates the token
   list on-chain.

4. Broadcast:

   ```sh
   forge script script/Deploy.s.sol --broadcast --rpc-url base --account <keystore>
   # a continent:
   LAND_MASK_PATH=map/continents/africa.json \
     forge script script/Deploy.s.sol --broadcast --rpc-url base --account <keystore>
   ```

   **Whichever address signs becomes the contract `owner`** — it holds UUPS
   upgrade authority *and* the treasury. Decide whether that should be a
   multisig before broadcasting; transferring afterwards is another transaction
   and another window.

5. Verify the source (needs `ETHERSCAN_API_KEY`; a single Etherscan V2 key
   covers Base). The proxy and implementation verify separately:

   ```sh
   forge verify-contract <impl> src/Terreno.sol:Terreno --chain base --watch \
     --constructor-args $(cast abi-encode "constructor(uint16,uint16,uint256)" 170 100 2592000)
   ```

   Read the constructor args off the live contract's own getters rather than
   from the env — they are immutables baked into bytecode and verification fails
   on a mismatch.

6. Wire the address into `apps/web/src/lib/maps/contracts.ts` (the permanent
   home) and reveal it. For a preview deploy, `NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES`
   (`0:0xabc…`) repoints a map without editing the registry.

7. Repoint the subgraph: fill in `apps/subgraph/maps.base.json` with each
   proxy's address and deploy block (from
   `broadcast/Deploy.s.sol/8453/run-latest.json`), then:

   ```sh
   cd apps/subgraph && pnpm gen-manifest    # or: node scripts/gen-subgraph-yaml.js --only 0
   ```

   The generator refuses to emit a manifest for a map still on the sentinel, so
   it cannot silently index the wrong contract. Then redeploy to Goldsky and set
   `NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL`. It **must name a Base deployment** —
   `subgraphConfigured()` fails closed on a URL that does not contain "base",
   falling back to live log-scan reads.

## Notes that bite

- **Gas is ETH, not the stablecoin.** Buyers need a small ETH balance on Base
  alongside their USDC. There is no fee abstraction here.
- **Nothing on Base is 18-decimal.** USDC and USDT are both 6. Any code
  defaulting to 18 is wrong; `useStablecoinBalance` keeps a verified per-token
  decimals map for exactly this reason.
- **Base USDT is not in Nimiq Pay's token list** (Base's entry there is USDC,
  USDbC, DAI, WETH), so a buyer holding it may not see it in the wallet UI.
  `addAcceptedToken()` is an owner call, so it can be added later.
- **`initialPrice` has no setter.** It is fixed at deployment forever — a setter
  would retroactively reprice the map out from under existing owners.

## Running a first-land grant campaign

The starter grant gives a wallet that has never owned land its first plot free:
the sponsor wallet pays in stablecoin on Base through `buyPixelsFor`, and the
player is the recipient, so the land and the leaderboard credit are theirs.
Code lives in `apps/web/src/lib/grant/` and `app/api/grant/*`.

### Turning it on

**One variable:**

```
GRANT_ENABLED=1
```

That is the whole setup. The sponsor wallet defaults to the NIM settler, which
is already funded and already approved to spend through the contract, so there
is no second wallet to create, fund or approve. Everything else has a default:

| Variable | Meaning |
|---|---|
| `GRANT_ENABLED` | `1` and nothing else turns the campaign on |
| `GRANT_SPONSOR_PRIVATE_KEY` | pays for grants; **unset means the NIM settler** |
| `GRANT_NIM_AMOUNT` | headline size in whole NIM (default `500`) |
| `GRANT_MAX_USD_MICROS` | per-claim blast-radius ceiling, in **micros** (default `2000000` = $2) |
| `GRANT_MAX_PIXELS` | most pixels one grant may buy (default `25`) |
| `GRANT_TOKEN` | stablecoin to pay with; unset means the contract's first accepted token |

One hard dependency, no default: **`NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL` must be
set and name a Base deployment.** Eligibility is "has this wallet ever acquired
land", read from the subgraph's `Owner.totalSpent` — the one figure that is
monotonic and global across maps. Without the subgraph there is no safe answer,
so grants refuse rather than guess.

Ending a campaign: unset `GRANT_ENABLED`, or let the sponsor run dry. Both stop
the offer appearing; the second needs no deploy.

### The cost of sharing the settler's wallet

The default is convenient and it is not free. The settler owes land to players
who have **already sent NIM** and cannot easily be refunded. A giveaway drawing
on the same float can leave one of those players unable to receive what they
paid for — their NIM is safe and settlement stays retryable, but it is stuck
until somebody refills the wallet.

`GRANT_MAX_USD_MICROS` bounds a single claim. Nothing bounds the campaign
total, because the float *is* the budget and it is now shared with settlement.

There is a quieter second cost: both routes send from the same EOA with no
explicit nonce management, so a grant and a NIM settlement landing in the same
moment can collide on the nonce and one will fail. Invisible at test volume,
real at campaign volume.

Every process that pays a grant from the settler logs once at warn:
`land grants are paid from the NIM settler wallet`. Before the campaign goes
wide, set `GRANT_SPONSOR_PRIVATE_KEY` to a separate, separately-funded wallet —
approve it against the map contract first, since `_buyPixels` pulls with
`transferFrom` and an unapproved sponsor reverts every grant while the offer
silently stops appearing.

### Two things worth knowing before you scale it up

- **It gates per wallet, not per person.** A fresh Base address costs nothing.
  The defences are economic — the grant is worth cents and the sponsor balance
  caps the whole campaign — not cryptographic. Nimiq Pay's
  `getDeviceIdentifier()` is the right second signal but needs somewhere to
  persist one value per device, which the app does not have yet.
- **There is an indexing window.** Between a grant landing on Base and Goldsky
  indexing it, the same wallet still reads as eligible. An in-process guard
  closes the double-tap case and nothing more. Bounded by the per-claim ceiling
  and the sponsor float; closing it properly needs a durable claim record.

### Verifying the first real grant

Nothing in the test suite proves stablecoin actually leaves the wallet, so the
first claim is the real test. Claim once, then check **on BaseScan**, not in
the UI — the UI is one of the things under test:

- the pixels are owned by the claiming wallet, not the sponsor's
- the sponsor's USDC balance fell by the quoted amount

Do this while the sponsor holds a small float, so a mistake costs cents.

## Still open

- Gas ceilings in `useBuyPixels` / `useProfile` (150k approve, 300k + 80k per
  pixel, 200k profile) are uncalibrated. Pin them with an `estimateGas` test
  against a forked Base deployment.
- No `error.tsx` / `global-error.tsx` in `apps/web/src/app`.
- Mobile checklist: 6–7px body text and sub-44px tap targets fail Nimiq's
  minimums.
- `NEXT_PUBLIC_TOPUP_URL` is unset — no verified Nimiq Pay funding deeplink, so
  the top-up CTA stays hidden.
- The legal pages (`app/terms`, `app/privacy`) still name a third-party operator
  and contact address inherited from the previous host. They need counsel, not a
  find-and-replace.
