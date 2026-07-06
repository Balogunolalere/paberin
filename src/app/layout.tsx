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
            <main className="flex-1 mt-14 relative z-10">{children}</main>
            <Footer />
          </LenisProvider>
        </PaberinAuthProvider>
      </body>
    </html>
  );
}
