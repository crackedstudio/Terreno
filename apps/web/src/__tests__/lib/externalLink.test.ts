import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * A share has to leave Nimiq Pay.
 *
 * The bug this pins, reported from a device: tapping X inside the Nimiq Pay
 * mini app opened x.com in the host's OWN in-app browser. The player was not
 * signed in there, so the composer they were sent to could not post — the
 * broadcast simply did not happen. The https URL is not at fault and neither
 * is the copy; what fails is that a WebView keeps `window.open` to itself.
 *
 * So the assertions are about which URL is handed to the platform, and where
 * the fallback does and does not fire — asserting "openExternal was called"
 * would have passed against the broken code.
 */

const isNimiqPay = vi.fn(() => false)
vi.mock('@/lib/nimiq', () => ({ isNimiqPay: () => isNimiqPay() }))

import { openExternal, HANDOFF_MS } from '@/lib/externalLink'

const WEB = 'https://x.com/intent/tweet?text=hi'
const APP = 'twitter://post?message=hi'

/** Every anchor this module clicks, in order, with clicks recorded. */
function trackAnchors(): string[] {
  const hrefs: string[] = []
  const realClick = HTMLAnchorElement.prototype.click
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    hrefs.push(this.href)
    return realClick
  })
  return hrefs
}

/** `location.href` assignments, which jsdom otherwise tries to navigate on. */
function trackLocation(): string[] {
  const assigned: string[] = []
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...window.location,
      get href() {
        return 'http://localhost/'
      },
      set href(v: string) {
        assigned.push(v)
      },
    },
  })
  return assigned
}

let hidden = false
beforeEach(() => {
  vi.useFakeTimers()
  isNimiqPay.mockReturnValue(false)
  hidden = false
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('openExternal in an ordinary browser', () => {
  it('opens the https URL and never touches a native scheme', () => {
    const clicks = trackAnchors()
    const navigations = trackLocation()

    openExternal({ web: WEB, app: APP })
    vi.advanceTimersByTime(HANDOFF_MS * 2)

    expect(clicks).toEqual([WEB])
    // The control for the test below: outside a host WebView the scheme is
    // never used, so "the scheme was used" there means the host caused it.
    expect(navigations).toEqual([])
  })
})

describe('openExternal inside Nimiq Pay', () => {
  beforeEach(() => isNimiqPay.mockReturnValue(true))

  it('hands the native scheme to the OS instead of opening in the WebView', () => {
    const clicks = trackAnchors()
    const navigations = trackLocation()

    openExternal({ web: WEB, app: APP })

    expect(navigations).toEqual([APP])
    // Nothing opens in the host's browser while the hand-off is in flight.
    expect(clicks).toEqual([])
  })

  it('falls back to the https URL when the app is not installed', () => {
    const clicks = trackAnchors()
    trackLocation()

    openExternal({ web: WEB, app: APP })
    // Nothing backgrounded the page: the scheme went nowhere.
    vi.advanceTimersByTime(HANDOFF_MS)

    expect(clicks).toEqual([WEB])
  })

  it('does not open twice when the hand-off worked', () => {
    const clicks = trackAnchors()
    trackLocation()

    openExternal({ web: WEB, app: APP })
    // The OS switched apps: the page is backgrounded before the timer fires.
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(HANDOFF_MS * 2)

    expect(clicks).toEqual([])
  })

  it('does not open twice when only `pagehide` fires', () => {
    const clicks = trackAnchors()
    trackLocation()

    openExternal({ web: WEB, app: APP })
    window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(HANDOFF_MS * 2)

    expect(clicks).toEqual([])
  })

  it('opens the https URL directly for a target with no native scheme', () => {
    const clicks = trackAnchors()
    const navigations = trackLocation()

    openExternal({ web: WEB })
    vi.advanceTimersByTime(HANDOFF_MS * 2)

    expect(navigations).toEqual([])
    expect(clicks).toEqual([WEB])
  })
})
