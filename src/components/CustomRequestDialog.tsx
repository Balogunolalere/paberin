'use client';

import { useEffect, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://skyalxpaberin-admin.vercel.app';

interface Attachment { url: string; name: string; }

export function CustomRequestDialog({
  open,
  onClose,
  brand,
  initialMessage = '',
}: {
  open: boolean;
  onClose: () => void;
  brand: 'SKYAL' | 'PABERIN';
  initialMessage?: string;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMessage(initialMessage);
    setName('');
    setPhone('');
    setEmail('');
    setAttachments([]);
    setError(null);
    setRequestNumber(null);
    setUploading(false);
    setSubmitting(false);
  }, [open, initialMessage]);

  if (!open) return null;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    if (attachments.length + files.length > 3) {
      setError('Attach at most 3 reference images.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const next = [...attachments];
      for (const file of Array.from(files)) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
          setError(`${file.name}: use PNG, JPEG or WebP.`);
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          setError(`${file.name}: each image must be 5MB or smaller.`);
          continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Could not read the image'));
          reader.readAsDataURL(file);
        });
        const res = await fetch(`${API_URL}/api/upload`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ file: dataUrl, folder: 'custom-requests' }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.data?.url) throw new Error(json?.error?.message || `Upload failed for ${file.name}`);
        next.push({ url: json.data.url, name: file.name });
      }
      setAttachments(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload the image.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Your name is required.');
    if (!phone.trim()) return setError('Your phone number is required.');
    if (!email.trim()) return setError('Your email is required so we can reply.');
    if (message.trim().length < 5) return setError('Please explain your custom order.');

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/custom-quote-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brand,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerEmail: email.trim(),
          message: message.trim(),
          attachments,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.data?.requestNumber) throw new Error(json?.error?.message || 'Could not send your request.');
      setRequestNumber(json.data.requestNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg card p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Custom order request">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888]">Custom job</p>
            <h2 className="text-2xl font-bold text-black mt-1">Explain your custom order</h2>
            <p className="text-sm text-[#666666] mt-2">Tell us what you need. We’ll confirm whether it is a complex custom job or a standard service.</p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-[#888888] hover:text-black" aria-label="Close">×</button>
        </div>

        {requestNumber ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-md border border-[#FF5C00]/30 bg-[#FFF7F0] p-4 text-sm text-black">
              Request <strong>{requestNumber}</strong> received. We’ll reply to your email after reviewing it.
            </div>
            <button type="button" onClick={onClose} className="w-full rounded-md bg-[#FF5C00] px-4 py-3 text-sm font-medium text-white">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888]" htmlFor="custom-message">Explain your custom order</label>
              <textarea id="custom-message" required rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe the material, size, design, finish, quantity and anything unusual…" className="mt-1 w-full rounded-md border border-[#EAEAEA] px-3 py-2 text-sm text-black focus:border-[#FF5C00] focus:outline-none" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888]" htmlFor="custom-name">Name</label>
                <input id="custom-name" required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-[#EAEAEA] px-3 py-2 text-sm text-black focus:border-[#FF5C00] focus:outline-none" />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888]" htmlFor="custom-phone">Phone</label>
                <input id="custom-phone" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 350 3068" className="mt-1 w-full rounded-md border border-[#EAEAEA] px-3 py-2 text-sm text-black focus:border-[#FF5C00] focus:outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888]" htmlFor="custom-email">Email</label>
                <input id="custom-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border border-[#EAEAEA] px-3 py-2 text-sm text-black focus:border-[#FF5C00] focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888]">Reference images (optional)</label>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || attachments.length >= 3} className="mt-1 rounded-md border border-[#EAEAEA] px-3 py-2 text-xs text-black hover:border-[#FF5C00] disabled:opacity-50">
                {uploading ? 'Uploading…' : 'Attach images'}
              </button>
              <span className="ml-2 text-xs text-[#888888]">PNG/JPEG/WebP · max 3 · 5MB each</span>
              {attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {attachments.map((a) => (
                    <span key={a.url} className="inline-flex items-center gap-2 rounded border border-[#EAEAEA] px-2 py-1 text-xs">
                      {a.name}
                      <button type="button" onClick={() => setAttachments((prev) => prev.filter((x) => x.url !== a.url))} aria-label={`Remove ${a.name}`}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {error && <div className="text-sm text-[#E05200]">{error}</div>}
            <button type="submit" disabled={submitting || uploading} className="w-full rounded-md bg-[#FF5C00] px-4 py-3 text-sm font-medium text-white disabled:opacity-60">
              {submitting ? 'Sending…' : 'Send custom request'}
            </button>
            <p className="text-xs text-[#888888]">No payment is taken now. We’ll reply by email.</p>
          </form>
        )}
      </div>
    </div>
  );
}
