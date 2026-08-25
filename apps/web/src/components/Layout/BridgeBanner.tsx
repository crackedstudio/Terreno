'use client'

import { useEffect, useState } from 'react'
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'
import { isNimiqPay } from '@/lib/nimiq'

const SQUID_URL = 'https://www.squidrouter.com/'

/**
 * Browser-only banner pointing users with no Base stablecoin balance at
 * Squid to bridge in. Hidden inside Nimiq Pay (those users are guided by the
 * host wallet's own funding flow), and hidden for users who already have a
 * USDC balance.
 *
 * Dismissible — set a sessionStorage flag so it doesn't re-pop while the
 * tab is open.
 */
export default function BridgeBanner() {
  const { isConnected, isLoading, totalAmount } = useStablecoinBalance()
  const [inNimiqPay, setInNimiqPay] = useState<boolean | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setInNimiqPay(isNimiqPay())
    try {
      if (sessionStorage.getItem('terreno-bridge-dismissed') === '1') {
        setDismissed(true)
      }
    } catch {}
  }, [])

  if (inNimiqPay !== false) return null
  if (!isConnected || isLoading) return null
  if (totalAmount > 0) return null
  if (dismissed) return null

  const onDismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem('terreno-bridge-dismissed', '1')
    } catch {}
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 56,
        left: 0,
        right: 0,
        zIndex: 14,
        minHeight: 30,
        background: 'var(--rot)',
        borderTop: '2px solid var(--ink)',
        color: 'var(--ink)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 32px',
        fontFamily: "'Space Mono', monospace",
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textAlign: 'center' }}>
        NO STABLES ON BASE YET —{' '}
        <a
          href={SQUID_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--ink)', textDecoration: 'underline' }}
        >
          BRIDGE WITH SQUID
        </a>
      </span>
      <button
        onClick={onDismiss}
        aria-label="dismiss"
        style={{
          position: 'absolute',
          right: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'transparent',
          border: 'none',
          color: 'var(--ink)',
          fontFamily: "'Space Mono', monospace",
          fontWeight: 700,
          fontSize: 10,
          cursor: 'pointer',
          padding: '0 6px',
        }}
      >
        ✕
      </button>
    </div>
  )
}
