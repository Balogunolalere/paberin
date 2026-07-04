'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

interface GrainyTextureProps {
  /** Controls noise intensity. Default 0.03 (3%) */
  opacity?: number;
  /** Base frequency for the noise. Lower = larger grain. Default 0.65 */
  baseFrequency?: number;
  /** Number of octaves for fractal noise. Default 3 */
  numOctaves?: number;
  className?: string;
}

/**
 * Subtle film-grain / SVG noise overlay.
 * Renders an absolutely-positioned full-size overlay that prevents
 * backgrounds from feeling too sterile or "flat vector."
 *
 * Uses SVG feTurbulence (fractalNoise) + feColorMatrix for a
 * performant, resolution-independent grain texture.
 */
export function GrainyTexture({
  opacity = 0.08,
  baseFrequency = 0.65,
  numOctaves = 3,
  className,
}: GrainyTextureProps) {
  const grainId = useId();

  return (
    <div
      className={cn('absolute inset-0 pointer-events-none overflow-hidden', className)}
      aria-hidden="true"
      style={{ opacity }}
    >
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        className="block"
      >
        <filter id={grainId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency={baseFrequency}
            numOctaves={numOctaves}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect
          width="100%"
          height="100%"
          filter={`url(#${grainId})`}
        />
      </svg>
    </div>
  );
}
