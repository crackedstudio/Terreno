import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AvatarBlock from '@/components/Profile/AvatarBlock'

describe('AvatarBlock', () => {
  it('prints the holder name in full, uppercased', () => {
    render(<AvatarBlock color="#ff0000" name="alice" />)
    expect(screen.getByText('ALICE')).toBeInTheDocument()
  })

  it('falls back to UNNAMED when no name is set', () => {
    render(<AvatarBlock color="#ff0000" name="" />)
    expect(screen.getByText('UNNAMED')).toBeInTheDocument()
  })

  it('flies the chosen colour on the flag block', () => {
    const { container } = render(<AvatarBlock color="#ff0000" name="bob" />)
    // The flag is the decorative square, not the row that wraps it — assert
    // on the element that actually carries the colour.
    const flag = container.querySelector('span[aria-hidden]') as HTMLElement
    expect(flag).not.toBeNull()
    expect(flag).toHaveStyle({ background: '#ff0000' })
  })
})
