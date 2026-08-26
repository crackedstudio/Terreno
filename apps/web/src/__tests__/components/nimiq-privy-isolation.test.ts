import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Guards the module boundary that keeps `@privy-io/*` — and the `x402` /
 * `@solana/kit` subtree it drags with it — out of the chunk Nimiq Pay clients
 * download.
 *
 * Nimiq Pay renders with the device's Android System WebView, which on the
 * phones this matters for is a 2018 factory build. Those clients get the
 * injected connector and never mount `PrivyTree`, so they can never use any
 * of that code — but webpack resolves static imports at build time, and one
 * named import from a module mounted by `TopBar` is enough to put the whole
 * graph on every page.
 *
 * This is asserted at source level rather than against built output because
 * it needs to fail in CI on the PR that reintroduces the import, not after a
 * production build. The realistic regression is someone adding `import { X }
 * from '@privy-io/react-auth'` back to the shell — or, more subtly, importing
 * something from a module that itself imports Privy, which is exactly how
 * this happened the first time (`PrivyReadyContext` used to live in
 * `wallet-provider-privy.tsx`).
 */

const COMPONENTS = path.join(process.cwd(), 'src/components')

function read(file: string): string {
  return fs.readFileSync(path.join(COMPONENTS, file), 'utf8')
}

/** Static `import ... from '<spec>'` sources only — ignores `import()`. */
function staticImportSources(source: string): string[] {
  return Array.from(
    source.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm),
    (m) => m[1],
  )
}

// Modules reachable from `TopBar` / `navbar` on every page, including the map,
// which is the Nimiq Pay entry path. None of these may reach Privy.
// `wallet-provider.tsx` wraps every page from the root layout and reaches
// `wallet-provider-privy` only through a dynamic `import()`, which the
// static-import matcher deliberately ignores.
const NIMIQ_PATH_MODULES = [
  'connect-button.tsx',
  'connect-button-styles.ts',
  'privy-ready-context.ts',
  'wallet-provider.tsx',
]

describe('Nimiq Pay bundle isolation', () => {
  it.each(NIMIQ_PATH_MODULES)(
    '%s does not statically import @privy-io',
    (file) => {
      const privy = staticImportSources(read(file)).filter((s) =>
        s.startsWith('@privy-io'),
      )
      expect(privy).toEqual([])
    },
  )

  it.each(NIMIQ_PATH_MODULES)(
    '%s does not statically import wallet-provider-privy, which imports Privy',
    (file) => {
      const viaProvider = staticImportSources(read(file)).filter((s) =>
        s.includes('wallet-provider-privy'),
      )
      expect(viaProvider).toEqual([])
    },
  )

  it('the Privy-dependent half is loaded with next/dynamic', () => {
    const shell = read('connect-button.tsx')
    // If this is ever changed to a static import the assertions above still
    // fail, but this pins the mechanism so the intent survives a refactor.
    expect(shell).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*import\(['"]\.\/connect-button-interactive['"]\)/,
    )
    expect(shell).toMatch(/ssr:\s*false/)
  })

  it('the interactive half is the only place Privy is reached from', () => {
    // Sanity check that the split actually moved the dependency rather than
    // dropping the feature: something still has to import the Privy hook.
    const interactive = read('connect-button-interactive.tsx')
    expect(staticImportSources(interactive)).toContain('@privy-io/react-auth')
  })

  it('PrivyReadyContext lives in a module with no Privy dependency', () => {
    const context = read('privy-ready-context.ts')
    expect(staticImportSources(context)).toEqual(['react'])
  })
})

/**
 * The mirror-image rule: `@nimiq/mini-app-sdk` must stay out of the static
 * graph too.
 *
 * Only Nimiq Pay clients can use the NIM provider, but a value import anywhere
 * reachable from the shell would ship the SDK — and its `events` polyfill and
 * provider stack — to every browser visitor and into the map's first paint.
 * `lib/nimiqProvider.ts` reaches it through a dynamic `import()` behind an
 * `isNimiqPay()` gate; `lib/nimiq.ts` must not reach it at all, because the
 * whole point of that module is a synchronous, dependency-free detection path.
 *
 * Type-only imports are allowed: `import type` is erased before webpack sees
 * it, so it costs nothing at runtime.
 */
const SRC = path.join(process.cwd(), 'src')

function readSrc(file: string): string {
  return fs.readFileSync(path.join(SRC, file), 'utf8')
}

/** Static value-import sources only — ignores `import()` and `import type`. */
function staticValueImportSources(source: string): string[] {
  return Array.from(
    source.matchAll(/^\s*import\s+(?!type\s)[^;]*?from\s+['"]([^'"]+)['"]/gm),
    (m) => m[1],
  )
}

describe('Nimiq SDK bundle isolation', () => {
  it.each([
    'lib/nimiq.ts',
    'lib/nimiqProvider.ts',
    'lib/nimiqLink.ts',
    'hooks/useNimiqLink.ts',
    'components/Profile/ChainsBlock.tsx',
  ])('%s does not statically value-import the SDK', (file) => {
    const sdk = staticValueImportSources(readSrc(file)).filter((s) =>
      s.startsWith('@nimiq/mini-app-sdk'),
    )
    expect(sdk).toEqual([])
  })

  it('nimiqProvider reaches the SDK through a dynamic import, behind the host gate', () => {
    const source = readSrc('lib/nimiqProvider.ts')
    expect(source).toMatch(/import\(['"]@nimiq\/mini-app-sdk['"]\)/)
    // The gate is what keeps the chunk from being fetched in a plain browser.
    expect(source).toMatch(/if\s*\(!isNimiqPay\(\)\)\s*return null/)
  })

  it('the sync detection path stays dependency-free', () => {
    // `lib/nimiq.ts` is read during render by wallet-provider; anything it
    // imports is on the critical path for every client.
    expect(staticValueImportSources(readSrc('lib/nimiq.ts'))).toEqual([])
  })
})
