import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SelectionDrawer from '@/components/Overlays/SelectionDrawer'

/**
 * A settled NIM purchase has to end the claim form.
 *
 * The bug this pins: `NimPayPanel` announced settlement through `onSettled`,
 * but the drawer rendered it without that prop, and the drawer's own success
 * screen is gated on `txStep`, which comes from `useBuyPixels` and stays
 * 'idle' for the whole NIM flow. So a player who paid successfully in NIM was
 * left looking at the unchanged claim form — no receipt, and no way out that
 * cleared the selection or refreshed the map.
 *
 * The assertions therefore run through the SEAM, not the panel in isolation:
 * the panel is rendered by the drawer, and what is checked is what the player
 * ends up looking at. Asserting `onSettled` was called would have passed
 * against the broken code, because the panel was always willing to call a
 * callback nobody passed it.
 */

// Inside Nimiq Pay — otherwise the panel renders nothing at all.
vi.mock('@/lib/nimiq', () => ({ isNimiqPay: () => true }))
vi.mock('@/lib/nim/config', () => ({ nimPayPreviewEnabled: () => false }))

// The payment itself is not under test; its terminal state is.
const nimPayment = {
  status: 'idle' as string,
  quote: null as { nim: string; bufferBps: number } | null,
  error: null,
  progress: null,
  nimTxHash: null as string | null,
  baseTxHash: null as string | null,
  busy: false,
  getQuote: vi.fn(),
  payAndSettle: vi.fn(),
  reset: vi.fn(),
}
vi.mock('@/hooks/useNimPayment', () => ({
  useNimPayment: () => nimPayment,
}))

vi.mock('@/hooks/useStablecoinBalance', () => ({
  useStablecoinBalance: () => ({ preferred: { symbol: 'USDC', decimals: 6 } }),
}))
vi.mock('@/hooks/useMaps', () => ({
  useMaps: () => ({ currentMapId: 0, mapName: 'WORLD' }),
}))
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), getReferrer: () => null }))

function renderDrawer(onDone = vi.fn()) {
  const selectedIds = new Set([1127, 1295])
  return {
    onDone,
    ...render(
      <SelectionDrawer
        visible
        selectedIds={selectedIds}
        pixelData={[]}
        totalPrice={54104n}
        priceLoading={false}
        insufficientBalance={false}
        userBalance={10_000_000n}
        txStep="idle"
        txHash={null}
        txError={null}
        userAddress="0xa2acF88b757182e5cf56Bc7B9bb11d54F5b98022"
        onRemovePixels={vi.fn()}
        onClear={vi.fn()}
        onBuy={vi.fn()}
        onConfirmPurchase={vi.fn()}
        onDone={onDone}
      />,
    ),
  }
}

describe('a settled NIM purchase', () => {
  beforeEach(() => {
    nimPayment.status = 'idle'
    nimPayment.quote = null
    nimPayment.baseTxHash = null
    vi.clearAllMocks()
  })

  /**
   * Control for the two absence-assertions below: with the payment idle the
   * form IS on screen, so "the form is gone" after settlement means the
   * settlement removed it — not that it was never rendered.
   */
  it('control: before paying, the claim form is on screen', () => {
    renderDrawer()
    expect(screen.queryByText(/BACK TO THE ATLAS/i)).toBeNull()
    expect(screen.getByText(/UNSTAMPED/i)).toBeTruthy()
  })

  it('replaces the claim form with the stamped receipt', () => {
    nimPayment.status = 'settled'
    nimPayment.quote = { nim: '1,687.4', bufferBps: 300 }
    nimPayment.baseTxHash = '0x331a97a3ca3574d7dee67a6615bfb2017b4e7027c62b2d13f6ecb4fd49f270e9'

    renderDrawer()

    // The receipt is up, priced in what the player actually sent, not in
    // USDC. (`ON THE RECORD` is deliberately not asserted on — one of the
    // random celebration lines contains the same phrase.)
    expect(screen.getByText(/PAID 1,687\.4 NIM/i)).toBeTruthy()
    expect(screen.getByText(/BACK TO THE ATLAS/i)).toBeTruthy()
    // ...and the form it replaced is gone, so there is no stale LOCK IT IN
    // button inviting a second payment for land already bought.
    expect(screen.queryByText(/UNSTAMPED/i)).toBeNull()
  })

  it('offers the way out that clears the selection and refreshes the map', () => {
    nimPayment.status = 'settled'
    nimPayment.quote = { nim: '1,687.4', bufferBps: 300 }

    const onDone = vi.fn()
    renderDrawer(onDone)

    fireEvent.click(screen.getByText(/BACK TO THE ATLAS/i))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('still shows the receipt when the purchase had already been settled', () => {
    // The already-settled retry path returns no Base hash. The player still
    // paid and still owns the land, so they still get the receipt.
    nimPayment.status = 'settled'
    nimPayment.quote = { nim: '1,687.4', bufferBps: 300 }
    nimPayment.baseTxHash = null

    renderDrawer()
    expect(screen.getByText(/PAID 1,687\.4 NIM/i)).toBeTruthy()
    expect(screen.queryByText(/UNSTAMPED/i)).toBeNull()
  })
})
