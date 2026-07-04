'use client';

import { useEffect, useRef } from 'react';

/**
 * A full-viewport animated geometric background rendered on a <canvas>.
 * Subtle orange (#FF5C00) wireframe shapes — circles, arcs, and
 * intersecting lines — rotate and drift slowly behind the page content.
 *
 * Renders once on mount and animates via requestAnimationFrame.
 * No React re-renders — pure canvas draw loop for performance.
 */
export function AnimatedGeometricBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let elapsed = 0;

    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;

    const resize = () => {
      // Prevent resize jumps on mobile caused by the address bar hiding/showing
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;
      
      const widthChanged = currentWidth !== lastWidth;
      const heightChanged = Math.abs(currentHeight - lastHeight) > 100;

      if (widthChanged || heightChanged || canvas.width === 0) {
        canvas.width = currentWidth;
        canvas.height = currentHeight;
        lastWidth = currentWidth;
        lastHeight = currentHeight;
      }
    };

    resize();
    window.addEventListener('resize', resize);

    function draw(timestamp: number) {
      const w = canvas!.width;
      const h = canvas!.height;
      const dt = Math.min((timestamp - elapsed) / 1000, 0.1); // cap at 100ms to avoid jumps
      elapsed = timestamp;

      ctx!.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const maxDim = Math.max(w, h);

      // Accumulated rotation angle (slow)
      const angle = (elapsed * 0.0001) % (Math.PI * 2);
      const angleFast = (elapsed * 0.0003) % (Math.PI * 2);

      ctx!.save();
      ctx!.translate(cx, cy);

      // ── 1. Large rotating concentric circles ──
      ctx!.strokeStyle = '#FF5C00';
      ctx!.lineWidth = 0.7;
      ctx!.globalAlpha = 0.12;

      for (let i = 1; i <= 6; i++) {
        const r = (maxDim * 0.15) * i;
        ctx!.beginPath();
        ctx!.arc(0, 0, r, 0, Math.PI * 2);
        ctx!.stroke();
      }

      // ── 2. Rotating crosshair lines ──
      ctx!.globalAlpha = 0.14;
      ctx!.lineWidth = 0.6;

      ctx!.save();
      ctx!.rotate(angle);
      ctx!.beginPath();
      ctx!.moveTo(-maxDim, 0);
      ctx!.lineTo(maxDim, 0);
      ctx!.moveTo(0, -maxDim);
      ctx!.lineTo(0, maxDim);
      ctx!.stroke();
      ctx!.restore();

      // ── 3. Diagonal lines rotating at different speed ──
      ctx!.globalAlpha = 0.10;
      ctx!.save();
      ctx!.rotate(angleFast);
      ctx!.beginPath();
      ctx!.moveTo(-maxDim, -maxDim);
      ctx!.lineTo(maxDim, maxDim);
      ctx!.moveTo(maxDim, -maxDim);
      ctx!.lineTo(-maxDim, maxDim);
      ctx!.stroke();
      ctx!.restore();

      // ── 4. Small orbiting dotted rings ──
      const orbitCount = 3;
      for (let o = 0; o < orbitCount; o++) {
        const orbitAngle = angle + (o * Math.PI * 2) / orbitCount;
        const orbitR = maxDim * 0.3;
        const ox = Math.cos(orbitAngle) * orbitR;
        const oy = Math.sin(orbitAngle) * orbitR;

        ctx!.globalAlpha = 0.15;
        ctx!.strokeStyle = '#FF5C00';
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.arc(ox, oy, maxDim * 0.08, 0, Math.PI * 2);
        ctx!.stroke();

        // Cross inside each orbiting ring
        ctx!.globalAlpha = 0.10;
        const innerR = maxDim * 0.08;
        ctx!.beginPath();
        ctx!.moveTo(ox - innerR, oy);
        ctx!.lineTo(ox + innerR, oy);
        ctx!.moveTo(ox, oy - innerR);
        ctx!.lineTo(ox, oy + innerR);
        ctx!.stroke();
      }

      // ── 5. Large wireframe arcs (partial circles) ──
      ctx!.globalAlpha = 0.09;
      ctx!.lineWidth = 0.7;
      for (let a = 0; a < 4; a++) {
        const arcAngle = angle * 0.5 + (a * Math.PI) / 2;
        const arcR = maxDim * 0.45 + Math.sin(elapsed * 0.00005 + a) * 30;
        ctx!.beginPath();
        ctx!.arc(0, 0, arcR, arcAngle, arcAngle + Math.PI * 0.7);
        ctx!.stroke();
      }

      ctx!.restore();

      animationId = requestAnimationFrame(draw);
    }

    animationId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}
