import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BottomNav from '@/components/Layout/BottomNav'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))

describe('BottomNav', () => {
  it('renders three labelled nav links', () => {
    render(<BottomNav activeRoute="/" />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(3)
    // Every destination is named in visible text, not left to a glyph.
    expect(screen.getByText('LEDGER')).toBeInTheDocument()
    expect(screen.getByText('ATLAS')).toBeInTheDocument()
    expect(screen.getByText('DEED')).toBeInTheDocument()
  })

  it('aria-labels remain so screen readers can name each route', () => {
    render(<BottomNav activeRoute="/" />)
    expect(screen.getByLabelText('LEDGER')).toBeInTheDocument()
    expect(screen.getByLabelText('ATLAS')).toBeInTheDocument()
    expect(screen.getByLabelText('DEED')).toBeInTheDocument()
  })

  it('links point to correct routes', () => {
    render(<BottomNav activeRoute="/" />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/ranks')
    expect(hrefs).toContain('/')
    expect(hrefs).toContain('/profile')
  })

  it('marks only the active route, and colours its plate and label together', () => {
    render(<BottomNav activeRoute="/ranks" />)
    const links = screen.getAllByRole('link')

    const activeLink = links[0]
    expect(activeLink).toHaveAttribute('aria-current', 'page')
    // Plate and label must agree — a plate that highlights while the word
    // stays grey reads as two different states on one control.
    const [activePlate, activeLabel] = Array.from(activeLink.querySelectorAll('span'))
    expect(activePlate.style.color).toBe('var(--held)')
    expect(activeLabel.style.color).toBe('var(--held)')

    const inactiveLink = links[1]
    expect(inactiveLink).not.toHaveAttribute('aria-current')
    const [inactivePlate, inactiveLabel] = Array.from(inactiveLink.querySelectorAll('span'))
    expect(inactivePlate.style.color).toBe('var(--mute-on-ink)')
    expect(inactiveLabel.style.color).toBe('var(--mute-on-ink)')
  })

  it('active route does not paint a background tint or border on its tile', () => {
    render(<BottomNav activeRoute="/ranks" />)
    const activeLink = screen.getAllByRole('link')[0]
    expect(activeLink.style.backgroundColor).toBe('')
    expect(activeLink.style.borderTop).toBe('')
  })
})
