import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Logo, LogoMark } from '@/components/core/Logo'

// The mark is a bitmap, so every claim about it is countable. These pin the
// grid: 7x7, 29 lit cells, 7 of them accent. If someone edits MARK, the
// silhouette changes and these numbers move with it — which is the point.
const LIT_CELLS = 29
const ACCENT_CELLS = 7

function cells(container: HTMLElement): string[] {
  // Read the style ATTRIBUTE, not `.style.boxShadow`: jsdom parses box-shadow
  // into the attribute but its CSSOM accessor returns '' for it, so going
  // through the property silently yields zero cells and every count below
  // would pass vacuously against a mark that drew nothing.
  const inner = container.querySelector('[style*="box-shadow"]')
  if (!inner) return []
  const raw = (inner.getAttribute('style') ?? '').replace(/^.*box-shadow:\s*/s, '').replace(/;\s*$/, '')
  // Split between shadows — colours may themselves contain commas (rgb(), var()).
  return raw.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean)
}

describe('LogoMark', () => {
  it('draws one box-shadow per lit cell of the 7x7 grid', () => {
    const { container } = render(<LogoMark unit={6} />)
    expect(cells(container)).toHaveLength(LIT_CELLS)
  })

  it('sizes the box to exactly unit x 7 in both axes', () => {
    const { container } = render(<LogoMark unit={6} />)
    const box = container.firstElementChild as HTMLElement
    expect(box.style.width).toBe('42px')
    expect(box.style.height).toBe('42px')
  })

  it('splits the cells into structure and accent', () => {
    const { container } = render(<LogoMark unit={6} ink="#111111" accent="#ff4a0f" />)
    const c = cells(container)
    expect(c.filter((s) => s.endsWith('#ff4a0f'))).toHaveLength(ACCENT_CELLS)
    expect(c.filter((s) => s.endsWith('#111111'))).toHaveLength(LIT_CELLS - ACCENT_CELLS)
  })

  it('collapses the accent plots into the structure when simplified', () => {
    // Below ~3px per cell the accent cells stop reading as separate plots, so
    // the silhouette has to survive without them.
    const { container } = render(<LogoMark unit={6} ink="#111111" accent="#ff4a0f" simplified />)
    const c = cells(container)
    expect(c.filter((s) => s.endsWith('#ff4a0f'))).toHaveLength(0)
    expect(c.filter((s) => s.endsWith('#111111'))).toHaveLength(LIT_CELLS)
  })

  it('simplifies by default below 3px per cell, and not at or above it', () => {
    const below = render(<LogoMark unit={2} ink="#111111" accent="#ff4a0f" />)
    expect(cells(below.container).filter((s) => s.endsWith('#ff4a0f'))).toHaveLength(0)

    // unit=3 is the documented minimum that still carries the accents — this
    // is the boundary, so assert the >= side of it too, not just the <.
    const at = render(<LogoMark unit={3} ink="#111111" accent="#ff4a0f" />)
    expect(cells(at.container).filter((s) => s.endsWith('#ff4a0f'))).toHaveLength(ACCENT_CELLS)
  })

  it('lands every cell on a whole pixel at whole units', () => {
    // The logo is made of plots and half a plot does not exist.
    const { container } = render(<LogoMark unit={3} />)
    for (const c of cells(container)) {
      const [x, y] = c.split(' ')
      expect(Number.parseInt(x, 10) % 3).toBe(0)
      expect(Number.parseInt(y, 10) % 3).toBe(0)
    }
  })
})

describe('Logo lockups', () => {
  it('sets the wordmark in the display face at the display tracking', () => {
    // The old 0.2em belonged to Archivo Black; on a pixel face it breaks the
    // grid read. This asserts the replacement, not merely that tracking exists.
    const { getByText } = render(<Logo />)
    const word = getByText('TERRENO')
    expect(word.style.fontFamily).toBe('var(--font-display)')
    expect(word.style.letterSpacing).toBe('var(--tracking-display)')
    expect(word.style.fontWeight).toBe('400')
  })

  it('defaults the wordmark to unit * 6 and honours an explicit size', () => {
    const { getByText, rerender } = render(<Logo unit={3} />)
    expect(getByText('TERRENO').style.fontSize).toBe('18px')
    rerender(<Logo unit={3} size={34} />)
    expect(getByText('TERRENO').style.fontSize).toBe('34px')
  })

  it('renders the mark alone with no wordmark for the mark lockup', () => {
    const { queryByText } = render(<Logo lockup="mark" />)
    expect(queryByText('TERRENO')).toBeNull()
  })

  it('renders the wordmark alone with no mark for the wordmark lockup', () => {
    const { container, getByText } = render(<Logo lockup="wordmark" />)
    expect(getByText('TERRENO')).toBeTruthy()
    expect(container.querySelector('[style*="box-shadow"]')).toBeNull()
  })

  it('CONTROL: the horizontal lockup carries both', () => {
    // Pairs with the two absence assertions above — without it they would pass
    // against a component that rendered nothing at all.
    const { container, getByText } = render(<Logo />)
    expect(getByText('TERRENO')).toBeTruthy()
    expect(container.querySelector('[style*="box-shadow"]')).toBeTruthy()
  })

  it('drops the accent in mono, so stamps and print get one colour', () => {
    const { container } = render(<Logo lockup="mark" ink="#111111" accent="#ff4a0f" mono />)
    expect(cells(container).filter((s) => s.endsWith('#ff4a0f'))).toHaveLength(0)
  })
})
