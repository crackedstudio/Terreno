import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

/**
 * A stale quote must never reach the wallet.
 *
 * The defect this pins is a money-path one. `/api/nim/settle` rejects an order
 * whose `expiresAt` has passed, and it does that check BEFORE it looks at the
 * payment — so a player who left the claim form open, came back and tapped PAY
 * sent real NIM to the treasury and then got a 400 the poll loop treats as
 * final. No land, no refund path, and nothing on screen had told them the
 * price had gone off.
 *
 * The window that has to fit inside the quote is the whole settlement wait,
 * not the tap: settlement is polled for ~3 minutes after the payment, and a
 * quote that expires during those 3 minutes fails exactly the same way.
 *
 * Asserted on `sendNimWithData` — whether the money moved — rather than on the
 * hook's status, because the status was never the thing that hurt anyone.
 */

const sendNimWithData = vi.fn()
vi.mock('@/lib/nimiqProvider', () => ({
  sendNimWithData: (...args: unknown[]) => sendNimWithData(...args),
  NimiqProviderError: class NimiqProviderError extends Error {},
}))
vi.mock('@/lib/nimiq', () => ({ isNimiqPay: () => true }))

import { useNimPayment } from '@/hooks/useNimPayment'
import {
  isQuotePayable,
  quoteMsRemaining,
  SETTLEMENT_WINDOW_MS,
} from '@/lib/nim/quote'

const NOW = 1_760_000_000_000
const nowSeconds = () => Math.floor(NOW / 1000)

function quoteExpiringIn(seconds: number) {
  return {
    order: { mapId: 0 },
    tag: 'a'.repeat(64),
    treasury: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
    luna: '168740000',
    nim: '1,687.4',
    usdMicros: '54104',
    bufferBps: 300,
    expiresAt: nowSeconds() + seconds,
  }
}

/** Drive the hook to `quoted` with a quote of the given remaining life. */
async function quotedWith(seconds: number) {
  const quote = quoteExpiringIn(seconds)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(quote), { status: 200 })),
  )
  const hook = renderHook(() => useNimPayment(0, '0xa2acF88b757182e5cf56Bc7B9bb11d54F5b98022'))
  await act(async () => {
    await hook.result.current.getQuote([1127])
  })
  await waitFor(() => expect(hook.result.current.status).toBe('quoted'))
  return hook
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  sendNimWithData.mockReset()
  sendNimWithData.mockResolvedValue('b'.repeat(64))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('isQuotePayable', () => {
  it('is false for a quote with nothing left', () => {
    expect(isQuotePayable(quoteExpiringIn(-1))).toBe(false)
  })

  it('is false inside the settlement window, where paying loses the NIM', () => {
    // Still unexpired — and still unsafe, which is the whole point.
    expect(quoteMsRemaining(quoteExpiringIn(60))).toBeGreaterThan(0)
    expect(isQuotePayable(quoteExpiringIn(60))).toBe(false)
  })

  it('is exact at the boundary rather than approximately right', () => {
    const edge = SETTLEMENT_WINDOW_MS / 1000
    expect(isQuotePayable(quoteExpiringIn(edge))).toBe(false)
    expect(isQuotePayable(quoteExpiringIn(edge + 1))).toBe(true)
  })

  it('is false with no quote at all', () => {
    expect(isQuotePayable(null)).toBe(false)
  })
})

describe('paying against a quote', () => {
  // The control. Without it "the payment was refused" below would pass against
  // a hook that never pays for any reason at all.
  it('control: a fresh quote does send the NIM', async () => {
    const hook = await quotedWith(900)
    await act(async () => {
      await hook.result.current.payAndSettle()
    })
    expect(sendNimWithData).toHaveBeenCalledTimes(1)
  })

  it('refuses a quote that has expired outright', async () => {
    const hook = await quotedWith(900)
    // The player left the form open past the TTL and came back to it.
    act(() => {
      vi.setSystemTime(NOW + 901_000)
    })
    await act(async () => {
      await hook.result.current.payAndSettle()
    })
    expect(sendNimWithData).not.toHaveBeenCalled()
  })

  it('refuses a quote that would expire mid-settlement', async () => {
    const hook = await quotedWith(900)
    // 60s of TTL left — enough to pay, not enough to settle.
    act(() => {
      vi.setSystemTime(NOW + 840_000)
    })
    await act(async () => {
      await hook.result.current.payAndSettle()
    })
    expect(sendNimWithData).not.toHaveBeenCalled()
  })

  it('drops the stale quote and says so, so the next tap re-prices', async () => {
    const hook = await quotedWith(900)
    act(() => {
      vi.setSystemTime(NOW + 901_000)
    })
    await act(async () => {
      await hook.result.current.payAndSettle()
    })
    expect(hook.result.current.quote).toBeNull()
    expect(hook.result.current.status).toBe('idle')
    expect(hook.result.current.error).toMatch(/fresh NIM price/i)
  })
})
