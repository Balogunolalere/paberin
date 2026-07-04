'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Lenis from 'lenis';

interface LenisContextValue {
  lenis: Lenis | null;
}

const LenisContext = createContext<LenisContextValue>({ lenis: null });

export function useLenis() {
  return useContext(LenisContext);
}

export function LenisProvider({ children }: { children: ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Skip Lenis on touch devices — smooth-scroll libraries cause
    // jank on mobile and interfere with native momentum scrolling.
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const instance = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      lerp: 0.08,
      smoothWheel: true,
      syncTouch: false,
    });

    lenisRef.current = instance;
    setLenis(instance);

    // Sync GSAP ScrollTrigger with Lenis
    let stModule: typeof import('gsap/ScrollTrigger') | null = null;
    import('gsap/ScrollTrigger').then((mod) => {
      stModule = mod;
      instance.on('scroll', () => mod.ScrollTrigger.update());
    });

    // One-shot RAF loop — each frame schedules the next
    let rafId: number;
    function raf(time: number) {
      instance.raf(time);
      if (stModule) stModule.ScrollTrigger.update();
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      instance.destroy();
      lenisRef.current = null;
    };
  }, []);

  return (
    <LenisContext.Provider value={{ lenis }}>
      {children}
    </LenisContext.Provider>
  );
}
