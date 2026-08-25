import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SuccessState from '@/components/Overlays/SuccessState'

describe('SuccessState', () => {
  const defaultProps = {
    pixelCount: 5,
    totalPaid: '2.50 USDT',
    txHash: '0x1234567890abcdef1234567890abcdef12345678',
    onDone: vi.fn(),
  }

  it('leads with the number of plots filed', () => {
    render(<SuccessState {...defaultProps} />)
    expect(screen.getByText(/5 PLOTS/)).toBeInTheDocument()
  })

  it('says PLOT, not PLOTS, for a single claim', () => {
    // The headline is split across a <br>, so match on the joined text.
    render(<SuccessState {...defaultProps} pixelCount={1} />)
    expect(screen.getByText(/1 PLOT\s*ON THE RECORD/)).toBeInTheDocument()
    expect(screen.queryByText(/1 PLOTS/)).not.toBeInTheDocument()
  })

  it('shows a random title from the list', () => {
    render(<SuccessState {...defaultProps} />)
    const titles = ['FILED', 'ENTERED', 'ON THE RECORD', 'STAMPED']
    const foundTitle = titles.some((t) => screen.queryByText(t) !== null)
    expect(foundTitle).toBe(true)
  })

  it('shows paid amount', () => {
    render(<SuccessState {...defaultProps} />)
    expect(screen.getByText('PAID 2.50 USDT')).toBeInTheDocument()
  })

  it('calls onDone when button clicked', () => {
    const onDone = vi.fn()
    render(<SuccessState {...defaultProps} onDone={onDone} />)
    fireEvent.click(screen.getByText('BACK TO THE ATLAS'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
