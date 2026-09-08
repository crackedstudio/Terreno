import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/nim/config', () => ({
  NIMIQ_RPC_URL: 'https://rpc.test',
  NIM_MAINNET_NETWORK_ID: 24,
  NIM_MIN_CONFIRMATIONS: 10,
  NIM_TREASURY_ADDRESS: 'NQ67 LF4H CV7N B9R0 CAEX PMJK LHNF CD3Y L7B4',
}))

import {
  checkPayment,
  decodeRecipientData,
  sameNimAddress,
  type NimTransaction,
  getNimBalance,
  isNimAddressShape,
} from '@/lib/nim/rpc'

const TAG = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const TREASURY = 'NQ67 LF4H CV7N B9R0 CAEX PMJK LHNF CD3Y L7B4'

/** Shaped from a real mainnet getTransactionByHash response. */
function tx(over: Partial<NimTransaction> = {}): NimTransaction {
  return {
    hash: 'e002099d7f74b101f695a8b4670e814b797cd94f66edf03575b48e4e583c7635',
    blockNumber: 60281011,
    timestamp: 1788105722679,
    confirmations: 13,
    from: 'NQ16 2SSN 82TL SMQS KXT3 Q01V CMAL NU6F 1LJG',
    to: TREASURY,
    value: 71_725_000,
    recipientData: Buffer.from(TAG, 'utf8').toString('hex'),
    networkId: 24,
    executionResult: true,
    ...over,
  }
}

const REQUIRED = 71_725_000n

describe('sameNimAddress', () => {
  it('ignores spacing and case', () => {
    expect(sameNimAddress(TREASURY, TREASURY.replace(/ /g, '').toLowerCase())).toBe(true)
  })

  it('distinguishes different addresses', () => {
    expect(sameNimAddress(TREASURY, 'NQ16 2SSN 82TL SMQS KXT3 Q01V CMAL NU6F 1LJG')).toBe(false)
  })

  it('is false for empty input rather than vacuously true', () => {
    expect(sameNimAddress('', '')).toBe(false)
  })
})

describe('decodeRecipientData', () => {
  // Verified against a real mainnet transaction: recipientData is hex of the
  // UTF-8 bytes the sender attached.
  it('decodes hex to the attached string', () => {
    expect(
      decodeRecipientData('596f75206d696e6564204e494d206f6e204e696d69712e537061636521'),
    ).toBe('You mined NIM on Nimiq.Space!')
  })

  it('tolerates a 0x prefix', () => {
    expect(decodeRecipientData('0x' + Buffer.from('hi').toString('hex'))).toBe('hi')
  })

  it.each([['empty', ''], ['odd length', 'abc'], ['not hex', 'zzzz']])(
    'returns empty for %s input',
    (_l, v) => {
      expect(decodeRecipientData(v)).toBe('')
    },
  )
})

describe('checkPayment', () => {
  it('accepts a correct payment', () => {
    expect(checkPayment(tx(), TAG, REQUIRED)).toEqual({ ok: true })
  })

  // Nimiq Pay has a hidden testnet switch; without this a testnet payment
  // would buy real land.
  it('rejects a payment on the wrong network', () => {
    expect(checkPayment(tx({ networkId: 5 }), TAG, REQUIRED).ok).toBe(false)
  })

  it('rejects a mined but failed transaction', () => {
    expect(checkPayment(tx({ executionResult: false }), TAG, REQUIRED).ok).toBe(false)
  })

  it('rejects a payment sent to someone else', () => {
    const other = 'NQ16 2SSN 82TL SMQS KXT3 Q01V CMAL NU6F 1LJG'
    expect(checkPayment(tx({ to: other }), TAG, REQUIRED).ok).toBe(false)
  })

  // Without this, any transfer to the treasury could be replayed against any
  // order — pay once, claim any basket.
  it('rejects a payment that does not reference this order', () => {
    expect(checkPayment(tx(), 'ffffffffffffffffffffffffffffffff', REQUIRED).ok).toBe(false)
  })

  it('rejects a payment with no data attached', () => {
    expect(checkPayment(tx({ recipientData: '' }), TAG, REQUIRED).ok).toBe(false)
  })

  it('rejects an underpayment', () => {
    expect(checkPayment(tx({ value: 71_724_999 }), TAG, REQUIRED).ok).toBe(false)
  })

  // The quote rounds up, so exact equality is not the common case; overpaying
  // is the payer's business.
  it('accepts an overpayment', () => {
    expect(checkPayment(tx({ value: 80_000_000 }), TAG, REQUIRED).ok).toBe(true)
  })

  it('accepts an exactly-equal payment', () => {
    expect(checkPayment(tx({ value: 71_725_000 }), TAG, REQUIRED).ok).toBe(true)
  })

  it('holds an under-confirmed payment and says how far along it is', () => {
    const r = checkPayment(tx({ confirmations: 3 }), TAG, REQUIRED)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('3/10')
  })

  it('accepts at exactly the confirmation threshold', () => {
    expect(checkPayment(tx({ confirmations: 10 }), TAG, REQUIRED).ok).toBe(true)
  })

  it('rejects a non-finite value rather than coercing it', () => {
    expect(checkPayment(tx({ value: NaN }), TAG, REQUIRED).ok).toBe(false)
  })

  it('never leaks the expected amount in the rejection reason', () => {
    const r = checkPayment(tx({ value: 1 }), TAG, REQUIRED)
    expect(r.reason).not.toContain(REQUIRED.toString())
  })
})

/**
 * Balance lookups for the pre-flight check. A wrong answer here cannot cost
 * money — the wallet authorises the payment and settlement verifies it — but a
 * wrong answer can wrongly tell a player they cannot afford something, so the
 * failure modes are pinned.
 */
describe('isNimAddressShape', () => {
  const ADDR = 'NQ67 LF4H CV7N B9R0 CAEX PMJK LHNF CD3Y L7B4'

  it('accepts a spaced address as the wallet renders it', () => {
    expect(isNimAddressShape(ADDR)).toBe(true)
  })

  it('accepts the same address without spaces', () => {
    expect(isNimAddressShape(ADDR.replace(/\s/g, ''))).toBe(true)
  })

  it('tolerates surrounding whitespace', () => {
    expect(isNimAddressShape(`  ${ADDR}  `)).toBe(true)
  })

  it.each([
    ['empty', ''],
    ['an EVM address', '0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79'],
    ['too short', 'NQ67 LF4H'],
    ['too long', `${ADDR} EXTRA`],
    ['lowercase junk', 'not-an-address'],
  ])('rejects %s', (_label, value) => {
    expect(isNimAddressShape(value)).toBe(false)
  })
})

describe('getNimBalance', () => {
  const ADDR = 'NQ67 LF4H CV7N B9R0 CAEX PMJK LHNF CD3Y L7B4'
  const ok = (data: unknown) =>
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', result: { data } }),
    })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the balance as Luna', async () => {
    vi.stubGlobal('fetch', ok({ address: ADDR, balance: 71_725_000, type: 'basic' }))
    await expect(getNimBalance(ADDR)).resolves.toBe(71_725_000n)
  })

  // An address the chain has never seen is reported as a zero-balance basic
  // account. That is an answer, not an error — it is exactly what a new
  // player's wallet looks like, and the case the check exists to catch.
  it('reads a never-used address as zero rather than failing', async () => {
    vi.stubGlobal('fetch', ok({ address: ADDR, balance: 0, type: 'basic' }))
    await expect(getNimBalance(ADDR)).resolves.toBe(0n)
  })

  it('refuses a malformed address before making a request', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(getNimBalance('0xnope')).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // A bigint, so the comparison against a quoted Luna amount never runs
  // through a float. Every other amount in this codebase is a bigint.
  it('returns a bigint, not a number', async () => {
    vi.stubGlobal('fetch', ok({ address: ADDR, balance: 5, type: 'basic' }))
    expect(typeof (await getNimBalance(ADDR))).toBe('bigint')
  })

  it.each([
    ['a missing balance', { address: ADDR, type: 'basic' }],
    ['a non-numeric balance', { address: ADDR, balance: 'lots', type: 'basic' }],
    ['a negative balance', { address: ADDR, balance: -1, type: 'basic' }],
    ['NaN', { address: ADDR, balance: Number.NaN, type: 'basic' }],
  ])('throws on %s rather than reporting a wrong figure', async (_l, data) => {
    vi.stubGlobal('fetch', ok(data))
    await expect(getNimBalance(ADDR)).rejects.toThrow()
  })

  it('throws when the node reports an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', error: { message: 'boom' } }),
      }),
    )
    await expect(getNimBalance(ADDR)).rejects.toThrow(/boom/)
  })
})
