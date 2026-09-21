'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScrollReveal } from '@/components/ScrollReveal';
import { AvailabilityLine } from '@/components/AvailabilityLine';
import { AddressPicker } from '@/components/AddressPicker';
import { DesignFileThumbs } from '@/components/DesignFilePreview';
import { usePaberinAuth } from '@/lib/auth';
import {
  api,
  formatNaira,
  formatDate,
  type Service,
  type QuoteResponse,
  type Order,
  type ChatResponse,
} from '@/lib/api';
import { buildChatOrderNotes } from '@/lib/chat-order';
import type { ChatSpecs } from '@/lib/chat';
import {
  buildQuotePayload,
  buildOrderPayload,
  isValidNigerianPhone,
  isValidRequestedPickupTime,
  pickupTimeError,
  defaultRequestedPickupTime,
  pickupTimeParts,
  pickupTimeFromParts,
  lagosDateISO,
  formatPickupLabel,
  optionInputModel,
  summarizeOptionErrors,
  validateOptionValues,
  hasChoiceImages,
} from '@/lib/order-form';
import {
  type BusinessCalendar,
  DEFAULT_BUSINESS_CALENDAR,
  fmtClock,
  getBusinessCalendar,
} from '@/lib/business-calendar';
import { fontStack, previewTextFor } from '@/lib/print-fonts';
import { usePreviewFonts } from '@/lib/preview-fonts';

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
  /** REQUIRED by the backend (ISO) — future, working day (Mon–Fri minus
   *  observed public holidays), within the configured hours, ≤30 days. */
  requestedPickupTime: string;
  /** Legacy flat options list → single dropdown value (string). */
  selectedVariant: string;
  /** Structured optionFields values, keyed by field key. */
  selectedOptions: Record<string, string | number>;
  customerNotes: string;
  deliveryMethod: 'PICKUP' | 'LOCAL_DELIVERY';
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
  requestedPickupTime: '',
  selectedVariant: '',
  selectedOptions: {},
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

function OrderPageInner() {
  const router = useRouter();
  const { customer } = usePaberinAuth();
  const [step, setStep] = useState<Step>(1);
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialState);
  // Configurable business calendar (open/close + observed public holidays).
  const [cal, setCal] = useState<BusinessCalendar>(DEFAULT_BUSINESS_CALENDAR);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [referralValid, setReferralValid] = useState<null | { valid: boolean; reward?: number; referrer?: string }>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [uploadFiles, setUploadFiles] = useState<{ name: string; data: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Phone validation lives in @/lib/order-form (isValidNigerianPhone) so the
   * widget and the unit tests share one implementation. The backend accepts
   * ONLY Nigerian formats — 11 digits `0[789][01]XXXXXXXX` or 13 digits
   * `234[789][01]XXXXXXXX` (leading +, spaces, dashes, parens tolerated).
   * An invalid number (e.g. "123") is caught here instead of bouncing back
   * from the server with INVALID_PHONE.
   */
  const isValidPhone = isValidNigerianPhone;

  // Custom job mode ("Something else" / chat handoff with no catalog match):
  // describe the job, we price it via rules or confirm pricing quickly.
  const [customMode, setCustomMode] = useState(false);
  const [customDescription, setCustomDescription] = useState('');
  const [customMaterial, setCustomMaterial] = useState('');
  const [customDimensions, setCustomDimensions] = useState('');

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

  // Default pickup time — the backend REQUIRES requestedPickupTime on every
  // quote/order. Prefill now + 2 working days at one hour before closing
  // (16:00 Lagos by default) within the CONFIGURED business calendar (custom
  // hours + observed public holidays), so the live quote works immediately.
  // Client-side only (effect) so the SSR markup stays hydration-clean.
  useEffect(() => {
    let live = true;
    getBusinessCalendar().then((cal) => {
      if (!live) return;
      setCal(cal);
      setForm((prev) =>
        prev.requestedPickupTime
          ? prev
          : { ...prev, requestedPickupTime: defaultRequestedPickupTime(Date.now(), cal) }
      );
    });
    return () => {
      live = false;
    };
  }, []);

  // Reorder prefill: when the dashboard sends ?service=…&qty=…, look up
  // the matching service, apply it + the quantity, and jump straight to
  // the Details step so the customer can review and submit quickly.
  const searchParams = useSearchParams();
  const reorderApplied = useRef(false);
  useEffect(() => {
    if (reorderApplied.current) return;
    if (servicesLoading || services.length === 0) return;
    const svc = searchParams.get('service');
    const qty = searchParams.get('qty');
    if (!svc) return;
    const match = services.find((s) => s.type === svc);
    if (!match) return;
    reorderApplied.current = true;
    setForm((prev) => ({
      ...prev,
      serviceType: match.type,
      serviceName: match.label,
      quantity: qty ? Math.max(1, parseInt(qty, 10) || 1) : prev.quantity,
    }));
    setStep(2);
  }, [searchParams, servicesLoading, services]);

  // Chat specs prefill + custom-mode entry: when coming from /chat with
  // ?from=chat&specs={...}, pre-fill the catalog service EXACTLY (no fuzzy
  // mapping — the AI's service_type is authoritative) or open custom mode
  // when the job has no catalog match. ?custom=1 opens custom mode directly.
  const chatPrefillApplied = useRef(false);
  useEffect(() => {
    if (chatPrefillApplied.current) return;
    if (servicesLoading || services.length === 0) return;
    const from = searchParams.get('from');
    const specsRaw = searchParams.get('specs');
    if (searchParams.get('custom') === '1') {
      chatPrefillApplied.current = true;
      setCustomMode(true);
      setStep(2);
      return;
    }
    if (from !== 'chat' || !specsRaw) return;
    try {
      const specs = JSON.parse(specsRaw) as ChatSpecs;
      chatPrefillApplied.current = true;
      // A valid pickup time given in chat wins over the default.
      const pickupTime =
        specs.requested_pickup_time && isValidRequestedPickupTime(specs.requested_pickup_time, Date.now(), cal)
          ? specs.requested_pickup_time
          : undefined;
      if (specs.service_type) {
        const match = services.find((s) => s.type === specs.service_type);
        setForm((prev) => ({
          ...prev,
          serviceType: match?.type || prev.serviceType,
          serviceName: match?.label || prev.serviceName,
          quantity: specs.quantity > 0 ? specs.quantity : 1,
          sla: specs.sla === 'Express' ? 'Express' : 'Standard',
          deliveryMethod: specs.delivery === 'LOCAL_DELIVERY' ? 'LOCAL_DELIVERY' : 'PICKUP',
          deliveryAddress: specs.delivery_address || prev.deliveryAddress,
          customerNotes: buildChatOrderNotes(specs, searchParams.get('context')) || prev.customerNotes,
          ...(pickupTime ? { requestedPickupTime: pickupTime } : {}),
        }));
      } else {
        setCustomMode(true);
        setCustomDescription(specs.custom_description || '');
        setCustomMaterial(specs.material || '');
        setCustomDimensions('');
        setForm((prev) => ({
          ...prev,
          quantity: specs.quantity > 0 ? specs.quantity : 1,
          customerNotes: buildChatOrderNotes(specs, searchParams.get('context')) || prev.customerNotes,
          ...(pickupTime ? { requestedPickupTime: pickupTime } : {}),
        }));
      }
      // Always jump to step 2 so they can review and adjust
      setStep(2);
    } catch {
      // Specs parse failed — let user fill manually
    }
  }, [searchParams, servicesLoading, services, cal]);

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

  const updateOption = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, selectedOptions: { ...prev.selectedOptions, [key]: value } }));
  };

  const selectService = (s: Service) => {
    update('serviceType', s.type);
    update('serviceName', s.label);
    // Options are per-service — reset stale selections when switching.
    setForm((prev) => ({ ...prev, selectedVariant: '', selectedOptions: {} }));
    setCustomMode(false);
    setStep(2);
  };

  const selectedService = services.find((s) => s.type === form.serviceType) || null;

  // Structured option validation (required / min / max / maxLength / choices)
  // and the pickup picker's date/time parts — both derived fresh each render.
  const hasStructuredOptions = (selectedService?.optionFields?.length ?? 0) > 0;
  // Legacy dropdown only applies when there are NO structured fields — the
  // payload builders send selectedOptions whenever optionFields exist.
  const hasLegacyOptions = (selectedService?.options?.length ?? 0) > 0 && !hasStructuredOptions;
  const optionErrors = validateOptionValues(selectedService?.optionFields, form.selectedOptions);
  // Preview stylesheet only when this service actually offers fonts.
  const offersFonts = (selectedService?.optionFields ?? []).some((f) => f.type === 'font');
  usePreviewFonts(!customMode && offersFonts);
  const pickupParts = pickupTimeParts(form.requestedPickupTime);
  const pickupErrorMsg = form.requestedPickupTime ? pickupTimeError(form.requestedPickupTime, Date.now(), cal) : null;
  const optionSummary: string[] = [];
  if (!customMode) {
    if (form.selectedVariant) optionSummary.push(form.selectedVariant);
    for (const field of selectedService?.optionFields ?? []) {
      const v = form.selectedOptions[field.key];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        optionSummary.push(`${field.label}: ${String(v).trim()}`);
      }
    }
  }

  // Live quote — refetch whenever inputs that affect price change.
  // The backend REQUIRES requestedPickupTime and complete option fields, so
  // we only call the engine when the form already satisfies the contract —
  // otherwise the request would 400 (REQUESTED_PICKUP_REQUIRED etc.).
  const fetchQuote = useCallback(async () => {
    if (customMode) return; // custom jobs are priced by the team (QUOTING), not the engine
    if (!form.serviceType || !form.quantity) return;
    if (!isValidRequestedPickupTime(form.requestedPickupTime, Date.now(), cal)) {
      setQuote(null);
      return;
    }
    if (hasStructuredOptions && !optionErrors.valid) {
      setQuote(null); // don't keep showing the previous service's price
      return;
    }
    if (hasLegacyOptions && !form.selectedVariant) {
      setQuote(null);
      return;
    }
    setQuoteLoading(true);
    try {
      const q = await api.getQuote(
        buildQuotePayload({
          service: selectedService,
          serviceType: form.serviceType,
          quantity: form.quantity,
          sla: form.sla,
          requestedPickupTime: form.requestedPickupTime,
          selectedVariant: form.selectedVariant || undefined,
          selectedOptions: form.selectedOptions,
          deliveryMethod: form.deliveryMethod,
          deliveryAddress: form.deliveryMethod === 'LOCAL_DELIVERY' ? form.deliveryAddress.trim() || undefined : undefined,
          deliveryDistanceKm: form.deliveryMethod === 'LOCAL_DELIVERY' && form.deliveryAddress ? 10 : undefined,
          referralCode: form.referralCode || undefined,
          isFirstTimeCustomer: customer?.isNew || false,
        })
      );
      setQuote(q);
    } catch (err: any) {
      // Quote failures shouldn't block navigation — just clear the quote
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [customMode, form.serviceType, form.quantity, form.sla, form.deliveryMethod, form.deliveryAddress, form.referralCode, form.requestedPickupTime, form.selectedVariant, form.selectedOptions, selectedService, hasStructuredOptions, hasLegacyOptions, optionErrors.valid, customer?.isNew, cal]);

  useEffect(() => {
    if (step >= 2 && form.serviceType) {
      const t = setTimeout(fetchQuote, 350);
      return () => clearTimeout(t);
    }
  }, [fetchQuote, step, form.serviceType]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const selectedFiles = Array.from(input.files || []);
    // Picker cancelled — keep the files already selected.
    if (selectedFiles.length === 0) return;
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const okFiles = selectedFiles.filter((f) => f.size <= MAX_FILE_SIZE);
    const skipped = selectedFiles.length - okFiles.length;
    if (skipped > 0) alert(`${skipped} file${skipped > 1 ? 's' : ''} skipped — max 10MB each.`);
    if (okFiles.length === 0) return;
    if (uploadFiles.length + okFiles.length > 5) {
      alert('Maximum 5 files allowed. Remove some before adding more.');
      return;
    }
    // Read the new batch as base64, then APPEND it to the existing selection
    // (previously this REPLACED the list, so adding files after the first
    // pick lost earlier ones).
    const pending = okFiles.length;
    let loaded = 0;
    const newFiles: { name: string; data: string }[] = [];
    for (const file of okFiles) {
      const reader = new FileReader();
      reader.onload = () => {
        newFiles.push({ name: file.name, data: reader.result as string });
        loaded++;
        if (loaded === pending) {
          setUploadFiles((prev) => [...prev, ...newFiles]);
          // Reset the input so the same file can be re-picked later.
          input.value = '';
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const canProceed = (): boolean => {
    if (step === 1) return customMode || !!form.serviceType;
    if (step === 2) {
      // Pickup time is REQUIRED by the backend (custom jobs included).
      if (!isValidRequestedPickupTime(form.requestedPickupTime, Date.now(), cal)) return false;
      if (!customMode) {
        if (hasStructuredOptions && !optionErrors.valid) return false;
        if (hasLegacyOptions && !form.selectedVariant) return false;
      }
      if (customMode) {
        return !!customDescription.trim() && form.quantity > 0;
      }
      return form.quantity > 0 && (uploadFiles.length > 0 || !!form.customerNotes);
    }
    if (step === 3) {
      if (form.deliveryMethod === 'LOCAL_DELIVERY') return !!form.deliveryAddress.trim();
      return true;
    }
    if (step === 4) {
      // Email is optional (the field is labelled as such): require it only in
      // the sense that IF one is typed it must look like an address. A blank
      // value is a valid choice — the backend accepts it and the customer is
      // reached by phone, which is the identity we actually use.
      const email = form.customerEmail.trim();
      return (
        !!form.customerName.trim() &&
        isValidPhone(form.customerPhone) &&
        (email === '' || /^\S+@\S+\.\S+$/.test(email))
      );
    }
    return true;
  };

  const next = () => {
    setError(null);
    if (!canProceed()) {
      let message = 'Please complete all required fields before continuing.';
      if (step === 2 && !isValidRequestedPickupTime(form.requestedPickupTime, Date.now(), cal)) {
        message = pickupTimeError(form.requestedPickupTime, Date.now(), cal) || 'Please choose a valid pickup date & time.';
      } else if (step === 2 && !customMode && hasStructuredOptions && !optionErrors.valid) {
        // Name the field(s): "Please complete all required options" told the
        // customer nothing about WHICH one was empty.
        message = summarizeOptionErrors(optionErrors.errors) ?? 'Please complete all required options.';
      } else if (step === 2 && !customMode && hasLegacyOptions && !form.selectedVariant) {
        message = 'Please choose an option before continuing.';
      } else if (step === 4 && !isValidPhone(form.customerPhone)) {
        message = 'Please enter a valid Nigerian phone number (e.g. 0806 000 0000).';
      }
      setError(message);
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
    // Defence in depth: the wizard's step gate should make this unreachable.
    if (!customMode && hasStructuredOptions && !optionErrors.valid) {
      setError(summarizeOptionErrors(optionErrors.errors) ?? 'Please complete all required options.');
      return;
    }
    setSubmitting(true);
    try {
      // Step 0: Upload design files to Cloudinary (best-effort, non-blocking)
      const MAX_FILES = 5;
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      const MAX_TOTAL_SIZE = 25 * 1024 * 1024;

      let designFileUrl: string | undefined;
      const uploadedFiles: { url: string; publicId: string; name: string }[] = [];

      if (uploadFiles.length > MAX_FILES) {
        setError(`Maximum ${MAX_FILES} files allowed.`);
        setSubmitting(false);
        return;
      }
      const totalSize = uploadFiles.reduce((s, f) => s + f.data.length, 0);
      if (totalSize > MAX_TOTAL_SIZE) {
        setError(`Total file size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds the 25MB limit.`);
        setSubmitting(false);
        return;
      }

      for (const file of uploadFiles) {
        if (file.data.length > MAX_FILE_SIZE) continue;
        try {
          const API_URL2 = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://skyalxpaberin-admin.vercel.app';
          const uploadRes = await fetch(`${API_URL2}/api/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: file.data, folder: 'paberin-designs' }),
          });
          const ct = uploadRes.headers.get('content-type') || '';
          if (uploadRes.ok && ct.includes('application/json')) {
            const uploadData = await uploadRes.json();
            if (uploadData.data?.url) {
              uploadedFiles.push({ url: uploadData.data.url, publicId: uploadData.data.publicId || '', name: file.name });
            }
          }
        } catch { /* individual upload failure is non-blocking */ }
      }

      if (uploadedFiles.length > 0) {
        designFileUrl = JSON.stringify(uploadedFiles.map(f => ({ url: f.url, publicId: f.publicId, name: f.name })));
      }

      const order = await api.createOrder(
        buildOrderPayload({
          service: selectedService,
          serviceType: form.serviceType,
          quantity: form.quantity,
          sla: form.sla,
          requestedPickupTime: form.requestedPickupTime,
          selectedVariant: form.selectedVariant || undefined,
          selectedOptions: form.selectedOptions,
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          customerEmail: form.customerEmail,
          deliveryMethod: form.deliveryMethod,
          deliveryAddress: form.deliveryMethod === 'LOCAL_DELIVERY' ? form.deliveryAddress : undefined,
          designFileUrl,
          // Customer notes contain ONLY the notes — file names travel in designFileUrl.
          customerNotes: form.customerNotes.trim() || undefined,
          referralCode: form.referralCode || undefined,
          isFirstTimeCustomer: customer?.isNew || false,
          customSpec: customMode
            ? {
                description: customDescription.trim(),
                material: customMaterial.trim() || undefined,
                dimensions: customDimensions.trim() || undefined,
                complexity: 'simple',
              }
            : undefined,
        })
      );
      setCreatedOrder(order);
      // Provisional QUOTING orders (unpriced custom jobs) skip payment until
      // the team confirms the price — the customer pays from the dashboard.
      if (order.state !== 'QUOTING') {
        await startPayment(order);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not submit order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /** Initialize Paystack payment and redirect to checkout. */
  const startPayment = useCallback(async (order: Order) => {
    setPaymentError(null);
    try {
      const pay = await api.initializePayment({
        amount: order.totalAmount,
        email: form.customerEmail,
        orderNumber: order.orderNumber,
        brand: 'PABERIN',
        metadata: { orderNumber: order.orderNumber, brand: 'PABERIN' },
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://paberin.vercel.app'}/order/complete?order=${order.orderNumber}`,
      });
      // Redirect to Paystack checkout
      const payData = pay as any;
      const authUrl = payData?.authorizationUrl || payData?.authorization_url;
      if (authUrl) {
        window.location.href = authUrl;
        return;
      }
      console.warn('Payment init succeeded but no authorization URL returned:', payData);
      setPaymentError('Payment could not be started — no checkout link returned. Use the button below to retry.');
    } catch (payErr: any) {
      // Order is already created — surface the failure so the customer can retry
      console.warn('Payment init failed:', payErr);
      setPaymentError(payErr?.message || 'Payment could not be initialized. Use the button below to retry.');
    }
  }, [form.customerEmail]);

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
              {createdOrder.state === 'QUOTING' ? (
                <>
                  Your order <span className="font-mono text-black">{createdOrder.orderNumber}</span>{' '}
                  is in — we&apos;re confirming the exact price now. You&apos;ll get a notification,
                  then just review and pay.
                </>
              ) : (
                <>
                  Your order <span className="font-mono text-black">{createdOrder.orderNumber}</span> is
                  queued. We&apos;ll review your design and confirm by email within 4 hours.
                  Track progress any time.
                </>
              )}
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
          {paymentError && (
            <ScrollReveal delay={0.35}>
              <div className="mt-8 p-4 border border-red-200 bg-red-50 rounded-lg text-left">
                <p className="text-sm text-red-700 mb-3">{paymentError}</p>
                <button
                  onClick={() => startPayment(createdOrder)}
                  className="btn-primary w-full justify-center"
                >
                  Retry Payment
                </button>
              </div>
            </ScrollReveal>
          )}
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
                  {customMode ? (
                    <div className="card col-span-full bg-[#FFF7F0] border-[#FFD9BF]">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#E05200] mb-2">
                        Custom job mode
                      </p>
                      <p className="text-sm text-[#666666] mb-4 leading-relaxed">
                        You&apos;re ordering a bespoke job (from chat or the &ldquo;Something else&rdquo; option).
                        Describe it on the next step — we&apos;ll confirm the exact price quickly.
                      </p>
                      <button
                        onClick={() => { setCustomMode(false); setStep(1); }}
                        className="text-xs text-[#FF5C00] hover:underline"
                      >
                        ← Browse catalog services instead
                      </button>
                    </div>
                  ) : (
                    services.map((s) => (
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
                    ))
                  )}
                </div>

                {!customMode && (
                  <button
                    onClick={() => {
                      // Clear any catalog selection — a custom job is priced
                      // by the team (QUOTING), never against a catalog service.
                      setForm((prev) => ({
                        ...prev,
                        serviceType: '',
                        serviceName: '',
                        selectedVariant: '',
                        selectedOptions: {},
                      }));
                      setQuote(null);
                      setCustomMode(true);
                      setStep(2);
                    }}
                    className="card w-full text-left hover-lift transition-all border-dashed mt-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-base font-bold text-black mb-1">Something else / custom job</p>
                        <p className="text-xs text-[#666666] leading-relaxed">
                          Cutting jeans, engraving wood, a bespoke piece? Describe it and we&apos;ll
                          confirm the exact price fast.
                        </p>
                      </div>
                      <span className="text-[#FF5C00] text-xl">→</span>
                    </div>
                  </button>
                )}
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
                  {/* Service summary OR custom-job description fields */}
                  {customMode ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                          <span className="text-[#FF5C00]">A</span> What do you need?
                        </label>
                        <textarea
                          rows={3}
                          value={customDescription}
                          onChange={(e) => setCustomDescription(e.target.value)}
                          placeholder="e.g. Cut my jeans into a pattern · Engrave a wooden tray · A bespoke acrylic sign…"
                          className="form-input resize-none"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                            <span className="text-[#FF5C00]">B</span> Material (optional)
                          </label>
                          <input
                            type="text"
                            value={customMaterial}
                            onChange={(e) => setCustomMaterial(e.target.value)}
                            placeholder="denim, wood, acrylic…"
                            className="form-input"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                            <span className="text-[#FF5C00]">C</span> Size / notes (optional)
                          </label>
                          <input
                            type="text"
                            value={customDimensions}
                            onChange={(e) => setCustomDimensions(e.target.value)}
                            placeholder="waist 34, length 40…"
                            className="form-input"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
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
                  )}

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
                        disabled={!!selectedService && !selectedService.allowExpress}
                        className={`card text-left transition-all ${
                          form.sla === 'Express'
                            ? 'border-[#FF5C00] ring-1 ring-[#FF5C00]'
                            : ''
                        } ${selectedService && !selectedService.allowExpress ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <p className="text-sm font-bold text-black">Express</p>
                        <p className="text-xs text-[#666666] mt-1">
                          {selectedService && !selectedService.allowExpress
                            ? 'Not available for this service.'
                            : '24–48 hour turnaround. Surcharge applies.'}
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Options — structured optionFields OR legacy options dropdown */}
                  {!customMode && selectedService?.optionFields && selectedService.optionFields.length > 0 && (
                    <div className="space-y-2">
                      <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                        <span className="text-[#FF5C00]">03</span> Options
                      </label>
                      <div className="space-y-4">
                        {selectedService.optionFields.map((field) => {
                          const model = optionInputModel(field);
                          const raw = form.selectedOptions[field.key];
                          const value = raw === undefined || raw === null ? '' : String(raw);
                          const fieldError = optionErrors.errors[field.key];
                          const fieldLabel = (
                            <label className="text-xs font-medium text-black">
                              {field.label}
                              {field.required ? ' *' : ''}
                            </label>
                          );
                          if (model.kind === 'font') {
                            // Each name is shown IN ITS OWN FACE — that is the
                            // comparison the customer is here to make — and the
                            // preview below re-renders as they type their text.
                            const previewText = previewTextFor(selectedService?.optionFields, form.selectedOptions);
                            return (
                              <div key={field.key} className="space-y-2">
                                {fieldLabel}
                                <div
                                  role="radiogroup"
                                  aria-label={field.label}
                                  className="grid grid-cols-2 sm:grid-cols-3 gap-2"
                                >
                                  {model.choices.map((c) => {
                                    const selected = value === c.value;
                                    return (
                                      <button
                                        key={c.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        onClick={() => updateOption(field.key, c.value)}
                                        style={{ fontFamily: fontStack(c.value) }}
                                        className={`card px-3 py-3 text-lg leading-tight text-left transition-all ${
                                          selected ? 'border-[#FF5C00] ring-1 ring-[#FF5C00]' : ''
                                        }`}
                                      >
                                        {c.value}
                                      </button>
                                    );
                                  })}
                                </div>
                                {model.choices.some((c) => c.value === value) && (
                                  <div className="border border-[#EAEAEA] bg-[#F7F7F7] px-4 py-5">
                                    <p className="font-mono text-[10px] uppercase tracking-wider text-[#888888]">
                                      Your text in {value}
                                    </p>
                                    <p
                                      data-testid="font-preview"
                                      style={{ fontFamily: fontStack(value) }}
                                      className="mt-2 text-3xl sm:text-4xl leading-tight text-black break-words"
                                    >
                                      {previewText}
                                    </p>
                                    <p className="mt-2 text-xs text-[#888888]">
                                      A guide, not a proof — your operator sets the final size and spacing.
                                    </p>
                                  </div>
                                )}
                                {fieldError && <p className="text-xs text-[#E05200]">{fieldError}</p>}
                              </div>
                            );
                          }
                          if (model.kind === 'select') {
                            // Choice grid when any choice has an image — thumbnails
                            // are only actually visible this way (a native <select>
                            // can't show <img> in <option>). Plain select otherwise.
                            if (hasChoiceImages(model.choices)) {
                              return (
                                <div key={field.key} className="space-y-2">
                                  {fieldLabel}
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {model.choices.map((c) => {
                                      const selected = value === c.value;
                                      return (
                                        <button
                                          key={c.value}
                                          type="button"
                                          onClick={() => updateOption(field.key, c.value)}
                                          aria-pressed={selected}
                                          className={`card text-left transition-all flex flex-col items-center gap-2 p-2 sm:p-3 ${
                                            selected
                                              ? 'border-[#FF5C00] ring-1 ring-[#FF5C00]'
                                              : ''
                                          }`}
                                        >
                                          {c.image ? (
                                            /* eslint-disable-next-line @next/next/no-img-element -- choice images are arbitrary admin-hosted URLs; next/image remotePatterns can't enumerate them */
                                            <img
                                              src={c.image}
                                              alt=""
                                              loading="lazy"
                                              referrerPolicy="no-referrer"
                                              className="w-full aspect-square object-cover rounded-md border border-[#EAEAEA] bg-[#F7F7F7]"
                                            />
                                          ) : (
                                            <div className="w-full aspect-square rounded-md border border-[#EAEAEA] bg-[#F7F7F7] flex items-center justify-center">
                                              <span className="font-mono text-[10px] uppercase tracking-wider text-[#888888]">
                                                —
                                              </span>
                                            </div>
                                          )}
                                          <span className="text-xs font-medium text-black text-center leading-tight">
                                            {c.value}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {fieldError && <p className="text-xs text-[#E05200]">{fieldError}</p>}
                                </div>
                              );
                            }
                            return (
                              <div key={field.key} className="space-y-1">
                                {fieldLabel}
                                <select
                                  value={value}
                                  onChange={(e) => updateOption(field.key, e.target.value)}
                                  className="form-input"
                                >
                                  <option value="">Select…</option>
                                  {model.choices.map((c) => (
                                    <option key={c.value} value={c.value}>
                                      {c.value}
                                    </option>
                                  ))}
                                </select>
                                {fieldError && <p className="text-xs text-[#E05200]">{fieldError}</p>}
                              </div>
                            );
                          }
                          if (model.kind === 'textarea') {
                            return (
                              <div key={field.key} className="space-y-1">
                                {fieldLabel}
                                <textarea
                                  rows={3}
                                  maxLength={model.maxLength}
                                  value={value}
                                  onChange={(e) => updateOption(field.key, e.target.value)}
                                  className="form-input resize-none"
                                />
                                {/* This value is reproduced verbatim on the finished piece. */}
                                <p className="text-[11px] text-[#888888]">
                                  Case sensitive — write it exactly as you want it produced.
                                </p>
                                {fieldError && <p className="text-xs text-[#E05200]">{fieldError}</p>}
                              </div>
                            );
                          }
                          if (model.kind === 'number') {
                            return (
                              <div key={field.key} className="space-y-1">
                                {fieldLabel}
                                <input
                                  type="number"
                                  min={model.min}
                                  max={model.max}
                                  value={value}
                                  onChange={(e) => updateOption(field.key, e.target.value)}
                                  className="form-input"
                                />
                                {fieldError && <p className="text-xs text-[#E05200]">{fieldError}</p>}
                              </div>
                            );
                          }
                          return (
                            <div key={field.key} className="space-y-1">
                              {fieldLabel}
                              <input
                                type="text"
                                maxLength={model.maxLength}
                                value={value}
                                onChange={(e) => updateOption(field.key, e.target.value)}
                                className="form-input"
                              />
                              {/* This value is reproduced verbatim on the finished piece. */}
                              <p className="text-[11px] text-[#888888]">
                                Case sensitive — write it exactly as you want it produced.
                              </p>
                              {fieldError && <p className="text-xs text-[#E05200]">{fieldError}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Legacy flat options list → single dropdown */}
                  {!customMode &&
                    (selectedService?.options?.length ?? 0) > 0 &&
                    (selectedService?.optionFields?.length ?? 0) === 0 && (
                      <div className="space-y-2">
                        <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                          <span className="text-[#FF5C00]">03</span> Option
                        </label>
                        <select
                          value={form.selectedVariant}
                          onChange={(e) => update('selectedVariant', e.target.value)}
                          className="form-input"
                        >
                          <option value="">Select an option…</option>
                          {(selectedService?.options ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                  {/* Pickup date & time — REQUIRED by the backend */}
                  <div className="space-y-2">
                    <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      <span className="text-[#FF5C00]">04</span> Pickup Date &amp; Time{' '}
                      <span className="lowercase text-[10px]">(required)</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="date"
                        value={pickupParts?.date ?? ''}
                        min={lagosDateISO(0)}
                        max={lagosDateISO(30)}
                        onChange={(e) => {
                          const fallbackTime = fmtClock(Math.max(cal.openMinute, cal.closeMinute - 60));
                          const iso = pickupTimeFromParts(e.target.value, pickupParts?.time || fallbackTime);
                          if (iso) update('requestedPickupTime', iso);
                        }}
                        className="form-input"
                      />
                      <input
                        type="time"
                        value={pickupParts?.time ?? ''}
                        min={fmtClock(cal.openMinute)}
                        max={fmtClock(cal.closeMinute - 1)}
                        onChange={(e) => {
                          const iso = pickupTimeFromParts(pickupParts?.date ?? '', e.target.value);
                          if (iso) update('requestedPickupTime', iso);
                        }}
                        className="form-input"
                      />
                    </div>
                    {pickupErrorMsg && <p className="text-xs text-[#E05200]">{pickupErrorMsg}</p>}
                    <p className="text-[11px] text-[#888888]">
                      Monday–Friday only (observed public holidays excluded), {fmtClock(cal.openMinute)}–{fmtClock(cal.closeMinute)} (Lagos),
                      within 30 days. Earlier pickups add an express fee.
                    </p>
                  </div>

                  {/* Design files */}
                  <div className="space-y-2">
                    <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      <span className="text-[#FF5C00]">05</span> Design Files <span className="lowercase text-[10px]">(up to 5, max 10MB each)</span>
                    </label>
                    <div className="flex flex-col gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".svg,.ai,.eps,.dxf,.pdf,.png,.jpg,.jpeg"
                        onChange={handleFile}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-outline"
                      >
                        {uploadFiles.length > 0
                          ? `✓ ${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''} selected`
                          : 'Choose Files'}
                      </button>
                      {/* Thumbnails so the customer can confirm the right file
                          was picked, right where they picked it. */}
                      {uploadFiles.length > 0 && (
                        <DesignFileThumbs files={uploadFiles} className="mt-2" />
                      )}
                      {uploadFiles.length > 0 && (
                        <div className="space-y-1">
                          {uploadFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-[#888888]">
                              <span className="font-mono text-[#666666]">{f.name}</span>
                              <span>({(f.data.length / 1024).toFixed(0)}KB)</span>
                              <button
                                onClick={() => setUploadFiles(uploadFiles.filter((_, j) => j !== i))}
                                className="text-[#FF5C00] hover:text-black ml-auto"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-[#888888]">
                      Accepted: SVG, AI, EPS, DXF, PDF, PNG, JPG. We&apos;ll follow up by email if needed.
                    </p>
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      <span className="text-[#FF5C00]">06</span> Notes (optional)
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
                      onClick={() => update('deliveryMethod', 'LOCAL_DELIVERY')}
                      className={`card text-left transition-all ${
                        form.deliveryMethod === 'LOCAL_DELIVERY'
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

                  {form.deliveryMethod === 'LOCAL_DELIVERY' && (
                    <div className="space-y-2">
                      <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                        <span className="text-[#FF5C00]">01</span> Delivery Address <span className="lowercase text-[10px]">(search or click the map)</span>
                      </label>
                      <AddressPicker
                        token={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''}
                        value={form.deliveryAddress}
                        onChange={(v) => update('deliveryAddress', v)}
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
                      placeholder="0806 000 0000"
                      className="form-input"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                      <span className="text-[#FF5C00]">03</span> Email (optional)
                    </label>
                    <input
                      type="email"
                      value={form.customerEmail}
                      onChange={(e) => update('customerEmail', e.target.value)}
                      placeholder="you@example.com"
                      className="form-input"
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
                      {customMode ? 'Custom job' : 'Service'}
                    </p>
                    <p className="text-base font-bold text-black">
                      {customMode ? (customDescription || 'Custom job') : form.serviceName}
                    </p>
                    {customMode && (customMaterial || customDimensions) && (
                      <p className="text-xs text-[#666666] mt-1">
                        {[customMaterial, customDimensions].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="text-xs text-[#666666] mt-1">
                      Qty {form.quantity} · {form.sla}
                      {form.requestedPickupTime && (
                        <> · Pickup {formatPickupLabel(form.requestedPickupTime)}</>
                      )}
                    </p>
                    {optionSummary.length > 0 && (
                      <p className="text-xs text-[#666666] mt-1">
                        {optionSummary.join(' · ')}
                      </p>
                    )}
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
                  {(uploadFiles.length > 0 || form.customerNotes) && (
                    <div className="card">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-3">
                        Design & Notes
                      </p>
                      {/* Last chance to catch a wrong attachment before paying. */}
                      {uploadFiles.length > 0 && (
                        <DesignFileThumbs files={uploadFiles} className="mb-3" />
                      )}
                      {uploadFiles.length > 0 && (
                        <div className="space-y-1">
                          {uploadFiles.map((f, i) => (
                            <p key={i} className="text-sm text-black">📎 {f.name}</p>
                          ))}
                        </div>
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
                {submitting ? 'Submitting…' : customMode ? 'Place Custom Order' : quote ? `Pay ${formatNaira(quote.quoteNaira)}` : 'Submit Order'}
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
                  {(quote as any).availability && (
                    <div className="pt-3 border-t border-[#EAEAEA]">
                      <AvailabilityLine availability={(quote as any).availability} />
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
              . Review our{' '}
              <Link href="/delivery" className="underline hover:text-black">
                Delivery Method
              </Link>
              ,{' '}
              <Link href="/refund-policy" className="underline hover:text-black">
                Refund Policy
              </Link>
              , and{' '}
              <Link href="/cancellation-policy" className="underline hover:text-black">
                Cancellation Policy
              </Link>
              . Payment is processed securely via Paystack.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-24">
          <div className="w-8 h-8 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
        </div>
      }
    >
      <OrderPageInner />
    </Suspense>
  );
}
