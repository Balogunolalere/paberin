'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface LaserLineProps {
  className?: string;
  direction?: 'horizontal' | 'vertical';
  glow?: boolean;
  delay?: number;
  duration?: number;
}

export function LaserLine({
  className,
  direction = 'horizontal',
  glow = true,
  delay = 0,
  duration = 1.5,
}: LaserLineProps) {
  return (
    <motion.div
      className={cn(
        direction === 'horizontal' ? 'h-[1px] w-full' : 'w-[1px] h-full',
        glow && 'laser-line',
        !glow && 'bg-amber',
        className
      )}
      initial={{ scaleX: direction === 'horizontal' ? 0 : 1, scaleY: direction === 'vertical' ? 0 : 1 }}
      animate={{ scaleX: 1, scaleY: 1 }}
      transition={{
        duration,
        delay,
        ease: [0.76, 0, 0.24, 1],
      }}
      style={{
        transformOrigin: direction === 'horizontal' ? 'left' : 'top',
      }}
    />
  );
}
