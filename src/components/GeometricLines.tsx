'use client';

import { cn } from '@/lib/utils';

type Variant = 'wireframe-sphere' | 'plotting-grid' | 'concentric-arcs' | 'crosshair';

interface GeometricLinesProps {
  /** Which geometric pattern to render */
  variant?: Variant;
  /** Stroke colour (use Tailwind colour classes). Default black at low opacity. */
  strokeClass?: string;
  /** Stroke width. Default 0.5 */
  strokeWidth?: number;
  /** Additional classes on the wrapper */
  className?: string;
}

/**
 * Subtle geometric-line backgrounds for technical / feature-focused cards.
 * All variants use thin, low-opacity black strokes by default — designed
 * to sit behind content without competing for attention.
 *
 * Variants:
 *  - wireframe-sphere : concentric circles + meridian arcs + vertical centre-line
 *  - plotting-grid    : engineering graph-paper style with crosshair axes
 *  - concentric-arcs  : radar-style arcs radiating from bottom-left corner
 *  - crosshair        : centred targeting reticle with nested rings
 */
export function GeometricLines({
  variant = 'wireframe-sphere',
  strokeClass = 'stroke-black/[0.08]',
  strokeWidth = 0.5,
  className,
}: GeometricLinesProps) {
  return (
    <div
      className={cn('absolute inset-0 pointer-events-none overflow-hidden', className)}
      aria-hidden="true"
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 300 200"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        className="block"
      >
        {variant === 'wireframe-sphere' && (
          <WireframeSphere strokeClass={strokeClass} strokeWidth={strokeWidth} />
        )}
        {variant === 'plotting-grid' && (
          <PlottingGrid strokeClass={strokeClass} strokeWidth={strokeWidth} />
        )}
        {variant === 'concentric-arcs' && (
          <ConcentricArcs strokeClass={strokeClass} strokeWidth={strokeWidth} />
        )}
        {variant === 'crosshair' && (
          <Crosshair strokeClass={strokeClass} strokeWidth={strokeWidth} />
        )}
      </svg>
    </div>
  );
}

/* ── Wireframe Sphere ─────────────────────────────────── */

function WireframeSphere({
  strokeClass,
  strokeWidth,
}: {
  strokeClass: string;
  strokeWidth: number;
}) {
  // ViewBox is 300×200, centre at (150,100)
  const cx = 150;
  const cy = 100;
  const maxR = 90;

  // Horizontal "latitude" ellipses at different heights
  const latitudes = [0.3, 0.55, 0.75, 0.9, 1.0];
  // Vertical "longitude" ellipses at different rotations
  const longitudes = [-40, -20, 0, 20, 40];

  return (
    <g className={strokeClass} fill="none" strokeWidth={strokeWidth}>
      {/* Concentric latitude ovals */}
      {latitudes.map((scale) => {
        const rx = maxR * Math.sqrt(1 - (scale - 0.15) ** 2);
        const ry = maxR * scale * 0.55;
        return (
          <ellipse key={`lat-${scale}`} cx={cx} cy={cy} rx={rx} ry={ry} />
        );
      })}

      {/* Meridian arcs — rotated ellipses */}
      {longitudes.map((angle) => (
        <ellipse
          key={`lon-${angle}`}
          cx={cx}
          cy={cy}
          rx={maxR * 0.52}
          ry={maxR}
          transform={`rotate(${angle} ${cx} ${cy})`}
        />
      ))}

      {/* Vertical centre-line */}
      <line x1={cx} y1={cy - maxR} x2={cx} y2={cy + maxR} />
    </g>
  );
}

/* ── Plotting Grid ────────────────────────────────────── */

function PlottingGrid({
  strokeClass,
  strokeWidth,
}: {
  strokeClass: string;
  strokeWidth: number;
}) {
  const gridSize = 24;
  const cols = 12;
  const rows = 8;
  const w = cols * gridSize;
  const h = rows * gridSize;
  const cx = w / 2;
  const cy = h / 2;

  return (
    <g className={strokeClass} fill="none" strokeWidth={strokeWidth}>
      {/* Background grid */}
      {Array.from({ length: cols + 1 }, (_, i) => (
        <line key={`v-${i}`} x1={i * gridSize} y1={0} x2={i * gridSize} y2={h} />
      ))}
      {Array.from({ length: rows + 1 }, (_, i) => (
        <line key={`h-${i}`} x1={0} y1={i * gridSize} x2={w} y2={i * gridSize} />
      ))}

      {/* Major axes (slightly thicker) */}
      <line x1={cx} y1={0} x2={cx} y2={h} strokeWidth={strokeWidth * 2.5} />
      <line x1={0} y1={cy} x2={w} y2={cy} strokeWidth={strokeWidth * 2.5} />

      {/* Tick marks on X axis */}
      {Array.from({ length: cols }, (_, i) => {
        const x = i * gridSize + gridSize / 2;
        return (
          <line key={`tick-${i}`} x1={x} y1={cy - 4} x2={x} y2={cy + 4} />
        );
      })}
    </g>
  );
}

/* ── Concentric Arcs ──────────────────────────────────── */

function ConcentricArcs({
  strokeClass,
  strokeWidth,
}: {
  strokeClass: string;
  strokeWidth: number;
}) {
  const radii = [40, 80, 120, 180, 260, 360];
  const origin = { x: 0, y: 200 }; // bottom-left origin

  return (
    <g className={strokeClass} fill="none" strokeWidth={strokeWidth}>
      {radii.map((r) => (
        <circle key={`arc-${r}`} cx={origin.x} cy={origin.y} r={r} />
      ))}

      {/* Radial lines */}
      {[20, 40, 60, 80, 100, 120, 140, 160].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const endX = origin.x + 380 * Math.cos(rad);
        const endY = origin.y - 380 * Math.sin(rad);
        return (
          <line
            key={`radial-${deg}`}
            x1={origin.x}
            y1={origin.y}
            x2={endX}
            y2={endY}
          />
        );
      })}
    </g>
  );
}

/* ── Crosshair ────────────────────────────────────────── */

function Crosshair({
  strokeClass,
  strokeWidth,
}: {
  strokeClass: string;
  strokeWidth: number;
}) {
  const cx = 150;
  const cy = 100;
  const rings = [20, 40, 60, 80, 95];
  const armLen = 140;

  return (
    <g className={strokeClass} fill="none" strokeWidth={strokeWidth}>
      {/* Concentric rings */}
      {rings.map((r) => (
        <circle key={`ring-${r}`} cx={cx} cy={cy} r={r} />
      ))}

      {/* Crosshair arms */}
      <line x1={cx - armLen} y1={cy} x2={cx + armLen} y2={cy} />
      <line x1={cx} y1={cy - armLen} x2={cx} y2={cy + armLen} />

      {/* Diagonal hairlines */}
      <line x1={cx - 40} y1={cy - 40} x2={cx + 40} y2={cy + 40} />
      <line x1={cx + 40} y1={cy - 40} x2={cx - 40} y2={cy + 40} />

      {/* Centre dot */}
      <circle cx={cx} cy={cy} r={1.5} fill="currentColor" />
    </g>
  );
}
