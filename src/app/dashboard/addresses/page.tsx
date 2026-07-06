'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ScrollReveal } from '@/components/ScrollReveal';
import { ProtectedRoute } from '@/lib/protected';
import { usePaberinAuth } from '@/lib/auth';
import { api, formatDate, type SavedAddress } from '@/lib/api';

/**
 * Saved delivery addresses (address book) — protected.
 *
 * Lists a customer's saved addresses, supports add / edit / delete, and
 * "set as default". All actions call the admin API via `api.*SavedAddress`.
 */

interface AddressForm {
  label: string;
  recipientName: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  landmark: string;
  isDefault: boolean;
}

const EMPTY_FORM: AddressForm = {
  label: '',
  recipientName: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  landmark: '',
  isDefault: false,
};

function toForm(a: SavedAddress): AddressForm {
  return {
    label: a.label || '',
    recipientName: a.recipientName || '',
    phone: a.phone || '',
    address: a.address || '',
    city: a.city || '',
    state: a.state || '',
    landmark: a.landmark || '',
    isDefault: !!a.isDefault,
  };
}

function fullAddress(a: SavedAddress): string {
  return [a.address, a.city, a.state, a.landmark].filter(Boolean).join(', ');
}

function AddressesContent() {
  const { customer } = usePaberinAuth();
  const phone = customer?.phone || '';

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!phone) return;
    setLoading(true);
    try {
      const data = await api.getSavedAddresses(phone);
      setAddresses(data.addresses || []);
    } catch (err: any) {
      setActionError(err?.message || 'Could not load addresses.');
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (a: SavedAddress) => {
    setForm(toForm(a));
    setEditingId(a.id);
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const handleField = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const v = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setForm((prev) => ({ ...prev, [name]: v }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    if (!form.label.trim() || !form.address.trim()) {
      setFormError('Label and address are required.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        customerPhone: phone,
        label: form.label.trim(),
        recipientName: form.recipientName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim(),
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        landmark: form.landmark.trim() || undefined,
        isDefault: form.isDefault,
      };
      if (editingId) {
        await api.updateSavedAddress(editingId, phone, payload);
      } else {
        await api.createSavedAddress(payload);
      }
      await load();
      closeForm();
    } catch (err: any) {
      setFormError(err?.message || 'Could not save address. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const setDefault = async (a: SavedAddress) => {
    if (!phone) return;
    setActionError(null);
    try {
      await api.updateSavedAddress(a.id, phone, { isDefault: true });
      await load();
    } catch (err: any) {
      setActionError(err?.message || 'Could not set default address.');
    }
  };

  const confirmDelete = async (id: string) => {
    if (!phone) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api.deleteSavedAddress(id, phone);
      setConfirmDeleteId(null);
      await load();
    } catch (err: any) {
      setActionError(err?.message || 'Could not delete address.');
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
              Delivery addresses<span className="text-[#FF5C00]">.</span>
            </h1>
            <p className="text-sm text-[#666666] mt-3 leading-relaxed max-w-[34rem]">
              Save the addresses you ship to most. We&apos;ll offer them at checkout
              and on the order form.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-[#666666] hover:text-black transition-colors">
              ← Back to dashboard
            </Link>
            {!showForm && (
              <button onClick={openAdd} className="btn-primary">
                + Add address
              </button>
            )}
          </div>
        </div>
      </ScrollReveal>

      {actionError && (
        <div className="mb-6 border border-[#FF5C00]/30 bg-[#FF5C00]/5 px-4 py-3 rounded text-sm text-[#E05200]">
          {actionError}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <ScrollReveal>
          <form onSubmit={submit} className="card mb-10 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
                {editingId ? 'Edit address' : 'New address'}
              </p>
              <button
                type="button"
                onClick={closeForm}
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#888888] hover:text-black transition-colors"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2">
                <label
                  htmlFor="label"
                  className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2"
                >
                  Label <span className="text-[#FF5C00]">*</span>
                </label>
                <input
                  id="label"
                  name="label"
                  type="text"
                  required
                  value={form.label}
                  onChange={handleField}
                  placeholder="Home, Office, Workshop…"
                  className="form-input"
                />
              </div>

              <div>
                <label
                  htmlFor="recipientName"
                  className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2"
                >
                  Recipient name
                </label>
                <input
                  id="recipientName"
                  name="recipientName"
                  type="text"
                  value={form.recipientName}
                  onChange={handleField}
                  placeholder="Who receives the package"
                  className="form-input"
                />
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2"
                >
                  Recipient phone
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleField}
                  placeholder="0803 000 0000"
                  className="form-input"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="address"
                  className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2"
                >
                  Address <span className="text-[#FF5C00]">*</span>
                </label>
                <textarea
                  id="address"
                  name="address"
                  required
                  rows={2}
                  value={form.address}
                  onChange={handleField}
                  placeholder="House number, street, area"
                  className="form-input resize-none"
                />
              </div>

              <div>
                <label
                  htmlFor="city"
                  className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2"
                >
                  City
                </label>
                <input
                  id="city"
                  name="city"
                  type="text"
                  value={form.city}
                  onChange={handleField}
                  placeholder="Ikeja"
                  className="form-input"
                />
              </div>

              <div>
                <label
                  htmlFor="state"
                  className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2"
                >
                  State
                </label>
                <input
                  id="state"
                  name="state"
                  type="text"
                  value={form.state}
                  onChange={handleField}
                  placeholder="Lagos"
                  className="form-input"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="landmark"
                  className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] block mb-2"
                >
                  Landmark <span className="normal-case tracking-normal text-[#999999]">(optional)</span>
                </label>
                <input
                  id="landmark"
                  name="landmark"
                  type="text"
                  value={form.landmark}
                  onChange={handleField}
                  placeholder="Beside the filling station"
                  className="form-input"
                />
              </div>
            </div>

            {/* Default toggle */}
            <div className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={form.isDefault}
                onClick={() => setForm((prev) => ({ ...prev, isDefault: !prev.isDefault }))}
                className={`relative w-10 h-6 rounded-full transition-colors ${
                  form.isDefault ? 'bg-[#FF5C00]' : 'bg-[#EAEAEA]'
                }`}
                aria-label="Set as default address"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    form.isDefault ? 'translate-x-4' : ''
                  }`}
                />
              </button>
              <span className="text-sm text-black">Set as default address</span>
            </div>

            {formError && (
              <p className="text-sm text-[#E05200]">{formError}</p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting
                  ? 'Saving…'
                  : editingId
                  ? 'Save changes'
                  : 'Save address'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="btn-outline"
              >
                Cancel
              </button>
            </div>
          </form>
        </ScrollReveal>
      )}

      {/* List */}
      {loading ? (
        <div className="card flex items-center gap-4">
          <div className="w-6 h-6 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
          <p className="text-sm text-[#666666]">Loading your addresses…</p>
        </div>
      ) : addresses.length === 0 && !showForm ? (
        <ScrollReveal>
          <div className="card text-center py-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-2">
              No saved addresses
            </p>
            <p className="text-sm text-[#666666] max-w-sm mx-auto leading-relaxed">
              Save your home, office, or workshop so checkout is faster next time.
            </p>
            <button onClick={openAdd} className="btn-primary mt-6">
              + Add your first address
            </button>
          </div>
        </ScrollReveal>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {addresses.map((a, i) => (
            <ScrollReveal key={a.id} delay={Math.min(i * 0.04, 0.3)}>
              <div className="card flex flex-col h-full">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-black truncate">{a.label}</p>
                      {a.isDefault && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF5C00]/10 text-[#FF5C00] border border-[#FF5C00]/30 text-[10px] font-medium font-mono uppercase tracking-[0.1em]">
                          Default
                        </span>
                      )}
                    </div>
                    {a.recipientName && (
                      <p className="text-xs text-[#666666] mt-1">{a.recipientName}</p>
                    )}
                  </div>
                </div>

                <p className="text-sm text-black leading-relaxed mb-1">
                  {fullAddress(a) || a.address}
                </p>
                {a.phone && (
                  <p className="font-mono text-xs text-[#888888]">{a.phone}</p>
                )}
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#999999] mt-3">
                  Added {formatDate(a.createdAt)}
                </p>

                <div className="rule my-4" />

                {/* Actions */}
                {confirmDeleteId === a.id ? (
                  <div className="mt-auto flex items-center gap-2">
                    <button
                      onClick={() => confirmDelete(a.id)}
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
                  <div className="mt-auto flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => openEdit(a)}
                      className="text-xs font-medium text-black hover:text-[#FF5C00] transition-colors"
                    >
                      Edit
                    </button>
                    {!a.isDefault && (
                      <button
                        onClick={() => setDefault(a)}
                        className="text-xs font-medium text-[#666666] hover:text-[#FF5C00] transition-colors"
                      >
                        Set as default
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmDeleteId(a.id)}
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

export default function AddressesPage() {
  return (
    <ProtectedRoute>
      <AddressesContent />
    </ProtectedRoute>
  );
}
