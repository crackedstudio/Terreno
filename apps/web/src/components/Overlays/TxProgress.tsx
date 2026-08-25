'use client'

import type { TxStep } from '@/hooks/useBuyPixels'

const PF = "'Space Mono', monospace"

interface TxProgressProps {
  step: TxStep
}

type StepState = 'done' | 'active' | 'pending'

interface StepDef {
  label: string
  getState: (step: TxStep) => StepState
}

const steps: StepDef[] = [
  {
    label: 'FUNDS UNLOCKED',
    getState: (step) =>
      // 'approved' counts as done: the allowance is set and the flow is
      // parked waiting for the player's confirm tap, not still working.
      ['approved', 'buying', 'confirming', 'success'].includes(step)
        ? 'done'
        : 'active',
  },
  {
    label: 'FILING THE CLAIM',
    getState: (step) =>
      ['confirming', 'success'].includes(step)
        ? 'done'
        : step === 'buying'
          ? 'active'
          : 'pending',
  },
  {
    label: 'STAMPING THE RECORD',
    getState: (step) =>
      step === 'success'
        ? 'done'
        : step === 'confirming'
          ? 'active'
          : 'pending',
  },
]

/** Square markers, not circles — nothing in this design is round. A done step
 *  is a filled block, an active one blinks, a pending one is an empty outline. */
function StepMark({ state }: { state: StepState }) {
  if (state === 'done') {
    return <div style={{ width: 16, height: 16, background: 'var(--held)', flex: '0 0 auto' }} />
  }
  if (state === 'active') {
    return (
      <div
        className="animate-blink"
        style={{ width: 16, height: 16, background: 'var(--rot)', flex: '0 0 auto' }}
      />
    )
  }
  return (
    <div
      style={{ width: 16, height: 16, border: '2px solid var(--hairline)', flex: '0 0 auto' }}
    />
  )
}

export default function TxProgress({ step }: TxProgressProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {steps.map((s) => {
        const state = s.getState(step)
        const color = state === 'pending' ? 'var(--text-muted)' : 'var(--text)'
        return (
          <div
            key={s.label}
            style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 11 }}
          >
            <StepMark state={state} />
            <span
              style={{
                fontFamily: PF,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: '0.14em',
                color,
              }}
            >
              {s.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
