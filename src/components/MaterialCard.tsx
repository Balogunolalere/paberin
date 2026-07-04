'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MaterialCardProps {
  name: string;
  description: string;
  texture: string;
  index: number;
}

export function MaterialCard({ name, description, texture, index }: MaterialCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ delay: index * 0.12, duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative overflow-hidden border border-white/[0.06] bg-surface-raised cursor-pointer"
    >
      {/* Texture background */}
      <div className={cn('absolute inset-0 transition-opacity duration-700', texture)} />

      {/* Dither overlay on hover */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-700',
          hovered ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255, 92, 0, 0.15) 1px, transparent 1px)',
          backgroundSize: '3px 3px',
        }}
      />

      {/* Content */}
      <div className="relative z-10 p-8 md:p-10 min-h-[280px] flex flex-col justify-end">
        <motion.div
          animate={{ y: hovered ? -4 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <h3 className="font-display text-heading text-[#FAFAFA] mb-3">{name}</h3>
          <p className="text-text-secondary text-body leading-relaxed max-w-xs">
            {description}
          </p>
        </motion.div>

        {/* Hover indicator line */}
        <motion.div
          className="absolute bottom-0 left-0 h-[2px] bg-amber"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: hovered ? 1 : 0 }}
          transition={{ duration: 0.4, ease: [0.76, 0, 0.24, 1] }}
          style={{ transformOrigin: 'left', width: '100%' }}
        />
      </div>
    </motion.div>
  );
}
