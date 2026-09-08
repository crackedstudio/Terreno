import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms and Conditions — Terreno',
}

// Cracked Studios' own Terms of Use, replacing the cLabs, Inc. d/b/a Celo Core
// Co. text Terreno inherited from its life as a Celo/MiniPay mini app. That
// text named a different legal entity, a different chain, a different platform
// and two games that are not ours (MiniQuiz, MiniStreak), and directed users to
// legal@celo.org — see docs/DEPLOYMENT.md, which tracked it as still open.
//
// Adapted from the Blokaz Terms of Use (last updated May 5, 2026), which is the
// studio's existing document, so the two stay consistent on operator identity,
// governing law and contact.
//
// Numbers in §7 and §8 were read from the deployed world contract
// (0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79) on 2026-09-08 rather than copied
// from the inherited text, which had drifted: it claimed Terreno accepts
// "USDT, USDC and USDm" when getAcceptedTokens() returns USDC only.
//   feeRate()      500 bps = 5%
//   initialPrice() 30000    = 0.03 USDC
//   minPrice()     1        = 0.000001 USDC
//   HALVING_TIME() 2592000s = 30 days
//
// NOT REVIEWED BY COUNSEL. Two things in particular need a lawyer's decision
// before this is relied on: the minimum age (§4 — the Blokaz terms say 13, the
// text this replaces said 18, and Terreno takes real payments), and whether
// "Cracked Studios" is the correct registered legal name. Any further edits to
// this text need legal sign-off.

const SECTIONS: Array<{ title: string; paragraphs: string[] }> = [
  {
    title: '1. Introduction and Acceptance',
    paragraphs: [
      'Cracked Studios ("Cracked Studios", "we", "us" or "our") is a game developer and publisher that provides games, features, content, and services to users via websites, mobile applications, and other channels or platforms (the "Services"), including Terreno.',
      'These Terms and Conditions (the "Terms") form a legally binding agreement between you and Cracked Studios and apply in full force and effect to your use of the Services. Please read these Terms carefully before installing, accessing, or using the Services. By installing, accessing, or using the Services, you agree to these Terms. If you do not agree, do not use the Services.',
      'These Terms incorporate by reference our Privacy Policy and any game-specific terms presented within a particular game.',
    ],
  },
  {
    title: '2. Our Games',
    paragraphs: [
      'Cracked Studios develops and operates the following games. These Terms apply to all of them, except where a game-specific term presented within that game says otherwise.',
      'Blokaz — a play-to-earn game distributed through the MiniPay platform, in which cryptocurrency rewards are earned through gameplay. Blokaz has its own Terms of Use, which govern it in the event of any conflict with these Terms.',
      'Nukko — a game published by Cracked Studios.',
      'Terreno (terreno.world) — a world map made of pixels, described in Section 7. Terreno runs as a Nimiq Pay mini app on the Base network and is the game these Terms are presented within.',
      'We may add, rename, modify, suspend or discontinue any game or feature at any time. The Services are provided on an "as available" basis and depend on third-party infrastructure, including the platforms and blockchain networks named above.',
    ],
  },
  {
    title: '3. Definitions',
    paragraphs: [
      'In these Terms, unless the context otherwise requires:',
      '"Account" means an account created by the User directly or through a third-party platform (including Nimiq Pay) for the purpose of accessing and using the Services.',
      '"Content" includes, without limitation, text, images, audio, video, graphics, data, source code, in-game items, cryptocurrency rewards, and any other materials or information displayed in or made available through the Services.',
      '"Wallet" means the self-custodial blockchain wallet you use to interact with the Services. We do not create, control, or have access to your Wallet. You are solely responsible for securing and controlling access to your Wallet, including any private key or back-up phrases associated with it.',
      '"Base" or the "Base Network" means the decentralized blockchain network on which Terreno operates. We do not control Base and therefore cannot ensure that transactions will be confirmed, processed or completed as intended.',
      '"Digital Assets" means any tokens transacted through the Services. Terreno currently accepts USDC on Base; the set of accepted tokens is recorded in the smart contract and may change.',
      '"Pixel" or "Land" means a single purchasable square on a Terreno map, recorded as an entry in the Terreno smart contract.',
      '"User" or "you" means any individual who accesses, installs, registers for, uses, or otherwise interacts with the Services in any manner.',
    ],
  },
  {
    title: '4. Eligibility',
    paragraphs: [
      'You must be at least 18 years of age to use Terreno, or the older age of majority in your country. Terreno involves the purchase and transfer of Digital Assets, and by using it you represent and warrant that you are at least 18 years old, are legally capable of entering into a binding contract, and are not prohibited from using the Services under applicable laws or regulations in your country.',
      'Other games operated by Cracked Studios may carry a different minimum age, stated in that game’s own terms.',
      'If you are a parent or legal guardian and believe that your child has used the Services in a way that is not permitted by applicable law or these Terms, please contact us at support@crackedstudios.xyz. Upon receipt of such a request, we will review the matter and take such actions as we deem appropriate in accordance with these Terms and applicable law.',
      'The availability of certain services may vary by country, region, platform, device, app version, language, or other factors. You may not use the Services if you are subject to applicable sanctions or are located in a comprehensively sanctioned jurisdiction.',
    ],
  },
  {
    title: '5. Nimiq Pay Platform Integration',
    paragraphs: [
      'Terreno is distributed as a mini app within the Nimiq Pay platform, and is also accessible through a standard web browser. Your use of Terreno through Nimiq Pay is subject to Nimiq’s own terms and privacy policy in addition to these Terms.',
      'You are responsible for maintaining your Nimiq Pay account security and credentials; protecting your cryptocurrency wallet information; complying with Nimiq’s policies and terms; and understanding cryptocurrency and blockchain risks.',
      'We are not responsible for any act, omission, outage, suspension, or termination relating to a third-party platform or account. If your access to a third-party account is unavailable, limited, or terminated, your ability to use some or all of the Services may also be affected.',
    ],
  },
  {
    title: '6. Wallet-Based Access; No Custody; No KYC',
    paragraphs: [
      'Terreno is accessed through your self-custodial Wallet. We do not create or hold accounts or private keys, and we do not take custody or control of your Digital Assets at any time.',
      'We do not perform identity verification (KYC) and do not collect identity documents. You may optionally add a display name; no identity verification is performed, and you are responsible for the content of any display name you choose.',
      'You are solely responsible for the security of your Wallet, recovery phrase and keys. We cannot reverse transactions or restore access to a lost or compromised Wallet.',
    ],
  },
  {
    title: '7. How Terreno Works',
    paragraphs: [
      'Terreno is a game in which you may purchase pixels on a digital representation of the world, one pixel at a time, across one or more maps. Ownership of each pixel is recorded on the Base network in the Terreno smart contract, in your own wallet address. Only pixels the smart contract recognises as land may be purchased.',
      'When a pixel is purchased, its price immediately doubles for the next purchaser. The price of a pixel then gradually halves over each thirty (30) day period, down to a minimum price set in the smart contract. This means that if you purchase a pixel for two (2) units of a Digital Asset, the price to purchase that pixel from you starts at four (4) units and returns to approximately two (2) units after thirty (30) days, continuing to halve thereafter for as long as the pixel is not repurchased.',
      'When another user purchases a pixel you own, you receive the purchase price minus the service fee described in Section 8. Anyone may purchase a pixel you own at the price the contract sets; you cannot prevent, reserve against, or set your own price for such a purchase, and no notice is given to you before it happens.',
      'The starting price of a previously unowned pixel, the minimum price, the thirty (30) day halving period and the service fee are values recorded in the smart contract. They are not promises about future value.',
      'Nothing in Terreno is a guarantee of earnings. Whether you receive anything for a pixel you own depends entirely on whether another user chooses to purchase it, which may never happen.',
    ],
  },
  {
    title: '8. Fees',
    paragraphs: [
      'Cracked Studios receives a service fee of five percent (5%) of the value of each purchase of an already-owned pixel, deducted from the amount paid to the previous owner. The full purchase price of a previously unowned pixel is paid to the smart-contract treasury. The fee rate is recorded in the smart contract and may be changed by us for future purchases.',
      'Transacting on the Base network requires the payment of network "gas" fees. Gas fees fluctuate, are payable by you to the network, and are non-refundable. Applicable amounts and currency are presented to you before you confirm a transaction.',
      'Where you pay in a currency other than an accepted Digital Asset — for example in NIM on the Nimiq network — the amount quoted to you may include a small buffer to cover price movement between the time of the quote and the time of settlement. That buffer is disclosed on screen before you pay.',
    ],
  },
  {
    title: '9. Promotions, Campaigns and Starter Grants',
    paragraphs: [
      'We may from time to time run promotions, campaigns, contests, or grants, including offers under which Cracked Studios purchases land on your behalf at no cost to you (a "Starter Grant"). These may be subject to separate rules presented at the time of the offer.',
      'Any such offer is discretionary and limited. Eligibility conditions, the number of participants, the value offered and the duration are set by us and may be changed, suspended, or withdrawn at any time and without prior notice, including because an allocated budget has been exhausted. An offer being visible to one user is not a representation that it is or will remain available to any other user, or to the same user at a later time.',
      'Where we purchase land on your behalf, the land is recorded to your wallet address and is yours on the same terms as land you purchased yourself, including the fee and pricing mechanics in Sections 7 and 8. Where an offer is described by reference to an amount of a cryptocurrency, that describes the value of the land purchased for you; it does not mean that cryptocurrency is transferred to you.',
      'Fraudulent activity, the use of multiple wallets or identities to obtain more than the permitted allocation, cheating, or violation of these Terms may result in forfeiture of any benefit received and enforcement action under Sections 11 and 17.',
    ],
  },
  {
    title: '10. Blockchain Transactions and Associated Risks',
    paragraphs: [
      'Cracked Studios does not provide trading, investment, or brokerage accounts or facilities, nor do we provide investment, financial, tax, or accounting advice of any kind. You are solely responsible for determining whether purchasing and transacting in Digital Assets is appropriate for you. You acknowledge and accept that:',
      'Blockchain transactions are irreversible; once confirmed they cannot be cancelled, recalled or refunded by us.',
      'You are responsible for network (gas) fees, which fluctuate and are non-refundable.',
      'Digital Assets can be volatile and may lose value or liquidity, and their value is subject to market, technological and regulatory change.',
      'The Base network, the Nimiq Pay platform and other third-party infrastructure are outside our control, and outages, congestion, forks or failures there may prevent or delay transactions.',
      'Smart contracts may contain errors or vulnerabilities notwithstanding testing and review.',
    ],
  },
  {
    title: '11. Users’ Conduct',
    paragraphs: [
      'You agree to use the Services lawfully, fairly, and responsibly. You must not, and must not attempt to: interfere with, damage, disable, overburden, or disrupt any part of the Services; upload, transmit, distribute, or introduce viruses, malware, or other harmful code; impersonate any person or entity, or falsely state or misrepresent your affiliation; harass, abuse, threaten, bully, defame, discriminate against, or otherwise harm any other person; infringe the intellectual property, privacy, publicity, data protection, or other rights of any person or entity; exploit bugs, errors, or unintended features for unfair advantage; engage in fraudulent behaviour, including fraudulent ad interactions, invalid traffic, payment fraud, or reward abuse; use bots, scripts, automation, scraping, data mining, or other unauthorized means to access or interact with the Services; reverse engineer, decompile, disassemble, modify, or create unauthorized derivative works; circumvent security or anti-cheat measures; buy, sell, rent, lease, share, transfer, or commercially exploit accounts or in-game advantages except as expressly permitted; upload, record, or share unlawful, infringing, misleading, obscene, hateful, sexually explicit, or otherwise objectionable material; or use the Services in violation of applicable law, regulation, or platform requirements.',
      'A display name, label, or link you attach to land you own is Content you are responsible for, and is subject to this Section.',
      'We may investigate suspected violations and take enforcement action including warnings, feature restrictions, account suspension, termination, or legal action, to the fullest extent permitted by applicable law.',
    ],
  },
  {
    title: '12. License',
    paragraphs: [
      'Subject to your agreement and continued compliance with these Terms, upon installing and using our Services, we grant you a non-exclusive, non-transferable, non-sublicensable, revocable license for your own non-commercial entertainment use. This license does not transfer any ownership rights in the Services or any Content to you. All rights not expressly granted to you are reserved by us and our licensors. This license will terminate or be suspended if you materially breach any provision of these Terms, or upon deletion or removal of the Services from your device.',
      'For the avoidance of doubt, this license concerns the Services and their Content. It does not affect your ownership of land recorded to your wallet address on the Base network, which is governed by the smart contract.',
    ],
  },
  {
    title: '13. Intellectual Property Rights',
    paragraphs: [
      'The Services, including all Content, software, code, design, text, graphics, logos, trademarks, gameplay elements, and audiovisual works, are owned by us or our licensors and are protected by intellectual property and other applicable laws. Except as expressly permitted in these Terms, you may not use, copy, reproduce, distribute, modify, publish, or otherwise exploit any part of the Services or Content without our prior written consent. All trademarks, service marks, and logos displayed through the Services are the property of their respective owners.',
    ],
  },
  {
    title: '14. Personal Data Protection',
    paragraphs: [
      'We value your privacy and take reasonable measures to protect your personal data. Please refer to our Privacy Policy for information on how we collect, use, disclose, store, and otherwise process your personal data in connection with the Services.',
      'You should be aware that blockchain transactions are public. Your wallet address, the land you own, and the prices you paid and received are recorded on the Base network and are visible to anyone, including through Terreno’s own maps and leaderboards. We cannot remove or alter that record.',
    ],
  },
  {
    title: '15. Disclaimer and Limitation of Liability',
    paragraphs: [
      'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICES ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.',
      'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL CRACKED STUDIOS, ITS AFFILIATES, DIRECTORS, OFFICERS, EMPLOYEES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, GOODWILL, DATA, OR CRYPTOCURRENCY VALUE, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICES.',
    ],
  },
  {
    title: '16. Indemnification',
    paragraphs: [
      'You agree to indemnify and hold harmless Cracked Studios, its affiliates, directors, officers, employees, agents, and licensors from and against any claims, liabilities, damages, losses, and expenses, including reasonable legal fees, arising out of or in any way connected with your access to or use of the Services, your Content, your breach of these Terms, or your violation of any law or the rights of a third party.',
    ],
  },
  {
    title: '17. Suspension and Termination',
    paragraphs: [
      'You may stop using the Services at any time, for any reason, by ceasing to access them or uninstalling the application. We may suspend, restrict, disable, or terminate all or part of your access to the Services at any time to the fullest extent permitted by applicable law if: you materially or repeatedly breach these Terms; we reasonably suspect fraud, abuse, unlawful conduct, or security issues; we need to protect the Services, other users, third parties, or our legitimate interests; or we are required to do so by law, court order, or regulation.',
      'Suspension or termination of your access to the Services does not remove or transfer land already recorded to your wallet address on the Base network, which remains subject to the smart contract. It may result in forfeiture of promotional benefits not yet received. You may appeal such decisions by contacting us at support@crackedstudios.xyz.',
    ],
  },
  {
    title: '18. Changes to These Terms or the Services',
    paragraphs: [
      'We may update these Terms from time to time. Material changes will be notified to you where required by applicable law, and the effective date above will be updated. Your continued use of the Services after an update means you accept the updated Terms.',
      'We may add, modify, suspend or discontinue any part of the Services at any time. Where a change would affect land you already own, we will act in accordance with the smart contract, which we cannot alter retroactively in respect of completed transactions.',
    ],
  },
  {
    title: '19. Securities Disclaimer',
    paragraphs: [
      'Land in Terreno is an in-game item recorded on a public blockchain. It is not offered as, and should not be construed as, a security, investment product, financial instrument, or an interest in Cracked Studios or any of its games. Nothing in the Services constitutes an offer or solicitation to buy or sell any security, or investment, financial, tax, or legal advice.',
      'You should not purchase land in expectation of profit. Prices are set mechanically by the smart contract and any amount you receive depends entirely on the voluntary actions of other users.',
    ],
  },
  {
    title: '20. Governing Law and Dispute Resolution',
    paragraphs: [
      'These Terms shall be governed by and construed in accordance with the laws of Nigeria. If you have any concerns or issues, you can contact us at support@crackedstudios.xyz, and we will endeavour to resolve disputes with users through amicable consultation.',
      'If a dispute cannot be resolved through consultation within 30 days, either party may submit the dispute for arbitration at the Nigerian Institute of Chartered Arbitrators ("NICArb") in accordance with the NICArb Administered Arbitration Rules in effect at the time of applying for arbitration. The language of the arbitration shall be English.',
    ],
  },
  {
    title: '21. General Provisions',
    paragraphs: [
      'Entire Agreement. These Terms, together with our Privacy Policy and any other terms expressly referenced herein, constitute the entire agreement between you and us regarding the Services.',
      'Severability. If any provision of these Terms is held to be invalid, the remaining provisions shall remain in full force and effect.',
      'No Waiver. Our failure to enforce any provision of these Terms shall not constitute a waiver of that provision.',
      'Assignment. We may assign our rights and obligations under these Terms in connection with a merger, acquisition, or sale of assets.',
      'Language. These Terms are drafted in English. In the event of any conflict between the English version and any translated version, the English version shall prevail.',
    ],
  },
  {
    title: '22. Contact Us',
    paragraphs: [
      'If you have any questions about these Terms or wish to exercise any rights under applicable law, please contact us at support@crackedstudios.xyz.',
    ],
  },
]

export default function TermsPage() {
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
      <h1 className="font-display" style={{ fontSize: 44, lineHeight: 0.8, margin: '0 0 8px' }}>Cracked Studios Terms of Use</h1>
      <p style={{ fontSize: 13, marginBottom: 4 }}>Terreno T&amp;C&rsquo;s</p>
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
        Our Privacy Policy is available at{' '}
        <Link href="/privacy" style={{ color: 'var(--accent)' }}>
          terreno.world/privacy
        </Link>
        .
      </p>

      <p style={{ fontSize: 11, color: 'var(--mute-on-paper)', marginTop: 32 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>← Back to Terreno</Link>
      </p>
    </article>
  )
}
