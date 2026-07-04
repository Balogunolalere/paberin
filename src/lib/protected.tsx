/**
 * Route protection for Paberin customer pages.
 *
 * Wraps any client page with an auth-gate: if no customer is logged in,
 * redirect to /login?next=<current-path>. Shows a minimal loading state
 * while the auth context hydrates from localStorage.
 */

'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { usePaberinAuth } from '@/lib/auth';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { customer, loading } = usePaberinAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!customer) {
      const next = encodeURIComponent(pathname || '/dashboard');
      router.replace(`/login?next=${next}`);
    }
  }, [customer, loading, pathname, router]);

  if (loading || !customer) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
        <div className="w-8 h-8 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin mb-6" />
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#888888]">
          Verifying access
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
