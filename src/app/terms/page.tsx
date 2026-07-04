import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of service for Paberin precision laser cutting.',
};

const SECTIONS = [
  { id: 'section-1.0', label: '[1.0] General Terms' },
  { id: 'section-2.0', label: '[2.0] Orders & Payment' },
  { id: 'section-3.0', label: '[3.0] Quality & Delivery' },
  { id: 'section-4.0', label: '[4.0] Data & Privacy' },
];

const TERMS_DATA = [
  {
    id: '1.0',
    title: 'General Terms',
    content: (
      <p>
        By using the Paberin platform, you agree to these conditions. All orders
        are subject to material availability and queue scheduling. We reserve the
        right to update these terms at any time with notice to active customers.
      </p>
    ),
  },
  {
    id: '2.0',
    title: 'Orders & Payment',
    content: (
      <>
        <p>
          Quotes are valid for 14 days from the date of issue. Payment is due upon
          confirmation of the order. All prices are quoted in USD unless otherwise
          stated.
        </p>
        <p>
          Cancellations made before cutting begins are refunded minus a 5%
          processing fee. Once production has started, deposits are non-refundable.
        </p>
      </>
    ),
  },
  {
    id: '3.0',
    title: 'Quality & Delivery',
    content: (
      <>
        <p>
          Standard cutting tolerance is ±1mm unless a tighter specification is
          agreed in writing. Delivery estimates are based on current queue depth
          and are provided in good faith.
        </p>
        <p>
          Paberin is not liable for delays caused by carriers, customs, or force
          majeure events. We will recut any parts that fail to meet agreed
          tolerances at no additional cost.
        </p>
      </>
    ),
  },
  {
    id: '4.0',
    title: 'Data & Privacy',
    content: (
      <>
        <p>
          Client designs are never shared with third parties. Your data is retained
          for the duration of our business relationship plus any legally required
          period.
        </p>
        <p>
          Anonymised and aggregated data may be used for system improvement and
          queue optimization algorithms. See our Privacy Policy for full details.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
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
              {TERMS_DATA.map((section) => (
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
            Terms of Service<span className="text-[#FF5C00]">.</span>
          </h1>

          <div className="space-y-16">
            {TERMS_DATA.map((section) => (
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
