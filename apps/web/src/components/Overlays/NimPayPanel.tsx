'use client'

import { useNimPayment } from '@/hooks/useNimPayment'
import { isNimiqPay } from '@/lib/nimiq'
import { canUseNimiqHub } from '@/lib/nimiqHub'
import { nimPayPreviewEnabled } from '@/lib/nim/config'
import { useEffect, useState } from 'react'
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
  /** Called once settlement lands, so the map can refresh. */
  onSettled?: () => void
}

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
 * The quoted amount includes a small buffer over the dollar price. That is
 * stated on screen rather than folded into the rate — a player comparing the
 * two payment options should be able to see what the convenience costs.
 */
export default function NimPayPanel({
  mapId,
  pixelIds,
  recipient,
  onSettled,
}: NimPayPanelProps) {
  // Read after mount so SSR and the first client render agree; `isNimiqPay()`
  // is false on the server.
  const [supported, setSupported] = useState(false)
  useEffect(
    () => setSupported(isNimiqPay() || canUseNimiqHub() || nimPayPreviewEnabled()),
    [],
  )

  const { status, quote, error, progress, nimTxHash, busy, getQuote, payAndSettle, reset } =
    useNimPayment(mapId, recipient)

  useEffect(() => {
    if (status === 'settled') onSettled?.()
  }, [status, onSettled])

  // Any change to the basket invalidates a quote priced against the old one.
  useEffect(() => {
    if (status === 'quoted') reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelIds.join(',')])

  if (!supported || pixelIds.length === 0) return null

  return (
    <div
      style={{
        border: '3px solid var(--ink)',
        boxShadow: '4px 4px 0 var(--yours)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...LABEL, color: 'var(--yours)' }}>OR PAY IN NIM</span>
        {quote && (
          <span style={{ ...LABEL, fontSize: 8, color: 'var(--mute-on-paper)' }}>
            +{(quote.bufferBps / 100).toFixed(1)}% BUFFER
          </span>
        )}
      </div>

      {status === 'settled' ? (
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--held)', lineHeight: 1.6 }}>
          Paid in NIM. The land is yours on Base.
        </div>
      ) : (
        <>
          {quote && (
            <div
              className="font-display"
              style={{ fontSize: 22, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}
            >
              {quote.nim} NIM
            </div>
          )}

          <button
            type="button"
            className="pixel-btn pixel-btn-sm"
            style={{ width: '100%', minHeight: 44, fontSize: 10, justifyContent: 'center' }}
            disabled={busy || !recipient}
            onClick={() => (quote ? void payAndSettle() : void getQuote(pixelIds))}
          >
            {busy
              ? 'WORKING…'
              : quote
                ? 'PAY WITH NIM'
                : recipient
                  ? 'GET NIM PRICE'
                  : 'CONNECT WALLET FIRST'}
          </button>
        </>
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
          color: error ? 'var(--rot)' : 'var(--mute-on-paper)',
        }}
      >
        {error ?? progress ?? (quote ? 'One confirmation in Nimiq Pay.' : '')}
      </p>

      {nimTxHash && status !== 'settled' && (
        <div style={{ ...LABEL, fontSize: 8, color: 'var(--mute-on-paper)' }}>
          NIM TX {nimTxHash.slice(0, 10)}… · YOUR PAYMENT IS SAFE
        </div>
      )}
    </div>
  )
}
