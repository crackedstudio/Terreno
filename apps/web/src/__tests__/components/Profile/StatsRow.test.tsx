import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatsRow from '@/components/Profile/StatsRow'

describe('StatsRow', () => {
  it('shows plots value', () => {
    render(<StatsRow pixels={42} balance="10.00" rank={3} />)
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('PLOTS')).toBeInTheDocument()
  })

  it('shows balance value with default BALANCE label', () => {
    render(<StatsRow pixels={42} balance="10.00" rank={3} />)
    expect(screen.getByText('10.00')).toBeInTheDocument()
    expect(screen.getByText('BALANCE')).toBeInTheDocument()
  })

  it('shows balance with stablecoin symbol when provided', () => {
    render(<StatsRow pixels={42} balance="10.00" balanceSymbol="USDm" rank={3} />)
    expect(screen.getByText('10.00')).toBeInTheDocument()
    expect(screen.getByText('BALANCE · USDM')).toBeInTheDocument()
  })

  it('shows rank with # prefix', () => {
    render(<StatsRow pixels={42} balance="10.00" rank={3} />)
    expect(screen.getByText('#3')).toBeInTheDocument()
    expect(screen.getByText('RANK')).toBeInTheDocument()
  })

  it('shows the rank-gap nudge under the rank when provided', () => {
    render(<StatsRow pixels={42} balance="10.00" rank={4} rankGapLabel="12 PLOTS FROM #3" />)
    expect(screen.getByText('#4')).toBeInTheDocument()
    expect(screen.getByText('12 PLOTS FROM #3')).toBeInTheDocument()
  })

  it('does not show a rank-gap nudge when unranked, even if passed', () => {
    render(<StatsRow pixels={0} balance="0.00" rank={0} rankGapLabel="RULER" />)
    expect(screen.queryByText('RULER')).not.toBeInTheDocument()
  })

  it('shows the LAND VALUE figure when one is known', () => {
    render(<StatsRow pixels={42} balance="10.00" rank={3} landValue="12.34" spent="5.00" earned="2.00" />)
    expect(screen.getByText('LAND VALUE')).toBeInTheDocument()
    expect(screen.getByText('12.34')).toBeInTheDocument()
    expect(screen.getByText('SPENT')).toBeInTheDocument()
    expect(screen.getByText('EARNED')).toBeInTheDocument()
  })

  // The deed is a printed form: the fields exist whether or not they are
  // filled, so the grid keeps all six cells and never collapses. What must
  // NOT happen is an unknown figure being printed as a number — an em-dash
  // says "we don't know", a 0.00 would be a claim we can't back.
  it('keeps every cell of the grid, printing an em-dash for unknown figures', () => {
    render(<StatsRow pixels={42} balance="10.00" rank={0} />)
    for (const label of ['PLOTS', 'LAND VALUE', 'BALANCE', 'SPENT', 'EARNED', 'RANK']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    // Unknown land value and unranked both print the dash, never a zero.
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.queryByText('#0')).not.toBeInTheDocument()
  })
})
