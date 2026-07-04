'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ScrollReveal } from '@/components/ScrollReveal';
import { Logo } from '@/components/Logo';
import {
  api,
  formatNaira,
  type ChatMessage,
  type ChatResponse,
} from '@/lib/api';

/**
 * Paberin AI Chat — wired to /api/skyal/chat with brand='paberin'.
 *
 * Talk to Paberin's AI assistant about materials, lead times, quotes,
 * delivery, anything. If the assistant builds a quote during the chat,
 * we surface an "Order Now" CTA that hands off to /order.
 */

interface UIMessage extends ChatMessage {
  id: string;
  pending?: boolean;
  quote?: ChatResponse['quote'];
  renderOrderNow?: boolean;
}

const SUGGESTIONS = [
  'What materials do you cut?',
  'How fast can I get 50 pieces?',
  'Quote for 100 leather tags',
  'Do you deliver to Lekki?',
];

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ChatContent() {
  const [messages, setMessages] = useState<UIMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hello — I'm Paberin's assistant. Ask me about materials, lead times, pricing, or your existing order. I can also build a quote for you right here.",
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [pendingQuote, setPendingQuote] = useState<ChatResponse['quote'] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setError(null);
      setInput('');

      const userMsg: UIMessage = { id: uid(), role: 'user', content: trimmed };
      const pendingMsg: UIMessage = {
        id: uid(),
        role: 'assistant',
        content: '',
        pending: true,
      };
      setMessages((prev) => [...prev, userMsg, pendingMsg]);
      setSending(true);

      try {
        const history: ChatMessage[] = messages
          .filter((m) => !m.pending && m.content)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await api.sendChat({
          message: trimmed,
          brand: 'paberin',
          mode: 'live',
          history,
          sessionId,
        });

        if (sessionId !== res.sessionId) setSessionId(res.sessionId);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingMsg.id
              ? {
                  ...m,
                  content: res.assistant_text || '(no reply)',
                  pending: false,
                  quote: res.quote,
                  renderOrderNow: res.render_order_now,
                }
              : m
          )
        );

        if (res.quote) setPendingQuote(res.quote);
      } catch (err: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingMsg.id
              ? {
                  ...m,
                  content:
                    "I couldn't reach the assistant just now. Please try again, or call 0803 500 3068.",
                  pending: false,
                }
              : m
          )
        );
        setError(err?.message || 'Chat failed.');
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [messages, sending, sessionId]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-8 sm:py-12 md:py-16">
      <ScrollReveal>
        <div className="mb-8 flex items-center gap-3">
          <Logo className="text-3xl sm:text-4xl" />
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#999] hidden sm:inline">
            / Assistant
          </span>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.05}>
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-black leading-[1.1]">
            Ask anything<span className="text-[#FF5C00]">.</span>
          </h1>
          <p className="text-base text-[#666666] max-w-[40rem] mt-4 leading-relaxed">
            Materials, pricing, lead times, delivery — get instant answers. If
            you describe your project, I&apos;ll build a quote on the spot.
          </p>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Chat panel */}
        <div className="lg:col-span-2">
          <div className="card flex flex-col h-[70vh] min-h-[500px] p-0 overflow-hidden">
            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] ${
                      m.role === 'user'
                        ? 'bg-[#FF5C00] text-white rounded-2xl rounded-br-sm'
                        : 'bg-[#F7F7F7] text-black rounded-2xl rounded-bl-sm border border-[#EAEAEA]'
                    } px-4 py-3`}
                  >
                    {m.pending ? (
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#888888] animate-bounce" />
                        <span className="w-2 h-2 rounded-full bg-[#888888] animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <span className="w-2 h-2 rounded-full bg-[#888888] animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </div>
                    ) : (
                      <>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {m.content}
                        </p>
                        {m.quote && (
                          <div className="mt-3 pt-3 border-t border-current/20">
                            <p className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-70 mb-1">
                              Estimated Quote
                            </p>
                            <p className="text-lg font-bold">
                              {formatNaira(m.quote.price)}
                              {m.quote.original_price &&
                                m.quote.original_price > m.quote.price && (
                                  <span className="text-xs line-through opacity-60 ml-2">
                                    {formatNaira(m.quote.original_price)}
                                  </span>
                                )}
                            </p>
                            {m.quote.summary && (
                              <p className="text-xs opacity-80 mt-1">
                                {m.quote.summary}
                              </p>
                            )}
                          </div>
                        )}
                        {m.renderOrderNow && (
                          <Link
                            href="/order"
                            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide bg-white text-[#FF5C00] hover:bg-[#FF5C00] hover:text-white border border-[#FF5C00] px-3 py-1.5 rounded-full transition-colors"
                          >
                            Order Now
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M2 6h8M6 2l4 4-4 4" />
                            </svg>
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Suggestions */}
            {messages.length <= 1 && (
              <div className="px-4 sm:px-6 pb-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-[#EAEAEA] text-[#666666] hover:border-[#FF5C00] hover:text-[#FF5C00] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="border-t border-[#EAEAEA] p-3 sm:p-4 bg-white">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Type your message… (Enter to send, Shift+Enter for newline)"
                  rows={1}
                  className="flex-1 resize-none form-input border-0 focus:shadow-none min-h-[44px] max-h-32 py-3"
                  disabled={sending}
                />
                <button
                  onClick={() => send(input)}
                  disabled={sending || !input.trim()}
                  className="btn-primary h-11 w-11 !px-0 flex-shrink-0 disabled:opacity-50"
                  aria-label="Send message"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 9h14M9 2l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-xs text-[#E05200] mt-3 px-1">{error}</p>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {pendingQuote && (
            <ScrollReveal>
              <div className="card border-[#FF5C00]/30 bg-[#FFF7F0]">
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#E05200] mb-3">
                  Latest Quote
                </p>
                <p className="text-3xl font-bold text-black mb-2">
                  {formatNaira(pendingQuote.price)}
                </p>
                {pendingQuote.original_price &&
                  pendingQuote.original_price > pendingQuote.price && (
                    <p className="text-xs text-[#888888] line-through">
                      {formatNaira(pendingQuote.original_price)}
                    </p>
                  )}
                {pendingQuote.summary && (
                  <p className="text-sm text-[#666666] mt-3 leading-relaxed">
                    {pendingQuote.summary}
                  </p>
                )}
                <Link href="/order" className="btn-primary mt-4 w-full">
                  Place This Order
                </Link>
              </div>
            </ScrollReveal>
          )}

          <ScrollReveal delay={0.1}>
            <div className="card">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#888888] mb-3">
                Need a human?
              </p>
              <p className="text-sm text-[#666666] mb-4 leading-relaxed">
                Our team is on standby 08:00–18:00 weekdays.
              </p>
              <div className="space-y-2 text-sm">
                <a
                  href="tel:+2348035003068"
                  className="block text-[#FF5C00] hover:underline font-medium"
                >
                  0803 500 3068
                </a>
                <a
                  href="mailto:skyalservices@gmail.com"
                  className="block text-[#FF5C00] hover:underline font-medium"
                >
                  skyalservices@gmail.com
                </a>
                <Link
                  href="/contact"
                  className="block text-[#666666] hover:text-black transition-colors"
                >
                  Contact page →
                </Link>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="card bg-[#0D0D0D] text-white">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#888888] mb-2">
                Pro Tip
              </p>
              <p className="text-sm text-[#CCCCCC] leading-relaxed">
                Share an image of your design (SVG, PNG, or photo) and I&apos;ll
                estimate complexity and quote in seconds.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return <ChatContent />;
}
