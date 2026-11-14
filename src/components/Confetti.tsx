// Hole-punch confetti: paper chads, torn strips of squared paper, highlighter
// flecks and gold star stickers, thrown up from the mark and fluttering down.
// One full-screen canvas for the whole app; components fire bursts via celebrate.ts.

import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { onBurst, type Burst } from '../lib/celebrate.ts';

type Kind = 'chad' | 'strip' | 'fleck' | 'star';

interface Piece {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
  colour: string;
  phase: number;
  life: number;
}

const GOLD = '#f2b705';

function drawStar(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

export function ConfettiLayer() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reduce) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let pieces: Piece[] = [];
    let raf = 0;
    let running = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let last = 0;
    const frame = (now: number) => {
      // Tuned at 60 fps; scale every step by the real time since the last frame.
      const k = last ? Math.min(3, (now - last) / (1000 / 60)) : 1;
      last = now;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const h = window.innerHeight;
      pieces = pieces.filter((p) => p.y < h + 40 && p.life > 0);
      for (const p of pieces) {
        p.vy += (p.kind === 'star' ? 0.22 : 0.17) * k;
        const drag = Math.pow(0.985, k);
        p.vx *= drag;
        p.vy *= drag;
        // Paper flutters as it falls.
        const flutter = p.kind === 'star' ? 0 : Math.sin(p.phase) * 0.6;
        p.phase += 0.12 * k;
        p.x += (p.vx + flutter) * k;
        p.y += Math.min(p.vy, p.kind === 'star' ? 9 : 3.2) * k;
        p.rot += p.spin * k;
        p.life -= k;
        const alpha = Math.min(1, p.life / 30);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.kind === 'chad') {
          // A hole-punch circle, tumbling: squash one axis to fake the flip.
          ctx.scale(1, Math.abs(Math.cos(p.phase * 0.7)) * 0.9 + 0.1);
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fillStyle = '#fbf8ef';
          ctx.fill();
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = 'rgba(31,42,68,0.35)';
          ctx.stroke();
          if (p.colour !== '') {
            ctx.beginPath();
            ctx.moveTo(-p.size, 0);
            ctx.lineTo(p.size, 0);
            ctx.strokeStyle = p.colour;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        } else if (p.kind === 'strip') {
          ctx.scale(Math.abs(Math.cos(p.phase * 0.5)) * 0.9 + 0.1, 1);
          ctx.fillStyle = '#f5f1e6';
          ctx.fillRect(-p.size * 0.35, -p.size, p.size * 0.7, p.size * 2);
          ctx.strokeStyle = 'rgba(31,42,68,0.25)';
          ctx.lineWidth = 0.6;
          ctx.strokeRect(-p.size * 0.35, -p.size, p.size * 0.7, p.size * 2);
          ctx.strokeStyle = '#a9bfd6';
          ctx.beginPath();
          ctx.moveTo(-p.size * 0.35, -p.size * 0.2);
          ctx.lineTo(p.size * 0.35, -p.size * 0.2);
          ctx.stroke();
        } else if (p.kind === 'fleck') {
          ctx.fillStyle = p.colour;
          ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
        } else {
          drawStar(ctx, p.size);
          ctx.fillStyle = GOLD;
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#a57a00';
          ctx.stroke();
        }
        ctx.restore();
      }
      if (pieces.length > 0) raf = requestAnimationFrame(frame);
      else {
        running = false;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };

    const add = (b: Burst) => {
      const n = b.chads + b.stars;
      for (let i = 0; i < n; i++) {
        const isStar = i < b.stars;
        const r = Math.random();
        const kind: Kind = isStar ? 'star' : r < 0.55 ? 'chad' : r < 0.8 ? 'strip' : 'fleck';
        // Flicked out to both sides and a little upwards, so it falls beside and below
        // the mark rather than over the question and your answer.
        const side = Math.random() < 0.5 ? -1 : 1;
        const angle = (side < 0 ? Math.PI : 0) - side * (Math.random() * 0.55);
        const speed = (isStar ? 5 : 4) + Math.random() * (isStar ? 6 : 7);
        pieces.push({
          kind,
          x: b.x + (Math.random() - 0.5) * 30,
          y: b.y + (Math.random() - 0.5) * 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.3,
          size: kind === 'star' ? 6 + Math.random() * 6 : kind === 'strip' ? 6 + Math.random() * 4 : 3 + Math.random() * 2.5,
          colour: kind === 'fleck' ? b.colour : kind === 'chad' && Math.random() < 0.3 ? '#a9bfd6' : '',
          phase: Math.random() * Math.PI * 2,
          life: 240 + Math.random() * 90,
        });
      }
      if (!running) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    const off = onBurst(add);
    return () => {
      off();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [reduce]);

  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
