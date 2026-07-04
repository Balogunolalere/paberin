'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useLenis } from '@/components/LenisProvider';

export function CustomCursor() {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const { lenis } = useLenis();
  const lenisScrollRef = useRef(0);
  // Refs so the effect never re-runs (no state in deps → no listener teardown)
  const isVisibleRef = useRef(false);
  const isHoveringRef = useRef(false);

  const mouseX = useMotionValue(-100);
  const mouseY = useMotionValue(-100);

  const ringX = useSpring(mouseX, { stiffness: 120, damping: 18 });
  const ringY = useSpring(mouseY, { stiffness: 120, damping: 18 });
  const ballX = useSpring(mouseX, { stiffness: 600, damping: 35 });
  const ballY = useSpring(mouseY, { stiffness: 600, damping: 35 });

  // Track Lenis scroll offset
  useEffect(() => {
    if (!lenis) return;
    const onScroll = ({ scroll }: { scroll: number }) => {
      lenisScrollRef.current = scroll;
    };
    lenis.on('scroll', onScroll);
    return () => {
      lenis.off('scroll', onScroll);
    };
  }, [lenis]);

  // Set up mouse listeners once. Refs keep state in sync without
  // tearing down / re-adding listeners (which caused the cursor to vanish).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const setVisible = (v: boolean) => {
      if (isVisibleRef.current !== v) {
        isVisibleRef.current = v;
        setIsVisible(v);
      }
    };
    const setHovering = (v: boolean) => {
      if (isHoveringRef.current !== v) {
        isHoveringRef.current = v;
        setIsHovering(v);
      }
    };

    const onMove = (e: MouseEvent) => {
      setVisible(true);
      mouseX.set(e.clientX);
      mouseY.set(e.clientY + lenisScrollRef.current);
    };

    const onLeave = () => setVisible(false);
    const onEnter = () => setVisible(true);

    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      setHovering(
        !!(
          t.closest('a') ||
          t.closest('button') ||
          t.closest('[data-cursor-expand]') ||
          t.closest('input') ||
          t.closest('textarea') ||
          t.closest('select') ||
          t.closest('[role="button"]')
        )
      );
    };

    const onOut = (e: MouseEvent) => {
      // Only set hovering false if we actually left the interactive element
      const related = (e as MouseEvent).relatedTarget as HTMLElement | null;
      if (
        related?.closest('a') ||
        related?.closest('button') ||
        related?.closest('input') ||
        related?.closest('textarea')
      ) {
        return; // moving between interactive elements — keep expanded
      }
      setHovering(false);
    };

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // <-- runs ONCE, no state in deps

  // Only enable the cursor-none class on devices that:
  //   1. Have a fine pointer (mouse), AND
  //   2. Don't request reduced motion.
  // We use a class on <html> (controlled here) so the CSS in globals.css
  // can scope `cursor: none` to `html.custom-cursor-active *` — meaning
  // the native cursor stays visible whenever the custom cursor is disabled
  // (touch / reduced-motion / SSR). This fixes desktop navigation dead-zones
  // caused by the previous `* { cursor: none !important; }` global rule.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (finePointer && !reducedMotion) {
      document.documentElement.classList.add('custom-cursor-active');
    }
    return () => {
      document.documentElement.classList.remove('custom-cursor-active');
    };
  }, []);

  // If touch device or reduced motion, do not render the custom cursor at all
  if (typeof window !== 'undefined') {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isTouch || reducedMotion) return null;
  }

  return (
    <>
      {/* Outer Ring */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] rounded-full border border-[#FF5C00]"
        style={{
          x: ringX,
          y: ringY,
          translateX: '-50%',
          translateY: '-50%',
        }}
        animate={{
          width: isHovering ? 56 : 32,
          height: isHovering ? 56 : 32,
          opacity: isVisible ? 1 : 0,
        }}
        transition={{
          width: { type: 'spring', stiffness: 350, damping: 25 },
          height: { type: 'spring', stiffness: 350, damping: 25 },
          opacity: { duration: 0.2 },
        }}
      />

      {/* Inner Ball */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] rounded-full bg-[#FF5C00]"
        style={{
          x: ballX,
          y: ballY,
          translateX: '-50%',
          translateY: '-50%',
        }}
        animate={{
          width: isHovering ? 10 : 7,
          height: isHovering ? 10 : 7,
          opacity: isVisible ? 1 : 0,
        }}
        transition={{
          width: { type: 'spring', stiffness: 500, damping: 30 },
          height: { type: 'spring', stiffness: 500, damping: 30 },
          opacity: { duration: 0.2 },
        }}
      />
    </>
  );
}
