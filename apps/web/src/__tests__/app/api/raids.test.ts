import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The money-shaped half of /api/raids: how a batch total becomes a per-pixel
 * figure, and whether the resale fee comes off it. Everything else is mocked;
 * `netOfResaleFee` stays real so the arithmetic under test is the arithmetic
 * that ships — the same posture as the /api/pnl suite.
 */
const h = vi.hoisted(() => ({
  fetchRaidsAgainst: vi.fn(),
  fetchProfilesFor: vi.fn(),
  subgraphConfigured: vi.fn(),
  readFeeRateBps: vi.fn(),
}))

vi.mock('@/lib/subgraph', () => ({
  fetchRaidsAgainst: h.fetchRaidsAgainst,
  fetchProfilesFor: h.fetchProfilesFor,
  subgraphConfigured: h.subgraphConfigured,
}))
vi.mock('@/lib/resaleFee', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/resaleFee')>()),
  readFeeRateBps: h.readFeeRateBps,
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/lib/maps/contracts', () => ({
  getMapContractById: () => ({ address: '0xcontract' }),
}))

import { GET } from '@/app/api/raids/route'

const RAIDER = '0x000000000000000000000000000000000000dead'

// The route keeps a warm (mapId, address) cache across requests, so every test
// gets its own wallet and stays independent; the cache tests at the bottom are
// the only place one is deliberately reused.
let walletSeq = 0
function freshVictim(): string {
  walletSeq += 1
  return '0x' + walletSeq.toString(16).padStart(40, '0')
}
const VICTIM = '0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79'
const LIVE_FEE_BPS = 500 // feeRate() on Base mainnet, verified

function purchase(over: Record<string, unknown> = {}) {
  return {
    id: 'tx-0-0',
    pixelId: '4242',
    buyer: RAIDER,
    timestamp: '1700000000',
    txHash: '0xtx',
    pricePaid: '1000000', // $1.00
    batch: { id: 'batch-1', totalCost: '1000000', pixelCountInBatch: 1 },
    ...over,
  }
}

async function call(qs?: string) {
  const query = qs ?? `?address=${freshVictim()}&mapId=0`
  const res = await GET(new Request(`http://t/api/raids${query}`))
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.subgraphConfigured.mockReturnValue(true)
  h.fetchProfilesFor.mockResolvedValue([])
  h.readFeeRateBps.mockResolvedValue(LIVE_FEE_BPS)
  h.fetchRaidsAgainst.mockResolvedValue([])
})

describe('input validation', () => {
  it.each([
    ['a missing address', '?mapId=0'],
    ['a malformed address', '?address=0xnope&mapId=0'],
    ['an address of the wrong length', `?address=${VICTIM.slice(0, 20)}&mapId=0`],
  ])('rejects %s', async (_l, qs) => {
    expect((await call(qs)).status).toBe(400)
  })

  it.each([
    ['a missing mapId', `?address=${VICTIM}`],
    ['a non-numeric mapId', `?address=${VICTIM}&mapId=abc`],
    ['a negative mapId', `?address=${VICTIM}&mapId=-1`],
  ])('rejects %s', async (_l, qs) => {
    expect((await call(qs)).status).toBe(400)
  })
})

describe('the fee', () => {
  // The defect this route is written to avoid: the subgraph credits
  // totalEarned with the gross per-pixel cost, but on chain the seller
  // receives price − fee. Reporting gross states a number the player's own
  // wallet contradicts.
  it('reports what reached the wallet, not what the raider paid', async () => {
    h.fetchRaidsAgainst.mockResolvedValue([purchase()])
    const { body } = await call()
    expect(body.raids[0].earned).toBe('950000') // $1.00 − 5%
  })

  it('reports gross when the fee reads as zero, rather than inventing a cut', async () => {
    h.readFeeRateBps.mockResolvedValue(0)
    h.fetchRaidsAgainst.mockResolvedValue([purchase()])
    const { body } = await call()
    expect(body.raids[0].earned).toBe('1000000')
  })

  it('reads the fee live rather than assuming 5%', async () => {
    h.readFeeRateBps.mockResolvedValue(1000)
    h.fetchRaidsAgainst.mockResolvedValue([purchase()])
    const { body } = await call()
    expect(body.raids[0].earned).toBe('900000')
  })
})

describe('per-pixel split', () => {
  it('uses the exact price for a single-pixel batch', async () => {
    h.fetchRaidsAgainst.mockResolvedValue([
      purchase({ pricePaid: '3000000', batch: { id: 'b', totalCost: '3000000', pixelCountInBatch: 1 } }),
    ])
    const { body } = await call()
    expect(body.raids[0].earned).toBe('2850000') // $3.00 − 5%
  })

  // Pins the precedence rule rather than a coincidence: for a real single-pixel
  // batch pricePaid and totalCost agree, so equal values cannot tell the exact
  // branch from the even-split one. Divergent values can.
  it('prefers the exact price over the batch split when the two disagree', async () => {
    h.fetchRaidsAgainst.mockResolvedValue([
      purchase({
        pricePaid: '2000000',
        batch: { id: 'b', totalCost: '9000000', pixelCountInBatch: 1 },
      }),
    ])
    const { body } = await call()
    expect(body.raids[0].earned).toBe('1900000') // $2.00 − 5%, not $9.00
  })

  // pricePaid is null for multi-pixel batches — the contract emits only a
  // batch total — so the cost is split evenly, matching how mapping.ts
  // already credits totalEarned.
  it('splits a multi-pixel batch evenly when there is no exact price', async () => {
    h.fetchRaidsAgainst.mockResolvedValue([
      purchase({
        id: 'p1',
        pixelId: '1',
        pricePaid: null,
        batch: { id: 'b', totalCost: '4000000', pixelCountInBatch: 4 },
      }),
    ])
    const { body } = await call()
    // One of my four pixels: $4.00/4 = $1.00, less 5%.
    expect(body.raids[0].earned).toBe('950000')
  })

  it('sums only the pixels that were actually mine', async () => {
    const batch = { id: 'b', totalCost: '4000000', pixelCountInBatch: 4 }
    h.fetchRaidsAgainst.mockResolvedValue([
      purchase({ id: 'p1', pixelId: '1', pricePaid: null, batch }),
      purchase({ id: 'p2', pixelId: '2', pricePaid: null, batch }),
    ])
    const { body } = await call()
    // Two of four: $2.00, less 5%.
    expect(body.raids[0].earned).toBe('1900000')
    expect(body.raids[0].pixelCount).toBe(2)
  })

  it('survives a zero-count batch instead of dividing by zero', async () => {
    h.fetchRaidsAgainst.mockResolvedValue([
      purchase({ pricePaid: null, batch: { id: 'b', totalCost: '4000000', pixelCountInBatch: 0 } }),
    ])
    const { body } = await call()
    expect(body.raids[0].earned).toBe('0')
  })
})

describe('grouping', () => {
  it('reports one raid per batch, not one per pixel', async () => {
    const batch = { id: 'b', totalCost: '3000000', pixelCountInBatch: 3 }
    h.fetchRaidsAgainst.mockResolvedValue([
      purchase({ id: 'p1', pixelId: '1', pricePaid: null, batch }),
      purchase({ id: 'p2', pixelId: '2', pricePaid: null, batch }),
      purchase({ id: 'p3', pixelId: '3', pricePaid: null, batch }),
    ])
    const { body } = await call()
    expect(body.raids).toHaveLength(1)
    expect(body.raids[0].pixelIds.sort()).toEqual([1, 2, 3])
  })

  it('keeps separate batches separate', async () => {
    h.fetchRaidsAgainst.mockResolvedValue([
      purchase({ id: 'p1', timestamp: '200', batch: { id: 'b1', totalCost: '1000000', pixelCountInBatch: 1 } }),
      purchase({ id: 'p2', timestamp: '100', batch: { id: 'b2', totalCost: '1000000', pixelCountInBatch: 1 } }),
    ])
    const { body } = await call()
    expect(body.raids).toHaveLength(2)
  })

  it('returns newest first', async () => {
    h.fetchRaidsAgainst.mockResolvedValue([
      purchase({ id: 'old', timestamp: '100', batch: { id: 'b1', totalCost: '1000000', pixelCountInBatch: 1 } }),
      purchase({ id: 'new', timestamp: '900', batch: { id: 'b2', totalCost: '1000000', pixelCountInBatch: 1 } }),
    ])
    const { body } = await call()
    expect(body.raids[0].timestamp).toBe('900')
  })
})

describe('availability', () => {
  // "No raids" and "cannot tell" must not render the same, or the deed states
  // something unverified as fact.
  it('flags unavailable when the subgraph is not configured', async () => {
    h.subgraphConfigured.mockReturnValue(false)
    const { body } = await call()
    expect(body).toEqual({ raids: [], available: false })
    expect(h.fetchRaidsAgainst).not.toHaveBeenCalled()
  })

  it('flags available with an empty list when the wallet has never been raided', async () => {
    h.fetchRaidsAgainst.mockResolvedValue([])
    const { body } = await call()
    expect(body).toEqual({ raids: [], available: true })
  })
})

describe('failure handling', () => {
  it('returns 503 with no detail when the query fails', async () => {
    h.fetchRaidsAgainst.mockRejectedValue(new Error('subgraph down'))
    const { status, body } = await call()
    expect(status).toBe(503)
    expect(JSON.stringify(body)).not.toContain('subgraph down')
  })

  it('still returns raids when the profile lookup fails', async () => {
    h.fetchRaidsAgainst.mockResolvedValue([purchase()])
    h.fetchProfilesFor.mockRejectedValue(new Error('no profiles'))
    const { body } = await call()
    expect(body.raids).toHaveLength(1)
    expect(body.raids[0].raiderLabel).toBeNull()
  })
})


describe('the warm cache', () => {
  it('serves a repeat request within the TTL without re-querying', async () => {
    const victim = freshVictim()
    h.fetchRaidsAgainst.mockResolvedValue([purchase()])

    await call(`?address=${victim}&mapId=0`)
    await call(`?address=${victim}&mapId=0`)

    expect(h.fetchRaidsAgainst).toHaveBeenCalledTimes(1)
  })

  it('recomputes for a different wallet — the control for the case above', async () => {
    h.fetchRaidsAgainst.mockResolvedValue([purchase()])

    await call(`?address=${freshVictim()}&mapId=0`)
    await call(`?address=${freshVictim()}&mapId=0`)

    expect(h.fetchRaidsAgainst).toHaveBeenCalledTimes(2)
  })

  it('does not serve one map’s raids for another', async () => {
    const victim = freshVictim()
    h.fetchRaidsAgainst.mockResolvedValue([purchase()])

    await call(`?address=${victim}&mapId=0`)
    await call(`?address=${victim}&mapId=1`)

    expect(h.fetchRaidsAgainst).toHaveBeenCalledTimes(2)
  })
})

describe('reconciliation with /api/pnl', () => {
  /**
   * Verified against the live subgraph before this was written: for a wallet
   * raided three times, per-raid GROSS summed to exactly the indexer's
   * `OwnerMapStat.totalEarned`. This pins the property that made that true —
   * the even split reproduces the indexer's arithmetic — and bounds the NET
   * drift that comes from netting per raid instead of once on the aggregate.
   */
  const REAL = {
    // batch, pixels-taken, batch-total, batch-count  (from mainnet, map 0)
    batches: [
      { id: 'b1', took: 4, total: '226256', count: 4, ts: '300' },
      { id: 'b2', took: 1, total: '59314', count: 1, ts: '200' },
      { id: 'b3', took: 1, total: '59315', count: 1, ts: '100' },
    ],
    indexedTotalEarnedGross: 344885n,
  }

  beforeEach(() => {
    h.fetchRaidsAgainst.mockResolvedValue(
      REAL.batches.flatMap((b) =>
        Array.from({ length: b.took }, (_, i) => ({
          id: `${b.id}-${i}`,
          pixelId: String(i),
          buyer: RAIDER,
          timestamp: b.ts,
          txHash: '0xtx',
          pricePaid: null,
          batch: { id: b.id, totalCost: b.total, pixelCountInBatch: b.count },
        })),
      ),
    )
  })

  it('per-raid gross sums to the indexer’s totalEarned exactly', async () => {
    h.readFeeRateBps.mockResolvedValue(0) // gross
    const { body } = await call()
    const sum = body.raids.reduce((a: bigint, r: { earned: string }) => a + BigInt(r.earned), 0n)
    expect(sum).toBe(REAL.indexedTotalEarnedGross)
  })

  it('per-raid net drifts from the aggregate net by at most 1 microcent per raid', async () => {
    h.readFeeRateBps.mockResolvedValue(LIVE_FEE_BPS)
    const { body } = await call()
    const perRaid = body.raids.reduce((a: bigint, r: { earned: string }) => a + BigInt(r.earned), 0n)

    const g = REAL.indexedTotalEarnedGross
    const aggregate = g - (g * BigInt(LIVE_FEE_BPS)) / 10_000n

    const drift = perRaid - aggregate
    expect(drift).toBeGreaterThanOrEqual(0n)
    expect(drift).toBeLessThanOrEqual(BigInt(body.raids.length))
  })
})
