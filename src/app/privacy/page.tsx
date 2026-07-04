import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for Paberin precision laser cutting.',
};

const SECTIONS = [
  {
    id: '1.0',
    title: 'Information We Collect',
    content: (
      <p>
        We collect your name, email address, design files, material specifications,
        order history, and support communications. Standard server logs including
        IP address, browser type, and pages visited are also recorded.
      </p>
    ),
  },
  {
    id: '2.0',
    title: 'How We Use Your Data',
    content: (
      <>
        <p>
          Your designs and files are used solely for order fulfillment. Email
          addresses are used for order confirmations, tracking updates, and
          occasional service announcements.
        </p>
        <p>
          We never sell, rent, or share your personal data with third parties.
          Anonymised and aggregated data may be used to improve our scheduling
          algorithms and quality control processes.
        </p>
      </>
    ),
  },
  {
    id: '3.0',
    title: 'Data Storage & Security',
    content: (
      <>
        <p>
          All data is stored on encrypted servers with strictly limited access
          controls. Design files are retained for the duration of your order plus
          90 days, after which they are securely deleted.
        </p>
        <p>
          All data in transit is protected with TLS encryption. Data at rest is
          encrypted using AES-256. Payment information is never stored on Paberin
          servers — all payments are processed through PCI-compliant third-party
          providers.
        </p>
      </>
    ),
  },
  {
    id: '4.0',
    title: 'Cookies & Tracking',
    content: (
      <>
        <p>
          We use essential cookies for session management and order tracking.
          Analytics cookies may be used to understand site usage patterns and
          improve our service.
        </p>
        <p>
          We do not use third-party advertising cookies, tracking pixels, or
          fingerprinting technologies. You can disable cookies in your browser
          settings, though some features may not function correctly.
        </p>
      </>
    ),
  },
  {
    id: '5.0',
    title: 'Your Rights',
    content: (
      <>
        <p>
          You have the right to access, correct, or delete your personal data at
          any time. You may request a full copy of your data and we will provide
          it within 14 days.
        </p>
        <p>
          If you are an EU or UK resident, you have additional rights under GDPR.
          To exercise any of these rights, contact us at{' '}
          <a
            href="mailto:privacy@skyal.com"
            className="text-[#FF5C00] hover:underline"
          >
            privacy@skyal.com
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: '6.0',
    title: 'Changes to This Policy',
    content: (
      <>
        <p>
          We may update this Privacy Policy from time to time. Material changes
          will be communicated via email to active customers.
        </p>
        <p>
          Continued use of our services after changes take effect constitutes
          acceptance of the updated policy. The date of the most recent revision
          is noted below.
        </p>
        <p className="font-mono text-xs text-[#888888] mt-8">
          Last updated: June 2026
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-24">
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8 sm:gap-12 md:gap-20">
        {/* Left Sidebar — Sticky Index */}
        <aside>
          <nav className="md:sticky top-20 h-fit">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-4 sm:mb-6">
              Index
            </p>
            <ul className="flex flex-row md:flex-col gap-3 flex-wrap">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#section-${section.id}`}
                    className="text-sm text-[#666666] hover:text-black transition-colors"
                  >
                    <span className="text-xs text-[#888888] font-mono">
                      [{section.id}]
                    </span>{' '}
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Right Content Area */}
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-black leading-[1.1] mb-10 sm:mb-16">
            Privacy Policy<span className="text-[#FF5C00]">.</span>
          </h1>

          <div className="space-y-16">
            {SECTIONS.map((section) => (
              <section
                key={section.id}
                id={`section-${section.id}`}
                className="scroll-mt-20"
              >
                {/* Header row */}
                <div className="flex items-center gap-4 mb-6">
                  <h2 className="font-mono text-sm text-[#FF5C00] font-bold whitespace-nowrap">
                    [{section.id}] {section.title}
                  </h2>
                  <div className="h-px bg-[#EAEAEA] flex-1" />
                </div>
                {/* Content card */}
                <div className="card text-sm md:text-base text-[#666666] leading-relaxed space-y-4">
                  {section.content}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
