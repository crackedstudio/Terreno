/* Mercury design reference — the palette, the type, and the parts, in one
   place. Open at /dev/design-preview (gated out of production by
   src/app/dev/layout.tsx).

   This used to be a gallery of static screen mockups. Those mockups were
   snapshots of the previous brand and went stale the moment the real screens
   moved on — the app itself is now the honest mockup. What is genuinely
   useful to keep here is the token layer: what the colours mean, what the two
   faces are for, and what a block looks like on each surface, so a new
   component can be checked against the system without reading globals.css. */

import Link from 'next/link'

const SWATCHES: { token: string; hex: string; name: string; use: string }[] = [
  { token: '--ink', hex: '#0D0D0D', name: 'INK', use: 'Chrome, dark surfaces, every border on paper' },
  { token: '--paper', hex: '#E8E6E1', name: 'PAPER', use: 'Documents: the ledger, the deed, the claim form' },
  { token: '--stone', hex: '#C9C5BC', name: 'STONE', use: 'The grey documents sit on' },
  { token: '--held', hex: '#1F3BE8', name: 'HELD', use: 'Land somebody holds — and the primary action' },
  { token: '--rot', hex: '#FF4A0F', name: 'ROT', use: 'Decay, warnings, the thing to look at' },
  { token: '--yours', hex: '#B430FF', name: 'YOURS', use: "The connected wallet's own land" },
  { token: '--fresh', hex: '#F2E20A', name: 'FRESH', use: 'Just changed hands' },
  { token: '--free', hex: '#B8B4AC', name: 'FREE', use: 'Unclaimed land' },
  { token: '--water', hex: '#1A1916', name: 'WATER', use: 'Locked ocean — the contract will not sell it' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 40 }}>
      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: '0.2em',
          color: 'var(--mute-on-paper)',
        }}
      >
        {title}
      </div>
      <div className="punch" style={{ margin: '10px 0 18px' }} />
      {children}
    </section>
  )
}

export default function DesignPreviewPage() {
  return (
    <main
      className="surface-paper"
      style={{ minHeight: '100vh', padding: '28px 20px 64px' }}
    >
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <span
            style={{
              background: 'var(--ink)',
              color: 'var(--paper)',
              fontFamily: "'Space Mono', monospace",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.2em',
              padding: '6px 12px',
            }}
          >
            1A
          </span>
          <h1 className="font-display" style={{ fontSize: 40, lineHeight: 0.9, margin: 0 }}>
            TERRENO / MERCURY
          </h1>
        </div>

        <Section title="PALETTE">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 10,
            }}
          >
            {SWATCHES.map((s) => (
              <div key={s.token}>
                <div style={{ height: 64, background: s.hex, border: '3px solid var(--ink)' }} />
                <div
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontWeight: 700,
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    marginTop: 6,
                  }}
                >
                  {s.hex} · {s.name}
                </div>
                <div
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 10,
                    lineHeight: 1.5,
                    color: 'var(--mute-on-paper)',
                    marginTop: 3,
                  }}
                >
                  <code>{s.token}</code>
                  <br />
                  {s.use}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="TYPE">
          <div className="font-display" style={{ fontSize: 48, lineHeight: 1 }}>
            0.42
          </div>
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontWeight: 700,
              fontSize: 9,
              letterSpacing: '0.14em',
              color: 'var(--mute-on-paper)',
              margin: '4px 0 20px',
            }}
          >
            ARCHIVO BLACK — FIGURES, HEADLINES, THE WORDMARK. ONE WEIGHT ONLY.
          </div>
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '0.14em',
            }}
          >
            PLOT 118,042 · HELD 41 DAYS
          </div>
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontWeight: 700,
              fontSize: 9,
              letterSpacing: '0.14em',
              color: 'var(--mute-on-paper)',
              marginTop: 4,
            }}
          >
            SPACE MONO — LABELS, DATA, BODY, EVERYTHING ELSE.
          </div>
        </Section>

        <Section title="VOICE">
          <div
            style={{
              borderLeft: '6px solid var(--rot)',
              paddingLeft: 14,
              fontFamily: "'Space Mono', monospace",
              fontSize: 13,
              lineHeight: 1.75,
            }}
          >
            CLAIM IT AND THE PRICE DOUBLES.
            <br />
            LEAVE IT AND THE PRICE ROTS.
            <br />
            THE REGISTRY DOES NOT FORGET.
          </div>
        </Section>

        <Section title="PARTS — ON PAPER">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <span className="pixel-btn pixel-btn-filled">SIGN &amp; CLAIM</span>
            <span className="pixel-btn">DISCARD</span>
            <span className="pixel-btn pixel-btn-sm pixel-btn-rot">TAKE THE ROT</span>
            <span className="chip" style={{ color: 'var(--rot)' }}>
              ROTTING
            </span>
            <span className="stamp">UNSTAMPED</span>
          </div>
          <div className="brut-card" style={{ padding: 16, marginTop: 22, maxWidth: 320 }}>
            <div className="font-display" style={{ fontSize: 22, lineHeight: 1.05 }}>
              A BLOCK ON PAPER
            </div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 11,
                lineHeight: 1.6,
                color: 'var(--mute-on-paper)',
                marginTop: 6,
              }}
            >
              3px border and a 6px offset shadow, both drawn in <code>--edge</code>.
            </div>
          </div>
        </Section>

        {/* The same parts on ink. `--edge` flips to paper here, which is the
            single mechanism that keeps a block legible on either surface. */}
        <Section title="PARTS — ON INK">
          <div className="surface-ink" style={{ padding: 22 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <span className="pixel-btn pixel-btn-filled">SIGN &amp; CLAIM</span>
              <span className="pixel-btn">DISCARD</span>
              <span className="chip" style={{ color: 'var(--fresh)' }}>
                FRESH CLAIM
              </span>
            </div>
            <div className="brut-card" style={{ padding: 16, marginTop: 22, maxWidth: 320 }}>
              <div className="font-display" style={{ fontSize: 22, lineHeight: 1.05, color: 'var(--paper)' }}>
                THE SAME BLOCK
              </div>
              <div
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: 'var(--free)',
                  marginTop: 6,
                }}
              >
                No modifier class — the surface owns <code>--edge</code>, the block just uses it.
              </div>
            </div>
          </div>
        </Section>

        <Link
          href="/"
          className="pixel-btn"
          style={{ marginTop: 40, fontSize: 11, textDecoration: 'none' }}
        >
          BACK TO THE ATLAS
        </Link>
      </div>
    </main>
  )
}
