'use client'

export interface BoardOption {
  key: string
  label: string
}

interface BoardSelectorProps {
  options: BoardOption[]
  value: string
  onChange: (key: string) => void
}

const MONO = "'Space Mono', monospace"

/**
 * Horizontal selector for which map's leaderboard to show — one chip per map.
 * Lets players view any map's board straight from /ranks instead of going back
 * to the map to switch first. Scrolls horizontally so it scales as more maps
 * ship. Only rendered when there's more than one board to choose between.
 */
export default function BoardSelector({ options, value, onChange }: BoardSelectorProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '12px 16px',
        borderBottom: '1px solid var(--free)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {options.map((o) => {
        const isActive = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-current={isActive ? 'true' : undefined}
            style={{
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 9,
              letterSpacing: '0.14em',
              padding: '6px 11px',
              cursor: 'pointer',
              background: isActive ? 'var(--ink)' : 'transparent',
              color: isActive ? 'var(--paper)' : 'var(--mute-on-paper)',
              border: `2px solid ${isActive ? 'var(--ink)' : 'var(--free)'}`,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              textTransform: 'uppercase',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
