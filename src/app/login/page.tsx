'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScrollReveal } from '@/components/ScrollReveal';
import { usePaberinAuth, normalizePhone } from '@/lib/auth';

/**
 * Customer login — phone verification.
 *
 * Two flows share the same screen:
 *   1. Returning customer → enter phone → magic-link verifies → land on dashboard
 *   2. New customer → enter phone (no orders yet) → "Continue as new" → land on order form
 *
 * The "next" search param controls where we land after auth (defaults to /dashboard).
 */

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/dashboard';
  const { requestLoginCode, verifyLoginCode, customer } = usePaberinAuth();

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already logged in → bounce to next
  useEffect(() => {
    if (customer) router.replace(next);
  }, [customer, next, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Enter your phone number.');
      return;
    }
    setError(null);
    setLoading(true);
    if (!codeSent) {
      // Step 1: email a one-time code. A phone number is not a credential.
      const result = await requestLoginCode({ phone, name: name || undefined, email: email || undefined });
      setLoading(false);
      if (!result.ok) {
        setError(result.error || 'Could not send the login code.');
        return;
      }
      setCodeSent(true);
      setNotice('If that number has an email on file, a one-time code is on its way. Enter it below — it expires in 10 minutes.');
      return;
    }
    // Step 2: exchange the code for a signed session token.
    const result = await verifyLoginCode({ phone, code, name: name || undefined, email: email || undefined });
    setLoading(false);
    if (result.ok) {
      router.replace(next);
    } else {
      setError(result.error || 'Could not verify that code.');
    }
  };

  return (
    <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-8 sm:py-12 md:py-16">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-stretch">
        {/* Left — Premium dark panel */}
        <div className="panel-dark rounded-2xl p-8 sm:p-10 lg:p-12 lg:min-h-[34rem] flex flex-col">
          <div className="panel-dark-grid" />
          <div className="relative flex flex-col h-full">
            <ScrollReveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#FF5C00] mb-6">
                Customer Access
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-[1.05] max-w-[24rem]">
                Welcome back<span className="text-[#FF5C00]">.</span>
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <p className="text-base text-white/60 max-w-[24rem] mt-5 leading-relaxed">
                Log in with the phone number you used to place orders. Track every
                job in real time, manage deliveries, and reorder in one click.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.3}>
              <div className="mt-8 space-y-4 text-sm text-white/70 max-w-[24rem]">
                <div className="flex items-start gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#FF5C00] font-mono text-[10px] font-bold text-white">1</span>
                  <p>Enter the phone number linked to your past orders.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#FF5C00] font-mono text-[10px] font-bold text-white">2</span>
                  <p>We verify it against our records — no password to forget.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#FF5C00] font-mono text-[10px] font-bold text-white">3</span>
                  <p>New here? Skip ahead and we&apos;ll set you up at checkout.</p>
                </div>
              </div>
            </ScrollReveal>

            <div className="mt-auto pt-8">
              <div className="flex items-center gap-2 text-xs text-white/40">
                <span className="h-1.5 w-1.5 animate-blink rounded-full bg-[#FF5C00]" />
                <span className="font-mono uppercase tracking-[0.12em]">
                  Ogba, Ikeja · Lagos
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right — Form */}
        <div>
          <ScrollReveal delay={0.2}>
            <div className="card space-y-6">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-2">
                  Returning Customer
                </p>
                <h2 className="text-xl sm:text-2xl font-bold text-black">
                  Log in to your dashboard
                </h2>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <label
                    htmlFor="phone"
                    className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]"
                  >
                    <span className="text-[#FF5C00]">01</span> Phone Number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0806 000 0000"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'login-error' : undefined}
                    className="form-input"
                  />
                  <p className="text-[11px] text-[#888888]">
                    Use the same number you ordered with.
                  </p>
                </div>

                {notice && (
                  <div className="border border-[#FF5C00]/30 bg-[#FF5C00]/5 px-3 py-2 rounded text-sm text-[#333333]">
                    {notice}
                  </div>
                )}

                {error && (
                  <div
                    id="login-error"
                    role="alert"
                    className="border border-[#FF5C00]/30 bg-[#FF5C00]/5 px-3 py-2 rounded text-sm text-[#E05200]"
                  >
                    {error}
                  </div>
                )}

                {!codeSent && (
                  <>
                    <div className="space-y-2">
                      <label
                        htmlFor="login-name"
                        className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]"
                      >
                        Name <span className="text-[#888888] normal-case tracking-normal">(optional — new customers)</span>
                      </label>
                      <input
                        id="login-name"
                        type="text"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className="form-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="login-email"
                        className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]"
                      >
                        Email <span className="text-[#888888] normal-case tracking-normal">(new customers need this to receive a code)</span>
                      </label>
                      <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="form-input"
                      />
                    </div>
                  </>
                )}

                {codeSent && (
                  <div className="space-y-2">
                    <label
                      htmlFor="login-code"
                      className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]"
                    >
                      <span className="text-[#FF5C00]">02</span> One-time code
                    </label>
                    <input
                      id="login-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="6-digit code"
                      className="form-input"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCodeSent(false);
                        setCode('');
                        setNotice(null);
                        setError(null);
                      }}
                      className="text-xs text-[#666666] underline hover:text-black transition-colors"
                    >
                      Change number
                    </button>
                  </div>
                )}

                <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60">
                  {loading ? 'Checking…' : codeSent ? 'Verify code' : 'Send login code'}
                </button>
              </form>

              <div className="pt-4 border-t border-[#EAEAEA] flex items-center justify-between">
                <Link
                  href="/track"
                  className="text-xs text-[#666666] hover:text-black transition-colors"
                >
                  ← Track an order instead
                </Link>
                <Link
                  href="/order"
                  className="text-xs text-[#FF5C00] hover:text-[#E05200] transition-colors font-medium"
                >
                  Skip to order →
                </Link>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.3}>
            <p className="mt-6 text-xs text-[#888888] leading-relaxed max-w-[27.5rem]">
              By continuing you agree to our{' '}
              <Link href="/terms" className="underline hover:text-black">
                Terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="underline hover:text-black">
                Privacy Policy
              </Link>
              .
            </p>
          </ScrollReveal>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 py-24">
          <div className="w-8 h-8 border-2 border-[#EAEAEA] border-t-[#FF5C00] rounded-full animate-spin" />
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
