'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
 * Order tracking page.
 *
 * Pulls the `id` query param (order number), calls the admin's
 * /api/orders?id=… endpoint, and renders a state badge + timeline.
 * Works without logging in — anyone with an order number can track.
 */

function TrackInner() {
  const searchParams = useSearchParams();
  const initial = searchParams.get('id') || '';

  const [orderNumber, setOrderNumber] = useState(initial);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const track = async (num?: string) => {
    const target = (num ?? orderNumber).trim();
    if (!target) {
      setError('Enter an order number.');
      return;
    }
    setError(null);
    setLoading(true);
    setOrder(null);
    setSearched(true);
    try {
      const data = await api.trackOrder(target);
      setOrder(data);
    } catch (err: any) {
      setError(err?.message || 'Order not found.');
    } finally {
      setLoading(false);
    }
  };

  // If landed via ?id=PBR-XXX, auto-track
  useEffect(() => {
    if (initial) track(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  return (
    <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-24">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 md:gap-24 items-start">
        {/* Left — Hero copy + search */}
        <div>
          <ScrollReveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-6">
              Order Tracking
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-black leading-[1.1] max-w-[30rem]">
              Where are my parts<span className="text-[#FF5C00]">?</span>
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <p className="text-base text-[#666666] max-w-[27.5rem] mt-6 leading-relaxed">
              Enter your order number to see live status — from cutting table to
              delivery. No login required.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.3}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                track();
              }}
              className="mt-8 sm:mt-12"
            >
              <div className="space-y-2">
                <label
                  htmlFor="orderNumber"
                  className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]"
                >
                  <span className="text-[#FF5C00]">01</span> Order Number
                </label>
                <input
                  id="orderNumber"
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="PBR-2025-00123"
                  className="form-input font-mono"
                  autoCapitalize="characters"
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary mt-5 disabled:opacity-60">
                {loading ? 'Looking up…' : 'Track Order'}
              </button>
            </form>
          </ScrollReveal>

          {error && (
            <div className="mt-6 border border-[#FF5C00]/30 bg-[#FF5C00]/5 px-4 py-3 rounded text-sm text-[#E05200] max-w-[27.5rem]">
              {error}
            </div>
          )}

          <ScrollReveal delay={0.4}>
            <div className="mt-10">
              <Link
                href="/login"
                className="text-sm text-[#666666] hover:text-black transition-colors"
              >
                ← Log in to see all your orders
              </Link>
            </div>
          </ScrollReveal>
        </div>

        {/* Right — Result */}
        <div>
          {!searched && !loading && (
            <ScrollReveal delay={0.3}>
              <div className="card space-y-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                  Awaiting lookup
                </p>
                <p className="text-sm text-[#666666] leading-relaxed">
                  Your order number looks like{' '}
                  <span className="font-mono text-black">PBR-2025-00123</span> and
                  was sent in your confirmation email or SMS. Lost it? Reach us at{' '}
                  <a
                    href="mailto:skyalservices@gmail.com"
                    className="text-[#FF5C00] hover:underline"
                  >
                    skyalservices@gmail.com
                  </a>
                  .
                </p>
              </div>
            </ScrollReveal>
          )}

          {loading && (
            <div className="card flex items-center gap-4">
              <div className="w-6 h-6 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
              <p className="text-sm text-[#666666]">Fetching order status…</p>
            </div>
          )}

          {order && (
            <ScrollReveal delay={0.1}>
              <div className="space-y-6">
                {/* Header card — premium gradient border + live stepper */}
                <div className="card-premium card-premium-lg p-6 sm:p-7">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-2">
                        Order
                      </p>
                      <p className="font-mono text-xl font-bold text-black">
                        {order.orderNumber}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${orderStateClass(
                        order.state
                      )}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {formatOrderState(order.state)}
                    </span>
                  </div>

                  {/* Live progress stepper */}
                  <div className="mt-6">
                    <OrderStepper current={order.state} />
                  </div>

                  <div className="rule my-6" />

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">
                        Service
                      </p>
                      <p className="text-black">{order.serviceLabel}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">
                        Quantity
                      </p>
                      <p className="text-black">{order.quantity}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">
                        SLA
                      </p>
                      <p className="text-black">{order.sla}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">
                        Total
                      </p>
                      <p className="text-black font-semibold">
                        {formatNaira(order.totalAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">
                        Placed
                      </p>
                      <p className="text-black">{formatDate(order.createdAt)}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">
                        Delivery
                      </p>
                      <p className="text-black">
                        {order.deliveryMethod
                          ? order.deliveryMethod.replace(/_/g, ' ').toLowerCase()
                          : '—'}
                      </p>
                    </div>
                  </div>

                  {order.trackingPin && (
                    <div className="mt-5 pt-5 border-t border-[#EAEAEA]">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">
                        Tracking PIN
                      </p>
                      <p className="font-mono text-lg text-[#FF5C00] font-bold">
                        {order.trackingPin}
                      </p>
                    </div>
                  )}
                </div>

                {/* Timeline */}
                {order.timeline && order.timeline.length > 0 && (
                  <div className="card">
                    <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-5">
                      Status Timeline
                    </p>
                    <ol className="space-y-4">
                      {order.timeline.map((t, i) => (
                        <li key={i} className="flex gap-4 items-start">
                          <div className="flex flex-col items-center pt-1">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${
                                i === order.timeline!.length - 1
                                  ? 'bg-[#FF5C00]'
                                  : 'bg-[#D4D4D4]'
                              }`}
                            />
                            {i < order.timeline!.length - 1 && (
                              <span className="w-px h-8 bg-[#EAEAEA] mt-1" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-black">
                              {formatOrderState(t.state)}
                            </p>
                            <p className="text-xs text-[#888888] mt-0.5">
                              {formatDate(t.timestamp)}{' '}
                              {new Date(t.timestamp).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </p>
                            {t.note && (
                              <p className="text-xs text-[#666666] mt-1 italic">
                                {t.note}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Modifiable actions */}
                {order.canModify && (
                  <div className="card bg-[#FFF7F0] border-[#FFD9BF]">
                    <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#E05200] mb-2">
                      Grace period active
                    </p>
                    <p className="text-sm text-[#666666] leading-relaxed">
                      You can still modify or cancel this order. Contact us at{' '}
                      <a
                        href="tel:+2348035003068"
                        className="text-[#FF5C00] hover:underline"
                      >
                        0803 500 3068
                      </a>{' '}
                      before it enters production.
                    </p>
                  </div>
                )}
              </div>
            </ScrollReveal>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-24">
          <div className="w-8 h-8 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
        </div>
      }
    >
      <TrackInner />
    </Suspense>
  );
}
