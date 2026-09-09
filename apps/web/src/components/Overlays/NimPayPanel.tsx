'use client'

import { useNimPayment, type NimPayStatus, type NimQuote } from '@/hooks/useNimPayment'
import { isNimiqPay } from '@/lib/nimiq'
import { canUseNimiqHub } from '@/lib/nimiqHub'
import { nimPayPreviewEnabled } from '@/lib/nim/config'
import { isQuotePayable, quoteMsRemaining, SETTLEMENT_WINDOW_MS } from '@/lib/nim/quote'
import { formatUSDT } from '@/lib/colorUtils'
import { useEffect, useRef, useState } from 'react'
import type { MapId } from '@/lib/maps/types'

const MONO = "'Space Mono', monospace"

const LABEL: React.CSSProperties = {
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: '0.2em',
}

interface NimPayPanelProps {
  mapId: MapId
  pixelIds: number[]
  /** Base address the land will be assigned to. */
  recipient?: string
  /**
   * Called once settlement lands, so the parent can close the claim form and
   * show the receipt. Fires exactly ONCE per settlement — the effect below
   * latches, because a parent passing an inline arrow re-runs the effect on
   * every render, and a callback that sets parent state would then loop.
   */
  onSettled?: (receipt: NimReceipt) => void
}

/** What a settled NIM purchase leaves behind, for the parent to show. */
export interface NimReceipt {
  /** Formatted NIM the player actually sent, e.g. "1,234.5". */
  nim: string
  /** The Base transaction that assigned the land. Null on an already-settled
   *  retry, where the settling transaction belongs to the earlier attempt. */
  baseTxHash: string | null
}

/** Which wallet the player will actually be handed to. */
export type NimHost = 'pay' | 'web'

/**
 * Paying for land in NIM, next to the stablecoin path rather than instead of it.
 *
 * Base remains the default and is untouched: this is a second way to pay for
 * the same basket, for players whose balance is in NIM. What they get is
 * identical — the pixels land in their own wallet on Base, because settlement
 * goes through `settleNimPurchase`, which names them as the recipient.
 *
 * Shown in both places NIM can actually be paid from. Inside Nimiq Pay that is
 * the native dialog; in a browser it is the Web Wallet through the Hub popup.
 * The panel does not care which — `sendNimWithData` picks the transport and
 * both return the same receipt — so the only thing gated here is whether a
 * transport exists at all. It renders nothing during SSR, where neither does.
 *
 * This component is the container: host detection, the hook, the settlement
 * announcement. Everything drawn lives in {@link NimPayPanelView}, which takes
 * a state and no hooks of its own — so every state of a multi-minute payment
 * flow can be rendered on demand (`/dev/nim-preview`) instead of being reached
 * only by spending real NIM.
 */
export default function NimPayPanel({
  mapId,
  pixelIds,
  recipient,
  onSettled,
}: NimPayPanelProps) {
  // Which wallet the player will actually see, resolved after mount so SSR and
  // the first client render agree ('isNimiqPay()' is false on the server).
  // 'none' keeps the panel hidden where there is no transport at all.
  const [supportedHost, setSupportedHost] = useState<'none' | NimHost>('none')
  useEffect(() => {
    if (isNimiqPay()) setSupportedHost('pay')
    else if (canUseNimiqHub() || nimPayPreviewEnabled()) setSupportedHost('web')
  }, [])

  const {
    status,
    quote,
    error,
    progress,
    nimTxHash,
    baseTxHash,
    busy,
    getQuote,
    payAndSettle,
    reset,
  } = useNimPayment(mapId, recipient)

  // Latched so a settlement is announced once and only once. Cleared whenever
  // the flow leaves 'settled', so a second purchase in the same session still
  // announces itself.
  const announced = useRef(false)
  useEffect(() => {
    if (status !== 'settled') {
      announced.current = false
      return
    }
    if (announced.current) return
    announced.current = true
    onSettled?.({ nim: quote?.nim ?? '', baseTxHash })
  }, [status, quote, baseTxHash, onSettled])

  // Any change to the basket invalidates a quote priced against the old one.
  useEffect(() => {
    if (status === 'quoted') reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelIds.join(',')])

  // One tick a second, only while a quote is on screen. The countdown is not
  // decoration: it is the visible half of the guard in `payAndSettle`, so it
  // has to move on its own rather than on the next unrelated render.
  const [, tick] = useState(0)
  useEffect(() => {
    if (status !== 'quoted' || !quote) return
    const id = window.setInterval(() => tick((n) => n + 1), 1_000)
    return () => window.clearInterval(id)
  }, [status, quote])

  if (supportedHost === 'none' || pixelIds.length === 0) return null

  return (
    <NimPayPanelView
      host={supportedHost}
      status={status}
      quote={quote}
      error={error}
      progress={progress}
      nimTxHash={nimTxHash}
      pixelCount={pixelIds.length}
      hasRecipient={!!recipient}
      busy={busy}
      onPrimary={() =>
        quote && isQuotePayable(quote) ? void payAndSettle() : void getQuote(pixelIds)
      }
      onDiscard={reset}
    />
  )
}

export interface NimPayPanelViewProps {
  host: NimHost
  status: NimPayStatus
  quote: NimQuote | null
  error: string | null
  progress: string | null
  nimTxHash: string | null
  pixelCount: number
  hasRecipient: boolean
  busy: boolean
  /** Get a price, or pay one — the button decides from the state it is given. */
  onPrimary: () => void
  /** Throw away a live quote without paying it. */
  onDiscard: () => void
}

/**
 * Everything the NIM path draws, as a function of where the flow is.
 *
 * The three things this screen has to say, in the order a player needs them:
 *
 *   - what it costs — in NIM, in dollars, and what the convenience buffer
 *     added. A player choosing between two ways to pay for one basket cannot
 *     choose without the comparison, and the buffer folded silently into a
 *     rate is exactly the thing that reads as a hidden fee once noticed;
 *   - how long the price holds — as a meter that empties when the quote stops
 *     being safe to PAY, which is `SETTLEMENT_WINDOW_MS` before it expires.
 *     `/api/nim/settle` rejects an expired order before it looks at the
 *     payment, so a quote spent too late costs the player their NIM. The
 *     meter is the visible half of the guard in `payAndSettle`;
 *   - where the money is — three steps, drawn as steps, because settlement is
 *     a multi-minute wait and an unexplained wait on a payment screen reads as
 *     a hang. The panel says the payment is safe for the same reason.
 */
export function NimPayPanelView({
  host,
  status,
  quote,
  error,
  progress,
  nimTxHash,
  pixelCount,
  hasRecipient,
  busy,
  onPrimary,
  onDiscard,
}: NimPayPanelViewProps) {
  const payable = isQuotePayable(quote)
  const stale = !!quote && status === 'quoted' && !payable

  return (
    <div
      style={{
        border: '3px solid var(--ink)',
        boxShadow: '4px 4px 0 var(--yours)',
        background: 'var(--paper)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header — the panel's identity, and the buffer stated up front rather
          than discovered in the total. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          padding: '9px 12px 8px',
        }}
      >
        <span
          style={{ ...LABEL, color: 'var(--yours)', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <NimGlyph />
          PAY IN NIM
        </span>
        {quote && (
          <span
            style={{
              ...LABEL,
              fontSize: 8,
              letterSpacing: '0.14em',
              color: 'var(--mute-on-paper)',
              border: '2px solid currentColor',
              padding: '3px 6px',
            }}
          >
            +{(quote.bufferBps / 100).toFixed(1)}% BUFFER
          </span>
        )}
      </div>

      <div className="punch" style={{ height: 6, opacity: 0.5 }} />

      <div style={{ padding: '10px 12px 11px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {status === 'settled' ? (
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--held)', lineHeight: 1.6 }}>
            Paid in NIM. The land is yours on Base.
          </div>
        ) : (
          <>
            {/* Amount. The dollar figure sits under it because the price is a
                dollar price everywhere else in the app — without it a player
                cannot tell whether the NIM figure is the same purchase. */}
            {quote ? (
              <div>
                <div
                  className="font-display"
                  style={{
                    fontSize: 30,
                    lineHeight: 0.95,
                    color: stale ? 'var(--mute-on-paper)' : 'var(--ink)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {quote.nim} NIM
                </div>
                <div style={{ ...LABEL, fontSize: 9, color: 'var(--mute-on-paper)', marginTop: 5 }}>
                  {[usdLine(quote.usdMicros), `${pixelCount} ${pixelCount === 1 ? 'PLOT' : 'PLOTS'}`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            ) : (
              <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink)', lineHeight: 1.6 }}>
                Same land, same map — paid out of your NIM balance instead of
                your stablecoins.
              </div>
            )}

            {quote && status === 'quoted' && <QuoteMeter quote={quote} stale={stale} />}

            {(status === 'awaiting-payment' || status === 'settling') && (
              <StepTrack status={status} />
            )}

            <button
              type="button"
              className={`pixel-btn pixel-btn-sm${quote && payable ? ' pixel-btn-filled' : ''}`}
              style={{
                width: '100%',
                minHeight: 44,
                fontSize: 10,
                justifyContent: 'center',
                opacity: busy || !hasRecipient ? 0.5 : 1,
              }}
              disabled={busy || !hasRecipient}
              aria-busy={busy}
              onClick={onPrimary}
            >
              {busy
                ? busyLabel(status)
                : !hasRecipient
                  ? 'CONNECT WALLET FIRST'
                  : stale
                    ? 'REFRESH THE PRICE'
                    : quote
                      ? `PAY ${quote.nim} NIM`
                      : 'GET NIM PRICE'}
            </button>

            {/* A live quote is a decision, so there is a way out of it that is
                not paying. Absent once the money is in motion — nothing here
                can call back a payment that has already left. */}
            {quote && status === 'quoted' && !stale && (
              <button
                type="button"
                onClick={onDiscard}
                style={{
                  ...LABEL,
                  fontSize: 8,
                  color: 'var(--mute-on-paper)',
                  background: 'transparent',
                  border: 'none',
                  padding: 4,
                  cursor: 'pointer',
                  alignSelf: 'center',
                }}
              >
                DISCARD THIS PRICE
              </button>
            )}
          </>
        )}

        {/* Errors get their own bordered block rather than sharing the caption
            line — a failed payment and a footnote about which wallet opens
            should not look alike. */}
        {error && (
          <div
            role="alert"
            style={{
              border: '2px solid var(--rot)',
              padding: '7px 9px',
              fontFamily: MONO,
              fontSize: 10,
              lineHeight: 1.55,
              color: 'var(--rot)',
              wordBreak: 'break-word',
            }}
          >
            {error}
          </div>
        )}

        {/* One line, `aria-live` because the outcome of a native dialog and of a
            slow settlement both land here and nothing else announces them. */}
        <p
          aria-live="polite"
          style={{
            fontFamily: MONO,
            fontSize: 9,
            lineHeight: 1.6,
            margin: 0,
            color: 'var(--mute-on-paper)',
          }}
        >
          {progress ??
            (quote
              ? host === 'pay'
                ? 'One confirmation in Nimiq Pay.'
                : 'Opens the Nimiq Wallet in a new window.'
              : '')}
        </p>

        {nimTxHash && status !== 'settled' && (
          <div style={{ ...LABEL, fontSize: 9, color: 'var(--mute-on-paper)' }}>
            NIM TX {nimTxHash.slice(0, 10)}… · YOUR PAYMENT IS SAFE
          </div>
        )}
      </div>
    </div>
  )
}

/** "≈ $0.06", or '' when the quote carries no dollar figure to convert. */
function usdLine(usdMicros: string | undefined): string {
  if (!usdMicros) return ''
  try {
    return `≈ $${formatUSDT(BigInt(usdMicros))}`
  } catch {
    return ''
  }
}

function busyLabel(status: NimPayStatus): string {
  if (status === 'quoting') return 'PRICING…'
  if (status === 'awaiting-payment') return 'CONFIRM IN YOUR WALLET…'
  if (status === 'settling') return 'SETTLING…'
  return 'WORKING…'
}

/**
 * How much of the quote is left, as a meter plus mm:ss.
 *
 * The bar measures the PAYABLE life, not the raw TTL: it empties when the
 * quote stops being safe to pay, which is `SETTLEMENT_WINDOW_MS` before it
 * actually expires. A bar that ran to zero would promise a last stretch the
 * guard in `payAndSettle` refuses.
 */
function QuoteMeter({
  quote,
  stale,
}: {
  quote: { expiresAt: number; ttlSeconds?: number }
  stale: boolean
}) {
  const remaining = Math.max(0, quoteMsRemaining(quote))
  const payableMs = Math.max(0, remaining - SETTLEMENT_WINDOW_MS)

  // The bar's full scale is the server's own TTL minus the settlement window —
  // the payable life of a fresh quote. Falling back to "however much was left
  // when this component first saw the quote" only where the server did not
  // send one: that fallback re-reads as full after a remount mid-quote, which
  // is exactly the lie the TTL removes.
  const captured = useRef<{ key: number; ms: number } | null>(null)
  if (captured.current?.key !== quote.expiresAt) {
    captured.current = { key: quote.expiresAt, ms: Math.max(payableMs, 1) }
  }
  const fullMs = quote.ttlSeconds
    ? Math.max(1, quote.ttlSeconds * 1000 - SETTLEMENT_WINDOW_MS)
    : captured.current.ms
  const pct = Math.max(0, Math.min(100, (payableMs / fullMs) * 100))

  return (
    <div>
      <div
        style={{ height: 6, border: '2px solid var(--ink)', background: 'transparent' }}
        role="presentation"
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: stale ? 'var(--rot)' : 'var(--yours)',
            transition: 'width 1s linear',
          }}
        />
      </div>
      <div
        style={{
          ...LABEL,
          fontSize: 8,
          color: stale ? 'var(--rot)' : 'var(--mute-on-paper)',
          marginTop: 5,
        }}
      >
        {stale ? 'PRICE EXPIRED — GET A NEW ONE' : `PRICE HELD ${mmss(payableMs)}`}
      </div>
    </div>
  )
}

function mmss(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** QUOTE → PAY → SETTLE, with the live step filled. */
function StepTrack({ status }: { status: NimPayStatus }) {
  const active = status === 'awaiting-payment' ? 1 : 2
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {['QUOTE', 'PAY', 'SETTLE'].map((label, i) => {
        const done = i < active
        const now = i === active
        return (
          <div
            key={label}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '5px 2px',
              border: '2px solid var(--ink)',
              background: now ? 'var(--yours)' : done ? 'var(--ink)' : 'transparent',
              color: now || done ? 'var(--paper)' : 'var(--mute-on-paper)',
              ...LABEL,
              fontSize: 8,
              letterSpacing: '0.12em',
            }}
          >
            {done ? `${label} ✓` : label}
          </div>
        )
      })}
    </div>
  )
}

/** The Nimiq mark, as the flat hex it reads as at this size. */
function NimGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden>
      <path d="M6.4 3h11.2l5.6 9-5.6 9H6.4L.8 12z" />
    </svg>
  )
}
