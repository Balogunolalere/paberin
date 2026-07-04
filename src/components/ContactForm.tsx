'use client';

import { useState } from 'react';
import { ScrollReveal } from '@/components/ScrollReveal';
import { api } from '@/lib/api';

const CONTACT_DETAILS = [
  {
    label: 'Email',
    value: 'skyalservices@gmail.com',
    href: 'mailto:skyalservices@gmail.com',
    external: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    ),
  },
  {
    label: 'Phone',
    value: '0803 500 3068 / 0806 058 0419',
    href: 'tel:+2348035003068',
    external: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.95.37 1.88.7 2.77a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.31-1.27a2 2 0 012.11-.45c.89.33 1.82.57 2.77.7A2 2 0 0122 16.92z" />
      </svg>
    ),
  },
  {
    label: 'Address',
    value: 'Wempco Rd, Ogba, Ikeja, Lagos',
    href: 'https://maps.google.com/?q=Wempco+Rd+Ogba+Ikeja+Lagos+Nigeria',
    external: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    label: 'Instagram',
    value: '@skyal_laser_services',
    href: 'https://instagram.com/skyal_laser_services',
    external: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

interface FormState {
  name: string;
  email: string;
  phone: string;
  message: string;
}

const initialForm: FormState = {
  name: '',
  email: '',
  phone: '',
  message: '',
};

export function ContactForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setErrorMessage(null);
    try {
      await api.submitContact({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        message: form.message.trim(),
      });
      setStatus('success');
      setForm(initialForm);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err?.message || 'Something went wrong. Please try again or email us directly.');
    }
  };

  const inputBase =
    'w-full bg-transparent border-b border-[#EAEAEA] py-3 px-0 text-sm text-black placeholder:text-[#999] focus:outline-none focus:border-black transition-colors';

  return (
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-24">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
        {/* ─── Left column: info ─── */}
        <div>
          <ScrollReveal>
            <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] text-[#999] mb-6">
              Get in Touch
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.08}>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-bold text-black leading-[1.05] tracking-tight">
              Let&apos;s talk about
              <br />
              your project<span className="text-[#FF5C00]">.</span>
            </h1>
          </ScrollReveal>

          <ScrollReveal delay={0.16}>
            <p className="text-[0.9rem] sm:text-base text-[#666] max-w-[34rem] mt-6 leading-relaxed">
              Tell us what you&apos;re making — fabric, leather, wood, acrylic, anything.
              We&apos;ll reply within 4 hours during work hours with a quote, lead time,
              and any questions we have about your design.
            </p>
          </ScrollReveal>

          {/* Contact details — no numbering, icon + label + value */}
          <div className="mt-10 sm:mt-12 space-y-1">
            {CONTACT_DETAILS.map((item, i) => (
              <ScrollReveal key={item.label} delay={0.2 + i * 0.06}>
                <a
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  className="group flex items-center gap-4 py-4 border-b border-[#EAEAEA] hover:border-[#FF5C00] transition-colors"
                >
                  <span className="w-10 h-10 shrink-0 rounded-full bg-[#F7F7F7] flex items-center justify-center text-black group-hover:bg-[#FF5C00] group-hover:text-white transition-colors">
                    {item.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#999] mb-0.5">
                      {item.label}
                    </p>
                    <p className="text-sm text-black group-hover:text-[#FF5C00] transition-colors truncate">
                      {item.value}
                    </p>
                  </div>
                </a>
              </ScrollReveal>
            ))}
          </div>
        </div>

        {/* ─── Right column: form ─── */}
        <div className="lg:pt-2">
          <ScrollReveal delay={0.1}>
            <div className="bg-white">
              <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] text-[#999] mb-8">
                Send a Message
              </p>

              {status === 'success' ? (
                <div className="border border-[#FF5C00]/30 bg-[#FFF7F0] rounded-lg p-8 text-center">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#FF5C00] flex items-center justify-center text-white">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20,6 9,17 4,12" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-black mb-2">Message sent</h2>
                  <p className="text-sm text-[#666] max-w-sm mx-auto leading-relaxed">
                    Thanks for reaching out. We&apos;ll get back to you within 4 hours
                    during work hours (Mon–Fri, 08:00–18:00).
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatus('idle')}
                    className="btn-outline mt-6 inline-flex"
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-8" noValidate>
                  {/* Name */}
                  <div>
                    <label
                      htmlFor="name"
                      className="block font-mono text-[10px] uppercase tracking-[0.15em] text-[#999] mb-2"
                    >
                      Name
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Your full name"
                      autoComplete="name"
                      className={inputBase}
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label
                      htmlFor="email"
                      className="block font-mono text-[10px] uppercase tracking-[0.15em] text-[#999] mb-2"
                    >
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="you@example.com"
                      autoComplete="email"
                      className={inputBase}
                    />
                  </div>

                  {/* Phone (optional) */}
                  <div>
                    <label
                      htmlFor="phone"
                      className="block font-mono text-[10px] uppercase tracking-[0.15em] text-[#999] mb-2"
                    >
                      Phone <span className="text-[#999] normal-case tracking-normal">(optional)</span>
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="0803 000 0000"
                      autoComplete="tel"
                      className={inputBase}
                    />
                  </div>

                  {/* Message */}
                  <div>
                    <label
                      htmlFor="message"
                      className="block font-mono text-[10px] uppercase tracking-[0.15em] text-[#999] mb-2"
                    >
                      Message
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      required
                      value={form.message}
                      onChange={handleChange}
                      placeholder="Tell us about your project — material, quantity, deadline, anything else we should know."
                      rows={5}
                      className={`${inputBase} resize-none`}
                    />
                  </div>

                  {/* Error message */}
                  {status === 'error' && errorMessage && (
                    <p className="text-xs text-[#E05200] -mt-3">{errorMessage}</p>
                  )}

                  {/* Submit */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={status === 'submitting'}
                      className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {status === 'submitting' ? (
                        <>
                          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12a9 9 0 11-6.219-8.56" />
                          </svg>
                          Sending…
                        </>
                      ) : (
                        <>
                          Send Message
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 8h12M8 2l6 6-6 6" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Operating hours footer */}
              <div className="mt-12 pt-8 border-t border-[#EAEAEA]">
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#999] mb-3">
                  Operating Hours
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-[#666]">Mon – Fri</span>
                    <span className="text-sm font-medium text-black tabular-nums">08:00 – 18:00</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-[#666]">Saturday</span>
                    <span className="text-sm text-[#999] tabular-nums">Closed</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-[#666]">Sunday</span>
                    <span className="text-sm text-[#999] tabular-nums">Closed</span>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </div>
  );
}
