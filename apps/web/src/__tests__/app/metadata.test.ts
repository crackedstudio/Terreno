import { describe, it, expect } from 'vitest'
import { metadata } from '@/app/layout'

// Domain-verification tags fail silently: base.dev re-fetches the page, finds
// nothing, and the dashboard quietly drops back to unverified — no build
// error, no runtime error, nothing in the logs. The only thing standing
// between "someone tidied the metadata block" and a dead integration is this
// file, so assert the exact string rather than mere presence.
describe('root layout verification meta tags', () => {
  it('serves the base.dev app id used to verify the domain', () => {
    expect(metadata.other?.['base:app_id']).toBe('6a8dad7b934c036b21810d7d')
  })

  it('keeps the pre-existing talentapp verification tag alongside it', () => {
    // Control: proves the assertion above is reading a real `other` block and
    // that adding base:app_id did not displace what was already there.
    expect(metadata.other?.['talentapp:project_verification']).toBeTruthy()
  })

  it('CONTROL: reports undefined for a tag that was never added', () => {
    // Without this, the assertions above would pass against a metadata object
    // that returned a truthy value for any key.
    expect(metadata.other?.['base:not_a_real_tag']).toBeUndefined()
  })
})
