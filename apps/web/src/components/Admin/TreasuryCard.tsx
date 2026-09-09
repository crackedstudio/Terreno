'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useWithdraw } from '@/hooks/useWithdraw'
import { parseWithdrawAmount, parseDestination, shortAddress } from '@/lib/treasury'
import type { TreasuryHolding, TreasuryView } from '@/hooks/useTreasury'

const MONO = "'Space Mono', monospace"

const LABEL: React.CSSProperties = {
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: '0.2em',
}

/** What the owner is about to sign, held until they confirm it. */
type Pending =
  | { kind: 'one'; holding: TreasuryHolding; units: bigint; display: string }
  | { kind: 'all' }

/**
 * One map's treasury: what it holds, and the two ways to move it out.
 *
 * The screen is built around the fact that a transfer cannot be undone. So:
 *
 *   - the destination defaults to the connected owner wallet, which is the
 *     answer almost every time and the only one that cannot be a typo;
 *   - sending somewhere else is a deliberate act — the field has to be opened,
 *     and the address is checksum-validated before it can be used;
 *   - nothing reaches the wallet without a confirm step that spells out the
 *     amount, the token and the destination in words. The wallet's own dialog
 *     shows calldata, which is not a sentence anyone reads for a typo;
 *   - SWEEP is offered even when a token's decimals could not be read, because
 *     `withdrawAll` does its arithmetic on chain. The typed-amount form is the
 *     one that goes away, since that is the path where a guessed decimal place
 *     would move a wrong number.
 */
export default function TreasuryCard({ treasury }: { treasury: TreasuryView }) {
  const { address: connected } = useAccount()
  const { step, error, txHash, busy, withdraw, reset } = useWithdraw()

  const [customTo, setCustomTo] = useState<string | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [rowError, setRowError] = useState<{ token: string; message: string } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  const destinationInput = customTo ?? connected ?? ''
  const destination = parseDestination(destinationInput)

  const settle = async (req: Parameters<typeof withdraw>[0]) => {
    const ok = await withdraw(req)
    setPending(null)
    if (ok) {
      setAmounts({})
      treasury.refetch()
    }
  }

  const askOne = (holding: TreasuryHolding) => {
    setRowError(null)
    if (!destination.ok) {
      setRowError({ token: holding.address, message: destination.reason })
      return
    }
    const parsed = parseWithdrawAmount(
      amounts[holding.address] ?? '',
      holding.decimals,
      holding.raw,
    )
    if (!parsed.ok) {
      setRowError({ token: holding.address, message: parsed.reason })
      return
    }
    reset()
    setPending({
      kind: 'one',
      holding,
      units: parsed.units,
      display: (amounts[holding.address] ?? '').trim(),
    })
  }

  const askAll = () => {
    setRowError(null)
    if (!destination.ok) {
      setRowError({ token: 'all', message: destination.reason })
      return
    }
    reset()
    setPending({ kind: 'all' })
  }

  return (
    <div
      className="brut"
      style={{
        padding: '13px 14px 15px',
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
      }}
    >
      <div>
        <div className="font-display" style={{ fontSize: 26, lineHeight: 0.9 }}>
          {treasury.displayName}
        </div>
        <div style={{ ...LABEL, color: 'var(--text-muted)', marginTop: 5 }}>
          {shortAddress(treasury.contract)} · YOU OWN THIS CONTRACT
        </div>
      </div>

      {/* Balances. A zero row is still drawn: "this token is empty" is an
          answer, and hiding it would read as the token not being accepted. */}
      {treasury.holdings.length === 0 ? (
        <p style={{ fontFamily: MONO, fontSize: 11, margin: 0, color: 'var(--text-muted)' }}>
          {treasury.isLoading ? 'Reading balances…' : 'This contract accepts no tokens.'}
        </p>
      ) : (
        treasury.holdings.map((h) => (
          <HoldingRow
            key={h.address}
            holding={h}
            amount={amounts[h.address] ?? ''}
            onAmount={(v) => setAmounts((a) => ({ ...a, [h.address]: v }))}
            onMax={() =>
              h.formatted !== null &&
              setAmounts((a) => ({ ...a, [h.address]: h.formatted as string }))
            }
            onWithdraw={() => askOne(h)}
            error={rowError?.token === h.address ? rowError.message : null}
            busy={busy}
          />
        ))
      )}

      <Destination
        value={destinationInput}
        isCustom={customTo !== null}
        valid={destination.ok}
        reason={destination.ok ? null : destination.reason}
        onOpen={() => setCustomTo(connected ?? '')}
        onChange={setCustomTo}
        onReset={() => setCustomTo(null)}
      />

      <button
        type="button"
        className="pixel-btn pixel-btn-sm"
        style={{ width: '100%', fontSize: 10, justifyContent: 'center' }}
        disabled={busy || !treasury.hasFunds}
        onClick={askAll}
      >
        {treasury.hasFunds ? 'SWEEP EVERY TOKEN' : 'NOTHING TO WITHDRAW'}
      </button>
      {rowError?.token === 'all' && <RowError>{rowError.message}</RowError>}

      {pending && destination.ok && (
        <Confirm
          pending={pending}
          to={destination.address}
          busy={busy}
          step={step}
          onCancel={() => setPending(null)}
          onConfirm={() =>
            void settle(
              pending.kind === 'all'
                ? { mapId: treasury.mapId, to: destination.address }
                : {
                    mapId: treasury.mapId,
                    to: destination.address,
                    token: pending.holding.address,
                    amount: pending.units,
                  },
            )
          }
        />
      )}

      {error && <RowError>{error}</RowError>}

      {step === 'done' && txHash && (
        <div style={{ ...LABEL, color: 'var(--held)', lineHeight: 1.6 }}>
          WITHDRAWN · TX {shortAddress(txHash)}
        </div>
      )}
    </div>
  )
}

function HoldingRow({
  holding,
  amount,
  onAmount,
  onMax,
  onWithdraw,
  error,
  busy,
}: {
  holding: TreasuryHolding
  amount: string
  onAmount: (v: string) => void
  onMax: () => void
  onWithdraw: () => void
  error: string | null
  busy: boolean
}) {
  const empty = holding.raw === 0n
  // No decimals means no safe way to turn a typed amount into base units. The
  // row still shows what it can and defers to SWEEP rather than guessing.
  const canType = holding.decimals !== undefined && !empty

  return (
    <div style={{ borderTop: '2px solid var(--edge)', paddingTop: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ ...LABEL, fontSize: 10 }}>{holding.symbol}</span>
        <span
          className="font-display"
          style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums' }}
        >
          {holding.formatted ?? '—'}
        </span>
      </div>

      {holding.decimals === undefined && (
        <div style={{ ...LABEL, fontSize: 8, color: 'var(--error)', marginTop: 5, lineHeight: 1.6 }}>
          DECIMALS UNREADABLE — USE SWEEP, WHICH LETS THE CONTRACT DO THE MATH
        </div>
      )}

      {canType && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`Amount of ${holding.symbol} to withdraw`}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '9px 10px',
              border: '2px solid var(--edge)',
              background: 'transparent',
              color: 'var(--text)',
              fontFamily: MONO,
              fontSize: 12,
            }}
          />
          <button
            type="button"
            onClick={onMax}
            className="pixel-btn pixel-btn-sm"
            style={{ fontSize: 9, padding: '7px 9px' }}
          >
            MAX
          </button>
          <button
            type="button"
            onClick={onWithdraw}
            disabled={busy}
            className="pixel-btn pixel-btn-sm"
            style={{ fontSize: 9, padding: '7px 9px' }}
          >
            SEND
          </button>
        </div>
      )}

      {error && <RowError>{error}</RowError>}
    </div>
  )
}

function Destination({
  value,
  isCustom,
  valid,
  reason,
  onOpen,
  onChange,
  onReset,
}: {
  value: string
  isCustom: boolean
  valid: boolean
  reason: string | null
  onOpen: () => void
  onChange: (v: string) => void
  onReset: () => void
}) {
  return (
    <div style={{ borderTop: '2px solid var(--edge)', paddingTop: 9 }}>
      <div style={{ ...LABEL, color: 'var(--text-muted)' }}>SENDING TO</div>

      {!isCustom ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, flex: 1, minWidth: 0 }}>
            {value ? shortAddress(value) : '—'} (this wallet)
          </span>
          <button
            type="button"
            onClick={onOpen}
            style={{
              ...LABEL,
              fontSize: 8,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            SEND ELSEWHERE
          </button>
        </div>
      ) : (
        <>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label="Destination address"
            placeholder="0x…"
            style={{
              width: '100%',
              marginTop: 6,
              padding: '9px 10px',
              border: `2px solid ${valid ? 'var(--edge)' : 'var(--error)'}`,
              background: 'transparent',
              color: 'var(--text)',
              fontFamily: MONO,
              fontSize: 12,
            }}
          />
          <button
            type="button"
            onClick={onReset}
            style={{
              ...LABEL,
              fontSize: 8,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px 4px 0',
            }}
          >
            USE THIS WALLET INSTEAD
          </button>
          {reason && <RowError>{reason}</RowError>}
        </>
      )}
    </div>
  )
}

/** The last stop before the wallet. Says the thing out loud, in words. */
function Confirm({
  pending,
  to,
  busy,
  step,
  onCancel,
  onConfirm,
}: {
  pending: Pending
  to: `0x${string}`
  busy: boolean
  step: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const what =
    pending.kind === 'all'
      ? 'every token this contract holds'
      : `${pending.display} ${pending.holding.symbol}`

  return (
    <div
      role="alertdialog"
      aria-label="Confirm withdrawal"
      style={{
        border: '3px solid var(--error)',
        padding: '11px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
      }}
    >
      <p style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.6, margin: 0 }}>
        Send <strong>{what}</strong> to <strong>{shortAddress(to)}</strong>?
      </p>
      <p style={{ ...LABEL, fontSize: 8, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7 }}>
        {to}
      </p>
      <p style={{ ...LABEL, fontSize: 8, color: 'var(--error)', margin: 0, lineHeight: 1.7 }}>
        THIS CANNOT BE UNDONE.
      </p>
      <div style={{ display: 'flex', gap: 7 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="pixel-btn pixel-btn-sm"
          style={{ flex: 1, fontSize: 9, justifyContent: 'center' }}
        >
          CANCEL
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="pixel-btn pixel-btn-sm pixel-btn-rot"
          style={{ flex: 1, fontSize: 9, justifyContent: 'center' }}
        >
          {step === 'switching'
            ? 'SWITCHING…'
            : step === 'signing'
              ? 'CHECK WALLET…'
              : step === 'pending'
                ? 'CONFIRMING…'
                : 'WITHDRAW'}
        </button>
      </div>
    </div>
  )
}

function RowError({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        marginTop: 7,
        fontFamily: MONO,
        fontSize: 10,
        lineHeight: 1.55,
        color: 'var(--error)',
      }}
    >
      {children}
    </div>
  )
}
