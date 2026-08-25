'use client'

import { useCallback } from 'react'
import { PROFILE_DEFAULT_PALETTE } from '@/constants/map'

interface ColorPickerProps {
  color: string
  onChange: (color: string) => void
}

const MONO = "'Space Mono', monospace"

/**
 * Flag colour. A row of preset swatches for the common case plus the native
 * picker and a hex field for anyone who wants an exact value — the presets
 * were previously buried behind the picker, which meant most holders never
 * moved off the default.
 */
export default function ColorPicker({ color, onChange }: ColorPickerProps) {
  const handleNative = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    [onChange],
  )
  const handleHexInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    [onChange],
  )

  const normalised = color.toLowerCase()

  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 9,
          letterSpacing: '0.18em',
          color: 'var(--mute-on-paper)',
          marginBottom: 8,
        }}
      >
        FLAG COLOUR · {color.toUpperCase()}
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {PROFILE_DEFAULT_PALETTE.map((preset) => {
          const isActive = preset.toLowerCase() === normalised
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              aria-label={`Use ${preset}`}
              aria-pressed={isActive}
              style={{
                width: 38,
                height: 38,
                background: preset,
                border: '3px solid var(--ink)',
                boxShadow: isActive ? '3px 3px 0 var(--ink)' : 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <input
          type="color"
          value={color}
          onChange={handleNative}
          aria-label="Pick any colour"
          style={{
            width: 38,
            height: 38,
            border: '3px solid var(--ink)',
            appearance: 'none',
            WebkitAppearance: 'none',
            cursor: 'pointer',
            padding: 0,
            background: color,
            flexShrink: 0,
          }}
        />
        <style>{`
          input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
          input[type=color]::-webkit-color-swatch { border: none; }
        `}</style>
        <input
          type="text"
          value={color}
          onChange={handleHexInput}
          spellCheck={false}
          aria-label="Colour hex"
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.1em',
            background: 'transparent',
            border: '3px solid var(--ink)',
            padding: '9px 10px',
            color: 'var(--ink)',
            outline: 'none',
            textTransform: 'uppercase',
          }}
        />
      </div>
    </div>
  )
}
