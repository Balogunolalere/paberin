/**
 * Paberin — Customer-facing API client.
 *
 * Paberin is a SEPARATE deployment from the admin backend. All data
 * requests are proxied to the admin API at `NEXT_PUBLIC_ADMIN_API_URL`
 * (defaults to `http://localhost:3000`). Every call is tagged with
 * `brand=PABERIN` so the admin can route service catalogue, pricing,
 * orders, and chat sessions to the right tenant.
 *
 * Wraps `apiFetch` with convenience methods that match the admin's
 * REST endpoints one-to-one.
 */

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3000';

/** Low-level fetch wrapper that normalises the admin's `{ data, error }` envelope. */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    // Paberin is a static customer site — never cache API responses.
    cache: 'no-store',
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response (rare) — fall through with empty body.
  }

  if (!res.ok) {
    const message =
      data?.error?.message ||
      data?.error?.code ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }

  return (data?.data ?? data) as T;
}

/* ───────────────────────────── Types ───────────────────────────── */

export interface Service {
  id: string;
  type: string;
  label: string;
  description: string;
  category: string;
  basePriceNaira: number;
  unit: string;
  minPriceNaira: number;
  customerSupplied: boolean;
  standardLeadTime: string;
  expressLeadTime: string | null;
  allowExpress: boolean;
  expressSurchargePct: number;
}

export interface QuoteBreakdown {
  serviceLabel?: string;
  basePrice?: number;
  expressSurcharge?: number;
  addOnsTotal?: number;
  discount?: number;
  deliveryFee?: number;
  finalPriceNaira?: number;
  quantity?: number;
  [k: string]: unknown;
}

export interface QuoteResponse {
  quoteNaira: number;
  breakdown?: QuoteBreakdown;
}

export interface OrderTimelineEntry {
  state: string;
  timestamp: string;
  note?: string | null;
  changedBy?: string | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  brand: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceType: string;
  serviceLabel: string;
  quantity: number;
  sla: string;
  totalAmount: number;
  state: string;
  deliveryMethod: string | null;
  deliveryAddress: string | null;
  createdAt: string;
  updatedAt: string;
  // Tracking endpoint returns extras:
  gracePeriodExpires?: string | null;
  canModify?: boolean;
  canCancel?: boolean;
  trackingPin?: string | null;
  timeline?: OrderTimelineEntry[];
}

export interface PhoneOrdersResponse {
  phone: string;
  orders: Pick<
    Order,
    'orderNumber' | 'state' | 'serviceLabel' | 'totalAmount' | 'createdAt' | 'brand'
  >[];
}

export interface ReferralValidation {
  valid: boolean;
  rewardAmount?: number;
  referrerName?: string;
}

export interface PaymentInitResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaymentVerifyResponse {
  verified: boolean;
  reference?: string;
}

export interface Escalation {
  id: string;
  ticketId?: string;
  orderNumber?: string;
  customerPhone?: string;
  customerName?: string;
  reason: string;
  message?: string;
  status: string;
  response?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateEscalationBody {
  orderNumber: string;
  customerPhone: string;
  customerName?: string;
  reason: string;
  message: string;
}

export interface CreateEscalationResponse {
  id: string;
  ticketId: string;
  status: string;
  createdAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequestBody {
  message?: string;
  image_base64?: string;
  audio_base64?: string;
  audio_mime_type?: string;
  brand?: 'skyal' | 'paberin';
  mode?: 'live' | 'mock';
  history?: ChatMessage[];
  sessionId?: string;
}

export interface ChatResponse {
  assistant_text: string;
  tool_calls?: any[];
  tool_results?: any[];
  latency_ms?: number;
  customer_type?: string;
  confidence?: number;
  quote?: {
    price: number;
    original_price?: number;
    bulk_discount?: number;
    breakdown?: QuoteBreakdown;
    summary?: string;
  };
  render_order_now?: boolean;
  confidence_blocked?: boolean;
  sessionId?: string;
  error?: string;
}

/* ───────────────────────────── API surface ───────────────────────────── */

export const api = {
  /** List active PABERIN services. */
  getServices: () => apiFetch<Service[]>(`/api/services?brand=PABERIN`),

  /** Calculate a price quote. `body.brand` is forced to PABERIN. */
  getQuote: (body: Record<string, unknown>) =>
    apiFetch<QuoteResponse>('/api/services/quote', {
      method: 'POST',
      body: JSON.stringify({ ...body, brand: 'PABERIN' }),
    }),

  /** Create a new order. `body.brand` is forced to PABERIN. */
  createOrder: (body: Record<string, unknown>) =>
    apiFetch<Order>('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ ...body, brand: 'PABERIN' }),
    }),

  /** Track a single order by order number. */
  trackOrder: (orderNumber: string) =>
    apiFetch<Order>(`/api/orders?id=${encodeURIComponent(orderNumber)}`),

  /** Fetch all orders for a phone number (used by login + dashboard). */
  getOrdersByPhone: (phone: string) =>
    apiFetch<PhoneOrdersResponse>('/api/magic-link', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  /** Send a chat message to the Paberin LLM. */
  sendChat: (body: ChatRequestBody) =>
    apiFetch<ChatResponse>('/api/skyal/chat', {
      method: 'POST',
      body: JSON.stringify({ ...body, brand: 'paberin' }),
    }),

  /** Create an escalation ticket for an order. */
  createEscalation: (body: CreateEscalationBody) =>
    apiFetch<CreateEscalationResponse>('/api/escalations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** List a customer's escalations by phone. */
  getEscalations: (phone: string) =>
    apiFetch<Escalation[]>(`/api/escalations?phone=${encodeURIComponent(phone)}`),

  /** Submit the contact form. */
  submitContact: (body: {
    name: string;
    email: string;
    phone?: string;
    message: string;
  }) =>
    apiFetch<{ message: string }>('/api/contact', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Validate a referral code (PABERIN brand). */
  validateReferral: (code: string) =>
    apiFetch<ReferralValidation>('/api/referrals/validate', {
      method: 'POST',
      body: JSON.stringify({ code, brand: 'PABERIN' }),
    }),

  /** Initialize a Paystack transaction. */
  initializePayment: (body: {
    amount: number;
    email: string;
    orderNumber: string;
    metadata?: Record<string, unknown>;
  }) =>
    apiFetch<PaymentInitResponse>('/api/payment/initialize', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Verify a Paystack transaction by reference. */
  verifyPayment: (reference: string) =>
    apiFetch<PaymentVerifyResponse>(
      `/api/payment/verify?reference=${encodeURIComponent(reference)}`,
      { method: 'POST', body: JSON.stringify({ reference }) }
    ),
};

/* ───────────────────────────── Helpers ───────────────────────────── */

/** Format a naira amount with the ₦ symbol and en-NG grouping. */
export function formatNaira(n: number): string {
  if (!Number.isFinite(n)) return '₦0';
  return '₦' + Math.round(n).toLocaleString('en-NG');
}

/** Format an ISO date string as e.g. "Jan 5, 2025". */
export function formatDate(d: string | Date): string {
  try {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/** Human-readable order state, mapped to Paberin's voice. */
export function formatOrderState(state: string): string {
  const map: Record<string, string> = {
    PAYMENT_PENDING: 'Awaiting Payment',
    PAYMENT_SUCCESS: 'Payment Confirmed',
    ON_HOLD: 'On Hold',
    IN_PROGRESS: 'In Production',
    CUTTING: 'Cutting',
    QC: 'Quality Check',
    READY_FOR_PICKUP: 'Ready for Pickup',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    DELIVERED: 'Delivered',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    REFUNDED: 'Refunded',
  };
  return map[state] || state.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Tailwind class for an order state badge — accent for active, muted for terminal. */
export function orderStateClass(state: string): string {
  const terminal = ['DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'];
  const active = ['IN_PROGRESS', 'CUTTING', 'QC', 'OUT_FOR_DELIVERY'];
  if (terminal.includes(state)) return 'bg-[#F7F7F7] text-[#666666] border-[#EAEAEA]';
  if (active.includes(state)) return 'bg-[#FF5C00]/10 text-[#FF5C00] border-[#FF5C00]/30';
  if (state === 'PAYMENT_PENDING') return 'bg-[#FFF7F0] text-[#E05200] border-[#FFD9BF]';
  return 'bg-[#F7F7F7] text-[#666666] border-[#EAEAEA]';
}
