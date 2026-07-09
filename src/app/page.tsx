'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, useInView, animate, useReducedMotion } from 'framer-motion';
import { ScrollReveal } from '@/components/ScrollReveal';
import { GrainyTexture } from '@/components/GrainyTexture';
import { GeometricLines } from '@/components/GeometricLines';
import { LaserCutHero } from '@/components/LaserCutHero';

const SERVICES = [
  {
    title: 'Laser Cutting',
    description:
      'Fabrics, leather, wood, acrylic — clean, precise cuts on any material. Consistent quality, no fraying, no burn marks.',
  },
  {
    title: 'Order Tracking',
    description:
      'Know exactly where your order is — from cutting table to your doorstep. No guesswork, no chasing us up.',
  },
  {
    title: 'Smart Scheduling',
    description:
      'Your order gets the earliest available slot. We\'ll let you know when to expect your pieces — simple as that.',
  },
  {
    title: 'Quality Check',
    description:
      'Every piece is checked against your design before it leaves our shop. If it\'s not right, we recut it. No questions asked.',
  },
];

const CRAFT_CARDS = [
  {
    title: 'Laser Optics',
    description:
      'Industrial CO₂ and fiber lasers calibrated to ±0.05mm. Clean edges, zero scorching.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="18" cy="18" r="6" />
        <line x1="18" y1="2" x2="18" y2="12" />
        <line x1="18" y1="24" x2="18" y2="34" />
        <line x1="2" y1="18" x2="12" y2="18" />
        <line x1="24" y1="18" x2="34" y2="18" />
      </svg>
    ),
  },
  {
    title: 'Material Mastery',
    description:
      '40+ materials library — cotton, silk, denim, leather, acrylic, plywood, felt — each with tuned profiles.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 6h20v24H8z" />
        <line x1="14" y1="12" x2="22" y2="12" />
        <line x1="14" y1="16" x2="22" y2="16" />
        <line x1="14" y1="20" x2="18" y2="20" />
      </svg>
    ),
  },
  {
    title: 'Nesting Intelligence',
    description:
      'Algorithms nest patterns for 92–97% material yield.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="4" y="4" width="12" height="12" rx="1" />
        <rect x="20" y="4" width="12" height="12" rx="1" />
        <rect x="4" y="20" width="12" height="12" rx="1" />
        <rect x="20" y="20" width="12" height="12" rx="1" />
      </svg>
    ),
  },
  {
    title: 'Quality Optics',
    description:
      'Machine-vision inspection — tolerances, edge quality, material defects flagged before shipping.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="18" cy="18" r="14" />
        <polyline points="12,18 16,22 24,14" />
      </svg>
    ),
  },
  {
    title: 'Climate Control',
    description:
      '±1.5°C temp, ±5% RH — dimensionally stable cutting year-round.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M18 4v12" />
        <path d="M18 16c-4 0-7 3-7 7s3 7 7 7 7-3 7-7-3-7-7-7z" />
        <line x1="10" y1="30" x2="26" y2="30" />
        <line x1="14" y1="4" x2="22" y2="4" />
      </svg>
    ),
  },
  {
    title: 'Batch Consistency',
    description:
      'Statistical process control — identical results from 5 to 5,000 units.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="4" y="22" width="4" height="10" rx="0.5" />
        <rect x="11" y="16" width="4" height="16" rx="0.5" />
        <rect x="18" y="10" width="4" height="22" rx="0.5" />
        <rect x="25" y="4" width="4" height="28" rx="0.5" />
      </svg>
    ),
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    title: 'Submit',
    description:
      'Send us your design — screenshot, sketch, or CAD. Tell us material and quantity. Get a quote quickly.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 4v14" />
        <polyline points="8,12 14,18 20,12" />
        <path d="M4 22v2a2 2 0 002 2h16a2 2 0 002-2v-2" />
      </svg>
    ),
  },
  {
    title: 'Laser Cut',
    description:
      'Your order enters queue. Best slot found. Machines cut. Live updates throughout.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="14" cy="14" r="10" />
        <circle cx="14" cy="14" r="3" />
        <line x1="14" y1="4" x2="14" y2="8" />
        <line x1="14" y1="20" x2="14" y2="24" />
        <line x1="4" y1="14" x2="8" y2="14" />
        <line x1="20" y1="14" x2="24" y2="14" />
      </svg>
    ),
  },
  {
    title: 'Track & Receive',
    description:
      'Quality check → packaging → shipping. Track every step. On-time delivery.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="12" width="18" height="12" rx="2" />
        <path d="M20 16h4l2 3v3h-2" />
        <circle cx="8" cy="26" r="2" />
        <circle cx="22" cy="26" r="2" />
      </svg>
    ),
  },
];

const PLATFORM_FEATURES = [
  {
    num: '01',
    title: 'Live order tracking',
    description:
      'See exactly where your order is — received, in queue, cutting, quality check, shipped.',
  },
  {
    num: '02',
    title: 'Smart scheduling & instant quotes',
    description:
      'Send design, get quote. Checks fabric, complexity, queue for fast price + delivery window.',
  },
  {
    num: '03',
    title: 'Your own dashboard',
    description:
      'Personal dashboard — order history, active jobs, invoices, delivery tracking.',
  },
];

const STATS = [
  {
    target: 12000,
    decimals: 0,
    unit: '+',
    label: 'Orders Processed',
    sublabel: 'since 2022',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" />
        <path d="M3 7l9 4 9-4" />
        <line x1="12" y1="11" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    target: 72,
    decimals: 0,
    unit: 'hrs',
    label: 'Avg Turnaround',
    sublabel: 'from design to ship',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12,7 12,12 16,14" />
      </svg>
    ),
  },
  {
    target: 40,
    decimals: 0,
    unit: '+',
    label: 'Fabrics',
    sublabel: 'cotton, silk, denim, leather & more',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l9 5-9 5-9-5 9-5z" />
        <path d="M3 13l9 5 9-5" />
        <path d="M3 17l9 5 9-5" strokeOpacity="0.5" />
      </svg>
    ),
  },
  {
    target: 99.2,
    decimals: 1,
    unit: '%',
    label: 'On-time Rate',
    sublabel: 'delivered when promised',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <polyline points="8,12 11,15 16,9" />
      </svg>
    ),
  },
];

const TESTIMONIALS = [
  {
    name: 'Priya Mehta',
    role: 'Founder, Mehta Atelier',
    quote:
      'Cutting went from headache to solved. Sketch sent Monday, pieces arrived Thursday. Precision is consistent, communication is clear.',
  },
  {
    name: 'James Okafor',
    role: 'Creative Director, Okafor Streetwear',
    quote:
      'Instant quoting is a game changer. I know my costs before I commit. Dashboard visibility means I never wonder where my order is.',
  },
  {
    name: 'Lena Vogel',
    role: 'Product Designer, Vogel Leather Goods',
    quote:
      'Tried 3 shops before Paberin. They nailed leather — no burn marks, no warping, flawless edges every time. Finally found my cutting partner.',
  },
  {
    name: 'Marcus Chen',
    role: 'Owner, Form & Grain Studio',
    quote:
      'Does both fabrics and rigid materials — one shop for everything I make. Scheduling confidence means I can promise clients real delivery dates.',
  },
  {
    name: 'Amina Yusuf',
    role: 'Head of Production, Studio Amina',
    quote:
      'Runs 4 brands through Paberin. Tracking without emails changed our production calendar. We plan weeks ahead now with real data.',
  },
];

const TRUST_AVATARS = [
  { initials: 'PM', className: 'bg-black text-white' },
  { initials: 'JO', className: 'bg-[#FF5C00] text-white' },
  { initials: 'LV', className: 'bg-[#666] text-white' },
  { initials: 'MC', className: 'bg-white text-black border border-[#EAEAEA]' },
];

const MATERIALS = [
  {
    name: 'Fabrics',
    sub: 'cotton, silk, denim, linen, ankara, aso-oke, lace',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 7c4-2 8-2 11 0s7 2 11 0" />
        <path d="M5 13c4-2 8-2 11 0s7 2 11 0" />
        <path d="M5 19c4-2 8-2 11 0s7 2 11 0" />
        <path d="M5 25c4-2 8-2 11 0s7 2 11 0" />
        <line x1="5" y1="4" x2="5" y2="28" />
        <line x1="27" y1="4" x2="27" y2="28" />
      </svg>
    ),
  },
  {
    name: 'Leather',
    sub: 'genuine, faux, suede',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9c0-2 2-3 4-3h12c2 0 4 1 4 3v15c0 1-1 2-2 2H8c-1 0-2-1-2-2V9z" />
        <path d="M6 14h20" />
        <circle cx="11" cy="20" r="1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="20" r="1" fill="currentColor" stroke="none" />
        <circle cx="21" cy="20" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    name: 'Wood',
    sub: 'plywood, MDF, hardwood',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="6" width="24" height="4" rx="0.5" />
        <rect x="4" y="14" width="24" height="4" rx="0.5" />
        <rect x="4" y="22" width="24" height="4" rx="0.5" />
        <line x1="11" y1="6" x2="11" y2="10" />
        <line x1="22" y1="14" x2="22" y2="18" />
        <line x1="15" y1="22" x2="15" y2="26" />
      </svg>
    ),
  },
  {
    name: 'Acrylic',
    sub: 'clear, colored, mirror, glitter',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4L28 16L16 28L4 16L16 4z" />
        <path d="M16 10L22 16L16 22L10 16L16 10z" />
      </svg>
    ),
  },
  {
    name: 'Paper & Cardstock',
    sub: 'card, kraft, art paper, board',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4h12l5 5v19H8V4z" />
        <path d="M20 4v5h5" />
        <line x1="12" y1="15" x2="21" y2="15" />
        <line x1="12" y1="20" x2="21" y2="20" />
        <line x1="12" y1="25" x2="17" y2="25" />
      </svg>
    ),
  },
  {
    name: 'Foam Board',
    sub: 'foam core, PVC foam, gator board',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="9" width="24" height="14" rx="1" />
        <line x1="4" y1="16" x2="28" y2="16" />
        <line x1="4" y1="12.5" x2="28" y2="12.5" strokeOpacity="0.45" />
        <line x1="4" y1="19.5" x2="28" y2="19.5" strokeOpacity="0.45" />
      </svg>
    ),
  },
];

const WHY_CHOOSE = [
  {
    title: '24/7 Support',
    description: 'Always here when you need us.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 13a10 10 0 0120 0" />
        <path d="M2 16v-1a3 3 0 013-3h1v8H5a3 3 0 01-3-3z" />
        <path d="M26 16v-1a3 3 0 00-3-3h-1v8h1a3 3 0 003-3z" />
        <path d="M23 19v1a4 4 0 01-4 4h-2" />
      </svg>
    ),
  },
  {
    title: '99.2% On-time',
    description: 'Delivered when promised.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="14" cy="14" r="11" />
        <polyline points="14,8 14,14 18,16" />
      </svg>
    ),
  },
  {
    title: 'Quality Guarantee',
    description: 'Not right? We recut, free.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3l9 3v7c0 6-4 10-9 12-5-2-9-6-9-12V6l9-3z" />
        <polyline points="10,14 13,17 18,11" />
      </svg>
    ),
  },
  {
    title: 'Real-time Tracking',
    description: 'Know where your order is.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 25c5-6 8-9 8-13a8 8 0 10-16 0c0 4 3 7 8 13z" />
        <circle cx="14" cy="12" r="2.5" />
        <path d="M14 19v3" strokeOpacity="0.5" />
      </svg>
    ),
  },
];

const FAQ_ITEMS = [
  {
    q: 'How do I place an order?',
    a: "Send us your design through the Order page. Pick your material, tell us how many, and we'll send a quote within 4 hours.",
  },
  {
    q: 'How long does it take?',
    a: 'Standard orders ship within 72 hours. Express is 48 hours.',
  },
  {
    q: 'What file formats do you accept?',
    a: 'Any format works — photos, sketches, screenshots, or CAD files.',
  },
  {
    q: 'Can I track my order?',
    a: 'Yes! Every order gets a tracking number. Visit the Track page to see real-time status.',
  },
  {
    q: 'Do you offer delivery?',
    a: 'Yes — pickup, local delivery in Lagos, and nationwide waybill.',
  },
  {
    q: "What if I'm not satisfied?",
    a: "Every piece is quality-checked. If something's not right, we'll recut it.",
  },
];

function CountUp({
  target,
  decimals = 0,
  duration = 1.6,
}: {
  target: number;
  decimals?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const [display, setDisplay] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!inView) return;
    if (reduceMotion) {
      setDisplay(target);
      return;
    }
    const controls = animate(0, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, target, duration, reduceMotion]);

  const formatted = display.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return <span ref={ref}>{formatted}</span>;
}

export default function Home() {
  return (
    <div>
      {/* ═══════════════════════════════════════════════════════════════════════════
          MAGAZINE GRID — PAGE 1: HERO + SERVICES + STATS
          ═══════════════════════════════════════════════════════════════════════ */}
      <section className="max-w-[90rem] mx-auto pt-16 sm:pt-20 md:pt-28 pb-10 sm:pb-14 md:pb-20 transform-gpu">
        <div className="px-4 sm:px-6 md:px-10">
          {/* —— Hero grid: 5-col magazine spread —— */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
            {/* Headline: spans 3 of 5 cols */}
            <div className="lg:col-span-3">
              <ScrollReveal delay={0.05}>
                <h1 className="text-[2.6rem] sm:text-[3.5rem] md:text-[4.25rem] lg:text-[5rem] uppercase font-bold leading-[0.95] tracking-tight text-black">
                  <span className="block">
                    your custom designs<span className="text-[#FF5C00]">.</span>
                  </span>
                  <span className="block">
                    laser{' '}
                    <span className="relative inline-block">
                      cut<span className="text-[#FF5C00]">.</span>
                      <svg
                        className="absolute -bottom-2 left-0 w-full animate-blink text-[#FF5C00]"
                        viewBox="0 0 90 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      >
                        <path d="M4 6c8-3 16-3 24 0s16 3 24 0s16-3 24 0" />
                      </svg>
                    </span>
                  </span>
                  <span className="block">
                    and delivered<span className="text-[#FF5C00]">.</span>
                  </span>
                </h1>
              </ScrollReveal>
            </div>

            {/*
              Animated laser-cut hero visual: spans 2 of 5 cols, row-span 2.
              A live canvas of a laser tracing a rose-curve medallion, with
              sparks, glow and a job HUD. Kept the same aspect ratio +
              surface styling so the magazine grid layout is preserved.
            */}
            <div className="hidden lg:block lg:col-span-2 lg:row-span-2">
              <LaserCutHero className="h-full w-full aspect-[3/4]" />
            </div>

            {/* Body copy + CTAs: spans 3 of 5 cols */}
            <div className="lg:col-span-3">
              <ScrollReveal delay={0.15}>
                <p className="text-[0.9rem] sm:text-base text-[#666] max-w-[34rem] leading-relaxed">
                  Send us your design — a sketch, a screenshot, or a CAD file. Pick your material.
                  We handle the rest — precision laser cutting, real-time order tracking, and delivery.
                  Your pieces arrive when you need them.
                </p>
              </ScrollReveal>

              <ScrollReveal delay={0.2}>
                <div className="flex flex-wrap gap-4 mt-8">
                  <Link href="/order" className="btn-primary">
                    Place an Order
                  </Link>
                  <a href="#services" className="btn-outline">
                    See What We Cut
                  </a>
                </div>
              </ScrollReveal>

              <ScrollReveal delay={0.28}>
                <div className="flex items-center gap-4 mt-10">
                  <div className="flex -space-x-2">
                    {TRUST_AVATARS.map((avatar) => (
                      <span
                        key={avatar.initials}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-[10px] font-bold ring-2 ring-white ${avatar.className}`}
                      >
                        {avatar.initials}
                      </span>
                    ))}
                  </div>
                  <div className="leading-tight">
                    <p className="text-xs font-semibold text-black">
                      Trusted by 12,000+ orders
                    </p>
                    <p className="text-[0.7rem] text-[#999]">from makers across Nigeria</p>
                  </div>
                </div>
              </ScrollReveal>

            </div>
          </div>

          <motion.div
            className="hidden lg:inline-flex flex-col items-center gap-2 mt-14 text-[#999]"
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Scroll</span>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4,7 9,12 14,7" />
            </svg>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════
          MAGAZINE GRID — PAGE 2: SERVICES + FEATURED STAT
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10">
        <div className="rule" />
      </div>

      <section id="services" className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-10 sm:py-14 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {/* —— Big stat card (spans 1 col on desktop) —— */}
          <ScrollReveal>
            <div className="border-l-2 border-[#FF5C00] pl-5 py-2 h-full flex flex-col justify-center">
              <p className="text-[3.5rem] sm:text-[4.5rem] md:text-[5.5rem] font-bold text-black leading-none tracking-tight">
                12k<span className="text-[#FF5C00] text-2xl align-super">+</span>
              </p>
              <p className="text-sm font-medium text-black mt-2">Orders Processed</p>
              <p className="text-xs text-[#999] mt-1">since 2022</p>
              <div className="rule mt-6 mb-4" />
              <p className="text-[0.8rem] text-[#666] leading-relaxed">
                Every order tracked, every cut verified — from single prototypes to
                production runs of 5,000+ units.
              </p>
            </div>
          </ScrollReveal>

          {/* —— Services (spans 2 cols) —— */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SERVICES.map((service, i) => (
              <ScrollReveal key={service.title} delay={i * 0.1}>
                <div className="card group h-full">
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#FF5C00] mb-3">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <h3 className="text-sm font-bold text-black mb-2 group-hover:text-[#FF5C00] transition-colors">
                    {service.title}
                  </h3>
                  <p className="text-[0.8rem] text-[#666] leading-relaxed">
                    {service.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════
          MAGAZINE GRID — PAGE 3: OUR CRAFT (masonry-style)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10">
        <div className="rule" />
      </div>

      <section id="craft" className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-10 sm:py-14 md:py-20 bg-[#FAFAFA]">
        {/* Section header: label + headline side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10 md:mb-14">
          <ScrollReveal>
            <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] text-[#999]">
              Our Craft
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h2 className="lg:col-span-2 text-xl sm:text-2xl md:text-3xl font-bold text-black leading-[1.15]">
              Precision manufacturing, engineered for makers who demand consistency at scale.
            </h2>
          </ScrollReveal>
        </div>

        {/* Craft cards: 6-col magazine grid with varied spans */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 md:gap-5">
          {CRAFT_CARDS.map((card, i) => {
            // Magazine-style varied spans: some cards wider, some taller
            const isWide = i === 1 || i === 3;   // Material Mastery, Quality Optics → 3 cols
            const isTall = i === 0 || i === 5;    // Laser Optics, Batch Consistency → 2 rows
            const colSpan = isWide ? 'sm:col-span-2 lg:col-span-3' : 'sm:col-span-1 lg:col-span-3';
            const rowSpan = isTall ? 'lg:row-span-1' : '';

            return (
              <ScrollReveal key={card.title} delay={i * 0.07}>
                <div className={`card group cursor-default p-5 sm:p-6 relative overflow-hidden h-full ${colSpan} ${rowSpan}`}>
                  <GeometricLines
                    variant={i % 2 === 0 ? 'wireframe-sphere' : 'crosshair'}
                    strokeClass="stroke-black/[0.06]"
                    strokeWidth={0.5}
                  />
                  <div className="relative z-10">
                    <div className="w-8 h-8 craft-icon craft-icon-pulse text-[#FF5C00] mb-4">
                      {card.icon}
                    </div>
                    <h3 className="text-sm font-bold text-black mb-2 group-hover:text-[#FF5C00] transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-[0.78rem] text-[#666] leading-relaxed max-w-[28rem]">
                      {card.description}
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════
          MATERIALS SHOWCASE — what we cut
          ═══════════════════════════════════════════════════════════════════════════ */}
      <section id="materials" className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-10 sm:py-14 md:py-20 border-t border-[#EAEAEA]">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10 md:mb-14">
          <ScrollReveal>
            <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] text-[#999]">
              Materials We Cut
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h2 className="lg:col-span-2 text-xl sm:text-2xl md:text-3xl font-bold text-black leading-[1.15]">
              40+ materials. One precision process.
            </h2>
          </ScrollReveal>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {MATERIALS.map((material, i) => (
            <ScrollReveal key={material.name} delay={i * 0.08}>
              <div className="card group h-full flex items-start gap-4 hover:border-[#FF5C00] transition-colors">
                <div className="w-12 h-12 shrink-0 rounded-md bg-[#F7F7F7] flex items-center justify-center text-black group-hover:text-[#FF5C00] group-hover:bg-[#FFF2EB] transition-colors">
                  {material.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-black mb-1 group-hover:text-[#FF5C00] transition-colors">
                    {material.name}
                  </h3>
                  <p className="text-[0.78rem] text-[#666] leading-relaxed">
                    {material.sub}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════
          MAGAZINE GRID — PAGE 4: HOW IT WORKS (horizontal process)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10">
        <div className="rule" />
      </div>

      <section id="how-it-works" className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-10 sm:py-14 md:py-20">
        {/* Section header */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10 md:mb-14">
          <ScrollReveal>
            <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] text-[#999]">
              How It Works
            </p>
          </ScrollReveal>
          <div className="lg:col-span-2">
            <ScrollReveal delay={0.1}>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-black leading-[1.15] max-w-[34rem]">
                Three steps from your design to your doorstep.
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={0.15}>
              <p className="text-[0.85rem] text-[#666] mt-4 max-w-[30rem] leading-relaxed">
                Send us your design in any format. We review, quote, and cut — all within 72 hours.
                Track every step from your dashboard.
              </p>
            </ScrollReveal>
          </div>
        </div>

        {/* Horizontal step cards with connecting line */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 relative">
          {HOW_IT_WORKS_STEPS.map((step, i) => (
            <ScrollReveal key={step.title} delay={i * 0.12}>
              <div className="relative">
                {/* Step number — large, behind content */}
                <p className="text-[5rem] sm:text-[6rem] font-bold text-[#F0F0F0] leading-none select-none absolute -top-4 -left-2 -z-0">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <div className="relative z-10 pt-10">
                  <div className="w-7 craft-icon text-[#FF5C00] mb-4">
                    {step.icon}
                  </div>
                  <h3 className="text-sm font-bold text-black mb-2">{step.title}</h3>
                  <p className="text-[0.8rem] text-[#666] leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={0.3}>
          <div className="mt-10">
            <Link href="/order" className="btn-primary">
              Submit Your First Order
            </Link>
          </div>
        </ScrollReveal>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════
          WHY CHOOSE PABERIN — differentiators
          ═══════════════════════════════════════════════════════════════════════════ */}
      <section id="why-choose" className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-10 sm:py-14 md:py-20 border-t border-[#EAEAEA]">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10 md:mb-14">
          <ScrollReveal>
            <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] text-[#999]">
              Why Paberin
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h2 className="lg:col-span-2 text-xl sm:text-2xl md:text-3xl font-bold text-black leading-[1.15]">
              Built for makers who can&rsquo;t afford surprises.
            </h2>
          </ScrollReveal>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {WHY_CHOOSE.map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 0.1}>
              <div className="card group h-full">
                <div className="w-10 h-10 craft-icon text-[#FF5C00] mb-4">
                  {item.icon}
                </div>
                <h3 className="text-sm font-bold text-black mb-1 group-hover:text-[#FF5C00] transition-colors">
                  {item.title}
                </h3>
                <p className="text-[0.8rem] text-[#666] leading-relaxed">
                  {item.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════
          MAGAZINE GRID — PAGE 5: PLATFORM (editorial sidebar layout)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10">
        <div className="rule" />
      </div>

      <section className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-10 sm:py-14 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Left: big heading + subtext (spans 5 of 12) */}
          <div className="lg:col-span-5">
            <ScrollReveal>
              <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] text-[#999] mb-6">
                Platform
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-black leading-[1.1]">
                Order management built for makers &amp; creators.
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={0.15}>
              <p className="text-[0.85rem] text-[#666] mt-6 max-w-[28rem] leading-relaxed">
                All-in-one platform — from quote to delivery. Upload designs, track orders,
                manage invoices — everything you need in one place.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <Link href="/contact" className="btn-outline mt-8 inline-flex">
                Learn About the Platform
              </Link>
            </ScrollReveal>
          </div>

          {/* Right: feature cards (spans 5 of 12, offset 2) */}
          <div className="lg:col-span-5 lg:col-start-8 space-y-8">
            {PLATFORM_FEATURES.map((feat, i) => (
              <ScrollReveal key={feat.num} delay={i * 0.1} direction="left">
                <div className="border-l border-[#EAEAEA] pl-5 hover:border-[#FF5C00] transition-colors">
                  <p className="font-mono text-sm text-[#FF5C00] font-bold mb-1">{feat.num}</p>
                  <h3 className="text-sm font-bold text-black mb-2">{feat.title}</h3>
                  <p className="text-[0.8rem] text-[#666] leading-relaxed">
                    {feat.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════
          MAGAZINE GRID — PAGE 6: STATS (full-bleed number bar)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10">
        <div className="rule" />
      </div>

      <section className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-10 sm:py-14 md:py-20">
        <ScrollReveal>
          <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] text-[#999] mb-8">
            By the Numbers
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {STATS.map((stat, i) => (
            <ScrollReveal key={stat.label} delay={i * 0.1}>
              <div className="border-t-2 border-[#FF5C00] pt-4">
                <div className="text-[#FF5C00] mb-3">
                  {stat.icon}
                </div>
                <p className="text-3xl sm:text-4xl md:text-5xl font-bold text-black tracking-tight leading-none">
                  <CountUp target={stat.target} decimals={stat.decimals} />
                  <span className="text-base text-[#999] ml-1 align-super">{stat.unit}</span>
                </p>
                <p className="text-[0.8rem] font-medium text-black mt-2">{stat.label}</p>
                <p className="text-[0.7rem] text-[#999] mt-0.5">{stat.sublabel}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════
          MAGAZINE GRID — PAGE 7: TESTIMONIALS (broken-grid spread)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10">
        <div className="rule" />
      </div>

      <section className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-10 sm:py-14 md:py-20">
        <ScrollReveal>
          <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] text-[#999] mb-8">
            Testimonials
          </p>
        </ScrollReveal>

        {/* Broken-grid: featured quote takes 2 cols, others 1 col */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {TESTIMONIALS.map((t, i) => {
            // First testimonial is the "featured" one — spans 2 cols
            const isFeatured = i === 0;

            return (
              <ScrollReveal key={t.name} delay={i * 0.1}>
                <div
                  className={`card cursor-default relative overflow-hidden h-full ${
                    isFeatured ? 'md:col-span-2 border-l-2 border-[#FF5C00]' : ''
                  }`}
                >
                  <GrainyTexture opacity={isFeatured ? 0.05 : 0.06} baseFrequency={0.7} />
                  <div className="relative z-10">
                    {isFeatured && (
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#FF5C00] mb-3">
                        Featured
                      </p>
                    )}
                    <p
                      className={`text-[#666] leading-relaxed mb-4 ${
                        isFeatured ? 'text-[0.95rem] sm:text-base italic' : 'text-[0.8rem]'
                      }`}
                    >
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <p className="text-sm font-bold text-black">{t.name}</p>
                    <p className="text-xs text-[#999]">{t.role}</p>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════
          FAQ — native accordion
          ═══════════════════════════════════════════════════════════════════════════ */}
      <section id="faq" className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-10 sm:py-14 md:py-20 border-t border-[#EAEAEA]">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10 md:mb-14">
          <ScrollReveal>
            <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] text-[#999]">
              FAQ
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h2 className="lg:col-span-2 text-xl sm:text-2xl md:text-3xl font-bold text-black leading-[1.15]">
              Questions? We&rsquo;ve got answers.
            </h2>
          </ScrollReveal>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10">
          <ScrollReveal>
            <p className="text-[0.85rem] text-[#666] leading-relaxed max-w-[22rem]">
              Everything you need to know about ordering, tracking, and delivery. Still stuck?{' '}
              <Link href="/contact" className="text-[#FF5C00] font-semibold underline underline-offset-2 hover:text-[#E05200]">
                Talk to us
              </Link>
              .
            </p>
          </ScrollReveal>

          <div className="lg:col-span-2">
            {FAQ_ITEMS.map((item, i) => (
              <ScrollReveal key={item.q} delay={i * 0.06}>
                <details className="group border-b border-[#EAEAEA] py-4">
                  <summary className="flex items-center justify-between cursor-pointer list-none gap-4 [&::-webkit-details-marker]:hidden">
                    <span className="text-sm font-bold text-black group-hover:text-[#FF5C00] transition-colors">
                      {item.q}
                    </span>
                    <span className="shrink-0 w-6 h-6 rounded-full border border-[#EAEAEA] flex items-center justify-center text-[#999] group-open:bg-[#FF5C00] group-open:border-[#FF5C00] group-open:text-white transition-colors">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="transition-transform duration-300 group-open:rotate-45">
                        <line x1="6" y1="2" x2="6" y2="10" />
                        <line x1="2" y1="6" x2="10" y2="6" />
                      </svg>
                    </span>
                  </summary>
                  <p className="text-[0.85rem] text-[#666] leading-relaxed mt-3 pr-10">
                    {item.a}
                  </p>
                </details>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════
          MAGAZINE GRID — PAGE 8: CLOSING (dramatic closer)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10">
        <div className="rule" />
      </div>

      <section className="max-w-[90rem] mx-auto px-4 sm:px-6 md:px-10 py-14 sm:py-18 md:py-28 grid-lines">
        <div className="text-center max-w-[40rem] mx-auto">
          <ScrollReveal>
            <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] text-[#999] mb-6">
              Get Started
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-bold text-black leading-[1.05]">
              Ready to cut<span className="text-[#FF5C00]">.</span>
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <p className="text-[0.85rem] sm:text-base text-[#666] mt-6 leading-relaxed">
              Send us your design and pick your material. We&rsquo;ll handle the rest — from
              precision cutting to delivery at your doorstep.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <div className="mt-10 flex justify-center gap-4 flex-wrap">
              <Link href="/contact" className="btn-primary">
                Place an Order
              </Link>
              <Link href="/contact" className="btn-outline">
                Talk to Us
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
