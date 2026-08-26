'use client'

import React from 'react'
import type { PixelView } from '@/lib/mock'
import { formatUSDT, ownerDefaultColor } from '@/lib/colorUtils'
import { dailyFallPct, dealDepth } from '@/lib/decay'
import { generateUsername } from '@/lib/username'
import { ZERO_ADDRESS } from '@/constants/map'
import { FREE_LAND } from '@/constants/mapColors'
import { track } from '@/lib/analytics'

interface PixelInfoPanelProps {
  visible: boolean
  pixel: PixelView | null
  pixelId: number
  /** Map-global halving time in seconds (config().halvingTime) — while
   *  unsold, every pixel's price falls at a constant daily rate. */
  halvingTime?: bigint
  /** Map entry price (config().initialPrice, micro-USDT). */
  initialPrice?: bigint
  onBuyThisPixel: (id: number) => void
  onDismiss: () => void
}

function truncateAddress(addr: string): string {
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

/** Space Mono, bold, tracked — labels and data on the paper record. */
const LABEL: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: '0.14em',
}

const LABEL_MUTED: React.CSSProperties = {
  ...LABEL,
  fontSize: 9,
  color: 'var(--mute-on-paper)',
}

/**
 * The single-plot record, opened by long-pressing a plot on the map. Same
 * paper stock as the claim form — it is the deed page for one plot, and the
 * buy button on it files a one-line claim.
 */
export default function PixelInfoPanel({
  visible,
  pixel,
  pixelId,
  halvingTime,
  initialPrice,
  onBuyThisPixel,
  onDismiss,
}: PixelInfoPanelProps) {
  React.useEffect(() => {
    if (visible && pixel != null) {
      track('pixel_info_viewed', { pixelId, owned: pixel.owner !== ZERO_ADDRESS })
    }
    // fire once per inspected pixel — `pixel` object identity churns on poll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pixelId])

  if (!pixel) return null

  // While unsold, the price decays continuously — a constant daily rate,
  // not a countdown. The rate is map-global (one halving clock per map).
  const fallPct =
    halvingTime !== undefined && halvingTime > 0n
      ? dailyFallPct(Number(halvingTime))
      : null
  // A deal: current price has decayed below the map's entry price.
  const depthPct =
    initialPrice !== undefined
      ? Math.round(dealDepth(pixel.currentPrice, initialPrice) * 100)
      : 0

  const prevPrice = pixel.currentPrice / 2n
  const ownerDisplay = pixel.label || generateUsername(pixel.owner)
  const isOwned = pixel.owner !== ZERO_ADDRESS
  // Owned plots show the holder's colour (on-chain, or the deterministic
  // per-address fallback when unset); unclaimed land stays the stone tone the
  // map draws it in.
  const holderColor = isOwned
    ? pixel.color || ownerDefaultColor(pixel.owner)
    : FREE_LAND

  const stats: { label: string; value: string; unit: string }[] = [
    { label: 'ASKING', value: formatUSDT(pixel.currentPrice), unit: 'USD' },
    { label: 'LAST PAID', value: formatUSDT(prevPrice), unit: 'USD' },
    { label: 'CHANGED HANDS', value: String(pixel.saleCount), unit: '×' },
  ]

  return (
    <div
      className="surface-paper"
      style={{
        position: 'fixed',
        bottom: 56,
        left: 0,
        right: 0,
        zIndex: 50,
        borderTop: '3px solid var(--ink)',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform var(--transition-drawer)',
      }}
    >
      {/* Masthead — plot id on the left, dismiss on the right. */}
      <div
        style={{
          height: 40,
          background: 'var(--ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
        }}
      >
        <span style={{ ...LABEL, color: 'var(--paper)', letterSpacing: '0.2em' }}>
          PLOT {String(pixelId).padStart(6, '0')}
        </span>
        <button
          onClick={onDismiss}
          aria-label="Close"
          style={{
            ...LABEL,
            fontSize: 13,
            color: 'var(--mute-on-ink)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 0 0 10px',
          }}
        >
          ✕
        </button>
      </div>
      <div className="punch" />

      {/* Holder */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 12, alignItems: 'center' }}>
        <span
          aria-hidden
          style={{
            width: 44,
            height: 44,
            flex: '0 0 auto',
            background: holderColor,
            border: '3px solid var(--ink)',
            boxShadow: '3px 3px 0 var(--ink)',
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={LABEL_MUTED}>{isOwned ? 'HELD BY' : 'HELD BY'}</div>
          <div
            className="font-display"
            style={{
              fontSize: 29,
              lineHeight: 0.92,
              color: 'var(--ink)',
              marginTop: 3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {isOwned ? ownerDisplay.toUpperCase() : 'NOBODY — VIRGIN LAND'}
          </div>
          {isOwned && (
            <div style={{ ...LABEL_MUTED, marginTop: 3 }}>{truncateAddress(pixel.owner)}</div>
          )}
        </div>
      </div>

      {/* Figures — one bordered grid, the way the deed prints its stats. */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '3px solid var(--ink)' }}>
          {stats.map((s, i) => (
            <div
              key={s.label}
              style={{
                padding: '10px 9px',
                borderRight: i < stats.length - 1 ? '3px solid var(--ink)' : undefined,
              }}
            >
              <div className="font-display" style={{ fontSize: 34, lineHeight: 0.92, color: 'var(--ink)' }}>
                {s.value}
              </div>
              <div style={{ ...LABEL_MUTED, fontSize: 8, marginTop: 3 }}>
                {s.label} · {s.unit}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Decay — continuous while unsold, at the map-global rate. */}
      {fallPct !== null && (
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ ...LABEL_MUTED, lineHeight: 1.6 }}>
            UNSOLD, THIS PLOT LOSES ~{fallPct.toFixed(1)}% OF ITS PRICE EVERY DAY.
          </div>
          {depthPct > 0 && (
            <div style={{ ...LABEL, fontSize: 10, color: 'var(--rot)', marginTop: 5, lineHeight: 1.6 }}>
              NOW {depthPct}% UNDER ENTRY PRICE — SOMEONE WILL NOTICE.
            </div>
          )}
        </div>
      )}

      {/* Claim */}
      <div style={{ padding: '14px 16px 16px' }}>
        <button
          onClick={() => onBuyThisPixel(pixelId)}
          className="pixel-btn pixel-btn-filled font-display"
          style={{
            width: '100%',
            fontSize: 22,
            letterSpacing: '0.08em',
            padding: '15px 12px',
            textTransform: 'none',
            cursor: 'pointer',
          }}
        >
          TAKE IT · {formatUSDT(pixel.currentPrice)}
        </button>
        <div style={{ ...LABEL_MUTED, textAlign: 'center', marginTop: 8, lineHeight: 1.6 }}>
          {isOwned
            ? `THE OLD HOLDER IS PAID ${formatUSDT(pixel.currentPrice)} IN FULL, INSTANTLY.`
            : 'NOBODY HAS EVER HELD THIS PLOT.'}
        </div>
      </div>
    </div>
  )
}
