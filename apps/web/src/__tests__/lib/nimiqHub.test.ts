import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { sendNimViaHub, canUseNimiqHub, resetNimiqHubForTests, NIMIQ_HUB_URL } from '@/lib/nimiqHub'
import { NimiqProviderError } from '@/lib/nimiqProvider'

/**
 * Paying in NIM from a browser, through the Nimiq Web Wallet.
 *
 * Two things are worth pinning and they fail in different ways.
 *
 * The TRANSPORT: the Hub rejects where the mini-app SDK resolves an error
 * envelope, so a cancelled popup arrives as a thrown Error rather than as
 * data. Callers must see one failure shape from both, or every consumer needs
 * two branches and one of them will be missed.
 *
 * The BOUNDARY: neither SDK may reach the other audience's bundle. Nimiq Pay
 * runs a 2018 Android WebView and will never open a popup; a browser has no
 * injected provider. A static import in either direction puts the whole graph
 * on every page, which is exactly how the Privy leak happened the first time.
 * Asserted at source level so it fails on the PR that reintroduces it rather
 * than after a production build.
 */

const HASH = 'a'.repeat(64)

const checkout = vi.fn()
vi.mock('@nimiq/hub-api', () => ({
  default: class {
    constructor(public endpoint: string) {}
    checkout = checkout
  },
}))

beforeEach(() => {
  resetNimiqHubForTests()
  checkout.mockReset()
})
afterEach(() => resetNimiqHubForTests())

const ORDER = { recipient: 'NQ67 LF4H CV7N B9R0 CAEX', luna: 5_000_000n, data: 'tag-abc' }

describe('sendNimViaHub', () => {
  it('returns the hash the Hub broadcast', async () => {
    checkout.mockResolvedValue({ hash: HASH })
    await expect(sendNimViaHub(ORDER)).resolves.toBe(HASH)
  })

  it('sends the treasury, the Luna amount and the order tag', async () => {
    checkout.mockResolvedValue({ hash: HASH })
    await sendNimViaHub(ORDER)

    expect(checkout).toHaveBeenCalledTimes(1)
    const req = checkout.mock.calls[0][0]
    expect(req.recipient).toBe(ORDER.recipient)
    // Luna, as a number — the unit the Hub takes.
    expect(req.value).toBe(5_000_000)
    // The tag binds this payment to this order. Without it any transfer to the
    // treasury could be replayed against any order, so its presence is not
    // cosmetic.
    expect(req.extraData).toBe('tag-abc')
    expect(req.appName).toBeTruthy()
  })

  it('turns a cancelled popup into a NimiqProviderError', async () => {
    checkout.mockRejectedValue(new Error('Request aborted'))
    await expect(sendNimViaHub(ORDER)).rejects.toBeInstanceOf(NimiqProviderError)
    await expect(sendNimViaHub(ORDER)).rejects.toThrow(/aborted/i)
  })

  it('turns a cancel with no message into a usable one', async () => {
    checkout.mockRejectedValue(new Error(''))
    await expect(sendNimViaHub(ORDER)).rejects.toThrow(/was not completed/i)
  })

  it('refuses a result with no hash rather than reporting success', async () => {
    checkout.mockResolvedValue({})
    await expect(sendNimViaHub(ORDER)).rejects.toThrow(/no transaction hash/i)
  })

  it.each([
    [{ ...ORDER, recipient: '  ' }, /recipient/i],
    [{ ...ORDER, luna: 0n }, /zero payment/i],
    [{ ...ORDER, luna: BigInt(Number.MAX_SAFE_INTEGER) + 1n }, /too large/i],
    [{ ...ORDER, data: '' }, /no reference/i],
  ])('validates before opening a popup (%#)', async (bad, msg) => {
    await expect(sendNimViaHub(bad)).rejects.toThrow(msg)
    // The control that makes the assertions above mean something: a rejected
    // order must not have reached the Hub at all.
    expect(checkout).not.toHaveBeenCalled()
  })

  it('defaults to the mainnet Hub', () => {
    // The endpoint is the only real guard against a testnet payment: checkout
    // broadcasts as it signs, so nothing client-side can undo one after the
    // fact, and the settler pins mainnet.
    expect(NIMIQ_HUB_URL).toContain('hub.nimiq.com')
    expect(NIMIQ_HUB_URL).not.toContain('testnet')
  })

  it('is available in a browser', () => {
    expect(canUseNimiqHub()).toBe(true)
  })
})

describe('the two NIM transports stay out of each other’s bundles', () => {
  const LIB = path.join(process.cwd(), 'src/lib')

  /** Static `import ... from '<spec>'` sources only — ignores `import()`. */
  function staticImports(file: string): string[] {
    const src = fs.readFileSync(path.join(LIB, file), 'utf8')
    return Array.from(
      src.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm),
      (m) => m[1],
    ).filter((s) => !/^\s*import\s+type/.test(s))
  }

  it('nimiqHub.ts never statically imports the mini-app SDK', () => {
    expect(staticImports('nimiqHub.ts')).not.toContain('@nimiq/mini-app-sdk')
  })

  it('nimiqProvider.ts never statically imports the Hub SDK', () => {
    expect(staticImports('nimiqProvider.ts')).not.toContain('@nimiq/hub-api')
  })

  it('nimiqProvider.ts reaches the Hub only through a dynamic import', () => {
    const src = fs.readFileSync(path.join(LIB, 'nimiqProvider.ts'), 'utf8')
    // Control: it does reach it — otherwise browser payment is not wired at
    // all and the assertion above would pass against a broken build.
    expect(src).toMatch(/import\(['"]\.\/nimiqHub['"]\)/)
    expect(staticImports('nimiqProvider.ts')).not.toContain('./nimiqHub')
  })

  it('the Hub SDK is only ever reached through a dynamic import', () => {
    const src = fs.readFileSync(path.join(LIB, 'nimiqHub.ts'), 'utf8')
    expect(src).toMatch(/import\(['"]@nimiq\/hub-api['"]\)/)
  })
})
