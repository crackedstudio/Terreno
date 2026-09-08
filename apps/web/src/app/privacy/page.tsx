import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — Terreno',
}

// Cracked Studios' own Privacy Policy, replacing the cLabs, Inc. d/b/a Celo
// Core Co. text Terreno inherited from its life as a Celo/MiniPay mini app.
// That version named a different data controller, sent every rights request to
// privacy@celo.org, listed two games that are not ours, and had already drifted
// internally — §3 said transactions are recorded on the Celo Network while §4
// said Base.
//
// Analytics-relevant constraint, carried over because it is still true and was
// re-verified against components/posthog-provider.tsx on 2026-09-08:
// §6 states no cookies or tracking storage, which holds because PostHog runs
// with persistence: 'memory', autocapture: false, disable_session_recording:
// true and person_profiles: 'identified_only'. If any of those change, §6 has
// to change with them.
//
// The sub-processors named in §7 were each confirmed wired in the codebase
// rather than assumed: Vercel (hosting), PostHog (analytics), Goldsky
// (subgraph indexing), CoinGecko (NIM price feed), public Base RPC providers,
// Privy and Nimiq (wallet connectivity).
//
// NOT REVIEWED BY COUNSEL. Open questions are recorded in docs/DEPLOYMENT.md:
// the registered legal name, and §8/§11 which assert a controller established
// in Nigeria without a stated GDPR representative. Any further edits to this
// text need legal sign-off.

const SECTIONS: Array<{ title: string; paragraphs: string[] }> = [
  {
    title: '1. Introduction and Scope',
    paragraphs: [
      'This Privacy Policy explains how Cracked Studios processes personal data when you use our games and services (the "Services"), including Terreno, which is offered as a mini app within the Nimiq Pay platform and through a standard web browser, and which operates on the Base network.',
      'Cracked Studios also publishes other games, including Blokaz and Nukko. Where one of those games is distributed through a different platform, that platform’s own privacy practices apply in addition to this Policy, and a game may present its own privacy notice which governs it in the event of conflict.',
      'This Privacy Policy, together with our Terms and Conditions, forms part of a legally binding contract between Cracked Studios and you.',
    ],
  },
  {
    title: '2. Data Controller and Contact Information',
    paragraphs: [
      'Cracked Studios ("Cracked Studios", "we", "us" or "our") acts as the Data Controller of any personal data collected via the Services. We are responsible for ensuring that the systems and processes we use are compliant with data protection laws, to the extent applicable to us. Cracked Studios personnel are required to comply with this Privacy Policy, where appropriate.',
      'Privacy contact: support@crackedstudios.xyz',
    ],
  },
  {
    title: '3. Personal Data We Collect',
    paragraphs: [
      'We collect information that you provide when using the Services, as well as certain technical and usage data. We process the minimum data needed to operate the games.',
      'The categories of personal data we collect are:',
      'Blockchain data: your public Wallet address and on-chain transactions associated with your use of the Services. For Terreno this data is publicly recorded on the Base network (see Section 4). Where you pay in NIM, the funding transaction is likewise publicly recorded on the Nimiq network.',
      'Display name and profile: an optional display name, colour and link you may attach to land you own. For Terreno these are stored on-chain only, with no off-chain database.',
      'Usage and device data: app interaction and technical data, including device IP address and associated location data, identifiers associated with your device, device type, web browser characteristics, language preferences, and dates and times of use.',
      'Data you provide to us: data we may receive from you, in particular as is relevant for troubleshooting, user assistance and support, and bug reports or fixes.',
      'We do not collect identity documents and do not perform identity verification (KYC). We do not use cookies or similar tracking technologies at this time (see Section 6).',
    ],
  },
  {
    title: '4. The Blockchain and Public Data',
    paragraphs: [
      'Transactions submitted through Terreno are recorded on the Base network, which is publicly accessible, transparent, and immutable. Data written on-chain — including Wallet addresses, transactions, the land you own, the prices you paid and received, and any display name, colour or link you attach to your land — cannot be altered, erased, or made private by us and is outside our control.',
      'That data is also surfaced within the Services themselves, for example on maps, profiles and leaderboards, and can be read by anyone directly from the blockchain regardless of what we display. Please consider this carefully before transacting.',
    ],
  },
  {
    title: '5. How We Use Personal Data and Legal Bases',
    paragraphs: [
      'We use the personal data we collect for the following purposes:',
      'To operate and provide the Services, including administering promotions, campaigns and any prize or grant payouts;',
      'To make our Services more intuitive and easy to use, using device data and other information you provide;',
      'To secure, debug, and monitor the Services, and to prevent abuse and misuse, including abuse of promotional offers;',
      'To improve and develop our Services and user experience;',
      'To comply with legal obligations;',
      'To carry out any other purpose for which the information was collected.',
      'Where the GDPR or similar data protection law applies, our legal bases for processing are:',
      'Performance of a contract — to provide you with the Services you have requested.',
      'Legitimate interests — including security, prevention of misuse, improving the Services, and monitoring how our Services are used to help us improve them. We have assessed that our legitimate interests are not overridden by your interests or rights in these cases.',
      'Compliance with legal obligations.',
      'Consent — where required by applicable law.',
    ],
  },
  {
    title: '6. Cookies and Similar Technologies',
    paragraphs: [
      'The Services do not currently use cookies, local storage for tracking, or similar technologies. Our analytics are configured so that no analytics identifier is persisted to your device: no cookie is set, no session recording takes place, and no automatic capture of your clicks or form input is performed.',
      'Some parts of the Services may store a small amount of information on your device purely to remember your own preferences — for example which map you last viewed. That information stays on your device, is not used to track you, and is not shared with us or anyone else.',
      'If this changes, this Policy will be updated and any required consent mechanism implemented.',
    ],
  },
  {
    title: '7. Sharing and Disclosure',
    paragraphs: [
      'We do not sell personal data. We may share personal data in the following circumstances:',
      'With vendors, consultants, and other service providers (sub-processors) who need access to such information to carry out work on our behalf. These currently include our hosting provider, our product analytics provider, our blockchain indexing provider, a cryptocurrency price data provider, and public blockchain node providers for the Base network.',
      'With the Nimiq Pay platform, the Nimiq network and the Base network, and with wallet connectivity providers, as necessary to deliver the Services. These operate under their own terms and privacy practices.',
      'In response to a lawful request for information if we believe disclosure is required by applicable law, regulation, or legal process.',
      'If we believe your actions are inconsistent with our user agreements or policies, or to protect the rights, property, and safety of us or any third party.',
      'In connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business.',
      'With your consent or at your direction.',
      'We may also share aggregated or de-identified information that cannot reasonably be used to identify you.',
    ],
  },
  {
    title: '8. International Transfers',
    paragraphs: [
      'Personal data may be processed outside your country, including outside the EEA and UK. Cracked Studios is established in Nigeria, and some of the service providers we rely on operate infrastructure in other countries, including the United States and the European Union.',
      'Where transfers outside the EEA or UK are required, we protect those transfers using appropriate safeguards.',
    ],
  },
  {
    title: '9. Data Retention',
    paragraphs: [
      'In general, we retain personal data only for as long as necessary for the purposes described in this Policy, and in accordance with applicable legal and regulatory obligations.',
      'Data recorded on a public blockchain is permanent and is not subject to deletion or retention periods set by us (see Section 4).',
    ],
  },
  {
    title: '10. Security',
    paragraphs: [
      'We maintain administrative, technical, and physical safeguards designed to protect personal data against accidental, unlawful, or unauthorized destruction, loss, alteration, access, disclosure, or use. No method of transmission or storage is fully secure, and you remain responsible for the security of your Wallet and private keys.',
      'We never ask for your recovery phrase or private keys, and we cannot recover them for you. Anyone who asks you for them is not us.',
    ],
  },
  {
    title: '11. Your Rights',
    paragraphs: [
      'Subject to applicable law, you may have rights in relation to your personal data. These may include the right to:',
      'Access the personal data we hold about you, and receive a copy.',
      'Require that incomplete or inaccurate personal data is corrected (rectification).',
      'Request that we delete your personal data (right to erasure), subject to legal or other obligations that require us to retain it.',
      'Object to, or request restriction of, our processing of your personal data.',
      'Data portability where processing is based on consent or contract and is carried out by automated means.',
      'Withdraw consent at any time where processing is based on consent, without affecting the lawfulness of processing before withdrawal.',
      'California residents may additionally have rights under the CCPA/CPRA to: know what personal information is collected, sold, or disclosed; delete personal information; correct inaccurate personal information; opt out of the ‘sale’ or ‘sharing’ of personal information; and not be discriminated against for exercising these rights.',
      'To exercise your rights, please contact us at support@crackedstudios.xyz.',
      'Please note that rights cannot be exercised over immutable blockchain data — including Wallet addresses, transaction data, land ownership and any on-chain display name — which is outside our control and cannot be deleted or corrected by us or by anyone else.',
    ],
  },
  {
    title: '12. Children',
    paragraphs: [
      'Terreno is not directed to children under the age of 18, consistent with the age requirement in our Terms and Conditions. Other games published by Cracked Studios may carry a different minimum age, stated in that game’s own terms and privacy notice.',
      'If you learn that a child has provided personal information without the consent required by applicable law, please contact us at support@crackedstudios.xyz so we can take appropriate steps to delete it.',
    ],
  },
  {
    title: '13. Third-Party Links and Services',
    paragraphs: [
      'The Services may rely on or link to third-party services with their own privacy practices. We have no control or responsibility for any third-party services, and linking to or permitting the use, access, or installation of any third-party service does not imply approval or endorsement of the service or their privacy practices by Cracked Studios. We recommend carefully reviewing the privacy policy of each third-party service prior to use.',
    ],
  },
  {
    title: '14. Changes to this Policy',
    paragraphs: [
      'We reserve the right to change and update this Privacy Policy from time to time. If we make changes, you will be notified of the change by the updated date at the top of the Policy.',
    ],
  },
  {
    title: '15. Contact and Complaints',
    paragraphs: [
      'For privacy enquiries, please contact us at support@crackedstudios.xyz.',
      'If you are located in the EEA or UK, you also have the right to lodge a complaint with your local data protection supervisory authority.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <article
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '24px 16px 64px',
        color: 'var(--ink)',
        background: 'var(--paper)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Link
          href="/"
          aria-label="Close"
          style={{
            color: 'var(--ink)',
            fontSize: 14,
            textDecoration: 'none',
            padding: '5px 10px',
            border: '2px solid var(--ink)',
            lineHeight: 1,
          }}
        >
          ✕
        </Link>
      </div>
      <h1 className="font-display" style={{ fontSize: 44, lineHeight: 0.8, margin: '0 0 8px' }}>Cracked Studios Privacy Policy</h1>
      <p style={{ fontSize: 13, marginBottom: 4 }}>Terreno</p>
      <p style={{ fontSize: 12, color: 'var(--mute-on-paper)', marginBottom: 24 }}>
        Effective Date: September 8, 2026
      </p>

      {SECTIONS.map((section) => (
        <section key={section.title} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>{section.title}</h2>
          {section.paragraphs.map((p, i) => (
            <p key={i} style={{ fontSize: 13, marginBottom: 8 }}>
              {p}
            </p>
          ))}
        </section>
      ))}

      <p style={{ fontSize: 13, marginBottom: 24 }}>
        Our Terms and Conditions are available at{' '}
        <Link href="/terms" style={{ color: 'var(--accent)' }}>
          terreno.world/terms
        </Link>
        .
      </p>

      <p style={{ fontSize: 11, color: 'var(--mute-on-paper)', marginTop: 32 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>← Back to Terreno</Link>
      </p>
    </article>
  )
}
