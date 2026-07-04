'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SideMenu } from './SideMenu';
import { Logo } from './Logo';
import { NavAuth } from './NavAuth';
import { useLenis } from './LenisProvider';

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
          <Link href="/track" className={linkClass('/track')}>
            Track
          </Link>
          <Link href="/chat" className={linkClass('/chat')}>
            Support
          </Link>
          <Link href="/contact" className={linkClass('/contact')}>
            Contact
          </Link>
        </nav>

        {/* CTA + Auth + SideMenu */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <NavAuth />
          <SideMenu />
        </div>
      </div>
    </header>
  );
}
