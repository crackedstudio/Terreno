'use client'

interface AvatarBlockProps {
  color: string
  name: string
}

/**
 * The holder's flag: a solid square of their chosen colour with the hard
 * border and offset shadow every block in this design carries. Square, not a
 * rounded avatar — this is a mark on a deed, not a profile picture.
 */
export default function AvatarBlock({ color, name }: AvatarBlockProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        width: '100%',
        maxWidth: 460,
        margin: '0 auto',
        padding: '18px 16px 14px',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 60,
          height: 60,
          flex: '0 0 auto',
          background: color,
          border: '3px solid var(--ink)',
          boxShadow: '4px 4px 0 var(--ink)',
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontWeight: 700,
            fontSize: 9,
            letterSpacing: '0.2em',
            color: 'var(--mute-on-paper)',
          }}
        >
          HOLDER
        </div>
        <div
          className="font-display"
          style={{
            fontSize: 27,
            lineHeight: 0.95,
            color: 'var(--ink)',
            marginTop: 6,
            wordBreak: 'break-word',
          }}
        >
          {name ? name.toUpperCase() : 'UNNAMED'}
        </div>
      </div>
    </div>
  )
}
