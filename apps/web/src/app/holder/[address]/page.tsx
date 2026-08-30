'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import AvatarBlock from '@/components/Profile/AvatarBlock'
import { useMaps } from '@/hooks/useMaps'
import { getMapContractById } from '@/lib/maps/contracts'
import { formatUSDT, ownerDefaultColor, uint24ToHex } from '@/lib/colorUtils'
import { generateUsername } from '@/lib/username'
import type { HolderResponse } from '@/app/api/holder/route'

const MONO = "'Space Mono', monospace"

const LABEL: React.CSSProperties = {
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: '0.2em',
}

/**
 * A holder's public record.
 *
 * The leaderboard could say who was winning but not who they were — rows were
 * inert and no route existed for a wallet that was not your own. This is the
 * drill-down: name, colour, holdings, standing, and the shape of their
 * territory on the map.
 *
 * It shows no links. The contract stores a URL per holder and the app hides it
 * everywhere for phishing reasons; a page about somebody else is the last place
 * to quietly reintroduce an unverified outbound link, so `/api/holder` does not
 * even return the field.
 *
 * Everything here is public on-chain data about a pseudonymous address. It adds
 * no information that a Basescan reader could not already assemble; it only
 * makes it legible.
 */
export default function HolderPage() {
  const params = useParams<{ address: string }>()
  const address = typeof params?.address === 'string' ? params.address : ''
  const { currentMapId } = useMaps()
  const { address: connected } = useAccount()

  const [data, setData] = useState<HolderResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const valid = /^0x[0-9a-fA-F]{40}$/.test(address)

  useEffect(() => {
    if (!valid) {
      setLoading(false)
      return
    }
    let live = true
    setLoading(true)
    setError(false)

    fetch(`/api/holder?address=${address.toLowerCase()}&mapId=${currentMapId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as HolderResponse
      })
      .then((d) => {
        if (live) setData(d)
      })
      .catch((err: unknown) => {
        if (!live) return
        console.warn('holder: could not load', err)
        setError(true)
      })
      .finally(() => {
        if (live) setLoading(false)
      })

    return () => {
      live = false
    }
  }, [address, currentMapId, valid])

  const isYou = !!connected && connected.toLowerCase() === address.toLowerCase()
  const name = data?.label || (valid ? generateUsername(address) : 'UNKNOWN')
  const color =
    data?.color != null ? uint24ToHex(data.color) : ownerDefaultColor(address)
  const map = getMapContractById(currentMapId)

  return (
    <div
      className="surface-paper"
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingTop: 56 }}
    >
      <TopBar title="TERRENO" />

      {/* Masthead — mirrors the deed's, but labelled as somebody else's record. */}
      <div
        style={{
          flexShrink: 0,
          height: 34,
          background: 'var(--ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
        }}
      >
        <span style={{ ...LABEL, fontSize: 10, color: 'var(--paper)' }}>
          {isYou ? 'YOUR RECORD' : 'HOLDER'}
        </span>
        <span style={{ ...LABEL, fontSize: 9, color: 'var(--mute-on-ink)' }}>
          {valid ? `${address.slice(0, 6)}…${address.slice(-4)}`.toUpperCase() : '—'}
        </span>
      </div>
      <div className="punch" style={{ flexShrink: 0 }} />

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingBottom: 70,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {!valid && (
          <div style={{ ...LABEL, fontSize: 11, color: 'var(--rot)', padding: 24, textTransform: 'none' }}>
            That is not a wallet address.
          </div>
        )}

        {valid && (
          <>
            <AvatarBlock color={color} name={name} />

            <div style={{ width: '100%', maxWidth: 460, padding: '0 16px' }}>
              {loading && (
                <div style={{ ...LABEL, fontSize: 10, color: 'var(--muted)', marginTop: 18 }}>
                  READING THE REGISTRY…
                </div>
              )}

              {!loading && error && (
                <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--rot)', marginTop: 18 }}>
                  Could not load this holder.
                </div>
              )}

              {!loading && !error && data && !data.available && (
                <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', marginTop: 18, lineHeight: 1.6 }}>
                  Holder records are not available on this deployment yet.
                </div>
              )}

              {!loading && !error && data?.available && (
                <>
                  <div style={{ ...LABEL, color: 'var(--muted)', margin: '18px 0 9px' }}>
                    ON {map.displayName.toUpperCase()}
                  </div>

                  <div
                    style={{
                      border: '3px solid var(--edge)',
                      boxShadow: '4px 4px 0 var(--edge)',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <Stat label="LARGEST EMPIRE" value={`${data.largestBlock} PX`} />
                    <div style={{ height: 3, background: 'var(--edge)' }} />
                    <Stat
                      label="LAND RANK"
                      value={data.rank ? `#${data.rank}` : 'UNRANKED'}
                    />
                    <div style={{ height: 3, background: 'var(--edge)' }} />
                    <Stat label="PIXELS HELD" value={String(data.pixelCount)} />
                    <div style={{ height: 3, background: 'var(--edge)' }} />
                    <Stat label="SPENT" value={`$${formatUSDT(BigInt(data.spent))}`} />
                    <div style={{ height: 3, background: 'var(--edge)' }} />
                    {/* Net of the resale fee, like every other EARNED in the
                        app — what reached the wallet, not what buyers paid. */}
                    <Stat label="EARNED" value={`$${formatUSDT(BigInt(data.earned))}`} />
                  </div>

                  {data.pixelCount === 0 && (
                    <p style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.6, color: 'var(--muted)', marginTop: 12 }}>
                      This wallet holds nothing on {map.displayName} right now.
                      Everything it once held has been taken — which means it was
                      paid for all of it.
                    </p>
                  )}

                  <Link
                    href="/ranks"
                    className="pixel-btn"
                    style={{
                      display: 'flex',
                      width: '100%',
                      justifyContent: 'center',
                      marginTop: 18,
                      fontSize: 11,
                      padding: 13,
                      textDecoration: 'none',
                    }}
                  >
                    BACK TO THE BOARDS
                  </Link>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <BottomNav activeRoute="/ranks" />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 12px',
        minHeight: 48,
      }}
    >
      <span style={{ ...LABEL, color: 'var(--muted)' }}>{label}</span>
      <span
        className="font-display"
        style={{ fontSize: 18, color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
    </div>
  )
}
