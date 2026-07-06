'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ScrollReveal } from '@/components/ScrollReveal';
import { ProtectedRoute } from '@/lib/protected';
import { usePaberinAuth } from '@/lib/auth';
import {
  api,
  formatDate,
  type SavedDesign,
  type PhoneOrdersResponse,
} from '@/lib/api';

/**
 * Saved designs / files — protected.
 *
 * Lets a customer keep a library of design files. Two ways to add:
 *   (a) Save from a past order (copies the order's design file URL).
 *   (b) Add by URL (paste a link to a file already hosted somewhere).
 * Lists existing designs with open + delete actions.
 */

type AddMode = 'order' | 'url' | null;

function DesignsContent() {
  const { customer } = usePaberinAuth();
  const phone = customer?.phone || '';

  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const [addMode, setAddMode] = useState<AddMode>(null);
  const [orders, setOrders] = useState<PhoneOrdersResponse['orders']>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Order-mode form
  const [orderPick, setOrderPick] = useState('');
  const [orderName, setOrderName] = useState('');

  // URL-mode form
  const [urlName, setUrlName] = useState('');
  const [urlFile, setUrlFile] = useState('');
  const [urlServiceType, setUrlServiceType] = useState('');
  const [urlNotes, setUrlNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!phone) return;
    setLoading(true);
    try {
      const data = await api.getSavedDesigns(phone);
      setDesigns(data.designs || []);
    } catch (err: any) {
      setActionError(err?.message || 'Could not load saved designs.');
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    load();
  }, [load]);

  // Lazy-load the customer's orders only when the "save from order" tab opens.
  const loadOrders = useCallback(async () => {
    if (!phone || orders.length) return;
    setOrdersLoading(true);
    try {
      const data = await api.getOrdersByPhone(phone);
      setOrders(data.orders || []);
    } catch {
      // swallow — the dropdown just stays empty
    } finally {
      setOrdersLoading(false);
    }
  }, [phone, orders.length]);

  const openMode = (mode: AddMode) => {
    setFormError(null);
    setAddMode(mode);
    if (mode === 'order') loadOrders();
  };

  const closeMode = () => {
    setAddMode(null);
    setOrderPick('');
    setOrderName('');
    setUrlName('');
    setUrlFile('');
    setUrlServiceType('');
    setUrlNotes('');
    setFormError(null);
  };

  const submitFromOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    if (!orderPick || !orderName.trim()) {
      setFormError('Pick an order and name this design.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await api.createSavedDesign({
        customerPhone: phone,
        name: orderName.trim(),
        fromOrderNumber: orderPick,
      });
      await load();
      closeMode();
    } catch (err: any) {
      setFormError(err?.message || 'Could not save design. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitByUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    if (!urlName.trim() || !urlFile.trim()) {
      setFormError('Name and file URL are required.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await api.createSavedDesign({
        customerPhone: phone,
        name: urlName.trim(),
        fileUrl: urlFile.trim(),
        serviceType: urlServiceType.trim() || undefined,
        notes: urlNotes.trim() || undefined,
      });
      await load();
      closeMode();
    } catch (err: any) {
      setFormError(err?.message || 'Could not save design. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async (id: string) => {
    if (!phone) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api.deleteSavedDesign(id, phone);
      setConfirmDeleteId(null);
      await load();
    } catch (err: any) {
      setActionError(err?.message || 'Could not delete design.');
    } finally {
      setDeleting(false);
    }
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
              Saved designs<span className="text-[#FF5C00]">.</span>
            </h1>
            <p className="text-sm text-[#666666] mt-3 leading-relaxed max-w-[34rem]">
              A library of your design files. Reuse them on new orders without
              re-uploading or digging through old emails.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-[#666666] hover:text-black transition-colors">
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </ScrollReveal>

      {actionError && (
        <div className="mb-6 border border-[#FF5C00]/30 bg-[#FF5C00]/5 px-4 py-3 rounded text-sm text-[#E05200]">
          {actionError}
        </div>
      )}

      {/* Add design — mode switcher */}
      <ScrollReveal delay={0.05}>
        <div className="mb-8">
          {!addMode ? (
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => openMode('order')} className="btn-primary">
                + Save from a past order
              </button>
              <button onClick={() => openMode('url')} className="btn-outline">
                + Add by URL
              </button>
            </div>
          ) : (
            <div className="card">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setAddMode('order');
                      loadOrders();
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      addMode === 'order'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-[#666666] border-[#EAEAEA] hover:border-black hover:text-black'
                    }`}
                  >
                    From a past order
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setAddMode('url');
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      addMode === 'url'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-[#666666] border-[#EAEAEA] hover:border-black hover:text-black'
                    }`}
                  >
                    Add by URL
                  </button>
                </div>
                <button
                  type="button"
                  onClick={closeMode}
                  className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#888888] hover:text-black transition-colors"
                >
                  Cancel
                </button>
              </div>

              {addMode === 'order' && (
                <form onSubmit={submitFromOrder} className="space-y-5">
                  <div>
                    <label
                      htmlFor="orderPick"
                      className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2"
                    >
                      Pick a past order
                    </label>
                    {ordersLoading ? (
                      <div className="form-input flex items-center gap-3">
                        <div className="w-4 h-4 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
                        <span className="text-sm text-[#888888]">Loading orders…</span>
                      </div>
                    ) : orders.length === 0 ? (
                      <div className="form-input text-sm text-[#888888]">
                        No past orders found for your number.
                      </div>
                    ) : (
                      <select
                        id="orderPick"
                        value={orderPick}
                        onChange={(e) => setOrderPick(e.target.value)}
                        className="form-input"
                      >
                        <option value="">Select an order…</option>
                        {orders.map((o) => (
                          <option key={o.orderNumber} value={o.orderNumber}>
                            {o.orderNumber} · {o.serviceLabel} · {formatDate(o.createdAt)}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-xs text-[#888888] mt-2 leading-relaxed">
                      We&apos;ll copy the design file attached to that order.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="orderName"
                      className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2"
                    >
                      Name this design <span className="text-[#FF5C00]">*</span>
                    </label>
                    <input
                      id="orderName"
                      type="text"
                      required
                      value={orderName}
                      onChange={(e) => setOrderName(e.target.value)}
                      placeholder="e.g. Wedding invite cut file"
                      className="form-input"
                    />
                  </div>

                  {formError && (
                    <p className="text-sm text-[#E05200]">{formError}</p>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={submitting || !orderPick || !orderName.trim()}
                      className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Saving…' : 'Save design'}
                    </button>
                    <button type="button" onClick={closeMode} className="btn-outline">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {addMode === 'url' && (
                <form onSubmit={submitByUrl} className="space-y-5">
                  <div>
                    <label
                      htmlFor="urlName"
                      className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2"
                    >
                      Name <span className="text-[#FF5C00]">*</span>
                    </label>
                    <input
                      id="urlName"
                      type="text"
                      required
                      value={urlName}
                      onChange={(e) => setUrlName(e.target.value)}
                      placeholder="e.g. Logo acrylic proof"
                      className="form-input"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="urlFile"
                      className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2"
                    >
                      File URL <span className="text-[#FF5C00]">*</span>
                    </label>
                    <input
                      id="urlFile"
                      type="url"
                      required
                      value={urlFile}
                      onChange={(e) => setUrlFile(e.target.value)}
                      placeholder="https://…"
                      className="form-input"
                    />
                    <p className="text-xs text-[#888888] mt-2 leading-relaxed">
                      Link to a Google Drive, Dropbox, or hosted file. Make sure
                      it&apos;s shareable.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="urlServiceType"
                      className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2"
                    >
                      Service type <span className="normal-case tracking-normal text-[#999999]">(optional)</span>
                    </label>
                    <input
                      id="urlServiceType"
                      type="text"
                      value={urlServiceType}
                      onChange={(e) => setUrlServiceType(e.target.value)}
                      placeholder="e.g. LASER_CUTTING"
                      className="form-input"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="urlNotes"
                      className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2"
                    >
                      Notes <span className="normal-case tracking-normal text-[#999999]">(optional)</span>
                    </label>
                    <textarea
                      id="urlNotes"
                      rows={3}
                      value={urlNotes}
                      onChange={(e) => setUrlNotes(e.target.value)}
                      placeholder="Material, dimensions, anything we should remember"
                      className="form-input resize-none"
                    />
                  </div>

                  {formError && (
                    <p className="text-sm text-[#E05200]">{formError}</p>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={submitting || !urlName.trim() || !urlFile.trim()}
                      className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Saving…' : 'Save design'}
                    </button>
                    <button type="button" onClick={closeMode} className="btn-outline">
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </ScrollReveal>

      {/* List */}
      {loading ? (
        <div className="card flex items-center gap-4">
          <div className="w-6 h-6 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
          <p className="text-sm text-[#666666]">Loading your designs…</p>
        </div>
      ) : designs.length === 0 ? (
        <ScrollReveal>
          <div className="card text-center py-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-2">
              No saved designs
            </p>
            <p className="text-sm text-[#666666] max-w-sm mx-auto leading-relaxed">
              Save a file from a past order, or paste a link to a design you
              host elsewhere.
            </p>
          </div>
        </ScrollReveal>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {designs.map((d, i) => (
            <ScrollReveal key={d.id} delay={Math.min(i * 0.04, 0.3)}>
              <div className="card flex flex-col h-full">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm font-bold text-black leading-snug break-words">
                    {d.name}
                  </p>
                </div>
                {d.serviceType && (
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#FF5C00] mb-2">
                    {d.serviceType}
                  </p>
                )}
                {d.notes && (
                  <p className="text-xs text-[#666666] leading-relaxed mb-2 whitespace-pre-line">
                    {d.notes}
                  </p>
                )}

                {d.fileUrl ? (
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#FF5C00] hover:underline"
                  >
                    Open file
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M6 3h7v7M13 3 6 10M11 9v4H3V5h4" />
                    </svg>
                  </a>
                ) : (
                  <p className="text-xs italic text-[#999999]">No file attached</p>
                )}

                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#999999] mt-3">
                  Added {formatDate(d.createdAt)}
                </p>

                <div className="rule my-4" />

                {confirmDeleteId === d.id ? (
                  <div className="mt-auto flex items-center gap-2">
                    <button
                      onClick={() => confirmDelete(d.id)}
                      disabled={deleting}
                      className="text-xs font-medium text-white bg-[#DC2626] px-3 py-1.5 rounded hover:bg-[#B91C1C] transition-colors disabled:opacity-60"
                    >
                      {deleting ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs font-medium text-[#666666] hover:text-black transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="mt-auto">
                    <button
                      onClick={() => setConfirmDeleteId(d.id)}
                      className="text-xs font-medium text-[#DC2626] hover:text-[#B91C1C] transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </ScrollReveal>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DesignsPage() {
  return (
    <ProtectedRoute>
      <DesignsContent />
    </ProtectedRoute>
  );
}
