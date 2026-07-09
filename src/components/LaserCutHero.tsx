'use client';

import { useEffect, useRef } from 'react';

/**
 * LaserCutHero — a complex, self-contained canvas animation for the hero.
 *
 * A laser head traces an intricate rose-curve medallion (the "cut path")
 * across a faint blueprint material sheet. As the head moves it leaves a
 * glowing orange kerf; sparks burst at the contact point and a soft halo
 * follows it. A live "job HUD" sits on top so the whole thing reads as a
 * real cutting job in progress.
 *
 * Pure canvas + rAF, pointer-events-none, respects prefers-reduced-motion
 * (renders a fully-cut static frame). No external deps.
 */

type Pt = { x: number; y: number; pen: boolean };

function buildPath(w: number, h: number): Pt[] {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.36;
  const pts: Pt[] = [];

  // Outer 3-petal rose curve
  const k = 3;
  const outerSteps = 520;
  for (let i = 0; i <= outerSteps; i++) {
    const t = (i / outerSteps) * Math.PI * 2;
    const r = R * Math.cos(k * t);
    pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t), pen: i !== 0 });
  }

  // Pen-up jump to inner ring
  pts.push({ x: cx + R * 0.55, y: cy, pen: false });

  // Inner ring
  const ringSteps = 120;
  for (let i = 0; i <= ringSteps; i++) {
    const t = (i / ringSteps) * Math.PI * 2;
    const r = R * 0.55;
    pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t), pen: i !== 0 });
  }

  // Pen-up jump to centre star
  pts.push({ x: cx, y: cy - R * 0.28, pen: false });

  // Inner 4-petal rose
  const innerSteps = 360;
  for (let i = 0; i <= innerSteps; i++) {
    const t = (i / innerSteps) * Math.PI * 2;
    const r = R * 0.28 * Math.cos(2 * t);
    pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t), pen: i !== 0 });
  }

  return pts;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

export function LaserCutHero({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let path: Pt[] = [];
    let raf = 0;
    let head = 0;
    const speed = 2.4;
    let pauseUntil = 0;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    const sparks: Spark[] = [];

    function resize() {
      if (!canvas || !ctx) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      path = buildPath(w, h);
      head = 0;
    }

    function drawSheet() {
      if (!ctx) return;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#fbfbfb');
      g.addColorStop(1, '#f1f1f1');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(0,0,0,0.05)';
      ctx.lineWidth = 1;
      const gap = 26;
      for (let x = 0; x <= w; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += gap) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Corner registration marks
      ctx.strokeStyle = 'rgba(255,92,0,0.35)';
      ctx.lineWidth = 1;
      const m = 14;
      const c = 16;
      const corners: [number, number][] = [
        [c, c],
        [w - c, c],
        [c, h - c],
        [w - c, h - c],
      ];
      for (const [x, y] of corners) {
        ctx.beginPath();
        ctx.moveTo(x - m, y);
        ctx.lineTo(x + m, y);
        ctx.moveTo(x, y - m);
        ctx.lineTo(x, y + m);
        ctx.stroke();
      }
    }

    function drawGhost() {
      if (!ctx || path.length === 0) return;
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let started = false;
      for (const p of path) {
        if (!p.pen) {
          ctx.moveTo(p.x, p.y);
          started = true;
          continue;
        }
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        }
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    function drawCut(upTo: number) {
      if (!ctx || path.length === 0) return;
      ctx.strokeStyle = 'rgba(255,92,0,0.92)';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      const limit = Math.min(path.length - 1, upTo);
      for (let i = 0; i <= limit; i++) {
        const p = path[i];
        if (!p.pen) {
          ctx.moveTo(p.x, p.y);
          started = true;
          continue;
        }
        if (!started) {
          const prev = path[i - 1];
          ctx.moveTo(prev ? prev.x : p.x, prev ? prev.y : p.y);
          started = true;
        }
        ctx.lineTo(p.x, p.y);
      }
      // Partial current segment
      const idx = Math.floor(upTo);
      const frac = upTo - idx;
      if (idx >= 0 && idx < path.length - 1 && path[idx + 1].pen) {
        const a = path[idx];
        const b = path[idx + 1];
        ctx.lineTo(a.x + (b.x - a.x) * frac, a.y + (b.y - a.y) * frac);
      }
      ctx.stroke();
    }

    function headPoint(upTo: number): Pt | null {
      const idx = Math.floor(upTo);
      const frac = upTo - idx;
      if (idx < 0 || idx >= path.length - 1) return path[path.length - 1] ?? null;
      const a = path[idx];
      const b = path[idx + 1];
      if (!b.pen) return a;
      return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac, pen: true };
    }

    function drawHead(p: Pt | null) {
      if (!ctx || !p) return;
      const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 34);
      halo.addColorStop(0, 'rgba(255,150,60,0.55)');
      halo.addColorStop(0.4, 'rgba(255,92,0,0.28)');
      halo.addColorStop(1, 'rgba(255,92,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,92,0,0.9)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    function spawnSparks(p: Pt | null) {
      if (!p) return;
      if (Math.random() > 0.6) return;
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 0.4 + Math.random() * 1.6;
        sparks.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 0.3,
          life: 0,
          max: 18 + Math.random() * 16,
        });
      }
    }

    function drawSparks() {
      if (!ctx) return;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += 1;
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.04;
        s.vx *= 0.98;
        if (s.life >= s.max) {
          sparks.splice(i, 1);
          continue;
        }
        const a = 1 - s.life / s.max;
        ctx.fillStyle = `rgba(255,${120 + Math.floor(80 * a)},40,${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.1 * a + 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      drawSheet();
      drawGhost();

      const now = performance.now();
      if (now >= pauseUntil) {
        head += speed;
        if (head >= path.length - 1) {
          head = path.length - 1;
          pauseUntil = now + 1600;
          restartTimer = setTimeout(() => {
            head = 0;
            sparks.length = 0;
          }, 1600);
        }
      }

      drawCut(head);
      const hp = headPoint(head);
      if (now < pauseUntil) {
        drawHead(hp);
      } else {
        spawnSparks(hp);
        drawHead(hp);
      }
      drawSparks();

      raf = requestAnimationFrame(frame);
    }

    function staticFrame() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      drawSheet();
      drawGhost();
      drawCut(path.length - 1);
    }

    resize();
    window.addEventListener('resize', resize);
    if (reduce) {
      staticFrame();
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
      if (restartTimer) clearTimeout(restartTimer);
    };
  }, []);

  return (
    <div
      className={`relative overflow-hidden border border-[#EAEAEA] bg-[#F7F7F7] ${className}`}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />

      {/* Job HUD overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAEAEA] bg-white/85 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#666] backdrop-blur">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-[#FF5C00]" />
            Laser 02 · CO₂ 80W
          </span>
          <span className="rounded-full border border-[#FF5C00]/30 bg-[#FF5C00]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#FF5C00] backdrop-blur">
            Cutting
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="rounded-lg border border-[#EAEAEA] bg-white/85 px-3 py-2 backdrop-blur">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#999]">
              Job
            </p>
            <p className="font-mono text-sm font-semibold text-black">PBR-2041</p>
          </div>
          <div className="rounded-lg border border-[#EAEAEA] bg-white/85 px-3 py-2 text-right backdrop-blur">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#999]">
              Precision
            </p>
            <p className="font-mono text-sm font-semibold text-black">±0.05mm</p>
          </div>
        </div>
      </div>
    </div>
  );
}
