'use client'

import { useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import {
  externalHref,
  isEmbeddedWebView,
  shouldOpenInNewTab,
  watchHandoff,
  type ExternalTarget,
} from '@/lib/externalLink'
import {
  type ShareKind,
  type ShareParams,
  SHARE_LINK,
  buildXIntentUrl,
  buildXAppUrl,
  buildTelegramUrl,
  buildTelegramAppUrl,
  buildWhatsAppUrl,
  buildWhatsAppAppUrl,
  composeXText,
  composeTelegramText,
  composeShareMessage,
} from '@/lib/share'

/**
 * One "Share" button for the share-to-X flywheel.
 *
 * Tapping it opens our own small menu of targets — X, WhatsApp, Telegram, Copy
 * link — the same on every device. We intentionally do NOT use the Web Share
 * API: on iOS it popped the system sheet and then this menu (a double popup),
 * and it buried our chosen channels behind the OS picker. Instagram has no web
 * share URL, so it isn't offered here.
 *
 * The text always travels with the link: the X intent takes text+url; WhatsApp
 * + Copy get a single string with the link folded in (some apps drop a payload's
 * text when a url is also set).
 *
 * Each target is a REAL anchor, and that is load-bearing rather than tidy
 * markup. Inside Nimiq Pay's WebView a share has to escape the host app, and
 * what a WebView host keys on when deciding whether to hand a navigation to
 * the OS is whether it was a genuine link activation. Opening the same URL
 * from script — `window.open`, a `location.href` assignment, a synthetic
 * `.click()` on a detached anchor — arrives at the host as an ordinary
 * programmatic navigation and gets kept in the in-app browser. That was the
 * first fix here and it did not work on a device. So the player's own tap
 * navigates, and this component only decides what the anchor points AT: the
 * native scheme in a WebView, the https URL in a browser.
 *
 * When the tap goes nowhere — no X app installed, or a host that refuses
 * schemes — the share is NOT quietly reopened in the in-app browser, which is
 * the broken outcome wearing a fix's clothes. The post goes to the clipboard
 * and the player is told, with opening x.com left as their choice.
 */
export function ShareButton({
  kind,
  params,
  label,
  filled = true,
  compact = false,
  icon,
}: {
  kind: ShareKind
  params: ShareParams
  label: string
  /** Render the button in the filled (lime) pixel style. */
  filled?: boolean
  /** Compact icon+label trigger that flexes to share a row (secondary action). */
  compact?: boolean
  /** Leading glyph for the trigger (shown in compact mode). */
  icon?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  /** Which target's tap went nowhere, so the menu can offer a way through. */
  const [stranded, setStranded] = useState<{ platform: string; web: string } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const cancelWatch = useRef<(() => void) | null>(null)

  // Resolved after mount: `navigator` does not exist during SSR, and an href
  // that differed between the server and client render would be a hydration
  // mismatch on every share button in the app.
  const [embedded, setEmbedded] = useState(false)
  useEffect(() => setEmbedded(isEmbeddedWebView()), [])

  // A watchdog outlives the click that started it, so it has to be cancelled
  // on unmount or it fires against a component that is gone.
  useEffect(() => () => cancelWatch.current?.(), [])

  // Close the fallback menu on an outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setStranded(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const url = SHARE_LINK
  const telegramText = composeTelegramText(kind, params)
  const message = composeShareMessage(kind, params)

  // Our own menu is the single, consistent UI on every device. We deliberately
  // don't call the Web Share API: on iOS it popped the system sheet AND then
  // this menu, and it hid our chosen targets behind the OS picker. Each target
  // below is a link the player taps — see the note above on why that matters.
  const onShare = () => {
    setStranded(null)
    setOpen((v) => !v)
  }

  /**
   * Runs alongside the anchor's own navigation — never instead of it. The
   * default is deliberately not prevented: the whole point is that the host
   * sees the player's tap, not ours.
   */
  const onTargetTap = (platform: string, target: ExternalTarget) => {
    track('share_clicked', { kind, platform, mapId: params.mapId ?? null })
    setStranded(null)

    // A browser tab always opens, so there is nothing to watch and no menu to
    // keep around. Only a WebView can swallow the tap.
    if (!embedded) {
      setOpen(false)
      return
    }

    cancelWatch.current?.()
    cancelWatch.current = watchHandoff(() => {
      track('share_handoff_failed', { kind, platform, mapId: params.mapId ?? null })
      // Put the post somewhere they can use it before telling them it failed,
      // so the notice is describing something already true.
      void navigator.clipboard?.writeText(message).catch(() => {})
      setStranded({ platform, web: target.web })
    })
  }

  const copyLink = async () => {
    track('share_clicked', { kind, platform: 'clipboard', mapId: params.mapId ?? null })
    setStranded(null)
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
    setOpen(false)
  }

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative', width: compact ? 'auto' : '100%', flex: compact ? '1 1 0' : undefined, minWidth: 0 }}
    >
      <button
        onClick={onShare}
        aria-label={compact ? label : undefined}
        className={`pixel-btn${filled ? ' pixel-btn-filled' : ''}`}
        style={
          compact
            ? { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', fontSize: 10, padding: '11px 8px', cursor: 'pointer' }
            : { display: 'flex', width: '100%', fontSize: 12, padding: 13, cursor: 'pointer' }
        }
      >
        {icon ? <span style={{ display: 'flex', width: 14, height: 14 }}>{icon}</span> : null}
        {copied ? 'COPIED' : label}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'var(--surface)',
            border: '3px solid var(--edge)',
            boxShadow: '4px 4px 0 var(--edge)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <TargetRow
            icon={<XGlyph />}
            label="X"
            target={{
              web: buildXIntentUrl(composeXText(kind, params), url),
              app: buildXAppUrl(composeXText(kind, params), url),
            }}
            embedded={embedded}
            onTap={(t) => onTargetTap('twitter', t)}
          />
          <TargetRow
            icon={<WhatsAppGlyph />}
            label="WhatsApp"
            target={{ web: buildWhatsAppUrl(message), app: buildWhatsAppAppUrl(message) }}
            embedded={embedded}
            onTap={(t) => onTargetTap('whatsapp', t)}
          />
          <TargetRow
            icon={<TelegramGlyph />}
            label="Telegram"
            target={{
              web: buildTelegramUrl(telegramText, url),
              app: buildTelegramAppUrl(telegramText, url),
            }}
            embedded={embedded}
            onTap={(t) => onTargetTap('telegram', t)}
          />
          <CopyRow icon={<LinkGlyph />} label={copied ? 'Copied' : 'Copy link'} onClick={copyLink} />

          {/* The tap went nowhere. Say so, say what we did about it, and leave
              opening x.com in here as the player's decision rather than ours —
              silently doing it for them is the bug this replaced. */}
          {stranded && (
            <div
              role="status"
              style={{
                borderTop: '2px solid var(--edge)',
                marginTop: 4,
                paddingTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  lineHeight: 1.55,
                  color: 'var(--text)',
                }}
              >
                {stranded.platform === 'twitter' ? 'X' : 'That app'} didn&apos;t open. Your post is
                copied — paste it there.
              </p>
              <a
                href={stranded.web}
                target="_blank"
                rel="noopener noreferrer"
                className="pixel-btn pixel-btn-sm"
                style={{ fontSize: 9, textDecoration: 'none', justifyContent: 'center' }}
                onClick={() => setOpen(false)}
              >
                OPEN IN THIS APP INSTEAD
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * One share destination, as a real link.
 *
 * An anchor rather than a button because the element type is the fix: a tap on
 * `<a href>` reaches a WebView host as a link activation, which is what it
 * needs to see before it will hand the URL to the OS. A button calling
 * `window.open` reaches it as a script navigation and stays in the in-app
 * browser. `onTap` runs alongside the navigation and never cancels it.
 */
function TargetRow({
  icon,
  label,
  target,
  embedded,
  onTap,
}: {
  icon: React.ReactNode
  label: string
  target: ExternalTarget
  embedded: boolean
  onTap: (target: ExternalTarget) => void
}) {
  const href = externalHref(target, embedded)
  const newTab = shouldOpenInNewTab(href)
  return (
    <a
      href={href}
      // A scheme link must navigate the page it is on: pointing `_blank` at
      // `twitter://` opens a blank tab in a browser and the in-app browser in
      // a WebView, which is the outcome being avoided.
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      role="menuitem"
      onClick={() => onTap(target)}
      className="font-display"
      style={ROW_STYLE}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(31,59,232,0.14)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ display: 'flex', width: 16, height: 16, color: 'var(--held)' }}>{icon}</span>
      {label.toUpperCase()}
    </a>
  )
}

/** Copy stays a button — it navigates nowhere and has nothing to hand off. */
function CopyRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className="font-display"
      style={{ ...ROW_STYLE, border: 'none' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(31,59,232,0.14)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ display: 'flex', width: 16, height: 16, color: 'var(--held)' }}>{icon}</span>
      {label.toUpperCase()}
    </button>
  )
}

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '9px 10px',
  fontSize: 15,
  letterSpacing: 1.5,
  color: 'var(--text)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  textDecoration: 'none',
}

/* Minimal inline brand glyphs (lucide has no brand logos). 16px, currentColor. */
function XGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
function TelegramGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  )
}
function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.16 8.16 0 01-1.26-4.37c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 012.41 5.82c0 4.54-3.7 8.24-8.24 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42l-.48-.01c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z" />
    </svg>
  )
}
function LinkGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.5-1.5" />
    </svg>
  )
}
