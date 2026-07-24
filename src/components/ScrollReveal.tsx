'use client';

import { useRef, useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  duration?: number;
  once?: boolean;
}

export function ScrollReveal({
  children,
  className,
  delay = 0,
  direction = 'up',
  duration = 0.7,
  once = true,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null;

    const initAnimation = async () => {
      const [gsapMod, stMod] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);

      // eslint-disable-next-line
      const gsap = (gsapMod as any).default || gsapMod;
      ScrollTrigger = stMod.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);

      const yOffset = direction === 'up' ? 30 : direction === 'down' ? -30 : 0;
      const xOffset = direction === 'left' ? 30 : direction === 'right' ? -30 : 0;

      gsap.fromTo(
        node,
        { opacity: 0, y: yOffset, x: xOffset },
        {
          opacity: 1,
          y: 0,
          x: 0,
          duration,
          delay,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: node,
            start: 'top 85%',
            once,
          },
        }
      );
    };

    initAnimation();

    return () => {
      if (ScrollTrigger) {
        ScrollTrigger.getAll().forEach((t) => {
          if (t.trigger === node) t.kill();
        });
      }
    };
  }, [delay, direction, duration, once]);

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}
