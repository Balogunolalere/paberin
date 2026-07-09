'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ScrollReveal } from '@/components/ScrollReveal';
import { api, formatNaira, type Service, type QuoteBreakdown } from '@/lib/api';

/**
 * Public price calculator.
 *
 * Fetches the active PABERIN services, lets the visitor pick a service,
 * quantity, SLA, and delivery option, then calls `api.getQuote` for a
 * full breakdown. No login required.
 */

type DeliveryOption = 'pickup' | 'local' | 'nationwide' | '';
type Sla = 'Standard' | 'Express';

const DELIVERY_OPTIONS: { value: DeliveryOption; label: string; hint: string }[] = [
  { value: 'pickup', label: 'Pickup', hint: 'Wempco Rd, Ogba, Ikeja' },
  { value: 'local', label: 'Local delivery', hint: 'Within Lagos' },
  { value: 'nationwide', label: 'Nationwide waybill', hint: 'Outside Lagos' },
];

function buildDeliveryBody(opt: DeliveryOption): Record<string, unknown> {
  if (opt === 'pickup') return { deliveryMethod: 'PICKUP' };
  if (opt === 'local') return { deliveryMethod: 'LOCAL_DELIVERY', deliveryDistanceKm: 10 };
  if (opt === 'nationwide') return { deliveryMethod: 'NATIONWIDE_WAYBILL', deliveryDistanceKm: 80 };
  return {};
}

export default function CalculatorPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [serviceType, setServiceType] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [sla, setSla] = useState<Sla>('Standard');
  const [delivery, setDelivery] = useState<DeliveryOption>('');

  const [breakdown, setBreakdown] = useState<QuoteBreakdown | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getServices();
        if (cancelled) return;
        setServices(data || []);
        if (data.length) setServiceType(data[0].type);
      } catch (err: any) {
        if (!cancelled) setServicesError(err?.message || 'Could not load services.');
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedService = useMemo(
    () => services.find((s) => s.type === serviceType) || null,
    [services, serviceType]
  );

  // If the currently-selected service doesn't allow Express, force Standard.
  useEffect(() => {
    if (selectedService && !selectedService.allowExpress && sla === 'Express') {
      setSla('Standard');
    }
  }, [selectedService, sla]);

  const calculate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceType) {
      setQuoteError('Pick a service first.');
      return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    setSearched(true);
    try {
      const res = await api.getQuote({
        serviceType,
        quantity: Math.max(1, quantity || 1),
        sla,
        ...buildDeliveryBody(delivery),
      });
      setBreakdown(res.breakdown || null);
      setTotal(res.breakdown?.finalPriceNaira ?? res.quoteNaira ?? 0);
    } catch (err: any) {
      setQuoteError(err?.message || 'Could not calculate a quote. Try again.');
      setBreakdown(null);
      setTotal(null);
    } finally {
      setQuoteLoading(false);
    }
  };

  const rows: { label: string; value: number | undefined; muted?: boolean }[] = [
    { label: 'Service', value: breakdown?.basePrice },
    {
      label: `Quantity${breakdown?.quantity ? ` × ${breakdown.quantity}` : ''}`,
      value: undefined,
      muted: true,
    },
    { label: 'Express surcharge', value: breakdown?.expressSurcharge },
    { label: 'Add-ons', value: breakdown?.addOnsTotal },
    { label: 'Discount', value: breakdown?.discount },
    { label: 'Delivery fee', value: breakdown?.deliveryFee },
  ].filter((r) => r.muted || (typeof r.value === 'number' && r.value !== 0));

  return (
    <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-24">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 md:gap-24 items-start">
        {/* Left — Hero copy + form */}
        <div>
          <ScrollReveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-6">
              Price Calculator
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-black leading-[1.1] max-w-[30rem]">
              Estimate your job<span className="text-[#FF5C00]">.</span>
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <p className="text-base text-[#666666] max-w-[27.5rem] mt-6 leading-relaxed">
              Pick a service, quantity, turnaround, and delivery option to get an
              instant estimate. Final pricing is confirmed when you place an order.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.3}>
            <form onSubmit={calculate} className="mt-8 sm:mt-12 space-y-6">
              {/* Service */}
              <div className="space-y-2">
                <label
                  htmlFor="serviceType"
                  className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]"
                >
                  <span className="text-[#FF5C00]">01</span> Service
                </label>
                {servicesLoading ? (
                  <div className="form-input flex items-center gap-3">
                    <div className="w-4 h-4 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
                    <span className="text-sm text-[#888888]">Loading services…</span>
                  </div>
                ) : servicesError ? (
                  <div className="form-input text-sm text-[#E05200]">{servicesError}</div>
                ) : (
                  <select
                    id="serviceType"
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="form-input"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.type}>
                        {s.label} — {formatNaira(s.basePriceNaira)}/{s.unit || 'unit'}
                      </option>
                    ))}
                  </select>
                )}
                {selectedService && (
                  <p className="text-xs text-[#666666] leading-relaxed mt-1">
                    {selectedService.description}
                  </p>
                )}
                {selectedService?.minPriceNaira ? (
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mt-1">
                    Minimum order: {formatNaira(selectedService.minPriceNaira)}
                  </p>
                ) : null}
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <label
                  htmlFor="quantity"
                  className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]"
                >
                  <span className="text-[#FF5C00]">02</span> Quantity
                  {selectedService?.unit ? (
                    <span className="normal-case tracking-normal text-[#999999]">
                      {' '}({selectedService.unit})
                    </span>
                  ) : null}
                </label>
                <input
                  id="quantity"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))
                  }
                  className="form-input"
                />
              </div>

              {/* SLA */}
              <div className="space-y-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                  <span className="text-[#FF5C00]">03</span> Turnaround
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSla('Standard')}
                    className={`text-left border px-4 py-3 rounded transition-colors ${
                      sla === 'Standard'
                        ? 'border-[#FF5C00] bg-[#FFF7F0]'
                        : 'border-[#EAEAEA] hover:border-black'
                    }`}
                  >
                    <p className="text-sm font-medium text-black">Standard</p>
                    {selectedService?.standardLeadTime && (
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mt-1">
                        {selectedService.standardLeadTime}
                      </p>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      selectedService?.allowExpress !== false && setSla('Express')
                    }
                    disabled={selectedService?.allowExpress === false}
                    className={`text-left border px-4 py-3 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      sla === 'Express'
                        ? 'border-[#FF5C00] bg-[#FFF7F0]'
                        : 'border-[#EAEAEA] hover:border-black'
                    }`}
                  >
                    <p className="text-sm font-medium text-black">Express</p>
                    {selectedService?.expressLeadTime ? (
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mt-1">
                        {selectedService.expressLeadTime}
                      </p>
                    ) : (
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#999999] mt-1">
                        {selectedService?.allowExpress === false
                          ? 'Not available'
                          : 'Faster turnaround'}
                      </p>
                    )}
                  </button>
                </div>
                {selectedService?.expressSurchargePct ? (
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mt-1">
                    Express adds +{selectedService.expressSurchargePct}% surcharge
                  </p>
                ) : null}
              </div>

              {/* Delivery */}
              <div className="space-y-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                  <span className="text-[#FF5C00]">04</span> Delivery{' '}
                  <span className="normal-case tracking-normal text-[#999999]">(optional)</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {DELIVERY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setDelivery(delivery === opt.value ? '' : opt.value)
                      }
                      className={`text-left border px-3 py-2.5 rounded transition-colors ${
                        delivery === opt.value
                          ? 'border-[#FF5C00] bg-[#FFF7F0]'
                          : 'border-[#EAEAEA] hover:border-black'
                      }`}
                    >
                      <p className="text-sm font-medium text-black">{opt.label}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mt-1">
                        {opt.hint}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={quoteLoading || servicesLoading || !serviceType}
                className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {quoteLoading ? 'Calculating…' : 'Calculate price'}
              </button>

              {quoteError && (
                <div className="border border-[#FF5C00]/30 bg-[#FF5C00]/5 px-4 py-3 rounded text-sm text-[#E05200]">
                  {quoteError}
                </div>
              )}
            </form>
          </ScrollReveal>
        </div>

        {/* Right — Result */}
        <div>
          {!searched && !quoteLoading && (
            <ScrollReveal delay={0.3}>
              <div className="card space-y-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                  Your estimate
                </p>
                <p className="text-sm text-[#666666] leading-relaxed">
                  Choose a service, quantity, and turnaround on the left, then hit{' '}
                  <span className="text-black font-medium">Calculate price</span> for a
                  line-by-line breakdown including delivery.
                </p>
              </div>
            </ScrollReveal>
          )}

          {quoteLoading && (
            <div className="card flex items-center gap-4">
              <div className="w-6 h-6 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
              <p className="text-sm text-[#666666]">Calculating your estimate…</p>
            </div>
          )}

          {!quoteLoading && breakdown && (
            <ScrollReveal delay={0.1}>
              <div className="space-y-6">
                <div className="card-premium card-premium-lg p-6 sm:p-7">
                  <div className="flex items-center justify-between mb-5">
                    <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      Estimate breakdown
                    </p>
                    <span className="pill pill-accent">
                      <span className="pill-dot" />
                      Live quote
                    </span>
                  </div>

                  {breakdown.serviceLabel && (
                    <p className="text-sm font-semibold text-black mb-4">
                      {breakdown.serviceLabel}
                    </p>
                  )}

                  <div className="space-y-3">
                    {rows.map((r) => (
                      <div
                        key={r.label}
                        className="flex items-baseline justify-between gap-4 text-sm"
                      >
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888]">
                          {r.label}
                        </span>
                        <span className="text-black tabular-nums text-right">
                          {r.muted
                            ? breakdown?.quantity ?? quantity
                            : formatNaira(r.value || 0)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="rule my-5" />

                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      Estimated total
                    </span>
                    <span className="text-2xl sm:text-3xl font-bold text-[#FF5C00] tabular-nums">
                      {formatNaira(total ?? 0)}
                    </span>
                  </div>

                  <div className="mt-6 pt-5 border-t border-[#EAEAEA] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <p className="text-xs text-[#666666] leading-relaxed">
                      This is an estimate. Place an order to proceed.
                    </p>
                    <Link href="/order" className="btn-primary whitespace-nowrap">
                      Place an order
                    </Link>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          )}
        </div>
      </div>
    </div>
  );
}
