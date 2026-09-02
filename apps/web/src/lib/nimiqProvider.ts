/**
 * The Nimiq provider — lazily loaded, narrowed at the boundary.
 *
 * Terreno's money path is EVM-only: pixels are bought with USDC/USDT on Base
 * through `window.ethereum`. The Nimiq provider is used for exactly one thing
 * — proving control of a NIM address so it can be shown on a holder's deed —
 * and nothing on the buy path may depend on it.
 *
 * Two rules shape this module, both of them load-bearing:
 *
 * 1. **The SDK is never in the static graph.** `@nimiq/mini-app-sdk` pulls in
 *    an `events` polyfill and its own provider stack. Only Nimiq Pay clients
 *    can ever use it, and those run the device's Android System WebView — on
 *    the phones that matter here, a 2018 factory build. So the SDK is reached
 *    through a dynamic `import()` behind an `isNimiqPay()` gate, the mirror
 *    image of the rule that keeps Privy out of the Nimiq Pay chunk (see
 *    `__tests__/components/nimiq-privy-isolation.test.ts`). The `import type`
 *    below is erased at compile time and adds nothing to the bundle.
 *
 * 2. **The SDK resolves errors, it does not reject them.** `listAccounts()`
 *    is typed `Promise<string[] | ErrorResponse>` and `sign()` is typed
 *    `Promise<SignatureResult | ErrorResponse>`. A declined dialog comes back
 *    as a *fulfilled* promise carrying `{ error: { type, message } }`. A naive
 *    `await` therefore hands a denial straight through as if it were data —
 *    an object where an array was expected, or a signature record with no
 *    signature in it. Every call goes through the narrowing helpers here so
 *    that a refusal becomes a thrown `NimiqProviderError`, and callers get one
 *    failure shape to handle instead of two.
 *
 * Verified against `@nimiq/mini-app-sdk@0.1.0` `dist/provider.d.ts`. If the
 * SDK ever starts rejecting, the narrowing stays correct — it only ever adds
 * a throw where the promise resolved.
 */

import type { NimiqProvider, SignatureResult } from '@nimiq/mini-app-sdk'
import { isNimiqPay } from './nimiq'

/** How long to wait for the host to answer `init()` before giving up. */
const INIT_TIMEOUT_MS = 10_000

/**
 * A Nimiq provider call that did not produce a usable result.
 *
 * Carries the host's own `error.type` when there is one, so a caller can tell
 * a user declining a dialog from the host failing to answer at all.
 */
export class NimiqProviderError extends Error {
  readonly type?: string

  constructor(message: string, type?: string) {
    super(message)
    this.name = 'NimiqProviderError'
    this.type = type
  }
}

/**
 * The `{ error: { type, message } }` envelope the SDK resolves with, narrowed
 * structurally rather than by `instanceof` — it crosses a WebView bridge as
 * plain JSON, so nothing survives as a class instance.
 */
function asErrorResponse(
  value: unknown,
): { type?: string; message?: string } | null {
  if (typeof value !== 'object' || value === null) return null
  const maybe = (value as { error?: unknown }).error
  if (typeof maybe !== 'object' || maybe === null) return null
  const { type, message } = maybe as { type?: unknown; message?: unknown }
  return {
    type: typeof type === 'string' ? type : undefined,
    message: typeof message === 'string' ? message : undefined,
  }
}

/**
 * Throw if `value` is the SDK's error envelope; otherwise hand it back.
 *
 * `fallback` is what the user is told when the host sends an envelope with no
 * message in it — which it does for at least some declines.
 */
function rejectErrorResponse<T>(value: T | unknown, fallback: string): T {
  const err = asErrorResponse(value)
  if (err) throw new NimiqProviderError(err.message || fallback, err.type)
  return value as T
}

/**
 * Memoized `init()`. The SDK sets up a bridge to the host; doing that twice
 * per session is waste, and a second `init()` racing the first has no defined
 * winner. Cleared on failure so a transient timeout can be retried by tapping
 * again rather than poisoning the session.
 */
let providerPromise: Promise<NimiqProvider> | null = null

/**
 * The Nimiq provider, or `null` outside Nimiq Pay.
 *
 * Returning `null` rather than throwing is deliberate: "not in Nimiq Pay" is
 * an ordinary state for Terreno — most traffic is a normal browser — and every
 * caller here has a sensible do-nothing branch for it.
 */
export async function loadNimiqProvider(): Promise<NimiqProvider | null> {
  if (!isNimiqPay()) return null

  if (!providerPromise) {
    providerPromise = import('@nimiq/mini-app-sdk')
      .then((sdk) => sdk.init({ timeout: INIT_TIMEOUT_MS }))
      .catch((err: unknown) => {
        providerPromise = null
        throw new NimiqProviderError(
          err instanceof Error ? err.message : 'Could not reach Nimiq Pay.',
        )
      })
  }

  return providerPromise
}

/**
 * The user's Nimiq addresses. **Shows a native confirmation dialog.**
 *
 * Never call this from a mount effect. Account access is a confirmed action,
 * and the mini-app checklist forbids triggering approval dialogs on page load
 * without user interaction — the same rule that makes `NimiqPayAutoConnect`
 * gate on read-only `eth_accounts` instead of `eth_requestAccounts`.
 */
export async function listNimiqAccounts(): Promise<string[]> {
  const provider = await loadNimiqProvider()
  if (!provider) throw new NimiqProviderError('Not running inside Nimiq Pay.')

  const result = rejectErrorResponse(
    await provider.listAccounts(),
    'Account access was declined.',
  )

  if (!Array.isArray(result) || result.length === 0) {
    throw new NimiqProviderError('Nimiq Pay returned no accounts.')
  }
  return result.filter((a): a is string => typeof a === 'string')
}

/**
 * Sign `message` with the user's Nimiq key. **Shows a native confirmation
 * dialog**, and the message is displayed verbatim inside it — keep it short,
 * readable, and honest about what signing means.
 */
export async function signWithNimiq(message: string): Promise<SignatureResult> {
  if (!message.trim()) {
    throw new NimiqProviderError('Refusing to sign an empty message.')
  }

  const provider = await loadNimiqProvider()
  if (!provider) throw new NimiqProviderError('Not running inside Nimiq Pay.')

  const result = rejectErrorResponse(
    await provider.sign(message),
    'Signature was declined.',
  )

  // A fulfilled promise that is not the error envelope can still be missing
  // the fields we need; treat that as a failure rather than storing a link
  // with an empty signature in it.
  const { publicKey, signature } = (result ?? {}) as Partial<SignatureResult>
  if (typeof publicKey !== 'string' || typeof signature !== 'string') {
    throw new NimiqProviderError('Nimiq Pay returned an unusable signature.')
  }
  return { publicKey, signature }
}

/**
 * Send NIM with data attached. **Shows a native confirmation dialog.**
 *
 * `value` is in Luna (1 NIM = 100,000 Luna) and the SDK types it as a JS
 * number, so it is range-checked here rather than silently losing precision: a
 * purchase quoted above `Number.MAX_SAFE_INTEGER` Luna would otherwise be sent
 * as a different amount than the one that was quoted.
 *
 * `data` rides along as the transaction's recipient data and is what ties this
 * payment to one specific order — the settler reads it back off the Nimiq chain
 * as `recipientData`. Keep it short; a basic transaction's data field is small.
 *
 * Returns the transaction hash, which is the receipt the settler verifies.
 *
 * **Two transports, chosen by environment.** Inside Nimiq Pay this is the
 * mini-app SDK and a native dialog. In an ordinary browser there is no
 * injected Nimiq provider, so it is the Web Wallet through the Hub popup
 * (`lib/nimiqHub.ts`) — dynamically imported there, so neither audience
 * carries the other's SDK. Both return a hash and both throw
 * `NimiqProviderError`, and `/api/nim/settle` cannot tell them apart: it
 * verifies the funding transaction against a Nimiq node either way.
 */
export async function sendNimWithData(params: {
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

  // Outside Nimiq Pay, hand off to the Web Wallet. Imported dynamically so the
  // Hub bundle never reaches a Nimiq Pay client, mirroring the rule that keeps
  // the mini-app SDK out of a browser's bundle.
  if (!isNimiqPay()) {
    const { sendNimViaHub } = await import('./nimiqHub')
    return sendNimViaHub(params)
  }

  const provider = await loadNimiqProvider()
  if (!provider) throw new NimiqProviderError('Not running inside Nimiq Pay.')

  const result = rejectErrorResponse(
    await provider.sendBasicTransactionWithData({
      recipient,
      value: Number(luna),
      data,
    }),
    'The payment was declined.',
  )

  // The SDK types this as `string | ErrorResponse`; anything else means the
  // host answered in a shape that cannot be treated as a receipt.
  if (typeof result !== 'string' || result.length === 0) {
    throw new NimiqProviderError('Nimiq Pay returned no transaction hash.')
  }
  return result
}

/** Test seam: drop the memoized provider so each case starts clean. */
export function resetNimiqProviderForTests(): void {
  providerPromise = null
}
