import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { ConnectButton } from '@/components/connect-button'

/**
 * Regression guard for the dead-end connect modal found on a real device.
 *
 * `ConnectButton` used to `return null` inside Nimiq Pay, on the reasoning that
 * the injected wallet auto-connects so there is nothing to tap. That held only
 * while auto-connect fired on page load. Once it was gated on `eth_accounts`
 * already listing an account (so the app stops firing an approval dialog on
 * load — mini-app checklist §5), a first-time user is disconnected, and the
 * profile page's "CONNECT TO PLAY" overlay renders `<ConnectButton />` as its
 * only action. Returning null there produced a modal telling the user to
 * connect with no button inside it.
 */

const h = vi.hoisted(() => ({
  connect: vi.fn(),
  isConnected: false,
  connectors: [{ id: 'injected' }] as { id: string }[],
}))

vi.mock('wagmi', () => ({
  useAccount: () => ({ isConnected: h.isConnected }),
  useConnect: () => ({ connect: h.connect, connectors: h.connectors, isPending: false }),
}))

// The Privy half must never load here; if it does, the isolation this
// component exists to preserve is broken.
vi.mock('@/components/connect-button-interactive', () => ({
  default: () => <div data-testid="privy-interactive" />,
}))

beforeEach(() => {
  h.connect.mockReset()
  h.isConnected = false
  h.connectors = [{ id: 'injected' }]
})

afterEach(() => {
  cleanup()
  delete window.nimiqPay
})

async function renderMounted() {
  render(<ConnectButton />)
  // The component renders a placeholder until its mount effect runs.
  await act(async () => {})
}

describe('ConnectButton inside Nimiq Pay', () => {
  beforeEach(() => {
    window.nimiqPay = { requestDeviceIdentifier: vi.fn() }
  })

  it('renders a tappable CONNECT button when disconnected', async () => {
    await renderMounted()
    const btn = screen.getByRole('button', { name: /connect/i })
    expect(btn).toBeInTheDocument()
  })

  it('connects through the injected connector when tapped', async () => {
    await renderMounted()
    await act(async () => {
      screen.getByRole('button', { name: /connect/i }).click()
    })
    // eth_requestAccounts is raised by the injected connector — user-initiated,
    // which is the whole point of not auto-connecting on load.
    expect(h.connect).toHaveBeenCalledWith({ connector: { id: 'injected' } })
  })

  it('CONTROL: renders nothing once connected', async () => {
    // Pairs with the tests above so "renders a button" cannot pass against a
    // component that always renders one regardless of state.
    h.isConnected = true
    await renderMounted()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('never mounts the Privy interactive half', async () => {
    await renderMounted()
    expect(screen.queryByTestId('privy-interactive')).not.toBeInTheDocument()
  })
})
