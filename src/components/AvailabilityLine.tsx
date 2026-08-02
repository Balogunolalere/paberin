'use client';

import type { Availability } from '@/lib/api';

/** Inline material-availability line for quote cards and order steps. */
export function AvailabilityLine({ availability }: { availability?: Availability | null }) {
  if (!availability) return null;
  const { status, remaining, etaDays } = availability;
  const dot =
    status === 'IN_STOCK' ? 'bg-green-600' : status === 'LOW' ? 'bg-amber-500' : 'bg-[#E05200]';
  const label =
    status === 'IN_STOCK'
      ? 'In stock — normal lead time'
      : status === 'LOW'
        ? `Low stock (${remaining} left) — we'll confirm timing`
        : etaDays
          ? `Currently out of stock — usually back in ${etaDays} days; order anyway and we'll notify you`
          : 'Currently out of stock — order anyway and we\'ll notify you';
  return (
    <p className="flex items-center gap-2 text-xs text-[#666666]">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </p>
  );
}
