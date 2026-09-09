/**
 * Paying in NIM from an ordinary browser, through the Nimiq Web Wallet.
 *
 * Terreno has two NIM transports and they are chosen by environment, not by
 * preference:
 *
 *   - **Inside Nimiq Pay** — `@nimiq/mini-app-sdk`, a native dialog in the
 *     wallet's own WebView. See `lib/nimiqProvider.ts`.
 *   - **In a browser** — the Hub, a popup at hub.nimiq.com where the user's
 *     Web Wallet signs. This module.
 *
 * Until this existed the NIM panel rendered nothing outside Nimiq Pay, because
 * a browser has no injected Nimiq provider to pay with. That is also where
 * every share link lands: somebody clicking a taunt on X arrives on a desktop
 * browser, where NIM payment simply did not exist.
 *
 * **Nothing on the server changes.** `/api/nim/settle` verifies a payment by
 * reading the funding transaction from a Nimiq node — "the payer controls
 * their client, so their claim to have paid is not evidence" — so it neither
 * knows nor cares which transport produced the transaction. Same quote, same
 * HMAC tag in the data field, same `settledNimTx` guard. This module's only
 * job is to return the same thing `sendNimWithData` returns: a hash.
 *
 * Three constraints, all load-bearing:
 *
 * 1. **The SDK is never in the static graph.** Same rule that keeps
 *    `@nimiq/mini-app-sdk` out of it, for the mirror-image reason. The Hub
 *    bundle is dead weight for Nimiq Pay clients, who run a 2018 Android
 *    System WebView and will never open a popup. Reached through a dynamic
 *    `import()` behind an `isNimiqPay()` check, so neither audience downloads
 *    the other's transport. `__tests__/components/nimiq-privy-isolation.test.ts`
 *    pins the pattern.
 *
 * 2. **The endpoint decides the network.** Nimiq Pay has a hidden testnet
 *    switch and the settler pins mainnet (`networkId` 24), so a testnet
 *    payment is rejected AFTER the user has parted with their NIM. `checkout`
 *    broadcasts as it signs, so there is no client-side check that can undo
 *    that — the only real guard is pointing the Hub at the mainnet endpoint,
 *    which is what the default here does.
 *
 * 3. **Popups need a user gesture.** `checkout()` opens a window, so it must
 *    be called synchronously from a tap. The NIM panel already pauses for an
 *    explicit "pay" tap, so this is satisfied by the existing flow rather
 *    than by anything here — but a caller that ever moves the call into an
 *    effect will find it blocked, and that is not a bug in this module.
 */

import { NimiqProviderError } from './nimiqProvider'

/**
 * Where the Web Wallet lives. Overridable, like every other endpoint on this
 * path, so an operator can move off the public Hub without a code change —
 * but the default is mainnet on purpose (see constraint 2 above).
 */
export const NIMIQ_HUB_URL =
  process.env.NEXT_PUBLIC_NIMIQ_HUB_URL || 'https://hub.nimiq.com'

/** Shown in the Hub's own UI as the site requesting the payment. */
const APP_NAME = 'Terreno'

/** Memoized, like the mini-app provider: one Hub instance per session. */
let hubPromise: Promise<{
  checkout: (req: {
    appName: string
    recipient: string
    value: number
    extraData: string
  }) => Promise<{ hash?: unknown }>
}> | null = null

async function loadHub() {
  if (!hubPromise) {
    hubPromise = import('@nimiq/hub-api')
      .then((mod) => {
        // The package ships both a default and a named export depending on
        // build; take whichever is a constructor rather than assuming.
        const HubApi = (mod as { default?: unknown }).default ?? mod
        const Ctor = HubApi as new (endpoint: string) => {
          checkout: (req: {
            appName: string
            recipient: string
            value: number
            extraData: string
          }) => Promise<{ hash?: unknown }>
        }
        return new Ctor(NIMIQ_HUB_URL)
      })
      .catch((err: unknown) => {
        // Cleared so a transient network failure can be retried by tapping
        // again rather than poisoning the session.
        hubPromise = null
        throw new NimiqProviderError(
          err instanceof Error ? err.message : 'Could not reach the Nimiq Wallet.',
        )
      })
  }
  return hubPromise
}

/**
 * Is the Hub a usable transport here?
 *
 * Browser only — it opens a popup, which has no meaning during SSR.
 */
export function canUseNimiqHub(): boolean {
  return typeof window !== 'undefined'
}

/**
 * Fetch the Hub module ahead of the tap that needs it. Safe to call repeatedly.
 *
 * `checkout()` opens a popup, and a browser only permits that from inside a
 * user gesture. `sendNimViaHub` must `await loadHub()` first, and on the very
 * first payment that await is a dynamic `import()` over the NETWORK — a task
 * boundary that ends the activation the tap granted. The popup is blocked and
 * `checkout()` rejects with nothing useful in it.
 *
 * That is the reported bug: the first attempt to pay in NIM failed, and trying
 * again a moment later worked, because by then the module was cached and the
 * await resolved inside the gesture.
 *
 * Warming the module before the tap takes the network hop off the critical
 * path. It is a script fetch, not a provider call, so it raises no dialog and
 * does not fall foul of the rule against confirmations on load.
 *
 * Resolves when the transport is ready to be used inside a tap — or when it is
 * clear it never will be. It NEVER rejects: a failed warm must not surface
 * anywhere, and the real attempt reports its own failures. Callers use it to
 * decide when a pay button is safe to offer, so resolving on failure matters
 * as much as resolving on success — a player must never be locked out of
 * trying because a warm went wrong.
 */
export function preloadNimiqHub(): Promise<void> {
  if (!canUseNimiqHub()) return Promise.resolve()
  return loadHub().then(
    () => undefined,
    () => undefined,
  )
}

/**
 * Send NIM through the Web Wallet. **Opens the Hub popup.**
 *
 * Mirrors `sendNimWithData`'s contract exactly — same argument shape, same
 * validation, same `NimiqProviderError` on every failure, same hash out — so
 * the caller can pick a transport without branching on anything else.
 *
 * `value` is Luna as a JS number, so the same range check applies: a purchase
 * quoted above `Number.MAX_SAFE_INTEGER` Luna would otherwise be sent as a
 * different amount than the one quoted.
 *
 * Unlike the mini-app SDK, the Hub REJECTS on failure rather than resolving an
 * error envelope — a cancelled popup is a thrown `Error`. Both are funnelled
 * into `NimiqProviderError` here so callers keep one failure shape.
 */
export async function sendNimViaHub(params: {
  recipient: string
  luna: bigint
  data: string
}): Promise<string> {
  const { recipient, luna, data } = params

  if (!recipient.trim()) throw new NimiqProviderError('No Nimiq recipient address.')
  if (luna <= 0n) throw new NimiqProviderError('Refusing to send a zero payment.')
  if (luna > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new NimiqProviderError('That amount is too large to send in one payment.')
  }
  if (!data.trim()) throw new NimiqProviderError('Refusing to send a payment with no reference.')

  const hub = await loadHub()

  let result: { hash?: unknown }
  try {
    result = await hub.checkout({
      appName: APP_NAME,
      recipient,
      value: Number(luna),
      // The order tag. Rides as the transaction's recipient data, which is what
      // the settler reads back off the chain to bind this payment to this
      // order. A string is accepted directly (`Bytes = Uint8Array | string`).
      extraData: data,
    })
  } catch (err: unknown) {
    // Cancelling the popup lands here. The message is the Hub's own, which is
    // already user-facing, but a cancel can also arrive with none.
    // The Hub's own message is already user-facing when there is one. When
    // there is not, the likeliest cause by far is a blocked popup, so the
    // fallback names it rather than saying "not completed" and leaving the
    // player with nothing to act on.
    throw new NimiqProviderError(
      err instanceof Error && err.message
        ? err.message
        : 'The Nimiq Wallet window did not open. Check that pop-ups are allowed for this site, then try again.',
    )
  }

  // `checkout` both signs AND broadcasts, so a hash coming back means the
  // transaction is on its way to the network — which is exactly what the
  // settler will go looking for.
  const hash = result?.hash
  if (typeof hash !== 'string' || hash.length === 0) {
    throw new NimiqProviderError('The Nimiq Wallet returned no transaction hash.')
  }
  return hash
}

/** Test seam: drop the memoized Hub so each case starts clean. */
export function resetNimiqHubForTests(): void {
  hubPromise = null
}
