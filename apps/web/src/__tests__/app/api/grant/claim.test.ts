import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * /api/grant/claim — the endpoint that spends the operator's money and
 * receives nothing back. Every test here is a way the sponsor float could be
 * drained, or a player could be wrongly refused.
 *
 * `lib/grant/eligibility.ts` and `lib/grant/config.ts` stay REAL — only the
 * subgraph underneath and the price feed are mocked. Mocking the gate itself
 * would leave the faucet test asserting against a stub of the thing under
 * test.
 */
process.env.GRANT_ENABLED = '1'
process.env.GRANT_SPONSOR_PRIVATE_KEY = '0x' + '1'.repeat(64)

const h = vi.hoisted(() => ({
  readContract: vi.fn(),
  writeContract: vi.fn(),
  fetchOwnerPnl: vi.fn(),
  subgraphConfigured: vi.fn(),
  fetchNimUsdScaled: vi.fn(),
}))

vi.mock('@/lib/chain', () => ({ fallbackReadClient: { readContract: h.readContract } }))
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
vi.mock('@/lib/subgraph', () => ({
  fetchOwnerPnl: h.fetchOwnerPnl,
  subgraphConfigured: h.subgraphConfigured,
}))
vi.mock('@/lib/nim/price', () => ({ fetchNimUsdScaled: h.fetchNimUsdScaled }))

import { POST } from '@/app/api/grant/claim/route'

const RECIPIENT = '0x8db1eaad99ef3a4c2ae4479d0570c00e12be3f79'
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const NIM_USD = 386_830_000n // $0.00038683 — 500 NIM = 193415 micros
const TX = '0xbeef'

/** One fresh pixel at initialPrice. */
const PIXEL = 30_000n

interface Chain {
  price?: bigint
  balance?: bigint
  allowance?: bigint
  tokens?: string[]
}

function chain({ price = PIXEL, balance = 10_000_000n, allowance = 10_000_000n, tokens = [USDC] }: Chain = {}) {
  h.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
    if (functionName === 'selectionPrice') return price
    if (functionName === 'getAcceptedTokens') return tokens
    if (functionName === 'balanceOf') return balance
    if (functionName === 'allowance') return allowance
    throw new Error(`unexpected read ${functionName}`)
  })
}

async function post(payload: unknown) {
  const res = await POST(
    new Request('http://t/api/grant/claim', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  )
  return { status: res.status, body: await res.json() }
}

const claim = (over: Record<string, unknown> = {}) => ({
  mapId: 0,
  pixelIds: [10, 11],
  recipient: RECIPIENT,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  h.subgraphConfigured.mockReturnValue(true)
  h.fetchOwnerPnl.mockResolvedValue({ spent: '0', earned: '0' })
  h.fetchNimUsdScaled.mockResolvedValue(NIM_USD)
  h.writeContract.mockResolvedValue(TX)
  chain()
})

describe('input validation', () => {
  it.each([
    ['a non-address recipient', claim({ recipient: 'nope' })],
    ['a negative mapId', claim({ mapId: -1 })],
    ['an empty selection', claim({ pixelIds: [] })],
    ['a negative pixel id', claim({ pixelIds: [-1] })],
    ['more pixels than the cap', claim({ pixelIds: Array.from({ length: 26 }, (_, i) => i) })],
  ])('rejects %s without touching the chain', async (_label, payload) => {
    const { status } = await post(payload)
    expect(status).toBe(400)
    expect(h.writeContract).not.toHaveBeenCalled()
  })

  it('rejects a body that is not JSON', async () => {
    const res = await POST(new Request('http://t/api/grant/claim', { method: 'POST', body: '{' }))
    expect(res.status).toBe(400)
    expect(h.writeContract).not.toHaveBeenCalled()
  })
})

describe('eligibility', () => {
  it('refuses a wallet that has already bought land, and spends nothing', async () => {
    h.fetchOwnerPnl.mockResolvedValue({ spent: '30000', earned: '0' })
    const { status } = await post(claim())
    expect(status).toBe(403)
    expect(h.writeContract).not.toHaveBeenCalled()
  })

  // The distinction the whole eligibility module exists to preserve: an
  // indexer outage is "we cannot tell", not "you have had yours". A 403 here
  // would permanently deny a genuinely new player with no way to appeal.
  it('answers 503, not 403, when the subgraph cannot be reached', async () => {
    h.fetchOwnerPnl.mockRejectedValue(new Error('subgraph HTTP 502'))
    const { status } = await post(claim())
    expect(status).toBe(503)
    expect(h.writeContract).not.toHaveBeenCalled()
  })

  it('answers 503 when the subgraph is not configured at all', async () => {
    h.subgraphConfigured.mockReturnValue(false)
    expect((await post(claim())).status).toBe(503)
    expect(h.writeContract).not.toHaveBeenCalled()
  })
})

describe('the grant limit', () => {
  it('refuses a selection worth more than the grant', async () => {
    // 193415 micros is 500 NIM. Seven fresh pixels at $0.03 is 210000.
    chain({ price: 210_000n })
    const { status, body } = await post(claim({ pixelIds: [1, 2, 3, 4, 5, 6, 7] }))
    expect(status).toBe(400)
    expect(body.error).toMatch(/500 NIM/)
    expect(h.writeContract).not.toHaveBeenCalled()
  })

  it('allows a selection worth exactly the grant', async () => {
    chain({ price: 193_415n })
    expect((await post(claim())).status).toBe(200)
    expect(h.writeContract).toHaveBeenCalled()
  })

  it('refuses one micro over the grant', async () => {
    chain({ price: 193_416n })
    expect((await post(claim())).status).toBe(400)
    expect(h.writeContract).not.toHaveBeenCalled()
  })
})

describe('the sponsor float', () => {
  it('refuses when the sponsor has not approved the contract', async () => {
    chain({ allowance: 0n })
    const { status, body } = await post(claim())
    expect(status).toBe(503)
    expect(h.writeContract).not.toHaveBeenCalled()
    // Operational detail stays in the log line, never in the response.
    expect(JSON.stringify(body)).not.toContain('0x')
  })

  it('refuses when the sponsor float is empty — the campaign budget running out', async () => {
    chain({ balance: 0n })
    expect((await post(claim())).status).toBe(503)
    expect(h.writeContract).not.toHaveBeenCalled()
  })

  it('refuses when the contract accepts no token the sponsor can pay with', async () => {
    chain({ tokens: [] })
    expect((await post(claim())).status).toBe(503)
    expect(h.writeContract).not.toHaveBeenCalled()
  })
})

describe('paying the grant', () => {
  it('buys the pixels FOR the player, not for the sponsor', async () => {
    const { status, body } = await post(claim())
    expect(status).toBe(200)
    expect(body).toMatchObject({ granted: true, baseTxHash: TX, pixels: 2 })

    const call = h.writeContract.mock.calls[0][0]
    expect(call.functionName).toBe('buyPixelsFor')
    expect(call.args[0]).toBe(RECIPIENT)
    expect(call.args[1]).toEqual([10n, 11n])
    expect(call.args[2]).toBe(USDC)
  })

  // The money assertion. `maxTotalCost` is the price just read, NOT the grant
  // ceiling: if another buyer bumps a pixel between the read and the write,
  // the transaction must revert rather than quietly drawing the difference
  // from the float.
  it('bounds the spend at the price it quoted, not at the grant ceiling', async () => {
    chain({ price: PIXEL })
    await post(claim())
    expect(h.writeContract.mock.calls[0][0].args[3]).toBe(PIXEL)
    expect(h.writeContract.mock.calls[0][0].args[3]).not.toBe(193_415n)
  })

  it('sorts and de-duplicates ids so a repeated pixel is not bought twice', async () => {
    await post(claim({ pixelIds: [11, 10, 11] }))
    expect(h.writeContract.mock.calls[0][0].args[1]).toEqual([10n, 11n])
  })

  it('sets a deadline in the near future', async () => {
    await post(claim())
    const deadline = h.writeContract.mock.calls[0][0].args[4] as bigint
    const now = BigInt(Math.floor(Date.now() / 1000))
    expect(deadline).toBeGreaterThan(now)
    expect(deadline).toBeLessThanOrEqual(now + 300n)
  })

  it('reports a failed write as retryable, without leaking the reason', async () => {
    h.writeContract.mockRejectedValue(new Error('replacement fee too low'))
    const { status, body } = await post(claim())
    expect(status).toBe(503)
    expect(body.error).not.toContain('replacement fee')
  })
})

describe('when the campaign is off', () => {
  it('refuses every claim', async () => {
    delete process.env.GRANT_ENABLED
    try {
      expect((await post(claim())).status).toBe(503)
      expect(h.writeContract).not.toHaveBeenCalled()
    } finally {
      process.env.GRANT_ENABLED = '1'
    }
  })
})
