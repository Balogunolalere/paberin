import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cancellation Policy',
  description: 'Paberin cancellation policy — how to cancel an order and what happens next.',
};

const SECTIONS = [
  {
    id: '1.0',
    title: 'Order Cancellation Window',
    content: (
      <>
        <p>
          You may cancel your order without penalty if the request is made within the
          following timeframes:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li><strong>Before production begins:</strong> Full refund minus a 5% processing fee.</li>
          <li><strong>After production has started:</strong> Deposits are non-refundable once materials have been sourced and cutting/production has commenced.</li>
          <li><strong>After delivery:</strong> Cancellations no longer apply — see our Refund Policy for quality-related issues.</li>
        </ul>
      </>
    ),
  },
  {
    id: '2.0',
    title: 'How to Cancel',
    content: (
      <>
        <ol className="list-decimal pl-5 space-y-1 mt-2">
          <li>Log in to your dashboard and navigate to the order you wish to cancel, or</li>
          <li>Email <a href="mailto:support@paberin.com" className="text-[#FF5C00] hover:underline">support@paberin.com</a> with your order number and cancellation request, or</li>
          <li>Use the chat feature on our website to initiate a cancellation.</li>
        </ol>
        <p className="mt-2">
          We will confirm your cancellation via email within 4 hours during business hours.
        </p>
      </>
    ),
  },
  {
    id: '3.0',
    title: 'Cancellation by Paberin',
    content: (
      <>
        <p>
          Paberin reserves the right to cancel any order under the following circumstances:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Material unavailability that cannot be resolved within the quoted lead time.</li>
          <li>Design files that cannot be processed with our equipment or do not meet technical requirements after consultation.</li>
          <li>Suspicious or fraudulent activity.</li>
          <li>Non-payment of the order total within the agreed timeframe.</li>
        </ul>
        <p className="mt-2">
          If Paberin cancels your order, you will receive a full refund (no processing fee) within 5–10 business days.
        </p>
      </>
    ),
  },
  {
    id: '4.0',
    title: 'Modifications vs Cancellations',
    content: (
      <>
        <p>
          If you need to change your order (quantity, design, delivery address) rather than
          cancel entirely, contact us as soon as possible. Minor modifications may be possible
          even after production has begun, subject to additional charges.
        </p>
        <p className="mt-2">
          Significant changes after production starts may be treated as a cancellation of the
          original order and creation of a new one.
        </p>
      </>
    ),
  },
];

export default function CancellationPolicyPage() {
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
            Cancellation Policy<span className="text-[#FF5C00]">.</span>
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
