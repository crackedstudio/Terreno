import { createPublicClient, fallback, http } from 'viem'
import { base } from 'viem/chains'

/**
 * Optional authenticated Base RPC endpoint. When unset, viem falls back to
 * the public Base endpoint (and from there to the dRPC/Llama backups below).
 *
 * The URL ends up in the client bundle because wagmi/viem transports
 * run in the browser — protect the key via a domain allowlist on the
 * provider dashboard, not by hiding the env var. In Vercel, set this
 * for Production only so preview deploys (which aren't on the allowed
 * origin) automatically use the unauthenticated public endpoint.
 */
const baseRpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL

/**
 * Base mainnet read transport with fallbacks.
 *
 * The failover rationale carried over from the Celo/Forno setup: a single
 * provider that throttles or times out for users on shared VPN egress IPs
 * must not take the map / leaderboard reads down. viem's `fallback()`
 * rotates to the next transport when the active one fails.
 *
 * Order: the official Base endpoint first (uses the authenticated URL when
 * NEXT_PUBLIC_BASE_RPC_URL is set), then dRPC and Llama public endpoints.
 *
 * Two settings make the failover actually protect throttled-region users
 * instead of just eventually recovering:
 *   - Per-transport `timeout` well under viem's 10s default, so a request
 *     that hangs fails over in seconds rather than stalling every
 *     map/profile read for ~10s each.
 *   - `rank: true` — viem periodically samples each transport's latency and
 *     reorders them, so a user for whom one endpoint is slow/blocked is
 *     served by the fastest reachable one automatically.
 */
export const baseTransport = fallback(
  [
    http(baseRpcUrl ?? 'https://mainnet.base.org', { timeout: 6_000 }),
    http('https://base.drpc.org', { timeout: 10_000 }),
    http('https://base.llamarpc.com', { timeout: 10_000 }),
  ],
  { rank: true, retryCount: 2 },
)

/**
 * Base Sepolia read transport (testnet feature-branch preview deploys).
 * Base Sepolia is also on Nimiq Pay's supported chain list, so a preview
 * deploy can be exercised inside the real Nimiq Pay WebView.
 */
export const baseSepoliaTransport = http()

/**
 * The chain we read from for public (no-wallet) on-chain calls.
 *
 * Pinned to Base mainnet, where the continent registry in
 * `lib/maps/contracts.ts` is deployed. Base is on Nimiq Pay's supported
 * EVM chain list, which is what makes the contracts reachable from inside
 * the Nimiq Pay mini-app WebView. Hooks call
 * `usePublicClient({ chainId: READ_CHAIN_ID })` so a read client is always
 * available — even when no wallet is connected — which keeps the map,
 * leaderboard, and analytics queries working for anonymous visitors.
 */
export const READ_CHAIN = base
export const READ_CHAIN_ID = READ_CHAIN.id

/**
 * Module-level viem PublicClient pinned to the read chain.
 */
export const fallbackReadClient = createPublicClient({
  chain: READ_CHAIN,
  transport: baseTransport,
})
