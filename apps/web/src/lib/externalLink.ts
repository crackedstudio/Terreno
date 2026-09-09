import { isNimiqPay } from '@/lib/nimiq'

/**
 * Leaving the app we are running inside.
 *
 * Terreno runs as a Nimiq Pay mini app, which is a WebView. Inside one, an
 * https link does not reach the phone's browser or the destination's native
 * app — the host loads it in its own in-app browser. For a share that is the
 * whole failure: the player lands on x.com logged out, inside Nimiq Pay, and
 * the post never gets written.
 *
 * The Nimiq mini-app SDK exposes nothing for this. Checked, not assumed: the
 * installed `@nimiq/mini-app-sdk` 0.1.0 bundle contains no `postMessage`, no
 * host bridge and no open-url call of any kind — `window.nimiqPay` carries
 * exactly `language` and `requestDeviceIdentifier`, and `window.nimiq` is the
 * wallet provider. nimiq.dev/mini-apps documents `nimiqpay://` for *entering*
 * a mini app and says nothing about leaving one. So the escape has to be made
 * out of ordinary web navigation.
 *
 * **What this module exists to get right, after a first attempt that did not
 * work on a device.** That attempt opened things programmatically: a
 * `window.location.href = 'twitter://…'` assignment, and a detached
 * `<a>.click()` for the fallback. Both are *synthetic* navigations. A WebView
 * host decides what to do with a navigation from its delegate
 * (`decidePolicyForNavigationAction` on iOS, `shouldOverrideUrlLoading` on
 * Android), and the signal hosts overwhelmingly key on is whether the
 * navigation was a real link activation — `.linkActivated` on iOS. A
 * script-driven assignment or a synthetic `.click()` arrives as `.other`, the
 * category hosts keep to themselves. So the same URL escapes or does not
 * escape depending on how the tap reached it.
 *
 * Hence the shape here: this module does not open anything. It hands the
 * caller the href to put on a REAL anchor that the player's own finger taps,
 * so the navigation the host sees is a genuine link activation. See
 * `ShareButton`.
 *
 * The second thing that attempt got wrong was the fallback. When the scheme
 * did not resolve it opened the https URL — in the in-app browser, which is
 * precisely the symptom being fixed. Stranding is now reported to the caller
 * instead ({@link watchHandoff}), so the player is offered the clipboard and
 * an explicit choice rather than silently handed the broken outcome.
 */

/**
 * How long to wait for the OS to switch apps before deciding it will not.
 *
 * Measured against the slow end of a cold app launch: a hand-off that works
 * backgrounds this page in well under a second, and anything longer than this
 * reads as a dead tap.
 */
export const HANDOFF_MS = 1200

export interface ExternalTarget {
  /** The https URL. Works everywhere, and is all a normal browser needs. */
  web: string
  /**
   * The destination's native scheme, e.g. `twitter://post?message=…`. Used
   * only inside an embedded WebView, where `web` cannot get out.
   */
  app?: string
}

/**
 * Are we running inside somebody else's app rather than a browser?
 *
 * Deliberately wider than `isNimiqPay()`. The first version gated the whole
 * escape on `window.nimiqPay` being present, which is only true for a page
 * Nimiq Pay opened as a registered mini app — a player who reached Terreno
 * through a link inside the wallet is in the same WebView with the same
 * problem and none of that object, and got the plain https path.
 *
 * `; wv)` is the Android WebView token (the same one `userAgentInsight` reads
 * server-side). On iOS every browser is WebKit and only real Safari carries a
 * `Safari/` token, so an iOS UA without one is an embedded WKWebView.
 */
export function isEmbeddedWebView(userAgent?: string): boolean {
  if (isNimiqPay()) return true
  const ua = userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent)
  if (!ua) return false
  if (/;\s*wv\)/.test(ua)) return true
  return /\b(iPhone|iPad|iPod)\b/.test(ua) && !/Safari\//.test(ua)
}

/**
 * The href to put on the anchor the player taps.
 *
 * Inside a WebView that is the native scheme, so the host's delegate is handed
 * something it cannot render itself and has to pass to the OS. Everywhere else
 * it is the https URL, unchanged — a browser already does the right thing and
 * a scheme would only strand desktop users on an "open in app?" dialog.
 */
export function externalHref(target: ExternalTarget, embedded: boolean): string {
  return embedded && target.app ? target.app : target.web
}

/**
 * `target="_blank"` belongs on an https link and nowhere near a scheme: a new
 * tab pointed at `twitter://` is a blank tab in a browser and the in-app
 * browser in a WebView, which is the thing being avoided.
 */
export function shouldOpenInNewTab(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://')
}

/**
 * Watch whether the tap actually left the app, and say so if it did not.
 *
 * Call it from the anchor's `onClick`, without preventing the default — the
 * navigation must stay the player's own. `onStranded` runs only when the page
 * is still in front {@link HANDOFF_MS} later, which means the host neither
 * handed the scheme to the OS nor had an app to hand it to.
 *
 * Returns a cancel function for callers that unmount first.
 */
export function watchHandoff(onStranded: () => void, ms: number = HANDOFF_MS): () => void {
  if (typeof window === 'undefined') return () => {}

  let settled = false
  const settle = () => {
    settled = true
  }
  const onVisibility = () => {
    if (document.hidden) settle()
  }

  window.addEventListener('pagehide', settle)
  document.addEventListener('visibilitychange', onVisibility)

  const cleanup = () => {
    window.removeEventListener('pagehide', settle)
    document.removeEventListener('visibilitychange', onVisibility)
  }

  const timer = window.setTimeout(() => {
    cleanup()
    // `document.hidden` is re-read rather than trusted to the listeners: a
    // hand-off that happened before they were attached would otherwise be
    // read as a strand and nag a player who did nothing wrong.
    if (settled || document.hidden) return
    onStranded()
  }, ms)

  return () => {
    cleanup()
    window.clearTimeout(timer)
  }
}
