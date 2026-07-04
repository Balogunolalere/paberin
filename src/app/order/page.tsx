'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ScrollReveal } from '@/components/ScrollReveal';
import { usePaberinAuth } from '@/lib/auth';
import {
  api,
  formatNaira,
  formatDate,
  type Service,
  type QuoteResponse,
  type Order,
} from '@/lib/api';

/**
 * Paberin order form — 5-step wizard.
 *
 * 1. Choose service     — fetched live from /api/services?brand=PABERIN
 * 2. Details            — quantity, SLA, design file, live quote
 * 3. Delivery           — pickup vs dispatch, address, referral
 * 4. Customer info      — name, phone, email, notes
 * 5. Review & pay       — summary, create order, redirect to Paystack
 *
 * Quote is recalculated live whenever service / quantity / SLA / delivery
 * changes. The order is POSTed to /api/orders on submit; on success we
 * initialize Paystack and redirect. On payment return we'd verify at
 * /track?id=ORDER-NUMBER.
 */

type Step = 1 | 2 | 3 | 4 | 5;

interface FormState {
  serviceType: string;
  serviceName: string;
  quantity: number;
  sla: 'Standard' | 'Express';
  designFileUrl: string;
  designFileName: string;
  customerNotes: string;
  deliveryMethod: 'PICKUP' | 'DELIVERY';
  deliveryAddress: string;
  referralCode: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

const initialState: FormState = {
  serviceType: '',
  serviceName: '',
  quantity: 1,
  sla: 'Standard',
  designFileUrl: '',
  designFileName: '',
  customerNotes: '',
  deliveryMethod: 'PICKUP',
  deliveryAddress: '',
  referralCode: '',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
};

const STEPS = [
  { num: 1, label: 'Service' },
  { num: 2, label: 'Details' },
  { num: 3, label: 'Delivery' },
  { num: 4, label: 'Customer' },
  { num: 5, label: 'Review & Pay' },
];

export default function OrderPage() {
  const router = useRouter();
  const { customer } = usePaberinAuth();
  const [step, setStep] = useState<Step>(1);
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialState);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [referralValid, setReferralValid] = useState<null | { valid: boolean; reward?: number; referrer?: string }>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prefill from auth profile
  useEffect(() => {
    if (customer) {
      setForm((prev) => ({
        ...prev,
        customerName: prev.customerName || customer.name || '',
        customerPhone: prev.customerPhone || customer.phone || '',
        customerEmail: prev.customerEmail || customer.email || '',
      }));
    }
  }, [customer]);

  // Fetch services on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setServicesLoading(true);
      try {
        const data = await api.getServices();
        if (!cancelled) {
          setServices(data || []);
          setServicesError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setServicesError(err?.message || 'Could not load services. Please retry.');
        }
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live quote — refetch whenever inputs that affect price change
  const fetchQuote = useCallback(async () => {
    if (!form.serviceType || !form.quantity) return;
    setQuoteLoading(true);
    try {
      const q = await api.getQuote({
        serviceType: form.serviceType,
        quantity: form.quantity,
        sla: form.sla,
        deliveryMethod: form.deliveryMethod,
        deliveryDistanceKm: form.deliveryMethod === 'DELIVERY' && form.deliveryAddress ? 10 : undefined,
        referralCode: form.referralCode || undefined,
        isFirstTimeCustomer: customer?.isNew || false,
      });
      setQuote(q);
    } catch (err: any) {
      // Quote failures shouldn't block navigation — just clear the quote
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [form.serviceType, form.quantity, form.sla, form.deliveryMethod, form.deliveryAddress, form.referralCode, customer?.isNew]);

  useEffect(() => {
    if (step >= 2 && form.serviceType) {
      const t = setTimeout(fetchQuote, 350);
      return () => clearTimeout(t);
    }
  }, [fetchQuote, step, form.serviceType]);

  // Validate referral code (debounced)
  useEffect(() => {
    if (!form.referralCode) {
      setReferralValid(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api.validateReferral(form.referralCode);
        setReferralValid({
          valid: r.valid,
          reward: (r as any).rewardAmount,
          referrer: (r as any).referrerName,
        });
      } catch {
        setReferralValid({ valid: false });
      }
    }, 500);
    return () => clearTimeout(t);
  }, [form.referralCode]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectService = (s: Service) => {
    update('serviceType', s.type);
    update('serviceName', s.label);
    setStep(2);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // We can't actually upload — store the file name and prompt the user
    // to share a public URL (Drive / Dropbox / WeTransfer). The admin team
    // will follow up via email if needed.
    update('designFileName', file.name);
    if (!form.designFileUrl) {
      update('designFileUrl', '');
    }
  };

  const canProceed = (): boolean => {
    if (step === 1) return !!form.serviceType;
    if (step === 2) return form.quantity > 0 && (!!form.designFileUrl || !!form.designFileName || !!form.customerNotes);
    if (step === 3) {
      if (form.deliveryMethod === 'DELIVERY') return !!form.deliveryAddress.trim();
      return true;
    }
    if (step === 4) {
      return (
        !!form.customerName.trim() &&
        !!form.customerPhone.trim() &&
        !!form.customerEmail.trim() &&
        /^\S+@\S+\.\S+$/.test(form.customerEmail)
      );
    }
    return true;
  };

  const next = () => {
    setError(null);
    if (!canProceed()) {
      setError('Please complete all required fields before continuing.');
      return;
    }
    setStep((s) => (Math.min(5, s + 1) as Step));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const prev = () => {
    setError(null);
    setStep((s) => (Math.max(1, s - 1) as Step));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const order = await api.createOrder({
        serviceType: form.serviceType,
        quantity: form.quantity,
        sla: form.sla,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail,
        deliveryMethod: form.deliveryMethod,
        deliveryAddress: form.deliveryMethod === 'DELIVERY' ? form.deliveryAddress : undefined,
        designFileUrl: form.designFileUrl || undefined,
        customerNotes: [form.customerNotes, form.designFileName ? `Design file: ${form.designFileName}` : ''].filter(Boolean).join('\n\n'),
        referralCode: form.referralCode || undefined,
        isFirstTimeCustomer: customer?.isNew || false,
      });
      setCreatedOrder(order);

      // Initialize Paystack payment (best-effort — order is already created)
      try {
        const pay = await api.initializePayment({
          amount: order.totalAmount,
          email: form.customerEmail,
          orderNumber: order.orderNumber,
          metadata: { orderNumber: order.orderNumber, brand: 'PABERIN' },
        });
        // Redirect to Paystack checkout
        if ((pay as any).authorization_url) {
          window.location.href = (pay as any).authorization_url;
          return;
        }
      } catch (payErr) {
        // Payment init failed — fall through to success screen with manual payment note
        console.warn('Payment init failed:', payErr);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not submit order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ──────── Success State ──────── */
  if (createdOrder) {
    return (
      <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <ScrollReveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-6">
              Order Received
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h1 className="text-2xl sm:text-3xl md:text-6xl font-bold text-black leading-[1.1]">
              We&apos;ve got your specs<span className="text-[#FF5C00]">.</span>
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <p className="text-base text-[#666666] mt-6 leading-relaxed">
              Your order <span className="font-mono text-black">{createdOrder.orderNumber}</span> is
              queued. We&apos;ll review your design and confirm by email within 4 hours.
              Track progress any time.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.3}>
            <div className="card mt-10 text-left">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">Service</p>
                  <p className="text-black">{createdOrder.serviceLabel}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">Quantity</p>
                  <p className="text-black">{createdOrder.quantity}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">Total</p>
                  <p className="text-black font-bold">{formatNaira(createdOrder.totalAmount)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">SLA</p>
                  <p className="text-black">{createdOrder.sla}</p>
                </div>
              </div>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={0.4}>
            <div className="mt-10 flex justify-center gap-4 flex-wrap">
              <Link
                href={`/track?id=${encodeURIComponent(createdOrder.orderNumber)}`}
                className="btn-primary"
              >
                Track This Order
              </Link>
              <Link href="/dashboard" className="btn-outline">
                Go to Dashboard
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </div>
    );
  }

  /* ──────── Wizard ──────── */
  return (
    <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-8 sm:py-12 md:py-16">
      {/* Header */}
      <ScrollReveal>
        <div className="mb-8 sm:mb-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-3">
            Start an Order
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-black leading-[1.1]">
            Tell us what you need cut<span className="text-[#FF5C00]">.</span>
          </h1>
        </div>
      </ScrollReveal>

      {/* Stepper */}
      <ScrollReveal delay={0.1}>
        <div className="mb-8 sm:mb-12">
          <div className="flex items-center justify-between overflow-x-auto pb-2">
            {STEPS.map((s, i) => (
              <div key={s.num} className="flex items-center flex-shrink-0">
                <button
                  onClick={() => s.num < step && setStep(s.num as Step)}
                  disabled={s.num > step}
                  className={`flex items-center gap-2 ${
                    s.num < step ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                      s.num === step
                        ? 'bg-[#FF5C00] text-white border-[#FF5C00]'
                        : s.num < step
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-[#888888] border-[#EAEAEA]'
                    }`}
                  >
                    {s.num < step ? '✓' : s.num}
                  </span>
                  <span
                    className={`text-xs font-mono uppercase tracking-[0.12em] hidden sm:block ${
                      s.num === step ? 'text-black' : s.num < step ? 'text-[#666666]' : 'text-[#888888]'
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    className={`w-8 sm:w-16 h-px mx-2 ${
                      s.num < step ? 'bg-black' : 'bg-[#EAEAEA]'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
        {/* Main content */}
        <div className="lg:col-span-2">
          {/* ──────── Step 1: Service ──────── */}
          {step === 1 && (
            <ScrollReveal>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-black mb-1">
                  Pick a service
                </h2>
                <p className="text-sm text-[#666666] mb-6">
                  Each service has its own pricing, lead time, and material options.
                </p>

                {servicesLoading && (
                  <div className="card flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
                    <p className="text-sm text-[#666666]">Loading services…</p>
                  </div>
                )}

                {servicesError && (
                  <div className="card border-[#FF5C00]/30 bg-[#FF5C00]/5">
                    <p className="text-sm text-[#E05200]">{servicesError}</p>
                  </div>
                )}

                {!servicesLoading && !servicesError && services.length === 0 && (
                  <div className="card text-center">
                    <p className="text-sm text-[#666666]">
                      No services available right now. Please check back shortly or{' '}
                      <Link href="/contact" className="text-[#FF5C00] hover:underline">
                        contact us
                      </Link>
                      .
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {services.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => selectService(s)}
                      className={`card text-left hover-lift transition-all ${
                        form.serviceType === s.type
                          ? 'border-[#FF5C00] ring-1 ring-[#FF5C00]'
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888]">
                          {s.category}
                        </p>
                        <p className="font-mono text-xs text-[#FF5C00] font-bold">
                          {formatNaira(s.basePriceNaira)}
                          <span className="text-[#888888] font-normal">/{s.unit}</span>
                        </p>
                      </div>
                      <p className="text-base font-bold text-black mb-1">{s.label}</p>
                      <p className="text-xs text-[#666666] line-clamp-2 leading-relaxed">
                        {s.description}
                      </p>
                      <div className="mt-3 pt-3 border-t border-[#EAEAEA] flex items-center justify-between text-xs">
                        <span className="text-[#888888]">
                          Lead: {s.standardLeadTime}
                        </span>
                        {s.allowExpress && (
                          <span className="text-[#FF5C00]">Express available</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          )}

          {/* ──────── Step 2: Details ──────── */}
          {step === 2 && (
            <ScrollReveal>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-black mb-1">
                  Order details
                </h2>
                <p className="text-sm text-[#666666] mb-6">
                  Set quantity, lead time, and share your design.
                </p>

                <div className="space-y-6">
                  {/* Service summary */}
                  <div className="card bg-[#F7F7F7] flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">
                        Selected service
                      </p>
                      <p className="text-base font-bold text-black">{form.serviceName}</p>
                    </div>
                    <button
                      onClick={() => setStep(1)}
                      className="text-xs text-[#FF5C00] hover:underline"
                    >
                      Change
                    </button>
                  </div>

                  {/* Quantity */}
                  <div className="space-y-2">
                    <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      <span className="text-[#FF5C00]">01</span> Quantity
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => update('quantity', Math.max(1, form.quantity - 1))}
                        className="w-10 h-10 rounded-md border border-[#EAEAEA] text-black hover:border-black transition-colors flex items-center justify-center"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={form.quantity}
                        onChange={(e) => update('quantity', Math.max(1, parseInt(e.target.value) || 1))}
                        className="form-input w-24 text-center font-mono"
                      />
                      <button
                        onClick={() => update('quantity', form.quantity + 1)}
                        className="w-10 h-10 rounded-md border border-[#EAEAEA] text-black hover:border-black transition-colors flex items-center justify-center"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* SLA */}
                  <div className="space-y-2">
                    <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      <span className="text-[#FF5C00]">02</span> Lead Time
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => update('sla', 'Standard')}
                        className={`card text-left transition-all ${
                          form.sla === 'Standard'
                            ? 'border-[#FF5C00] ring-1 ring-[#FF5C00]'
                            : ''
                        }`}
                      >
                        <p className="text-sm font-bold text-black">Standard</p>
                        <p className="text-xs text-[#666666] mt-1">
                          Best price. 3–5 day turnaround.
                        </p>
                      </button>
                      <button
                        onClick={() => update('sla', 'Express')}
                        className={`card text-left transition-all ${
                          form.sla === 'Express'
                            ? 'border-[#FF5C00] ring-1 ring-[#FF5C00]'
                            : ''
                        }`}
                      >
                        <p className="text-sm font-bold text-black">Express</p>
                        <p className="text-xs text-[#666666] mt-1">
                          24–48 hour turnaround. Surcharge applies.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Design file */}
                  <div className="space-y-2">
                    <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      <span className="text-[#FF5C00]">03</span> Design File
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".svg,.ai,.eps,.dxf,.pdf,.png,.jpg,.jpeg"
                        onChange={handleFile}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-outline"
                      >
                        {form.designFileName ? '✓ ' + form.designFileName : 'Choose File'}
                      </button>
                      <input
                        type="url"
                        value={form.designFileUrl}
                        onChange={(e) => update('designFileUrl', e.target.value)}
                        placeholder="Or paste a public URL (Drive, Dropbox…)"
                        className="form-input flex-1"
                      />
                    </div>
                    <p className="text-[11px] text-[#888888]">
                      Accepted: SVG, AI, EPS, DXF, PDF, PNG, JPG. We&apos;ll follow up by email if needed.
                    </p>
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      <span className="text-[#FF5C00]">04</span> Notes (optional)
                    </label>
                    <textarea
                      rows={3}
                      value={form.customerNotes}
                      onChange={(e) => update('customerNotes', e.target.value)}
                      placeholder="Material specs, dimensions, special instructions…"
                      className="form-input resize-none"
                    />
                  </div>
                </div>
              </div>
            </ScrollReveal>
          )}

          {/* ──────── Step 3: Delivery ──────── */}
          {step === 3 && (
            <ScrollReveal>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-black mb-1">
                  Delivery preferences
                </h2>
                <p className="text-sm text-[#666666] mb-6">
                  Pickup at our Ogba workshop or dispatch within Lagos.
                </p>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => update('deliveryMethod', 'PICKUP')}
                      className={`card text-left transition-all ${
                        form.deliveryMethod === 'PICKUP'
                          ? 'border-[#FF5C00] ring-1 ring-[#FF5C00]'
                          : ''
                      }`}
                    >
                      <p className="text-sm font-bold text-black">Pickup</p>
                      <p className="text-xs text-[#666666] mt-1">
                        Free. Collect from Wempco Rd, Ogba, Ikeja.
                      </p>
                    </button>
                    <button
                      onClick={() => update('deliveryMethod', 'DELIVERY')}
                      className={`card text-left transition-all ${
                        form.deliveryMethod === 'DELIVERY'
                          ? 'border-[#FF5C00] ring-1 ring-[#FF5C00]'
                          : ''
                      }`}
                    >
                      <p className="text-sm font-bold text-black">Delivery</p>
                      <p className="text-xs text-[#666666] mt-1">
                        Lagos-wide dispatch. Fee calculated at checkout.
                      </p>
                    </button>
                  </div>

                  {form.deliveryMethod === 'DELIVERY' && (
                    <div className="space-y-2">
                      <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                        <span className="text-[#FF5C00]">01</span> Delivery Address
                      </label>
                      <textarea
                        rows={3}
                        value={form.deliveryAddress}
                        onChange={(e) => update('deliveryAddress', e.target.value)}
                        placeholder="Full address — street, area, city, landmarks…"
                        className="form-input resize-none"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      <span className="text-[#FF5C00]">02</span> Referral Code (optional)
                    </label>
                    <input
                      type="text"
                      value={form.referralCode}
                      onChange={(e) => update('referralCode', e.target.value.toUpperCase())}
                      placeholder="e.g. FRIEND10"
                      className="form-input font-mono uppercase"
                    />
                    {referralValid && (
                      <p className={`text-xs ${referralValid.valid ? 'text-[#FF5C00]' : 'text-[#E05200]'}`}>
                        {referralValid.valid
                          ? `✓ Valid${referralValid.referrer ? ` — referred by ${referralValid.referrer}` : ''}${referralValid.reward ? ` · ${formatNaira(referralValid.reward)} off` : ''}`
                          : '✗ Invalid or expired code.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </ScrollReveal>
          )}

          {/* ──────── Step 4: Customer ──────── */}
          {step === 4 && (
            <ScrollReveal>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-black mb-1">
                  Your details
                </h2>
                <p className="text-sm text-[#666666] mb-6">
                  Where we&apos;ll send the quote and order updates.
                </p>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      <span className="text-[#FF5C00]">01</span> Full Name
                    </label>
                    <input
                      type="text"
                      value={form.customerName}
                      onChange={(e) => update('customerName', e.target.value)}
                      placeholder="Company or individual"
                      className="form-input"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      <span className="text-[#FF5C00]">02</span> Phone Number
                    </label>
                    <input
                      type="tel"
                      value={form.customerPhone}
                      onChange={(e) => update('customerPhone', e.target.value)}
                      placeholder="0803 500 3068"
                      className="form-input"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      <span className="text-[#FF5C00]">03</span> Email
                    </label>
                    <input
                      type="email"
                      value={form.customerEmail}
                      onChange={(e) => update('customerEmail', e.target.value)}
                      placeholder="you@example.com"
                      className="form-input"
                      required
                    />
                  </div>
                </div>
              </div>
            </ScrollReveal>
          )}

          {/* ──────── Step 5: Review ──────── */}
          {step === 5 && (
            <ScrollReveal>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-black mb-1">
                  Review &amp; pay
                </h2>
                <p className="text-sm text-[#666666] mb-6">
                  Confirm everything looks right, then submit.
                </p>

                <div className="space-y-4">
                  <div className="card">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-3">
                      Service
                    </p>
                    <p className="text-base font-bold text-black">{form.serviceName}</p>
                    <p className="text-xs text-[#666666] mt-1">
                      Qty {form.quantity} · {form.sla}
                    </p>
                  </div>
                  <div className="card">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-3">
                      Delivery
                    </p>
                    <p className="text-sm text-black">
                      {form.deliveryMethod === 'PICKUP'
                        ? 'Pickup — Wempco Rd, Ogba, Ikeja, Lagos'
                        : `Delivery to ${form.deliveryAddress}`}
                    </p>
                    {form.referralCode && (
                      <p className="text-xs text-[#FF5C00] mt-1">
                        Referral: {form.referralCode}{' '}
                        {referralValid?.valid ? '✓' : '✗'}
                      </p>
                    )}
                  </div>
                  <div className="card">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-3">
                      Customer
                    </p>
                    <div className="space-y-1 text-sm text-black">
                      <p>{form.customerName}</p>
                      <p className="font-mono text-xs">{form.customerPhone}</p>
                      <p className="text-xs">{form.customerEmail}</p>
                    </div>
                  </div>
                  {(form.designFileUrl || form.designFileName || form.customerNotes) && (
                    <div className="card">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-3">
                        Design & Notes
                      </p>
                      {form.designFileName && (
                        <p className="text-sm text-black">📎 {form.designFileName}</p>
                      )}
                      {form.designFileUrl && (
                        <p className="text-xs text-[#FF5C00] truncate mt-1">
                          {form.designFileUrl}
                        </p>
                      )}
                      {form.customerNotes && (
                        <p className="text-xs text-[#666666] mt-2 whitespace-pre-wrap">
                          {form.customerNotes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ScrollReveal>
          )}

          {/* Error */}
          {error && (
            <div className="mt-6 border border-[#FF5C00]/30 bg-[#FF5C00]/5 px-4 py-3 rounded text-sm text-[#E05200]">
              {error}
            </div>
          )}

          {/* Nav buttons */}
          <div className="mt-8 flex items-center justify-between gap-3">
            {step > 1 ? (
              <button onClick={prev} className="btn-outline" disabled={submitting}>
                ← Back
              </button>
            ) : (
              <Link href="/" className="btn-outline">
                ← Cancel
              </Link>
            )}

            {step < 5 ? (
              <button onClick={next} className="btn-primary">
                Continue →
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={submitting || quoteLoading}
                className="btn-primary disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : quote ? `Pay ${formatNaira(quote.quoteNaira)}` : 'Submit Order'}
              </button>
            )}
          </div>
        </div>

        {/* Side panel — live quote */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 space-y-4">
            <div className="card">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#888888] mb-4">
                Live Quote
              </p>

              {quoteLoading ? (
                <div className="flex items-center gap-2 text-sm text-[#666666]">
                  <div className="w-4 h-4 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
                  Recalculating…
                </div>
              ) : quote ? (
                <div>
                  <p className="text-3xl font-bold text-black mb-1">
                    {formatNaira(quote.quoteNaira)}
                  </p>
                  <p className="text-xs text-[#666666] mb-4">
                    {form.quantity} × {form.serviceName} · {form.sla}
                  </p>

                  {quote.breakdown && (
                    <div className="space-y-2 pt-3 border-t border-[#EAEAEA]">
                      {quote.breakdown.basePrice != null && (
                        <div className="flex justify-between text-xs">
                          <span className="text-[#666666]">Base</span>
                          <span className="text-black">{formatNaira(quote.breakdown.basePrice as number)}</span>
                        </div>
                      )}
                      {quote.breakdown.expressSurcharge ? (
                        <div className="flex justify-between text-xs">
                          <span className="text-[#666666]">Express</span>
                          <span className="text-black">+{formatNaira(quote.breakdown.expressSurcharge as number)}</span>
                        </div>
                      ) : null}
                      {quote.breakdown.deliveryFee ? (
                        <div className="flex justify-between text-xs">
                          <span className="text-[#666666]">Delivery</span>
                          <span className="text-black">+{formatNaira(quote.breakdown.deliveryFee as number)}</span>
                        </div>
                      ) : null}
                      {quote.breakdown.discount ? (
                        <div className="flex justify-between text-xs">
                          <span className="text-[#666666]">Discount</span>
                          <span className="text-[#FF5C00]">−{formatNaira(quote.breakdown.discount as number)}</span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[#888888]">
                  {form.serviceType
                    ? 'Calculating…'
                    : 'Select a service to see pricing.'}
                </p>
              )}
            </div>

            <div className="card bg-[#0D0D0D] text-white">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#888888] mb-2">
                Need help?
              </p>
              <p className="text-sm text-[#CCCCCC] mb-4 leading-relaxed">
                Not sure about quantities or materials? Chat with us first.
              </p>
              <Link
                href="/chat"
                className="text-xs text-[#FF5C00] hover:underline font-medium"
              >
                Open chat →
              </Link>
            </div>

            <div className="text-xs text-[#888888] px-2 leading-relaxed">
              By submitting you agree to our{' '}
              <Link href="/terms" className="underline hover:text-black">
                Terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="underline hover:text-black">
                Privacy Policy
              </Link>
              . Payment is processed securely via Paystack.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
