import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { LenisProvider } from '@/components/LenisProvider';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { AnimatedGeometricBg } from '@/components/AnimatedGeometricBg';
import { PaberinAuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: {
    default: 'Paberin — Precision Laser Cutting & Order Management',
    template: '%s — Paberin',
  },
  description:
    'Submit your parts. We cut, track, and deliver — precision laser cutting for fabrics, leather, wood, and acrylic. Based in Ogba, Ikeja, Lagos.',
  metadataBase: new URL('https://paberin.com'),
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'Paberin — Precision Laser Cutting & Order Management',
    description:
      'Submit your parts. We cut, track, and deliver — precision laser cutting for fabrics, leather, wood, and acrylic.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-white text-black font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:border focus:border-[#D4D4D4] focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black focus:shadow-lg"
        >
          Skip to content
        </a>
        <PaberinAuthProvider>
          <LenisProvider>
            {/*
              Stacking context (verified):
              - AnimatedGeometricBg: position fixed, pointer-events-none, z-0
                → canvas sits behind everything and never blocks clicks.
              - Nav: sticky, z-50.
              - main: relative, z-10 → always above the bg canvas.
            */}
            <AnimatedGeometricBg />
            <Nav />
            <main id="main" className="flex-1 mt-14 relative z-10">{children}</main>
            <Footer />
          </LenisProvider>
        </PaberinAuthProvider>
      </body>
    </html>
  );
}
