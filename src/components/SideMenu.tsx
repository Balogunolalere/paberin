'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Logo } from './Logo';
import { usePaberinAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

const NAV_LINKS = [
  { num: '01', label: 'Home', href: '/' },
  { num: '02', label: 'Start an Order', href: '/order' },
  { num: '03', label: 'Track an Order', href: '/track' },
  { num: '04', label: 'Dashboard', href: '/dashboard' },
  { num: '05', label: 'Support / Chat', href: '/chat' },
  { num: '06', label: 'Contact', href: '/contact' },
  { num: '07', label: 'Terms', href: '/terms' },
  { num: '08', label: 'Privacy', href: '/privacy' },
];

export function SideMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { customer, logout } = usePaberinAuth();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const closeMenu = () => setOpen(false);

  const handleLogout = () => {
    logout();
    closeMenu();
    router.push('/');
  };

  const overlay = mounted && open && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[70] bg-white/95 backdrop-blur-md flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-[#EAEAEA]">
        <Link
          href="/"
          onClick={closeMenu}
          className="text-2xl hover:opacity-80 transition-opacity"
        >
          <Logo />
        </Link>
        <button
          onClick={closeMenu}
          className="font-mono text-xs text-[#666666] hover:text-black transition-colors"
        >
          [close]
        </button>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 flex flex-col justify-center px-6 overflow-y-auto py-6">
        <ul className="space-y-5">
          {NAV_LINKS.map((link, i) => (
            <motion.li
              key={link.href}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.4 }}
            >
              <Link
                href={link.href}
                onClick={closeMenu}
                className="flex items-baseline gap-3 group"
              >
                <span className="font-mono text-xs text-[#666666]">
                  [{link.num}]
                </span>
                <span className="text-2xl font-bold text-black group-hover:text-[#FF5C00] transition-colors">
                  {link.label}
                </span>
              </Link>
            </motion.li>
          ))}
        </ul>

        {/* Auth action */}
        <div className="mt-8 pt-6 border-t border-[#EAEAEA]">
          {customer ? (
            <div className="flex items-center justify-between gap-3">
              <Link
                href="/dashboard"
                onClick={closeMenu}
                className="flex items-center gap-3 group"
              >
                <span className="w-9 h-9 rounded-full bg-[#FF5C00] text-white text-sm font-bold flex items-center justify-center">
                  {(customer.name || customer.phone).charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-bold text-black group-hover:text-[#FF5C00] transition-colors">
                    {customer.name?.split(' ')[0] || 'My Dashboard'}
                  </p>
                  <p className="text-xs text-[#666666] font-mono">{customer.phone}</p>
                </div>
              </Link>
              <button
                onClick={handleLogout}
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#888888] hover:text-black transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              onClick={closeMenu}
              className="flex items-center gap-3 group"
            >
              <span className="font-mono text-xs text-[#666666]">[→]</span>
              <span className="text-xl font-bold text-black group-hover:text-[#FF5C00] transition-colors">
                Log In
              </span>
            </Link>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-6 py-8 border-t border-[#EAEAEA]">
        <p className="text-xs text-[#666666] max-w-[15rem] mb-6">
          Precision laser cutting. Real-time order tracking. Your parts, delivered.
        </p>
        <Link
          href="/order"
          onClick={closeMenu}
          className="btn-primary"
        >
          Place an Order
        </Link>
      </div>
    </motion.div>
  );

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden w-10 h-10 flex items-center justify-center active:scale-90 transition-transform"
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        <div className="relative w-[18px] h-[18px]">
          {/* 4 dots in 2×2 grid */}
          <span
            className={`absolute w-[5px] h-[5px] bg-black rounded-full transition-all duration-300 ${
              open ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 scale-0' : 'top-0 left-0'
            }`}
          />
          <span
            className={`absolute w-[5px] h-[5px] bg-black rounded-full transition-all duration-300 ${
              open ? 'top-0 left-1/2 -translate-x-1/2 rotate-45' : 'top-0 right-0'
            }`}
          />
          <span
            className={`absolute w-[5px] h-[5px] bg-black rounded-full transition-all duration-300 ${
              open ? 'bottom-0 left-1/2 -translate-x-1/2 -rotate-45' : 'bottom-0 left-0'
            }`}
          />
          <span
            className={`absolute w-[5px] h-[5px] bg-black rounded-full transition-all duration-300 ${
              open ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 scale-0' : 'bottom-0 right-0'
            }`}
          />
        </div>
      </button>

      {/* Portal overlay */}
      {mounted &&
        createPortal(
          <AnimatePresence>{overlay}</AnimatePresence>,
          document.body
        )}
    </>
  );
}
