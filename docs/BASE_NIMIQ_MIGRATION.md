# Migrating Mondeto from Celo/MiniPay to Base/Nimiq Pay

Status: **code migrated, contracts not yet deployed.** The frontend targets
Base and Nimiq Pay; every map in the registry still points at the undeployed
sentinel until the steps below are run.

## Why the chain had to move

Nimiq Pay mini apps get a standard `window.ethereum` injected by the host, so
wagmi/viem/Solidity carry over unchanged.

Nimiq Pay exposes a fixed set of EVM chains (Ethereum, Polygon, Arbitrum One,
Optimism, Base, BNB Smart Chain, and Ethereum Sepolia for testing). Base was
chosen from that set.

**Correction — read this before treating the move as settled.** The original
justification here was "a mini app cannot add a chain, so Celo is unreachable".
That is contradicted by Nimiq's own documentation: `wallet_addEthereumChain` is
listed as a supported provider method, and both `SKILL.md` and
`references/chains-and-tokens.md` state that custom chains can be added. It is
therefore *possible* that Mondeto could have stayed on Celo and kept every
existing pixel, price and treasury balance.

What remains genuinely undetermined: whether an added chain persists, and
whether Nimiq's RPC proxy must already know a chain for `eth_call` /
`eth_sendTransaction` to route (the docs describe read-only methods as "routed
through RPC" — i.e. through the host, not the app's own transport). The
first-party `evm-mini-wallet` reference implementation hardcodes the seven
documented chains and never calls `wallet_addEthereumChain`, which is
suggestive but not decisive.

**This is a ~30 minute device test that could preserve all user state:** open
Nimiq Pay and call `wallet_addEthereumChain` with Celo's config (chainId
`0xa4ec`), then try an `eth_call` against a Celo map contract. Do it before
deploying to Base. Record the result precisely — "added but calls do not route"
is a different finding from "the host refuses to add it".

Nimiq's native side was never an option for this product regardless: Nimiq has
no general-purpose smart contracts, only protocol-level vesting and HTLC
account types, so there is nothing to own a pixel with.

`Mondeto.sol` needed **no Solidity changes** — accepted tokens are initializer
input, not hardcoded — so this is a redeploy, not a port.

## What does not carry over

- **All existing pixel ownership, prices and treasury balances.** The Celo
  contracts keep their state; the Base deployments start empty. There is no
  migration path in this change, and writing one is a separate decision.
- **Celo fee abstraction (CIP-64).** `lib/feeCurrency.ts` is deleted. On Base
  gas is paid in ETH by the host wallet — buyers need a small ETH balance,
  which is a real UX change from MiniPay's stablecoin-only wallets.
- **The MiniPay "Add Cash" deeplink.** Nimiq Pay has no verified equivalent, so
  the top-up CTA is hidden until `NEXT_PUBLIC_TOPUP_URL` is set.

## Deploy steps

1. Fund a deployer with ETH on Base.

2. Write `base.env` (gitignored) — same variables as the Celo deploy, with Base
   values. Verified on-chain via `eth_call` against `https://mainnet.base.org`:

   **`apps/contracts/base.env.example` is filled in and ready to copy.** Its
   values were read off the live Celo world proxy with `cast call`, not
   remembered, so Base reproduces production economics:

   | | live Celo value | meaning |
   |---|---|---|
   | `initialPrice` | `30000` | $0.03 at `PRICE_DECIMALS = 6` |
   | `minPrice` | `1` | $0.000001 |
   | `feeRate` | `500` | 5% resale fee (bps) |
   | `HALVING_TIME` | `2592000` | 30 days |

   Note this contradicts the older `deploy.env.example`, which still says
   $0.01 and 182 days — those placeholders have drifted from production. Re-read
   the live values before deploying; they are owner-mutable.

   Accepted tokens, both verified on Base via `eth_call` (symbol + decimals):

   | Token | Address | decimals |
   |---|---|---|
   | USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |
   | USDT | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` | 6 |

   Celo also accepted 18-decimal USDm. Base has no equivalent, and **nothing on
   Base is 18-decimal** — any code defaulting to 18 is wrong here (this was a
   real bug in `useStablecoinBalance`, now fixed).

3. Deploy the world map first, then each continent with its mask:

   ```sh
   source base.env
   forge script script/Deploy.s.sol --broadcast --rpc-url base --account <keystore>
   # continents:
   LAND_MASK_PATH=map/continents/africa.json \
     forge script script/Deploy.s.sol --broadcast --rpc-url base --account <keystore>
   ```

4. Wire the proxy addresses into the frontend. Until they are in the registry
   source, use the override env var (comma-separated `id:address`):

   ```
   NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES=0:0x…,1:0x…
   NEXT_PUBLIC_REVEALED_MAP_IDS=0
   ```

   `getMapsForChain()` filters out any map still on the sentinel, so a map
   cannot be revealed before it exists — verify by loading the app with the
   reveal list set and the override missing: nothing should render.

5. Repoint the subgraph. Fill in `apps/subgraph/maps.base.json` with each
   proxy's address and deploy block (from
   `broadcast/Deploy.s.sol/8453/run-latest.json`), then:

   ```sh
   cd apps/subgraph && pnpm gen-manifest        # or: node scripts/gen-subgraph-yaml.js --only 0
   ```

   The generator refuses to emit a manifest for any map still null, so it cannot
   silently index the wrong contract. Then redeploy to Goldsky and update
   `NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL`. Until then the app falls back to the live
   log-scan path, which must keep working.

## Still open

- **Legal + marketing copy** (`app/terms`, `app/privacy`, `app/faq`,
  `app/layout` metadata) still names MiniPay, Celo Core Co. and the Celo
  network. That is a legal decision, not a refactor, and was deliberately left
  untouched.
- **PostHog dashboards** segmenting on `isMiniPay` must be repointed to
  `isNimiqPay`. The property was renamed rather than reused so Nimiq Pay
  traffic is not filed under a MiniPay segment.
- **`NEXT_PUBLIC_TOPUP_URL`** — unset, CTA hidden.
- **Does `wallet_addEthereumChain` work for Celo?** See the correction above.
  This is the highest-value open question in this document — it decides whether
  every existing pixel owner keeps their land.
- **Nimiq Pay chain-switch semantics are undocumented.** `ChainGuard` calls
  `wallet_switchEthereumChain` and treats rejection as a warning; whether the
  host honours it, or always sits on a user-selected chain, needs a real device
  test.
- **Gas ceilings are uncalibrated.** The approve / buy / profile fallbacks
  (150k, 300k + 80k per pixel, 200k) are the Celo numbers unchanged. Gas units
  are EVM-identical so they are plausible, but the per-pixel 80k for a
  many-distinct-owner resale batch has no measurement behind it. Pin them with
  an `estimateGas` test against a forked Base deployment.
- **Base USDT is not in Nimiq Pay's own token list.** The reference token list
  has USDC, USDbC, DAI and WETH for Base, but no USDT. Mondeto reads balances
  directly via `eth_call` so it works — but a buyer holding only USDT may not
  see it in the wallet UI. Consider shipping USDC-only at launch.
- **Mini-app submission.** `docs/MINIPAY_SUBMISSION.md` describes MiniPay's
  process and does not apply.
