import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NimPayPanelView, type NimPayPanelViewProps } from '@/components/Overlays/NimPayPanel'

/**
 * The pay button must not be offered before the wallet transport can be used.
 *
 * The bug this pins, reported twice from a device: the first tap on PAY WITH
 * NIM failed and the player had to tap around three times before a payment
 * went through. `sendNimWithData` has to load the Hub (browser) or the
 * mini-app SDK (Nimiq Pay) before it can send, and doing that inside the tap
 * crosses a task boundary that ends the user gesture the wallet requires. Every
 * one of those wasted taps failed for that reason alone, and the message they
 * produced — "The NIM payment was not completed" — named no cause.
 *
 * Warming the transport on mount shrank the window but did not close it: a
 * player who tapped before the warm finished still hit it. So the button now
 * waits for readiness rather than racing it.
 *
 * Asserted on the view, which is where the button lives and where the decision
 * is made from props.
 */

const BASE: NimPayPanelViewProps = {
  host: 'web',
  status: 'idle',
  quote: null,
  error: null,
  progress: null,
  nimTxHash: null,
  pixelCount: 2,
  hasRecipient: true,
  transportReady: true,
  busy: false,
  onPrimary: vi.fn(),
  onDiscard: vi.fn(),
}

const view = (over: Partial<NimPayPanelViewProps> = {}) =>
  render(<NimPayPanelView {...BASE} {...over} />)

describe('the pay button while the wallet is still loading', () => {
  it('is disabled until the transport is ready', () => {
    view({ transportReady: false })
    expect(screen.getByRole('button', { name: /preparing wallet/i })).toBeDisabled()
  })

  it('says what it is waiting for rather than looking broken', () => {
    view({ transportReady: false })
    expect(screen.getByText(/getting the wallet ready/i)).toBeTruthy()
  })

  // The control. Without it, "disabled while loading" would pass against a
  // button that is disabled always.
  it('control: the same panel is usable once the transport is ready', () => {
    view({ transportReady: true })
    const button = screen.getByRole('button', { name: /get nim price/i })
    expect(button).not.toBeDisabled()
  })

  // Readiness must not override the other reasons a button is unusable, and
  // must not invent a usable one.
  it('still refuses without a wallet, ready or not', () => {
    view({ transportReady: true, hasRecipient: false })
    expect(screen.getByRole('button', { name: /connect wallet first/i })).toBeDisabled()
  })

  it('never offers a payment it cannot deliver', () => {
    view({ transportReady: false })
    // Whatever the label says, the one thing that must be true is that a tap
    // cannot start a payment that is certain to fail.
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
