// "Where did you land?": the crowd as real balls in a rack of tubes.
//
// Every answer is a ball. They pour into tubes standing on the number line,
// bounce, rattle and settle into piles where people agreed. The player's red
// ball drops in last and lands with a thud. Tap the rack to shake it.
//
// Physics by matter-js on a canvas. With reduced motion, or in the small
// strips on the results page, the balls are simply drawn at rest.
import { formatAnswer } from '../lib/format.ts';

import { useReducedMotion } from 'framer-motion';
import Matter from 'matter-js';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  formatPerBall,
  rackLayout,
  restingPositions,
  type CrowdValue,
  type RackLayout,
} from '../lib/crowdLayout.ts';
import { formatShare } from '../lib/scoring.ts';
import type { Prompt } from '../prompts.ts';

export type { CrowdValue };

interface Props {
  prompt: Prompt;
  values: readonly CrowdValue[];
  /** The player's answer, if any. */
  mine?: number | null;
  /** Pour the balls in with physics when the rack comes into view (respects reduced motion). */
  animate?: boolean;
  /** A thin strip for lists: no labels, no physics. */
  compact?: boolean;
  /** Shown under the rack, after the "each ball is…" line. */
  caption?: string;
  /** Rack height in pixels (default 240; compact strips are 40). */
  height?: number;
  /** The player's answer scored Lone Wolf: nobody else gave it. Only then is it labelled "alone". */
  lone?: boolean;
  /** How hard the player's ball knocks the crowd when it lands, 0 (not at all) to about 1.5. */
  shockwave?: number;
}

interface DrawnBall {
  x: number;
  y: number;
  mine: boolean;
  /** Squash on impact: 0 is round. */
  squash: number;
}

const INK = '#1f2a44';
const PENCIL = '#6b6b6b';
const RED = '#c62828';
const short = formatAnswer;

function drawRack(
  ctx: CanvasRenderingContext2D,
  L: RackLayout,
  lone: boolean,
  balls: readonly DrawnBall[],
  labels: number,
  prompt: Prompt,
  values: readonly CrowdValue[],
  mine: number | null,
  compact: boolean,
) {
  ctx.clearRect(0, 0, L.width, L.height);
  const r = L.radius;

  // The rack: faint pencil tubes standing on the number line.
  if (!compact) {
    ctx.strokeStyle = 'rgba(107,107,107,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const wallTop = L.floor - (L.floor - 30) * 0.55;
    for (let k = 0; k <= L.tubes; k++) {
      const x = Math.round(L.left + k * L.tubeWidth) + 0.5;
      ctx.moveTo(x, L.floor);
      ctx.lineTo(x, wallTop + ((k * 7) % 5));
    }
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = compact ? 1 : 1.6;
  ctx.beginPath();
  ctx.moveTo(L.left - 3, L.floor + 0.5);
  ctx.lineTo(L.width - L.left + 3, L.floor + 0.5);
  if (!compact) {
    ctx.moveTo(L.left, L.floor - 5);
    ctx.lineTo(L.left, L.floor + 6);
    ctx.moveTo(L.width - L.left, L.floor - 5);
    ctx.lineTo(L.width - L.left, L.floor + 6);
  }
  ctx.stroke();
  if (!compact) {
    ctx.fillStyle = INK;
    ctx.font = '13px Andika, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(short(prompt.min), L.left, L.floor + 20);
    ctx.textAlign = 'right';
    ctx.fillText(short(prompt.max), L.width - L.left, L.floor + 20);
  }

  // The balls: flat pencil discs, and yours in red pen with a ring round it, so it
  // reads by shape as well as colour (docs/art-direction.md: marks are flat).
  for (const b of balls) {
    const sy = 1 - b.squash;
    const sx = 1 + b.squash * 0.7;
    ctx.save();
    ctx.translate(b.x, b.y + r);
    ctx.scale(sx, sy);
    ctx.translate(0, -r);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    if (b.mine) {
      ctx.fillStyle = RED;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, r + Math.max(1.6, r * 0.55), 0, Math.PI * 2);
      ctx.strokeStyle = RED;
      ctx.lineWidth = compact ? 1 : 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(107, 107, 107, 0.42)';
      ctx.fill();
      if (!compact) {
        ctx.strokeStyle = 'rgba(70, 70, 70, 0.8)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  if (compact || labels <= 0) return;
  ctx.globalAlpha = Math.min(1, labels);

  const mineBall = balls.find((b) => b.mine);
  // The crowd's favourite, labelled above its pile, unless it would collide with the player's label.
  const best = values[0];
  if (best && L.peakTube !== null && !(L.mineTube !== null && Math.abs(L.mineTube - L.peakTube) * L.tubeWidth < 70)) {
    const x = L.left + (L.peakTube + 0.5) * L.tubeWidth;
    const topY = Math.min(
      L.floor,
      ...balls.filter((b) => Math.abs(b.x - x) < L.tubeWidth / 2 && !b.mine).map((b) => b.y - r),
    );
    ctx.fillStyle = PENCIL;
    ctx.font = '700 13px Andika, sans-serif';
    const align = x < 60 ? 'left' : x > L.width - 60 ? 'right' : 'center';
    ctx.textAlign = align;
    ctx.fillText(
      `${short(best.value)} · ${formatShare(best.share)}`,
      align === 'left' ? x - 4 : align === 'right' ? x + 4 : x,
      Math.max(13, topY - 7),
    );
  }

  if (mineBall && mine !== null) {
    const { x, y } = mineBall;
    const right = x < L.width - 120;
    const dir = right ? 1 : -1;
    // Lift the label clear of nearby piles.
    const nearbyTop = Math.min(
      y,
      ...balls.filter((b) => !b.mine && Math.abs(b.x - x) < 110).map((b) => b.y - r),
    );
    const ty = Math.max(16, Math.min(y - 24, nearbyTop - 14));
    if (lone) {
      ctx.strokeStyle = PENCIL;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.ellipse(x, y, r + 9, r + 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + dir * (r + 4), y - r - 2);
    ctx.bezierCurveTo(x + dir * 10, y - 16, x + dir * 18, ty + 6, x + dir * 28, ty - 2);
    ctx.stroke();
    ctx.font = '700 19px Kalam, cursive';
    ctx.textAlign = right ? 'left' : 'right';
    const text = lone ? `you, alone (${short(mine)})` : `you (${short(mine)})`;
    // A halo of paper so the writing stays legible over the balls.
    ctx.strokeStyle = '#f5f1e6';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x + dir * 31, ty + 4);
    ctx.fillStyle = RED;
    ctx.fillText(text, x + dir * 31, ty + 4);
  }
  ctx.globalAlpha = 1;
}

export function CrowdPlot({ prompt, values, mine = null, animate = false, compact = false, caption, height: wanted, lone = false, shockwave = 0 }: Props) {
  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shakeRef = useRef<(() => void) | null>(null);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const [settled, setSettled] = useState(false);
  const height = compact ? 40 : (wanted ?? 240);
  const physical = animate && !reduce && !compact;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pour only once the rack is on screen, so nobody misses it.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !physical) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [physical]);

  const layout = useMemo(
    () =>
      width > 0
        ? rackLayout(
            prompt,
            values,
            mine,
            width,
            height,
            compact ? { pad: 3, floorGap: 5, top: 3, pitch: 4.4 } : { pad: 10, floorGap: 30, top: 34, pitch: 9 },
          )
        : null,
    [prompt, values, mine, width, height, compact],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(layout.width * dpr);
    canvas.height = Math.round(layout.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const draw = (balls: DrawnBall[], labels: number) =>
      drawRack(ctx, layout, lone, balls, labels, prompt, values, mine, compact);

    if (!physical) {
      const still = restingPositions(layout).map((p) => ({ ...p, squash: 0 }));
      draw(still, 1);
      // Redraw once the fonts have loaded, for the labels.
      void document.fonts?.ready.then(() => draw(still, 1));
      setSettled(true);
      shakeRef.current = null;
      return;
    }
    setSettled(false);
    if (!visible) {
      draw([], 0);
      return;
    }

    // ── The physics ──
    const { Engine, Bodies, Body, Composite } = Matter;
    const L = layout;
    const r = L.radius;
    // In the simulation the balls are a touch smaller than drawn, so they never
    // jam against the tube walls; the walls are thick enough not to tunnel through.
    const physR = Math.max(1, Math.min(r - 0.3, (L.tubeWidth - 2.2) / 2 - 0.25));
    const engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.0011 } });
    engine.positionIterations = 16;
    engine.velocityIterations = 12;
    const statics: Matter.Body[] = [
      Bodies.rectangle(L.width / 2, L.floor + 25, L.width * 2, 50, { isStatic: true, friction: 0.3, restitution: 0.2 }),
      // Thick outer walls, beyond the first and last tube.
      Bodies.rectangle(L.left - 25, L.floor - 300, 50, 600, { isStatic: true }),
      Bodies.rectangle(L.width - L.left + 25, L.floor - 300, 50, 600, { isStatic: true }),
    ];
    for (let k = 1; k < L.tubes; k++) {
      const x = L.left + k * L.tubeWidth;
      statics.push(Bodies.rectangle(x, L.floor - 300, 2.2, 600, { isStatic: true, friction: 0, restitution: 0.3 }));
    }
    Composite.add(engine.world, statics);

    interface Live {
      body: Matter.Body;
      mine: boolean;
      squash: number;
      lastVy: number;
    }
    const live: Live[] = [];
    const queue = L.balls
      .filter((b) => !b.mine)
      .map((b) => ({ b, key: Math.random() }))
      .sort((a, b) => a.key - b.key)
      .map(({ b }, i, all) => ({ b, at: (i / Math.max(1, all.length)) * 1300 }));
    const mineBall = L.balls.find((b) => b.mine);
    if (mineBall) queue.push({ b: mineBall, at: 1300 + 450 });

    const spawn = (tube: number, isMine: boolean) => {
      const x = L.left + (tube + 0.5) * L.tubeWidth + (Math.random() - 0.5) * 0.5;
      const body = Bodies.circle(x, isMine ? -70 : -r - Math.random() * 30, physR, {
        restitution: isMine ? 0.5 : 0.32,
        friction: 0.02,
        frictionAir: 0.006,
        density: isMine ? 0.003 : 0.001,
        slop: 0.01,
      });
      Body.setVelocity(body, { x: (Math.random() - 0.5) * 0.8, y: isMine ? 6 : 2 + Math.random() * 2 });
      Composite.add(engine.world, body);
      live.push({ body, mine: isMine, squash: 0, lastVy: 0 });
    };

    let raf = 0;
    let running = false;
    let started = performance.now();
    let last = started;
    let next = 0;
    let quiet = 0;
    let labels = 0;
    let done = false;
    let landed = false;
    const STEP = 1000 / 60;

    const frame = (now: number) => {
      const elapsed = now - started;
      while (next < queue.length && queue[next]!.at <= elapsed) {
        spawn(queue[next]!.b.tube, queue[next]!.b.mine);
        next++;
      }
      let steps = Math.min(4, Math.max(1, Math.round((now - last) / STEP)));
      last = now;
      while (steps-- > 0) {
        for (const b of live) b.lastVy = b.body.velocity.y;
        Engine.update(engine, STEP);
        for (const b of live) {
          // Keep sideways rattling gentle so balls stay in their tubes.
          if (Math.abs(b.body.velocity.x) > 1.5) {
            Body.setVelocity(b.body, { x: Math.sign(b.body.velocity.x) * 1.5, y: b.body.velocity.y });
          }
          const vy = b.body.velocity.y;
          // A sudden stop is an impact: squash the ball for a moment.
          if (b.lastVy > 1.4 && vy < b.lastVy * 0.45) {
            b.squash = Math.min(b.mine ? 0.4 : 0.3, b.lastVy * 0.05);
            if (b.mine && b.lastVy > 3 && !landed) {
              landed = true;
              const jolt = 2.5 + 6 * shockwave;
              canvas.animate?.(
                [{ transform: 'translateY(0)' }, { transform: `translateY(${jolt}px)` }, { transform: 'translateY(0)' }],
                { duration: 170 + 120 * shockwave, easing: 'ease-out' },
              );
              // A rare answer hits hard: the crowd jumps away from it.
              if (shockwave > 0) {
                const mx = b.body.position.x;
                for (const o of live) {
                  if (o === b) continue;
                  const dx = o.body.position.x - mx;
                  const near = Math.exp(-Math.abs(dx) / (L.width * 0.4));
                  Body.setVelocity(o.body, {
                    x: Math.sign(dx || 1) * 1.4 * near * shockwave,
                    y: -(2.5 + 6 * near + Math.random() * 2) * shockwave,
                  });
                }
              }
            }
          }
          b.squash *= 0.8;
        }
      }

      const allIn = next >= queue.length;
      const maxSpeed = live.reduce((m, b) => Math.max(m, b.body.speed), 0);
      quiet = allIn && maxSpeed < 0.3 ? quiet + 1 : 0;
      const lastAt = queue.length ? queue[queue.length - 1]!.at : 0;
      if (!done && (quiet > 15 || (allIn && elapsed > lastAt + 1600))) {
        done = true;
        setSettled(true);
      }
      if (done) labels = Math.min(1, labels + 0.07);

      draw(
        live.map((b) => ({ x: b.body.position.x, y: b.body.position.y, mine: b.mine, squash: b.squash })),
        labels,
      );

      if (done && labels >= 1 && (maxSpeed < 0.05 || elapsed > lastAt + 6000)) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    const run = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    shakeRef.current = () => {
      for (const b of live) {
        Body.setVelocity(b.body, {
          x: (Math.random() - 0.5) * 2.4,
          y: -(2.5 + Math.random() * 5) * (b.mine ? 1.25 : 1),
        });
      }
      started = performance.now() - (queue.length ? queue[queue.length - 1]!.at : 0) - 1;
      next = queue.length;
      done = false;
      quiet = 0;
      labels = 0;
      setSettled(false);
      run();
    };

    started = performance.now();
    run();
    return () => {
      cancelAnimationFrame(raf);
      running = false;
      Composite.clear(engine.world, false);
      Engine.clear(engine);
      shakeRef.current = null;
    };
  }, [layout, physical, visible, prompt, values, mine, compact, lone, shockwave]);

  const mineShare = mine === null ? null : (values.find((v) => v.value === mine)?.share ?? 0);
  const label = [
    values[0] ? `Most common answer ${short(values[0].value)}, ${formatShare(values[0].share)} of answers.` : 'No answers yet.',
    mine !== null ? `Your answer ${short(mine)}, ${formatShare(mineShare ?? 0)}.` : '',
  ].join(' ');

  return (
    <figure
      className={`crowd ${compact ? 'crowd--compact' : ''} ${physical ? 'crowd--live' : ''}`}
      data-balls={layout?.balls.length ?? 0}
      data-mine={layout?.balls.some((b) => b.mine) ? 'yes' : 'no'}
      data-settled={settled ? 'yes' : 'no'}
    >
      <div ref={wrapRef} className="crowd__rack" onClick={() => shakeRef.current?.()}>
        <canvas ref={canvasRef} className="crowd__canvas" style={{ height }} role="img" aria-label={label} />
      </div>
      {!compact && layout && (
        <figcaption className="crowd__caption">
          Each ball is {formatPerBall(layout.perBall)} of answers{caption ? ` · ${caption}` : '.'}
          {physical && (
            <>
              {' '}
              <button type="button" className="linklike crowd__shake" onClick={() => shakeRef.current?.()}>
                Shake it
              </button>
            </>
          )}
        </figcaption>
      )}
    </figure>
  );
}
