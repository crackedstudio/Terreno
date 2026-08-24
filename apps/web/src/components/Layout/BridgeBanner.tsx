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
      if (sessionStorage.getItem('mondeto-bridge-dismissed') === '1') {
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
      sessionStorage.setItem('mondeto-bridge-dismissed', '1')
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
        minHeight: 28,
        background: '#A7FF05',
        color: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 32px',
        fontFamily: "'Press Start 2P', monospace",
      }}
    >
      <span style={{ fontSize: 7, letterSpacing: 1, textAlign: 'center' }}>
        no stables on celo yet —{' '}
        <a
          href={SQUID_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#000', textDecoration: 'underline' }}
        >
          bridge with squid
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
          color: '#000',
          fontSize: 9,
          letterSpacing: 1,
          cursor: 'pointer',
          padding: '0 4px',
          fontFamily: "'Press Start 2P', monospace",
        }}
      >
        x
      </button>
    </div>
  )
}
