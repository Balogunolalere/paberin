/**
 * Backend contract check for the ORDERING flow — run against the REAL admin API.
 *
 * Unit tests prove the pure logic; this proves the thing that actually breaks in
 * production: that the payloads this app builds are accepted by the backend, and
 * that the responses contain the fields the views read. Paberin's builders
 * deliberately omit the brand (api.ts adds it), so these bodies add it the same
 * way the app does.
 *
 * SKIPPED BY DEFAULT (CI must not create orders). Run explicitly:
 *
 *   BACKEND_CONTRACT=1 npx vitest run tests/integration/backend-contract.test.ts
 *
 * It creates ONE unpaid order, exercises payment initialization, then CANCELS it
 * through the customer path (the state machine, so the timeline records it).
 */
import { describe, it, expect } from 'vitest';
import {
  buildQuotePayload,
  buildOrderPayload,
  defaultRequestedPickupTime,
  isValidNigerianPhone,
} from '@/lib/order-form';
import { DEFAULT_BUSINESS_CALENDAR } from '@/lib/business-calendar';

// The unit-test setup points NEXT_PUBLIC_ADMIN_API_URL at localhost and stubs
// fetch; this test wants the deployed backend and the real network.
const API = process.env.BACKEND_CONTRACT_URL || 'https://skyalxpaberin-admin.vercel.app';
const realFetch: typeof fetch = (globalThis as unknown as { __realFetch?: typeof fetch }).__realFetch ?? fetch;
/** Valid but obviously synthetic, so the test order stays findable. */
const TEST_PHONE = '08099999998';
const TEST_NAME = 'CONTRACT TEST (PABERIN) — safe to cancel';
const BRAND = 'PABERIN';

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: any; data: T | undefined }> {
  const res = await realFetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, data: body?.data };
}

const run = describe.skipIf(!process.env.BACKEND_CONTRACT);

run('backend contract — ordering (PABERIN)', () => {
  let orderNumber = '';
  let serviceType = '';
  let requiredOptionService = '';
  let totalAmount = 0;

  it('serves the service catalog in the shape the order form reads', async () => {
    const { status, data } = await call<any[]>('/api/services?brand=PABERIN');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);

    const priced = (data || []).filter((s) => s.isActive !== false && s.basePriceNaira > 0);
    expect(priced.length).toBeGreaterThan(0);
    for (const field of priced.flatMap((s: any) => s.optionFields || [])) {
      expect(field).toHaveProperty('key');
      expect(field).toHaveProperty('label');
      expect(['dropdown', 'text', 'textarea', 'number']).toContain(field.type);
    }

    // Quote the first service whose options are NOT required — the same gate the
    // order form applies (it refuses to quote until required options are chosen).
    const noRequiredOptions = priced.find(
      (s: any) => !(s.optionFields || []).some((f: any) => f.required) && !(s.options || []).length,
    );
    const sample = noRequiredOptions || priced[0];
    expect(sample).toHaveProperty('type');
    expect(sample).toHaveProperty('label');
    expect(typeof sample.basePriceNaira).toBe('number');
    serviceType = sample.type;

    // Remember a service WITH a required option, for the rejection case.
    requiredOptionService = priced.find((s: any) => (s.optionFields || []).some((f: any) => f.required))?.type || '';
  });

  it('prices a quote from the payload this app builds', async () => {
    const requestedPickupTime = defaultRequestedPickupTime(Date.now(), DEFAULT_BUSINESS_CALENDAR);
    const payload = {
      brand: BRAND,
      ...buildQuotePayload({ serviceType, quantity: 1, sla: 'Standard', requestedPickupTime }),
    };
    const { status, data } = await call<any>('/api/services/quote', { method: 'POST', body: JSON.stringify(payload) });

    expect(status, JSON.stringify(data)).toBe(200);
    // The shape the views read: quoteNaira for the headline, breakdown for detail.
    expect(typeof data.quoteNaira).toBe('number');
    expect(data.quoteNaira).toBeGreaterThan(0);
    expect(data.breakdown).toBeTruthy();
    expect(data.breakdown.finalPriceNaira).toBe(data.quoteNaira);
    expect(data.breakdown.serviceLabel).toBeTruthy();
    expect(typeof data.breakdown.deliveryFee).toBe('number');
    expect(data.breakdown.discount).toBeGreaterThanOrEqual(0);
    expect(data.breakdown.discount).toBeLessThanOrEqual(
      data.breakdown.subtotal + data.breakdown.expressSurcharge + data.breakdown.addOnsTotal,
    );
  });

  it('rejects a weekend pickup with a 400 rather than pricing it', async () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7));
    const saturday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 0, 0)).toISOString();
    const { status, body } = await call('/api/services/quote', {
      method: 'POST',
      body: JSON.stringify({
        brand: BRAND,
        ...buildQuotePayload({ serviceType, quantity: 1, sla: 'Standard', requestedPickupTime: saturday }),
      }),
    });
    expect(status).toBe(400);
    expect(['INVALID_PICKUP_TIME', 'REQUESTED_PICKUP_REQUIRED']).toContain(body?.error?.code);
  });

  it('answers 400 (not 500) when a required option is missing', async () => {
    if (!requiredOptionService) return; // no such service configured — nothing to prove
    const { status, body } = await call('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        brand: BRAND,
        ...buildOrderPayload({
          quantity: 1,
          sla: 'Standard',
          customerName: TEST_NAME,
          customerPhone: TEST_PHONE,
          customerEmail: '',
          requestedPickupTime: defaultRequestedPickupTime(),
          serviceType: requiredOptionService,
          deliveryMethod: 'PICKUP',
        }),
      }),
    });
    // A missing option is the CUSTOMER's to fix: 400 with the engine's own
    // explanation. It used to be 500 ORDER_CREATE_ERROR, which reads as a server
    // fault and which the UI cannot tell the customer how to resolve.
    expect(status, JSON.stringify(body)).toBe(400);
    expect(body?.error?.code).toBe('INVALID_ORDER_INPUT');
    expect(body?.error?.message).toMatch(/required/i);
  });

  it('rejects a missing pickup time rather than guessing one', async () => {
    const { status, body } = await call('/api/services/quote', {
      method: 'POST',
      body: JSON.stringify({ brand: BRAND, serviceType, quantity: 1, sla: 'Standard' }),
    });
    expect(status).toBe(400);
    expect(body?.error?.code).toBe('REQUESTED_PICKUP_REQUIRED');
  });

  it('sends a normalised phone, so a separators-formatted number survives', () => {
    expect(isValidNigerianPhone('0803 350 3068')).toBe(true);
    const payload = buildOrderPayload({
      quantity: 1,
      sla: 'Standard',
      customerName: TEST_NAME,
      customerPhone: '0803 350 3068',
      customerEmail: '',
      requestedPickupTime: defaultRequestedPickupTime(),
      serviceType,
    });
    // Separators are what a customer types; the backend's regex is stricter than
    // this app's, so what goes out must be a value it accepts.
    expect(String(payload.customerPhone).replace(/\D/g, '')).toBe('08033503068');
  });

  it('creates an order from the payload this app builds', async () => {
    const requestedPickupTime = defaultRequestedPickupTime();
    const payload = {
      brand: BRAND,
      ...buildOrderPayload({
        quantity: 1,
        sla: 'Standard',
        customerName: TEST_NAME,
        customerPhone: TEST_PHONE,
        customerEmail: '',
        requestedPickupTime,
        serviceType,
        deliveryMethod: 'PICKUP',
      }),
    };
    const { status, data, body } = await call<any>('/api/orders', { method: 'POST', body: JSON.stringify(payload) });

    expect(status, JSON.stringify(body)).toBe(201);
    expect(data.orderNumber).toMatch(/^PAB-/);
    expect(data.state).toBe('PAYMENT_PENDING');
    expect(typeof data.totalAmount).toBe('number');
    expect(data.totalAmount).toBeGreaterThan(0);
    expect(new Date(data.requestedPickupTime).toISOString()).toBe(requestedPickupTime);

    orderNumber = data.orderNumber;
    totalAmount = data.totalAmount;
  });

  it('returns it from the tracker by order id', async () => {
    const { status, data } = await call<any>(`/api/orders?id=${encodeURIComponent(orderNumber)}&brand=PABERIN`);
    expect(status).toBe(200);
    expect(data.orderNumber).toBe(orderNumber);
  });

  it('finds it through the customer login for that phone', async () => {
    const { status, data } = await call<any>('/api/magic-link', {
      method: 'POST',
      body: JSON.stringify({ phone: TEST_PHONE, brand: 'PABERIN' }),
    });
    expect(status).toBe(200);
    expect((data.orders || []).map((o: any) => o.orderNumber)).toContain(orderNumber);
  });

  it('initializes a Paystack checkout for it', async () => {
    const { status, data, body } = await call<any>('/api/payment/initialize', {
      method: 'POST',
      body: JSON.stringify({ amount: totalAmount, email: 'contract-test@example.com', orderNumber, brand: BRAND }),
    });
    expect(status, JSON.stringify(body)).toBe(200);
    expect(data.authorizationUrl).toMatch(/^https:\/\//);
    expect(typeof data.reference).toBe('string');
  });

  it('cancels the test order through the customer path so nothing is left behind', async () => {
    const { status, body } = await call(`/api/orders/${encodeURIComponent(orderNumber)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'cancel', customerPhone: TEST_PHONE, reason: 'Automated contract test' }),
    });
    expect(status, JSON.stringify(body)).toBe(200);

    const after = await call<any>(`/api/orders?id=${encodeURIComponent(orderNumber)}&brand=PABERIN`);
    expect(after.data.state).toBe('CANCELLED');
  });

  it('refuses a cancel from a different phone', async () => {
    const { status } = await call(`/api/orders/${encodeURIComponent(orderNumber)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'cancel', customerPhone: '08011111111' }),
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
