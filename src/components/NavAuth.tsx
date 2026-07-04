/**
 * Auth-aware Nav slot.
 *
 * Renders different right-side CTAs based on the customer's auth state:
 *   - Logged out → "Login" link + "Order" primary button
 *   - Logged in  → "Dashboard" link (showing customer's name) + "Logout"
 *
 * Used inside Nav.tsx so the same header serves both anonymous and
 * authenticated visitors. Purely presentational — no side effects.
 */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePaberinAuth } from '@/lib/auth';

export function NavAuth({ compact = false }: { compact?: boolean }) {
  const { customer, loading, logout } = usePaberinAuth();
  const router = useRouter();

  if (loading) {
    // Reserve space to avoid layout shift
    return <div className="hidden sm:block w-20 h-9" aria-hidden />;
  }

  if (customer) {
    const initial = (customer.name || customer.phone).trim().charAt(0).toUpperCase();
    return (
      <div className="hidden sm:flex items-center gap-3">
        <Link
          href="/dashboard"
          className={`inline-flex items-center gap-2 text-sm text-[#666666] hover:text-black transition-colors ${
            compact ? '' : ''
          }`}
        >
          <span className="w-7 h-7 rounded-full bg-[#FF5C00] text-white text-xs font-bold flex items-center justify-center">
            {initial}
          </span>
          <span className="hidden lg:inline">
            {customer.name ? customer.name.split(' ')[0] : 'Dashboard'}
          </span>
        </Link>
        <button
          onClick={() => {
            logout();
            router.push('/');
          }}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#888888] hover:text-black transition-colors"
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="hidden sm:flex items-center gap-3">
      <Link
        href="/login"
        className="text-sm text-[#666666] hover:text-black transition-colors"
      >
        Login
      </Link>
      <Link href="/order" className="btn-primary h-9 px-4 text-xs">
        Order
      </Link>
    </div>
  );
}
