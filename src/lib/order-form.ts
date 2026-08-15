/**
 * Order-form contract helpers — pure logic shared by the order wizard, the
 * chat route, and the unit tests.
 *
 * Mirrors the admin backend's server-enforced rules so invalid payloads are
 * caught client-side before the round trip:
 *  - `requestedPickupTime` is REQUIRED on quote + order create (ISO string,
 *    future, Mon–Fri, 09:00–18:00 Africa/Lagos, at most 30 days ahead).
 *  - Nigerian phone numbers only: 11-digit `0[789][01]XXXXXXXX` or 13-digit
 *    `234[789][01]XXXXXXXX` (leading `+` and spaces/dashes/parens tolerated).
 *  - Service options: legacy flat `options` list → `selectedVariant` string;
 *    structured `optionFields` → `selectedOptions` map. Never both keys.
 */

import type { OptionField, Service } from '@/lib/api';

/* ───────────────────────────── Phone ───────────────────────────── */

/**
 * Backend isValidPhone contract: 11 digits `0[789][01]XXXXXXXX` or 13 digits
 * `234[789][01]XXXXXXXX` (leading `+` tolerated). Spaces/dashes/parens are
 * stripped before the check.
 */
export const NIGERIAN_PHONE_RE = /^(0[789][01]\d{8}|234[789][01]\d{8})$/;

export function isValidNigerianPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  return NIGERIAN_PHONE_RE.test(cleaned);
}

/* ───────────────────────────── Pickup time ───────────────────────────── */

// Africa/Lagos is UTC+1 with no DST — a fixed offset is exact year-round.
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** Lagos wall-clock parts of an instant, exposed through the UTC getters. */
function lagosWallTime(ms: number): Date {
  return new Date(ms + LAGOS_OFFSET_MS);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Server-enforced pickup rules, mirrored client-side. Returns a
 * human-readable problem or null when the time is acceptable.
 */
export function pickupTimeError(value: string, nowMs: number = Date.now()): string | null {
  const t = Date.parse(value);
  if (!value) return 'Pickup date & time is required';
  if (Number.isNaN(t)) return 'Pickup date & time is invalid';
  if (t <= nowMs) return 'Pickup must be in the future';
  const wall = lagosWallTime(t);
  const dow = wall.getUTCDay();
  if (dow === 0 || dow === 6) return 'Pickup is Monday–Friday only';
  const minutes = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  if (minutes < 9 * 60 || minutes > 18 * 60) return 'Pickup hours are 09:00–18:00 (Africa/Lagos)';
  const nowWall = lagosWallTime(nowMs);
  const todayStart = Date.UTC(nowWall.getUTCFullYear(), nowWall.getUTCMonth(), nowWall.getUTCDate());
  const pickupDay = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  if (Math.round((pickupDay - todayStart) / 86_400_000) > 30) return 'Pickup must be within 30 days';
  return null;
}

export function isValidRequestedPickupTime(value: string, nowMs?: number): boolean {
  return pickupTimeError(value, nowMs) === null;
}

/** now + 2 working days at 17:00 Lagos — the default the chat route uses. */
export function defaultRequestedPickupTime(nowMs: number = Date.now()): string {
  const wall = lagosWallTime(nowMs);
  let day = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  let workingDays = 0;
  while (workingDays < 2) {
    day += 86_400_000;
    const dow = new Date(day).getUTCDay();
    if (dow !== 0 && dow !== 6) workingDays++;
  }
  return new Date(day + 17 * 3_600_000 - LAGOS_OFFSET_MS).toISOString();
}

/** Split an ISO pickup time into its Lagos-local date (YYYY-MM-DD) and time (HH:MM). */
export function pickupTimeParts(value: string): { date: string; time: string } | null {
  const t = Date.parse(value);
  if (!value || Number.isNaN(t)) return null;
  const wall = lagosWallTime(t);
  return {
    date: `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}`,
    time: `${pad2(wall.getUTCHours())}:${pad2(wall.getUTCMinutes())}`,
  };
}

/** Build an ISO pickup time from Lagos-local date + time inputs. */
export function pickupTimeFromParts(date: string, time: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  const hm = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!m || !hm) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(hm[1]);
  const mi = Number(hm[2]);
  const wallMs = Date.UTC(y, mo - 1, d, h, mi);
  const roundTrip = lagosWallTime(wallMs - LAGOS_OFFSET_MS);
  if (
    roundTrip.getUTCFullYear() !== y ||
    roundTrip.getUTCMonth() !== mo - 1 ||
    roundTrip.getUTCDate() !== d ||
    roundTrip.getUTCHours() !== h ||
    roundTrip.getUTCMinutes() !== mi
  ) {
    return null; // e.g. 2026-02-30 rolled over — refuse the guess
  }
  return new Date(wallMs - LAGOS_OFFSET_MS).toISOString();
}

/** Lagos-local calendar date (YYYY-MM-DD) offset by N days — input min/max. */
export function lagosDateISO(offsetDays: number, nowMs: number = Date.now()): string {
  const wall = lagosWallTime(nowMs);
  const day = new Date(
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + offsetDays)
  );
  return `${day.getUTCFullYear()}-${pad2(day.getUTCMonth() + 1)}-${pad2(day.getUTCDate())}`;
}

/** Human label, e.g. "Thu, Aug 6 at 17:00" — review-step display. */
export function formatPickupLabel(value: string): string {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return '';
  const wall = lagosWallTime(t);
  const date = new Date(
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())
  ).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${date} at ${pad2(wall.getUTCHours())}:${pad2(wall.getUTCMinutes())}`;
}

/* ───────────────────────────── Service options ───────────────────────────── */

export type OptionInputKind = 'select' | 'text' | 'textarea' | 'number';

export interface OptionInputModel {
  key: string;
  label: string;
  kind: OptionInputKind;
  required: boolean;
  choices: string[];
  min?: number;
  max?: number;
  maxLength?: number;
}

/** Map a backend OptionField to the input element it renders as. */
export function optionInputModel(field: OptionField): OptionInputModel {
  return {
    key: field.key,
    label: field.label,
    kind: field.type === 'dropdown' ? 'select' : field.type,
    required: !!field.required,
    choices: Array.isArray(field.choices) ? field.choices : [],
    min: typeof field.min === 'number' ? field.min : undefined,
    max: typeof field.max === 'number' ? field.max : undefined,
    maxLength: typeof field.maxLength === 'number' ? field.maxLength : undefined,
  };
}

export interface OptionValidation {
  valid: boolean;
  /** Per-key problems (required-missing, out-of-range, too long, bad choice). */
  errors: Record<string, string>;
}

/** Client-side enforcement of required / min / max / maxLength / choices. */
export function validateOptionValues(
  fields?: OptionField[] | null,
  values?: Record<string, string | number>
): OptionValidation {
  const errors: Record<string, string> = {};
  for (const field of fields ?? []) {
    const raw = values?.[field.key];
    const text = raw === undefined || raw === null ? '' : String(raw).trim();
    if (field.required && !text) {
      errors[field.key] = `${field.label} is required`;
      continue;
    }
    if (!text) continue;
    if (field.type === 'number') {
      const n = Number(text);
      if (!Number.isFinite(n)) errors[field.key] = `${field.label} must be a number`;
      else if (typeof field.min === 'number' && n < field.min)
        errors[field.key] = `${field.label} must be at least ${field.min}`;
      else if (typeof field.max === 'number' && n > field.max)
        errors[field.key] = `${field.label} must be at most ${field.max}`;
    } else {
      if (typeof field.maxLength === 'number' && text.length > field.maxLength) {
        errors[field.key] = `${field.label} must be at most ${field.maxLength} characters`;
      } else if (
        field.type === 'dropdown' &&
        Array.isArray(field.choices) &&
        field.choices.length > 0 &&
        !field.choices.includes(text)
      ) {
        errors[field.key] = `${field.label} must be one of the listed options`;
      }
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/** Coerce validated option values for the wire: numbers → numbers, trimmed, capped. */
export function normalizeOptionValues(
  fields?: OptionField[] | null,
  values?: Record<string, string | number>
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const field of fields ?? []) {
    const raw = values?.[field.key];
    if (raw === undefined || raw === null) continue;
    const text = String(raw).trim();
    if (!text) continue;
    if (field.type === 'number') {
      const n = Number(text);
      out[field.key] = Number.isFinite(n) ? n : text;
    } else {
      out[field.key] =
        typeof field.maxLength === 'number' ? text.slice(0, field.maxLength) : text;
    }
  }
  return out;
}

/* ───────────────────────────── Payload builders ───────────────────────────── */

/**
 * Option keys for one service: structured `selectedOptions` OR legacy
 * `selectedVariant` — never both (the backend rejects the wrong shape).
 */
function serviceOptionPayload(
  service?: Service | null,
  selectedVariant?: string,
  selectedOptions?: Record<string, string | number>
): Record<string, unknown> {
  if (service?.optionFields?.length) {
    return { selectedOptions: normalizeOptionValues(service.optionFields, selectedOptions) };
  }
  if (service?.options?.length && selectedVariant) {
    return { selectedVariant };
  }
  return {};
}

export interface QuotePayloadInput {
  service?: Service | null;
  serviceType: string;
  quantity: number;
  sla: string;
  requestedPickupTime: string;
  selectedVariant?: string;
  selectedOptions?: Record<string, string | number>;
  deliveryMethod?: string;
  deliveryAddress?: string;
  deliveryDistanceKm?: number;
  referralCode?: string;
  isFirstTimeCustomer?: boolean;
}

/** Body for POST /api/services/quote (brand is added by api.getQuote). */
export function buildQuotePayload(input: QuotePayloadInput): Record<string, unknown> {
  return {
    serviceType: input.serviceType,
    quantity: input.quantity,
    sla: input.sla,
    requestedPickupTime: input.requestedPickupTime,
    ...serviceOptionPayload(input.service, input.selectedVariant, input.selectedOptions),
    deliveryMethod: input.deliveryMethod,
    ...(input.deliveryMethod === 'LOCAL_DELIVERY'
      ? {
          deliveryAddress: input.deliveryAddress || undefined,
          deliveryDistanceKm: input.deliveryDistanceKm,
        }
      : {}),
    ...(input.referralCode ? { referralCode: input.referralCode } : {}),
    isFirstTimeCustomer: !!input.isFirstTimeCustomer,
  };
}

export interface OrderPayloadInput extends QuotePayloadInput {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerNotes?: string;
  designFileUrl?: string;
  customSpec?: {
    description: string;
    material?: string;
    dimensions?: string;
    complexity: string;
  };
}

/** Body for POST /api/orders (brand is added by api.createOrder). */
export function buildOrderPayload(input: OrderPayloadInput): Record<string, unknown> {
  const base: Record<string, unknown> = {
    quantity: input.quantity,
    sla: input.sla,
    requestedPickupTime: input.requestedPickupTime,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    deliveryMethod: input.deliveryMethod,
    ...(input.deliveryMethod === 'LOCAL_DELIVERY' ? { deliveryAddress: input.deliveryAddress } : {}),
    ...(input.designFileUrl ? { designFileUrl: input.designFileUrl } : {}),
    ...(input.customerNotes ? { customerNotes: input.customerNotes } : {}),
    ...(input.referralCode ? { referralCode: input.referralCode } : {}),
    isFirstTimeCustomer: !!input.isFirstTimeCustomer,
  };
  if (input.customSpec) {
    return { ...base, customSpec: input.customSpec };
  }
  return {
    ...base,
    serviceType: input.serviceType,
    ...serviceOptionPayload(input.service, input.selectedVariant, input.selectedOptions),
  };
}
