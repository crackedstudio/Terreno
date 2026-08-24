# Migrating Mondeto from Celo/MiniPay to Base/Nimiq Pay

Status: **code migrated, contracts not yet deployed.** The frontend targets
Base and Nimiq Pay; every map in the registry still points at the undeployed
sentinel until the steps below are run.

## Why the chain had to move

Nimiq Pay mini apps get a standard `window.ethereum` injected by the host, so
wagmi/viem/Solidity carry over unchanged. But the EVM chains it exposes are
fixed by Nimiq's own configuration — **Ethereum, Arbitrum One, Optimism, Base,
BNB Smart Chain, Sepolia** — and a mini app cannot add one. Celo is not on that
list, so the Celo deployments are unreachable from inside Nimiq Pay.

Base was picked from that list. Nimiq's native side was never an option for
this product: Nimiq has no general-purpose smart contracts, only protocol-level
vesting and HTLC account types, so there is nothing to own a pixel with.

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

   | Token | Address | decimals |
   |---|---|---|
   | USDC (Base) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |

   ```sh
   export ACCEPTED_TOKENS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
   export INITIAL_PRICE=10000
   export MIN_PRICE=...
   export HALVING_TIME_DAYS=...
   export INITIAL_FEE_RATE=500
   export BASE_RPC_URL=https://mainnet.base.org
   export ETH_RPC_URL=$BASE_RPC_URL
   ```

   Match `INITIAL_PRICE` / `MIN_PRICE` / `HALVING_TIME_DAYS` / `INITIAL_FEE_RATE`
   to the live Celo values unless the economics are deliberately being changed —
   read them off the Celo proxy rather than from memory.

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

5. Repoint the subgraph. `apps/subgraph` indexes the Celo contracts; it needs a
   Base deployment against the new addresses and start blocks, and
   `NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL` updated. Until then the app falls back to
   the live log-scan path, which must keep working.

## Still open

- **Legal + marketing copy** (`app/terms`, `app/privacy`, `app/faq`,
  `app/layout` metadata) still names MiniPay, Celo Core Co. and the Celo
  network. That is a legal decision, not a refactor, and was deliberately left
  untouched.
- **PostHog dashboards** segmenting on `isMiniPay` must be repointed to
  `isNimiqPay`. The property was renamed rather than reused so Nimiq Pay
  traffic is not filed under a MiniPay segment.
- **`NEXT_PUBLIC_TOPUP_URL`** — unset, CTA hidden.
- **Nimiq Pay chain-switch semantics are undocumented.** `ChainGuard` calls
  `wallet_switchEthereumChain` and treats rejection as a warning; whether the
  host honours it, or always sits on a user-selected chain, needs a real device
  test.
- **Mini-app submission.** `docs/MINIPAY_SUBMISSION.md` describes MiniPay's
  process and does not apply.
