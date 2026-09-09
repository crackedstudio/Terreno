'use client'

import { useEffect, useState } from 'react'
import {
  NimPayPanelView,
  type NimHost,
} from '@/components/Overlays/NimPayPanel'
import type { NimQuote } from '@/hooks/useNimPayment'
import { SETTLEMENT_WINDOW_MS } from '@/lib/nim/quote'

/**
 * Every state of the NIM payment panel, side by side.
 *
 * The flow it draws costs real NIM and takes minutes to reach its later
 * states, so before this page the only way to look at "settling" was to buy
 * something. Gated with the rest of `/dev` — see `dev/layout.tsx`.
 */

const secondsFromNow = (s: number) => Math.floor(Date.now() / 1000) + s

function quote(overrides: Partial<NimQuote> = {}): NimQuote {
  return {
    order: {},
    tag: 'a'.repeat(64),
    treasury: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
    luna: '168740000',
    nim: '1,687.4',
    usdMicros: '54104',
    bufferBps: 300,
    expiresAt: secondsFromNow(900),
    ttlSeconds: 900,
    ...overrides,
  }
}

const BASE = {
  host: 'pay' as NimHost,
  quote: null,
  error: null,
  progress: null,
  nimTxHash: null,
  pixelCount: 2,
  hasRecipient: true,
  busy: false,
  onPrimary: () => {},
  onDiscard: () => {},
}

type PreviewState = { name: string; props: Parameters<typeof NimPayPanelView>[0] }

/** Built after mount, never during SSR: every quote below is dated from
 *  `Date.now()`, so a server-rendered copy would hydrate to different bar
 *  widths and bury the page's real errors under a mismatch warning. */
const buildStates = (): PreviewState[] => [
  { name: 'no wallet connected', props: { ...BASE, status: 'idle', hasRecipient: false } },
  { name: 'idle', props: { ...BASE, status: 'idle' } },
  { name: 'quoting', props: { ...BASE, status: 'quoting', busy: true } },
  { name: 'quoted — fresh', props: { ...BASE, status: 'quoted', quote: quote() } },
  {
    name: 'quoted — nearly stale',
    props: {
      ...BASE,
      status: 'quoted',
      quote: quote({ expiresAt: secondsFromNow(SETTLEMENT_WINDOW_MS / 1000 + 40) }),
    },
  },
  {
    name: 'quoted — expired (pay refused)',
    props: { ...BASE, status: 'quoted', quote: quote({ expiresAt: secondsFromNow(10) }) },
  },
  {
    name: 'awaiting payment',
    props: {
      ...BASE,
      status: 'awaiting-payment',
      busy: true,
      quote: quote(),
      progress: 'Confirm the payment in Nimiq Pay…',
    },
  },
  {
    name: 'settling',
    props: {
      ...BASE,
      status: 'settling',
      busy: true,
      quote: quote(),
      progress: 'Payment sent. Waiting for confirmations…',
      nimTxHash: 'b'.repeat(64),
    },
  },
  { name: 'settled', props: { ...BASE, status: 'settled', quote: quote() } },
  {
    name: 'error after a refused dialog',
    props: {
      ...BASE,
      status: 'quoted',
      quote: quote(),
      error: 'The NIM payment was not completed.',
    },
  },
  {
    name: 'error — stale quote refused',
    props: {
      ...BASE,
      status: 'idle',
      error: 'That price is too old to pay safely. Get a fresh NIM price.',
    },
  },
  {
    name: 'browser host (Web Wallet)',
    props: { ...BASE, host: 'web', status: 'quoted', quote: quote() },
  },
]

export default function NimPreviewPage() {
  const [dark, setDark] = useState(false)
  const [states, setStates] = useState<PreviewState[] | null>(null)
  useEffect(() => setStates(buildStates()), [])
  return (
    <div
      data-theme={dark ? 'dark' : 'light'}
      style={{ minHeight: '100vh', background: 'var(--bg)', padding: 24 }}
    >
      <button
        className="pixel-btn pixel-btn-sm"
        style={{ fontSize: 10, marginBottom: 20 }}
        onClick={() => setDark((v) => !v)}
      >
        {dark ? 'LIGHT' : 'DARK'}
      </button>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 26,
        }}
      >
        {(states ?? []).map(({ name, props }) => (
          <div key={name}>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontWeight: 700,
                fontSize: 9,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: 8,
              }}
            >
              {name}
            </div>
            {/* The drawer is a `.surface-paper` region — without it the panel
                inherits ink edges on a paper fill and draws invisible
                buttons. Previewing outside that scope would be previewing a
                surface no player ever sees. */}
            <div className="surface-paper" style={{ padding: 12 }}>
              <NimPayPanelView {...props} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
