'use client'

import Link from 'next/link'

interface BottomNavProps {
  activeRoute: string
}

// Two-letter plates instead of icons. The registry labels things; a glyph
// would be the only unlabelled control in the app, and at 24px the old pixel
// icons were unreadable on the ink bar anyway. `code` is the plate, `label`
// is the word under it — both are always shown, so nothing depends on
// recognising a shape.
const navItems = [
  { code: 'LG', label: 'LEDGER', href: '/ranks' },
  { code: 'MP', label: 'ATLAS', href: '/' },
  { code: 'DE', label: 'DEED', href: '/profile' },
]

export default function BottomNav({ activeRoute }: BottomNavProps) {
  return (
    <nav
      className="theme-bar-bottom surface-ink"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 56,
        zIndex: 40,
        display: 'grid',
        gridTemplateColumns: `repeat(${navItems.length}, 1fr)`,
        alignItems: 'center',
      }}
    >
      {navItems.map((item) => {
        const isActive = activeRoute === item.href
        const color = isActive ? 'var(--held)' : 'var(--mute-on-ink)'
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
              textDecoration: 'none',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `2px solid ${isActive ? 'var(--held)' : 'var(--dim-on-ink)'}`,
                fontFamily: "'Space Mono', monospace",
                fontWeight: 700,
                fontSize: 9,
                color,
              }}
            >
              {item.code}
            </span>
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontWeight: 700,
                fontSize: 8,
                letterSpacing: '0.14em',
                color,
              }}
            >
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
