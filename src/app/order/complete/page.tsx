'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { ScrollReveal } from '@/components/ScrollReveal';
import { OrderStepper } from '@/components/OrderStepper';
import {
  api,
  formatNaira,
  formatDate,
  formatOrderState,
  orderStateClass,
  type Order,
} from '@/lib/api';

/**
 * Order completion page — handles Paystack callback.
 *
 * After a user completes payment on Paystack, they are redirected back here
 * with a `ref` query parameter. This page verifies the payment, updates the
 * order status, and displays the result.
 */

function CompleteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref') || '';
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  // Verify payment and fetch order on mount
  const verifyAndLoad = useCallback(async () => {
    if (!ref) {
      setError('No payment reference provided.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Verify the payment with the admin backend
      const verifyResult = await api.verifyPayment(ref);
      if (verifyResult.verified) {
        setVerified(true);
        // After successful verification, fetch the updated order
        // The reference is the orderNumber from initializePayment call
        const orderData = await api.trackOrder(ref);
        setOrder(orderData);
      } else {
        setError('Payment verification failed. Please try again.');
        setLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to verify payment. Please try again.');
      setLoading(false);
      console.error('Payment verification error:', err);
    }
  }, [ref]);

  useEffect(() => {
    verifyAndLoad();
  }, [verifyAndLoad]);

  // If loading, show spinner
  if (loading) {
    return (
      <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-24">
        <ScrollReveal>
          <div className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-6">
              Processing Payment
            </p>
            <div className="w-12 h-12 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-sm text-[#666666]">Verifying your payment…</p>
          </div>
        </ScrollReveal>
      </div>
    );
  }

  // If error, show error message
  if (error) {
    return (
      <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-24">
        <ScrollReveal>
          <div className="max-w-2xl mx-auto text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-6">
              Payment Issue
            </p>
            <div className="card bg-[#FFF7F0] border-[#FFD9BF] p-8 mb-6">
              <p className="text-[#E05200] font-mono text-lg mb-4">{error}</p>
            </div>
            <div className="flex gap-4 justify-center">
              <Link href="/order" className="btn-primary">
                Start New Order
              </Link>
              <Link href="/" className="btn-outline">
                Go Home
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </div>
    );
  }

  // If not verified yet (should not happen due to loading state check)
  if (!verified) {
    return (
      <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-24">
        <ScrollReveal>
          <div className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-6">
              Payment Pending
            </p>
            <p className="text-sm text-[#666666]">Your payment is being processed. Please wait.</p>
          </div>
        </ScrollReveal>
      </div>
    );
  }

  // Success state — show order confirmation
  if (!order) {
    return (
      <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-24">
        <ScrollReveal>
          <div className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-6">
              Payment Confirmed
            </p>
            <p className="text-sm text-[#666666]">Fetching order details…</p>
          </div>
        </ScrollReveal>
      </div>
    );
  }

  return (
    <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-24">
      <ScrollReveal>
        <div className="max-w-2xl mx-auto text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-6">
            Payment Confirmed
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-6xl font-bold text-black leading-[1.1] mb-6">
            Payment Successful<span className="text-[#FF5C00]">.</span>
          </h1>
          <p className="text-base text-[#666666] mb-8">
            Your order <span className="font-mono text-black">{order.orderNumber}</span> has been confirmed and production has begun.
          </p>

          {/* Order Summary Card */}
          <div className="card-premium p-6 mb-8">
            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">Service</p>
                <p className="text-black font-bold">{order.serviceLabel}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">Quantity</p>
                <p className="text-black">{order.quantity}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">Total Paid</p>
                <p className="text-black font-bold">{formatNaira(order.totalAmount)}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">SLA</p>
                <p className="text-black">{order.sla}</p>
              </div>
            </div>

            {/* Order State Badge */}
            <div className="mb-4">
              <span
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium ${orderStateClass(
                  order.state
                )}`}
              >
                <span className="w-2 h-2 rounded-full bg-current"></span>
                {formatOrderState(order.state)}
              </span>
            </div>

            {/* Timeline Preview */}
            {order.timeline && order.timeline.length > 0 && (
              <div className="mt-6 pt-6 border-t border-[#EAEAEA]">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-3">
                  Activity
                </p>
                <div className="space-y-2 text-xs">
                  {order.timeline.slice(0, 3).map((t, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#FF5C00] mt-1.5"></span>
                      <div>
                        <p className="text-black">{formatOrderState(t.state)}</p>
                        <p className="text-[#888888]">{formatDate(t.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                  {order.timeline.length > 3 && (
                    <p className="text-[#FF5C00] mt-2">… and {order.timeline.length - 3} more</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={`/track?id=${encodeURIComponent(order.orderNumber)}`}
              className="btn-primary"
            >
              Track Order
            </Link>
            <Link href="/dashboard" className="btn-outline">
              View Dashboard
            </Link>
            <Link href="/" className="btn-outline">
              Place Another Order
            </Link>
          </div>
        </div>
      </ScrollReveal>
    </div>
  );
}

export default function OrderComplete() {
  return (
    <Suspense fallback={null}>
      <CompleteInner />
    </Suspense>
  );
}
