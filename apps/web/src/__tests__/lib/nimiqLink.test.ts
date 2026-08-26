import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  buildLinkChallenge,
  clearNimiqLink,
  formatNimAddress,
  isMutuallyProven,
  isNimAddress,
  loadNimiqLink,
  makeNonce,
  saveNimiqLink,
  type NimiqLink,
} from '@/lib/nimiqLink'

const NIM = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0001'
const BASE = '0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79'

function link(overrides: Partial<NimiqLink> = {}): NimiqLink {
  return {
    nimAddress: NIM,
    nimPublicKey: 'pk',
    nimSignature: 'nimsig',
    baseAddress: BASE.toLowerCase(),
    baseSignature: '0xbasesig',
    message: 'msg',
    linkedAt: 1_700_000_000_000,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isNimAddress', () => {
  it('accepts a spaced NIM address', () => {
    expect(isNimAddress(NIM)).toBe(true)
  })

  it('accepts the same address with its spaces stripped', () => {
    expect(isNimAddress(NIM.replace(/ /g, ''))).toBe(true)
  })

  it.each([
    ['an EVM address', BASE],
    ['an empty string', ''],
    ['a truncated address', 'NQ07 0000'],
    ['lowercase groups', NIM.toLowerCase()],
    ['a non-string', 42],
  ])('rejects %s', (_label, value) => {
    expect(isNimAddress(value)).toBe(false)
  })
})

describe('buildLinkChallenge', () => {
  const challenge = buildLinkChallenge({
    baseAddress: BASE,
    nimAddress: NIM,
    nonce: 'deadbeefdeadbeef',
    issuedAt: new Date('2026-08-26T12:00:00.000Z'),
  })

  it('names both addresses in full, so one signature cannot be replayed against another pairing', () => {
    expect(challenge).toContain(NIM)
    expect(challenge).toContain(BASE)
  })

  it('carries the nonce and issue time', () => {
    expect(challenge).toContain('deadbeefdeadbeef')
    expect(challenge).toContain('2026-08-26T12:00:00.000Z')
  })

  it('tells the signer what it does not do', () => {
    expect(challenge).toContain('does not move funds')
  })

  it('says both wallets sign it, because both do', () => {
    expect(challenge).toContain('Both wallets sign this')
  })

  it('differs between calls, because the nonce differs', () => {
    const a = buildLinkChallenge({ baseAddress: BASE, nimAddress: NIM, nonce: makeNonce() })
    const b = buildLinkChallenge({ baseAddress: BASE, nimAddress: NIM, nonce: makeNonce() })
    expect(a).not.toEqual(b)
  })
})

describe('makeNonce', () => {
  it('returns 16 hex characters', () => {
    expect(makeNonce()).toMatch(/^[0-9a-f]{16}$/)
  })

  it('still returns a well-formed nonce without a CSPRNG', () => {
    vi.spyOn(globalThis, 'crypto', 'get').mockReturnValue(
      undefined as unknown as Crypto,
    )
    expect(makeNonce()).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('storage round-trip', () => {
  it('saves and loads a link for its Base address', () => {
    saveNimiqLink(link())
    expect(loadNimiqLink(BASE)?.nimAddress).toBe(NIM)
  })

  it('matches the Base address case-insensitively', () => {
    saveNimiqLink(link())
    expect(loadNimiqLink(BASE.toUpperCase())).not.toBeNull()
  })

  it('does not leak one wallet’s link to another', () => {
    saveNimiqLink(link())
    expect(loadNimiqLink('0x000000000000000000000000000000000000dead')).toBeNull()
  })

  it('returns null when no address is connected', () => {
    saveNimiqLink(link())
    expect(loadNimiqLink(undefined)).toBeNull()
  })

  it('clears only the addressed link', () => {
    const other = '0x000000000000000000000000000000000000dead'
    saveNimiqLink(link())
    saveNimiqLink(link({ baseAddress: other }))
    clearNimiqLink(BASE)
    expect(loadNimiqLink(BASE)).toBeNull()
    expect(loadNimiqLink(other)).not.toBeNull()
  })

  it.each([
    ['a NIM-signature-less record', { ...link(), nimSignature: '' }],
    ['an empty public key', { ...link(), nimPublicKey: '' }],
    ['a non-NIM address', { ...link(), nimAddress: BASE }],
    ['a missing timestamp', { ...link(), linkedAt: undefined }],
    ['an empty-string Base signature posing as one', { ...link(), baseSignature: '' }],
  ])('refuses to load %s as a link', (_label, record) => {
    localStorage.setItem(
      'terreno.nimiq-link.v1',
      JSON.stringify({ [BASE.toLowerCase()]: record }),
    )
    expect(loadNimiqLink(BASE)).toBeNull()
  })

  it('survives corrupt JSON in storage', () => {
    localStorage.setItem('terreno.nimiq-link.v1', '{not json')
    expect(loadNimiqLink(BASE)).toBeNull()
  })

  it('survives storage that throws on access, as a private WebView does', () => {
    const boom = () => {
      throw new Error('SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)

    expect(() => saveNimiqLink(link())).not.toThrow()
    expect(loadNimiqLink(BASE)).toBeNull()
  })
})

describe('formatNimAddress', () => {
  it('keeps the leading groups and the last one', () => {
    expect(formatNimAddress(NIM)).toBe('NQ07 0000…0001')
  })

  it('formats an unspaced address the same way', () => {
    expect(formatNimAddress(NIM.replace(/ /g, ''))).toBe('NQ07 0000…0001')
  })

  it('returns a non-NIM value untouched rather than mangling it', () => {
    expect(formatNimAddress(BASE)).toBe(BASE)
  })
})


describe('isMutuallyProven', () => {
  it('is true only when both halves have signed', () => {
    expect(isMutuallyProven(link())).toBe(true)
  })

  // The half-signed record is legitimate and must persist — but calling it
  // proven would claim the Base holder signed when they never did.
  it('is false for a NIM-only link', () => {
    expect(isMutuallyProven(link({ baseSignature: null }))).toBe(false)
  })

  it('is false for a null link', () => {
    expect(isMutuallyProven(null)).toBe(false)
  })

  it('is false for an empty-string Base signature', () => {
    expect(isMutuallyProven(link({ baseSignature: '' }))).toBe(false)
  })
})

describe('half-signed records', () => {
  it('round-trips a NIM-only link', () => {
    saveNimiqLink(link({ baseSignature: null }))
    const loaded = loadNimiqLink(BASE)
    expect(loaded).not.toBeNull()
    expect(loaded?.baseSignature).toBeNull()
  })

  it('does not read a v1 record, which had no Base half', () => {
    localStorage.setItem(
      'terreno.nimiq-link.v1',
      JSON.stringify({
        [BASE.toLowerCase()]: {
          nimAddress: NIM,
          baseAddress: BASE.toLowerCase(),
          publicKey: 'pk',
          signature: 'sig',
          message: 'msg',
          linkedAt: 1,
        },
      }),
    )
    expect(loadNimiqLink(BASE)).toBeNull()
  })
})

describe('a tampered store', () => {
  // localStorage is writable by whoever holds the browser. A record filed
  // under one wallet while naming another would render a signature pair as
  // proof of a binding the connected holder never made.
  it('refuses a record whose baseAddress does not match the key it sits under', () => {
    const other = '0x000000000000000000000000000000000000dead'
    localStorage.setItem(
      'terreno.nimiq-link.v2',
      JSON.stringify({ [BASE.toLowerCase()]: link({ baseAddress: other }) }),
    )
    expect(loadNimiqLink(BASE)).toBeNull()
  })

  it('accepts the same record under its own key — the control for the case above', () => {
    const other = '0x000000000000000000000000000000000000dead'
    localStorage.setItem(
      'terreno.nimiq-link.v2',
      JSON.stringify({ [other]: link({ baseAddress: other }) }),
    )
    expect(loadNimiqLink(other)).not.toBeNull()
  })
})
