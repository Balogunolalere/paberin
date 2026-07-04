import Link from 'next/link';
import { Logo } from './Logo';

const PAGES = [
  { label: 'Home', href: '/' },
  { label: 'Order', href: '/order' },
  { label: 'Track', href: '/track' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Support', href: '/chat' },
  { label: 'Contact', href: '/contact' },
];

const SERVICES = [
  { label: 'Laser Cutting', href: '/#services' },
  { label: 'Material Cutting', href: '/#materials' },
  { label: 'Order Tracking', href: '/track' },
  { label: 'Smart Scheduling', href: '/#how-it-works' },
];

const COMPANY = [
  { label: 'About', href: '/#why-choose' },
  { label: 'Contact', href: '/contact' },
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
];

const SOCIALS = [
  {
    label: 'Instagram',
    href: 'https://instagram.com/skyal_laser_services',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: 'Email',
    href: 'mailto:skyalservices@gmail.com',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    ),
  },
  {
    label: 'Call',
    href: 'tel:+2348035003068',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.95.37 1.88.7 2.77a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.31-1.27a2 2 0 012.11-.45c.89.33 1.82.57 2.77.7A2 2 0 0122 16.92z" />
      </svg>
    ),
  },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-[#EAEAEA] bg-[#0D0D0D] text-white">
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-14 sm:py-18 md:py-20">
        {/* ─── Top: 4-column grid ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-12">
          {/* Column 1: Brand + tagline + socials — spans 4 of 12 cols */}
          <div className="lg:col-span-4">
            <div className="mb-4">
              <Logo className="text-4xl sm:text-5xl" />
            </div>
            <p className="text-sm text-[#999] leading-relaxed max-w-[24rem]">
              Precision laser cutting for makers, designers, and brands.
              Real-time tracking, AI scheduling, and obsessive quality control —
              from our workshop to your doorstep.
            </p>

            {/* Accent line */}
            <div className="w-12 h-[2px] bg-[#FF5C00] mt-6" />

            {/* Socials row */}
            <div className="flex items-center gap-2 mt-6">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target={s.href.startsWith('http') ? '_blank' : undefined}
                  rel={s.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  aria-label={s.label}
                  title={s.label}
                  className="w-10 h-10 rounded-full border border-[#222] flex items-center justify-center text-[#999] hover:bg-[#FF5C00] hover:border-[#FF5C00] hover:text-white transition-colors"
                >
                  {s.icon}
                </a>
              ))}
            </div>

            {/* Workshop CTA */}
            <div className="mt-8">
              <Link
                href="/order"
                className="inline-flex items-center gap-2 text-sm text-[#FF5C00] hover:text-white transition-colors font-medium"
              >
                Start an order
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 7h12M8 2l5 5-5 5" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Column 2: Pages — spans 2 of 12 cols (offset 1) */}
          <div className="lg:col-span-2 lg:col-start-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#555] mb-5">
              Pages
            </p>
            <ul className="space-y-3">
              {PAGES.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#999] hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Services — spans 2 of 12 cols */}
          <div className="lg:col-span-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#555] mb-5">
              Services
            </p>
            <ul className="space-y-3">
              {SERVICES.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#999] hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Company — spans 2 of 12 cols */}
          <div className="lg:col-span-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#555] mb-5">
              Company
            </p>
            <ul className="space-y-3">
              {COMPANY.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#999] hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ─── Divider ─── */}
        <div className="mt-14 pt-8 border-t border-[#222]" />

        {/* ─── Bottom bar: copyright + legal ─── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-xs text-[#555]">
              &copy; {currentYear} Paberin. All rights reserved.
            </p>
            <span className="text-[#333] hidden sm:inline">•</span>
            <p className="text-xs text-[#555]">
              Ogba, Ikeja &mdash; Lagos, Nigeria
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/terms"
              className="text-xs text-[#555] hover:text-white transition-colors"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="text-xs text-[#555] hover:text-white transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/contact"
              className="text-xs text-[#555] hover:text-white transition-colors"
            >
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
