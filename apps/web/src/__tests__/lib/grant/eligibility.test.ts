import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The one gate that stops `/api/grant/claim` being a faucet.
 *
 * The tests that matter here are not the happy path — they are the three ways
 * this could quietly start granting to everybody, and the one way it could
 * start refusing everybody. All four are pinned.
 */

const h = vi.hoisted(() => ({
  fetchOwnerPnl: vi.fn(),
  subgraphConfigured: vi.fn(),
}))

vi.mock('@/lib/subgraph', () => ({
  fetchOwnerPnl: h.fetchOwnerPnl,
  subgraphConfigured: h.subgraphConfigured,
}))

import { EligibilityUnknownError, checkGrantEligibility } from '@/lib/grant/eligibility'

const ADDR = '0x8db1eaad99ef3a4c2ae4479d0570c00e12be3f79'

beforeEach(() => {
  vi.clearAllMocks()
  h.subgraphConfigured.mockReturnValue(true)
})

describe('checkGrantEligibility', () => {
  it('grants a wallet that has never spent anything', async () => {
    h.fetchOwnerPnl.mockResolvedValue({ spent: '0', earned: '0' })
    await expect(checkGrantEligibility(ADDR)).resolves.toEqual({ eligible: true })
  })

  it('refuses a wallet that has bought before', async () => {
    h.fetchOwnerPnl.mockResolvedValue({ spent: '30000', earned: '0' })
    const verdict = await checkGrantEligibility(ADDR)
    expect(verdict.eligible).toBe(false)
  })

  // The cheapest possible purchase is one micro (minPrice). A `> 0` boundary
  // written as `>= 1000` or similar would let a wallet buy the cheapest pixel
  // on the map and still collect a grant.
  it('refuses at one single micro of lifetime spend', async () => {
    h.fetchOwnerPnl.mockResolvedValue({ spent: '1', earned: '0' })
    expect((await checkGrantEligibility(ADDR)).eligible).toBe(false)
  })

  // A granted player's own grant is what makes them ineligible next time —
  // `PixelsPurchased` names the recipient, so the subgraph bills the spend to
  // them. If this ever stops holding, the grant becomes repeatable.
  it('refuses a wallet whose only acquisition was a previous grant', async () => {
    h.fetchOwnerPnl.mockResolvedValue({ spent: '193415', earned: '0' })
    expect((await checkGrantEligibility(ADDR)).eligible).toBe(false)
  })

  it('does not confuse earnings with spend', async () => {
    // A wallet that has earned but never spent cannot exist on this contract,
    // but if the subgraph ever produced one it must not be read as a buyer.
    h.fetchOwnerPnl.mockResolvedValue({ spent: '0', earned: '999999' })
    expect((await checkGrantEligibility(ADDR)).eligible).toBe(true)
  })

  /* ---- "could not tell" must never become "no" ------------------------- */

  it('throws rather than refusing when the subgraph is unconfigured', async () => {
    h.subgraphConfigured.mockReturnValue(false)
    await expect(checkGrantEligibility(ADDR)).rejects.toBeInstanceOf(EligibilityUnknownError)
    expect(h.fetchOwnerPnl).not.toHaveBeenCalled()
  })

  it('throws rather than refusing when the subgraph lookup fails', async () => {
    h.fetchOwnerPnl.mockRejectedValue(new Error('subgraph HTTP 502'))
    await expect(checkGrantEligibility(ADDR)).rejects.toBeInstanceOf(EligibilityUnknownError)
  })

  // A non-numeric totalSpent would make `BigInt()` throw inside the route's
  // try block and be reported as a generic failure. Caught here instead, as
  // the "cannot tell" it actually is — and never as `> 0n` being false, which
  // is what a bare `Number(spent) > 0` would produce for "abc" (NaN > 0 ===
  // false) — i.e. a grant.
  it('throws rather than granting when totalSpent is not a number', async () => {
    h.fetchOwnerPnl.mockResolvedValue({ spent: 'abc', earned: '0' })
    await expect(checkGrantEligibility(ADDR)).rejects.toBeInstanceOf(EligibilityUnknownError)
  })

  it('throws rather than granting when totalSpent is empty', async () => {
    h.fetchOwnerPnl.mockResolvedValue({ spent: '', earned: '0' })
    await expect(checkGrantEligibility(ADDR)).rejects.toBeInstanceOf(EligibilityUnknownError)
  })

  // The control for the assertions above: with the subgraph healthy and the
  // wallet clean, the code path under test really does reach a grant. Without
  // this, every "throws" test above would still pass against a function that
  // threw unconditionally.
  it('control: the same call path does grant when everything is healthy', async () => {
    h.fetchOwnerPnl.mockResolvedValue({ spent: '0', earned: '0' })
    expect((await checkGrantEligibility(ADDR)).eligible).toBe(true)
    expect(h.fetchOwnerPnl).toHaveBeenCalledWith(ADDR)
  })
})
