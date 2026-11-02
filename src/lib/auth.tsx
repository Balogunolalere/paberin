/**
 * Paberin customer auth context.
 *
 * Paberin customers don't have passwords — they "log in" by entering
 * the phone number they used to place orders. We hit `/api/magic-link`
 * (admin endpoint) to confirm the phone exists & fetch their orders.
 * If valid, we cache the phone (and a lightweight customer profile) in
 * localStorage so the dashboard and order form can prefill it.
 *
 * This is intentionally lightweight: there's no JWT, no server session.
 * The admin API's `magic-link` endpoint is the source of truth — if
 * the phone has no orders, login fails.
 *
 * For NEW customers (no orders yet), `signupAsNewCustomer` just stashes
 * the phone/name/email so the order form can prefill them; the actual
 * customer record is created implicitly when their first order is placed.
 */

'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, apiFetch, type Order, ApiError } from '@/lib/api';

export interface PaberinCustomer {
  phone: string;
  name?: string;
  email?: string;
  /** Signed session token issued by the admin backend after OTP verification. */
  token?: string;
  isNew?: boolean;
  ordersCount?: number;
  lastSeen?: string;
}

interface AuthResult {
  ok: boolean;
  error?: string;
  isNewCustomer?: boolean;
}

interface PaberinAuthContextValue {
  customer: PaberinCustomer | null;
  loading: boolean;
  /** Verify phone via magic-link endpoint. Sets customer on success. */
  loginWithPhone: (phone: string) => Promise<AuthResult>;
  /** Step 1: email a one-time code to the address on the customer's orders. */
  requestLoginCode: (info: { phone: string; name?: string; email?: string }) => Promise<AuthResult>;
  /** Step 2: exchange the code for a signed session token. */
  verifyLoginCode: (info: { phone: string; code: string; name?: string; email?: string }) => Promise<AuthResult>;
  /** Stash a new customer's details locally (no server validation). */
  signupAsNewCustomer: (info: { phone: string; name?: string; email?: string }) => void;
  logout: () => void;
  /** Update the cached profile (used after placing an order, etc). */
  updateProfile: (patch: Partial<PaberinCustomer>) => void;
}

const PaberinAuthContext = createContext<PaberinAuthContextValue | null>(null);

const STORAGE_KEY = 'paberin_customer';

function normalizePhone(phone: string): string {
  // Strip everything but digits and a leading +, collapse whitespace.
  let p = phone.trim().replace(/[^\d+]/g, '');
  // Convert 0803… → +234803…
  if (p.startsWith('0') && p.length === 11) {
    p = '+234' + p.slice(1);
  } else if (p.startsWith('234') && p.length === 13) {
    p = '+' + p;
  } else if (!p.startsWith('+') && /^\d{10,}$/.test(p)) {
    p = '+' + p;
  }
  return p;
}

export function PaberinAuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<PaberinCustomer | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PaberinCustomer;
        if (parsed?.phone) setCustomer(parsed);
      }
    } catch {
      // localStorage not available (SSR / privacy mode)
    }
    setLoading(false);
  }, []);

  const persist = useCallback((c: PaberinCustomer | null) => {
    setCustomer(c);
    try {
      if (c) localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const loginWithPhone = useCallback(
    async (rawPhone: string): Promise<AuthResult> => {
      const phone = rawPhone.trim();
      if (!phone || phone.length < 6) {
        return { ok: false, error: 'Enter a valid phone number.' };
      }
      try {
        const data = await api.getOrdersByPhone(phone);
        const profile: PaberinCustomer = {
          phone: data.phone || phone,
          ordersCount: data.orders?.length || 0,
          lastSeen: new Date().toISOString(),
          name: data.customerName || undefined,
          email: data.customerEmail || undefined,
        };
        persist(profile);
        return { ok: true, isNewCustomer: false };
      } catch (err: any) {
        // Branch on the STATUS, not the prose: the old check searched the
        // message for "not found" / "NOT_FOUND", so a rate-limited or broken
        // request could be read as "new customer", and any rewording of the
        // admin's message would break the signup path silently.
        if (err instanceof ApiError && err.isNotFound) {
          return {
            ok: false,
            error: 'No orders found for this number. Place your first order or sign up as a new customer.',
            isNewCustomer: true,
          };
        }
        return { ok: false, error: err?.message || 'Could not verify phone. Try again.' };
      }
    },
    [persist]
  );

  /** Step 1 — ask the backend to email a one-time code. */
  const requestLoginCode = useCallback(
    async (info: { phone: string; name?: string; email?: string }): Promise<AuthResult> => {
      const phone = info.phone.trim();
      if (!phone) return { ok: false, error: 'Enter a valid phone number.' };
      try {
        await apiFetch('/api/auth/otp/request', {
          method: 'POST',
          body: JSON.stringify({
            phone,
            brand: 'PABERIN',
            ...(info.name ? { name: info.name } : {}),
            ...(info.email ? { email: info.email } : {}),
          }),
        });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Could not send the login code.' };
      }
    },
    []
  );

  /** Step 2 — verify the code and persist the signed session token. */
  const verifyLoginCode = useCallback(
    async (info: { phone: string; code: string; name?: string; email?: string }): Promise<AuthResult> => {
      const phone = info.phone.trim();
      const code = info.code.replace(/\D/g, '');
      if (!phone || !/^\d{6}$/.test(code)) {
        return { ok: false, error: 'Enter the 6-digit code from your email.' };
      }
      try {
        const data = await apiFetch<{ token: string; customer: { phone?: string; name?: string; email?: string } }>(
          '/api/auth/otp/verify',
          {
            method: 'POST',
            body: JSON.stringify({
              phone,
              code,
              brand: 'PABERIN',
              ...(info.name ? { name: info.name } : {}),
              ...(info.email ? { email: info.email } : {}),
            }),
          },
        );
        if (!data?.token) return { ok: false, error: 'Could not verify that code. Please try again.' };
        persist({
          phone: data.customer?.phone || phone,
          name: data.customer?.name || info.name,
          email: data.customer?.email || info.email,
          token: data.token,
          lastSeen: new Date().toISOString(),
          ordersCount: 0,
        });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Could not verify that code. Please try again.' };
      }
    },
    [persist]
  );

  const signupAsNewCustomer = useCallback(
    (info: { phone: string; name?: string; email?: string }) => {
      const profile: PaberinCustomer = {
        phone: info.phone.trim(),
        name: info.name,
        email: info.email,
        isNew: true,
        ordersCount: 0,
        lastSeen: new Date().toISOString(),
      };
      persist(profile);
    },
    [persist]
  );

  const logout = useCallback(() => {
    persist(null);
  }, [persist]);

  const updateProfile = useCallback(
    (patch: Partial<PaberinCustomer>) => {
      setCustomer((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    []
  );

  return (
    <PaberinAuthContext.Provider
      value={{ customer, loading, loginWithPhone, requestLoginCode, verifyLoginCode, signupAsNewCustomer, logout, updateProfile }}
    >
      {children}
    </PaberinAuthContext.Provider>
  );
}

export function usePaberinAuth() {
  const ctx = useContext(PaberinAuthContext);
  if (!ctx) throw new Error('usePaberinAuth must be used within PaberinAuthProvider');
  return ctx;
}

export { normalizePhone };
