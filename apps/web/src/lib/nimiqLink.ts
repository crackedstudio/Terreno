/**
 * Linking a NIM address to a holder's deed.
 *
 * The claim being made is "the same person controls this Base address and
 * this NIM address". Holding an address is not enough on its own — both are
 * public, and the app is simply told them by the host — so the claim rests on
 * signatures over a challenge that names *both* addresses.
 *
 * One challenge, two signatures, one from each provider:
 *
 *   NIM  — Nimiq provider `sign()`   → proves control of the NIM address
 *   Base — `personal_sign`           → proves control of the Base address
 *
 * Neither alone is the claim. A NIM signature says nothing about who holds the
 * Base address, and vice versa; it is the pair over the *same* nonce'd message
 * that binds them. `isMutuallyProven()` is the only thing that may be rendered
 * as "verified", and a half-signed record is stored honestly as half-signed.
 *
 * What this still does NOT establish: nothing verifies these signatures. They
 * are recorded, not checked — a verifier would need the Nimiq signature scheme
 * for one half and `personal_ecRecover` for the other, and neither runs here.
 * So a link is strong evidence to the person who made it and unchecked data to
 * anyone else. Nothing on the money path reads a link.
 *
 * Storage is per-Base-address and client-side, so switching wallets in the
 * same browser never shows the previous holder's NIM address.
 */

/**
 * Bumped when the record shape changes; old keys are then simply not found.
 * v1 held a NIM signature only. v2 adds the Base half, so a v1 record cannot
 * satisfy the current shape and is deliberately not migrated — re-linking is
 * two taps, and silently promoting a one-sided record to a "mutually proven"
 * one would be a lie told by a migration.
 */
const STORAGE_KEY = 'terreno.nimiq-link.v2'

/**
 * A recorded link between a Base address and a NIM address.
 *
 * `message` is kept alongside the signature deliberately — a signature without
 * the exact bytes that were signed cannot be checked by anything later, and
 * re-deriving the message is not possible once the nonce is gone.
 */
export interface NimiqLink {
  /** The NIM address, in the host's spaced `NQ..` form. */
  nimAddress: string
  nimPublicKey: string
  /** Nimiq provider `sign()` over `message`. */
  nimSignature: string
  /** The Base address the link was made from, lowercased. */
  baseAddress: string
  /**
   * `personal_sign` over the SAME `message`, or null while only the NIM half
   * is done. Both signatures covering one challenge is what turns the link
   * from an assertion into something a verifier can check from either side.
   */
  baseSignature: string | null
  /** The exact challenge string both sides sign. */
  message: string
  /** Epoch ms at which the first (NIM) signature was taken. */
  linkedAt: number
}

/**
 * True when both halves have signed. The UI must not call a link "verified"
 * on the strength of the NIM signature alone — that proves control of the NIM
 * address and says nothing about who holds the Base one.
 */
export function isMutuallyProven(link: NimiqLink | null): boolean {
  return !!link && typeof link.baseSignature === 'string' && link.baseSignature.length > 0
}

/**
 * Nimiq addresses are `NQ` + a 2-digit checksum + eight 4-character groups,
 * conventionally spaced. Accept either spacing, since a value that has made a
 * round trip through storage or a copy-paste may have lost its spaces.
 */
const NIM_ADDRESS_RE = /^NQ\d{2}(?: ?[A-Z0-9]{4}){8}$/

export function isNimAddress(value: unknown): value is string {
  return typeof value === 'string' && NIM_ADDRESS_RE.test(value.trim())
}

/**
 * The challenge the user is asked to sign.
 *
 * This string is shown verbatim in Nimiq Pay's native dialog on a phone, so it
 * is built to be read there: short lines, no jargon, and a first line that says
 * what agreeing to it does. Both addresses appear in full — a challenge that
 * elided either one would let the same signature be replayed against a
 * different pairing.
 *
 * The nonce makes each challenge distinct so a signature captured once cannot
 * stand in for a later link.
 */
export function buildLinkChallenge(params: {
  baseAddress: string
  nimAddress: string
  nonce: string
  issuedAt?: Date
}): string {
  const { baseAddress, nimAddress, nonce } = params
  const issued = (params.issuedAt ?? new Date()).toISOString()
  return [
    'Link this Nimiq address to your Terreno deed.',
    '',
    `Nimiq: ${nimAddress}`,
    `Base:  ${baseAddress}`,
    `Issued: ${issued}`,
    `Nonce: ${nonce}`,
    '',
    'Both wallets sign this to prove one owner.',
    'It does not move funds and does not buy land.',
  ].join('\n')
}

/**
 * A 16-character hex nonce from the platform CSPRNG.
 *
 * Falls back to `Math.random` only where `crypto` is missing entirely. The
 * nonce's job is uniqueness between challenges, not unpredictability against
 * an attacker — nothing is authorized by guessing it — so a weak fallback
 * degrades the property gracefully instead of failing the link outright.
 */
export function makeNonce(): string {
  const bytes = new Uint8Array(8)
  const webCrypto =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined

  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** All links, keyed by lowercased Base address. */
type LinkStore = Record<string, NimiqLink>

/**
 * localStorage is wrapped everywhere below because it is not reliably present:
 * Nimiq Pay renders in a WebView whose site data the user can have disabled,
 * and a private context throws on *access*, not just on write. A holder whose
 * storage is unavailable should see an unlinked deed, never a crashed page.
 */
function readStore(): LinkStore {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as LinkStore
  } catch {
    return {}
  }
}

function writeStore(store: LinkStore): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch (err) {
    // Quota, disabled site data, or a private context. Degraded rather than
    // broken: the link is lost on reload, but the session that made it still
    // shows it, and nothing on the buy path reads this store.
    console.warn('nimiqLink: could not persist link', err)
  }
}

/** Narrow a parsed record before handing it to the UI as a verified link. */
function isNimiqLink(value: unknown): value is NimiqLink {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<NimiqLink>
  return (
    isNimAddress(v.nimAddress) &&
    typeof v.baseAddress === 'string' &&
    typeof v.nimPublicKey === 'string' &&
    v.nimPublicKey.length > 0 &&
    typeof v.nimSignature === 'string' &&
    v.nimSignature.length > 0 &&
    // Optional, but when present it must be a real signature rather than a
    // truthy placeholder — `isMutuallyProven` is read as a security claim.
    (v.baseSignature === null ||
      (typeof v.baseSignature === 'string' && v.baseSignature.length > 0)) &&
    typeof v.message === 'string' &&
    typeof v.linkedAt === 'number'
  )
}

export function loadNimiqLink(baseAddress: string | undefined): NimiqLink | null {
  if (!baseAddress) return null
  const key = baseAddress.toLowerCase()
  const record = readStore()[key]
  if (!isNimiqLink(record)) return null

  // The key and the record's own `baseAddress` must agree. Nothing in this app
  // writes a record where they don't — but localStorage is writable by whoever
  // holds the browser, and a record filed under one wallet while naming another
  // would show a signature pair as proof of a binding the connected holder
  // never made. Cheaper to refuse it here than to reason about it downstream.
  if (record.baseAddress.toLowerCase() !== key) return null
  return record
}

export function saveNimiqLink(link: NimiqLink): void {
  const store = readStore()
  store[link.baseAddress.toLowerCase()] = link
  writeStore(store)
}

export function clearNimiqLink(baseAddress: string | undefined): void {
  if (!baseAddress) return
  const store = readStore()
  delete store[baseAddress.toLowerCase()]
  writeStore(store)
}

/**
 * A NIM address shortened for the deed's fixed-width row: the leading `NQxx`
 * and the last group, which is what a holder actually recognizes their own
 * address by. Anything that is not a NIM address is returned untouched rather
 * than mangled into a shape that looks like one.
 */
export function formatNimAddress(address: string): string {
  if (!isNimAddress(address)) return address
  const groups = address.trim().replace(/ /g, '').match(/.{1,4}/g)
  if (!groups || groups.length < 3) return address.trim()
  return `${groups[0]} ${groups[1]}…${groups[groups.length - 1]}`
}
