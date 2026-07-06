'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SideMenu } from './SideMenu';
import { Logo } from './Logo';
import { NavAuth } from './NavAuth';
import { useLenis } from './LenisProvider';
import { usePaberinAuth } from '@/lib/auth';
import { api, type CustomerNotification } from '@/lib/api';

/* ── Relative time formatter (e.g. "2 hours ago") ── */
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

/**
 * In-app notifications bell. Shown only when a customer is logged in.
 * Polls `api.getNotifications` every 30s, shows an unread-count badge,
 * and on open marks everything read. Closes on outside-click + Escape.
 */
function NotificationBell() {
  const { customer } = usePaberinAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const phone = customer?.phone;

  const fetchNotifications = useCallback(async () => {
    if (!phone) return;
    try {
      const data = await api.getNotifications(phone);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // Endpoint may be unavailable — swallow silently.
    }
  }, [phone]);

  // Initial fetch + 30s polling while logged in.
  useEffect(() => {
    if (!phone) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    fetchNotifications();
    const id = window.setInterval(fetchNotifications, 30000);
    return () => window.clearInterval(id);
  }, [phone, fetchNotifications]);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next && phone && unreadCount > 0) {
        // Optimistically clear the badge; mark-all-read on the server.
        setUnreadCount(0);
        api.markAllNotificationsRead(phone).catch(() => {
          // On failure, re-fetch to restore the true unread count.
          fetchNotifications();
        });
      }
      return next;
    });
  }, [phone, unreadCount, fetchNotifications]);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // While the auth context is still hydrating, render nothing (the
  // usePaberinAuth hook above is always called; we bail here).
  if (!customer) return null;

  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);
  const recent = notifications.slice(0, 20);

  return (
    <div className="hidden sm:block relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative w-9 h-9 flex items-center justify-center rounded-full text-[#666666] hover:text-black hover:bg-[#F7F7F7] transition-colors"
      >
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
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#FF5C00] text-white text-[9px] font-bold flex items-center justify-center leading-none"
            aria-hidden="true"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full mt-2 w-[20rem] sm:w-[22rem] max-h-[28rem] flex flex-col bg-white border border-[#EAEAEA] rounded-lg shadow-lg z-[60] overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#EAEAEA]">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666]">
              Notifications
            </p>
            {unreadCount > 0 ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#FF5C00]">
                {unreadCount} new
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#888888]">
                All read
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {recent.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-[#666666]">You&apos;re all caught up.</p>
              </div>
            ) : (
              <ul className="divide-y divide-[#F2F2F2]">
                {recent.map((n) => {
                  const snippet =
                    n.body && n.body.length > 110 ? n.body.slice(0, 110) + '…' : n.body;
                  const inner = (
                    <div className="px-4 py-3 hover:bg-[#FAFAFA] transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-black leading-snug">
                          {n.title}
                        </p>
                        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#999999] whitespace-nowrap">
                          {relativeTime(n.createdAt)}
                        </span>
                      </div>
                      {snippet && (
                        <p className="text-xs text-[#666666] mt-1 leading-relaxed">
                          {snippet}
                        </p>
                      )}
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.orderNumber ? (
                        <Link
                          href="/dashboard"
                          onClick={() => setOpen(false)}
                          className="block"
                        >
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const { lenis } = useLenis();
  const isTouchRef = useRef(false);

  useEffect(() => {
    isTouchRef.current = window.matchMedia('(pointer: coarse)').matches;

    const onScroll = () => setScrolled(window.scrollY > 0);

    // On touch devices use native scroll; on desktop use Lenis scroll event
    if (isTouchRef.current || !lenis) {
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }

    const onLenisScroll = ({ scroll }: { scroll: number }) => {
      setScrolled(scroll > 0);
    };
    lenis.on('scroll', onLenisScroll);
    return () => {
      lenis.off('scroll', onLenisScroll);
    };
  }, [lenis]);

  const linkClass = (href: string) =>
    `text-sm transition-colors ${
      pathname === href ? 'text-black' : 'text-[#666666] hover:text-black'
    }`;

  return (
    <header
      className={`sticky top-0 left-0 right-0 z-50 h-14 border-b transition-colors duration-200 ${
        scrolled
          ? 'bg-white/80 backdrop-blur-sm border-[#EAEAEA]'
          : 'bg-transparent border-transparent'
      }`}
    >
      <div className="max-w-[87.5rem] mx-auto px-4 sm:px-6 md:px-10 h-full flex items-center justify-between gap-4">
        {/* Logo */}
        <Link
          href="/"
          className="text-2xl sm:text-3xl hover:opacity-80 transition-opacity flex-shrink-0"
        >
          <Logo />
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-5 lg:gap-7 flex-1 justify-center">
          <Link href="/" className={linkClass('/')}>
            Home
          </Link>
          <Link href="/order" className={linkClass('/order')}>
            Order
          </Link>
          <Link href="/calculator" className={linkClass('/calculator')}>
            Calculator
          </Link>
          <Link href="/track" className={linkClass('/track')}>
            Track
          </Link>
          <Link href="/faq" className={linkClass('/faq')}>
            FAQ
          </Link>
          <Link href="/chat" className={linkClass('/chat')}>
            Support
          </Link>
          <Link href="/contact" className={linkClass('/contact')}>
            Contact
          </Link>
        </nav>

        {/* CTA + Auth + Bell + SideMenu */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <NotificationBell />
          <NavAuth />
          <SideMenu />
        </div>
      </div>
    </header>
  );
}
