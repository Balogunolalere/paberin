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

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://skyalxpaberin-admin.vercel.app';

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
  customerName?: string;
  customerEmail?: string;
  orders: Pick<
    Order,
    'orderNumber' | 'state' | 'serviceLabel' | 'serviceType' | 'quantity' | 'totalAmount' | 'sla' | 'deliveryMethod' | 'createdAt' | 'brand'
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
  messageCount?: number;
  lastAdminMessageAt?: string | null;
  messages?: EscalationMessage[];
}

export interface EscalationMessage {
  id: string;
  role: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  body: string;
  authorName?: string | null;
  createdAt: string;
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

export interface EscalationThread {
  ticketId: string;
  orderNumber: string | null;
  status: string;
  messages: EscalationMessage[];
}

export interface SavedAddress {
  id: string;
  customerPhone: string;
  label: string;
  recipientName?: string | null;
  phone?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  landmark?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface SavedDesign {
  id: string;
  customerPhone: string;
  name: string;
  fileUrl: string;
  filePublicId?: string | null;
  serviceType?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface CustomerNotification {
  id: string;
  customerPhone: string;
  type: string;
  title: string;
  body: string;
  orderNumber?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface CustomerNotificationsResponse {
  notifications: CustomerNotification[];
  unreadCount: number;
}

export interface CustomerPreference {
  id: string;
  customerPhone: string;
  customerName?: string | null;
  customerEmail?: string | null;
  emailNotifications: boolean;
}

export interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  brand?: string | null;
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
    apiFetch<{ escalations: Escalation[] }>(`/api/escalations?phone=${encodeURIComponent(phone)}`),

  /** Fetch the full message thread for a single escalation. */
  getEscalationThread: (ticketId: string, phone: string) =>
    apiFetch<EscalationThread>(
      `/api/escalations/${encodeURIComponent(ticketId)}/messages?phone=${encodeURIComponent(phone)}`
    ),

  /** Customer appends a message to an escalation thread. */
  replyEscalation: (ticketId: string, body: { phone: string; message: string; customerName?: string }) =>
    apiFetch<{ message: EscalationMessage }>(
      `/api/escalations/${encodeURIComponent(ticketId)}/messages`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  /** Cancel an order within the 24h grace period. */
  cancelOrder: (orderNumber: string, customerPhone: string, reason?: string) =>
    apiFetch<{ orderNumber: string; state: string; message: string }>(
      `/api/orders/${encodeURIComponent(orderNumber)}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'cancel', customerPhone, reason }) }
    ),

  /** Modify an order (quantity and/or delivery address) within the 24h grace period. */
  modifyOrder: (
    orderNumber: string,
    customerPhone: string,
    changes: { quantity?: number; deliveryAddress?: string }
  ) =>
    apiFetch<{ orderNumber: string; quantity: number; totalAmount: number; deliveryAddress: string | null; message: string }>(
      `/api/orders/${encodeURIComponent(orderNumber)}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'modify', customerPhone, ...changes }) }
    ),

  /** List saved delivery addresses. */
  getSavedAddresses: (phone: string) =>
    apiFetch<{ addresses: SavedAddress[] }>(`/api/saved-addresses?phone=${encodeURIComponent(phone)}`),

  /** Save a new delivery address. */
  createSavedAddress: (body: Omit<SavedAddress, 'id' | 'createdAt' | 'updatedAt'>) =>
    apiFetch<SavedAddress>('/api/saved-addresses', { method: 'POST', body: JSON.stringify(body) }),

  /** Update a saved address. */
  updateSavedAddress: (id: string, phone: string, patch: Partial<SavedAddress>) =>
    apiFetch<SavedAddress>(`/api/saved-addresses/${encodeURIComponent(id)}?phone=${encodeURIComponent(phone)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...patch, customerPhone: phone }),
    }),

  /** Delete a saved address. */
  deleteSavedAddress: (id: string, phone: string) =>
    apiFetch<{ message: string }>(`/api/saved-addresses/${encodeURIComponent(id)}?phone=${encodeURIComponent(phone)}`, {
      method: 'DELETE',
      body: JSON.stringify({ customerPhone: phone }),
    }),

  /** List saved designs. */
  getSavedDesigns: (phone: string) =>
    apiFetch<{ designs: SavedDesign[] }>(`/api/saved-designs?phone=${encodeURIComponent(phone)}`),

  /** Save a design (by URL or copied from an order's design file). */
  createSavedDesign: (body: {
    customerPhone: string;
    name: string;
    fileUrl?: string;
    fromOrderNumber?: string;
    serviceType?: string;
    notes?: string;
  }) => apiFetch<SavedDesign>('/api/saved-designs', { method: 'POST', body: JSON.stringify(body) }),

  /** Delete a saved design. */
  deleteSavedDesign: (id: string, phone: string) =>
    apiFetch<{ message: string }>(`/api/saved-designs/${encodeURIComponent(id)}?phone=${encodeURIComponent(phone)}`, {
      method: 'DELETE',
      body: JSON.stringify({ customerPhone: phone }),
    }),

  /** List in-app notifications + unread count. */
  getNotifications: (phone: string) =>
    apiFetch<CustomerNotificationsResponse>(`/api/customer/notifications?phone=${encodeURIComponent(phone)}`),

  /** Mark all notifications as read. */
  markAllNotificationsRead: (phone: string) =>
    apiFetch<{ message: string }>(`/api/customer/notifications?phone=${encodeURIComponent(phone)}`, { method: 'POST', body: JSON.stringify({ markAllRead: true }) }),

  /** Mark a single notification as read. */
  markNotificationRead: (id: string, phone: string) =>
    apiFetch<{ message: string }>(
      `/api/customer/notifications/${encodeURIComponent(id)}/read?phone=${encodeURIComponent(phone)}`,
      { method: 'POST' }
    ),

  /** Get customer preferences (creates defaults if absent). */
  getPreferences: (phone: string) =>
    apiFetch<CustomerPreference>(`/api/customer/preferences?phone=${encodeURIComponent(phone)}`),

  /** Update customer preferences. */
  updatePreferences: (body: {
    customerPhone: string;
    customerName?: string;
    customerEmail?: string;
    emailNotifications?: boolean;
  }) => apiFetch<CustomerPreference>('/api/customer/preferences', { method: 'PUT', body: JSON.stringify(body) }),

  /** Public FAQ list (active only). */
  getFAQ: (brand?: 'skyal' | 'paberin') =>
    apiFetch<{ faqs: FAQItem[] }>(`/api/faq${brand ? `?brand=${brand.toUpperCase()}` : ''}`),

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
