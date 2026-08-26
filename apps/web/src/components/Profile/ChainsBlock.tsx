'use client'

import { useNimiqLink } from '@/hooks/useNimiqLink'
import { formatNimAddress } from '@/lib/nimiqLink'

const MONO = "'Space Mono', monospace"

const LABEL: React.CSSProperties = {
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: '0.2em',
}

const VALUE: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: '0.04em',
  color: 'var(--on-surface)',
  wordBreak: 'break-all',
}

/**
 * Row action. 44px minimum height — these are tapped with a thumb inside a
 * phone WebView, and the compact `.pixel-btn-sm` alone lands under that.
 */
const ACTION: React.CSSProperties = {
  minHeight: 44,
  fontSize: 10,
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

interface ChainsBlockProps {
  /** The connected Base address, or undefined when no wallet is connected. */
  baseAddress?: string
}

/**
 * Both injected providers, as one block on the deed.
 *
 * The two rows are the two providers, and the flow walks down the block: LINK
 * and SIGN on the NIM row drive the Nimiq provider, then CONFIRM on the BASE
 * row drives `personal_sign` over the same challenge. Each tap raises exactly
 * one native dialog — never two in sequence, which are indistinguishable to the
 * person answering them.
 *
 * Base is where land actually lives; that half is read from the connected
 * wallet and is not something this block can change. What it *can* do is ask
 * that wallet to sign, which is the difference between the CONNECTED and
 * SIGNED states: connected says which wallet is in the session, signed proves
 * control of it. Only `proven` — both signatures present — renders as SIGNED
 * on both rows.
 *
 * Connecting a Base wallet is the precondition for the whole block, not just
 * the Base row: the challenge names both addresses, so there is nothing to
 * sign until the Base half is known. Both unavailable states therefore name
 * what is missing — CONNECT WALLET FIRST without a wallet, NIMIQ PAY ONLY in a
 * browser — rather than offering a control that cannot work.
 */
export default function ChainsBlock({ baseAddress }: ChainsBlockProps) {
  const {
    status,
    nimAddress,
    link,
    proven,
    error,
    failedStep,
    busy,
    requestAccount,
    signNim,
    signBase,
    unlink,
  } = useNimiqLink(baseAddress)

  const shortBase = baseAddress
    ? `${baseAddress.slice(0, 6)}…${baseAddress.slice(-4)}`.toUpperCase()
    : null

  return (
    // No width or padding of its own: on the deed this sits inside the page's
    // `maxWidth: 460, padding: '0 16px'` column, and setting either again here
    // would inset it out of line with every sibling block.
    <section aria-label="Connected chains" style={{ width: '100%', marginTop: 18 }}>
      <div style={{ ...LABEL, color: 'var(--muted)', marginBottom: 9 }}>CHAINS</div>

      <div
        style={{
          border: '3px solid var(--edge)',
          boxShadow: '4px 4px 0 var(--edge)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ---- Base ------------------------------------------------------ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '11px 12px',
            minHeight: 56,
          }}
        >
          <span style={{ ...LABEL, color: 'var(--held)', width: 46, flexShrink: 0 }}>
            BASE
          </span>
          <span style={{ ...VALUE, flex: 1, minWidth: 0 }}>
            {shortBase ?? <span style={{ color: 'var(--muted)' }}>NOT CONNECTED</span>}
          </span>
          {/* The Base half of the proof. Until it is signed the row says
              CONNECTED, not VERIFIED — being connected shows which wallet is
              in the session, which is not the same as proving control of it. */}
          {proven ? (
            <span style={{ ...LABEL, fontSize: 8, color: 'var(--held)' }}>✓ SIGNED</span>
          ) : status === 'base-signing' ? (
            <button type="button" className="pixel-btn pixel-btn-sm" style={ACTION} disabled>
              WAIT…
            </button>
          ) : status === 'nim-signed' ? (
            <button
              type="button"
              className="pixel-btn pixel-btn-sm pixel-btn-filled"
              style={ACTION}
              onClick={() => void signBase()}
            >
              {failedStep === 'base-signature' ? 'RETRY' : 'CONFIRM'}
            </button>
          ) : shortBase ? (
            <span style={{ ...LABEL, fontSize: 8, color: 'var(--muted)' }}>CONNECTED</span>
          ) : null}
        </div>

        <div style={{ height: 3, background: 'var(--edge)' }} />

        {/* ---- Nimiq ----------------------------------------------------- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '11px 12px',
            minHeight: 56,
          }}
        >
          <span style={{ ...LABEL, color: 'var(--yours)', width: 46, flexShrink: 0 }}>
            NIM
          </span>

          <span style={{ ...VALUE, flex: 1, minWidth: 0 }}>
            {status === 'unsupported' ? (
              <span style={{ color: 'var(--muted)' }}>NIMIQ PAY ONLY</span>
            ) : status === 'account-pending' ? (
              <span style={{ color: 'var(--muted)' }}>CHECK NIMIQ PAY…</span>
            ) : status === 'nim-signing' ? (
              <span style={{ color: 'var(--muted)' }}>SIGN IN NIMIQ PAY…</span>
            ) : nimAddress ? (
              formatNimAddress(nimAddress)
            ) : !baseAddress ? (
              // The precondition, named. A dash beside a dead button reads as
              // broken; this says which step comes first.
              <span style={{ color: 'var(--muted)' }}>CONNECT WALLET FIRST</span>
            ) : (
              <span style={{ color: 'var(--muted)' }}>—</span>
            )}
          </span>

          {(status === 'nim-signed' || status === 'linked') && (
            <span style={{ ...LABEL, fontSize: 8, color: 'var(--held)' }}>✓ SIGNED</span>
          )}

          {/* One control per state. `busy` disables rather than hides, so the
              row does not change height while a native dialog is open.
              Disconnected is the exception: the control is absent, not
              disabled, because linking cannot start before a Base wallet is
              connected and a greyed-out button invites a tap that does
              nothing. The row says CONNECT WALLET FIRST instead. */}
          {status === 'idle' && baseAddress && (
            <button
              type="button"
              className="pixel-btn pixel-btn-sm"
              style={ACTION}
              onClick={() => void requestAccount()}
            >
              {failedStep === 'nim-account' ? 'RETRY' : 'LINK'}
            </button>
          )}

          {status === 'account-ready' && (
            <button
              type="button"
              className="pixel-btn pixel-btn-sm pixel-btn-filled"
              style={ACTION}
              onClick={() => void signNim()}
            >
              {failedStep === 'nim-signature' ? 'RETRY SIGN' : 'SIGN'}
            </button>
          )}

          {busy && status !== 'base-signing' && (
            <button type="button" className="pixel-btn pixel-btn-sm" style={ACTION} disabled>
              WAIT…
            </button>
          )}

          {/* Also offered while half-signed: a holder who signed with Nimiq
              and then changed their mind about the Base half must be able to
              discard the record rather than be stuck mid-flow. */}
          {(status === 'linked' || status === 'nim-signed') && (
            <button
              type="button"
              className="pixel-btn pixel-btn-sm"
              style={ACTION}
              onClick={unlink}
            >
              UNLINK
            </button>
          )}
        </div>
      </div>

      {/* Status line. `aria-live` because the outcome of a native dialog lands
          here and a screen-reader user gets no other announcement of it. */}
      <p
        aria-live="polite"
        style={{
          fontFamily: MONO,
          fontSize: 10,
          lineHeight: 1.6,
          margin: '9px 0 0',
          color: error ? 'var(--rot)' : 'var(--muted)',
        }}
      >
        {error ??
          (status === 'idle' && !baseAddress
            ? 'Connect your Base wallet above, then link a Nimiq address to your deed.'
            : status === 'account-ready'
            ? 'Step 2 of 3 — sign with Nimiq to prove you control that address.'
            : status === 'nim-signed'
              ? 'Step 3 of 3 — confirm with your Base wallet to finish the link.'
              : proven && link
                ? `Both wallets signed ${new Date(link.linkedAt).toLocaleDateString()}. Stored on this device only.`
                  : status === 'idle'
                    ? 'Prove one owner holds both wallets. Three taps, no funds move.'
                    : '')}
      </p>
    </section>
  )
}
