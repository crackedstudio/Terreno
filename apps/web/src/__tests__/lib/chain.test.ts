import { describe, it, expect } from 'vitest'
import { base } from 'viem/chains'
import { baseTransport } from '@/lib/chain'

// Regression guard for the throttled-region outage (map + profile blank in
// India, where the primary RPC was blocked behind Cloudflare). The incident
// was on the previous chain; the failure mode is a property of any single primary
// endpoint, so the guard carries over to Base unchanged. Client reads go
// through baseTransport, so it must fail over FAST and across MULTIPLE
// providers instead of stalling ~10s per read on a blocked primary.
describe('baseTransport failover config', () => {
  // Instantiate the transport (with a chain so any URL-less inner transport
  // resolves the chain default) to inspect its resolved config.
  const inst = baseTransport({ chain: base }) as {
    config: { type: string; retryCount: number }
    value?: { transports: Array<{ config: { timeout?: number } }> }
  }

  it('is a fallback across three providers', () => {
    expect(inst.config.type).toBe('fallback')
    expect(inst.value?.transports).toHaveLength(3)
  })

  it('caps every transport under viem’s 10s default so a hung primary fails over fast', () => {
    const timeouts = (inst.value?.transports ?? []).map((t) => t.config.timeout)
    expect(timeouts).toHaveLength(3)
    for (const t of timeouts) {
      expect(t).toBeDefined()
      expect(t as number).toBeLessThanOrEqual(10_000)
    }
    // The the Base endpoint primary must be the shortest, so a Cloudflare-throttled region
    // rotates to dRPC/Ankr in seconds rather than ~10s per read.
    expect(timeouts[0] as number).toBeLessThanOrEqual(6_000)
    expect(timeouts[0] as number).toBeLessThan(timeouts[1] as number)
  })

  it('retries across the fallback chain rather than giving up on first failure', () => {
    expect(inst.config.retryCount).toBeGreaterThanOrEqual(1)
  })
})
