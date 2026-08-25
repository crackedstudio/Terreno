'use client'

import React from 'react'
import Link from 'next/link'
import { ConnectButton } from '@/components/connect-button'
import MapSwitcher from '@/components/Layout/MapSwitcher'

interface TopBarProps {
  title: string
  children?: React.ReactNode
}

/**
 * The registry's masthead. Always ink, on every screen — the paper documents
 * (ledger, deed) hang below it rather than replacing it, which is what keeps
 * the app feeling like one bound volume instead of a set of themes.
 *
 * The mark is drawn rather than loaded: a paper square with a blue plot inside
 * it, which is the whole product in 20 pixels and costs no request.
 */
export default function TopBar({ title, children }: TopBarProps) {
  return (
    <div
      className="theme-bar-top surface-ink"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        // Stays above PaintModeBanner (zIndex 15) so the ConnectButton's
        // PROFILE / LOG OUT dropdown isn't covered when zoomed into the map.
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        gap: 8,
      }}
    >
      <Link
        href="/"
        aria-label={title}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          flexShrink: 0,
          textDecoration: 'none',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'relative',
            width: 20,
            height: 20,
            background: 'var(--paper)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 7,
              top: 7,
              width: 6,
              height: 6,
              background: 'var(--held)',
            }}
          />
        </span>
        <span
          className="font-display"
          style={{
            fontSize: 18,
            letterSpacing: '0.2em',
            color: 'var(--paper)',
            lineHeight: 1,
          }}
        >
          TERRENO
        </span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MapSwitcher />
        {children}
        <ConnectButton />
      </div>
    </div>
  )
}
