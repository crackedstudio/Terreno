import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * /api/holder — the composition, the fee, and the one thing this endpoint must
 * NOT do: leak the profile URL the rest of the app deliberately hides.
 */
const h = vi.hoisted(() => ({
  fetchOwnedPixelIds: vi.fn(),
  fetchOwnerMapPnl: vi.fn(),
  fetchProfilesFor: vi.fn(),
  fetchAreaLeaderboard: vi.fn(),
  subgraphConfigured: vi.fn(),
  readFeeRateBps: vi.fn(),
}))

vi.mock('@/lib/subgraph', () => ({
  fetchOwnedPixelIds: h.fetchOwnedPixelIds,
  fetchOwnerMapPnl: h.fetchOwnerMapPnl,
  fetchProfilesFor: h.fetchProfilesFor,
  fetchAreaLeaderboard: h.fetchAreaLeaderboard,
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
  getMapContractById: () => ({ address: '0xcontract', width: 10, displayName: 'World' }),
}))

import { GET } from '@/app/api/holder/route'

const LIVE_FEE_BPS = 500

let seq = 0
function freshAddr(): string {
  seq += 1
  return '0x' + seq.toString(16).padStart(40, '0')
}

async function call(addr = freshAddr(), mapId: string | null = '0') {
  const qs = mapId === null ? `?address=${addr}` : `?address=${addr}&mapId=${mapId}`
  const res = await GET(new Request(`http://t/api/holder${qs}`))
  return { status: res.status, body: await res.json(), addr }
}

beforeEach(() => {
  vi.clearAllMocks()
  seq += 1000
  h.subgraphConfigured.mockReturnValue(true)
  h.fetchOwnedPixelIds.mockResolvedValue([])
  h.fetchOwnerMapPnl.mockResolvedValue({ spent: '0', earned: '0' })
  h.fetchProfilesFor.mockResolvedValue([])
  h.fetchAreaLeaderboard.mockResolvedValue([])
  h.readFeeRateBps.mockResolvedValue(LIVE_FEE_BPS)
})

describe('input validation', () => {
  it.each([
    ['a malformed address', '?address=0xnope&mapId=0'],
    ['a missing address', '?mapId=0'],
  ])('rejects %s', async (_l, qs) => {
    const res = await GET(new Request(`http://t/api/holder${qs}`))
    expect(res.status).toBe(400)
  })

  // Number(null) is 0 — a valid map id — so an omitted parameter would
  // otherwise be silently answered for the world map.
  it('rejects an omitted mapId rather than defaulting to map 0', async () => {
    const { status } = await call(freshAddr(), null)
    expect(status).toBe(400)
  })
})

describe('the fee', () => {
  it('reports earnings net of the resale fee, like /api/pnl', async () => {
    h.fetchOwnerMapPnl.mockResolvedValue({ spent: '5000000', earned: '1000000' })
    const { body } = await call()
    expect(body.earned).toBe('950000')
  })

  it('leaves spent gross — the buyer really did pay the whole price', async () => {
    h.fetchOwnerMapPnl.mockResolvedValue({ spent: '5000000', earned: '1000000' })
    const { body } = await call()
    expect(body.spent).toBe('5000000')
  })
})

describe('territory', () => {
  it('reports the largest connected block, not the total held', async () => {
    // Width 10: (0,0),(1,0) touch; (5,5) is alone.
    h.fetchOwnedPixelIds.mockResolvedValue([0, 1, 55])
    const { body } = await call()
    expect(body.pixelCount).toBe(3)
    expect(body.largestBlock).toBe(2)
  })

  it('computes the empire from the FULL holding before capping ids', async () => {
    // 2001 contiguous pixels: more than the transport cap, so an empire
    // computed after truncation would understate it.
    h.fetchOwnedPixelIds.mockResolvedValue(Array.from({ length: 2001 }, (_, i) => i))
    const { body } = await call()
    expect(body.pixelCount).toBe(2001)
    expect(body.largestBlock).toBe(2001)
    expect(body.pixelIds).toHaveLength(2000)
    expect(body.truncated).toBe(true)
  })
})

describe('rank', () => {
  it('is the 1-based position on the LAND board', async () => {
    const addr = freshAddr()
    h.fetchAreaLeaderboard.mockResolvedValue([
      { address: '0xaaa', value: 9 },
      { address: addr, value: 5 },
    ])
    const { body } = await call(addr)
    expect(body.rank).toBe(2)
  })

  it('is null for a wallet that is not on the board', async () => {
    h.fetchAreaLeaderboard.mockResolvedValue([{ address: '0xaaa', value: 9 }])
    const { body } = await call()
    expect(body.rank).toBeNull()
  })

  it('still answers when the board lookup fails', async () => {
    h.fetchAreaLeaderboard.mockRejectedValue(new Error('down'))
    h.fetchOwnedPixelIds.mockResolvedValue([0, 1])
    const { body } = await call()
    expect(body.rank).toBeNull()
    expect(body.pixelCount).toBe(2)
  })
})

describe('the profile URL', () => {
  // The contract stores a URL and updateProfile accepts it, but the app hides
  // it in both places it could render because an unverified link beside a name
  // is a phishing surface. A new endpoint is exactly how that hold gets
  // quietly undone.
  it('is never returned, even when the subgraph supplies one', async () => {
    h.fetchProfilesFor.mockResolvedValue([
      { address: '0xaaa', label: '0x41', color: 123, url: '0x68747470733a2f2f6576696c' },
    ])
    const { body } = await call()
    expect(JSON.stringify(body)).not.toContain('url')
    expect(JSON.stringify(body)).not.toContain('evil')
  })

  it('still returns the label and colour — the control for the case above', async () => {
    h.fetchProfilesFor.mockResolvedValue([
      { address: '0xaaa', label: '0x41', color: 123 },
    ])
    const { body } = await call()
    expect(body.color).toBe(123)
    expect(body.label).not.toBeNull()
  })
})

describe('availability and failure', () => {
  it('flags unavailable without the subgraph rather than rendering an empty holder', async () => {
    h.subgraphConfigured.mockReturnValue(false)
    const { body } = await call()
    expect(body.available).toBe(false)
    expect(h.fetchOwnedPixelIds).not.toHaveBeenCalled()
  })

  it('returns 503 with no detail when a query fails', async () => {
    h.fetchOwnedPixelIds.mockRejectedValue(new Error('subgraph exploded'))
    const { status, body } = await call()
    expect(status).toBe(503)
    expect(JSON.stringify(body)).not.toContain('exploded')
  })

  it('serves a repeat request from the warm cache', async () => {
    const addr = freshAddr()
    await call(addr)
    await call(addr)
    expect(h.fetchOwnedPixelIds).toHaveBeenCalledTimes(1)
  })

  it('recomputes for a different wallet — the control for the cache', async () => {
    await call()
    await call()
    expect(h.fetchOwnedPixelIds).toHaveBeenCalledTimes(2)
  })
})
