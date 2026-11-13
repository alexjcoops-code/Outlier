// "Where did you land?": the whole crowd as pencil dots on a number line.
//
// One dot is 1% of the (weighted) answers. Dots pile up where people agree; the
// player's own answer drops in last, in red ink. Obvious answers sit on a tall
// pile; outliers sit alone in the empty paper to the side.

import { motion, useReducedMotion } from 'framer-motion';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Prompt } from '../prompts.ts';
import { formatShare } from '../lib/scoring.ts';

export interface CrowdValue {
  value: number;
  share: number;
}

interface Props {
  prompt: Prompt;
  values: readonly CrowdValue[];
  /** The player's answer, if any. */
  mine?: number | null;
  /** Let the dots fall in (respects reduced motion). */
  animate?: boolean;
  /** A thin strip for lists: no labels. */
  compact?: boolean;
  /** Shown under the plot. */
  caption?: string;
}

/** Split `total` dots between values in proportion to their shares (largest remainder). */
export function allocateDots(values: readonly CrowdValue[], total: number): Map<number, number> {
  const sum = values.reduce((s, v) => s + v.share, 0) || 1;
  const exact = values.map((v) => (v.share / sum) * total);
  const dots = exact.map(Math.floor);
  let left = total - dots.reduce((s, x) => s + x, 0);
  const order = values.map((_, i) => i).sort((a, b) => exact[b]! - dots[b]! - (exact[a]! - dots[a]!) || a - b);
  for (const i of order) {
    if (left-- <= 0) break;
    dots[i]!++;
  }
  const out = new Map<number, number>();
  values.forEach((v, i) => {
    if (dots[i]! > 0) out.set(v.value, dots[i]!);
  });
  return out;
}

/** Position along the line, 0–1. Wide ranges use a log scale so small numbers don't all collapse together. */
export function scalePosition(prompt: Prompt, value: number): number {
  const lo = Math.max(1, prompt.min);
  const hi = Math.max(lo + 1, prompt.max);
  const v = Math.min(hi, Math.max(lo, value));
  if (hi / lo > 50) return Math.log(v / lo) / Math.log(hi / lo);
  return (v - lo) / (hi - lo);
}

/** A tiny deterministic wobble so the dots look placed by hand. */
function wobble(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

const short = (n: number) => n.toLocaleString('en-GB');

export function CrowdPlot({ prompt, values, mine = null, animate = false, compact = false, caption }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(compact ? 300 : 340);
  useLayoutEffect(() => {
    const measure = () => {
      const w = ref.current?.getBoundingClientRect().width;
      if (w) setWidth(Math.round(w));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const height = compact ? 40 : 168;
  const pad = compact ? 3 : 10;
  const base = compact ? height - 6 : height - 30;
  const top = compact ? 4 : 30;
  const r = compact ? 1.5 : 2.5;
  const pitch = compact ? 3.6 : 6.4;
  const totalDots = compact ? 60 : 100;
  const fall = animate && !reduce;

  const layout = useMemo(() => {
    const plotW = Math.max(60, width - pad * 2);
    const bins = Math.max(8, Math.floor(plotW / pitch));
    const binOf = (v: number) => Math.min(bins - 1, Math.floor(scalePosition(prompt, v) * bins));
    const dots = allocateDots(values, totalDots);

    const stacks = new Map<number, { count: number; values: Map<number, number> }>();
    for (const [value, n] of dots) {
      const b = binOf(value);
      const s = stacks.get(b) ?? { count: 0, values: new Map() };
      s.count += n;
      s.values.set(value, n);
      stacks.set(b, s);
    }
    const mineBin = mine === null ? null : binOf(mine);
    const mineHasDot = mine !== null && (dots.get(mine) ?? 0) > 0;
    // Dots keep an even spacing so small piles stay readable. Piles taller than
    // the page are cut off with a break mark (their share is labelled instead).
    const step = compact ? 3 : pitch * 0.82;
    const maxRows = Math.max(3, Math.floor((base - top) / step) - (mine === null ? 0 : 1));
    const xOf = (b: number) => pad + (b + 0.5) * (plotW / bins);

    const grey: { x: number; y: number; order: number }[] = [];
    const breaks: { x: number; y: number }[] = [];
    let mineDot: { x: number; y: number } | null = null;
    const drawnHeight = new Map<number, number>();
    for (const [b, s] of stacks) {
      let n = s.count;
      // The player's own dot is the top one of their pile.
      if (b === mineBin && mineHasDot) n -= 1;
      if (n > maxRows) {
        n = maxRows;
        breaks.push({ x: xOf(b), y: base - r - (maxRows - 0.2) * step });
      }
      drawnHeight.set(b, n);
      for (let i = 0; i < n; i++) {
        grey.push({
          x: xOf(b) + wobble(b, i) * (compact ? 0.4 : 1.1),
          y: base - r - i * step + wobble(i, b) * 0.6,
          order: i * 3 + wobble(b, 7) * 6,
        });
      }
    }
    if (mineBin !== null) {
      const below = drawnHeight.get(mineBin) ?? 0;
      mineDot = { x: xOf(mineBin), y: base - r - below * step - (below > 0 ? 1.5 : 0) };
    }
    grey.sort((a, b) => a.order - b.order);

    // The crowd's favourite: label the biggest pile with its most common answer.
    let peak: { x: number; y: number; value: number; share: number } | null = null;
    const best = values[0];
    if (best) {
      const b = binOf(best.value);
      if (stacks.has(b)) {
        const h = drawnHeight.get(b) ?? 0;
        peak = { x: xOf(b), y: base - r - h * step - 8, value: best.value, share: best.share };
      }
    }
    const alone = mineBin !== null && (stacks.get(mineBin)?.count ?? 0) - (mineHasDot ? 1 : 0) === 0;
    return { grey, breaks, mineDot, peak, alone, step };
  }, [values, mine, width, prompt, compact, pad, pitch, base, top, r, totalDots]);

  const mineShare = mine === null ? null : (values.find((v) => v.value === mine)?.share ?? 0);
  const label = [
    values[0] ? `Most common answer ${short(values[0].value)}, ${formatShare(values[0].share)} of answers.` : 'No answers yet.',
    mine !== null ? `Your answer ${short(mine)}, ${formatShare(mineShare ?? 0)}.` : '',
  ].join(' ');

  const peakNearMine = layout.peak && layout.mineDot && Math.abs(layout.peak.x - layout.mineDot.x) < 46;
  const youRight = layout.mineDot ? layout.mineDot.x < width - 90 : true;

  return (
    <figure className={`crowd ${compact ? 'crowd--compact' : ''}`}>
      <svg ref={ref} className="crowd__svg" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {/* the number line */}
        <path
          d={`M${pad - 2} ${base + 0.5} L${width - pad + 2} ${base + 0.5}`}
          stroke="var(--ink)"
          strokeWidth={compact ? 1 : 1.4}
          filter={compact ? undefined : 'url(#pencil-texture)'}
        />
        {!compact && (
          <>
            <path d={`M${pad} ${base - 4} L${pad} ${base + 5}`} stroke="var(--ink)" strokeWidth="1.4" />
            <path d={`M${width - pad} ${base - 4} L${width - pad} ${base + 5}`} stroke="var(--ink)" strokeWidth="1.4" />
            <text x={pad} y={base + 19} className="crowd__axis" textAnchor="start">
              {short(prompt.min)}
            </text>
            <text x={width - pad} y={base + 19} className="crowd__axis" textAnchor="end">
              {short(prompt.max)}
            </text>
          </>
        )}

        {layout.grey.map((d, i) =>
          fall ? (
            <motion.circle
              key={i}
              cx={d.x}
              r={r}
              className="crowd__dot"
              initial={{ cy: -8, opacity: 0 }}
              animate={{ cy: d.y, opacity: 1 }}
              transition={{ duration: 0.38, delay: 0.15 + (i / layout.grey.length) * 0.75, ease: [0.5, 0, 0.9, 0.6] }}
            />
          ) : (
            <circle key={i} cx={d.x} cy={d.y} r={r} className="crowd__dot" />
          ),
        )}

        {/* piles too tall for the page: a pencil break where they are cut off */}
        {layout.breaks.map((b, i) => (
          <path
            key={`break-${i}`}
            d={`M${b.x - 5} ${b.y + 2} l3 -3 l3 3 l3 -3`}
            transform={`translate(-1.5 0)`}
            fill="none"
            stroke="var(--paper)"
            strokeWidth={compact ? 1.6 : 2.6}
          />
        ))}

        {!compact && layout.peak && !peakNearMine && (
          <motion.text
            x={layout.peak.x < 60 ? layout.peak.x - 4 : layout.peak.x > width - 60 ? layout.peak.x + 4 : layout.peak.x}
            y={Math.max(12, layout.peak.y)}
            className="crowd__peak"
            textAnchor={layout.peak.x < 60 ? 'start' : layout.peak.x > width - 60 ? 'end' : 'middle'}
            initial={fall ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ delay: fall ? 1.1 : 0 }}
          >
            {short(layout.peak.value)} · {formatShare(layout.peak.share)}
          </motion.text>
        )}

        {layout.mineDot && (
          <g>
            {layout.alone && !compact && (
              <motion.ellipse
                cx={layout.mineDot.x}
                cy={layout.mineDot.y}
                rx={13}
                ry={11}
                fill="none"
                stroke="var(--pencil)"
                strokeWidth="1.2"
                strokeDasharray="3 3"
                initial={fall ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ delay: fall ? 1.5 : 0 }}
              />
            )}
            {fall ? (
              <motion.circle
                cx={layout.mineDot.x}
                r={compact ? 2.6 : 4.2}
                className="crowd__mine"
                initial={{ cy: -12, opacity: 0 }}
                animate={{ cy: layout.mineDot.y, opacity: 1 }}
                transition={{ delay: 1.05, type: 'spring', stiffness: 420, damping: 14 }}
              />
            ) : (
              <circle cx={layout.mineDot.x} cy={layout.mineDot.y} r={compact ? 2.6 : 4.2} className="crowd__mine" />
            )}
            {!compact && (
              <motion.g
                initial={fall ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ delay: fall ? 1.35 : 0, duration: 0.25 }}
              >
                <path
                  d={
                    youRight
                      ? `M${layout.mineDot.x + 7} ${layout.mineDot.y - 5} C${layout.mineDot.x + 14} ${layout.mineDot.y - 14}, ${layout.mineDot.x + 20} ${Math.max(14, layout.mineDot.y - 22)}, ${layout.mineDot.x + 28} ${Math.max(12, layout.mineDot.y - 24)}`
                      : `M${layout.mineDot.x - 7} ${layout.mineDot.y - 5} C${layout.mineDot.x - 14} ${layout.mineDot.y - 14}, ${layout.mineDot.x - 20} ${Math.max(14, layout.mineDot.y - 22)}, ${layout.mineDot.x - 28} ${Math.max(12, layout.mineDot.y - 24)}`
                  }
                  fill="none"
                  stroke="var(--redpen)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <text
                  x={layout.mineDot.x + (youRight ? 31 : -31)}
                  y={Math.max(15, layout.mineDot.y - 22)}
                  className="crowd__you"
                  textAnchor={youRight ? 'start' : 'end'}
                >
                  {layout.alone ? `you, alone (${short(mine!)})` : `you (${short(mine!)})`}
                </text>
              </motion.g>
            )}
          </g>
        )}
      </svg>
      {caption && !compact && <figcaption className="crowd__caption">{caption}</figcaption>}
    </figure>
  );
}
