/**
 * The Ethereum provider — the second of the two injected providers.
 *
 * Terreno reaches `window.ethereum` through wagmi for everything on the money
 * path: the `injected()` connector owns `eth_requestAccounts`, and the buy
 * hooks own `eth_sendTransaction`. This module is deliberately NOT a second
 * way to do those things. It exists for the one call wagmi has no hook for in
 * this app — `personal_sign` — plus the account request that must precede it
 * when nothing is connected yet.
 *
 * Unlike the Nimiq provider, an EIP-1193 provider *rejects* on a declined
 * dialog rather than resolving an error envelope, so there is no narrowing to
 * do here. What it does share with the Nimiq side is the rule that matters:
 * both calls raise a native confirmation, so neither may be reached from a
 * mount effect — only from a tap.
 */

/** Thrown for every failure here, so callers have one shape to catch. */
export class EthProviderError extends Error {
  /** EIP-1193 code where the host supplied one; 4001 is "user rejected". */
  readonly code?: number

  constructor(message: string, code?: number) {
    super(message)
    this.name = 'EthProviderError'
    this.code = code
  }
}

function toEthProviderError(err: unknown, fallback: string): EthProviderError {
  if (typeof err === 'object' && err !== null) {
    const { code, message } = err as { code?: unknown; message?: unknown }
    return new EthProviderError(
      typeof message === 'string' && message ? message : fallback,
      typeof code === 'number' ? code : undefined,
    )
  }
  return new EthProviderError(fallback)
}

/** True when the rejection is the user declining, not the host failing. */
export function isUserRejection(err: unknown): boolean {
  return err instanceof EthProviderError && err.code === 4001
}

function provider(): NonNullable<Window['ethereum']> {
  const eth = typeof window !== 'undefined' ? window.ethereum : undefined
  if (!eth) {
    throw new EthProviderError(
      'No Ethereum wallet found. Open Terreno in Nimiq Pay or connect a wallet.',
    )
  }
  return eth
}

/**
 * UTF-8 → `0x…` hex, which is what `personal_sign` takes as its data argument.
 *
 * Passing the raw string instead mostly works and is the reason this is a
 * named helper rather than an inline expression: a message containing any
 * non-ASCII character encodes differently across wallets when it is not
 * hex-encoded first, so the bytes the user approves stop matching the bytes
 * stored alongside the signature.
 */
export function toHexUtf8(input: string): string {
  return `0x${Array.from(new TextEncoder().encode(input))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * The user's EVM addresses. **Shows a native confirmation dialog** when the
 * origin is not already authorized.
 *
 * Prefer the connected wagmi account where there is one; this is for the case
 * where the flow needs an address and nothing is connected yet.
 */
export async function requestEthAccounts(): Promise<string[]> {
  let result: unknown
  try {
    result = await provider().request({ method: 'eth_requestAccounts' })
  } catch (err) {
    throw toEthProviderError(err, 'Wallet connection was declined.')
  }

  const accounts = Array.isArray(result)
    ? result.filter((a): a is string => typeof a === 'string')
    : []
  if (accounts.length === 0) {
    throw new EthProviderError('The wallet returned no Ethereum accounts.')
  }
  return accounts
}

/**
 * Sign `message` with the EVM key at `address`. **Shows a native confirmation
 * dialog**, displaying the decoded text — so the message is written to be read
 * on a phone, not to be parsed.
 *
 * The message is hex-encoded before it goes to the provider; the caller keeps
 * the original string, since that is what a verifier needs.
 */
export async function personalSign(
  message: string,
  address: string,
): Promise<string> {
  if (!message.trim()) {
    throw new EthProviderError('Refusing to sign an empty message.')
  }
  if (!address) {
    throw new EthProviderError('No address to sign with.')
  }

  let result: unknown
  try {
    result = await provider().request({
      method: 'personal_sign',
      params: [toHexUtf8(message), address],
    })
  } catch (err) {
    throw toEthProviderError(err, 'Signature was declined.')
  }

  if (typeof result !== 'string' || !result.startsWith('0x')) {
    throw new EthProviderError('The wallet returned an unusable signature.')
  }
  return result
}
