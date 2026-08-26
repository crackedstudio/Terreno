'use client'

import { useRouter } from 'next/navigation'
import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import { useMaps } from '@/hooks/useMaps'
import { useShouldOpenNextMap } from '@/hooks/useShouldOpenNextMap'
import { getMaskData } from '@/lib/maps/masks'
import type { MapContract } from '@/lib/maps/contracts'
import type { MapId } from '@/lib/maps/types'

const MONO = "'Space Mono', monospace"

interface RowProps {
  map: MapContract
  fillPct: number | null
  landCount: number
  isHome: boolean
  isCurrent: boolean
  onPick: (id: MapId) => void
}

function AtlasRow({ map, fillPct, landCount, isHome, isCurrent, onPick }: RowProps) {
  return (
    <button
      type="button"
      onClick={() => onPick(map.id)}
      aria-current={isCurrent ? 'true' : undefined}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '14px 13px',
        background: isCurrent ? 'var(--held)' : 'transparent',
        color: 'var(--paper)',
        border: `3px solid ${isCurrent ? 'var(--held)' : 'var(--line-on-ink-2)'}`,
        fontFamily: MONO,
        fontWeight: 700,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{map.displayName}</span>
          {isHome && (
            <span
              style={{
                fontSize: 8,
                letterSpacing: '0.14em',
                padding: '2px 5px',
                border: '2px solid currentColor',
              }}
            >
              HOME
            </span>
          )}
        </span>
        <span style={{ fontSize: 9, letterSpacing: '0.12em', opacity: 0.7 }}>
          {map.width}×{map.height} · {landCount} PLOTS ON LAND
        </span>
      </span>
      <span className="font-display" style={{ fontSize: 34, lineHeight: 0.92 }}>
        {fillPct === null ? '—' : `${Math.round(fillPct)}%`}
      </span>
    </button>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontWeight: 700,
        fontSize: 9,
        letterSpacing: '0.2em',
        color: 'var(--mute-on-ink)',
        padding: '22px 0 9px',
      }}
    >
      {children}
    </div>
  )
}

export default function AtlasPage() {
  const router = useRouter()
  const { revealedMaps, homeMapId, currentMapId, setCurrentMapId } = useMaps()
  const { perMap, loading } = useShouldOpenNextMap()

  const fillFor = (id: MapId): number | null => {
    const summary = perMap.find((p) => p.mapId === id)
    return summary ? summary.fillPct : null
  }

  const worldMaps = revealedMaps.filter((m) => m.slug === 'world')
  const continentSlugs = new Set(['africa', 'europe', 'asia', 'north-america', 'south-america', 'oceania', 'antarctica'])
  const continentMaps = revealedMaps.filter((m) => continentSlugs.has(m.slug))

  const handlePick = (id: MapId) => {
    setCurrentMapId(id)
    router.push('/')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingTop: 56 }}>
      <TopBar title="TERRENO" />
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg)',
          padding: '18px 16px 72px',
          color: 'var(--text)',
        }}
      >
        <div className="font-display" style={{ fontSize: 52, lineHeight: 0.8 }}>
          EVERY MAP
          <br />
          IN THE REGISTRY
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 9,
            letterSpacing: '0.16em',
            color: 'var(--mute-on-ink)',
            marginTop: 9,
          }}
        >
          THE FIGURE IS HOW MUCH OF IT IS ALREADY TAKEN.
        </div>

        {loading && (
          <div
            style={{
              fontSize: 6,
              fontFamily: MONO,
              letterSpacing: 1,
              color: 'var(--text-muted)',
              padding: '4px 0 12px',
            }}
          >
            loading fill %…
          </div>
        )}

        {worldMaps.length > 0 && (
          <>
            <SectionHeading>WORLD</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {worldMaps.map((m) => (
                <AtlasRow
                  key={m.id}
                  map={m}
                  fillPct={fillFor(m.id)}
                  landCount={getMaskData(m.slug).landCount}
                  isHome={m.id === homeMapId}
                  isCurrent={m.id === currentMapId}
                  onPick={handlePick}
                />
              ))}
            </div>
          </>
        )}

        {continentMaps.length > 0 && (
          <>
            <SectionHeading>CONTINENTS</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {continentMaps.map((m) => (
                <AtlasRow
                  key={m.id}
                  map={m}
                  fillPct={fillFor(m.id)}
                  landCount={getMaskData(m.slug).landCount}
                  isHome={m.id === homeMapId}
                  isCurrent={m.id === currentMapId}
                  onPick={handlePick}
                />
              ))}
            </div>
          </>
        )}

        <SectionHeading>COUNTRIES</SectionHeading>
        <div
          style={{
            border: '3px solid var(--line-on-ink-2)',
            padding: '22px 12px',
            textAlign: 'center',
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.2em',
            color: 'var(--mute-on-ink)',
          }}
        >
          COMING SOON
        </div>
      </div>
      <BottomNav activeRoute="/atlas" />
    </div>
  )
}
