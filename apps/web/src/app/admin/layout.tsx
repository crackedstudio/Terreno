import type { Metadata } from 'next'

/**
 * Keep the treasury screen out of search results.
 *
 * Not a security measure — nothing here is secret (a contract's owner and
 * balances are public on chain, and the page shows a stranger nothing), and
 * `onlyOwner` is what actually guards the funds. It is simply not a page any
 * player should stumble into from a search for Terreno.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
