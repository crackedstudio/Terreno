import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * /api/nim/settle — the only endpoint that spends the operator's own money on
 * somebody else's instruction. Every test here is a way the float could be
 * drained or a player could be cheated.
 *
 * `order.ts` stays REAL (only the secret is injected) so the HMAC under test is
 * the HMAC that ships; forging an order in a test would otherwise trivially
 * "pass" against a mocked verifier.
 */
process.env.NIM_ORDER_SECRET = 'x'.repeat(48)
process.env.NIM_SETTLER_PRIVATE_KEY = '0x' + '1'.repeat(64)

const h = vi.hoisted(() => ({
  getNimTransaction: vi.fn(),
  readContract: vi.fn(),
  writeContract: vi.fn(),
}))

vi.mock('@/lib/nim/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/nim/rpc')>()),
  getNimTransaction: h.getNimTransaction,
}))
vi.mock('@/lib/chain', () => ({
  fallbackReadClient: { readContract: h.readContract },
}))
vi.mock('viem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem')>()),
  createWalletClient: () => ({ writeContract: h.writeContract }),
  http: () => undefined,
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/maps/contracts', () => ({
  getMapContractById: () => ({ address: '0xcontract' }),
}))

import { POST } from '@/app/api/nim/settle/route'
import { signOrder, type NimOrder } from '@/lib/nim/order'

const RECIPIENT = '0x8db1eaad99ef3a4c2ae4479d0570c00e12be3f79'
const TREASURY = 'NQ67 LF4H CV7N B9R0 CAEX PMJK LHNF CD3Y L7B4'
const HASH = 'e002099d7f74b101f695a8b4670e814b797cd94f66edf03575b48e4e583c7635'
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

function order(over: Partial<NimOrder> = {}): NimOrder {
  return {
    mapId: 0,
    recipient: RECIPIENT,
    pixelIds: [10, 11],
    usdMicros: '460000',
    luna: '71725000',
    nimUsdScaled: '320670000',
    expiresAt: Math.floor(Date.now() / 1000) + 600,
    nonce: 'abcdef0123456789',
    ...over,
  }
}

function nimTx(tag: string, over: Record<string, unknown> = {}) {
  return {
    hash: HASH,
    blockNumber: 1,
    timestamp: 1,
    confirmations: 20,
    from: 'NQ16 2SSN 82TL SMQS KXT3 Q01V CMAL NU6F 1LJG',
    to: TREASURY,
    value: 71_725_000,
    recipientData: Buffer.from(tag, 'utf8').toString('hex'),
    networkId: 24,
    executionResult: true,
    ...over,
  }
}

async function post(payload: unknown) {
  const res = await POST(
    new Request('http://t/api/nim/settle', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  )
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.readContract.mockImplementation(({ functionName }: { functionName: string }) => {
    if (functionName === 'settledNimTx') return Promise.resolve(false)
    if (functionName === 'getAcceptedTokens') return Promise.resolve([USDC])
    return Promise.resolve(undefined)
  })
  h.writeContract.mockResolvedValue('0xbaseTx')
})

describe('the happy path', () => {
  it('settles and returns the Base transaction', async () => {
    const o = order()
    const tag = signOrder(o)
    h.getNimTransaction.mockResolvedValue(nimTx(tag))

    const { status, body } = await post({ order: o, tag, nimTxHash: HASH })
    expect(status).toBe(200)
    expect(body).toEqual({ settled: true, baseTxHash: '0xbaseTx' })
  })

  it('assigns the pixels to the ORDER’s recipient, not the settler', async () => {
    const o = order()
    const tag = signOrder(o)
    h.getNimTransaction.mockResolvedValue(nimTx(tag))
    await post({ order: o, tag, nimTxHash: HASH })

    const args = h.writeContract.mock.calls[0][0]
    expect(args.functionName).toBe('settleNimPurchase')
    expect(args.args[1]).toBe(RECIPIENT)
    expect(args.args[2]).toEqual([10n, 11n])
  })

  // Caps what the float can pay to the quoted total, so a price that moved
  // upward between quote and settlement reverts instead of drawing more.
  it('caps maxTotalCost at the quoted USD total', async () => {
    const o = order()
    const tag = signOrder(o)
    h.getNimTransaction.mockResolvedValue(nimTx(tag))
    await post({ order: o, tag, nimTxHash: HASH })

    expect(h.writeContract.mock.calls[0][0].args[4]).toBe(460000n)
  })

  it('pays with a token the contract actually accepts', async () => {
    const o = order()
    const tag = signOrder(o)
    h.getNimTransaction.mockResolvedValue(nimTx(tag))
    await post({ order: o, tag, nimTxHash: HASH })

    expect(h.writeContract.mock.calls[0][0].args[3]).toBe(USDC)
  })
})

describe('forged and tampered orders', () => {
  it('rejects an order with no valid tag', async () => {
    const { status } = await post({ order: order(), tag: 'f'.repeat(32), nimTxHash: HASH })
    expect(status).toBe(400)
    expect(h.getNimTransaction).not.toHaveBeenCalled()
  })

  // The whole point of signing the order: a player must not be able to pay for
  // two pixels and take twenty.
  it.each([
    ['more pixels', { pixelIds: [10, 11, 12, 13] }],
    ['a cheaper price', { usdMicros: '1' }],
    ['a smaller payment', { luna: '1' }],
    ['a different wallet', { recipient: '0x' + 'a'.repeat(40) }],
    ['a later expiry', { expiresAt: Math.floor(Date.now() / 1000) + 99999 }],
  ])('rejects an order edited to have %s', async (_l, patch) => {
    const original = order()
    const tag = signOrder(original)
    const tampered = { ...original, ...patch }

    const { status } = await post({ order: tampered, tag, nimTxHash: HASH })
    expect(status).toBe(400)
    expect(h.writeContract).not.toHaveBeenCalled()
  })

  it('rejects a structurally invalid order before verifying anything', async () => {
    const { status } = await post({ order: { mapId: 0 }, tag: 'a'.repeat(32), nimTxHash: HASH })
    expect(status).toBe(400)
  })

  it('rejects an expired quote', async () => {
    const o = order({ expiresAt: Math.floor(Date.now() / 1000) - 1 })
    const { status, body } = await post({ order: o, tag: signOrder(o), nimTxHash: HASH })
    expect(status).toBe(400)
    expect(body.error).toContain('expired')
    expect(h.writeContract).not.toHaveBeenCalled()
  })

  it.each([['missing', undefined], ['malformed', 'nothex'], ['wrong length', 'ab']])(
    'rejects a %s nimTxHash',
    async (_l, hash) => {
      const o = order()
      const { status } = await post({ order: o, tag: signOrder(o), nimTxHash: hash })
      expect(status).toBe(400)
    },
  )
})

describe('the payment itself', () => {
  it('refuses to settle when no matching payment exists', async () => {
    const o = order()
    const tag = signOrder(o)
    h.getNimTransaction.mockResolvedValue(nimTx(tag, { value: 1 }))

    const { status, body } = await post({ order: o, tag, nimTxHash: HASH })
    expect(status).toBe(402)
    expect(body.settled).toBe(false)
    expect(h.writeContract).not.toHaveBeenCalled()
  })

  it('refuses a payment that references a different order', async () => {
    const o = order()
    const tag = signOrder(o)
    h.getNimTransaction.mockResolvedValue(nimTx('0'.repeat(32)))

    const { status } = await post({ order: o, tag, nimTxHash: HASH })
    expect(status).toBe(402)
    expect(h.writeContract).not.toHaveBeenCalled()
  })

  it('holds an under-confirmed payment instead of settling it', async () => {
    const o = order()
    const tag = signOrder(o)
    h.getNimTransaction.mockResolvedValue(nimTx(tag, { confirmations: 2 }))

    const { status, body } = await post({ order: o, tag, nimTxHash: HASH })
    expect(status).toBe(402)
    expect(body.error).toContain('confirmations')
    expect(h.writeContract).not.toHaveBeenCalled()
  })
})

describe('replay', () => {
  it('reports an already-settled payment as done rather than failing', async () => {
    h.readContract.mockImplementation(({ functionName }: { functionName: string }) =>
      Promise.resolve(functionName === 'settledNimTx' ? true : [USDC]),
    )
    const o = order()
    const tag = signOrder(o)
    h.getNimTransaction.mockResolvedValue(nimTx(tag))

    const { status, body } = await post({ order: o, tag, nimTxHash: HASH })
    expect(status).toBe(200)
    expect(body).toEqual({ settled: true, alreadySettled: true })
    expect(h.writeContract).not.toHaveBeenCalled()
  })
})

describe('failure posture', () => {
  it('tells the player their money is safe when settlement fails', async () => {
    const o = order()
    const tag = signOrder(o)
    h.getNimTransaction.mockResolvedValue(nimTx(tag))
    h.writeContract.mockRejectedValue(new Error('insufficient funds for gas'))

    const { status, body } = await post({ order: o, tag, nimTxHash: HASH })
    expect(status).toBe(503)
    expect(body.settled).toBe(false)
    expect(body.error).toContain('safe')
  })

  it('does not leak internal failure detail to the caller', async () => {
    const o = order()
    const tag = signOrder(o)
    h.getNimTransaction.mockRejectedValue(new Error('node at 10.0.0.4 refused'))

    const { body } = await post({ order: o, tag, nimTxHash: HASH })
    expect(JSON.stringify(body)).not.toContain('10.0.0.4')
  })
})
