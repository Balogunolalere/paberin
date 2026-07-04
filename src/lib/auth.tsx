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
import { api, type Order } from '@/lib/api';

export interface PaberinCustomer {
  phone: string;
  name?: string;
  email?: string;
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
      const phone = normalizePhone(rawPhone);
      if (!phone || phone.length < 10) {
        return { ok: false, error: 'Enter a valid phone number.' };
      }
      try {
        const data = await api.getOrdersByPhone(phone);
        const profile: PaberinCustomer = {
          phone: data.phone || phone,
          ordersCount: data.orders?.length || 0,
          lastSeen: new Date().toISOString(),
        };
        // Best-effort: pull name/email from the most recent order
        const latest = data.orders?.[0] as Order | undefined;
        if (latest && (latest as any).customerName) {
          profile.name = (latest as any).customerName;
          profile.email = (latest as any).customerEmail;
        }
        persist(profile);
        return { ok: true, isNewCustomer: false };
      } catch (err: any) {
        const msg = String(err?.message || '');
        // If the admin responds 404 NOT_FOUND, the phone has no orders yet
        if (msg.includes('No orders found') || msg.includes('NOT_FOUND') || msg.includes('not found')) {
          return {
            ok: false,
            error: 'No orders found for this number. Place your first order or sign up as a new customer.',
            isNewCustomer: true,
          };
        }
        return { ok: false, error: msg || 'Could not verify phone. Try again.' };
      }
    },
    [persist]
  );

  const signupAsNewCustomer = useCallback(
    (info: { phone: string; name?: string; email?: string }) => {
      const profile: PaberinCustomer = {
        phone: normalizePhone(info.phone),
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
      value={{ customer, loading, loginWithPhone, signupAsNewCustomer, logout, updateProfile }}
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
