import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TxProgress from '@/components/Overlays/TxProgress'

vi.mock('@/hooks/useBuyPixels', () => ({}))

describe('TxProgress', () => {
  it('renders all three step labels', () => {
    render(<TxProgress step="approving" />)
    expect(screen.getByText('FUNDS UNLOCKED')).toBeTruthy()
    expect(screen.getByText('FILING THE CLAIM')).toBeTruthy()
    expect(screen.getByText('STAMPING THE RECORD')).toBeTruthy()
  })

  it('renders with buying step', () => {
    render(<TxProgress step="buying" />)
    expect(screen.getByText('FUNDS UNLOCKED')).toBeTruthy()
    expect(screen.getByText('FILING THE CLAIM')).toBeTruthy()
  })

  it('renders with confirming step', () => {
    render(<TxProgress step="confirming" />)
    expect(screen.getByText('STAMPING THE RECORD')).toBeTruthy()
  })

  it('renders with success step', () => {
    render(<TxProgress step="success" />)
    expect(screen.getByText('FUNDS UNLOCKED')).toBeTruthy()
    expect(screen.getByText('FILING THE CLAIM')).toBeTruthy()
    expect(screen.getByText('STAMPING THE RECORD')).toBeTruthy()
  })
})
