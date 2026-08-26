import Link from 'next/link'

const MONO = "'Space Mono', monospace"

const FLAVOR = [
  'you dropped in the water. swim back to land.',
  'lost at sea. tap below to find dry ground.',
  'no land here, just deep water. head home.',
  'this part of the map is just ocean. try the mainland.',
]

export default function NotFound() {
  // Random funny line — picked at render time so reloads can vary.
  const line = FLAVOR[Math.floor(Math.random() * FLAVOR.length)]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        gap: 16,
      }}
    >
      <img
        src="/brand/terreno-symbol.gif"
        alt=""
        width={96}
        height={96}
        style={{ display: 'block', imageRendering: 'pixelated' }}
      />

      <div className="font-display" style={{ fontSize: 120, lineHeight: 0.8, color: 'var(--rot)' }}>
        404
      </div>

      <div
        style={{
          fontFamily: MONO,
          fontSize: 13,
          lineHeight: 1.7,
          color: 'var(--free)',
          maxWidth: 340,
        }}
      >
        Not on any map we hold.
        <br />
        {line}
      </div>

      <Link
        href="/"
        className="pixel-btn pixel-btn-filled"
        style={{ marginTop: 6, fontSize: 12, padding: '14px 24px', textDecoration: 'none' }}
      >
        BACK TO LAND
      </Link>
    </div>
  )
}
