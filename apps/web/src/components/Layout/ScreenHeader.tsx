'use client'

interface ScreenHeaderProps {
  title: string
}

export default function ScreenHeader({ title }: ScreenHeaderProps) {
  return (
    <div
      style={{
        height: 46,
        background: 'var(--ink)',
        borderBottom: '3px solid var(--held)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
      }}
    >
      <span
        style={{
          fontFamily: "'Space Mono', monospace",
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: '0.2em',
          color: 'var(--paper)',
        }}
      >
        {title}
      </span>
    </div>
  )
}
