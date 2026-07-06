'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ScrollReveal } from '@/components/ScrollReveal';
import { ProtectedRoute } from '@/lib/protected';
import { usePaberinAuth } from '@/lib/auth';
import {
  api,
  formatNaira,
  formatDate,
  formatOrderState,
  orderStateClass,
  type Order,
  type Escalation,
} from '@/lib/api';

/**
 * Customer dashboard — protected route.
 *
 * Shows the logged-in customer's order history (pulled fresh from the
 * admin magic-link endpoint), with quick links to track each order,
 * start a new one, or chat with Paberin support.
 *
 * Each order row opens an in-page detail dialog with the full order
 * (including the timeline fetched from /api/orders?id=…). Inside the
 * dialog the customer can raise an escalation; past escalations are
 * listed in a dedicated section below the orders list.
 */

const ESCALATION_REASONS = ['Quality issue', 'Delay', 'Wrong item', 'Other'] as const;

const ESCALATION_STATUS_CLASS: Record<string, string> = {
  OPEN: 'bg-[#FF5C00]/10 text-[#FF5C00] border-[#FF5C00]/30',
  PENDING: 'bg-[#FF5C00]/10 text-[#FF5C00] border-[#FF5C00]/30',
  IN_REVIEW: 'bg-[#FF5C00]/10 text-[#FF5C00] border-[#FF5C00]/30',
  RESOLVED: 'bg-[#F7F7F7] text-[#666666] border-[#EAEAEA]',
  CLOSED: 'bg-[#F7F7F7] text-[#666666] border-[#EAEAEA]',
  REJECTED: 'bg-[#FFF7F0] text-[#E05200] border-[#FFD9BF]',
};

/* ── Relative time formatter (e.g. "2 hours ago") for Recent Updates ── */
function relativeTime(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#888888] mb-2">
        {label}
      </p>
      <p className="text-2xl sm:text-3xl font-bold text-black tabular-nums">{value}</p>
    </div>
  );
}

function DashboardContent() {
  const { customer, logout, updateProfile } = usePaberinAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  /* ── Detail dialog state ── */
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [detailData, setDetailData] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  /* ── Escalation form state ── */
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalateReason, setEscalateReason] = useState<(typeof ESCALATION_REASONS)[number]>('Quality issue');
  const [escalateMessage, setEscalateMessage] = useState('');
  const [escalateSubmitting, setEscalateSubmitting] = useState(false);
  const [escalateError, setEscalateError] = useState<string | null>(null);
  const [escalateSuccess, setEscalateSuccess] = useState<string | null>(null);

  /* ── Escalations list state ── */
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [escalationsLoading, setEscalationsLoading] = useState(false);
  const [escalationsError, setEscalationsError] = useState<string | null>(null);

  /* ── Profile edit state (Feature 1) ── */
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!customer?.phone) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getOrdersByPhone(customer.phone);
      setOrders((data.orders as Order[]) || []);
    } catch (err: any) {
      setError(err?.message || 'Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, [customer?.phone]);

  const loadEscalations = useCallback(async () => {
    if (!customer?.phone) return;
    setEscalationsLoading(true);
    setEscalationsError(null);
    try {
      const data: any = await api.getEscalations(customer.phone);
      // The admin API returns { data: { escalations: [...] } }. After
      // apiFetch unwraps `data.data`, we get { escalations: [...] }.
      // Handle that nested shape, a plain array, and a few fallbacks.
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.escalations)
          ? data.escalations
          : Array.isArray(data?.data)
            ? data.data
            : [];
      setEscalations(list);
    } catch (err: any) {
      // The escalations endpoint may not be live yet — show empty, no error.
      setEscalations([]);
      setEscalationsError(null);
    } finally {
      setEscalationsLoading(false);
    }
  }, [customer?.phone]);

  useEffect(() => {
    loadOrders();
    loadEscalations();
  }, [loadOrders, loadEscalations]);

  const openDetail = async (o: Order) => {
    setDetailOrder(o);
    setDetailData(null);
    setDetailError(null);
    setShowEscalate(false);
    setEscalateError(null);
    setEscalateSuccess(null);
    setEscalateMessage('');
    setEscalateReason('Quality issue');
    setDetailLoading(true);
    try {
      const data = await api.trackOrder(o.orderNumber);
      setDetailData(data);
    } catch (err: any) {
      setDetailError(err?.message || 'Could not load order details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOrder(null);
    setDetailData(null);
    setDetailError(null);
    setShowEscalate(false);
    setEscalateError(null);
    setEscalateSuccess(null);
  };

  const submitEscalation = async () => {
    if (!detailOrder || !customer?.phone) return;
    if (!escalateMessage.trim()) {
      setEscalateError('Please describe the issue in the message field.');
      return;
    }
    setEscalateSubmitting(true);
    setEscalateError(null);
    try {
      const res = await api.createEscalation({
        orderNumber: detailOrder.orderNumber,
        customerPhone: customer.phone,
        customerName: detailOrder.customerName || customer.name,
        reason: escalateReason,
        message: escalateMessage.trim(),
      });
      const ticket = (res as any)?.ticketId || (res as any)?.id || '—';
      setEscalateSuccess(ticket);
      setShowEscalate(false);
      setEscalateMessage('');
      // Refresh escalations list
      loadEscalations();
    } catch (err: any) {
      setEscalateError(err?.message || 'Failed to submit escalation. Please try again.');
    } finally {
      setEscalateSubmitting(false);
    }
  };

  const activeStates = [
    'PAYMENT_PENDING',
    'PAYMENT_SUCCESS',
    'ON_HOLD',
    'IN_PROGRESS',
    'CUTTING',
    'QC',
    'READY_FOR_PICKUP',
    'OUT_FOR_DELIVERY',
    'IN_QUEUE',
    'IN_PRODUCTION',
    'READY',
    'DISPATCHED',
  ];
  const completedStates = ['DELIVERED', 'COMPLETED'];

  const filtered = orders.filter((o) => {
    if (filter === 'active') return activeStates.includes(o.state);
    if (filter === 'completed') return completedStates.includes(o.state);
    return true;
  });

  const totalSpent = orders
    .filter((o) => completedStates.includes(o.state) || o.state === 'OUT_FOR_DELIVERY' || o.state === 'DISPATCHED')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const activeCount = orders.filter((o) => activeStates.includes(o.state)).length;

  /* ── Recent Updates: last 3 orders by updatedAt (Feature 3) ── */
  const recentUpdates = [...orders]
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime()
    )
    .slice(0, 3);

  /* ── Profile editor (Feature 1) ── */
  const openProfileEdit = () => {
    setEditName(customer?.name || '');
    setEditEmail(customer?.email || '');
    setProfileSaved(false);
    setShowProfileEdit(true);
  };

  const saveProfile = () => {
    updateProfile({
      name: editName.trim() || customer?.name,
      email: editEmail.trim() || customer?.email,
      lastSeen: new Date().toISOString(),
    });
    setProfileSaved(true);
    setTimeout(() => {
      setShowProfileEdit(false);
      setProfileSaved(false);
    }, 900);
  };

  /* ── Reorder: jump to the order page with service + qty pre-filled (Feature 2) ── */
  const handleReorder = (o: Order) => {
    const params = new URLSearchParams();
    if (o.serviceType) params.set('service', o.serviceType);
    if (o.quantity) params.set('qty', String(o.quantity));
    const qs = params.toString();
    window.location.href = `/order${qs ? `?${qs}` : ''}`;
  };

  return (
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-20">
      {/* Header */}
      <ScrollReveal>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-3">
              Dashboard
            </p>
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-black leading-[1.1]">
              Hello,{' '}
              <span className="text-[#FF5C00]">
                {customer?.name?.split(' ')[0] || 'there'}
              </span>
              .
            </h1>
            <p className="text-sm text-[#666666] mt-3 font-mono">
              {customer?.phone}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/order" className="btn-primary">
              New Order
            </Link>
            <button
              onClick={logout}
              className="btn-outline"
            >
              Logout
            </button>
          </div>
        </div>
      </ScrollReveal>

      {/* Recent Updates (Feature 3) */}
      {recentUpdates.length > 0 && (
        <ScrollReveal delay={0.05}>
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#FF5C00" strokeWidth="1.6">
                <path d="M10 2a6 6 0 00-6 6c0 3-1 4-2 5h16c-1-1-2-2-2-5a6 6 0 00-6-6zM8 17a2 2 0 004 0" />
              </svg>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                Recent Updates
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {recentUpdates.map((o) => (
                <button
                  key={o.orderNumber}
                  onClick={() => openDetail(o)}
                  className="card hover-lift text-left"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="font-mono text-sm font-bold text-black">{o.orderNumber}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888]">
                      {relativeTime(o.updatedAt || o.createdAt)}
                    </p>
                  </div>
                  <p className="text-xs text-black leading-relaxed">
                    Moved to{' '}
                    <span className="font-semibold text-[#FF5C00]">
                      {formatOrderState(o.state)}
                    </span>
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mt-2">
                    {o.serviceLabel} · Qty {o.quantity}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* Profile card (Feature 1) */}
      <ScrollReveal delay={0.08}>
        {showProfileEdit ? (
          <div className="card mb-10">
            <div className="flex items-center gap-2 mb-5">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#FF5C00" strokeWidth="1.6">
                <circle cx="10" cy="7" r="3" />
                <path d="M4 17c0-3 3-5 6-5s6 2 6 5" />
              </svg>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                Edit your profile
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2">
                  Name
                </label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Your name"
                  className="form-input"
                />
              </div>
              <div>
                <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2">
                  Phone
                </label>
                <input
                  value={customer?.phone || ''}
                  readOnly
                  disabled
                  className="opacity-60 cursor-not-allowed
                  placeholder="+234…"
                  className="form-input"
                />
              </div>
              <div>
                <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="form-input"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={() => {
                  setShowProfileEdit(false);
                  setProfileSaved(false);
                }}
                className="btn-outline"
              >
                Cancel
              </button>
              <button onClick={saveProfile} className="btn-primary">
                {profileSaved ? '✓ Saved' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="card mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#FF5C00] text-white flex items-center justify-center font-bold text-lg shrink-0">
                {(customer?.name?.charAt(0) || '?').toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-black truncate">
                  {customer?.name || 'Paberin customer'}
                </p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {customer?.phone && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888]">
                      {customer.phone}
                    </span>
                  )}
                  {customer?.email && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] truncate">
                      {customer.email}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={openProfileEdit} className="btn-outline self-start sm:self-auto">
              Edit profile
            </button>
          </div>
        )}
      </ScrollReveal>

      {/* Stats */}
      <ScrollReveal delay={0.1}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <StatCard label="Total Orders" value={orders.length} />
          <StatCard label="Active Jobs" value={activeCount} />
          <StatCard label="Lifetime Spend" value={formatNaira(totalSpent)} />
        </div>
      </ScrollReveal>

      {/* Quick actions */}
      <ScrollReveal delay={0.2}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          <Link href="/order" className="card hover-lift group">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#888888] mb-2">
              01 / Start
            </p>
            <p className="text-lg font-bold text-black mb-1">Place an Order</p>
            <p className="text-xs text-[#666666]">
              Multi-step form, live quotes, instant payment.
            </p>
          </Link>
          <Link href="/track" className="card hover-lift group">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#888888] mb-2">
              02 / Track
            </p>
            <p className="text-lg font-bold text-black mb-1">Track an Order</p>
            <p className="text-xs text-[#666666]">
              No login required — just the order number.
            </p>
          </Link>
          <Link href="/chat" className="card hover-lift group">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#888888] mb-2">
              03 / Ask
            </p>
            <p className="text-lg font-bold text-black mb-1">Chat with Paberin</p>
            <p className="text-xs text-[#666666]">
              Ask about materials, quotes, lead times.
            </p>
          </Link>
        </div>
      </ScrollReveal>

      {/* Orders */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-black">Your Orders</h2>
          <div className="flex items-center gap-1 p-1 bg-[#F7F7F7] rounded-lg w-fit">
            {(['all', 'active', 'completed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  filter === f
                    ? 'bg-white text-black shadow-sm'
                    : 'text-[#888888] hover:text-black'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="card flex items-center gap-4">
            <div className="w-5 h-5 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
            <p className="text-sm text-[#666666]">Loading your orders…</p>
          </div>
        ) : error ? (
          <div className="card border-[#FF5C00]/30 bg-[#FF5C00]/5">
            <p className="text-sm text-[#E05200]">{error}</p>
            <button onClick={loadOrders} className="btn-outline mt-4">
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-3">
              No {filter !== 'all' ? filter : ''} orders yet
            </p>
            <p className="text-base text-[#666666] mb-6 max-w-sm mx-auto">
              {filter === 'all'
                ? "You haven't placed any orders. Let's fix that."
                : `You have no ${filter} orders right now.`}
            </p>
            <Link href="/order" className="btn-primary inline-flex">
              Place Your First Order
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((order, i) => (
              <ScrollReveal key={order.orderNumber} delay={Math.min(i * 0.05, 0.3)}>
                <div
                  onClick={() => openDetail(order)}
                  className="card hover-lift block group w-full text-left cursor-pointer"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                    {/* Order number + service */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <p className="font-mono text-sm font-bold text-black">
                          {order.orderNumber}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium ${orderStateClass(
                            order.state
                          )}`}
                        >
                          <span className="w-1 h-1 rounded-full bg-current" />
                          {formatOrderState(order.state)}
                        </span>
                      </div>
                      <p className="text-sm text-[#666666] truncate">
                        {order.serviceLabel} · Qty {order.quantity}
                      </p>
                    </div>

                    {/* Date */}
                    <div className="text-left sm:text-right">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-0.5">
                        Placed
                      </p>
                      <p className="text-sm text-black">{formatDate(order.createdAt)}</p>
                    </div>

                    {/* Total */}
                    <div className="text-left sm:text-right">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-0.5">
                        Total
                      </p>
                      <p className="text-sm font-bold text-black">
                        {formatNaira(order.totalAmount)}
                      </p>
                    </div>

                    {/* Reorder button (Feature 2) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReorder(order);
                      }}
                      className="btn-outline text-xs px-3 py-2 whitespace-nowrap"
                      title="Place a new order with the same service & quantity"
                    >
                      ↻ Reorder
                    </button>

                    {/* Arrow */}
                    <div className="hidden sm:flex items-center text-[#888888] group-hover:text-[#FF5C00] transition-colors">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M4 10h12M11 5l5 5-5 5" />
                      </svg>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        )}
      </div>

      {/* ── Escalations section ── */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-black">Your Escalations</h2>
          {escalations.length > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#888888]">
              {escalations.length} {escalations.length === 1 ? 'ticket' : 'tickets'}
            </span>
          )}
        </div>

        {escalationsLoading ? (
          <div className="card flex items-center gap-4">
            <div className="w-5 h-5 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
            <p className="text-sm text-[#666666]">Loading escalations…</p>
          </div>
        ) : escalationsError ? (
          <div className="card border-[#FF5C00]/30 bg-[#FF5C00]/5">
            <p className="text-sm text-[#E05200]">{escalationsError}</p>
          </div>
        ) : escalations.length === 0 ? (
          <div className="card flex items-start gap-3">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#888888" strokeWidth="1.5" className="mt-0.5 shrink-0">
              <path d="M4 14V8a6 6 0 0112 0v6M2 14h16M9 17h2" />
            </svg>
            <div>
              <p className="text-sm font-medium text-black">No escalations yet.</p>
              <p className="text-xs text-[#666666] mt-1 leading-relaxed">
                Open any order to raise an escalation if something isn&apos;t right — our team will respond within 24 hours.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {escalations.map((e) => {
              const statusKey = (e.status || 'open').toUpperCase();
              const statusClass =
                ESCALATION_STATUS_CLASS[statusKey] || 'bg-[#F7F7F7] text-[#666666] border-[#EAEAEA]';
              return (
                <div key={e.id || e.ticketId} className="card">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <p className="font-mono text-sm font-bold text-black">
                          {e.ticketId || e.id}
                        </p>
                        {e.orderNumber && (
                          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#888888]">
                            order · {e.orderNumber}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-[0.12em] ${statusClass}`}
                        >
                          <span className="w-1 h-1 rounded-full bg-current" />
                          {e.status || 'open'}
                        </span>
                      </div>
                      <p className="text-sm text-black mt-1">
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#888888]">
                          reason ·{' '}
                        </span>
                        {e.reason}
                      </p>
                      {e.message && (
                        <p className="text-xs text-[#666666] mt-1.5 leading-relaxed">
                          {e.message}
                        </p>
                      )}
                      {e.response && (
                        <div className="mt-3 pt-3 border-t border-[#EAEAEA] bg-[#FFF7F0] -mx-5 -mb-5 px-5 pb-5 pt-3 rounded-b-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#FF5C00" strokeWidth="1.6">
                              <path d="M3 5h14v8H7l-4 3V5z" />
                            </svg>
                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#FF5C00] font-semibold">
                              Team Response
                            </p>
                          </div>
                          <p className="text-xs text-black leading-relaxed">{e.response}</p>
                          {e.updatedAt && (
                            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mt-2">
                              Responded {new Date(e.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-0.5">
                        opened
                      </p>
                      <p className="text-xs text-black">{formatDate(e.createdAt)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Order detail dialog ── */}
      {detailOrder && (
        <div
          className="fixed inset-0 z-[200] bg-black/50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={closeDetail}
        >
          <div
            className="bg-white border border-[#EAEAEA] w-full max-w-2xl my-4 sm:my-0 relative rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog header */}
            <div className="flex items-start justify-between p-5 sm:p-6 border-b border-[#EAEAEA]">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-2">
                  Order Details
                </p>
                <p className="font-mono text-xl font-bold text-[#FF5C00]">
                  {detailOrder.orderNumber}
                </p>
              </div>
              <button
                onClick={closeDetail}
                className="text-[#888888] hover:text-black transition-colors p-1 -m-1"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            {/* Dialog body */}
            <div className="p-5 sm:p-6 max-h-[60vh] overflow-y-auto">
              {detailLoading && (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <div className="w-5 h-5 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
                  <span className="text-sm text-[#666666]">Loading details…</span>
                </div>
              )}

              {detailError && !detailLoading && (
                <div className="border border-[#FF5C00]/30 bg-[#FF5C00]/5 px-4 py-3 rounded text-sm text-[#E05200]">
                  {detailError}
                </div>
              )}

              {!detailLoading && !detailError && (
                <>
                  {/* Status row */}
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <span
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${orderStateClass(
                        detailOrder.state
                      )}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {formatOrderState(detailOrder.state)}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#888888]">
                      {formatDate(detailOrder.createdAt)}
                    </span>
                  </div>

                  {/* Detail grid */}
                  <div className="grid grid-cols-2 gap-x-5 gap-y-4 bg-[#F7F7F7] border border-[#EAEAEA] rounded-lg p-5">
                    <DetailItem k="Service" v={detailData?.serviceLabel || detailOrder.serviceLabel} />
                    <DetailItem k="Quantity" v={String(detailData?.quantity ?? detailOrder.quantity)} />
                    <DetailItem k="Total" v={formatNaira(detailData?.totalAmount ?? detailOrder.totalAmount)} />
                    <DetailItem k="SLA" v={detailData?.sla || detailOrder.sla || 'Standard'} />
                    <DetailItem
                      k="Delivery"
                      v={
                        (detailData?.deliveryMethod || detailOrder.deliveryMethod)
                          ? (detailData?.deliveryMethod || detailOrder.deliveryMethod || '').replace(/_/g, ' ').toLowerCase()
                          : '—'
                      }
                    />
                    {detailData?.deliveryAddress && (
                      <DetailItem k="Address" v={detailData.deliveryAddress} />
                    )}
                    {detailData?.trackingPin && (
                      <DetailItem k="Tracking PIN" v={detailData.trackingPin} />
                    )}
                  </div>

                  {/* Timeline */}
                  {detailData?.timeline && detailData.timeline.length > 0 && (
                    <div className="mt-6">
                      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-4">
                        Status Timeline
                      </p>
                      <ol className="space-y-3">
                        {detailData.timeline.map((t, i) => (
                          <li key={i} className="flex gap-3 items-start">
                            <div className="flex flex-col items-center pt-1">
                              <span
                                className={`w-2.5 h-2.5 rounded-full ${
                                  i === detailData.timeline!.length - 1
                                    ? 'bg-[#FF5C00]'
                                    : 'bg-[#D4D4D4]'
                                }`}
                              />
                              {i < detailData.timeline!.length - 1 && (
                                <span className="w-px h-6 bg-[#EAEAEA] mt-1" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-black">
                                {formatOrderState(t.state)}
                              </p>
                              <p className="font-mono text-[10px] text-[#888888] mt-0.5">
                                {new Date(t.timestamp).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </p>
                              {t.note && (
                                <p className="text-xs text-[#666666] mt-1 italic">{t.note}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Escalate success message */}
                  {escalateSuccess ? (
                    <div className="mt-6 border border-[#FF5C00]/30 bg-[#FFF7F0] rounded-lg p-5 text-center">
                      <div className="w-10 h-10 mx-auto rounded-full bg-[#FF5C00]/10 flex items-center justify-center mb-3">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#FF5C00" strokeWidth="2">
                          <path d="M5 10l3 3 7-7" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-black mb-1">Escalation submitted</p>
                      <p className="text-xs text-[#666666]">
                        Ticket <span className="font-mono text-[#FF5C00] font-bold">{escalateSuccess}</span> — our team will review and respond within 24 hours.
                      </p>
                      <button
                        onClick={() => {
                          setEscalateSuccess(null);
                          closeDetail();
                        }}
                        className="btn-outline mt-4"
                      >
                        Done
                      </button>
                    </div>
                  ) : showEscalate ? (
                    /* Escalate form */
                    <div className="mt-6 bg-[#F7F7F7] border border-[#EAEAEA] rounded-lg p-5">
                      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-4">
                        Escalate this order
                      </p>
                      <div className="space-y-4">
                        <div>
                          <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2">
                            Reason
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {ESCALATION_REASONS.map((r) => (
                              <button
                                key={r}
                                onClick={() => setEscalateReason(r)}
                                className={`p-3 border rounded-md text-left text-sm transition-colors ${
                                  escalateReason === r
                                    ? 'border-[#FF5C00] bg-white text-black ring-1 ring-[#FF5C00]'
                                    : 'border-[#EAEAEA] bg-white text-[#666666] hover:border-black'
                                }`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2">
                            Message
                          </label>
                          <textarea
                            value={escalateMessage}
                            onChange={(e) => setEscalateMessage(e.target.value)}
                            rows={3}
                            placeholder="Tell us what went wrong. The more detail, the faster we can fix it."
                            className="form-input resize-none"
                          />
                        </div>
                        {escalateError && (
                          <div className="border border-[#FF5C00]/30 bg-[#FF5C00]/5 px-3 py-2 rounded text-sm text-[#E05200]">
                            {escalateError}
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => {
                              setShowEscalate(false);
                              setEscalateError(null);
                              setEscalateMessage('');
                            }}
                            disabled={escalateSubmitting}
                            className="btn-outline disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={submitEscalation}
                            disabled={escalateSubmitting}
                            className="btn-primary disabled:opacity-60"
                          >
                            {escalateSubmitting ? 'Submitting…' : 'Submit escalation'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleReorder(detailOrder)}
                        className="btn-primary"
                      >
                        Reorder
                      </button>
                      <button
                        onClick={() => setShowEscalate(true)}
                        className="btn-outline border-[#FF5C00]/40 text-[#FF5C00] hover:bg-[#FF5C00] hover:text-white"
                      >
                        Escalate this order
                      </button>
                      <Link
                        href={`/track?id=${encodeURIComponent(detailOrder.orderNumber)}`}
                        className="btn-outline"
                      >
                        Full tracking page →
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Dialog footer */}
            <div className="border-t border-[#EAEAEA] p-4 sm:p-5 flex items-center justify-between gap-3 bg-[#F7F7F7] rounded-b-lg">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888]">
                Placed {formatDate(detailOrder.createdAt)}
              </p>
              <button
                onClick={closeDetail}
                className="text-sm text-[#666666] hover:text-black transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888] mb-1">{k}</p>
      <p className="text-sm text-black break-words">{v}</p>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
