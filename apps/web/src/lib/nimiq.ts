/**
 * Nimiq Pay mini-app integration.
 *
 * Replaces the MiniPay host integration. The two hosts are shaped alike —
 * both are wallet WebViews that inject an EIP-1193 provider on
 * `window.ethereum` — which is why the wagmi tree, the `injected()`
 * connector and every contract hook carry over unchanged. What differs:
 *
 *   - Detection. MiniPay marked itself with `window.ethereum.isMiniPay`.
 *     Nimiq Pay instead injects a host context object at `window.nimiqPay`,
 *     documented as seeded *before the mini app's page script runs*, so it
 *     is safe to read synchronously during module init / render.
 *   - Chain. Nimiq Pay exposes a fixed EVM chain list (Ethereum, Polygon,
 *     Arbitrum One, Optimism, Base, BNB Smart Chain, Ethereum Sepolia). Base
 *     was chosen from it. NOTE: `wallet_addEthereumChain` IS supported, so
 *     "Celo could not be reached" — the original reason given for the move —
 *     is not established; see docs/BASE_NIMIQ_MIGRATION.md.
 *   - Gas. There is no Celo-style fee abstraction here; gas is paid in the
 *     chain's native asset (ETH on Base). `lib/feeCurrency.ts` is gone.
 *
 * `@nimiq/mini-app-sdk` is NOT imported here, and that is deliberate. Its
 * provider is NIM-native — Lunas, `NQ…` addresses, staking — none of which
 * this app uses; everything Mondeto needs is on `window.ethereum` and the
 * `window.nimiqPay` host object. The two host-context helpers below would be
 * the only reason to pull it in, and they are three lines each.
 *
 * The trade-off, stated because it is a real one: `NimiqPayHostContext` below
 * is hand-copied from the SDK's `dist/index.d.ts` and can drift from it
 * silently. Re-check it against the package when bumping the SDK. The package
 * stays in `dependencies` so that check is possible and so the switch to
 * importing it is a one-line change.
 */

/** Read-only host context Nimiq Pay injects before the page script runs. */
interface NimiqPayHostContext {
  readonly language?: string
  requestDeviceIdentifier: (options: { reason: string }) => Promise<string>
}

declare global {
  interface Window {
    nimiqPay?: NimiqPayHostContext
  }
}

/**
 * Synchronous "are we inside Nimiq Pay?" check.
 *
 * The direct analogue of the old `detectMiniPaySync()`. Returns false on the
 * server, so SSR and the first client render agree and no hydration mismatch
 * is introduced. Deliberately dependency-free: it reads the injected object
 * directly rather than importing the SDK, so the detection path costs nothing
 * and stays loadable even if the SDK chunk fails.
 */
export function isNimiqPay(): boolean {
  if (typeof window === 'undefined') return false
  return typeof window.nimiqPay === 'object' && window.nimiqPay !== null
}

/**
 * The user's Nimiq Pay language as an ISO 639-1 code, or undefined outside
 * Nimiq Pay. Seeded synchronously, so this is safe during module init.
 */
export function getHostLanguage(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return window.nimiqPay?.language
}

/**
 * Pseudonymous per-origin device identifier (64-char hex SHA-256).
 *
 * Prompts the user on first call per origin; later calls auto-resolve. It
 * identifies the *device*, not the user — stable across Nimiq Pay reinstalls
 * and across accounts on the same device — so it is an anti-spam / rate-limit
 * signal, never an identity or an ownership key. Resolves to null instead of
 * throwing when the user declines or we are outside Nimiq Pay, so callers can
 * treat it as best-effort.
 *
 * `reason` is shown verbatim in the consent prompt and must be non-empty.
 */
export async function getDeviceIdentifier(reason: string): Promise<string | null> {
  if (!isNimiqPay() || !reason.trim()) return null
  try {
    return (await window.nimiqPay!.requestDeviceIdentifier({ reason })) ?? null
  } catch {
    // Declined prompt, or a host that does not implement it. Best-effort.
    return null
  }
}
