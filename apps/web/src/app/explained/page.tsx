import type { Metadata } from 'next'
import Link from 'next/link'
import {
  CROWNS,
  CROWNS_NOTE,
  DETAILS,
  ECONOMICS,
  ECONOMICS_POINTS,
  FACTS,
  HERO,
  LENSES,
  LENSES_NOTE,
  LOOP,
  ONCHAIN,
  REGISTRY_NOTE,
  RULES,
  START,
  WHAT_IT_IS,
  WORLDS,
} from './content'

export const metadata: Metadata = {
  title: 'What is Terreno? — Terreno',
  description:
    'One world map, 5,622 plots of land, all of them for sale. The three rules, the three crowns, and how to start playing.',
}

const MONO = "'Space Mono', monospace"

/** Section heading + perforation, repeated down the document. */
function Head({ id, children }: { id: string; children: string }) {
  return (
    <>
      <h2
        id={id}
        className="font-display"
        style={{ fontSize: 34, lineHeight: 0.92, color: 'var(--ink)', margin: 0, scrollMarginTop: 16 }}
      >
        {children}
      </h2>
      <div className="punch" style={{ margin: '12px 0 16px' }} />
    </>
  )
}

function Body({ text }: { text: string }) {
  return (
    <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--mute-on-paper)', margin: '0 0 12px' }}>
      {text}
    </p>
  )
}

export default function ExplainedPage() {
  return (
    <article
      className="surface-paper"
      style={{ minHeight: '100vh', fontFamily: MONO, color: 'var(--ink)', lineHeight: 1.6 }}
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
          WHAT IS TERRENO
        </span>
        <Link
          href="/"
          aria-label="Close"
          style={{ fontWeight: 700, fontSize: 13, color: 'var(--mute-on-ink)', textDecoration: 'none' }}
        >
          ✕
        </Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '18px 16px 40px' }}>
        {/* Hero */}
        <h1 className="font-display" style={{ fontSize: 52, lineHeight: 0.8, color: 'var(--ink)', margin: 0 }}>
          {HERO.headline.map((line) => (
            <span key={line} style={{ display: 'block' }}>
              {line}
            </span>
          ))}
        </h1>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--mute-on-paper)', margin: '16px 0 0' }}>
          {HERO.body}
        </p>

        {/* Headline figures */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
            marginTop: 20,
          }}
        >
          {FACTS.map((f) => (
            <div key={f.label} style={{ border: '3px solid var(--ink)', padding: '9px 10px' }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  color: 'var(--mute-on-paper)',
                  marginBottom: 4,
                }}
              >
                {f.label}
              </div>
              <div className="font-display" style={{ fontSize: 30, lineHeight: 1, color: 'var(--ink)' }}>
                {f.value}
              </div>
            </div>
          ))}
        </div>

        {/* What it is */}
        <div style={{ marginTop: 32 }}>
          <Head id={WHAT_IT_IS.id}>{WHAT_IT_IS.title.toUpperCase()}</Head>
          {WHAT_IT_IS.paragraphs.map((p) => (
            <Body key={p.slice(0, 24)} text={p} />
          ))}
        </div>

        {/* The three rules — the same hard-shadow blocks the FAQ opens with,
            deliberately, because it is the same three rules. */}
        <div style={{ marginTop: 32 }}>
          <Head id="rules">HOW TO WIN THE WORLD</Head>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
        </div>

        {/* The crowns */}
        <div style={{ marginTop: 32 }}>
          <Head id="crowns">THREE CROWNS, THREE GAMES</Head>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CROWNS.map((c) => (
              <div
                key={c.label}
                style={{
                  border: '3px solid var(--ink)',
                  padding: '10px 12px',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 10,
                    letterSpacing: '0.14em',
                    background: c.accent,
                    color: c.onAccent,
                    padding: '3px 6px',
                    flexShrink: 0,
                  }}
                >
                  {c.label}
                </div>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--ink)', fontWeight: 700 }}>
                    {c.won}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--mute-on-paper)', marginTop: 3 }}>
                    {c.rewards}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--mute-on-paper)', margin: '12px 0 0' }}>
            {CROWNS_NOTE}
          </p>
        </div>

        {/* The lenses */}
        <div style={{ marginTop: 32 }}>
          <Head id="lenses">THREE WAYS TO READ THE MAP</Head>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {LENSES.map((l) => (
              <div
                key={l.label}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'baseline',
                  padding: '10px 0',
                  borderBottom: '2px solid var(--free)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 11, height: 11, background: l.swatch, flexShrink: 0, display: 'block' }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', color: 'var(--ink)' }}>
                    {l.label}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--mute-on-paper)', marginTop: 3 }}>
                    {l.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--mute-on-paper)', margin: '12px 0 0' }}>
            {LENSES_NOTE}
          </p>
        </div>

        {/* The loop */}
        <div style={{ marginTop: 32 }}>
          <Head id="loop">HOW YOU ACTUALLY PLAY</Head>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {LOOP.map((step, i) => (
              <li
                key={step.head}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '30px 1fr',
                  gap: '0 12px',
                  padding: '10px 0',
                  borderBottom: '2px solid var(--free)',
                }}
              >
                <span className="font-display" style={{ fontSize: 26, lineHeight: 1.1, color: 'var(--free)' }}>
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', color: 'var(--ink)' }}>
                    {step.head}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--mute-on-paper)', marginTop: 3 }}>
                    {step.body}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Economics */}
        <div style={{ marginTop: 32 }}>
          <Head id={ECONOMICS.id}>{ECONOMICS.title.toUpperCase()}</Head>
          {ECONOMICS.paragraphs.map((p) => (
            <Body key={p.slice(0, 24)} text={p} />
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 6 }}>
            {ECONOMICS_POINTS.map((point) => (
              <div key={point.head} style={{ padding: '10px 0', borderBottom: '2px solid var(--free)' }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink)' }}>{point.head} </span>
                <span style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--mute-on-paper)' }}>{point.body}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Onchain */}
        <div style={{ marginTop: 32 }}>
          <Head id={ONCHAIN.id}>{ONCHAIN.title.toUpperCase()}</Head>
          {ONCHAIN.paragraphs.map((p) => (
            <Body key={p.slice(0, 24)} text={p} />
          ))}
          <div className="surface-ink" style={{ padding: 16, marginTop: 6 }}>
            <div className="font-display" style={{ fontSize: 26, lineHeight: 0.92, color: 'var(--paper)' }}>
              {REGISTRY_NOTE.head}
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--free)', margin: '8px 0 0' }}>
              {REGISTRY_NOTE.body}
            </p>
          </div>
        </div>

        {/* Details */}
        <div style={{ marginTop: 32 }}>
          <Head id="details">SMALL THINGS, DELIBERATELY DONE</Head>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {DETAILS.map((d) => (
              <div key={d.head} style={{ padding: '10px 0', borderBottom: '2px solid var(--free)' }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink)' }}>{d.head} </span>
                <span style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--mute-on-paper)' }}>{d.body}</span>
              </div>
            ))}
          </div>
        </div>

        {/* The worlds to come */}
        <div style={{ marginTop: 32 }}>
          <Head id={WORLDS.id}>{WORLDS.title.toUpperCase()}</Head>
          {WORLDS.paragraphs.map((p) => (
            <Body key={p.slice(0, 24)} text={p} />
          ))}
        </div>

        {/* Where it ends: the wallet, then the map. */}
        <div className="surface-ink" style={{ padding: 18, marginTop: 34 }}>
          <div style={{ fontWeight: 700, fontSize: 9, letterSpacing: '0.2em', color: 'var(--fresh)' }}>
            {START.eyebrow}
          </div>
          <div
            className="font-display"
            style={{ fontSize: 34, lineHeight: 0.92, color: 'var(--paper)', marginTop: 8 }}
          >
            {START.head}
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--free)', margin: '10px 0 0' }}>{START.lede}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {START.steps.map((s) => (
              <div
                key={s.n}
                style={{
                  border: '2px solid var(--line-on-ink-2)',
                  padding: '11px 13px',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'baseline',
                }}
              >
                <span className="font-display" style={{ fontSize: 30, color: 'var(--fresh)', flexShrink: 0 }}>
                  {s.n}
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', color: 'var(--paper)' }}>
                    {s.head}
                  </div>
                  <p style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--mute-on-ink)', margin: '5px 0 0' }}>
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="font-display"
            style={{
              display: 'inline-block',
              background: 'var(--fresh)',
              color: 'var(--ink)',
              fontSize: 34,
              lineHeight: 1,
              padding: '7px 12px',
              marginTop: 16,
            }}
          >
            {START.address}
          </div>

          <p style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--free)', margin: '12px 0 0' }}>{START.kicker}</p>
        </div>

        <Link
          href="/"
          className="pixel-btn pixel-btn-filled"
          style={{ width: '100%', marginTop: 12, fontSize: 12, padding: 15, textDecoration: 'none' }}
        >
          TAKE SOMETHING
        </Link>

        <Link
          href="/faq"
          className="pixel-btn"
          style={{ width: '100%', marginTop: 10, fontSize: 12, padding: 15, textDecoration: 'none' }}
        >
          READ THE FAQ
        </Link>
      </div>
    </article>
  )
}
