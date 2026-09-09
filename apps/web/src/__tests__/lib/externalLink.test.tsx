import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

/**
 * A share has to leave Nimiq Pay.
 *
 * The bug, reported from a device twice: tapping X inside the Nimiq Pay mini
 * app opened x.com in the host's OWN in-app browser, where the player is not
 * signed in, so the post could not be written at all.
 *
 * The first fix opened the native scheme from script — a `location.href`
 * assignment, with a synthetic `<a>.click()` as fallback — and did NOT work.
 * A WebView host decides whether to hand a navigation to the OS from its
 * navigation delegate, and what it keys on is whether the navigation was a
 * real link activation; a script-driven one is not, and stays in the in-app
 * browser. So these assertions are about the ELEMENT the player taps and the
 * href it carries, not about a function having been called — "openExternal
 * was called" is exactly what passed while the bug shipped.
 */

const isNimiqPay = vi.fn(() => false)
vi.mock('@/lib/nimiq', () => ({ isNimiqPay: () => isNimiqPay() }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), getReferrer: () => null }))

import { ShareButton } from '@/components/ShareButton'
import {
  isEmbeddedWebView,
  externalHref,
  shouldOpenInNewTab,
  watchHandoff,
  HANDOFF_MS,
} from '@/lib/externalLink'

const IOS_WEBVIEW =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const ANDROID_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

beforeEach(() => {
  isNimiqPay.mockReturnValue(false)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('isEmbeddedWebView', () => {
  it('is true inside Nimiq Pay whatever the UA says', () => {
    isNimiqPay.mockReturnValue(true)
    expect(isEmbeddedWebView(ANDROID_CHROME)).toBe(true)
  })

  it('is true for an Android WebView and an iOS WKWebView', () => {
    expect(isEmbeddedWebView(ANDROID_WEBVIEW)).toBe(true)
    expect(isEmbeddedWebView(IOS_WEBVIEW)).toBe(true)
  })

  // The control: without it "embedded" could be true for everyone and every
  // assertion below would pass against a component that always uses schemes.
  it('is false in a real mobile browser', () => {
    expect(isEmbeddedWebView(ANDROID_CHROME)).toBe(false)
    expect(isEmbeddedWebView(IOS_SAFARI)).toBe(false)
  })

  /**
   * The regression the widening exists for. The first version gated on
   * `window.nimiqPay`, which a page opened from a link inside the wallet does
   * not have — same WebView, same trapped share, and it got the https path.
   */
  it('is true in a host WebView that injected no mini-app context', () => {
    isNimiqPay.mockReturnValue(false)
    expect(isEmbeddedWebView(ANDROID_WEBVIEW)).toBe(true)
  })
})

describe('externalHref', () => {
  const target = { web: 'https://x.com/intent/tweet?text=hi', app: 'twitter://post?message=hi' }

  it('points at the native app inside a WebView', () => {
    expect(externalHref(target, true)).toBe(target.app)
  })

  it('points at the web everywhere else, and whenever there is no app link', () => {
    expect(externalHref(target, false)).toBe(target.web)
    expect(externalHref({ web: target.web }, true)).toBe(target.web)
  })

  it('keeps _blank off a scheme link and on an https one', () => {
    expect(shouldOpenInNewTab(target.app)).toBe(false)
    expect(shouldOpenInNewTab(target.web)).toBe(true)
  })
})

describe('watchHandoff', () => {
  beforeEach(() => vi.useFakeTimers())

  it('reports a strand when the page never went away', () => {
    const stranded = vi.fn()
    watchHandoff(stranded)
    vi.advanceTimersByTime(HANDOFF_MS)
    expect(stranded).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when the OS switched apps', () => {
    const stranded = vi.fn()
    watchHandoff(stranded)
    window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(HANDOFF_MS * 2)
    expect(stranded).not.toHaveBeenCalled()
  })

  it('stays quiet when the page was merely hidden', () => {
    const stranded = vi.fn()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    watchHandoff(stranded)
    vi.advanceTimersByTime(HANDOFF_MS * 2)
    expect(stranded).not.toHaveBeenCalled()
    hidden.mockRestore()
  })

  it('can be cancelled by a caller that unmounts first', () => {
    const stranded = vi.fn()
    watchHandoff(stranded)()
    vi.advanceTimersByTime(HANDOFF_MS * 2)
    expect(stranded).not.toHaveBeenCalled()
  })
})

/** Open the share menu and hand back the X row. */
function openMenu() {
  render(<ShareButton kind="invite" params={{ mapId: 0 }} label="SHARE" />)
  fireEvent.click(screen.getByText('SHARE'))
  return screen.getByRole('menuitem', { name: /^X$/i })
}

describe('the X row a player actually taps', () => {
  it('is a link, not a button — the host has to see a link activation', () => {
    const x = openMenu()
    expect(x.tagName).toBe('A')
  })

  it('carries the https intent in a normal browser', () => {
    const x = openMenu()
    expect(x.getAttribute('href')).toMatch(/^https:\/\/x\.com\/intent\/tweet\?/)
    expect(x.getAttribute('target')).toBe('_blank')
  })

  it('carries the native scheme inside Nimiq Pay, and does not aim it at a new tab', () => {
    isNimiqPay.mockReturnValue(true)
    const x = openMenu()
    expect(x.getAttribute('href')).toMatch(/^twitter:\/\/post\?message=/)
    // A `_blank` scheme link lands in the in-app browser — the whole symptom.
    expect(x.getAttribute('target')).toBeNull()
  })

  it('sends the brag text and the share link along with it', () => {
    isNimiqPay.mockReturnValue(true)
    const href = openMenu().getAttribute('href') ?? ''
    const message = decodeURIComponent(href.split('message=')[1] ?? '')
    expect(message).toContain('@PlayTerreno')
    expect(message).toContain('https://qrco.de/bgvujx')
  })
})

describe('when the tap goes nowhere', () => {
  beforeEach(() => {
    isNimiqPay.mockReturnValue(true)
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => {}) },
    })
  })

  // The control for the two assertions below: nothing is said before the
  // watchdog has had a chance to conclude anything.
  it('control: says nothing while the hand-off might still be happening', () => {
    fireEvent.click(openMenu())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('tells the player, and copies the post so they can paste it', () => {
    fireEvent.click(openMenu())
    act(() => {
      vi.advanceTimersByTime(HANDOFF_MS)
    })

    expect(screen.getByRole('status').textContent).toMatch(/didn't open/i)
    expect(navigator.clipboard.writeText).toHaveBeenCalledOnce()
  })

  /**
   * The regression that made the first fix indistinguishable from no fix: the
   * fallback opened the https URL, which inside the WebView IS the in-app
   * browser. Reopening it is now the player's choice and nobody else's.
   */
  it('does not reopen the share in the in-app browser by itself', () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    fireEvent.click(openMenu())
    act(() => {
      vi.advanceTimersByTime(HANDOFF_MS * 3)
    })

    expect(opened).not.toHaveBeenCalled()
    // The way out is offered as a link, and only that.
    const escape = screen.getByRole('link', { name: /open in this app instead/i })
    expect(escape.getAttribute('href')).toMatch(/^https:\/\/x\.com\/intent\/tweet\?/)
  })
})
