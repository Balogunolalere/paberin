'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ScrollReveal } from '@/components/ScrollReveal';
import { api, type FAQItem } from '@/lib/api';

/**
 * Public, searchable FAQ.
 *
 * Fetches `api.getFAQ('paberin')`, renders instant search + category
 * pills, and expands each question into its answer. No login required.
 */

function humanCategory(raw: string): string {
  const map: Record<string, string> = {
    PRICING: 'Pricing',
    LEAD_TIMES: 'Lead times',
    LEAD_TIME: 'Lead time',
    ORDERS: 'Orders',
    PAYMENTS: 'Payments',
    DELIVERY: 'Delivery',
    QUALITY: 'Quality',
    MATERIALS: 'Materials',
    GENERAL: 'General',
  };
  if (map[raw]) return map[raw];
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getFAQ('paberin');
        if (cancelled) return;
        setFaqs(data.faqs || []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not load FAQs.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Category pills — unique, preserving first-seen order.
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const f of faqs) {
      if (f.category && !seen.includes(f.category)) seen.push(f.category);
    }
    return seen;
  }, [faqs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faqs.filter((f) => {
      if (activeCategory !== 'ALL' && f.category !== activeCategory) return false;
      if (!q) return true;
      return (
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q)
      );
    });
  }, [faqs, query, activeCategory]);

  const toggleOpen = (id: string) =>
    setOpenId((prev) => (prev === id ? null : id));

  return (
    <div className="max-w-[52rem] mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-24">
      {/* Header */}
      <ScrollReveal>
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-6">
          Frequently Asked Questions
        </p>
      </ScrollReveal>
      <ScrollReveal delay={0.1}>
        <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-black leading-[1.1]">
          Answers, fast<span className="text-[#FF5C00]">.</span>
        </h1>
      </ScrollReveal>
      <ScrollReveal delay={0.2}>
        <p className="text-base text-[#666666] max-w-[40rem] mt-6 leading-relaxed">
          Search by keyword or browse by category. Can&apos;t find what you need?
          Reach us on live chat or send a message.
        </p>
      </ScrollReveal>

      {/* Search */}
      <ScrollReveal delay={0.3}>
        <div className="mt-8 sm:mt-10">
          <label htmlFor="faq-search" className="sr-only">
            Search FAQs
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999] pointer-events-none">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              id="faq-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions or answers…"
              className="form-input pl-11"
              autoComplete="off"
            />
          </div>
        </div>
      </ScrollReveal>

      {/* Category pills */}
      {categories.length > 0 && (
        <ScrollReveal delay={0.35}>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveCategory('ALL')}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                activeCategory === 'ALL'
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-[#666666] border-[#EAEAEA] hover:border-black hover:text-black'
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActiveCategory(c)}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  activeCategory === c
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-[#666666] border-[#EAEAEA] hover:border-black hover:text-black'
                }`}
              >
                {humanCategory(c)}
              </button>
            ))}
          </div>
        </ScrollReveal>
      )}

      {/* List */}
      <div className="mt-8 sm:mt-10">
        {loading ? (
          <div className="card flex items-center gap-4">
            <div className="w-6 h-6 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
            <p className="text-sm text-[#666666]">Loading FAQs…</p>
          </div>
        ) : error ? (
          <div className="card border-[#FF5C00]/30 bg-[#FF5C00]/5">
            <p className="text-sm text-[#E05200]">{error}</p>
          </div>
        ) : faqs.length === 0 ? (
          <div className="card">
            <p className="text-sm text-[#666666]">No FAQs published yet.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <p className="text-sm text-[#666666]">
              No results — try a different search or category.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((f, i) => {
              const isOpen = openId === f.id;
              return (
                <ScrollReveal key={f.id} delay={Math.min(i * 0.03, 0.3)}>
                  <li className="card">
                    <button
                      type="button"
                      onClick={() => toggleOpen(f.id)}
                      aria-expanded={isOpen}
                      className="w-full flex items-start justify-between gap-4 text-left"
                    >
                      <div className="min-w-0">
                        {f.category && (
                          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#FF5C00] mb-1.5">
                            {humanCategory(f.category)}
                          </p>
                        )}
                        <p className="text-sm sm:text-base font-semibold text-black leading-snug">
                          {f.question}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 mt-0.5 w-6 h-6 rounded-full border border-[#EAEAEA] flex items-center justify-center text-[#666666] transition-transform duration-200 ${
                          isOpen ? 'rotate-45' : ''
                        }`}
                        aria-hidden="true"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        >
                          <path d="M6 1v10M1 6h10" />
                        </svg>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="mt-4 pt-4 border-t border-[#EAEAEA]">
                        <p className="text-sm text-[#666666] leading-relaxed whitespace-pre-line">
                          {f.answer}
                        </p>
                      </div>
                    )}
                  </li>
                </ScrollReveal>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer CTA */}
      {!loading && !error && (
        <ScrollReveal delay={0.1}>
          <div className="card mt-10 sm:mt-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-1">
                Still stuck?
              </p>
              <p className="text-sm text-black">
                Our team is one message away.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/chat" className="btn-outline">
                Live chat
              </Link>
              <Link href="/contact" className="btn-primary">
                Contact us
              </Link>
            </div>
          </div>
        </ScrollReveal>
      )}
    </div>
  );
}
