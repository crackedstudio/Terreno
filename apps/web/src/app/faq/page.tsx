import type { Metadata } from 'next'
import Link from 'next/link'
import IntroScreen from '@/components/Overlays/IntroScreen'
import { FAQ_GROUPS } from './content'

export const metadata: Metadata = {
  title: 'FAQ — Terreno',
}

const MONO = "'Space Mono', monospace"

/** The three rules that decide everything else on this page. */
const RULES = [
  {
    n: '01',
    accent: 'var(--held)',
    head: 'ANYTHING CAN BE TAKEN.',
    body: 'There is no lock. Pay the asking price and the plot changes hands. The old holder is paid in full, instantly.',
  },
  {
    n: '02',
    accent: 'var(--yours)',
    head: 'EVERY SALE DOUBLES THE PRICE.',
    body: 'Whatever a plot just went for, the next buyer pays twice that. A crowded plot gets expensive fast. That is the point.',
  },
  {
    n: '03',
    accent: 'var(--rot)',
    head: 'SILENCE MAKES IT ROT.',
    body: 'A plot nobody wants loses value every day it sits. Patience is a strategy — the rot lens on the map shows you where it is working.',
  },
]

/** The three crowns, and what each one actually measures. */
const CROWNS = [
  { label: 'LAND', accent: 'var(--held)', onAccent: 'var(--paper)', body: 'MOST PLOTS HELD' },
  { label: 'EMPIRE', accent: 'var(--yours)', onAccent: 'var(--paper)', body: 'BIGGEST TOUCHING BLOCK' },
  { label: 'TYCOONS', accent: 'var(--fresh)', onAccent: 'var(--ink)', body: 'DEAREST SINGLE PLOT' },
]

export default function FaqPage() {
  return (
    <article
      className="surface-paper"
      style={{
        minHeight: '100vh',
        fontFamily: MONO,
        color: 'var(--ink)',
        lineHeight: 1.6,
      }}
    >
      {/* Masthead */}
      <div
        style={{
          height: 46,
          background: 'var(--ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.2em', color: 'var(--paper)' }}>
          THE RULES · 3 OF THEM
        </span>
        <Link
          href="/profile"
          aria-label="Close"
          style={{ fontWeight: 700, fontSize: 13, color: 'var(--mute-on-ink)', textDecoration: 'none' }}
        >
          ✕
        </Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '18px 16px 40px' }}>
        <h1 className="font-display" style={{ fontSize: 52, lineHeight: 0.8, color: 'var(--ink)', margin: 0 }}>
          HOW TO
          <br />
          WIN THE
          <br />
          WORLD
        </h1>

        {/* The three rules, as hard-shadow blocks. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 22 }}>
          {RULES.map((r) => (
            <div
              key={r.n}
              style={{
                border: '3px solid var(--ink)',
                boxShadow: `5px 5px 0 ${r.accent}`,
                padding: '12px 14px',
                display: 'flex',
                gap: 12,
                alignItems: 'baseline',
              }}
            >
              <span className="font-display" style={{ fontSize: 34, color: r.accent, flexShrink: 0 }}>
                {r.n}
              </span>
              <div>
                <div className="font-display" style={{ fontSize: 26, lineHeight: 0.92, color: 'var(--ink)' }}>
                  {r.head}
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--mute-on-paper)', margin: '6px 0 0' }}>
                  {r.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* The crowns */}
        <div style={{ marginTop: 26 }}>
          <div style={{ fontWeight: 700, fontSize: 9, letterSpacing: '0.2em', color: 'var(--mute-on-paper)', marginBottom: 9 }}>
            THREE CROWNS, THREE GAMES
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {CROWNS.map((c) => (
              <div key={c.label} style={{ border: '3px solid var(--ink)', padding: '9px 8px' }}>
                <div
                  style={{
                    display: 'inline-block',
                    fontWeight: 700,
                    fontSize: 10,
                    letterSpacing: '0.14em',
                    background: c.accent,
                    color: c.onAccent,
                    padding: '2px 5px',
                  }}
                >
                  {c.label}
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--ink)', marginTop: 4 }}>
                  {c.body}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Replayable onboarding carousel — the same walkthrough new players
            see once, embedded here so "HOW TO WIN" can send them back to it
            anytime. */}
        <div style={{ marginTop: 30 }}>
          <IntroScreen inline />
        </div>

        {/* Jump links sit above the answers: a player worried about a missing
            payout shouldn't have to scroll the whole page to reach one. */}
        <nav
          aria-label="FAQ sections"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 30 }}
        >
          {FAQ_GROUPS.map(({ id, title }) => (
            <a
              key={id}
              href={`#${id}`}
              style={{
                fontWeight: 700,
                fontSize: 9,
                letterSpacing: '0.12em',
                color: 'var(--ink)',
                textDecoration: 'none',
                padding: '6px 9px',
                border: '2px solid var(--ink)',
                lineHeight: 1.4,
                textTransform: 'uppercase',
              }}
            >
              {title}
            </a>
          ))}
        </nav>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 30, marginTop: 26 }}>
          {FAQ_GROUPS.map(({ id, title, items }) => (
            <section key={id} id={id} style={{ scrollMarginTop: 16 }}>
              <h2
                className="font-display"
                style={{ fontSize: 34, lineHeight: 0.92, color: 'var(--ink)', margin: 0 }}
              >
                {title.toUpperCase()}
              </h2>
              <div className="punch" style={{ margin: '12px 0 18px' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {items.map((item) => (
                  <section key={item.id} id={item.id} style={{ scrollMarginTop: 16 }}>
                    <h3
                      style={{
                        fontWeight: 700,
                        fontSize: 12,
                        letterSpacing: '0.06em',
                        color: 'var(--ink)',
                        margin: '0 0 7px',
                        lineHeight: 1.5,
                        textTransform: 'uppercase',
                      }}
                    >
                      {item.q}
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--mute-on-paper)', margin: 0 }}>
                      {item.a}
                      {item.link && (
                        <>
                          {' '}
                          <a
                            href={item.link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--held)' }}
                          >
                            {item.link.label}
                          </a>
                        </>
                      )}
                    </p>
                  </section>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* The scarcity line, then the way back to the map. */}
        <div className="surface-ink" style={{ padding: 16, marginTop: 34 }}>
          <div className="font-display" style={{ fontSize: 26, lineHeight: 0.92, color: 'var(--paper)' }}>
            THE REGISTRY DOES NOT FORGET.
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--free)', margin: '8px 0 0' }}>
            Every claim, every price, every holder since block one is readable
            by anyone. There is no admin, no mint button, no second world.
          </p>
        </div>

        <Link
          href="/"
          className="pixel-btn pixel-btn-filled"
          style={{ width: '100%', marginTop: 12, fontSize: 12, padding: 15, textDecoration: 'none' }}
        >
          TAKE SOMETHING
        </Link>
      </div>
    </article>
  )
}
