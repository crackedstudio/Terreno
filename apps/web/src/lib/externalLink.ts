import { isNimiqPay } from '@/lib/nimiq'

/**
 * Opening a link that has to leave the app we are running inside.
 *
 * Terreno runs as a Nimiq Pay mini app, which is a WebView. Inside one,
 * `window.open(url, '_blank')` does not reach the phone's browser or the
 * destination's native app — the host swallows it and renders the page in its
 * own in-app browser. For a share that is the whole failure: the player lands
 * on x.com logged out, inside Nimiq Pay, and the post never gets written.
 *
 * The Nimiq mini-app SDK exposes no "open externally" call (checked against
 * `@nimiq/mini-app-sdk` 0.1.0 and nimiq.dev/mini-apps — the only navigation it
 * documents is the `nimiqpay://` scheme for opening a mini app, not leaving
 * one), so the escape hatch is the destination's own URL scheme. A WebView
 * hands a non-http scheme to its navigation delegate, and both iOS and Android
 * hosts pass those to the OS, which launches the installed app.
 *
 * Trade-off, because it is a real one: this navigates the top-level document
 * (`location.href = ...`) rather than poking a hidden iframe. The iframe trick
 * cannot damage the page when the scheme is unhandled, but modern WKWebView
 * routinely ignores subframe scheme navigations, so it fails silently in the
 * exact host we need it for. A rejected top-level navigation leaves the
 * document where it was, which is why this is the side to be wrong on.
 *
 * `twitter://` and friends are undocumented and absent when the app is not
 * installed, so nothing here assumes the hand-off worked: if the page is still
 * visible after {@link HANDOFF_MS} the https URL is opened as before. Outside
 * Nimiq Pay nothing changes at all — a normal browser opens a normal tab.
 */

/**
 * How long to wait for the OS to switch apps before deciding it will not.
 *
 * Measured against the slow end of a cold app launch: a hand-off that works
 * backgrounds this page in well under a second, and anything longer than this
 * reads as a dead tap. Too short double-opens (the fallback fires while the
 * OS is still switching); too long strands a player on an unresponsive button.
 */
export const HANDOFF_MS = 1200

export interface ExternalTarget {
  /** The https URL. Works everywhere, and is the only thing a browser uses. */
  web: string
  /**
   * The destination's native scheme, e.g. `twitter://post?message=…`. Tried
   * first — and only — inside a host WebView, where `web` cannot escape.
   */
  app?: string
}

/** An anchor click, appended and removed. Hosts that swallow `window.open`
 *  routinely honour a real user-gesture anchor, so this is the wider path. */
function openInNewTab(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Open `target` in whatever is outside this app.
 *
 * Safe to call from a click handler on any platform; the hand-off attempt only
 * happens where it is needed.
 */
export function openExternal(target: ExternalTarget): void {
  if (typeof window === 'undefined') return

  if (!target.app || !isNimiqPay()) {
    openInNewTab(target.web)
    return
  }

  // A successful hand-off backgrounds this page. Either event is proof of it,
  // and which one fires is platform-dependent — so both are watched and the
  // fallback is cancelled by whichever arrives.
  let handedOff = false
  const noteHandoff = () => {
    handedOff = true
  }
  const onVisibility = () => {
    if (document.hidden) noteHandoff()
  }
  window.addEventListener('pagehide', noteHandoff)
  document.addEventListener('visibilitychange', onVisibility)

  const cleanup = () => {
    window.removeEventListener('pagehide', noteHandoff)
    document.removeEventListener('visibilitychange', onVisibility)
  }

  window.location.href = target.app

  window.setTimeout(() => {
    cleanup()
    // `document.hidden` is re-read rather than trusted to the listeners: a
    // hand-off that happened before this handler was attached would otherwise
    // be missed and open the link a second time.
    if (handedOff || document.hidden) return
    openInNewTab(target.web)
  }, HANDOFF_MS)
}
