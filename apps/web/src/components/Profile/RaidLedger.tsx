'use client'

import { useRaids } from '@/hooks/useRaids'
import { formatUSDT, ownerDefaultColor, uint24ToHex } from '@/lib/colorUtils'
import { generateUsername } from '@/lib/username'
import type { MapId } from '@/lib/maps/types'

const MONO = "'Space Mono', monospace"

const LABEL: React.CSSProperties = {
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: '0.2em',
}

/** "2H AGO" / "3D AGO" — a ledger wants elapsed time, not a date. */
function ago(tsSeconds: string): string {
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - Number(tsSeconds))
  if (secs < 60) return 'JUST NOW'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}M AGO`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}H AGO`
  return `${Math.floor(hours / 24)}D AGO`
}

interface RaidLedgerProps {
  baseAddress?: string
  mapId: MapId
}

/**
 * What was taken from you, and what you were paid for it.
 *
 * The deed already shows what a holder owns and what they have earned in total.
 * Neither tells them the thing that actually brings them back: somebody took a
 * specific pixel, on a specific day, and money arrived because of it. This is
 * that record — the losing side of the trade, which no other surface shows.
 *
 * Written to read as a payout rather than a loss. "TAKEN" is the event; the
 * figure beside it is in the `held` accent, because being raided is how a
 * holder gets paid, not something that went wrong. The amount is already net of
 * the resale fee (done in `/api/raids`), so it matches what the wallet
 * received rather than what the raider paid.
 *
 * Empty and unavailable are rendered differently on purpose: without the
 * subgraph the losing side cannot be read at all, and "you have never been
 * raided" would be a claim rather than an observation.
 */
export default function RaidLedger({ baseAddress, mapId }: RaidLedgerProps) {
  const { raids, loading, available, error } = useRaids(baseAddress, mapId)

  if (!baseAddress) return null

  return (
    <section aria-label="Raids against you" style={{ width: '100%', marginTop: 18 }}>
      <div
        style={{
          ...LABEL,
          color: 'var(--muted)',
          marginBottom: 9,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>TAKEN FROM YOU</span>
        {raids.length > 0 && <span>{raids.length}</span>}
      </div>

      {loading && (
        <div style={{ ...LABEL, fontSize: 10, color: 'var(--muted)' }}>READING THE LEDGER…</div>
      )}

      {!loading && error && (
        <div style={{ ...LABEL, fontSize: 10, color: 'var(--rot)', textTransform: 'none' }}>
          Could not load your raid history. The rest of your deed is unaffected.
        </div>
      )}

      {!loading && !error && !available && (
        <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.6, color: 'var(--muted)' }}>
          Raid history is not available on this deployment yet.
        </div>
      )}

      {!loading && !error && available && raids.length === 0 && (
        <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.6, color: 'var(--muted)' }}>
          Nobody has taken anything from you yet. When they do, they pay double
          what you did — and you keep it, minus the fee.
        </div>
      )}

      {!loading && !error && raids.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {raids.map((r) => {
            const name = r.raiderLabel || generateUsername(r.raider)
            const dot =
              r.raiderColor !== null
                ? uint24ToHex(r.raiderColor)
                : ownerDefaultColor(r.raider)
            return (
              <div
                key={r.id}
                style={{
                  border: '3px solid var(--edge)',
                  boxShadow: '4px 4px 0 var(--edge)',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                    background: dot,
                    border: '2px solid var(--edge)',
                  }}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      color: 'var(--on-surface)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {name.toUpperCase()}
                  </div>
                  <div style={{ ...LABEL, fontSize: 8, color: 'var(--muted)', marginTop: 3 }}>
                    TOOK {r.pixelCount} PX · {ago(r.timestamp)}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div
                    className="font-display"
                    style={{
                      fontSize: 16,
                      lineHeight: 1,
                      color: 'var(--held)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    +${formatUSDT(BigInt(r.earned))}
                  </div>
                  <div style={{ ...LABEL, fontSize: 8, color: 'var(--muted)', marginTop: 3 }}>
                    PAID TO YOU
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
