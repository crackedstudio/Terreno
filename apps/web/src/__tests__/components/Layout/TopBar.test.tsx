import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TopBar from '@/components/Layout/TopBar'

vi.mock('@/components/connect-button', () => ({
  ConnectButton: () => <button>Connect</button>,
}))

// MapSwitcher pulls in wagmi (useAccount + usePublicClient via useMaps and
// useShouldOpenNextMap). TopBar doesn't own those concerns — stub the
// switcher out so the bar can be rendered without a WagmiProvider tree.
vi.mock('@/components/Layout/MapSwitcher', () => ({
  default: () => null,
}))

describe('TopBar', () => {
  it('renders the wordmark as text, labelled with the title', () => {
    render(<TopBar title="TERRENO" />)
    // The mark and wordmark are drawn, not loaded — so the accessible name
    // has to come from the link's aria-label, not from an image's alt.
    expect(screen.getByLabelText('TERRENO')).toBeInTheDocument()
    expect(screen.getByText('TERRENO')).toBeInTheDocument()
  })

  it('renders ConnectButton', () => {
    render(<TopBar title="TERRENO" />)
    expect(screen.getByText('Connect')).toBeInTheDocument()
  })

  it('renders children', () => {
    render(
      <TopBar title="TERRENO">
        <span>child element</span>
      </TopBar>
    )
    expect(screen.getByText('child element')).toBeInTheDocument()
  })
})
