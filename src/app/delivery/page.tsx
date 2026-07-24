import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Delivery Method',
  description: 'Paberin delivery and pickup options — Lagos only.',
};

const SECTIONS = [
  {
    id: '1.0',
    title: 'Pickup',
    content: (
      <>
        <p>
          Collect your completed order from our Ogba workshop at no additional cost.
          You will receive an email notification when your order is ready for pickup.
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li><strong>Location:</strong> Wempco Rd, Ogba, Ikeja, Lagos</li>
          <li><strong>Hours:</strong> Monday–Friday, 08:00–18:00</li>
          <li><strong>Hold period:</strong> Your order will be held for 7 days after notification.</li>
          <li><strong>What to bring:</strong> Your order number and a valid ID.</li>
        </ul>
      </>
    ),
  },
  {
    id: '2.0',
    title: 'Lagos Delivery',
    content: (
      <>
        <p>
          We dispatch orders within Lagos via trusted courier partners. A delivery fee
          is calculated based on your location and order size at checkout.
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li><strong>Timeline:</strong> 1–3 business days after production is complete.</li>
          <li><strong>Tracking:</strong> You will receive a tracking link via email once your order is dispatched.</li>
          <li><strong>Inspection:</strong> Please inspect your order upon delivery and report any issues within 24 hours.</li>
        </ul>
      </>
    ),
  },
  {
    id: '3.0',
    title: 'Coverage Area',
    content: (
      <>
        <p>
          For now, Paberin only delivers within Lagos State. Nationwide shipping will be
          announced in the future — sign up for updates or contact us if you&apos;d like to
          be notified when we expand.
        </p>
      </>
    ),
  },
  {
    id: '4.0',
    title: 'Delivery Limitations',
    content: (
      <>
        <p>
          Paberin is not liable for delays caused by carriers, customs, natural disasters,
          or other force majeure events. We will communicate any delays promptly via email
          and phone.
        </p>
        <p className="mt-2">
          If a delivery attempt fails, the item may be returned to our workshop. Re-delivery
          fees may apply for failed attempts not caused by Paberin.
        </p>
      </>
    ),
  },
];

export default function DeliveryPage() {
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
            Delivery Method<span className="text-[#FF5C00]">.</span>
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
