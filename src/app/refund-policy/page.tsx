import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund Policy',
  description: 'Paberin refund policy — when and how you can get your money back.',
};

const SECTIONS = [
  {
    id: '1.0',
    title: 'Eligibility for Refunds',
    content: (
      <>
        <p>
          You are eligible for a refund under the following conditions:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li><strong>Quality issues:</strong> If the finished product fails to meet the agreed specifications or tolerances (±1mm standard cutting tolerance), we will either recut at no cost or issue a full refund.</li>
          <li><strong>Non-delivery:</strong> If your order is not delivered within the agreed timeline plus 7 business days, and Paberin cannot provide a valid explanation, you may request a full refund.</li>
          <li><strong>Payment errors:</strong> If you were charged twice for the same order or charged an incorrect amount, contact us immediately for a refund of the overcharge.</li>
        </ul>
      </>
    ),
  },
  {
    id: '2.0',
    title: 'Non-Refundable Items',
    content: (
      <>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Orders where production has already begun (cutting has started) — deposits are non-refundable once materials have been sourced and work has commenced.</li>
          <li>Custom or personalized orders cancelled by the customer after production start.</li>
          <li>Design files uploaded by the customer that do not meet our technical requirements — we will notify you before production begins if there are concerns.</li>
        </ul>
      </>
    ),
  },
  {
    id: '3.0',
    title: 'How to Request a Refund',
    content: (
      <>
        <ol className="list-decimal pl-5 space-y-1 mt-2">
          <li>Contact us via email at <a href="mailto:support@paberin.com" className="text-[#FF5C00] hover:underline">support@paberin.com</a> with your order number and reason for the refund request.</li>
          <li>Include any supporting evidence (photos of defects, delivery issues, etc.).</li>
          <li>We will review your request within 48 hours and respond with our decision.</li>
          <li>If approved, refunds will be processed within 5–10 business days to the original payment method.</li>
        </ol>
      </>
    ),
  },
  {
    id: '4.0',
    title: 'Refund Processing',
    content: (
      <>
        <p>
          Approved refunds are processed through the original payment method. For Paystack
          payments, refunds are initiated on our end and reflected in your account within
          5–10 business days depending on your bank or card issuer.
        </p>
        <p className="mt-2">
          Shipping fees are non-refundable unless the refund is due to a Paberin error.
        </p>
      </>
    ),
  },
];

export default function RefundPolicyPage() {
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
            Refund Policy<span className="text-[#FF5C00]">.</span>
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
