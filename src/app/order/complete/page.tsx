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
  const paystackRef = searchParams.get('reference') || searchParams.get('trxref') || '';
  const orderNum = searchParams.get('order') || '';
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Verify payment and fetch order on mount — runs once
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!paystackRef) {
        if (!cancelled) {
          setError('No payment reference provided.');
          setLoading(false);
        }
        return;
      }

      try {
        // Verify the payment with the admin backend
        const verifyResult = await api.verifyPayment(paystackRef);
        if (!verifyResult.verified) {
          if (!cancelled) {
            setError('Payment verification failed. Please try again.');
            setLoading(false);
          }
          return;
        }

        // Fetch order details by order number (passed in callback URL)
        if (orderNum) {
          try {
            const orderData = await api.trackOrder(orderNum);
            if (!cancelled) setOrder(orderData);
          } catch {
            console.warn('Could not fetch order details');
          }
        }

        if (!cancelled) setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to verify payment.');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []); // Run once on mount

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

  // Success state — show order confirmation (even without full order details)
  const printReceipt = () => {
    const num = order?.orderNumber || orderNum || 'N/A';
    const svc = order?.serviceLabel || 'Your order';
    const total = order?.totalAmount ? formatNaira(order.totalAmount) : '—';
    const name = order?.customerName || '';
    const phone = order?.customerPhone || '';
    const email = order?.customerEmail || '';
    const date = order?.createdAt
      ? new Date(order.createdAt).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt ${num}</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:400px;margin:40px auto;padding:20px;color:#1a1a1a}
h1{font-size:20px;margin-bottom:4px}.brand{color:#FF5C00;font-weight:600;font-size:14px;margin-bottom:20px}
table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:8px 0;border-bottom:1px solid #e5e5e5;font-size:14px}
td:last-child{text-align:right;font-weight:500}.total{font-size:18px;font-weight:700}
.footer{margin-top:24px;font-size:12px;color:#888;text-align:center}@media print{body{margin:0;padding:20px}}</style></head><body>
<h1>Paberin Creations</h1><div class="brand">ORDER RECEIPT</div><table>
<tr><td>Order Number</td><td style="font-family:monospace">${num}</td></tr>
<tr><td>Service</td><td>${svc}</td></tr>
<tr><td>Customer</td><td>${name || '—'}</td></tr>
<tr><td>Phone</td><td>${phone || '—'}</td></tr>
<tr><td>Email</td><td>${email || '—'}</td></tr>
<tr><td>Date</td><td>${date}</td></tr>
<tr><td>Status</td><td style="color:#16a34a;font-weight:600">PAID</td></tr>
<tr class="total"><td>Total</td><td>${total}</td></tr></table>
<div class="footer">Thank you for your order!<br>Paberin Creations · Wempco Rd, Ogba, Ikeja, Lagos</div></body></html>`;
    const w = window.open('', '_blank', 'width=500,height=700');
    if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
  };

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
            Your order{order ? <span> <span className="font-mono text-black">{order.orderNumber}</span></span> : ''} has been confirmed and production has begun.
          </p>

          {/* Order Summary Card */}
          {order && (
            <div className="card-premium p-6 mb-8">
              <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">Service</p>
                  <p className="text-black font-bold">{order.serviceLabel}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">Customer</p>
                  <p className="text-black">{order.customerName}</p>
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

              <div className="mb-4">
                <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium ${orderStateClass(order.state)}`}>
                  <span className="w-2 h-2 rounded-full bg-current"></span>
                  {formatOrderState(order.state)}
                </span>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={printReceipt} className="btn-outline">
              🖨️ Print / Save Receipt (PDF)
            </button>
            <Link href="/dashboard" className="btn-primary">
              View Dashboard
            </Link>
            <Link href="/order" className="btn-primary">
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
